import path from "node:path";
import { createServer } from "./index.ts";
import * as express from "express";

const port = process.env.PORT || 8080;

import { connectDB } from "./database.ts";

// Create server asynchronously
async function start() {
  await connectDB();
  const app = await createServer();
  // In production, serve the built SPA files
  const __dirname = import.meta.dirname;
  const distPath = path.join(__dirname, "../../dist");

  // Serve static files
  app.use(express.static(distPath));

  // Handle React Router - serve index.html for all non-API routes
  app.get(/^\/.*/, (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith("/mapi/")) {
      return res.status(404).json({ error: "API endpoint not found" });
    }

    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(port, () => {
    console.log(`🚀 Metamarket server running on port ${port}`);
    console.log(`📱 Frontend: http://localhost:${port}`);
    console.log(`🔧 API: http://localhost:${port}/mapi`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
