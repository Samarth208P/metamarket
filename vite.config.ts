import "dotenv/config";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: ["."],
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "mapi/server/**",
        "supabase/**",
      ],
    },
  },
  build: {
    outDir: "dist",
  },
  plugins: [
    react(),
    ...(["test", "db"].includes(mode) ? [] : [expressPlugin()]),
  ],
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
      const { connectDB, createServer } = await import("./mapi/server");
      await connectDB();
      if (server.httpServer) {
        const { attachRamayanaSocket } = await import(
          "./mapi/server/services/ramayanaNodeSocket.ts"
        );
        attachRamayanaSocket(server.httpServer);
      }
      const app = await createServer({
        onShutdown: (stop) => server.httpServer?.once("close", stop),
      });
      server.middlewares.use((req, res, next) => {
        if (/^\/(mapi|uploads)(?:[/?]|$)/i.test(req.url ?? "")) {
          app(req, res);
        } else {
          next();
        }
      });
    },
  };
}
