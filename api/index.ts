// @ts-ignore
import { createServer, connectDB } from "../dist-server/index.mjs";
import serverless from "serverless-http";

let server: any;

export default async (req: any, res: any) => {
  console.log(`[Vercel] Handling request: ${req.method} ${req.url}`);
  
  if (!server) {
    try {
      console.log("[Vercel] Initializing Express server...");
      await connectDB();
      const app = await createServer();
      server = serverless(app);
      console.log("[Vercel] Express server initialized.");
    } catch (error) {
      console.error("[Vercel] Initialization error:", error);
      return res.status(500).json({ 
        error: "Failed to initialize server",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return server(req, res);
};
