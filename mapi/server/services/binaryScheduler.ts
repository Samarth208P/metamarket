/**
 * Binary Market Scheduler
 *
 * Auto-creates 5-minute market cycles and handles settlement:
 *   - Every 5 minutes: snapshot current price as target, open new market
 *   - At market end: compare final price vs target, credit winners
 */

import BinaryMarket, {
  type IBinaryMarket,
  type IBinaryPriceSnapshot,
} from "../models/BinaryMarket.ts";
import User from "../models/User.ts";
import { withSystem } from "../database.ts";
import {
  binanceFeed,
  fetchBinancePriceAtTime,
  fetchBinancePriceRest,
  fetchBinanceSecondPrices,
} from "./binanceFeed.ts";
import {
  MARKET_DURATION_MS,
  PRICE_SNAPSHOT_INTERVAL_MS,
} from "../../../shared/binaryPrice.ts";

let startupTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let currentMarketId: string | null = null;
let isRunning = false;

export async function runScheduledBtcCycle() {
  const results = await Promise.allSettled([
    updateCurrentSlot(),
    settleScheduledSlots(),
  ]);
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
}

async function updateCurrentSlot() {
  const now = Date.now();
  const start = Math.floor(now / MARKET_DURATION_MS) * MARKET_DURATION_MS;
  const endTime = new Date(start + MARKET_DURATION_MS);
  let market = await withSystem(() => BinaryMarket.findActive(endTime));
  if (!market) {
    const targetPrice = await fetchBinancePriceAtTime(start);
    if (targetPrice <= 0) throw new Error("BTC opening price unavailable");
    const startTime = new Date(start);
    market = await BinaryMarket.openSlot({
      assetPair: "BTCUSDT",
      targetPrice,
      startTime,
      endTime,
      priceSnapshots: [{ price: targetPrice, timestamp: startTime }],
    });
  }
  if (!market) return;

  const last = market.priceSnapshots?.[market.priceSnapshots.length - 1];
  const lastTime = last ? new Date(last.timestamp).getTime() : start;
  const from = Math.max(start, Math.floor(lastTime / 1000) * 1000);
  // Allow the exchange to publish closed candles before requesting them.
  const through = Math.floor((now - 2000) / 1000) * 1000;
  const prices = await fetchBinanceSecondPrices(from, through);
  if (prices.length > 0)
    await BinaryMarket.captureScheduledPrices(market.id, prices);
}

async function settleScheduledSlots() {
  const expired = await BinaryMarket.listExpired(3);
  if (expired.length === 0) return;

  let failed = false;
  for (const market of expired) {
    const end = market.endTime.getTime();
    if (Date.now() < end + 2000) continue;

    try {
      const start = market.startTime.getTime();
      const prices = await fetchBinanceSecondPrices(start, end).catch(
        (error) => {
          console.warn("[BTC cron] Could not backfill second candles:", error);
          return [];
        },
      );
      const last = prices[prices.length - 1];
      const complete = last?.timestamp.getTime() === end;
      const finalPrice = complete
        ? last.price
        : await fetchBinancePriceAtTime(end);
      if (finalPrice <= 0) throw new Error("BTC expiry price unavailable");

      await recordSettlement(
        market.id,
        end,
        finalPrice,
        complete ? prices : undefined,
      );
    } catch (error) {
      failed = true;
      console.error("[BTC cron] Could not settle market", market.id, error);
    }
  }
  await BinaryMarket.pruneHistory();
  if (failed) throw new Error("One or more BTC settlements need a retry");
}

export function startBinaryScheduler(): void {
  if (isRunning) return;
  isRunning = true;
  console.log("[BinaryScheduler] Starting market cycle scheduler");

  // Start heartbeat to ensure a market always exists
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    ensureActiveMarket();
  }, 5000); // Check every 5s for faster settlement

  // Also run after a short delay to allow Binance WebSocket to connect
  startupTimer = setTimeout(ensureActiveMarket, 3000);
}

export function stopBinaryScheduler(): void {
  if (startupTimer) clearTimeout(startupTimer);
  if (snapshotTimer) clearInterval(snapshotTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  startupTimer = null;
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
  const endTimeMs =
    Math.floor(nowMs / cycleLengthMs) * cycleLengthMs + cycleLengthMs;
  const startTimeMs = endTimeMs - cycleLengthMs;
  const endTime = new Date(endTimeMs);
  const startTime = new Date(startTimeMs);

  try {
    // 1. First, always try to settle any past markets
    await settlePreviousMarket();

    let market = await withSystem(() => BinaryMarket.findActive(endTime));
    if (!market) {
      const price =
        binanceFeed.getLatestPrice() || (await fetchBinancePriceRest());
      if (Number.isFinite(price) && price > 0) {
        market = await BinaryMarket.openSlot({
          assetPair: "BTCUSDT",
          targetPrice: price,
          startTime,
          endTime,
          priceSnapshots: [{ price, timestamp: new Date(nowMs) }],
        });
      }
    }
    if (market && market.id !== currentMarketId) {
      currentMarketId = market.id;
      if (snapshotTimer) clearInterval(snapshotTimer);
      if (isRunning) {
        const marketId = market.id;
        snapshotTimer = setInterval(() => {
          const price = binanceFeed.getLatestPrice();
          if (price > 0)
            void BinaryMarket.capturePrice(marketId, price).catch((error) => {
              console.error("[BinaryScheduler] Price capture failed:", error);
            });
        }, PRICE_SNAPSHOT_INTERVAL_MS);
      }
    }
    await BinaryMarket.pruneHistory();
  } catch (err) {
    console.error("[BinaryScheduler] Heartbeat loop error:", err);
  }
}

async function settlePreviousMarket(): Promise<void> {
  for (const market of await BinaryMarket.listExpired()) {
    try {
      await settleMarket(market);
    } catch (error) {
      console.error("Could not settle BTC market", market.id, error);
    }
  }
}

async function settleMarket(candidate: IBinaryMarket): Promise<void> {
  const market = candidate;
  const marketId = market.id;
  const endTimeMs = new Date(market.endTime).getTime();
  console.log(
    `[BinaryScheduler] Settling market ${marketId}. Expiry: ${market.endTime.toISOString()}`,
  );

  // Fetch the exact price at the endTime
  // 1. Try Historical REST API (with a 2s delay if we just reached expiry to let klines populate)
  let finalPrice = 0;

  if (Date.now() < endTimeMs + 2000) {
    // Wait slightly if we are exactly at or just after endTime
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  finalPrice = await fetchBinancePriceAtTime(endTimeMs);

  // 2. Fallback to closest snapshot if REST API fails
  if (
    finalPrice <= 0 &&
    market.priceSnapshots &&
    market.priceSnapshots.length > 0
  ) {
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
      console.log(
        `[BinaryScheduler] Using snapshot fallback for ${marketId} (diff: ${minDiff}ms)`,
      );
    }
  }

  // 3. Final fallback to live price if all else fails (dangerous but better than staying stuck)
  if (finalPrice <= 0) {
    finalPrice = binanceFeed.getLatestPrice();
    if (finalPrice > 0) {
      console.log(
        `[BinaryScheduler] CRITICAL FALLBACK to live price for ${marketId}`,
      );
    }
  }

  if (finalPrice <= 0) {
    console.warn(
      `[BinaryScheduler] Price unavailable for ${marketId}. Will retry.`,
    );
    return;
  }

  await recordSettlement(marketId, endTimeMs, finalPrice);
}

async function recordSettlement(
  marketId: string,
  endTimeMs: number,
  finalPrice: number,
  prices?: IBinaryPriceSnapshot[],
) {
  await withSystem(async () => {
    const locked = await BinaryMarket.findById(marketId, true);
    if (!locked || !["active", "settling"].includes(locked.status)) return;
    const winningSide = finalPrice >= locked.targetPrice ? "up" : "down";
    const winners = locked.trades
      .filter(
        (trade) => trade.side === winningSide && !trade.sold && !trade.payout,
      )
      .sort((a, b) => a.userId.localeCompare(b.userId));

    for (const trade of winners) {
      const payout =
        Math.round(
          (trade.amount / Math.max(trade.entryProbability, 0.01)) * 100,
        ) / 100;
      const user = await User.findById(trade.userId, true);
      if (!user) throw new Error("Settlement account missing");
      trade.payout = payout;
      user.balance += payout;
      user.tradeHistory.push({
        marketId,
        marketTitle: `BTC ${winningSide.toUpperCase()} Payout (Tgt: $${locked.targetPrice.toLocaleString()})`,
        tradeType: "payout",
        optionId: winningSide,
        optionName: winningSide === "up" ? "Up" : "Down",
        amount: payout,
        shares: 1,
        averagePrice: trade.entryProbability * 100,
        fee: 0,
        cashDelta: payout,
        timestamp: new Date(),
      });
      await User.savePortfolio(user);
    }
    locked.status = winningSide === "up" ? "settled_up" : "settled_down";
    locked.finalPrice = finalPrice;
    locked.priceSnapshots = prices
      ? [{ price: locked.targetPrice, timestamp: locked.startTime }, ...prices]
      : [
          ...(locked.priceSnapshots ?? []),
          { price: finalPrice, timestamp: new Date(endTimeMs) },
        ];
    await BinaryMarket.save(locked);
  });
}

export function getCurrentMarketId(): string | null {
  return currentMarketId;
}
