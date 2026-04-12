import { createServer } from "../mapi/server/index.js";
import { connectDB } from "../mapi/server/database.js";
import serverless from "serverless-http";

let handlerPromise: Promise<any> | null = null;

const initialize = async () => {
  console.log(`[Vercel] [${new Date().toISOString()}] Starting initialization...`);
  try {
    await connectDB();
    console.log(`[Vercel] [${new Date().toISOString()}] DB Connected. Creating Express app...`);
    const app = await createServer();
    console.log(`[Vercel] [${new Date().toISOString()}] Server ready.`);
    return serverless(app);
  } catch (error) {
    console.error("[Vercel] Initialization failed:", error);
    handlerPromise = null; 
    throw error;
  }
};

export default async (req: any, res: any) => {
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
