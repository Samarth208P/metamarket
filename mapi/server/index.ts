import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import mongoose from "mongoose";
import path from "path";
import { initializePassport } from "./routes/auth.ts";
export { connectDB } from "./database.ts";

import marketRoutes from "./routes/markets.ts";
import {
  handleGoogleAuth,
  handleGoogleCallback,
  handleAuthSuccess,
  handleLogout,
  handleGetUser
} from "./routes/auth.ts";
import User from "./models/User.ts";

export async function createServer() {

  const app = express();
  
  // Important for Vercel behind proxy
  app.set("trust proxy", 1);

  // Middleware
  app.use(cors({
    origin: true, // Allow all origins since using proxy
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded images statically
  // Serve uploaded images statically
  const uploadsPath = path.resolve(process.cwd(), "public", "uploads");
  app.use("/uploads", express.static(uploadsPath));

  // Cooking parsing (replaces sessions for serverless stability)
  app.use(cookieParser(process.env.SESSION_SECRET || 'metamarket-secret-key'));

  // Initialize Passport (but not passport.session())
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

  // Example API routes
  app.get("/mapi/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/mapi/health", async (_req, res) => {
    try {
      // Check MongoDB connection
      const dbState = mongoose.connection.readyState;
      const isConnected = dbState === 1; // 1 = connected

      res.json({
        status: 'ok',
        database: isConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        database: 'error',
        error: error.message
      });
    }
  });


  app.use("/mapi", marketRoutes);

  // Auth routes
  app.get('/mapi/auth/google', handleGoogleAuth);
  app.get('/mapi/auth/google/callback', handleGoogleCallback, handleAuthSuccess);
  app.post('/mapi/auth/logout', handleLogout);
  app.get('/mapi/user', handleGetUser);
  app.post('/mapi/user/bookmarks', async (req, res) => {
    const userId = req.signedCookies?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { marketId } = req.body;
    if (!marketId) {
      return res.status(400).json({ error: "Market ID required" });
    }
    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      if (!user.bookmarks) {
        user.bookmarks = [];
      }
      
      const index = user.bookmarks.indexOf(marketId);
      if (index > -1) {
        user.bookmarks.splice(index, 1);
      } else {
        user.bookmarks.push(marketId);
      }
      await user.save();
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return app;
}
