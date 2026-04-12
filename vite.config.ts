import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createServer } from "./mapi/server";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/mapi': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
    fs: {
      allow: ["./client", "./shared", "index.html"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "mapi/server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
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
        const { connectDB } = await import("./mapi/server/database");
        await connectDB();
        const app = await createServer();
        // Add Express app as middleware to Vite dev server
        server.middlewares.use(app);
      } catch (error) {
        console.error('Failed to initialize server:', error);
      }
    },
  };
}
