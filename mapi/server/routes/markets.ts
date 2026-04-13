import { Router } from "express";
import { isValidObjectId } from "mongoose";
import multer from "multer";
import User from "../models/User.js";
import Market, { calculateYesPrice } from "../models/Market.js";
import Treasury from "../models/Treasury.js";
import Comment from "../models/Comment.js";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import {
  QUOTE_TTL_MS,
  calculateCurrentB,
  createQuote,
  getOptionPrices,
  quoteBuy,
  quoteSell,
  type LmsrState,
} from "../../../shared/lmsr.js";

const router = Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "metamarket",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  } as any,
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function ensureAuthenticated(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: "Not authenticated" });
}

function ensureAdmin(req, res, next) {
  if (req.user?.isAdmin) return next();
  return res.status(403).json({ error: "Admin access required" });
}

function makeOptionId(index: number) {
  return `option-${index}`;
}

function convertLegacyBinaryToOptions(doc: any) {
  const b = Math.max(1, doc.initialB || 1000);
  const pYes = Math.min(0.999, Math.max(0.001, calculateYesPrice(doc.yesPool || 1000, doc.noPool || 1000) / 100));
  const delta = b * Math.log(pYes / (1 - pYes));
  const baseline = b * 10;

  return [
    {
      id: "yes",
      name: doc.marketType === "versus" ? doc.optionA || doc.shortA || "Option A" : "Yes",
      shortName: doc.shortA,
      shares: baseline + Math.max(delta, 0),
    },
    {
      id: "no",
      name: doc.marketType === "versus" ? doc.optionB || doc.shortB || "Option B" : "No",
      shortName: doc.shortB,
      shares: baseline + Math.max(-delta, 0),
    },
  ];
}

function convertLegacyMultiToOptions(doc: any) {
  const teams = doc.teams || [];
  const b = Math.max(1, doc.initialB || 1000);
  const baseline = b * 10;
  const rawProbabilities = teams.map((team: any) => Math.max(calculateYesPrice(team.yesPool || 1000, team.noPool || 1000) / 100, 0.001));
  const total = rawProbabilities.reduce((sum: number, value: number) => sum + value, 0) || teams.length || 1;

  return teams.map((team: any, index: number) => {
    const probability = Math.max(rawProbabilities[index] / total, 0.001);
    return {
      id: makeOptionId(index),
      name: team.name,
      shortName: team.name,
      imageUrl: team.imageUrl,
      shares: baseline + b * Math.log(probability),
    };
  });
}

function ensureLmsrMarketState(doc: any) {
  if (!doc.options || doc.options.length === 0) {
    doc.options = doc.marketType === "multi" ? convertLegacyMultiToOptions(doc) : convertLegacyBinaryToOptions(doc);
  }
  if (!doc.ammType) doc.ammType = "lmsr";
  if (!doc.initialB) doc.initialB = 1000;
  if (!doc.minB) doc.minB = Math.max(1, Math.round(doc.initialB * 0.25));
  if (typeof doc.isDynamic !== "boolean") doc.isDynamic = false;
  return doc;
}

function toLmsrState(doc: any): LmsrState {
  ensureLmsrMarketState(doc);
  return {
    options: doc.options.map((option: any) => ({ id: option.id, shares: option.shares })),
  };
}

function getCurrentPrices(doc: any) {
  const state = toLmsrState(doc);
  const currentB = calculateCurrentB({
    initialB: doc.initialB,
    isDynamic: doc.isDynamic,
    minB: doc.minB,
    createdAt: doc.createdAt,
    endDate: doc.endDate,
  });

  return {
    currentB,
    prices: getOptionPrices(state, currentB),
  };
}

function serializeUser(doc: any) {
  return {
    id: doc.id,
    email: doc.email,
    name: doc.name,
    enrollmentNumber: doc.enrollmentNumber,
    isAdmin: doc.isAdmin,
    balance: doc.balance,
    tradeHistory: (doc.tradeHistory || []).map((entry: any) => ({
      ...entry,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : new Date(entry.timestamp).toISOString(),
    })),
    positions: doc.positions || [],
  };
}

function serializeMarket(doc: any) {
  ensureLmsrMarketState(doc);
  const isResolved = doc.status !== "active";
  const { currentB, prices } = getCurrentPrices(doc);

  const options = doc.options.map((option: any) => {
    const resolvedWinner = doc.resolvedOptionId || doc.resolvedOutcome;
    const price = isResolved ? (option.id === resolvedWinner ? 1 : 0) : prices[option.id] || 0;

    return {
      id: option.id,
      name: option.name,
      shortName: option.shortName,
      imageUrl: option.imageUrl,
      shares: option.shares,
      price: price * 100,
    };
  });

  return {
    id: doc._id?.toString(),
    title: doc.title,
    description: doc.description,
    category: doc.category,
    creatorId: doc.creatorId,
    marketType: doc.marketType || "binary",
    ammType: doc.ammType || "lmsr",
    optionA: doc.optionA,
    optionB: doc.optionB,
    shortA: doc.shortA,
    shortB: doc.shortB,
    logoUrl: doc.logoUrl,
    options,
    teams:
      doc.marketType === "multi"
        ? options.map((option: any) => ({
            name: option.name,
            imageUrl: option.imageUrl,
            yesPrice: option.price,
            noPrice: Math.max(0, 100 - option.price),
          }))
        : doc.teams,
    status: doc.status,
    volume: doc.volume,
    priceHistory: (doc.priceHistory || []).map((point: any) => ({
      yesPrice: point.yesPrice,
      noPrice: point.noPrice,
      allPrices: point.allPrices,
      prices: point.prices,
      note: point.note,
      timestamp: point.timestamp instanceof Date ? point.timestamp.toISOString() : new Date(point.timestamp).toISOString(),
    })),
    resolvedOutcome: doc.resolvedOutcome,
    resolvedOptionId: doc.resolvedOptionId,
    endDate: doc.endDate ? new Date(doc.endDate).toISOString() : undefined,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
    yesPrice: options[0]?.price || 0,
    noPrice: options[1]?.price || 0,
    yesPool: doc.yesPool,
    noPool: doc.noPool,
    initialB: doc.initialB,
    minB: doc.minB,
    isDynamic: doc.isDynamic,
    currentB,
    quoteTtlMs: QUOTE_TTL_MS,
  };
}

function ensureUserPositions(user: any, market?: any) {
  if (!user.positions) user.positions = [];
  if (!user.holdings || !user.holdings.length) return;

  for (const holding of user.holdings) {
    if (holding.yesShares > 0) {
      const optionId = holding.teamIndex !== undefined && market?.marketType === "multi" ? makeOptionId(holding.teamIndex) : "yes";
      const optionName = market?.options?.find((option: any) => option.id === optionId)?.name || optionId;
      const existing = user.positions.find((position: any) => position.marketId === holding.marketId && position.optionId === optionId);
      if (existing) existing.shares += holding.yesShares;
      else user.positions.push({ marketId: holding.marketId, optionId, optionName, shares: holding.yesShares });
    }
    if (holding.noShares > 0 && holding.teamIndex === undefined) {
      const existing = user.positions.find((position: any) => position.marketId === holding.marketId && position.optionId === "no");
      if (existing) existing.shares += holding.noShares;
      else user.positions.push({ marketId: holding.marketId, optionId: "no", optionName: market?.optionB || market?.shortB || "No", shares: holding.noShares });
    }
  }

  user.holdings = [];
  user.markModified("positions");
  user.markModified("holdings");
}

function getOrCreatePosition(user: any, marketId: string, optionId: string, optionName: string) {
  let position = user.positions.find((entry: any) => entry.marketId === marketId && entry.optionId === optionId);
  if (!position) {
    position = { marketId, optionId, optionName, shares: 0 };
    user.positions.push(position);
  }
  return position;
}

async function getTreasury() {
  let treasury = await Treasury.findOne();
  if (!treasury) treasury = await Treasury.create({ realReserves: 0, solvencyThreshold: 1 });
  return treasury;
}

async function getSolvencyOverview() {
  const treasury = await getTreasury();
  const users = await User.find();
  const markets = await Market.find({ status: "active" });
  let totalPotentialPayouts = 0;

  markets.forEach((market) => {
    ensureLmsrMarketState(market);
    const optionTotals = new Map<string, number>();

    users.forEach((user) => {
      ensureUserPositions(user, market);
      (user.positions || [])
        .filter((position: any) => position.marketId === market.id)
        .forEach((position: any) => {
          optionTotals.set(position.optionId, (optionTotals.get(position.optionId) || 0) + position.shares);
        });
    });

    totalPotentialPayouts += Math.max(0, ...Array.from(optionTotals.values()));
  });

  const solvencyRatio = totalPotentialPayouts <= 0 ? Number.POSITIVE_INFINITY : treasury.realReserves / totalPotentialPayouts;
  return {
    treasury,
    overview: {
      realReserves: treasury.realReserves,
      totalPotentialPayouts,
      solvencyRatio,
      threshold: treasury.solvencyThreshold,
      isBelowThreshold: totalPotentialPayouts > 0 && solvencyRatio < treasury.solvencyThreshold,
    },
  };
}

router.get("/markets", async (_req, res) => {
  const markets = await Market.find().sort({ status: 1, createdAt: -1 });
  res.json(markets.map((market) => serializeMarket(market)));
});

router.get("/admin/solvency", ensureAuthenticated, ensureAdmin, async (_req, res) => {
  const { overview } = await getSolvencyOverview();
  return res.json(overview);
});

router.put("/admin/solvency", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const treasury = await getTreasury();
  const { realReserves, threshold } = req.body;

  if (typeof realReserves === "number" && !Number.isNaN(realReserves)) treasury.realReserves = realReserves;
  if (typeof threshold === "number" && !Number.isNaN(threshold) && threshold > 0) treasury.solvencyThreshold = threshold;

  await treasury.save();
  const { overview } = await getSolvencyOverview();
  return res.json(overview);
});

router.post("/upload", ensureAuthenticated, ensureAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  return res.json({ url: (req.file as any).path });
});

router.get("/markets/:id", async (req, res) => {
  const market = await Market.findById(req.params.id);
  if (!market) return res.status(404).json({ error: "Market not found" });
  return res.json(serializeMarket(market));
});

router.post("/markets", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { title, description, category, endDate, marketType, optionA, optionB, shortA, shortB, logoUrl, teams, initialB, minB, isDynamic, initialLiquidity } = req.body;
  if (!title || !description || !category) return res.status(400).json({ error: "Title, description, and category are required" });

  const { overview } = await getSolvencyOverview();
  if (overview.isBelowThreshold) {
    return res.status(400).json({ error: "Solvency guard active. Add reserves or lower platform liability before creating new markets." });
  }

  const baseB = Math.max(10, Number(initialB) || Number(initialLiquidity) || 1000);
  const floorB = Math.max(1, Number(minB) || Math.round(baseB * 0.25));
  const nextMarketType = marketType || "binary";
  const options = nextMarketType === "multi"
    ? (Array.isArray(teams) ? teams : []).map((team: any, index: number) => ({ id: makeOptionId(index), name: team.name, shortName: team.name, imageUrl: team.imageUrl, shares: baseB * 10 }))
    : [
        { id: "yes", name: nextMarketType === "versus" ? optionA || shortA || "Option A" : "Yes", shortName: shortA || optionA || "Yes", shares: baseB * 10 },
        { id: "no", name: nextMarketType === "versus" ? optionB || shortB || "Option B" : "No", shortName: shortB || optionB || "No", shares: baseB * 10 },
      ];

  const market = await Market.create({
    title,
    description,
    category,
    marketType: nextMarketType,
    ammType: "lmsr",
    optionA,
    optionB,
    shortA,
    shortB,
    logoUrl,
    creatorId: (req.user as any)?.id || (req.user as any)?._id,
    options,
    teams: nextMarketType === "multi" ? (teams || []).map((team: any) => ({ name: team.name, imageUrl: team.imageUrl, yesPool: baseB, noPool: baseB })) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    initialB: baseB,
    minB: floorB,
    isDynamic: Boolean(isDynamic),
    yesPool: baseB,
    noPool: baseB,
    priceHistory: [{
        yesPrice: nextMarketType === "multi" ? 0 : 50,
        noPrice: nextMarketType === "multi" ? 0 : 50,
      allPrices: nextMarketType === "multi" ? options.map(() => Number((100 / Math.max(options.length, 1)).toFixed(2))) : undefined,
      prices: options.map((option: any) => ({ optionId: option.id, price: Number((100 / Math.max(options.length, 1)).toFixed(2)) })),
      note: `Market opened with base liquidity parameter ${baseB}`,
      timestamp: new Date(),
    }],
  });

  return res.status(201).json(serializeMarket(market));
});

router.put("/markets/:id", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const market = await Market.findById(req.params.id);
  if (!market) return res.status(404).json({ error: "Market not found" });

  const { title, description, category, endDate, logoUrl, initialB, minB, isDynamic } = req.body;
  if (title) market.title = title;
  if (description) market.description = description;
  if (category) market.category = category;
  if (endDate) market.endDate = new Date(endDate);
  if (logoUrl) market.logoUrl = logoUrl;
  if (typeof initialB === "number" && initialB > 0) market.initialB = initialB;
  if (typeof minB === "number" && minB > 0) market.minB = minB;
  if (typeof isDynamic === "boolean") market.isDynamic = isDynamic;

  await market.save();
  return res.json(serializeMarket(market));
});

router.post("/markets/:id/quote", ensureAuthenticated, async (req, res) => {
  const { optionId, type, amount, tolerance } = req.body;
  const numericAmount = Number(amount);
  if (!type || !["buy", "sell"].includes(type)) return res.status(400).json({ error: "Invalid quote type" });
  if (Number.isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });

  const market = await Market.findById(req.params.id);
  if (!market) return res.status(404).json({ error: "Market not found" });
  ensureLmsrMarketState(market);

  const option = market.options.find((entry: any) => entry.id === optionId);
  if (!option) return res.status(400).json({ error: "Invalid option" });

  const currentB = calculateCurrentB({ initialB: market.initialB, isDynamic: market.isDynamic, minB: market.minB, createdAt: market.createdAt, endDate: market.endDate });
  const state = toLmsrState(market);

  if (type === "buy") {
    const result = quoteBuy(state, currentB, optionId, numericAmount);
    return res.json(createQuote({ marketId: market.id, type: "buy", option: { ...option, price: result.currentPrice * 100 }, amount: numericAmount, expectedShares: result.shares, averagePrice: result.averagePrice, currentPrice: result.currentPrice * 100, currentB, tolerance }));
  }

  const result = quoteSell(state, currentB, optionId, numericAmount);
  return res.json(createQuote({ marketId: market.id, type: "sell", option: { ...option, price: result.currentPrice * 100 }, amount: numericAmount, expectedShares: numericAmount, grossPayout: result.grossPayout, netPayout: result.netPayout, fee: result.fee, averagePrice: result.averagePrice, currentPrice: result.currentPrice * 100, currentB, tolerance }));
});

router.post("/markets/:id/trade", ensureAuthenticated, async (req, res) => {
  const { optionId, outcome, type, amount, expectedShares, slippageTolerance, quotedAt } = req.body;
  const nextOptionId = optionId || outcome;
  const numericAmount = Number(amount);

  if (!nextOptionId) return res.status(400).json({ error: "Option is required" });
  if (!type || !["buy", "sell"].includes(type)) return res.status(400).json({ error: "Invalid trade type" });
  if (Number.isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });

  const market = await Market.findById(req.params.id);
  if (!market) return res.status(404).json({ error: "Market not found" });
  ensureLmsrMarketState(market);
  if (market.status !== "active") return res.status(400).json({ error: "Cannot trade a resolved market" });
  if (market.endDate && new Date(market.endDate) < new Date()) return res.status(400).json({ error: "Market has closed for trading" });

  const option = market.options.find((entry: any) => entry.id === nextOptionId);
  if (!option) return res.status(400).json({ error: "Invalid option" });

  const user = await User.findById((req.user as any)?.id || (req.user as any)?._id);
  if (!user) return res.status(401).json({ error: "User not found" });
  ensureUserPositions(user, market);

  if (!quotedAt || Date.now() - new Date(quotedAt).getTime() > QUOTE_TTL_MS) {
    return res.status(409).json({ error: "Quote expired. Please refresh the quote and try again." });
  }

  const currentB = calculateCurrentB({ initialB: market.initialB, isDynamic: market.isDynamic, minB: market.minB, createdAt: market.createdAt, endDate: market.endDate });
  const state = toLmsrState(market);
  const tolerance = Math.max(0, Math.min(0.25, Number(slippageTolerance) || 0.02));

  let shares = 0;
  let fee = 0;
  let cashDelta = 0;
  let averagePrice = 0;
  let quoteResponse: any;

  if (type === "buy") {
    if (numericAmount > user.balance) return res.status(400).json({ error: "Insufficient balance" });
    const result = quoteBuy(state, currentB, nextOptionId, numericAmount);
    const minAcceptedShares = Number(expectedShares) * (1 - tolerance);
    if (result.shares + 1e-6 < minAcceptedShares) {
      quoteResponse = createQuote({ marketId: market.id, type: "buy", option: { ...option, price: result.currentPrice * 100 }, amount: numericAmount, expectedShares: result.shares, averagePrice: result.averagePrice, currentPrice: result.currentPrice * 100, currentB, tolerance });
      return res.status(409).json({ error: "Price moved before execution. Please review the updated quote.", quote: quoteResponse });
    }

    shares = result.shares;
    averagePrice = result.averagePrice;
    cashDelta = -numericAmount;
    option.shares += shares;
    getOrCreatePosition(user, market.id, nextOptionId, option.name).shares += shares;
    user.balance += cashDelta;
    quoteResponse = createQuote({ marketId: market.id, type: "buy", option: { ...option, price: result.currentPrice * 100 }, amount: numericAmount, expectedShares: shares, averagePrice, currentPrice: result.currentPrice * 100, currentB, tolerance });
  } else {
    const position = getOrCreatePosition(user, market.id, nextOptionId, option.name);
    if (numericAmount > position.shares + 1e-6) return res.status(400).json({ error: `Not enough shares to sell. You have ${position.shares.toFixed(2)} shares.` });

    const result = quoteSell(state, currentB, nextOptionId, numericAmount);
    shares = numericAmount;
    fee = result.fee;
    averagePrice = result.averagePrice;
    cashDelta = result.netPayout;
    option.shares = Math.max(0, option.shares - numericAmount);
    position.shares = Math.max(0, position.shares - numericAmount);
    user.balance += cashDelta;
    quoteResponse = createQuote({ marketId: market.id, type: "sell", option: { ...option, price: result.currentPrice * 100 }, amount: numericAmount, expectedShares: shares, grossPayout: result.grossPayout, netPayout: result.netPayout, fee, averagePrice, currentPrice: result.currentPrice * 100, currentB, tolerance });
  }

  market.markModified("options");
  user.positions = (user.positions || []).filter((position: any) => position.shares > 1e-6);
  user.markModified("positions");
  market.volume += Math.abs(cashDelta);

  const nextPrices = getOptionPrices(toLmsrState(market), currentB);
  market.priceHistory.push({
    yesPrice: market.marketType === "multi" ? 0 : (nextPrices.yes || 0) * 100,
    noPrice: market.marketType === "multi" ? 0 : (nextPrices.no || 0) * 100,
    allPrices: market.marketType === "multi" ? market.options.map((entry: any) => Number(((nextPrices[entry.id] || 0) * 100).toFixed(2))) : undefined,
    prices: market.options.map((entry: any) => ({ optionId: entry.id, price: Number(((nextPrices[entry.id] || 0) * 100).toFixed(2)) })),
    note: `${type === "buy" ? "Bought" : "Sold"} ${option.name}`,
    timestamp: new Date(),
  });

  if (!user.tradeHistory) user.tradeHistory = [];
  user.tradeHistory.push({
    marketId: market.id,
    marketTitle: market.title,
    tradeType: type,
    optionId: nextOptionId,
    optionName: option.name,
    amount: numericAmount,
    shares: type === "buy" ? shares : -shares,
    averagePrice,
    fee,
    cashDelta,
    timestamp: new Date(),
  });

  await Promise.all([market.save(), user.save()]);

  return res.json({
    market: serializeMarket(market),
    user: serializeUser(user),
    trade: { type, optionId: nextOptionId, optionName: option.name, amount: numericAmount, shares, fee, cashDelta, averagePrice },
    quote: quoteResponse,
  });
});

router.post("/markets/:id/resolve", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { outcome, optionId, teamIndex } = req.body;
  const market = await Market.findById(req.params.id);
  if (!market) return res.status(404).json({ error: "Market not found" });
  ensureLmsrMarketState(market);
  if (market.status !== "active") return res.status(400).json({ error: "Market is already resolved" });

  const resolvedOptionId = optionId || (market.marketType === "multi" && Number.isInteger(teamIndex) ? makeOptionId(Number(teamIndex)) : outcome);
  const winningOption = market.options.find((option: any) => option.id === resolvedOptionId);
  if (!winningOption) return res.status(400).json({ error: "Winning option not found" });

  market.status = market.marketType === "multi" ? "resolved_option" : resolvedOptionId === "yes" ? "resolved_yes" : "resolved_no";
  market.resolvedOptionId = resolvedOptionId;
  if (resolvedOptionId === "yes" || resolvedOptionId === "no") market.resolvedOutcome = resolvedOptionId;
  market.priceHistory.push({
    yesPrice: resolvedOptionId === "yes" ? 100 : 0,
    noPrice: resolvedOptionId === "no" ? 100 : resolvedOptionId === "yes" ? 0 : 0,
    allPrices: market.marketType === "multi" ? market.options.map((option: any) => (option.id === resolvedOptionId ? 100 : 0)) : undefined,
    prices: market.options.map((option: any) => ({ optionId: option.id, price: option.id === resolvedOptionId ? 100 : 0 })),
    note: `Market resolved as ${winningOption.name}`,
    timestamp: new Date(),
  });
  await market.save();

  const users = await User.find({ "positions.marketId": market.id });
  await Promise.all(users.map(async (user) => {
    ensureUserPositions(user, market);
    const winningPosition = (user.positions || []).find((position: any) => position.marketId === market.id && position.optionId === resolvedOptionId);
    const payout = winningPosition?.shares || 0;
    if (!user.tradeHistory) user.tradeHistory = [];
    user.tradeHistory.push({ marketId: market.id, marketTitle: market.title, tradeType: "payout", optionId: resolvedOptionId, optionName: winningOption.name, amount: payout, shares: payout, averagePrice: payout > 0 ? 1 : 0, fee: 0, cashDelta: payout, timestamp: new Date() });
    user.balance += payout;
    user.positions = (user.positions || []).filter((position: any) => position.marketId !== market.id);
    user.markModified("positions");
    await user.save();
  }));

  return res.json(serializeMarket(market));
});

router.get("/leaderboard", async (_req, res) => {
  const markets = await Market.find();
  const priceMap = new Map<string, number>();
  markets.forEach((market) => {
    const serialized = serializeMarket(market);
    serialized.options.forEach((option) => priceMap.set(`${serialized.id}_${option.id}`, option.price / 100));
  });

  const allUsers = await User.find();
  const usersWithNetWorth = allUsers.map((user) => {
    ensureUserPositions(user);
    let holdingsValue = 0;
    (user.positions || []).forEach((position: any) => {
      holdingsValue += position.shares * (priceMap.get(`${position.marketId}_${position.optionId}`) || 0);
    });
    return { user, holdingsValue, totalNetWorth: user.balance + holdingsValue };
  });

  usersWithNetWorth.sort((a, b) => b.totalNetWorth - a.totalNetWorth);
  const top20 = usersWithNetWorth.slice(0, 20);
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000;

  const leaderboard = await Promise.all(top20.map(async (entry, index) => {
    const currentRank = index + 1;
    let rankTrend = 0;
    if (entry.user.lastRank) rankTrend = entry.user.lastRank - currentRank;
    if (!entry.user.lastRankUpdate || now.getTime() - entry.user.lastRankUpdate.getTime() > ONE_HOUR) {
      entry.user.lastRank = currentRank;
      entry.user.lastRankUpdate = now;
      await entry.user.save();
    }

    return {
      id: entry.user.id,
      name: entry.user.name,
      enrollmentNumber: entry.user.enrollmentNumber,
      balance: Math.round(entry.user.balance),
      holdingsValue: Math.round(entry.holdingsValue),
      totalNetWorth: Math.round(entry.totalNetWorth),
      rank: currentRank,
      rankTrend,
    };
  }));

  return res.json(leaderboard);
});

router.get("/markets/:id/comments", async (req, res) => {
  const comments = await Comment.find({ marketId: req.params.id }).sort({ createdAt: -1 });
  res.json(comments);
});

router.post("/markets/:id/comments", ensureAuthenticated, async (req, res) => {
  const { content } = req.body;
  if (!content || content.trim().length === 0) return res.status(400).json({ error: "Comment content is required" });

  const market = await Market.findById(req.params.id);
  if (!market) return res.status(404).json({ error: "Market not found" });
  if (market.status !== "active") return res.status(400).json({ error: "Cannot comment on a resolved market" });

  const user = await User.findById((req.user as any)?.id || (req.user as any)?._id);
  if (!user) return res.status(401).json({ error: "User not found" });

  const comment = await Comment.create({
    marketId: req.params.id,
    userId: user.id,
    userName: user.name,
    content: content.trim(),
  });

  return res.status(201).json(comment);
});

export default router;
