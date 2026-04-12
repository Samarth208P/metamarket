import "dotenv/config";
import express, { Router } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import mongoose, { isValidObjectId } from "mongoose";
import path from "path";
import { Strategy } from "passport-google-oauth20";
import multer from "multer";
import { v2 } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
//#region mapi/server/models/User.ts
var UserSchema = new mongoose.Schema({
	googleId: {
		type: String,
		required: true,
		unique: true
	},
	email: {
		type: String,
		required: true,
		unique: true
	},
	name: {
		type: String,
		required: true
	},
	enrollmentNumber: {
		type: String,
		required: true
	},
	isAdmin: {
		type: Boolean,
		default: false
	},
	balance: {
		type: Number,
		default: 1e3
	},
	tradeHistory: {
		type: [Object],
		default: []
	},
	bookmarks: {
		type: [String],
		default: []
	},
	holdings: [{
		marketId: {
			type: String,
			required: true
		},
		teamIndex: { type: Number },
		yesShares: {
			type: Number,
			default: 0
		},
		noShares: {
			type: Number,
			default: 0
		},
		_id: false
	}],
	lastRank: { type: Number },
	lastRankUpdate: { type: Date }
}, {
	timestamps: true,
	toJSON: {
		virtuals: true,
		versionKey: false,
		transform(_doc, ret) {
			const record = ret;
			record.id = record._id?.toString();
			delete record._id;
		}
	}
});
var User_default = mongoose.models.User || mongoose.model("User", UserSchema);
//#endregion
//#region mapi/server/routes/auth.ts
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
function initializePassport() {
	if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
		console.warn("⚠️ Google Auth skipped: Missing GOOGLE_CLIENT_ID or SECRET");
		return;
	}
	try {
		passport.use(new Strategy({
			clientID: GOOGLE_CLIENT_ID,
			clientSecret: GOOGLE_CLIENT_SECRET,
			callbackURL: process.env.GOOGLE_CALLBACK_URL || `https://${process.env.VERCEL_URL || "metamarket-iitr.vercel.app"}/mapi/auth/google/callback`,
			proxy: true
		}, async (_accessToken, _refreshToken, profile, done) => {
			try {
				const email = profile.emails?.[0]?.value;
				if (!email || !email.endsWith("@iitr.ac.in") && !email.endsWith("@mt.iitr.ac.in")) return done(null, false, { message: "Only IITR emails allowed" });
				const enrollmentNumber = email.split("@")[0];
				const isAdmin = email === "samarth_p@mt.iitr.ac.in";
				return done(null, await User_default.findOneAndUpdate({ googleId: profile.id }, {
					googleId: profile.id,
					email,
					name: profile.displayName || enrollmentNumber,
					enrollmentNumber,
					isAdmin
				}, {
					new: true,
					upsert: true,
					setDefaultsOnInsert: true
				}));
			} catch (error) {
				return done(error, void 0);
			}
		}));
		console.log("✅ Google Auth strategy initialized");
	} catch (error) {
		console.error("❌ Google Auth initialization failed:", error);
	}
}
var handleGoogleAuth = (req, res, next) => {
	if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: "Auth not configured on server" });
	passport.authenticate("google", {
		scope: ["profile", "email"],
		session: false
	})(req, res, next);
};
var handleGoogleCallback = (req, res, next) => {
	passport.authenticate("google", { session: false }, (err, user) => {
		if (err || !user) return res.redirect("/login?error=auth_failed");
		res.cookie("userId", user.id || user._id, {
			signed: true,
			httpOnly: true,
			secure: true,
			maxAge: 336 * 60 * 60 * 1e3,
			sameSite: "lax"
		});
		res.redirect("/");
	})(req, res, next);
};
var handleAuthSuccess = (req, res) => {
	res.redirect("/");
};
var handleLogout = (req, res) => {
	res.clearCookie("userId");
	res.json({ success: true });
};
var handleGetUser = async (req, res) => {
	try {
		const userId = req.signedCookies?.userId;
		if (userId) {
			const user = await User_default.findById(userId);
			if (user) return res.json(user);
		}
		res.status(401).json({ error: "Not authenticated" });
	} catch (error) {
		res.status(500).json({ error: "Internal server error" });
	}
};
//#endregion
//#region mapi/server/database.ts
var MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/metamarket";
async function connectDB() {
	if (mongoose.connection.readyState >= 1) return;
	try {
		console.log("Connecting to MongoDB...");
		await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5e3 });
		console.log("Connected to MongoDB");
	} catch (error) {
		console.error("MongoDB connection error:", error);
		throw error;
	}
}
//#endregion
//#region mapi/server/models/Market.ts
var PriceHistorySchema = new mongoose.Schema({
	yesPrice: {
		type: Number,
		required: true
	},
	noPrice: {
		type: Number,
		required: true
	},
	note: {
		type: String,
		required: true
	},
	timestamp: {
		type: Date,
		default: Date.now
	}
}, { _id: false });
var MarketSchema = new mongoose.Schema({
	title: {
		type: String,
		required: true
	},
	description: {
		type: String,
		required: true
	},
	category: {
		type: String,
		default: "General"
	},
	marketType: {
		type: String,
		enum: [
			"binary",
			"versus",
			"multi"
		],
		default: "binary"
	},
	optionA: { type: String },
	optionB: { type: String },
	shortA: { type: String },
	shortB: { type: String },
	logoUrl: { type: String },
	teams: [{
		name: { type: String },
		imageUrl: { type: String },
		yesPool: {
			type: Number,
			default: 1e3
		},
		noPool: {
			type: Number,
			default: 1e3
		},
		_id: false
	}],
	creatorId: { type: String },
	status: {
		type: String,
		enum: [
			"active",
			"resolved_yes",
			"resolved_no"
		],
		default: "active"
	},
	yesPool: {
		type: Number,
		default: 1e3
	},
	noPool: {
		type: Number,
		default: 1e3
	},
	volume: {
		type: Number,
		default: 0
	},
	priceHistory: {
		type: [PriceHistorySchema],
		default: []
	},
	resolvedOutcome: {
		type: String,
		enum: ["yes", "no"],
		default: null
	},
	endDate: { type: Date }
}, {
	timestamps: true,
	toJSON: {
		virtuals: true,
		versionKey: false,
		transform(_doc, ret) {
			const record = ret;
			record.id = record._id?.toString();
			delete record._id;
		}
	}
});
function calculateYesPrice(yesPool, noPool) {
	const total = yesPool + noPool;
	if (total <= 0) return 50;
	return Math.min(100, Math.max(0, noPool / total * 100));
}
function calculateNoPrice(yesPool, noPool) {
	const total = yesPool + noPool;
	if (total <= 0) return 50;
	return Math.min(100, Math.max(0, yesPool / total * 100));
}
var Market = mongoose.models.Market || mongoose.model("Market", MarketSchema);
//#endregion
//#region mapi/server/models/Comment.ts
var CommentSchema = new mongoose.Schema({
	marketId: {
		type: String,
		required: true,
		index: true
	},
	userId: {
		type: String,
		required: true
	},
	userName: {
		type: String,
		required: true
	},
	content: {
		type: String,
		required: true
	}
}, { timestamps: true });
var Comment_default = mongoose.models.Comment || mongoose.model("Comment", CommentSchema);
//#endregion
//#region mapi/server/routes/markets.ts
var router = Router();
v2.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET
});
var upload = multer({
	storage: new CloudinaryStorage({
		cloudinary: v2,
		params: {
			folder: "metamarket",
			allowed_formats: [
				"jpg",
				"png",
				"jpeg",
				"webp"
			]
		}
	}),
	limits: { fileSize: 5 * 1024 * 1024 }
});
function ensureAuthenticated(req, res, next) {
	if (req.user) return next();
	return res.status(401).json({ error: "Not authenticated" });
}
function ensureAdmin(req, res, next) {
	if (req.user?.isAdmin) return next();
	return res.status(403).json({ error: "Admin access required" });
}
function serializeMarket(doc) {
	const isResolvedYes = doc.status === "resolved_yes";
	const isResolvedNo = doc.status === "resolved_no";
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
			timestamp: point.timestamp instanceof Date ? point.timestamp.toISOString() : new Date(point.timestamp).toISOString()
		})),
		marketType: doc.marketType || "binary",
		optionA: doc.optionA,
		optionB: doc.optionB,
		shortA: doc.shortA,
		shortB: doc.shortB,
		logoUrl: doc.logoUrl,
		teams: doc.teams?.map((t) => ({
			name: t.name,
			imageUrl: t.imageUrl,
			yesPool: t.yesPool,
			noPool: t.noPool,
			yesPrice: isResolvedYes ? 100 : isResolvedNo ? 0 : calculateYesPrice(t.yesPool, t.noPool),
			noPrice: isResolvedYes ? 0 : isResolvedNo ? 100 : calculateNoPrice(t.yesPool, t.noPool)
		})),
		resolvedOutcome: doc.resolvedOutcome,
		endDate: doc.endDate ? doc.endDate instanceof Date ? doc.endDate.toISOString() : new Date(doc.endDate).toISOString() : void 0,
		createdAt: doc.createdAt?.toISOString(),
		updatedAt: doc.updatedAt?.toISOString(),
		yesPrice: isResolvedYes ? 100 : isResolvedNo ? 0 : calculateYesPrice(doc.yesPool, doc.noPool),
		noPrice: isResolvedYes ? 0 : isResolvedNo ? 100 : calculateNoPrice(doc.yesPool, doc.noPool)
	};
}
router.get("/markets", async (req, res) => {
	const markets = await Market.find().sort({
		status: 1,
		createdAt: -1
	});
	res.json(markets.map(serializeMarket));
});
router.post("/upload", ensureAuthenticated, ensureAdmin, upload.single("image"), (req, res) => {
	if (!req.file) return res.status(400).json({ error: "No file uploaded" });
	const url = req.file.path;
	return res.json({ url });
});
router.get("/markets/:id", async (req, res) => {
	const marketId = req.params.id;
	if (!isValidObjectId(marketId)) return res.status(400).json({ error: "Invalid market ID" });
	const market = await Market.findById(marketId);
	if (!market) return res.status(404).json({ error: "Market not found" });
	return res.json(serializeMarket(market));
});
router.post("/markets", ensureAuthenticated, ensureAdmin, async (req, res) => {
	const { title, description, category, endDate, marketType, optionA, optionB, shortA, shortB, logoUrl, teams, initialLiquidity } = req.body;
	if (!title || !description || !category) return res.status(400).json({ error: "Title, description, and category are required" });
	const liquidity = Number(initialLiquidity) || 1e3;
	const creatorId = req.user?.id || req.user?._id;
	const teamsData = marketType === "multi" && Array.isArray(teams) ? teams.map((t) => ({
		name: t.name,
		imageUrl: t.imageUrl,
		yesPool: liquidity,
		noPool: liquidity
	})) : void 0;
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
		endDate: endDate ? new Date(endDate) : void 0,
		yesPool: liquidity,
		noPool: liquidity,
		priceHistory: [{
			yesPrice: 50,
			noPrice: 50,
			note: `Market opened with ₹${liquidity} initial liquidity`,
			timestamp: /* @__PURE__ */ new Date()
		}]
	});
	return res.status(201).json(serializeMarket(market));
});
router.post("/markets/:id/trade", ensureAuthenticated, async (req, res) => {
	const marketId = req.params.id;
	const { outcome, type, amount, teamIndex } = req.body;
	if (!isValidObjectId(marketId)) return res.status(400).json({ error: "Invalid market ID" });
	if (!["yes", "no"].includes(outcome) || !["buy", "sell"].includes(type)) return res.status(400).json({ error: "Invalid trade parameters" });
	const numericAmount = Number(amount);
	if (Number.isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "Amount must be a positive number" });
	const market = await Market.findById(marketId);
	if (!market) return res.status(404).json({ error: "Market not found" });
	if (market.status !== "active") return res.status(400).json({ error: "Cannot trade a resolved market" });
	const isMulti = market.marketType === "multi";
	const tIdx = typeof teamIndex === "number" ? teamIndex : parseInt(teamIndex);
	if (isMulti) {
		if (isNaN(tIdx) || !market.teams || tIdx < 0 || tIdx >= market.teams.length) return res.status(400).json({ error: "Invalid teamIndex for multi-market" });
	}
	const userId = req.user?.id || req.user?._id;
	const user = await User_default.findById(userId);
	if (!user) return res.status(401).json({ error: "User not found" });
	let poolRef;
	if (isMulti) poolRef = market.teams[tIdx];
	else poolRef = market;
	const currentYesPrice = calculateYesPrice(poolRef.yesPool, poolRef.noPool);
	const currentNoPrice = calculateNoPrice(poolRef.yesPool, poolRef.noPool);
	let holding = user.holdings.find((h) => h.marketId === marketId && (isMulti ? h.teamIndex === tIdx : h.teamIndex === void 0));
	if (!holding) {
		holding = {
			marketId,
			teamIndex: isMulti ? tIdx : void 0,
			yesShares: 0,
			noShares: 0
		};
		user.holdings.push(holding);
		holding = user.holdings[user.holdings.length - 1];
	}
	let cost = 0;
	let sharesChanged = 0;
	if (type === "buy") {
		if (numericAmount > user.balance) return res.status(400).json({ error: "Insufficient balance" });
		sharesChanged = numericAmount / (outcome === "yes" ? currentYesPrice : currentNoPrice) * 100;
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
		const availableShares = outcome === "yes" ? holding.yesShares : holding.noShares;
		if (numericAmount > availableShares + .001) return res.status(400).json({ error: `Not enough shares to sell. You have ${availableShares.toFixed(2)} shares.` });
		const payout = (outcome === "yes" ? currentYesPrice : currentNoPrice) / 100 * numericAmount * .95;
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
	if (isMulti) market.markModified("teams");
	user.markModified("holdings");
	market.volume += type === "buy" ? numericAmount : Math.abs(cost);
	const nextYesPrice = calculateYesPrice(poolRef.yesPool, poolRef.noPool);
	const nextNoPrice = calculateNoPrice(poolRef.yesPool, poolRef.noPool);
	const teamLabel = isMulti ? ` [${market.teams[tIdx].name}]` : "";
	market.priceHistory.push({
		yesPrice: nextYesPrice,
		noPrice: nextNoPrice,
		note: `${type === "buy" ? "Bought" : "Sold"} ${outcome.toUpperCase()}${teamLabel} (${sharesChanged > 0 ? sharesChanged.toFixed(2) : Math.abs(sharesChanged).toFixed(2)} shares)`,
		timestamp: /* @__PURE__ */ new Date()
	});
	let outcomeLabel = outcome.toUpperCase();
	if (market.marketType === "versus") outcomeLabel = outcome === "yes" ? market.shortA || market.optionA || "YES" : market.shortB || market.optionB || "NO";
	else if (market.marketType === "multi") outcomeLabel = market.teams[tIdx].name;
	if (!user.tradeHistory) user.tradeHistory = [];
	user.tradeHistory.push({
		marketId: market.id,
		marketTitle: market.title + teamLabel,
		tradeType: type,
		outcome,
		outcomeLabel,
		amount: numericAmount,
		shares: sharesChanged,
		cost,
		timestamp: /* @__PURE__ */ new Date()
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
			holdings: user.holdings
		},
		trade: {
			type,
			outcome,
			amount: numericAmount,
			cost
		}
	});
});
router.post("/markets/:id/resolve", ensureAuthenticated, ensureAdmin, async (req, res) => {
	const marketId = req.params.id;
	const { outcome, teamIndex } = req.body;
	if (!isValidObjectId(marketId)) return res.status(400).json({ error: "Invalid market ID" });
	const market = await Market.findById(marketId);
	if (!market) return res.status(404).json({ error: "Market not found" });
	if (market.status !== "active") return res.status(400).json({ error: "Market is already resolved" });
	const isMulti = market.marketType === "multi";
	const tIdx = typeof teamIndex === "number" ? teamIndex : parseInt(teamIndex);
	if (isMulti) {
		if (isNaN(tIdx) || !market.teams || tIdx < 0 || tIdx >= market.teams.length) {}
	}
	market.status = outcome === "yes" ? "resolved_yes" : "resolved_no";
	market.resolvedOutcome = outcome;
	market.priceHistory.push({
		yesPrice: outcome === "yes" ? 100 : 0,
		noPrice: outcome === "yes" ? 0 : 100,
		note: `Market resolved as ${outcome.toUpperCase()}${isMulti && !isNaN(tIdx) ? " for " + market.teams[tIdx].name : ""}`,
		timestamp: /* @__PURE__ */ new Date()
	});
	await market.save();
	const payoutPromises = (await User_default.find({ "holdings.marketId": marketId })).map(async (user) => {
		let totalPayout = 0;
		user.holdings = user.holdings.filter((h) => {
			if (h.marketId !== marketId) return true;
			if (isMulti && !isNaN(tIdx)) {
				if (h.teamIndex === tIdx) {
					totalPayout += outcome === "yes" ? h.yesShares : h.noShares;
					return false;
				}
				return true;
			} else {
				totalPayout += outcome === "yes" ? h.yesShares : h.noShares;
				return false;
			}
		});
		if (totalPayout > 0 || totalPayout === 0) {
			if (totalPayout > 0) user.balance += totalPayout;
			const marketLabel = isMulti && !isNaN(tIdx) && market.teams ? ` [${market.teams[tIdx].name}]` : "";
			const outcomeLabel = outcome === "yes" ? market.shortA || market.optionA || "YES" : market.shortB || market.optionB || "NO";
			user.tradeHistory.push({
				marketId: market.id,
				marketTitle: market.title + marketLabel,
				tradeType: "payout",
				outcome,
				outcomeLabel: isMulti && !isNaN(tIdx) ? market.teams[tIdx].name : outcomeLabel,
				amount: totalPayout,
				cost: -totalPayout,
				timestamp: /* @__PURE__ */ new Date()
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
	const markets = await Market.find();
	const priceMap = /* @__PURE__ */ new Map();
	markets.forEach((m) => {
		const marketId = m._id.toString();
		if (m.marketType === "multi" && m.teams) m.teams.forEach((t, i) => {
			priceMap.set(`${marketId}_team_${i}`, calculateYesPrice(t.yesPool, t.noPool));
		});
		else {
			priceMap.set(`${marketId}_yes`, calculateYesPrice(m.yesPool, m.noPool));
			priceMap.set(`${marketId}_no`, calculateNoPrice(m.yesPool, m.noPool));
		}
	});
	const usersWithNetWorth = (await User_default.find()).map((user) => {
		let holdingsValue = 0;
		if (user.holdings && user.holdings.length > 0) user.holdings.forEach((h) => {
			if (h.teamIndex !== void 0) {
				const price = priceMap.get(`${h.marketId}_team_${h.teamIndex}`) || 0;
				holdingsValue += (h.yesShares || 0) * (price / 100);
			} else {
				const yesPrice = priceMap.get(`${h.marketId}_yes`) || 0;
				const noPrice = priceMap.get(`${h.marketId}_no`) || 0;
				holdingsValue += (h.yesShares || 0) * (yesPrice / 100);
				holdingsValue += (h.noShares || 0) * (noPrice / 100);
			}
		});
		return {
			user,
			holdingsValue,
			totalNetWorth: user.balance + holdingsValue
		};
	});
	usersWithNetWorth.sort((a, b) => b.totalNetWorth - a.totalNetWorth);
	const top20 = usersWithNetWorth.slice(0, 20);
	const now = /* @__PURE__ */ new Date();
	const ONE_HOUR = 3600 * 1e3;
	const leaderboard = await Promise.all(top20.map(async (entry, index) => {
		const { user, holdingsValue, totalNetWorth } = entry;
		const currentRank = index + 1;
		let rankTrend = 0;
		if (user.lastRank) rankTrend = user.lastRank - currentRank;
		if (!user.lastRankUpdate || now.getTime() - user.lastRankUpdate.getTime() > ONE_HOUR) {
			user.lastRank = currentRank;
			user.lastRankUpdate = now;
			await user.save();
		}
		return {
			id: user.id,
			name: user.name,
			enrollmentNumber: user.enrollmentNumber,
			balance: user.balance,
			holdingsValue: Math.round(holdingsValue),
			totalNetWorth: Math.round(totalNetWorth),
			rank: currentRank,
			rankTrend
		};
	}));
	return res.json(leaderboard);
});
router.get("/markets/:id/comments", async (req, res) => {
	const marketId = req.params.id;
	const comments = await Comment_default.find({ marketId }).sort({ createdAt: -1 });
	res.json(comments);
});
router.post("/markets/:id/comments", ensureAuthenticated, async (req, res) => {
	const marketId = req.params.id;
	const { content } = req.body;
	if (!content || content.trim().length === 0) return res.status(400).json({ error: "Comment content is required" });
	const market = await Market.findById(marketId);
	if (!market) return res.status(404).json({ error: "Market not found" });
	if (market.status !== "active") return res.status(400).json({ error: "Cannot comment on a resolved market" });
	const userId = req.user?.id || req.user?._id;
	const user = await User_default.findById(userId);
	if (!user) return res.status(401).json({ error: "User not found" });
	const comment = await Comment_default.create({
		marketId,
		userId: user.id,
		userName: user.name,
		content: content.trim()
	});
	res.status(201).json(comment);
});
//#endregion
//#region mapi/server/index.ts
async function createServer() {
	const app = express();
	app.set("trust proxy", 1);
	app.use(cors({
		origin: true,
		credentials: true
	}));
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	const uploadsPath = path.resolve(process.cwd(), "public", "uploads");
	app.use("/uploads", express.static(uploadsPath));
	app.use(cookieParser(process.env.SESSION_SECRET || "metamarket-secret-key"));
	initializePassport();
	app.use(passport.initialize());
	app.use(async (req, _res, next) => {
		const userId = req.signedCookies?.userId;
		if (userId && mongoose.isValidObjectId(userId)) try {
			const user = await User_default.findById(userId);
			if (user) req.user = user;
		} catch (err) {
			console.error("Auth middleware error:", err);
		}
		next();
	});
	app.get("/mapi/ping", (_req, res) => {
		const ping = process.env.PING_MESSAGE ?? "ping";
		res.json({ message: ping });
	});
	app.get("/mapi/health", async (_req, res) => {
		try {
			const isConnected = mongoose.connection.readyState === 1;
			res.json({
				status: "ok",
				database: isConnected ? "connected" : "disconnected",
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
		} catch (error) {
			res.status(500).json({
				status: "error",
				database: "error",
				error: error.message
			});
		}
	});
	app.use("/mapi", router);
	app.get("/mapi/auth/google", handleGoogleAuth);
	app.get("/mapi/auth/google/callback", handleGoogleCallback, handleAuthSuccess);
	app.post("/mapi/auth/logout", handleLogout);
	app.get("/mapi/user", handleGetUser);
	app.post("/mapi/user/bookmarks", async (req, res) => {
		const userId = req.signedCookies?.userId;
		if (!userId) return res.status(401).json({ error: "Unauthorized" });
		const { marketId } = req.body;
		if (!marketId) return res.status(400).json({ error: "Market ID required" });
		try {
			const user = await User_default.findById(userId);
			if (!user) return res.status(404).json({ error: "User not found" });
			if (!user.bookmarks) user.bookmarks = [];
			const index = user.bookmarks.indexOf(marketId);
			if (index > -1) user.bookmarks.splice(index, 1);
			else user.bookmarks.push(marketId);
			await user.save();
			res.json(user);
		} catch (error) {
			res.status(500).json({ error: "Internal server error" });
		}
	});
	return app;
}
//#endregion
export { connectDB, createServer };

//# sourceMappingURL=index.mjs.map