import { createServer } from "../mapi/server/index";
import { connectDB } from "../mapi/server/database";
import serverless from "serverless-http";

let server: any;

export default async (req: any, res: any) => {
  if (!server) {
    try {
      await connectDB();
      const app = await createServer();
      server = serverless(app);
    } catch (error) {
      console.error("Vercel handler initialization error:", error);
      return res.status(500).json({ error: "Failed to initialize server" });
    }
  }
  return server(req, res);
};
