# MetaMarket

<p align="center">
  <img src="./public/animated-logo.gif" alt="MetaMarket animated logo" width="132">
</p>

<p align="center">
  <strong>Play-money prediction markets with LMSR pricing and quote-based trading.</strong>
</p>

MetaMarket started at IIT Roorkee and is open to anyone with a Google account. It lets users explore and trade on future outcomes across binary, head-to-head, and multi-outcome markets, while giving admins the tools to create markets, upload assets, and resolve results.

## Overview

MetaMarket combines a React frontend with an Express API and shared market logic in TypeScript. In local development, Vite mounts the API as middleware. In production, Netlify serves the frontend and forwards `/mapi/*` requests to the `mapi` Supabase Edge Function.

At a product level, MetaMarket is built around a simple idea: market prices act as continuously updated probabilities, giving users a live view of collective conviction on future events.

## Key Features

- LMSR-based pricing engine for binary, versus, and multi-option markets
- Quote-based trading flow with expiring quotes and trade history tracking
- Dynamic liquidity support through configurable `b`, `minB`, and time-decay settings
- Google sign-in for verified Google accounts, with required username setup and play terms
- Portfolio, leaderboard, bookmarks, and market comments
- Admin dashboard for market creation, image uploads, and resolution
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

Read [MetaMarket architecture](ARCHITECTURE.md) for the development and production setup, Google sign-in flow, database policies, and deployment status.

- `client/`: React application, route screens, UI components, and auth hooks
- `mapi/server/`: Express server, database models, auth handlers, and market routes
- `supabase/functions/`: Edge Functions for the Express API and BTC scheduler
- `shared/`: Shared TypeScript types and LMSR market logic
- `public/`: Static assets, icons, and web manifest files

The React app calls `/mapi` to load markets, comments, the leaderboard, and the signed-in user. For LMSR trades, the client requests a quote, then submits that quote to execute the trade. Express validates the trade and records the result in Postgres. Admins create and resolve those markets through the admin dashboard.

Supabase Cron invokes the `btc-cycle` Edge Function every ten seconds. It uses closed Binance candles to open and settle five-minute rounds, backfills one-second price history, and credits winners in a Postgres transaction. The local Vite API runs its own worker. The BTC page streams Binance chart ticks and polls the API for odds, positions, and results.

The Ramayana market reads the worldwide total from Sacnilk’s “Overseas and worldwide” section once a minute while the market is open in a browser. The daily chart uses Sacnilk’s per-day worldwide entries. The authenticated box-office API returns the initial report and a short-lived WebSocket URL. Local clients connect to the API server, and hosted clients connect directly to the `ramayana-feed` Edge Function. The browser fetches a fresh report when reconnecting.

### Market isolation

Each regular market has its own ID, options, prices, positions, and result. Yes/no, head-to-head, and multi-outcome markets share the LMSR engine. The BTC market uses its own routes, pricing engine, and round data. The frontend loads the BTC and regular detail pages separately. If a card or detail page fails to render, the rest of the app stays available. The catalog logs and skips unreadable records, and a BTC initialization failure returns `503` for BTC routes while the regular API keeps serving requests.

The scheduler locks each expired round while it settles the round and credits the winning wallets. Overlapping scheduler runs skip rounds that have already settled.

## Tech Stack

- Frontend: React 18, Vite, Tailwind CSS, Radix UI, Framer Motion, TanStack Query
- Backend: Express, Passport Google OAuth, node-postgres, Multer
- Shared logic: TypeScript, Vitest
- Deployment: Netlify frontend, Supabase Edge Functions and Cron
- Data and media: Supabase Postgres and Storage

## Getting Started

### Prerequisites

- Node.js 22 or later
- pnpm 10 or later
- Docker running locally for Supabase Postgres and Storage
- Google OAuth credentials for testing the full sign-in flow locally

### Installation

```bash
pnpm install
```

### Environment Variables

Copy `.env.development.example` to `.env` for local development. Use `.env.production.example` as the template for Supabase Edge Function Secrets.

| Variable                                       | Required    | Purpose                                                                                                  |
| ---------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `SUPABASE_DEV_DATABASE_URL`                    | Local       | Dedicated runtime role on the local Supabase CLI database. Copy the value in `.env.development.example`. |
| `METAMARKET_DATABASE_URL`                      | Production  | Supavisor transaction pooler URI for `metamarket_backend` with `sslmode=verify-full`.                    |
| `SESSION_SECRET`                               | Yes         | Secret used to sign the auth cookie.                                                                     |
| `GOOGLE_CLIENT_ID`                             | Recommended | Google OAuth client ID for Google sign-in.                                                               |
| `GOOGLE_CLIENT_SECRET`                         | Recommended | Google OAuth client secret.                                                                              |
| `GOOGLE_CALLBACK_URL`                          | Recommended | OAuth callback URL. For local development, use `http://localhost:8080/mapi/auth/google/callback`.        |
| `SUPABASE_DEV_URL`, `SUPABASE_DEV_STORAGE_KEY` | Local       | Storage URL and service key. `pnpm db:start` writes them to `.env`.                                      |
| `METAMARKET_STORAGE_KEY`                       | Production  | Server-side Storage key for admin image uploads. Supabase supplies `SUPABASE_URL`.                       |
| `METAMARKET_CRON_TOKEN`                        | Production  | Matches the `metamarket_cron_token` entry in Supabase Vault.                                             |

### Run the App

```bash
pnpm db:start
pnpm dev
```

The application starts on `http://localhost:8080`.

During development:

- Vite serves the frontend
- The local Express API is mounted at `/mapi` and uses the Docker database on port 54322
- Market artwork uploaded via `/mapi/upload` is served by local Supabase Storage on port 54321
- `/btc` uses the local BTC worker and writes rounds and payouts to the Docker database.

Use `pnpm dev` for local work. `pnpm start:api` runs the standalone API. Both require `SESSION_SECRET` and a reachable database.

## Available Scripts

| Command           | Description                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev`        | Start the Vite development server with the embedded Express API                     |
| `pnpm build`      | Build the production frontend bundle                                                |
| `pnpm test`       | Run Vitest test suites                                                              |
| `pnpm test:db`    | Test the API against local Supabase Postgres and Storage, then remove test fixtures |
| `pnpm typecheck`  | Run TypeScript type-checking                                                        |
| `pnpm format.fix` | Format the repository with Prettier                                                 |

## Authentication and Access

- Any verified Google account can sign in, including personal Gmail accounts.
- Market, portfolio, leaderboard, and admin access require a unique username and acceptance of both play terms. Existing accounts complete these steps on their next visit if needed.
- New accounts receive ₹1,000 in simulated funds once. The starter gift notice remains visible until dismissed. Signing in again in the same environment preserves the account’s balance and trade history.
- `GET /mapi/user` returns the signed-in account, including setup status, balance, positions, history, and any unread starter gift. `POST /mapi/user/onboarding` saves the username and terms, and `POST /mapi/user/starter-gift/acknowledge` dismisses the notice.
- Game API requests return `401` without an account and `403` with `ONBOARDING_REQUIRED` until setup is complete.
- Account Settings lets signed-in players change their public username. The Google account email is displayed for reference.
- Admin access is stored on the account. Initial access is granted to verified `samarth208p@gmail.com` and the allowlisted Google Workspace accounts. A migration grants access if the Gmail account already exists.

## Supabase environments

Development uses Docker for Postgres and Storage. `pnpm db:start` applies the migrations and writes the local connection settings to `.env`. The API accepts only loopback database and Storage addresses in development.

Production uses the linked Supabase project. Review `pnpm exec supabase db push --remote --dry-run` before applying database migrations there. The hosted API uses the dedicated `metamarket_backend` role. It connects through Supavisor with `sslmode=verify-full`.

Express continues to authenticate through Google and sets the verified account ID for each player database transaction. RLS limits players to their own account and BTC trades and gates market data on profile completion. The server uses a separate database role for wallet, trade, settlement, and admin operations. The application schema grants no access to the Supabase Data API roles.

The `market-images` bucket serves market artwork at public URLs. Express verifies admin access before uploading JPEG, PNG, or WebP files up to 5 MiB. Storage policies prevent direct writes by browser roles. The hosted Storage key is stored in Supabase Edge Function Secrets.

## Deployment

A push to GitHub `main` triggers the Netlify frontend build. Netlify serves `dist` and proxies `/mapi/*` to the project's `mapi` Edge Function. When Edge Function code changes, deploy it from the same revision with `pnpm exec supabase functions deploy mapi btc-cycle ramayana-feed` before pushing the frontend.

For public Google sign-in, set the OAuth project audience to **External** and publish the app to **In production**. In **Google Auth Platform → Clients**, register the exact callback URI used by `GOOGLE_CALLBACK_URL`. For the main site, use `https://metamarket.live/mapi/auth/google/callback` and set `FRONTEND_URL` to `https://metamarket.live`. Configure a persistent `SESSION_SECRET` on the API host. [Google OAuth audience settings](https://support.google.com/cloud/answer/15549945?hl=en) · [Google redirect URI configuration](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)

The `metamarket-btc-cycle` Cron job reads `metamarket_edge_url` and `metamarket_cron_token` from Vault. The Edge Function checks the token before it runs the cycle.

## Repository Notes

- Shared domain contracts live in `shared/api.ts`
- LMSR pricing and quoting logic lives in `shared/lmsr.ts`
- Core market routes are implemented in `mapi/server/routes/markets.ts`
- The live BTC worker is `mapi/server/services/binaryScheduler.ts`

## License

This repository is private and proprietary.
