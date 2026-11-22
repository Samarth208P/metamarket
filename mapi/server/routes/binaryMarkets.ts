/**
 * Binary Market API Routes
 *
 * REST endpoints for the short-term binary prediction market.
 */

import { Router } from "express";
import BinaryMarket, { type IBinaryMarket } from "../models/BinaryMarket.ts";
import User, { needsOnboarding, serializeUser } from "../models/User.ts";
import {
  binanceFeeds,
  fetchBinancePriceRest,
  fetchBinanceRecentPricesRest,
} from "../services/binanceFeed.ts";
import {
  ensureActiveMarket,
  getCurrentMarketId,
  startBinaryScheduler,
  stopBinaryScheduler,
} from "../services/binaryScheduler.ts";
import { ApiError, asyncRoute } from "./asyncRoute.ts";
import { withSystem } from "../database.ts";
import {
  calculateLiveProbability,
  calculatePotentialPayout,
  MARKET_DURATION_MS,
  formatPaise,
  type PricePoint,
} from "../../../shared/binaryPrice.ts";
import {
  BINARY_ASSET_PAIRS,
  BINARY_ASSETS,
  DEFAULT_BINARY_ASSET,
  isBinaryAssetPair,
  type BinaryAssetPair,
} from "../../../shared/binaryAssets.ts";

const router = Router();

export function startBinaryMarketServices() {
  const feeds = BINARY_ASSET_PAIRS.map((pair) => binanceFeeds[pair]);
  try {
    feeds.forEach((feed) => feed.start());
    startBinaryScheduler();
  } catch (error) {
    feeds.forEach((feed) => feed.stop());
    throw error;
  }
  return () => {
    stopBinaryScheduler();
    feeds.forEach((feed) => feed.stop());
  };
}

function readAssetPair(value: unknown): BinaryAssetPair {
  if (value === undefined) return DEFAULT_BINARY_ASSET;
  if (!isBinaryAssetPair(value))
    throw new ApiError(400, { error: "Unsupported asset pair" });
  return value;
}

function ensureAuthenticated(req: any, res: any, next: any) {
  if (req.user) return next();
  return res.status(401).json({ error: "Not authenticated" });
}

function serializeBinaryMarket(doc: IBinaryMarket, viewerId: string) {
  return {
    id: doc.id,
    assetPair: doc.assetPair,
    targetPrice: doc.targetPrice,
    finalPrice: doc.finalPrice,
    startTime:
      doc.startTime instanceof Date
        ? doc.startTime.toISOString()
        : doc.startTime,
    endTime:
      doc.endTime instanceof Date ? doc.endTime.toISOString() : doc.endTime,
    status: doc.status,
    trades: (doc.trades || [])
      .filter((trade) => trade.userId === viewerId)
      .map((t: any) => ({
        userId: t.userId,
        userName: t.userName,
        side: t.side,
        amount: t.amount,
        entryProbability: t.entryProbability,
        payout: t.payout,
        timestamp:
          t.timestamp instanceof Date ? t.timestamp.toISOString() : t.timestamp,
        sold: t.sold,
      })),
    priceSnapshots: (doc.priceSnapshots || []).map((s: any) => ({
      price: s.price,
      timestamp:
        s.timestamp instanceof Date ? s.timestamp.toISOString() : s.timestamp,
    })),
    volume: doc.volume,
    createdAt: doc.createdAt?.toISOString?.() || doc.createdAt,
  };
}

/**
 * GET /binary-markets/health
 * Debug endpoint for scheduler health.
 */
router.get(
  ["/health", "/:pair/health"],
  asyncRoute(async (req, res) => {
    const assetPair = readAssetPair(req.params.pair);
    const feed = binanceFeeds[assetPair];
    const status: any = {
      currentMarketId: getCurrentMarketId(assetPair),
      binanceConnected: feed.getIsConnected(),
      binancePrice: feed.getLatestPrice(),
      timestamp: new Date().toISOString(),
    };

    // Add info about active market if possible
    const active = await BinaryMarket.findActive(undefined, assetPair);
    if (active) {
      status.currentMarketId ??= active.id;
      status.activeMarket = {
        id: active.id,
        endTime: active.endTime,
        targetPrice: active.targetPrice,
      };
    }

    if (!req.app.locals.edge && req.query.trigger === "1") {
      startBinaryScheduler();
      status.schedulerTriggered = true;
    }

    return res.json(status);
  }),
);

/**
 * GET /binary-markets/active
 * Returns the current active market + live pricing data.
 */
router.get(
  ["/active", "/:pair/active"],
  asyncRoute(async (req, res) => {
    const assetPair = readAssetPair(req.params.pair);
    const feed = binanceFeeds[assetPair];
    try {
      const marketId = getCurrentMarketId(assetPair);
      let market = marketId ? await BinaryMarket.findById(marketId) : null;

      // Only use the cached market if it's still active
      if (market && market.status !== "active") {
        market = null;
      }

      // Fallback: find the most recent active market
      if (!market) {
        market = await BinaryMarket.findActive(undefined, assetPair);
      }

      if (!market) {
        if (!req.app.locals.edge) void ensureActiveMarket(assetPair);

        return res.json({
          market: null,
          livePrice: feed.getLatestPrice(),
          isConnected: feed.getIsConnected(),
          message: "No active market. Next cycle starting soon...",
        });
      }

      const currentPrice =
        feed.getLatestPrice() || (await fetchBinancePriceRest(assetPair));

      const now = Date.now();
      const endTimeMs = new Date(market.endTime).getTime();
      const timeRemainingMs = Math.max(0, endTimeMs - now);

      // Stale check: If market ended more than 5 minutes ago, ignore it in this route
      if (
        req.app.locals.edge ? endTimeMs <= now : endTimeMs < now - 5 * 60 * 1000
      ) {
        if (!req.app.locals.edge) void ensureActiveMarket(assetPair);
        return res.json({
          market: null,
          livePrice: currentPrice,
          isConnected: req.app.locals.edge
            ? currentPrice > 0
            : feed.getIsConnected(),
          message: "Waiting for new cycle to start...",
        });
      }

      // Reactive self-healing: If market is expired but still marked 'active', trigger check
      if (!req.app.locals.edge && timeRemainingMs <= 0) {
        void ensureActiveMarket(assetPair);
      }

      const feedPrices = feed.getRecentPrices();
      const recentPrices = feedPrices.length
        ? feedPrices
        : await fetchBinanceRecentPricesRest(assetPair);

      const { probability, activeVolatility, momentumBias } =
        calculateLiveProbability({
          currentPrice,
          targetPrice: market.targetPrice,
          timeRemainingMs,
          recentPrices,
        });

      return res.json({
        market: serializeBinaryMarket(market, req.user.id),
        livePrice: currentPrice,
        isConnected: req.app.locals.edge
          ? currentPrice > 0
          : feed.getIsConnected(),
        probability: {
          up: probability,
          down: 1 - probability,
        },
        activeVolatility,
        momentumBias,
        timeRemainingMs,
      });
    } catch (err) {
      console.error("[BinaryRoutes] Error fetching active market:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }),
);

/**
 * GET /binary-markets/cron
 * Designed exclusively for Serverless deployments like Netlify/Vercel.
 * Attach this endpoint to an external cron job (e.g., cron-job.org) firing every 1 minute.
 * Automatically checks and settles expired markets and spawns the next target.
 */
router.get(
  ["/cron", "/:pair/cron"],
  asyncRoute(async (req, res) => {
    if (req.app.locals.edge)
      return res.status(404).json({ error: "Not found" });
    const assetPair = readAssetPair(req.params.pair);
    try {
      await ensureActiveMarket(assetPair);
      return res.json({ message: "Cron cycle executed successfully" });
    } catch (err) {
      console.error("[BinaryRoutes] Cron error:", err);
      return res.status(500).json({ error: "Cron cycle failed" });
    }
  }),
);

/**
 * GET /binary-markets/history
 * Returns recent settled markets.
 */
router.get(
  ["/history", "/:pair/history"],
  asyncRoute(async (req, res) => {
    const markets = await BinaryMarket.listHistory(
      readAssetPair(req.params.pair),
    );
    return res.json(
      markets.map((market) => serializeBinaryMarket(market, req.user.id)),
    );
  }),
);

/**
 * GET /binary-markets/:id
 * Get a specific binary market by ID.
 */
router.get(
  ["/price-history", "/:pair/price-history"],
  asyncRoute(async (req, res) => {
    const assetPair = readAssetPair(req.params.pair);
    const now = Date.now();
    // Keep enough leading points to fill the chart while newer candles are saved.
    const from = now - MARKET_DURATION_MS - 60_000;
    const snapshots = await BinaryMarket.listPriceSnapshots(
      new Date(from),
      new Date(now),
      assetPair,
    );
    const points = new Map<number, PricePoint>();
    for (const snapshot of snapshots) {
      const timestamp = Date.parse(snapshot.timestamp);
      if (
        timestamp >= from &&
        timestamp <= now &&
        Number.isFinite(snapshot.price) &&
        snapshot.price > 0
      ) {
        points.set(timestamp, { timestamp, price: snapshot.price });
      }
    }
    res.json([...points.values()].sort((a, b) => a.timestamp - b.timestamp));
  }),
);

router.get("/:id", async (req, res) => {
  try {
    const market = await BinaryMarket.findById(req.params.id);
    if (!market) return res.status(404).json({ error: "Market not found" });
    return res.json(serializeBinaryMarket(market, req.user.id));
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function loadTradePrices(marketId: string) {
  const market = await BinaryMarket.findById(marketId);
  if (!market) throw new ApiError(404, { error: "Market not found" });
  const assetPair = readAssetPair(market.assetPair);
  const feed = binanceFeeds[assetPair];
  const currentPrice =
    feed.getLatestPrice() || (await fetchBinancePriceRest(assetPair));
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new ApiError(503, {
      error: "The live price is temporarily unavailable",
    });
  }
  const feedPrices = feed.getRecentPrices();
  const recentPrices = feedPrices.length
    ? feedPrices
    : await fetchBinanceRecentPricesRest(assetPair);
  return { currentPrice, recentPrices, assetPair };
}

/**
 * POST /binary-markets/:id/trade
 * Place a trade on an active binary market.
 *
 * Body: { side: "up" | "down", amount: number }
 */
router.post(
  "/:id/trade",
  ensureAuthenticated,
  asyncRoute(async (req, res) => {
    const { side, amount } = req.body;

    // Validate inputs
    if (!side || !["up", "down"].includes(side)) {
      throw new ApiError(400, { error: "Side must be 'up' or 'down'" });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 1) {
      throw new ApiError(400, { error: "Amount must be at least ₹1" });
    }

    const prices = await loadTradePrices(req.params.id);
    const payload = await withSystem(async () => {
      const market = await BinaryMarket.findById(req.params.id, true);
      if (!market) throw new ApiError(404, { error: "Market not found" });
      if (market.status !== "active")
        throw new ApiError(400, { error: "Market is not active" });

      // Check if market has expired
      if (new Date(market.endTime).getTime() <= Date.now()) {
        throw new ApiError(400, { error: "Market has expired" });
      }

      // Load user & check balance
      const user = await User.findById(req.user.id, true);
      if (!user || needsOnboarding(user))
        throw new ApiError(403, { error: "Profile setup required" });
      if (user.balance < numericAmount) {
        throw new ApiError(400, { error: "Insufficient balance" });
      }

      const { probability } = calculateLiveProbability({
        ...prices,
        targetPrice: market.targetPrice,
        timeRemainingMs: market.endTime.getTime() - Date.now(),
      });

      const entryProbability = side === "up" ? probability : 1 - probability;
      const potentialPayout = calculatePotentialPayout(
        numericAmount,
        entryProbability,
      );

      // Record the trade
      const trade = {
        userId: user.id,
        userName: user.username,
        side: side as "up" | "down",
        amount: numericAmount,
        entryProbability,
        payout: 0,
        timestamp: new Date(),
      };

      market.trades.push(trade);
      market.volume += numericAmount;

      // Deduct balance
      user.balance -= numericAmount;

      // Add to trade history
      if (!user.tradeHistory) user.tradeHistory = [];
      user.tradeHistory.push({
        marketId: market.id,
        marketTitle: `${BINARY_ASSETS[prices.assetPair].symbol} ${side.toUpperCase()} @ ${formatPaise(entryProbability)} (Tgt: $${market.targetPrice.toLocaleString()})`,
        tradeType: "buy",
        optionId: side,
        optionName: side === "up" ? "Up" : "Down",
        amount: numericAmount,
        shares: 1,
        averagePrice: entryProbability * 100,
        fee: 0,
        cashDelta: -numericAmount,
        timestamp: new Date(),
      } as any);

      await BinaryMarket.save(market);
      await User.savePortfolio(user);

      return {
        market: serializeBinaryMarket(market, req.user.id),
        trade: {
          ...trade,
          timestamp:
            trade.timestamp instanceof Date
              ? trade.timestamp.toISOString()
              : trade.timestamp,
        },
        user: serializeUser(user),
        userBalance: user.balance,
        potentialPayout,
      };
    });
    return res.json(payload);
  }),
);

/**
 * POST /binary-markets/:id/sell
 * Sell (Cash Out) all active positions for a specific side mid-market.
 *
 * Body: { side: "up" | "down" }
 */
router.post(
  "/:id/sell",
  ensureAuthenticated,
  asyncRoute(async (req, res) => {
    const { side } = req.body;
    if (!side || !["up", "down"].includes(side)) {
      throw new ApiError(400, { error: "Side must be 'up' or 'down'" });
    }

    const prices = await loadTradePrices(req.params.id);
    const payload = await withSystem(async () => {
      const market = await BinaryMarket.findById(req.params.id, true);
      if (!market) throw new ApiError(404, { error: "Market not found" });
      if (market.status !== "active")
        throw new ApiError(400, { error: "Market is not active" });

      if (new Date(market.endTime).getTime() <= Date.now()) {
        throw new ApiError(400, {
          error: "Market has expired, waiting for settlement",
        });
      }

      const user = await User.findById(req.user.id, true);
      if (!user || needsOnboarding(user))
        throw new ApiError(403, { error: "Profile setup required" });

      // Find user active trades for this side that aren't sold
      const activeTrades = market.trades.filter(
        (t: any) => t.userId === user.id && t.side === side && !t.sold,
      );

      if (activeTrades.length === 0) {
        throw new ApiError(400, {
          error: `No active '${side}' positions to sell.`,
        });
      }

      const ratio = Math.max(
        0.01,
        Math.min(1, parseFloat(req.body.ratio) || 1),
      );

      const { probability } = calculateLiveProbability({
        ...prices,
        targetPrice: market.targetPrice,
        timeRemainingMs: market.endTime.getTime() - Date.now(),
      });

      const currentSideProbability =
        side === "up" ? probability : 1 - probability;

      let totalPayoutValue = 0;
      for (const trade of activeTrades) {
        const fullPayout =
          trade.amount / Math.max(trade.entryProbability, 0.01);
        const cashValue = fullPayout * currentSideProbability * ratio;
        totalPayoutValue += cashValue;

        if (ratio >= 0.99) {
          // Fully sold
          trade.sold = true;
          trade.payout = cashValue;
        } else {
          // Partial sell - we reduce the amount and entry basis proportionally
          // This keeps the remaining 'shares' active
          trade.amount = trade.amount * (1 - ratio);
        }
      }

      totalPayoutValue = Math.round(totalPayoutValue * 100) / 100;
      user.balance += totalPayoutValue;

      // Add to user trade history
      if (!user.tradeHistory) user.tradeHistory = [];
      user.tradeHistory.push({
        marketId: market.id,
        marketTitle: `${BINARY_ASSETS[prices.assetPair].symbol} ${side.toUpperCase()} @ ${formatPaise(currentSideProbability)} (Tgt: $${market.targetPrice.toLocaleString()})`,
        tradeType: "sell",
        optionId: side,
        optionName: side === "up" ? "Up" : "Down",
        amount: totalPayoutValue,
        shares: activeTrades.length,
        averagePrice: currentSideProbability * 100,
        fee: 0,
        cashDelta: totalPayoutValue,
        timestamp: new Date(),
      } as any);

      await BinaryMarket.save(market);
      await User.savePortfolio(user);

      return {
        message: "Positions sold successfully",
        market: serializeBinaryMarket(market, req.user.id),
        user: serializeUser(user),
        userBalance: user.balance,
        cashOutValue: totalPayoutValue,
      };
    });
    return res.json(payload);
  }),
);

export default router;
