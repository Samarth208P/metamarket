import { Router } from "express";
import { isValidObjectId } from "mongoose";
import path from "path";
import fs from "fs";
import multer from "multer";
import User from "../models/User";
import Market, { calculateYesPrice, calculateNoPrice } from "../models/Market";

const router = Router();

// ── Image upload setup ────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function ensureAuthenticated(req, res, next) {
  if (req.user) {
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
}

function ensureAdmin(req, res, next) {
  if (req.user?.isAdmin) {
    return next();
  }
  return res.status(403).json({ error: "Admin access required" });
}

function serializeMarket(doc) {
  const isResolvedYes = doc.status === "resolved_yes";
  const isResolvedNo = doc.status === "resolved_no";
  const isResolved = isResolvedYes || isResolvedNo;

  return {
    id: doc._id?.toString(),
    title: doc.title,
    description: doc.description,
    category: doc.category,
    creatorId: doc.creatorId,
    status: doc.status,
    yesPool: doc.yesPool,
    noPool: doc.noPool,
    volume: doc.volume,
    priceHistory: doc.priceHistory.map((point) => ({
      yesPrice: point.yesPrice,
      noPrice: point.noPrice,
      note: point.note,
      timestamp: point.timestamp instanceof Date ? point.timestamp.toISOString() : new Date(point.timestamp).toISOString(),
    })),
    marketType: doc.marketType || "binary",
    optionA: doc.optionA,
    optionB: doc.optionB,
    shortA: doc.shortA,
    shortB: doc.shortB,
    logoUrl: doc.logoUrl,
    teams: doc.teams?.map((t: any) => ({
      name: t.name,
      imageUrl: t.imageUrl,
      yesPool: t.yesPool,
      noPool: t.noPool,
      yesPrice: isResolvedYes ? 100 : (isResolvedNo ? 0 : calculateYesPrice(t.yesPool, t.noPool)),
      noPrice: isResolvedYes ? 0 : (isResolvedNo ? 100 : calculateNoPrice(t.yesPool, t.noPool)),
    })),
    resolvedOutcome: doc.resolvedOutcome,
    endDate: doc.endDate ? (doc.endDate instanceof Date ? doc.endDate.toISOString() : new Date(doc.endDate).toISOString()) : undefined,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
    yesPrice: isResolvedYes ? 100 : (isResolvedNo ? 0 : calculateYesPrice(doc.yesPool, doc.noPool)),
    noPrice: isResolvedYes ? 0 : (isResolvedNo ? 100 : calculateNoPrice(doc.yesPool, doc.noPool)),
  };
}

router.get("/markets", async (req, res) => {
  const markets = await Market.find().sort({ status: 1, createdAt: -1 });
  res.json(markets.map(serializeMarket));
});

// ── Image upload ────────────────────────────────────────────────────────────
router.post("/upload", ensureAuthenticated, ensureAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

router.get("/markets/:id", async (req, res) => {
  const marketId = req.params.id;
  if (!isValidObjectId(marketId)) {
    return res.status(400).json({ error: "Invalid market ID" });
  }

  const market = await Market.findById(marketId);
  if (!market) {
    return res.status(404).json({ error: "Market not found" });
  }

  return res.json(serializeMarket(market));
});

router.post("/markets", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { title, description, category, endDate, marketType, optionA, optionB, shortA, shortB, logoUrl, teams } = req.body;
  if (!title || !description || !category) {
    return res.status(400).json({ error: "Title, description, and category are required" });
  }

  const creatorId = (req.user as any)?.id || (req.user as any)?._id;

  // For multi markets, build teams array with independent pools
  const teamsData = marketType === "multi" && Array.isArray(teams)
    ? teams.map((t: any) => ({ name: t.name, imageUrl: t.imageUrl, yesPool: 1000, noPool: 1000 }))
    : undefined;

  const market = await Market.create({
    title,
    description,
    category,
    marketType: marketType || "binary",
    optionA,
    optionB,
    shortA,
    shortB,
    logoUrl,
    teams: teamsData,
    creatorId,
    endDate: endDate ? new Date(endDate) : undefined,
    yesPool: 1000,
    noPool: 1000,
    priceHistory: [
      {
        yesPrice: 50,
        noPrice: 50,
        note: "Market opened at 50% / 50%",
        timestamp: new Date(),
      },
    ],
  });

  return res.status(201).json(serializeMarket(market));
});

router.post("/markets/:id/trade", ensureAuthenticated, async (req, res) => {
  const marketId = req.params.id;
  const { outcome, type, amount, teamIndex } = req.body;

  if (!isValidObjectId(marketId)) {
    return res.status(400).json({ error: "Invalid market ID" });
  }

  if (!["yes", "no"].includes(outcome) || !["buy", "sell"].includes(type)) {
    return res.status(400).json({ error: "Invalid trade parameters" });
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  const market = await Market.findById(marketId);
  if (!market) {
    return res.status(404).json({ error: "Market not found" });
  }

  if (market.status !== "active") {
    return res.status(400).json({ error: "Cannot trade a resolved market" });
  }

  // For multi-markets, validate teamIndex
  const isMulti = market.marketType === "multi";
  const tIdx = typeof teamIndex === "number" ? teamIndex : parseInt(teamIndex);
  if (isMulti) {
    if (isNaN(tIdx) || !market.teams || tIdx < 0 || tIdx >= market.teams.length) {
      return res.status(400).json({ error: "Invalid teamIndex for multi-market" });
    }
  }

  const userId = (req.user as any)?.id || (req.user as any)?._id;
  const user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  // Pick the correct pool reference
  let poolRef: { yesPool: number; noPool: number };
  if (isMulti) {
    poolRef = market.teams![tIdx];
  } else {
    poolRef = market;
  }

  const currentYesPrice = calculateYesPrice(poolRef.yesPool, poolRef.noPool);
  const currentNoPrice = calculateNoPrice(poolRef.yesPool, poolRef.noPool);
  
  // Find or create holding
  let holding = user.holdings.find(h => 
    h.marketId === marketId && 
    (isMulti ? h.teamIndex === tIdx : h.teamIndex === undefined)
  );

  if (!holding) {
    holding = { marketId, teamIndex: isMulti ? tIdx : undefined, yesShares: 0, noShares: 0 };
    user.holdings.push(holding);
    // Find the newly pushed holding in the array
    holding = user.holdings[user.holdings.length - 1];
  }

  let executedAmount = numericAmount;
  let cost = 0;
  let sharesChanged = 0;

  if (type === "buy") {
    if (numericAmount > user.balance) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const price = outcome === "yes" ? currentYesPrice : currentNoPrice;
    sharesChanged = (numericAmount / price) * 100;

    if (outcome === "yes") {
      poolRef.yesPool = Math.max(1, poolRef.yesPool - numericAmount);
      poolRef.noPool += numericAmount;
      holding.yesShares += sharesChanged;
    } else {
      poolRef.noPool = Math.max(1, poolRef.noPool - numericAmount);
      poolRef.yesPool += numericAmount;
      holding.noShares += sharesChanged;
    }

    user.balance -= numericAmount;
    cost = numericAmount;
  } else {
    // SELL: numericAmount is shares here
    const availableShares = outcome === "yes" ? holding.yesShares : holding.noShares;
    if (numericAmount > availableShares + 0.001) { // small buffer for float errors
      return res.status(400).json({ error: `Not enough shares to sell. You have ${availableShares.toFixed(2)} shares.` });
    }

    const price = outcome === "yes" ? currentYesPrice : currentNoPrice;
    const payout = (price / 100) * numericAmount * 0.95; // Match frontend 5% fee

    if (outcome === "yes") {
      poolRef.yesPool += numericAmount;
      poolRef.noPool = Math.max(1, poolRef.noPool - numericAmount);
      holding.yesShares -= numericAmount;
    } else {
      poolRef.noPool += numericAmount;
      poolRef.yesPool = Math.max(1, poolRef.yesPool - numericAmount);
      holding.noShares -= numericAmount;
    }

    user.balance += payout;
    cost = -payout;
    sharesChanged = -numericAmount;
  }

  // Mark arrays as modified for Mongoose detection
  if (isMulti) {
    market.markModified("teams");
  }
  user.markModified("holdings");

  market.volume += (type === "buy" ? numericAmount : Math.abs(cost));
  
  const nextYesPrice = calculateYesPrice(poolRef.yesPool, poolRef.noPool);
  const nextNoPrice = calculateNoPrice(poolRef.yesPool, poolRef.noPool);
  const teamLabel = isMulti ? ` [${market.teams![tIdx].name}]` : "";
  
  market.priceHistory.push({
    yesPrice: nextYesPrice,
    noPrice: nextNoPrice,
    note: `${type === "buy" ? "Bought" : "Sold"} ${outcome.toUpperCase()}${teamLabel} (${sharesChanged > 0 ? sharesChanged.toFixed(2) : Math.abs(sharesChanged).toFixed(2)} shares)`,
    timestamp: new Date(),
  });

  if (!user.tradeHistory) user.tradeHistory = [];
  user.tradeHistory.push({
    marketId: market.id,
    marketTitle: market.title + teamLabel,
    tradeType: type,
    outcome,
    amount: numericAmount, // investment if buy, shares if sell
    shares: sharesChanged,
    cost: cost,
    timestamp: new Date(),
  });

  await Promise.all([market.save(), user.save()]);

  return res.json({
    market: serializeMarket(market),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      enrollmentNumber: user.enrollmentNumber,
      isAdmin: user.isAdmin,
      balance: user.balance,
      tradeHistory: user.tradeHistory,
      holdings: user.holdings,
    },
    trade: {
      type,
      outcome,
      amount: numericAmount,
      cost,
    },
  });
});

router.post("/markets/:id/resolve", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const marketId = req.params.id;
  const { outcome, teamIndex } = req.body;

  if (!isValidObjectId(marketId)) {
    return res.status(400).json({ error: "Invalid market ID" });
  }

  const market = await Market.findById(marketId);
  if (!market) {
    return res.status(404).json({ error: "Market not found" });
  }

  if (market.status !== "active") {
    return res.status(400).json({ error: "Market is already resolved" });
  }

  const isMulti = market.marketType === "multi";
  const tIdx = typeof teamIndex === "number" ? teamIndex : parseInt(teamIndex);

  if (isMulti) {
    if (isNaN(tIdx) || !market.teams || tIdx < 0 || tIdx >= market.teams.length) {
       // If no specific teamIndex, we assume the admin is resolving the WHOLE market
       // but for multi-markets, usually one team wins.
       // Let's assume for now admin handles this.
    }
  }

  market.status = outcome === "yes" ? "resolved_yes" : "resolved_no";
  market.resolvedOutcome = outcome;
  
  // Update price history for resolution
  market.priceHistory.push({
    yesPrice: outcome === "yes" ? 100 : 0,
    noPrice: outcome === "yes" ? 0 : 100,
    note: `Market resolved as ${outcome.toUpperCase()}${isMulti && !isNaN(tIdx) ? " for " + market.teams![tIdx].name : ""}`,
    timestamp: new Date(),
  });

  await market.save();

  // ── Payout Logic ──────────────────────────────────────────────────────────
  // Find all users who have holdings in this market
  const usersWithHoldings = await User.find({ "holdings.marketId": marketId });
  
  const payoutPromises = usersWithHoldings.map(async (user) => {
    let totalPayout = 0;
    
    // Filter out the holdings for this market being resolved
    user.holdings = user.holdings.filter((h: any) => {
      if (h.marketId !== marketId) return true;
      
      // If teamIndex matches or it's a binary market (teamIndex undefined)
      if (isMulti && !isNaN(tIdx)) {
         if (h.teamIndex === tIdx) {
            // This is the team we are resolving
            totalPayout += outcome === "yes" ? h.yesShares : h.noShares;
            return false; // remove after payout
         }
         // For other teams in the same multi-market, if Team A wins, 
         // it means Team B LOST. So Team B resolve = NO.
         // This is a complex case. For now, let's just resolve the specific team.
         return true; 
      } else {
         // Binary or Versus market or whole Multi market resolution
         totalPayout += outcome === "yes" ? h.yesShares : h.noShares;
         return false; // remove after payout
      }
    });

    if (totalPayout > 0) {
      user.balance += totalPayout;
      user.tradeHistory.push({
        marketId: market.id,
        marketTitle: market.title,
        tradeType: "payout",
        outcome: outcome,
        amount: totalPayout,
        cost: -totalPayout,
        timestamp: new Date(),
      });
      user.markModified("holdings");
      user.markModified("tradeHistory");
      await user.save();
    }
    return user;
  });

  await Promise.all(payoutPromises);

  return res.json(serializeMarket(market));
});

router.get("/leaderboard", async (req, res) => {
  const users = await User.find().sort({ balance: -1, createdAt: 1 }).limit(20);
  const leaderboard = users.map((user, index) => ({
    id: user.id,
    name: user.name,
    enrollmentNumber: user.enrollmentNumber,
    balance: user.balance,
    rank: index + 1,
  }));
  return res.json(leaderboard);
});

export default router;
