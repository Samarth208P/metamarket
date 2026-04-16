/**
 * Binary Market Scheduler
 *
 * Auto-creates 5-minute market cycles and handles settlement:
 *   - Every 5 minutes: snapshot current price as target, open new market
 *   - At market end: compare final price vs target, credit winners
 */

import BinaryMarket, { type IBinaryMarket } from "../models/BinaryMarket.js";
import User from "../models/User.js";
import { binanceFeed, type PriceTick } from "./binanceFeed.js";
import { MARKET_DURATION_MS, PRICE_SNAPSHOT_INTERVAL_MS } from "../../../shared/binaryPrice.js";

let cycleTimer: ReturnType<typeof setInterval> | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let currentMarketId: string | null = null;

/**
 * Start the binary market scheduler.
 * Should be called once after the DB is connected and Binance feed is started.
 */
export function startBinaryScheduler(): void {
  console.log("[BinaryScheduler] Starting market cycle scheduler");

  // Wait for a valid Binance price before creating the first market
  if (binanceFeed.getLatestPrice() > 0) {
    createNewCycle();
  } else {
    const onFirstPrice = () => {
      binanceFeed.off("price", onFirstPrice);
      createNewCycle();
    };
    binanceFeed.on("price", onFirstPrice);
  }
}

export function stopBinaryScheduler(): void {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  currentMarketId = null;
}

async function createNewCycle(): Promise<void> {
  // Clear previous timers
  if (cycleTimer) clearTimeout(cycleTimer as any);
  if (snapshotTimer) clearInterval(snapshotTimer);

  const currentPrice = binanceFeed.getLatestPrice();
  if (currentPrice <= 0) {
    console.warn("[BinaryScheduler] No valid price yet, retrying in 5s...");
    cycleTimer = setTimeout(() => createNewCycle(), 5000) as any;
    return;
  }

  const nowMs = Date.now();
  const cycleLengthMs = MARKET_DURATION_MS;
  // Snap to next complete interval boundary
  const endTimeMs = Math.floor(nowMs / cycleLengthMs) * cycleLengthMs + cycleLengthMs;
  const startTimeMs = endTimeMs - cycleLengthMs;
  const endTime = new Date(endTimeMs);
  const startTime = new Date(startTimeMs);

  try {
    // Settle the previous active market (if any)
    await settlePreviousMarket();

    // Check if a market for this specific time slot already exists to prevent duplicates
    const existingMarket = await BinaryMarket.findOne({
      assetPair: "BTCUSDT",
      endTime: endTime,
      status: "active"
    });

    let market: IBinaryMarket;
    if (existingMarket) {
      console.log(`[BinaryScheduler] Re-using existing active market: ${existingMarket.id}`);
      market = existingMarket;
    } else {
      // Create a new market
      market = await BinaryMarket.create({
        assetPair: "BTCUSDT",
        targetPrice: currentPrice,
        startTime: startTime,
        endTime,
        status: "active",
        priceSnapshots: [{ price: currentPrice, timestamp: new Date(nowMs) }],
      });
      console.log(
        `[BinaryScheduler] New market ${market.id} | Target: $${currentPrice.toFixed(2)} | Ends: ${endTime.toISOString()}`,
      );
    }

    currentMarketId = market.id;

    // Prune old history
    await pruneOldMarkets();

    // Snapshot prices periodically for the chart
    snapshotTimer = setInterval(async () => {
      const price = binanceFeed.getLatestPrice();
      if (price > 0 && currentMarketId) {
        try {
          await BinaryMarket.updateOne(
            { _id: currentMarketId },
            { $push: { priceSnapshots: { price, timestamp: new Date() } } }
          );
        } catch {
          // non-critical
        }
      }
    }, PRICE_SNAPSHOT_INTERVAL_MS);

    // Schedule settlement at cycle end strictly
    const durationMs = Math.max(0, endTimeMs - Date.now());
    cycleTimer = setTimeout(async () => {
      try {
        if (snapshotTimer) clearInterval(snapshotTimer);
        await settleMarket(market.id);
      } catch (err) {
        console.error(`[BinaryScheduler] Fatal error settling market ${market.id}:`, err);
      } finally {
        // Start next cycle
        createNewCycle();
      }
    }, durationMs) as any;
  } catch (err) {
    console.error("[BinaryScheduler] Error creating cycle:", err);
    // Retry in 5s
    cycleTimer = setTimeout(() => createNewCycle(), 5000) as any;
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
  // We allow "active" or "settling" (to resume interrupted settlement)
  const market = await BinaryMarket.findOneAndUpdate(
    { _id: marketId, status: { $in: ["active", "settling"] } },
    { $set: { status: "settling" } },
    { new: true }
  );
  if (!market) return;

  // Determine final price: live price if current, or closest snapshot if stale
  let finalPrice = binanceFeed.getLatestPrice();
  const nowMs = Date.now();
  const endTimeMs = new Date(market.endTime).getTime();
  
  // If market ended more than 30s ago, try to find a price from snapshots
  if (nowMs - endTimeMs > 30000 && market.priceSnapshots && market.priceSnapshots.length > 0) {
    // Find snapshot closest to endTime
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
    console.log(`[BinaryScheduler] Using historical price for ${marketId}: $${finalPrice} (diff: ${minDiff}ms)`);
  }

  if (finalPrice <= 0) {
    console.warn(`[BinaryScheduler] Cannot settle ${marketId}: no price identified`);
    // Revert to active so it can be retried later
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
    // Keep the 5 most recently settled markets
    const settledMarkets = await BinaryMarket.find({ status: { $regex: /^settled/ } })
      .sort({ endTime: -1 })
      .limit(5)
      .select('_id');
      
    // Always keep active/settling markets
    const activeMarkets = await BinaryMarket.find({ status: { $in: ["active", "settling"] } })
      .select('_id');
    
    const idsToKeep = [
      ...settledMarkets.map(m => m._id), 
      ...activeMarkets.map(m => m._id)
    ];
    
    const res = await BinaryMarket.deleteMany({ _id: { $nin: idsToKeep } });
    if (res.deletedCount > 0) {
      console.log(`[BinaryScheduler] Pruned ${res.deletedCount} old market(s). Kept ${settledMarkets.length} history items.`);
    }
  } catch (err) {
    console.error(`[BinaryScheduler] Error pruning markets:`, err);
  }
}
