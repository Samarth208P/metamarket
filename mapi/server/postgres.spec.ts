import { createHmac } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  closeDB,
  connectDB,
  newId,
  query,
  withAccount,
  withSystem,
} from "./database.ts";
import { createServer } from "./index.ts";
import BinaryMarket from "./models/BinaryMarket.ts";
import User, { type IUser } from "./models/User.ts";
import * as feed from "./services/binanceFeed.ts";
import { runScheduledBtcCycle } from "./services/binaryScheduler.ts";
import { MAX_MARKET_IMAGE_BYTES } from "./services/marketImages.ts";

vi.mock("./routes/binaryMarkets.ts", async (importOriginal) => {
  const routes =
    await importOriginal<typeof import("./routes/binaryMarkets.ts")>();
  return { ...routes, startBinaryMarketServices: vi.fn() };
});

describe.skipIf(import.meta.env.MODE !== "db")(
  "local Supabase integration",
  () => {
    const fixture = newId();
    const secret = "metamarket-postgres-integration-test";
    const accounts: string[] = [];
    const markets: string[] = [];
    const btcMarkets: string[] = [];
    const marketImages: string[] = [];
    let server: ReturnType<Awaited<ReturnType<typeof createServer>>["listen"]>;
    let admin: IUser;
    let player: IUser;
    let other: IUser;

    async function addAccount(label: string, isAdmin = false) {
      const email = `metamarket-${label}-${fixture}@example.test`;
      const account = await User.signIn({
        googleId: email,
        email,
        name: label,
        isAdmin,
      });
      accounts.push(account.id);
      return account;
    }

    function session(id: string) {
      const signature = createHmac("sha256", secret)
        .update(id)
        .digest("base64")
        .replace(/=+$/, "");
      return `userId=${encodeURIComponent(`s:${id}.${signature}`)}`;
    }

    async function api(
      path: string,
      options: {
        account?: IUser;
        method?: "GET" | "POST" | "PUT" | "PATCH";
        body?: object;
        status?: number;
      } = {},
    ) {
      const { account, method = "GET", body, status = 200 } = options;
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/mapi${path}`, {
        method,
        headers: {
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...(account ? { cookie: session(account.id) } : {}),
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
      });
      const result = response.status === 204 ? null : await response.json();
      expect(response.status, `${method} ${path}: ${result?.error ?? ""}`).toBe(
        status,
      );
      return result;
    }

    function setup(account: IUser, username: string, status = 200) {
      return api("/user/onboarding", {
        account,
        method: "POST",
        body: { username, virtualFunds: true, playOnly: true },
        status,
      });
    }

    beforeAll(async () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("SESSION_SECRET", secret);
      vi.spyOn(feed.binanceFeed, "getLatestPrice").mockReturnValue(100000);
      vi.spyOn(feed.binanceFeed, "getRecentPrices").mockReturnValue([100000]);
      await connectDB();
      admin = await addAccount("admin", true);
      player = await addAccount("player");
      other = await addAccount("other");
      const app = await createServer();
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
    });

    afterAll(async () => {
      try {
        if (server)
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
        // This administrative connection is always to the dedicated local CLI database.
        if (!accounts.length) return;
        const cleanup = new Client({
          connectionString:
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        });
        await cleanup.connect();
        try {
          await cleanup.query("begin");
          await cleanup.query(
            "delete from metamarket.binary_markets where id = any($1::text[])",
            [btcMarkets],
          );
          await cleanup.query(
            "delete from metamarket.markets where id = any($1::text[])",
            [markets],
          );
          await cleanup.query(
            "delete from metamarket.accounts where id = any($1::text[])",
            [accounts],
          );
          await cleanup.query("commit");
        } finally {
          await cleanup.end();
        }
        if (marketImages.length) {
          const key = process.env.SUPABASE_DEV_STORAGE_KEY;
          const response = await fetch(
            "http://127.0.0.1:54321/storage/v1/object/market-images",
            {
              method: "DELETE",
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ prefixes: marketImages }),
            },
          );
          expect(response.ok).toBe(true);
        }
      } finally {
        await closeDB();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
      }
    });

    it("stores profiles, play-money gifts, trades, settlements, comments, and rankings", async () => {
      const username = `player_${fixture.slice(0, 10)}`;
      expect(await api("/user", { account: player })).toMatchObject({
        balance: 1000,
        username: null,
        starterGift: { amount: 1000 },
        needsOnboarding: true,
      });
      await api("/markets", { status: 401 });
      await api("/markets", { account: player, status: 403 });
      await setup(admin, `admin_${fixture.slice(0, 10)}`);
      const market = await api("/markets", {
        account: admin,
        method: "POST",
        status: 201,
        body: {
          title: "Postgres test market",
          description: "Temporary market",
          category: "General",
        },
      });
      markets.push(market.id);

      expect((await query("select id from metamarket.markets")).rows).toEqual(
        [],
      );
      const pending = await withAccount(player.id, () =>
        query("select id from metamarket.markets"),
      );
      expect(pending.rows).toEqual([]);

      expect(await setup(player, username)).toMatchObject({
        username,
        needsOnboarding: false,
      });
      await setup(other, username.toUpperCase(), 409);
      await setup(other, `other_${fixture.slice(0, 10)}`);
      await api("/user/starter-gift/acknowledge", {
        account: player,
        method: "POST",
        status: 204,
      });
      expect((await api("/user", { account: player })).starterGift).toBeNull();
      const visible = await withAccount(player.id, () =>
        query("select id from metamarket.accounts order by id"),
      );
      expect(visible.rows).toEqual([{ id: player.id }]);
      await expect(
        withAccount(player.id, () =>
          query("update metamarket.accounts set balance = 9999 where id = $1", [
            player.id,
          ]),
        ),
      ).rejects.toMatchObject({ code: "42501" });

      await api("/admin/list", { account: player, status: 403 });
      expect(
        (await api("/admin/list", { account: admin })).some(
          (row) => row.id === admin.id,
        ),
      ).toBe(true);
      expect(
        (await api("/markets", { account: player })).some(
          (row) => row.id === market.id,
        ),
      ).toBe(true);
      await api(`/markets/${market.id}/comments`, {
        account: player,
        method: "POST",
        status: 201,
        body: { content: "Example comment" },
      });
      expect(
        await api(`/markets/${market.id}/comments`, { account: other }),
      ).toMatchObject([{ userName: username, content: "Example comment" }]);
      await expect(
        withAccount(other.id, () =>
          query(
            "insert into metamarket.comments (id, market_id, user_id, user_name, content) values ($1, $2, $3, $4, $5)",
            [newId(), market.id, player.id, username, "Wrong owner"],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });

      const quote = await api(`/markets/${market.id}/quote`, {
        account: player,
        method: "POST",
        body: { optionId: "yes", type: "buy", amount: 100 },
      });
      const trade = await api(`/markets/${market.id}/trade`, {
        account: player,
        method: "POST",
        body: {
          optionId: "yes",
          type: "buy",
          amount: 100,
          expectedShares: quote.expectedShares,
          quotedAt: quote.quotedAt,
        },
      });
      expect(trade.user.balance).toBe(900);
      expect(trade.user.positions[0].shares).toBeGreaterThan(0);
      await api(`/markets/${market.id}/resolve`, {
        account: admin,
        method: "POST",
        body: { optionId: "yes" },
      });
      const portfolio = await api("/user", { account: player });
      expect(portfolio.positions).toEqual([]);
      expect(portfolio.tradeHistory.at(-1).tradeType).toBe("payout");
      expect(portfolio.balance).toBeGreaterThan(900);
      const ranks = await api("/leaderboard", { account: player });
      expect(
        ranks.some((row) => row.name === username && !("email" in row)),
      ).toBe(true);
      expect(
        (await api("/admin/solvency", { account: admin })).realReserves,
      ).toBe(0);
      await api("/auth/clear-history", { account: player, method: "POST" });
      expect((await api("/user", { account: player })).tradeHistory).toEqual(
        [],
      );
    }, 20000);

    it("validates and persists a username change for the signed-in account", async () => {
      const username = `renamed_${fixture.slice(0, 10)}`;
      const update = (username: string, status = 200) =>
        api("/user/username", {
          account: player,
          method: "PATCH",
          body: { username, isAdmin: true, id: admin.id },
          status,
        });

      await update("invalid name", 400);
      await update(`ADMIN_${fixture.slice(0, 10)}`, 409);
      expect(await update(` ${username} `)).toEqual({ username });
      expect(await api("/user", { account: player })).toMatchObject({
        username,
        isAdmin: false,
        needsOnboarding: false,
      });
      expect(await api("/user", { account: admin })).toMatchObject({
        username: `admin_${fixture.slice(0, 10)}`,
        isAdmin: true,
      });
    });

    it("stores market images in Supabase and restricts uploads to admins", async () => {
      await setup(admin, `admin_${fixture.slice(0, 10)}`);
      await setup(player, `player_${fixture.slice(0, 10)}`);

      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY7sAAAAASUVORK5CYII=",
        "base64",
      );
      const form = new FormData();
      form.append(
        "image",
        new Blob([png], { type: "image/png" }),
        "sample.png",
      );
      await api("/upload", { method: "POST", body: form, status: 401 });
      await api("/upload", {
        account: player,
        method: "POST",
        body: form,
        status: 403,
      });

      const invalid = new FormData();
      invalid.append(
        "image",
        new Blob(["not an image"], { type: "image/png" }),
        "sample.png",
      );
      await api("/upload", {
        account: admin,
        method: "POST",
        body: invalid,
        status: 415,
      });

      const oversized = new FormData();
      oversized.append(
        "image",
        new Blob([new Uint8Array(MAX_MARKET_IMAGE_BYTES + 1)], {
          type: "image/png",
        }),
        "sample.png",
      );
      await api("/upload", {
        account: admin,
        method: "POST",
        body: oversized,
        status: 413,
      });

      const { url } = await api("/upload", {
        account: admin,
        method: "POST",
        body: form,
      });
      expect(url).toMatch(
        /^http:\/\/127\.0\.0\.1:54321\/storage\/v1\/object\/public\/market-images\/[\w-]+\.png$/,
      );
      marketImages.push(new URL(url).pathname.split("/").pop());
      const image = await fetch(url);
      expect(image.headers.get("Content-Type")).toContain("image/png");
      expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
    }, 20000);

    it("stores BTC trades and cash-outs and limits trade visibility to the owner", async () => {
      await setup(player, `player_${fixture.slice(0, 10)}`);
      await setup(other, `other_${fixture.slice(0, 10)}`);
      const market = await BinaryMarket.openSlot({
        assetPair: `BTC_TEST_${fixture}`,
        startTime: new Date(Date.now() - 1000),
        endTime: new Date(Date.now() + 120000),
        targetPrice: 100000,
        priceSnapshots: [{ price: 100000, timestamp: new Date() }],
      });
      btcMarkets.push(market.id);
      const result = await api(`/binary-markets/${market.id}/trade`, {
        account: player,
        method: "POST",
        body: { side: "up", amount: 25 },
      });
      expect(result.market.trades).toHaveLength(1);
      expect(result.user.tradeHistory.at(-1).tradeType).toBe("buy");
      expect(
        (await api(`/binary-markets/${market.id}`, { account: other })).trades,
      ).toEqual([]);
      const otherTrades = await withAccount(other.id, () =>
        query(
          "select user_id from metamarket.binary_trades where market_id = $1",
          [market.id],
        ),
      );
      expect(otherTrades.rows).toEqual([]);
      const ownTrades = await withAccount(player.id, () =>
        query(
          "select user_id from metamarket.binary_trades where market_id = $1",
          [market.id],
        ),
      );
      expect(ownTrades.rows).toEqual([{ user_id: player.id }]);

      const cashOut = await api(`/binary-markets/${market.id}/sell`, {
        account: player,
        method: "POST",
        body: { side: "up" },
      });
      expect(cashOut.market.trades[0].sold).toBe(true);
      expect(cashOut.user.balance).toBeGreaterThan(result.user.balance);
    }, 20000);

    it("loads saved chart prices and outcomes across a round boundary", async () => {
      await setup(player, `player_${fixture.slice(0, 10)}`);
      const now = Date.now();
      const boundary = now - 80_000;
      const previous = await BinaryMarket.openSlot({
        assetPair: "BTCUSDT",
        targetPrice: 100000,
        startTime: new Date(boundary - 300_000),
        endTime: new Date(boundary),
        priceSnapshots: [
          { price: 100000, timestamp: new Date(boundary - 300_000) },
          { price: 100010, timestamp: new Date(boundary - 1_000) },
          { price: 100020, timestamp: new Date(boundary) },
        ],
      });
      btcMarkets.push(previous.id);
      await withSystem(() =>
        query(
          "update metamarket.binary_markets set status = 'settled_up' where id = $1",
          [previous.id],
        ),
      );
      const active = await BinaryMarket.openSlot({
        assetPair: "BTCUSDT",
        targetPrice: 100020,
        startTime: new Date(boundary),
        endTime: new Date(boundary + 300_000),
        priceSnapshots: [
          { price: 100020, timestamp: new Date(boundary) },
          { price: 100030, timestamp: new Date(boundary + 1_000) },
        ],
      });
      btcMarkets.push(active.id);

      await api("/binary-markets/price-history", { status: 401 });
      const prices = await api("/binary-markets/price-history", {
        account: player,
      });
      expect(
        prices.filter(({ timestamp }) =>
          [boundary - 1_000, boundary, boundary + 1_000].includes(timestamp),
        ),
      ).toEqual([
        { price: 100010, timestamp: boundary - 1_000 },
        { price: 100020, timestamp: boundary },
        { price: 100030, timestamp: boundary + 1_000 },
      ]);
      expect(
        prices.some(({ timestamp }) => timestamp === boundary - 300_000),
      ).toBe(false);

      const outcomes = await api("/binary-markets/history", {
        account: player,
      });
      expect(outcomes).toContainEqual(
        expect.objectContaining({
          id: previous.id,
          status: "settled_up",
          endTime: new Date(boundary).toISOString(),
        }),
      );
      expect(outcomes.some(({ id }) => id === active.id)).toBe(false);
    });

    it("appends scheduled prices once when jobs overlap", async () => {
      const start = Math.floor(Date.now() / 1000) * 1000;
      const market = await BinaryMarket.openSlot({
        assetPair: `BTC_SNAPSHOTS_${fixture}`,
        startTime: new Date(start),
        endTime: new Date(start + 300000),
        targetPrice: 100000,
        priceSnapshots: [{ price: 100000, timestamp: new Date(start) }],
      });
      btcMarkets.push(market.id);
      const batch = [
        { price: 100010, timestamp: new Date(start + 1000) },
        { price: 100020, timestamp: new Date(start + 2000) },
      ];
      await Promise.all([
        BinaryMarket.captureScheduledPrices(market.id, batch),
        BinaryMarket.captureScheduledPrices(market.id, batch),
      ]);
      await BinaryMarket.captureScheduledPrices(market.id, [
        batch[1],
        { price: 100030, timestamp: new Date(start + 3000) },
      ]);
      const stored = await withSystem(() => BinaryMarket.findById(market.id));
      expect(stored.priceSnapshots.map(({ price }) => price)).toEqual([
        100000, 100010, 100020, 100030,
      ]);
    });

    it("keeps the latest five final BTC outcomes as each round settles", async () => {
      const rollback = new Error("Roll back BTC retention fixtures");
      await expect(
        withSystem(async () => {
          const start = Date.now() + 3_600_000;
          const finished: string[] = [];
          for (let index = 0; index < 6; index++) {
            const market = await BinaryMarket.openSlot({
              assetPair: "BTCUSDT",
              targetPrice: 100000,
              startTime: new Date(start + index * 300_000),
              endTime: new Date(start + (index + 1) * 300_000),
              priceSnapshots: [],
            });
            finished.push(market.id);
            const status = index % 2 === 0 ? "settled_up" : "settled_down";
            await query(
              "update metamarket.binary_markets set status = $2 where id = $1",
              [market.id, status],
            );
          }
          await BinaryMarket.pruneHistory();
          const history = await BinaryMarket.listHistory();
          expect(history.map(({ id }) => id)).toEqual(
            finished.slice(1).reverse(),
          );
          expect(history.map(({ status }) => status)).toEqual([
            "settled_down",
            "settled_up",
            "settled_down",
            "settled_up",
            "settled_down",
          ]);
          expect(await BinaryMarket.findById(finished[0])).toBeNull();
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });

    it("credits an expired BTC round once when two scheduled jobs settle it", async () => {
      await setup(player, `player_${fixture.slice(0, 10)}`);
      const market = await BinaryMarket.openSlot({
        assetPair: `BTC_SETTLEMENT_${fixture}`,
        startTime: new Date(Date.now() - 180000),
        endTime: new Date(Date.now() + 120000),
        targetPrice: 100000,
        priceSnapshots: [],
      });
      btcMarkets.push(market.id);
      const purchase = await api(`/binary-markets/${market.id}/trade`, {
        account: player,
        method: "POST",
        body: { side: "up", amount: 20 },
      });

      await withSystem(() =>
        query(
          "update metamarket.binary_markets set end_time = now() - interval '5 seconds' where id = $1",
          [market.id],
        ),
      );
      const candidate = await withSystem(() =>
        BinaryMarket.findById(market.id),
      );
      const stubs = [
        vi
          .spyOn(feed, "fetchBinanceSecondPrices")
          .mockImplementation(async (start, end) =>
            start === candidate.startTime.getTime() &&
            end === candidate.endTime.getTime()
              ? [{ price: 101000, timestamp: candidate.endTime }]
              : [],
          ),
        vi.spyOn(BinaryMarket, "listExpired").mockResolvedValue([candidate]),
        vi.spyOn(BinaryMarket, "findActive").mockResolvedValue(market),
        vi.spyOn(BinaryMarket, "pruneHistory").mockResolvedValue(undefined),
      ];
      try {
        await Promise.all([runScheduledBtcCycle(), runScheduledBtcCycle()]);
      } finally {
        stubs.forEach((stub) => stub.mockRestore());
      }

      const settled = await api(`/binary-markets/${market.id}`, {
        account: player,
      });
      expect(settled.status).toBe("settled_up");
      expect(settled.priceSnapshots.map(({ price }) => price)).toEqual([
        100000, 101000,
      ]);
      const portfolio = await api("/user", { account: player });
      const payouts = portfolio.tradeHistory.filter(
        (entry) => entry.marketId === market.id && entry.tradeType === "payout",
      );
      expect(payouts).toHaveLength(1);
      expect(portfolio.balance).toBeCloseTo(
        purchase.user.balance + settled.trades[0].payout,
        2,
      );
    }, 20000);
  },
);
