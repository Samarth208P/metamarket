import path from "node:path";
import express from "express";
import { createServer, connectDB } from "./index";

const port = process.env.PORT || 8080;

async function start() {
  await connectDB();
  const app = await createServer();
  
  const __dirname = import.meta.dirname;
  const distPath = path.join(__dirname, "../../dist");

  // Serve static files
  app.use(express.static(distPath));

  // Handle React Router - serve index.html for all non-API routes
  app.get(/^\/.*/, (req, res) => {
    if (req.path.startsWith("/mapi/")) {
      return res.status(404).json({ error: "API endpoint not found" });
    }
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(port, () => {
    console.log(`🚀 Metamarket standalone server running on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start standalone server:', error);
  process.exit(1);
});
