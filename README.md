# MetaMarket

<p align="center">
  <img src="./public/animated-logo.gif" alt="MetaMarket animated logo" width="132">
</p>

<p align="center">
  <strong>Prediction markets for IIT Roorkee, powered by LMSR pricing, quote-based execution, and a modern full-stack architecture.</strong>
</p>

MetaMarket is a full-stack prediction market platform built for IIT Roorkee. It lets users explore and trade on future outcomes across binary, head-to-head, and multi-outcome markets, while giving admins the tooling to create markets, monitor solvency, upload assets, and resolve results.

## Overview

MetaMarket combines a React frontend with an Express API and shared market logic in TypeScript. Vite serves the local API, the Netlify development preview packages its own function, and the production frontend proxies API requests to Render.

At a product level, MetaMarket is built around a simple idea: market prices act as continuously updated probabilities, giving users a live view of collective conviction on future events.

## Key Features

- LMSR-based pricing engine for binary, versus, and multi-option markets
- Quote-based trading flow with expiring quotes and trade history tracking
- Dynamic liquidity support through configurable `b`, `minB`, and time-decay settings
- Google OAuth restricted to IIT Roorkee domains, with guest browsing support
- Portfolio, leaderboard, bookmarks, and market comments
- Admin dashboard for market creation, image uploads, resolution, and solvency controls
- Shared API types and pricing utilities used by both client and server

## Pricing Intuition

MetaMarket uses a logarithmic market scoring rule (LMSR) model for price discovery. In practice, that means prices update smoothly as users trade, while liquidity can be tuned with the parameter $b$.

Block cost function:

$$
C(\mathbf{q}) = b \log \left( \sum_{i=1}^{n} e^{q_i / b} \right)
$$

Outcome price:

$$
p_i = \frac{e^{q_i / b}}{\sum_{j=1}^{n} e^{q_j / b}}
$$

For markets with dynamic liquidity enabled, MetaMarket linearly decays the active liquidity parameter over time while respecting a floor:

$$
b_t = \max \left( b_{\min},\; b_0 \cdot \frac{T - t}{T - t_0} \right)
$$

Where:

- $q_i$ is the share state for outcome $i$
- $b$ controls how sensitive prices are to order flow
- $b_0$ is the initial liquidity parameter
- $b_{\min}$ is the minimum allowed liquidity floor
- $t_0$ is market creation time and $T$ is market expiry

## Market Types

- `binary`: Standard yes/no prediction markets
- `versus`: Head-to-head markets with custom option labels
- `multi`: Multi-outcome markets with multiple selectable options or teams

## Architecture

- `client/`: React application, route screens, UI components, and auth hooks
- `mapi/server/`: Express server, database models, auth handlers, and market routes
- `functions/`: Netlify serverless entrypoint for production deployment
- `shared/`: Shared TypeScript types and LMSR market logic
- `public/`: Static assets, icons, and web manifest files

## Tech Stack

- Frontend: React 18, Vite, Tailwind CSS, Radix UI, Framer Motion, TanStack Query
- Backend: Express, Passport Google OAuth, Mongoose, Multer, Cloudinary
- Shared logic: TypeScript, Zod, Vitest
- Deployment: Netlify Functions
- Data store: MongoDB

## Getting Started

### Prerequisites

- Node.js 22 or later
- pnpm 10 or later
- A MongoDB connection string
- Google OAuth credentials for the full sign-in flow, if you want to test IITR login locally
- Cloudinary credentials if you want admin image uploads

### Installation

```bash
pnpm install
```

### Local environment

Start MongoDB locally. The default URI is `mongodb://127.0.0.1:27017/metamarket_local`. To customize it or test integrations, copy `.env.local.example` to `.env.local` and use the `LOCAL_*` variables. Sign-in uses a separate Google OAuth client and callback at `http://localhost:8080/mapi/auth/google/callback`. Use a separate Cloudinary account for local uploads. Generic production credentials in `.env` do not configure the local API.

### Run the App

```bash
pnpm dev
```

The application starts on `http://localhost:8080`.

During development:

- Vite serves the frontend
- The Express API is mounted at `/mapi`
- Uploads are served from `/uploads`
- Live BTC routes, price feeds, and settlement are disabled

No separate API process is needed for local work. `pnpm start:api` is the production Render entrypoint and starts the BTC worker.

## Available Scripts

| Command           | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `pnpm dev`        | Start the Vite development server with the embedded Express API |
| `pnpm build`      | Build the production frontend bundle                            |
| `pnpm test`       | Run Vitest test suites                                          |
| `pnpm typecheck`  | Run TypeScript type-checking                                    |
| `pnpm format.fix` | Format the repository with Prettier                             |

## Authentication and Access

- Google sign-in is restricted to `@iitr.ac.in` and `@mt.iitr.ac.in` email domains
- Guest mode is available for browsing, but trading is disabled
- Admin access is controlled by an allowlist in `mapi/server/routes/auth.ts`

## Deployment

| Environment | Trigger | API and data |
| --- | --- | --- |
| Local | Save changes while `pnpm dev` runs | Express on your machine and `metamarket_local` on loopback MongoDB |
| Development | Push a commit to the GitHub `develop` branch | Netlify branch deploy and preview function backed by `metamarket_preview` |
| Production | Push or merge an approved release to `main` | `metamarket.live` and the live API on Render |

After Netlify enables branch deploys for `develop`, each push updates [the development site](https://develop--mytamarket.netlify.app). Netlify builds the frontend and preview API from the same commit. The preview function reads only `PREVIEW_*` settings, and only the production build for `main` emits the Render API rewrite. Local saves appear immediately in Vite and stay on your machine until you push.

Set `PREVIEW_MONGODB_URI` and `PREVIEW_SESSION_SECRET` for the **branch-deploy** context, scoped to Functions where available. Use a separate MongoDB cluster and a database user limited to `metamarket_preview`. Until those are set, `/mapi/ping` identifies the preview and data endpoints return `503`. For preview sign-in, use `PREVIEW_GOOGLE_CLIENT_ID` and `PREVIEW_GOOGLE_CLIENT_SECRET` with callback `https://develop--mytamarket.netlify.app/mapi/auth/google/callback`. Uploads use `PREVIEW_CLOUDINARY_CLOUD_NAME`, `PREVIEW_CLOUDINARY_API_KEY`, and `PREVIEW_CLOUDINARY_API_SECRET` from a separate account. The preview contains no BTC scheduler or scheduled Netlify function.

## Repository Notes

- Shared domain contracts live in `shared/api.ts`
- LMSR pricing and quoting logic lives in `shared/lmsr.ts`
- Core market routes are implemented in `mapi/server/routes/markets.ts`
- The Netlify entrypoint is `functions/index.ts`

## License

This repository is private and proprietary.
