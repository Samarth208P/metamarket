import { defineConfig } from "vite";
import path from "node:path";

// Server build configuration
export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, "mapi/server/index.ts"),
        standalone: path.resolve(__dirname, "mapi/server/standalone.ts")
      },
      formats: ["es"],
    },
    outDir: "dist-server",
    target: "node22",
    ssr: true,
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
      },
      external: [
        // Node.js built-ins
        "fs",
        "path",
        "url",
        "http",
        "https",
        "os",
        "crypto",
        "stream",
        "util",
        "events",
        "buffer",
        "querystring",
        "child_process",
        // External dependencies that should not be bundled
        "express",
        "cors",
        "mongoose",
        "passport",
        "passport-google-oauth20",
        "cookie-parser",
        "dotenv",
        "serverless-http",
        "multer",
        "multer-storage-cloudinary",
        "cloudinary"
      ],
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
