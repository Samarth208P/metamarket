import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import path from "node:path";
import { connectDB, isRecordId, withAccount } from "./database.ts";
export { connectDB };

import marketRoutes from "./routes/markets.ts";
import { codexAgentRoutes, codexOwnerRoutes } from "./routes/codex.ts";
import adminRoutes from "./routes/admin.ts";
import profileImageRoutes from "./routes/profileImage.ts";
import {
  FRONTEND_URL,
  initializePassport,
  handleGoogleAuth,
  handleGoogleCallback,
  handleLogout,
  handleGetUser,
  handleOnboarding,
  handleUpdateUsername,
  handleAcknowledgeStarterGift,
  handleClearHistory,
  requireAccount,
  requireOnboardingComplete,
} from "./routes/auth.ts";
import User from "./models/User.ts";
import { ApiError, asyncRoute } from "./routes/asyncRoute.ts";

const handleApiError: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof ApiError)
    return res.status(error.status).json(error.body);
  console.error(`[API] ${req.method} ${req.path} failed:`, error);
  res.status(500).json({ error: "Unable to complete this request." });
};

export async function createServer({
  enableBinaryMarkets = true,
  edge = false,
  onShutdown,
}: {
  enableBinaryMarkets?: boolean;
  edge?: boolean;
  onShutdown?: (stop: () => void) => void;
} = {}) {
  const app = express();
  app.locals.edge = edge;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required");
  }

  // Important for Vercel behind proxy
  app.set("trust proxy", 1);

  // Middleware
  app.use(
    cors({
      origin: new URL(FRONTEND_URL).origin,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded images statically (Legacy support)
  if (!edge) {
    const uploadsPath = path.resolve(process.cwd(), "public", "uploads");
    app.use("/uploads", express.static(uploadsPath));
  }

  // Cookie parsing (stateless auth)
  app.use(cookieParser(sessionSecret));

  // Initialize Passport
  initializePassport();
  app.use(passport.initialize());

  // API Router
  const apiRouter = express.Router();
  apiRouter.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // Basic API routes
  apiRouter.get("/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  apiRouter.get("/health", async (_req, res) => {
    try {
      await connectDB();
      res.json({
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({ status: "error", database: "disconnected" });
    }
  });

  apiRouter.get("/auth/google", handleGoogleAuth);
  apiRouter.get("/auth/google/callback", handleGoogleCallback);
  apiRouter.post("/auth/logout", handleLogout);
  apiRouter.use("/codex/agent", codexAgentRoutes);

  apiRouter.use(
    asyncRoute(async (req, _res, next) => {
      const userId = req.signedCookies?.userId;
      if (!isRecordId(userId)) return next();
      await withAccount(userId, async () => {
        req.user = await User.findById(userId);
        next();
      });
    }),
    requireAccount,
  );

  apiRouter.get("/user", handleGetUser);
  apiRouter.post("/user/onboarding", handleOnboarding);

  apiRouter.use(requireOnboardingComplete);
  apiRouter.use("/admin/codex", codexOwnerRoutes);
  apiRouter.patch("/user/username", handleUpdateUsername);
  apiRouter.use("/user/avatar", profileImageRoutes);
  apiRouter.post(
    "/user/starter-gift/acknowledge",
    handleAcknowledgeStarterGift,
  );
  apiRouter.post("/auth/clear-history", handleClearHistory);
  apiRouter.use("/", marketRoutes);

  apiRouter.use(
    "/binary-markets",
    await loadBinaryMarketRoutes(enableBinaryMarkets, edge, onShutdown),
  );

  apiRouter.use("/", adminRoutes);

  apiRouter.use((_req, res) => res.status(404).json({ error: "Not found" }));
  apiRouter.use(handleApiError);
  app.use("/mapi", apiRouter);

  return app;
}

async function loadBinaryMarketRoutes(
  enabled: boolean,
  edge: boolean,
  onShutdown?: (stop: () => void) => void,
) {
  if (enabled) {
    try {
      const { default: routes, startBinaryMarketServices } = await import(
        "./routes/binaryMarkets.ts"
      );
      if (!edge) {
        const stop = startBinaryMarketServices();
        onShutdown?.(stop);
      }
      return routes;
    } catch (err) {
      console.error("[BTC] Failed to initialize live market:", err);
    }
  }

  return express.Router().use((_req, res) => {
    res.status(503).json({
      error: enabled
        ? "Live BTC markets are temporarily unavailable."
        : "Live BTC markets are disabled on this server.",
    });
  });
}
