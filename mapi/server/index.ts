import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import mongoose from "mongoose";
import path from "path";
import { initializePassport } from "./routes/auth.js";
export { connectDB } from "./database.js";

import marketRoutes from "./routes/markets.js";
import {
  handleGoogleAuth,
  handleGoogleCallback,
  handleAuthSuccess,
  handleLogout,
  handleGetUser,
} from "./routes/auth.js";
import User from "./models/User.js";

export async function createServer() {
  const app = express();

  // Important for Vercel behind proxy
  app.set("trust proxy", 1);

  // Middleware
  app.use(
    cors({
      origin: true, // Allow all origins since using proxy
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded images statically (Legacy support)
  const uploadsPath = path.resolve(process.cwd(), "public", "uploads");
  app.use("/uploads", express.static(uploadsPath));

  // Cookie parsing (stateless auth)
  app.use(cookieParser(process.env.SESSION_SECRET || "metamarket-secret-key"));

  // Initialize Passport
  initializePassport();
  app.use(passport.initialize());

  // Middleware to populate req.user from signed cookie (stateless auth)
  app.use(async (req, _res, next) => {
    const userId = (req as any).signedCookies?.userId;
    if (userId && mongoose.isValidObjectId(userId)) {
      try {
        const user = await User.findById(userId);
        if (user) {
          (req as any).user = user;
        }
      } catch (err) {
        console.error("Auth middleware error:", err);
      }
    }
    next();
  });

  // API Router
  const apiRouter = express.Router();

  // Basic API routes
  apiRouter.get("/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  apiRouter.get("/health", async (_req, res) => {
    try {
      const dbState = mongoose.connection.readyState;
      const isConnected = dbState === 1;
      res.json({
        status: "ok",
        database: isConnected ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        database: "error",
        error: error.message,
      });
    }
  });

  // Market routes
  apiRouter.use("/", marketRoutes);

  // Auth routes
  apiRouter.get("/auth/google", handleGoogleAuth);
  apiRouter.get(
    "/auth/google/callback",
    handleGoogleCallback,
    handleAuthSuccess,
  );
  apiRouter.post("/auth/logout", handleLogout);
  apiRouter.get("/user", handleGetUser);

  // Mount API router
  app.use("/mapi", apiRouter);

  return app;
}
