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
  // Snap to next complete 5-minute (cycleLengthMs) interval boundary
  const endTimeMs = Math.floor(nowMs / cycleLengthMs) * cycleLengthMs + cycleLengthMs;
  const endTime = new Date(endTimeMs);
  
  const now = new Date(nowMs);

  try {
    // Settle the previous active market (if any)
    await settlePreviousMarket();

    // Create a new market
    const market = await BinaryMarket.create({
      assetPair: "BTCUSDT",
      targetPrice: currentPrice,
      startTime: now,
      endTime,
      status: "active",
      priceSnapshots: [{ price: currentPrice, timestamp: now }],
    });

    currentMarketId = market.id;
    console.log(
      `[BinaryScheduler] New market ${market.id} | Target: $${currentPrice.toFixed(2)} | Ends: ${endTime.toISOString()}`,
    );

    // Prune old history to keep strictly 6 markets (1 active, 5 history)
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
    const durationMs = endTimeMs - Date.now();
    cycleTimer = setTimeout(async () => {
      if (snapshotTimer) clearInterval(snapshotTimer);
      await settleMarket(market.id);
      // Start next cycle
      createNewCycle();
    }, durationMs) as any;
  } catch (err) {
    console.error("[BinaryScheduler] Error creating cycle:", err);
    cycleTimer = setTimeout(() => createNewCycle(), 5000) as any;
  }
}

async function settlePreviousMarket(): Promise<void> {
  // Settle any markets that are still "active" and past their endTime
  const staleMarkets = await BinaryMarket.find({
    status: "active",
    endTime: { $lte: new Date() },
  });

  for (const market of staleMarkets) {
    await settleMarket(market.id);
  }
}

async function settleMarket(marketId: string): Promise<void> {
  // Atomically claim this market for settlement
  const market = await BinaryMarket.findOneAndUpdate(
    { _id: marketId, status: "active" },
    { $set: { status: "settling" } },
    { new: true }
  );
  if (!market) return; // Already picked up or resolved

  const finalPrice = binanceFeed.getLatestPrice();
  if (finalPrice <= 0) {
    console.warn(`[BinaryScheduler] Cannot settle ${marketId}: no final price`);
    await BinaryMarket.updateOne({ _id: marketId }, { $set: { status: "active" } });
    return;
  }

  const outcome: "settled_up" | "settled_down" =
    finalPrice >= market.targetPrice ? "settled_up" : "settled_down";
  const winningSide = outcome === "settled_up" ? "up" : "down";

  // Add final price snapshot dynamically inside update layer
  const finalSnapshot = { price: finalPrice, timestamp: new Date() };

  // Credit winners
  const winningTrades = market.trades.filter((t) => t.side === winningSide && !t.sold);
  const losingTrades = market.trades.filter((t) => t.side !== winningSide && !t.sold);

  for (const trade of winningTrades) {
    // Binary option payout: amount / entryProbability
    const payout = trade.amount / Math.max(trade.entryProbability, 0.01);
    trade.payout = Math.round(payout * 100) / 100;

    try {
      const user = await User.findById(trade.userId);
      if (user) {
        user.balance += trade.payout;
        if (!user.tradeHistory) user.tradeHistory = [];
        user.tradeHistory.push({
          marketId: market.id,
          marketTitle: `BTC ${winningSide.toUpperCase()} @ ${Math.round(trade.entryProbability * 100)}¢ (Tgt: $${market.targetPrice.toLocaleString()})`,
          tradeType: "payout",
          optionId: winningSide,
          optionName: winningSide === "up" ? "Up" : "Down",
          amount: trade.payout,
          shares: 1,
          averagePrice: trade.entryProbability,
          fee: 0,
          cashDelta: trade.payout,
          timestamp: new Date(),
        } as any);
        await user.save();
      }
    } catch (err) {
      console.error(
        `[BinaryScheduler] Error crediting user ${trade.userId}:`,
        err,
      );
    }
  }

  // Mark losing trades payout as 0
  for (const trade of losingTrades) {
    trade.payout = 0;
  }

  // Raw versionless update prevents race condition VersionErrors
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
    `[BinaryScheduler] Settled ${marketId}: ${outcome} | Final: $${finalPrice.toFixed(2)} vs Target: $${market.targetPrice.toFixed(2)} | ${winningTrades.length} winners / ${losingTrades.length} losers`,
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
