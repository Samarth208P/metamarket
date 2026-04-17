/**
 * Binary Market Scheduler
 *
 * Auto-creates 5-minute market cycles and handles settlement:
 *   - Every 5 minutes: snapshot current price as target, open new market
 *   - At market end: compare final price vs target, credit winners
 */

import BinaryMarket, { type IBinaryMarket } from "../models/BinaryMarket.js";
import User from "../models/User.js";
import { binanceFeed, fetchBinancePriceAtTime, fetchBinancePriceRest, type PriceTick } from "./binanceFeed.js";
import { MARKET_DURATION_MS, PRICE_SNAPSHOT_INTERVAL_MS } from "../../../shared/binaryPrice.js";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let cycleTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let currentMarketId: string | null = null;
let isRunning = false;

export function startBinaryScheduler(): void {
  if (isRunning) return;
  isRunning = true;
  console.log("[BinaryScheduler] Starting market cycle scheduler");

  // Start heartbeat to ensure a market always exists
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    ensureActiveMarket();
  }, 5000); // Check every 5s for faster settlement

  // Also run immediately to bootstrap the first market
  ensureActiveMarket();
}

export function stopBinaryScheduler(): void {
  if (cycleTimer) clearTimeout(cycleTimer);
  if (snapshotTimer) clearInterval(snapshotTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  cycleTimer = null;
  snapshotTimer = null;
  heartbeatTimer = null;
  currentMarketId = null;
  isRunning = false;
}

/**
 * Ensures an active market exists for the current time slot.
 * This is the primary driver for the scheduler.
 */
export async function ensureActiveMarket(): Promise<void> {
  const nowMs = Date.now();
  const cycleLengthMs = MARKET_DURATION_MS;
  const endTimeMs = Math.floor(nowMs / cycleLengthMs) * cycleLengthMs + cycleLengthMs;
  const startTimeMs = endTimeMs - cycleLengthMs;
  const endTime = new Date(endTimeMs);
  const startTime = new Date(startTimeMs);

  try {
    // 1. First, always try to settle any past markets
    await settlePreviousMarket();

    // 2. Check if the current slot's market exists
    const exists = await BinaryMarket.findOne({
      endTime,
      status: "active"
    });

    if (!exists) {
      console.log(`[BinaryScheduler] Heartbeat: No active market for slot ending ${endTime.toISOString()}. Creating...`);
      
      let currentPrice = binanceFeed.getLatestPrice();
      if (currentPrice <= 0) {
        const { fetchBinancePriceRest } = await import("./binanceFeed.js");
        currentPrice = await fetchBinancePriceRest();
      }

      if (currentPrice > 0) {
        const market = await BinaryMarket.create({
          assetPair: "BTCUSDT",
          targetPrice: currentPrice,
          startTime,
          endTime,
          status: "active",
          priceSnapshots: [{ price: currentPrice, timestamp: new Date(nowMs) }],
        });
        currentMarketId = market.id;
        console.log(`[BinaryScheduler] Created market ${market.id}`);
        
        // Reset snapshot interval for the new market
        if (snapshotTimer) clearInterval(snapshotTimer);
        snapshotTimer = setInterval(async () => {
          const p = binanceFeed.getLatestPrice();
          if (p > 0 && currentMarketId) {
            BinaryMarket.updateOne(
              { _id: currentMarketId },
              { $push: { priceSnapshots: { price: p, timestamp: new Date() } } }
            ).catch(() => {});
          }
        }, PRICE_SNAPSHOT_INTERVAL_MS);
      } else {
        console.warn("[BinaryScheduler] Price feed unavailable. Cannot create market yet.");
      }
    } else {
      currentMarketId = exists.id.toString();
    }

    await pruneOldMarkets();
  } catch (err) {
    console.error("[BinaryScheduler] Heartbeat loop error:", err);
  }
}

async function createNewCycle(): Promise<void> {
  // We now rely on ensureActiveMarket to handle creation and settlement.
  // This function is kept for legacy calls but just triggers the heartbeat.
  await ensureActiveMarket();
}

async function settlePreviousMarket(): Promise<void> {
  // Settle any markets that are past their endTime
  // We pick active markets, OR those that have been "settling" for more than 30 seconds (crashed)
  try {
    const staleMarkets = await BinaryMarket.find({
      $or: [
        { status: "active" },
        { status: "settling", updatedAt: { $lte: new Date(Date.now() - 30000) } }
      ],
      endTime: { $lte: new Date() },
    });

    for (const market of staleMarkets) {
      try {
        await settleMarket(market.id);
      } catch (err) {
        console.error(`[BinaryScheduler] Error settling stale market ${market.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[BinaryScheduler] Error fetching stale markets:", err);
  }
}

async function settleMarket(marketId: string): Promise<void> {
  // Atomically claim this market for settlement
  // IMPORTANT: We only claim if it's active OR if it's been settling for too long
  const market = await BinaryMarket.findOneAndUpdate(
    { 
      _id: marketId, 
      $or: [
        { status: "active" },
        { status: "settling", updatedAt: { $lte: new Date(Date.now() - 30000) } }
      ]
    },
    { $set: { status: "settling" } },
    { new: true }
  );

  if (!market) return;

  const endTimeMs = new Date(market.endTime).getTime();
  console.log(`[BinaryScheduler] Settling market ${marketId}. Expiry: ${market.endTime.toISOString()}`);

  // Fetch the exact price at the endTime
  // 1. Try Historical REST API (with a 2s delay if we just reached expiry to let klines populate)
  let finalPrice = 0;
  
  if (Date.now() < endTimeMs + 2000) {
    // Wait slightly if we are exactly at or just after endTime
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  finalPrice = await fetchBinancePriceAtTime(endTimeMs);
  
  // 2. Fallback to closest snapshot if REST API fails
  if (finalPrice <= 0 && market.priceSnapshots && market.priceSnapshots.length > 0) {
    let closest = market.priceSnapshots[0];
    let minDiff = Math.abs(new Date(closest.timestamp).getTime() - endTimeMs);
    for (const snap of market.priceSnapshots) {
      const diff = Math.abs(new Date(snap.timestamp).getTime() - endTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snap;
      }
    }
    // Only use if within 5s of expiry
    if (minDiff < 5000) {
       finalPrice = closest.price;
       console.log(`[BinaryScheduler] Using snapshot fallback for ${marketId} (diff: ${minDiff}ms)`);
    }
  }

  // 3. Final fallback to live price if all else fails (dangerous but better than staying stuck)
  if (finalPrice <= 0) {
    finalPrice = binanceFeed.getLatestPrice();
    if (finalPrice > 0) {
       console.log(`[BinaryScheduler] CRITICAL FALLBACK to live price for ${marketId}`);
    }
  }

  if (finalPrice <= 0) {
    console.warn(`[BinaryScheduler] Cannot settle ${marketId}: no price identified. Resetting to active.`);
    await BinaryMarket.updateOne({ _id: marketId }, { $set: { status: "active" } });
    return;
  }

  const outcome: "settled_up" | "settled_down" =
    finalPrice >= market.targetPrice ? "settled_up" : "settled_down";
  const winningSide = outcome === "settled_up" ? "up" : "down";

  // Use the identified price as the final snapshot
  const finalSnapshot = { price: finalPrice, timestamp: new Date(endTimeMs) };

  // Credit winners
  const winningTrades = market.trades.filter((t) => t.side === winningSide && !t.sold && !t.payout); // !t.payout ensures no double-crediting
  const losingTrades = market.trades.filter((t) => t.side !== winningSide && !t.sold && !t.payout);

  for (const trade of winningTrades) {
    const payout = trade.amount / Math.max(trade.entryProbability, 0.01);
    const roundedPayout = Math.round(payout * 100) / 100;
    trade.payout = roundedPayout;

    try {
      const user = await User.findById(trade.userId);
      if (user) {
        user.balance += roundedPayout;
        if (!user.tradeHistory) user.tradeHistory = [];
        user.tradeHistory.push({
          marketId: market.id,
          marketTitle: `BTC ${winningSide.toUpperCase()} Payout (Tgt: $${market.targetPrice.toLocaleString()})`,
          tradeType: "payout",
          optionId: winningSide,
          optionName: winningSide === "up" ? "Up" : "Down",
          amount: roundedPayout,
          shares: 1,
          averagePrice: trade.entryProbability * 100,
          fee: 0,
          cashDelta: roundedPayout,
          timestamp: new Date(),
        } as any);
        await user.save();
      }
    } catch (err) {
      console.error(`[BinaryScheduler] Error crediting user ${trade.userId} for market ${marketId}:`, err);
    }
  }

  // Mark losing trades payout as 0 if not already set
  for (const trade of losingTrades) {
    if (!trade.payout) trade.payout = 0;
  }

  // Final update to the market
  await BinaryMarket.updateOne(
    { _id: marketId },
    {
      $set: {
        status: outcome,
        finalPrice,
        trades: market.trades
      },
      $push: { priceSnapshots: finalSnapshot }
    }
  );

  console.log(
    `[BinaryScheduler] Settled ${marketId}: ${outcome} | Final: $${finalPrice.toFixed(2)} vs Target: $${market.targetPrice.toFixed(2)} | ${winningTrades.length} winners`,
  );
}

export function getCurrentMarketId(): string | null {
  return currentMarketId;
}

async function pruneOldMarkets(): Promise<void> {
  try {
    // Keep 5 most recent settled markets (for history)
    const settledMarkets = await BinaryMarket.find({ status: { $regex: /^settled/ } })
      .sort({ endTime: -1 })
      .limit(5)
      .select('_id');
      
    // Always keep active/settling markets
    const activeMarkets = await BinaryMarket.find({ status: { $in: ["active", "settling"] } })
      .select('_id');
    
    const idsToKeep = [
      ...settledMarkets.map(m => m._id.toString()), 
      ...activeMarkets.map(m => m._id.toString())
    ];
    
    if (idsToKeep.length === 0) return;

    const res = await BinaryMarket.deleteMany({ _id: { $nin: idsToKeep } });
    if (res.deletedCount > 0) {
      console.log(`[BinaryScheduler] Pruned ${res.deletedCount} old market(s). History kept: ${settledMarkets.length}`);
    }
  } catch (err) {
    console.error(`[BinaryScheduler] Error pruning markets:`, err);
  }
}
