# Use node 22 slim as the base image
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Install all dependencies including devDependencies for build
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Enforce production build
RUN pnpm run build

# Production runner stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Stage only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
# Based on vite.config.server.ts and package.json:
# Client build goes to dist/
# Server build goes to dist/server/node-build.mjs
COPY --from=builder /app/dist ./dist

# The server expects public files and index.html in specific locations relative to dist/server
# According to node-build.ts: const distPath = path.join(__dirname, "..");
# So if node-build.mjs is in dist/server/, distPath is dist/
# Static files are served from distPath

EXPOSE 8080

CMD ["node", "dist/server/node-build.mjs"]
