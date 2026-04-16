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

export function startBinaryScheduler(): void {
  console.log("[BinaryScheduler] Starting market cycle scheduler");

  // Initial cycle creation
  const latest = binanceFeed.getLatestPrice();
  if (latest > 0) {
    createNewCycle();
  } else {
    // Wait for first price
    const onFirstPrice = () => {
      binanceFeed.off("price", onFirstPrice);
      createNewCycle();
    };
    binanceFeed.on("price", onFirstPrice);
    
    // Safety fallback
    setTimeout(async () => {
      if (binanceFeed.getLatestPrice() <= 0) {
        const restPrice = await fetchBinancePriceRest();
        if (restPrice > 0) {
          createNewCycle();
        }
      }
    }, 5000);
  }

  // Heartbeat to ensure a market always exists
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    ensureActiveMarket();
  }, 30000); // Check every 30s
}

export function stopBinaryScheduler(): void {
  if (cycleTimer) clearTimeout(cycleTimer);
  if (snapshotTimer) clearInterval(snapshotTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  cycleTimer = null;
  snapshotTimer = null;
  heartbeatTimer = null;
  currentMarketId = null;
}

/**
 * Ensures an active market exists for the current time slot.
 * Used as a self-healing mechanism.
 */
export async function ensureActiveMarket(): Promise<void> {
  const nowMs = Date.now();
  const cycleLengthMs = MARKET_DURATION_MS;
  const endTimeMs = Math.floor(nowMs / cycleLengthMs) * cycleLengthMs + cycleLengthMs;
  const endTime = new Date(endTimeMs);

  try {
    const exists = await BinaryMarket.findOne({
      endTime,
      status: "active"
    });

    if (!exists) {
      console.log(`[BinaryScheduler] Heartbeat: No active market found for ${endTime.toISOString()}. Creating one...`);
      await createNewCycle();
    }
  } catch (err) {
    console.error("[BinaryScheduler] Heartbeat check failed:", err);
  }
}

async function createNewCycle(): Promise<void> {
  // Clear previous cycle timer if we are starting fresh
  if (cycleTimer) clearTimeout(cycleTimer);
  if (snapshotTimer) clearInterval(snapshotTimer);

  try {
    // 1. Get latest price (with REST fallback)
    let currentPrice = binanceFeed.getLatestPrice();
    if (currentPrice <= 0) {
      currentPrice = await fetchBinancePriceRest();
    }

    if (currentPrice <= 0) {
      console.warn("[BinaryScheduler] No price available. Postponing cycle 5s...");
      cycleTimer = setTimeout(() => createNewCycle(), 5000);
      return;
    }

    const nowMs = Date.now();
    const cycleLengthMs = MARKET_DURATION_MS;
    const endTimeMs = Math.floor(nowMs / cycleLengthMs) * cycleLengthMs + cycleLengthMs;
    const startTimeMs = endTimeMs - cycleLengthMs;
    const endTime = new Date(endTimeMs);
    const startTime = new Date(startTimeMs);

    // 2. Settle stale markets (non-blocking)
    settlePreviousMarket().catch(err => {
      console.error("[BinaryScheduler] Settle-previous failed:", err);
    });

    // 3. Prevent duplicate creation for this exact time slot
    const existingMarket = await BinaryMarket.findOne({
      endTime,
      status: "active"
    });

    let market: IBinaryMarket;
    if (existingMarket) {
      console.log(`[BinaryScheduler] Cycle exists: ${existingMarket.id}`);
      market = existingMarket;
    } else {
      market = await BinaryMarket.create({
        assetPair: "BTCUSDT",
        targetPrice: currentPrice,
        startTime,
        endTime,
        status: "active",
        priceSnapshots: [{ price: currentPrice, timestamp: new Date(nowMs) }],
      });
      console.log(`[BinaryScheduler] Created market ${market.id} for ${endTime.toISOString()}`);
    }

    currentMarketId = market.id;
    await pruneOldMarkets();

    // 4. Start snapshotting
    snapshotTimer = setInterval(async () => {
      const p = binanceFeed.getLatestPrice();
      if (p > 0 && currentMarketId) {
        BinaryMarket.updateOne(
          { _id: currentMarketId },
          { $push: { priceSnapshots: { price: p, timestamp: new Date() } } }
        ).catch(() => {});
      }
    }, PRICE_SNAPSHOT_INTERVAL_MS);

    // 5. Schedule settlement
    const durationMs = Math.max(0, endTimeMs - Date.now());
    cycleTimer = setTimeout(async () => {
      try {
        await settleMarket(market.id);
      } catch (err) {
        console.error(`[BinaryScheduler] Settle error:`, err);
      } finally {
        createNewCycle();
      }
    }, durationMs + 500);

  } catch (err) {
    console.error("[BinaryScheduler] Create-cycle error:", err);
    cycleTimer = setTimeout(() => createNewCycle(), 5000);
  }
}

async function settlePreviousMarket(): Promise<void> {
  // Settle any markets that are still "active" or "settling" and past their endTime
  try {
    const staleMarkets = await BinaryMarket.find({
      status: { $in: ["active", "settling"] },
      endTime: { $lte: new Date() },
    });

    for (const market of staleMarkets) {
      try {
        console.log(`[BinaryScheduler] Catching up on stale market: ${market.id} (Status: ${market.status})`);
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
  const market = await BinaryMarket.findOneAndUpdate(
    { _id: marketId, status: { $in: ["active", "settling"] } },
    { $set: { status: "settling" } },
    { new: true }
  );
  if (!market) return;

  const endTimeMs = new Date(market.endTime).getTime();
  console.log(`[BinaryScheduler] Settling market ${marketId}. Expiry: ${market.endTime.toISOString()}`);

  // Fetch the exact price at the endTime using the historical REST API
  // This is much more reliable than using the live feed which might have drifted
  let finalPrice = await fetchBinancePriceAtTime(endTimeMs);
  
  // Fallback to closest snapshot if REST API fails
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
    finalPrice = closest.price;
  }

  // Final fallback to live price if all else fails
  if (finalPrice <= 0) {
    finalPrice = binanceFeed.getLatestPrice();
  }

  if (finalPrice <= 0) {
    console.warn(`[BinaryScheduler] Cannot settle ${marketId}: no price identified`);
    await BinaryMarket.updateOne({ _id: marketId }, { $set: { status: "active" } });
    return;
  }

  const outcome: "settled_up" | "settled_down" =
    finalPrice >= market.targetPrice ? "settled_up" : "settled_down";
  const winningSide = outcome === "settled_up" ? "up" : "down";

  // Use the identified price as the final snapshot
  const finalSnapshot = { price: finalPrice, timestamp: new Date(endTimeMs) };

  // Credit winners
  const winningTrades = market.trades.filter((t) => t.side === winningSide && !t.sold);
  const losingTrades = market.trades.filter((t) => t.side !== winningSide && !t.sold);

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
          averagePrice: trade.entryProbability,
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

  // Mark losing trades payout as 0
  for (const trade of losingTrades) {
    trade.payout = 0;
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
