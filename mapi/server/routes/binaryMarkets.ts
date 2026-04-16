/**
 * Binary Market API Routes
 *
 * REST endpoints for the short-term binary prediction market.
 */

import { Router } from "express";
import BinaryMarket from "../models/BinaryMarket.js";
import User from "../models/User.js";
import { binanceFeed } from "../services/binanceFeed.js";
import { getCurrentMarketId } from "../services/binaryScheduler.js";
import {
  calculateLiveProbability,
  calculatePotentialPayout,
  MARKET_DURATION_MS,
  formatPaise,
} from "../../../shared/binaryPrice.js";

const router = Router();

function ensureAuthenticated(req: any, res: any, next: any) {
  if (req.user) return next();
  return res.status(401).json({ error: "Not authenticated" });
}

function serializeBinaryMarket(doc: any) {
  return {
    id: doc._id?.toString() || doc.id,
    assetPair: doc.assetPair,
    targetPrice: doc.targetPrice,
    finalPrice: doc.finalPrice,
    startTime: doc.startTime instanceof Date ? doc.startTime.toISOString() : doc.startTime,
    endTime: doc.endTime instanceof Date ? doc.endTime.toISOString() : doc.endTime,
    status: doc.status,
    trades: (doc.trades || []).map((t: any) => ({
      userId: t.userId,
      userName: t.userName,
      side: t.side,
      amount: t.amount,
      entryProbability: t.entryProbability,
      payout: t.payout,
      timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : t.timestamp,
      sold: t.sold,
    })),
    priceSnapshots: (doc.priceSnapshots || []).map((s: any) => ({
      price: s.price,
      timestamp: s.timestamp instanceof Date ? s.timestamp.toISOString() : s.timestamp,
    })),
    volume: doc.volume,
    createdAt: doc.createdAt?.toISOString?.() || doc.createdAt,
  };
}

/**
 * GET /binary-markets/health
 * Debug endpoint for scheduler health.
 */
router.get("/binary-markets/health", async (req, res) => {
  const status: any = {
    currentMarketId: getCurrentMarketId(),
    binanceConnected: binanceFeed.getIsConnected(),
    binancePrice: binanceFeed.getLatestPrice(),
    timestamp: new Date().toISOString()
  };

  // Add info about active market if possible
  const active = await BinaryMarket.findOne({ status: 'active' }).sort({ endTime: -1 });
  if (active) {
    status.activeMarket = {
      id: active.id,
      endTime: active.endTime,
      targetPrice: active.targetPrice
    };
  }

  if (req.query.trigger === '1') {
    const { startBinaryScheduler } = await import("../services/binaryScheduler.js");
    startBinaryScheduler();
    status.schedulerTriggered = true;
  }

  return res.json(status);
});

/**
 * GET /binary-markets/active
 * Returns the current active market + live pricing data.
 */
router.get("/binary-markets/active", async (_req, res) => {
  try {
    const marketId = getCurrentMarketId();
    let market = marketId ? await BinaryMarket.findById(marketId) : null;

    // Fallback: find the most recent active market
    if (!market) {
      market = await BinaryMarket.findOne({ status: "active" }).sort({
        startTime: -1,
      });
    }

    if (!market) {
      return res.json({
        market: null,
        livePrice: binanceFeed.getLatestPrice(),
        isConnected: binanceFeed.getIsConnected(),
        message: "No active market. Next cycle starting soon...",
      });
    }

    let currentPrice = binanceFeed.getLatestPrice();
    if (currentPrice <= 0) {
      const { fetchBinancePriceRest } = await import("../services/binanceFeed.js");
      currentPrice = await fetchBinancePriceRest();
    }

    const timeRemainingMs = Math.max(
      0,
      new Date(market.endTime).getTime() - Date.now(),
    );

    const { probability, activeVolatility, momentumBias } =
      calculateLiveProbability({
        currentPrice,
        targetPrice: market.targetPrice,
        timeRemainingMs,
        recentPrices: binanceFeed.getRecentPrices(),
      });

    return res.json({
      market: serializeBinaryMarket(market),
      livePrice: currentPrice,
      isConnected: binanceFeed.getIsConnected(),
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
});

/**
 * GET /binary-markets/history
 * Returns recent settled markets.
 */
router.get("/binary-markets/history", async (_req, res) => {
  try {
    const markets = await BinaryMarket.find({
      status: { $in: ["settled_up", "settled_down"] },
    })
      .sort({ endTime: -1 })
      .limit(20)
      .select("-priceSnapshots"); // Omit snapshots for list view

    return res.json(markets.map(serializeBinaryMarket));
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /binary-markets/:id
 * Get a specific binary market by ID.
 */
router.get("/binary-markets/:id", async (req, res) => {
  try {
    const market = await BinaryMarket.findById(req.params.id);
    if (!market) return res.status(404).json({ error: "Market not found" });
    return res.json(serializeBinaryMarket(market));
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /binary-markets/:id/trade
 * Place a trade on an active binary market.
 *
 * Body: { side: "up" | "down", amount: number }
 */
router.post(
  "/binary-markets/:id/trade",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const { side, amount } = req.body;

      // Validate inputs
      if (!side || !["up", "down"].includes(side)) {
        return res.status(400).json({ error: "Side must be 'up' or 'down'" });
      }
      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount < 1) {
        return res
          .status(400)
          .json({ error: "Amount must be at least ₹1" });
      }

      // Load market
      const market = await BinaryMarket.findById(req.params.id);
      if (!market)
        return res.status(404).json({ error: "Market not found" });
      if (market.status !== "active")
        return res.status(400).json({ error: "Market is not active" });

      // Check if market has expired
      if (new Date(market.endTime).getTime() <= Date.now()) {
        return res.status(400).json({ error: "Market has expired" });
      }

      // Load user & check balance
      const user = await User.findById(
        (req as any).user?.id || (req as any).user?._id,
      );
      if (!user) return res.status(401).json({ error: "User not found" });
      if (user.balance < numericAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Calculate current probability at trade time
      let currentPrice = binanceFeed.getLatestPrice();
      
      // Fallback if WebSocket hasn't received a price yet
      if (currentPrice <= 0) {
        const { fetchBinancePriceRest } = await import("../services/binanceFeed.js");
        currentPrice = await fetchBinancePriceRest();
      }

      const timeRemainingMs = Math.max(
        0,
        new Date(market.endTime).getTime() - Date.now(),
      );

      const { probability } = calculateLiveProbability({
        currentPrice,
        targetPrice: market.targetPrice,
        timeRemainingMs,
        recentPrices: binanceFeed.getRecentPrices(),
      });

      const entryProbability = side === "up" ? probability : 1 - probability;
      const potentialPayout = calculatePotentialPayout(
        numericAmount,
        entryProbability,
      );

      // Record the trade
      const trade = {
        userId: user.id,
        userName: user.name,
        side: side as "up" | "down",
        amount: numericAmount,
        entryProbability,
        payout: 0,
        timestamp: new Date(),
      };

      market.trades.push(trade);
      market.volume += numericAmount;
      market.markModified("trades");

      // Deduct balance
      user.balance -= numericAmount;

      // Add to trade history
      if (!user.tradeHistory) user.tradeHistory = [];
      user.tradeHistory.push({
        marketId: market.id,
        marketTitle: `BTC ${side.toUpperCase()} @ ${formatPaise(entryProbability)} (Tgt: $${market.targetPrice.toLocaleString()})`,
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

      await Promise.all([market.save(), user.save()]);

      return res.json({
        market: serializeBinaryMarket(market),
        trade: {
          ...trade,
          timestamp:
            trade.timestamp instanceof Date
              ? trade.timestamp.toISOString()
              : trade.timestamp,
        },
        userBalance: user.balance,
        potentialPayout,
      });
    } catch (err) {
      console.error("[BinaryRoutes] Trade error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * POST /binary-markets/:id/sell
 * Sell (Cash Out) all active positions for a specific side mid-market.
 * 
 * Body: { side: "up" | "down" }
 */
router.post(
  "/binary-markets/:id/sell",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const { side } = req.body;
      if (!side || !["up", "down"].includes(side)) {
        return res.status(400).json({ error: "Side must be 'up' or 'down'" });
      }

      const market = await BinaryMarket.findById(req.params.id);
      if (!market) return res.status(404).json({ error: "Market not found" });
      if (market.status !== "active") return res.status(400).json({ error: "Market is not active" });

      if (new Date(market.endTime).getTime() <= Date.now()) {
        return res.status(400).json({ error: "Market has expired, waiting for settlement" });
      }

      const userId = (req as any).user?.id || (req as any).user?._id;
      const user = await User.findById(userId);
      if (!user) return res.status(401).json({ error: "User not found" });

      // Find user active trades for this side that aren't sold
      const activeTrades = market.trades.filter(
        (t: any) => t.userId === user.id && t.side === side && !t.sold
      );

      if (activeTrades.length === 0) {
        return res.status(400).json({ error: `No active '${side}' positions to sell.` });
      }

      // Compute immediate cash out value
      const currentPrice = binanceFeed.getLatestPrice();
      const timeRemainingMs = Math.max(0, new Date(market.endTime).getTime() - Date.now());
      
      const { probability } = calculateLiveProbability({
        currentPrice,
        targetPrice: market.targetPrice,
        timeRemainingMs,
        recentPrices: binanceFeed.getRecentPrices(),
      });

      const currentSideProbability = side === "up" ? probability : 1 - probability;
      
      let totalPayoutValue = 0;
      for (const trade of activeTrades) {
        const fullPayout = trade.amount / Math.max(trade.entryProbability, 0.01);
        const cashValue = fullPayout * currentSideProbability;
        totalPayoutValue += cashValue;
        
        // Mark as sold
        trade.sold = true;
        trade.payout = cashValue; 
      }

      totalPayoutValue = Math.round(totalPayoutValue * 100) / 100;
      user.balance += totalPayoutValue;

      // Add to user trade history
      if (!user.tradeHistory) user.tradeHistory = [];
      user.tradeHistory.push({
        marketId: market.id,
        marketTitle: `BTC ${side.toUpperCase()} @ ${formatPaise(currentSideProbability)} (Tgt: $${market.targetPrice.toLocaleString()})`,
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

      market.markModified("trades");
      
      await Promise.all([market.save(), user.save()]);

      return res.json({
        message: "Positions sold successfully",
        market: serializeBinaryMarket(market),
        userBalance: user.balance,
        cashOutValue: totalPayoutValue
      });

    } catch (err) {
      console.error("[BinaryRoutes] Sell error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
