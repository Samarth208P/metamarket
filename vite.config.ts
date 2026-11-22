import { parse } from "dotenv";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { configureIsolatedEnvironment } from "./mapi/server/isolatedEnvironment";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "localhost",
    port: 8080,
    strictPort: true,
    fs: {
      allow: ["."],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "mapi/server/**"],
    },
  },
  build: {
    outDir: "dist",
  },
  plugins: [react(), ...(mode === "test" ? [] : [expressPlugin()])],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    async configureServer(server) {
      // Connect to DB and initialize the Express app
      try {
        const values = existsSync(".env.local")
          ? parse(readFileSync(".env.local"))
          : {};
        configureIsolatedEnvironment(
          "LOCAL",
          { ...values, ...process.env },
          "http://localhost:8080",
        );
        const { connectDB } = await import("./mapi/server/database");
        await connectDB({ directConnection: true, serverSelectionTimeoutMS: 5_000 });
        const { createServer } = await import("./mapi/server");
        const app = await createServer({ enableBinaryMarkets: false });
        // Add Express app as middleware to Vite dev server, but only for API/Uploads
        server.middlewares.use((req: any, res: any, next: any) => {
          if (req.url?.startsWith("/mapi") || req.url?.startsWith("/uploads")) {
            app(req, res, next);
          } else {
            next();
          }
        });
      } catch (error) {
        console.error("Failed to initialize server:", error);
        server.middlewares.use("/mapi", (_req, res) => {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "The local development API could not start." }));
        });
      }
    },
  };
}
