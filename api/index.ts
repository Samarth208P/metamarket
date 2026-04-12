import { createServer } from "../mapi/server/index.js";
import { connectDB } from "../mapi/server/database.js";
import serverless from "serverless-http";

let handlerPromise: Promise<any> | null = null;

const initialize = async () => {
  console.log(`[Vercel] [${new Date().toISOString()}] Starting initialization...`);
  
  // Timeout for MongoDB connection to avoid hanging in serverless
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('MongoDB connection timed out (Atlas IP whitelist?)')), 8000)
  );

  try {
    await Promise.race([connectDB(), timeout]);
    console.log(`[Vercel] [${new Date().toISOString()}] DB Connected. Creating Express app...`);
    const app = await createServer();
    console.log(`[Vercel] [${new Date().toISOString()}] Server ready.`);
    return serverless(app);
  } catch (error) {
    console.error("[Vercel] Initialization failed:", error);
    handlerPromise = null; // Allow retry on next request
    throw error;
  }
};

export default async (req: any, res: any) => {
  // DIAGNOSTIC BYPASS: If we hit /mapi/ping, respond immediately
  if (req.url.includes('/ping')) {
    return res.status(200).json({ 
       status: "ok", 
       message: "Vercel successfully reached the serverless function",
       time: new Date().toISOString()
    });
  }

  try {
    if (!handlerPromise) {
      handlerPromise = initialize();
    }
    const handler = await handlerPromise;
    return handler(req, res);
  } catch (error: any) {
    res.status(500).json({ 
      error: "Server initialization failed", 
      message: error.message
    });
  }
};
