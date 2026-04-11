import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import mongoose from "mongoose";
import path from "path";
import MongoStore from 'connect-mongo';
import { connectDB } from "./database";
import { initializePassport } from "./routes/auth";

import marketRoutes from "./routes/markets";
import {
  handleGoogleAuth,
  handleGoogleCallback,
  handleAuthSuccess,
  handleLogout,
  handleGetUser
} from "./routes/auth";
import User from "./models/User";

export async function createServer() {
  await connectDB();

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
  app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

  // Session configuration
  app.use(session({
    secret: process.env.SESSION_SECRET || 'metamarket-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/metamarket',
      ttl: 14 * 24 * 60 * 60, // 14 days
      autoRemove: 'native'
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production', 
      httpOnly: true,
      maxAge: 14 * 24 * 60 * 60 * 1000 
    }
  }));

  // Initialize Passport (but not passport.session())
  initializePassport();
  app.use(passport.initialize());

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/health", async (_req, res) => {
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


  app.use("/api", marketRoutes);

  // Auth routes
  app.get('/auth/google', handleGoogleAuth);
  app.get('/auth/google/callback', handleGoogleCallback, handleAuthSuccess);
  app.post('/auth/logout', handleLogout);
  app.get('/api/user', handleGetUser);
  app.post('/api/user/bookmarks', async (req, res) => {
    if (!req.session || !(req.session as any).userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { marketId } = req.body;
    if (!marketId) {
      return res.status(400).json({ error: "Market ID required" });
    }
    try {
      const user = await User.findById((req.session as any).userId);
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
