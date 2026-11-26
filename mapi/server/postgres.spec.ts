import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES } from "../../shared/api.ts";
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
import { runScheduledBinaryCycle } from "./services/binaryScheduler.ts";

const samplePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY7sAAAAASUVORK5CYII=",
  "base64",
);

function imageForm(blob = new Blob([samplePng], { type: "image/png" })) {
  const form = new FormData();
  form.append("image", blob, "sample.png");
  return form;
}

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
    const binaryMarkets: string[] = [];
    const proposals: string[] = [];
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
        agentToken?: string;
        method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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
          ...(options.agentToken
            ? { authorization: "Bearer " + options.agentToken }
            : {}),
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
      vi.spyOn(feed.binanceFeeds.BTCUSDT, "getLatestPrice").mockReturnValue(
        100000,
      );
      vi.spyOn(feed.binanceFeeds.BTCUSDT, "getRecentPrices").mockReturnValue([
        100000,
      ]);
      vi.spyOn(feed.binanceFeeds.ETHUSDT, "getLatestPrice").mockReturnValue(
        3000,
      );
      vi.spyOn(feed.binanceFeeds.ETHUSDT, "getRecentPrices").mockReturnValue([
        3000,
      ]);
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
        const cleanupUrl = new URL(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        );
        const localBackend =
          process.env.SUPABASE_DEV_DATABASE_URL ||
          process.env.METAMARKET_DEV_DATABASE_URL;
        if (localBackend) cleanupUrl.pathname = new URL(localBackend).pathname;
        const cleanup = new Client({ connectionString: cleanupUrl.href });
        await cleanup.connect();
        try {
          await cleanup.query("begin");
          await cleanup.query(
            "delete from metamarket.codex_market_reviews where id = any($1::uuid[])",
            [proposals],
          );
          await cleanup.query(
            "delete from metamarket.binary_markets where id = any($1::text[])",
            [binaryMarkets],
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
      const nextMarket = await api("/markets", {
        account: admin, method: "POST", status: 201,
        body: {title: "Open while another market has positions", description: "Integration fixture", category: "General"},
      });
      markets.push(nextMarket.id);
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
      await api("/admin/solvency", { account: admin, status: 404 });
      await api("/auth/clear-history", { account: player, method: "POST" });
      expect((await api("/user", { account: player })).tradeHistory).toEqual(
        [],
      );
    }, 20000);

    it("publishes and settles a versioned Codex proposal only after owner approval", async () => {
      const owner = await addAccount("codex-owner", true);
      await setup(owner, "owner_" + fixture.slice(0, 10));
      const agentToken = "integration-submitter";
      vi.stubEnv("METAMARKET_REVIEW_OWNER_EMAIL", owner.email);
      vi.stubEnv("METAMARKET_CODEX_TOKEN", agentToken);
      const id = randomUUID();
      proposals.push(id);
      const drafts = "/codex/agent/drafts/" + id;
      const reports = "/codex/agent/evidence/" + id;
      const review = "/admin/codex/" + id;
      const cutoff = Date.now() - 1000;
      const endDate = new Date(cutoff).toISOString();
      const title = "Which fixture has more concurrent viewers at the cutoff?";
      const draft = {
        title,
        category: "Entertainment",
        endDate,
        marketType: "versus",
        outcomes: ["A", "B"],
        sourceName: "Fixture archive",
        sourceUrl: "https://example.org/history",
        archiveExampleUrl: "https://example.org/past",
        logoUrl: "https://example.org/image.png",
        storyUrl: "https://example.org/story",
        whyNow: "Two launches are competing.",
        whyUnsettled: "Audiences can join and leave until the cutoff.",
        rule: {
          kind: "ranking",
          metric: "Concurrent viewers",
          unit: "viewers",
          wins: "highest",
        },
        initialB: 1000,
        minB: 100,
        isDynamic: false,
      };
      const decision = (
        kind: string,
        revision: number,
        action = "approve",
        status = 200,
        account = owner,
      ) =>
        api(review + "/" + action, {
          method: "POST",
          account,
          body: { kind, revision },
          status,
        });
      let marketId: string;
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(cutoff - 60000);
        await api(drafts, {
          method: "PUT",
          account: owner,
          body: { revision: 0, draft },
          status: 401,
        });
        const create = () =>
          api(drafts, {
            method: "PUT",
            agentToken,
            body: { revision: 0, draft },
          });
        expect((await create()).revision).toBe(1);
        expect((await create()).revision).toBe(1);
        expect(
          (await api("/markets", { account: owner })).some(
            (m) => m.title === title,
          ),
        ).toBe(false);
        await api(review + "/approve", {
          method: "POST",
          agentToken,
          body: { kind: "draft", revision: 1 },
          status: 401,
        });
        await decision("draft", 1, "approve", 403, admin);
        await decision("draft", 1, "dismiss");
        const revisedDraft = { ...draft, initialB: 1250 };
        const revised = await api(drafts, {
          method: "PUT",
          agentToken,
          body: { revision: 1, draft: revisedDraft },
        });
        expect(revised.revision).toBe(2);
        await decision("draft", 1, "approve", 409);
        const [published, retry] = await Promise.all([
          decision("draft", 2),
          decision("draft", 2),
        ]);
        marketId = published.marketId;
        markets.push(marketId);
        expect(retry.marketId).toBe(marketId);
        const listed = (await api("/markets", { account: owner })).filter(
          (m) => m.title === title,
        );
        expect(listed).toHaveLength(1);
        expect(listed[0]).toMatchObject({
          id: marketId,
          codexSourceUrl: draft.sourceUrl,
          initialB: 1250,
        });
        await api("/markets/" + marketId, {
          method: "PUT",
          account: owner,
          body: { endDate: null },
          status: 409,
        });
        await api("/markets/" + marketId + "/resolve", {
          method: "POST",
          account: owner,
          body: { optionId: "no" },
          status: 409,
        });
        await api(reports, {
          method: "PUT",
          agentToken,
          body: {
            revision: 2,
            evidence: { status: "missing", note: "Too early" },
          },
          status: 400,
        });
        const quote = await api("/markets/" + marketId + "/quote", {
          account: owner,
          method: "POST",
          body: { optionId: "no", type: "buy", amount: 50 },
        });
        await api("/markets/" + marketId + "/trade", {
          account: owner,
          method: "POST",
          body: {
            optionId: "no",
            type: "buy",
            amount: 50,
            quotedAt: quote.quotedAt,
            minShares: quote.minShares,
          },
        });
      } finally {
        vi.useRealTimers();
      }
      expect(
        (await api("/codex/agent/expired", { agentToken })).map((x) => x.id),
      ).toContain(id);
      expect((await api("/admin/codex", { account: admin })).enabled).toBe(
        false,
      );
      await api(reports, {
        method: "PUT",
        agentToken,
        body: {
          revision: 2,
          evidence: { status: "missing", note: "Archive has a gap" },
        },
      });
      expect(
        (await api("/admin/codex", { account: owner })).reviews.find(
          (x) => x.id === id,
        ).phase,
      ).toBe("awaiting_evidence");
      await decision("resolution", 3, "approve", 409);
      const evidence = {
        status: "observed",
        observedAt: endDate,
        readings: [5, 7],
        note: "B had seven viewers at the cutoff.",
        evidenceUrl: "https://example.org/cutoff",
      };
      await api(reports, {
        method: "PUT",
        agentToken,
        body: {
          revision: 3,
          evidence: {
            ...evidence,
            observedAt: new Date(cutoff - 1000).toISOString(),
          },
        },
        status: 400,
      });
      await api(reports, {
        method: "PUT",
        agentToken,
        body: {
          revision: 3,
          evidence: {
            ...evidence,
            evidenceUrl: "https://other.example/cutoff",
          },
        },
        status: 400,
      });
      await api(reports, {
        method: "PUT",
        agentToken,
        body: { revision: 3, evidence },
      });
      await decision("resolution", 4, "dismiss");
      await decision("resolution", 4, "approve", 409);
      expect(
        (await api("/codex/agent/expired", { agentToken })).some(
          (x) => x.id === id,
        ),
      ).toBe(true);
      await api(reports, {
        method: "PUT",
        agentToken,
        body: { revision: 4, evidence },
      });
      await decision("resolution", 4, "approve", 409);
      await Promise.all([decision("resolution", 5), decision("resolution", 5)]);
      expect(
        await api("/markets/" + marketId, { account: owner }),
      ).toMatchObject({ status: "resolved_no", resolvedOptionId: "no" });
      const user = await withSystem(() => User.findById(owner.id));
      const payouts = user.tradeHistory.filter(
        (t) => t.marketId === marketId && t.tradeType === "payout",
      );
      expect(payouts).toHaveLength(1);
      expect(payouts[0].amount).toBeGreaterThan(0);
      expect(
        (await api("/codex/agent/expired", { agentToken })).some(
          (x) => x.id === id,
        ),
      ).toBe(false);
    });

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

      const form = imageForm();
      await api("/upload", { method: "POST", body: form, status: 401 });
      await api("/upload", {
        account: player,
        method: "POST",
        body: form,
        status: 403,
      });

      const invalid = imageForm(
        new Blob(["not an image"], { type: "image/png" }),
      );
      await api("/upload", {
        account: admin,
        method: "POST",
        body: invalid,
        status: 415,
      });

      const oversized = imageForm(
        new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], {
          type: "image/png",
        }),
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
      expect(Buffer.from(await image.arrayBuffer())).toEqual(samplePng);
    }, 20000);

    it("persists, replaces, and removes a player's profile photo", async () => {
      const avatarPlayer = await addAccount("avatar");
      const username = `avatar_${fixture.slice(0, 10)}`;
      const path = "/user/avatar";
      const upload = () =>
        api(path, {
          account: avatarPlayer,
          method: "PUT",
          body: imageForm(),
        });
      const remove = () =>
        api(path, { account: avatarPlayer, method: "DELETE" });

      await api(path, { method: "PUT", body: imageForm(), status: 401 });
      await api(path, { account: avatarPlayer, method: "DELETE", status: 403 });
      expect(await setup(avatarPlayer, username)).toMatchObject({
        avatarUrl: null,
      });
      await api(path, {
        account: avatarPlayer,
        method: "PUT",
        body: imageForm(new Blob(["not an image"], { type: "image/png" })),
        status: 415,
      });

      try {
        const first = await upload();
        expect(first.avatarUrl).toContain("/object/public/profile-images/");
        expect(await api("/user", { account: avatarPlayer })).toMatchObject(
          first,
        );
        expect(await api("/user", { account: admin })).toMatchObject({
          avatarUrl: null,
        });
        expect(
          Buffer.from(await (await fetch(first.avatarUrl)).arrayBuffer()),
        ).toEqual(samplePng);

        const uploads = await Promise.all([upload(), upload()]);
        const current = await api("/user", { account: avatarPlayer });
        expect(uploads).toContainEqual({ avatarUrl: current.avatarUrl });
        const replaced = uploads.find(
          (photo) => photo.avatarUrl !== current.avatarUrl,
        );
        expect(replaced).toBeDefined();
        expect((await fetch(first.avatarUrl)).ok).toBe(false);
        expect((await fetch(replaced.avatarUrl)).ok).toBe(false);
        expect((await fetch(current.avatarUrl)).ok).toBe(true);

        expect(await remove()).toEqual({ avatarUrl: null });
        expect(await api("/user", { account: avatarPlayer })).toMatchObject({
          username,
          avatarUrl: null,
        });
        expect((await fetch(current.avatarUrl)).ok).toBe(false);
      } finally {
        await remove();
      }
    }, 20000);

    it.each(["BTCUSDT", "ETHUSDT"] as const)(
      "stores %s trades and cash-outs and limits trade visibility to the owner",
      async (assetPair) => {
        await setup(player, `player_${fixture.slice(0, 10)}`);
        await setup(other, `other_${fixture.slice(0, 10)}`);
        const target = assetPair === "BTCUSDT" ? 100000 : 3015;
        const market = await BinaryMarket.openSlot({
          assetPair,
          startTime: new Date(Date.now() - 1000),
          endTime: new Date(Date.now() + 120000),
          targetPrice: target,
          priceSnapshots: [{ price: target, timestamp: new Date() }],
        });
        binaryMarkets.push(market.id);
        const result = await api(`/binary-markets/${market.id}/trade`, {
          account: player,
          method: "POST",
          body: { side: "up", amount: 25 },
        });
        expect(result.market.trades).toHaveLength(1);
        expect(result.market.trades[0].entryProbability).toBeLessThan(0.51);
        expect(result.user.tradeHistory.at(-1).tradeType).toBe("buy");
        expect(result.user.tradeHistory.at(-1).marketTitle).toMatch(
          new RegExp(`^${assetPair.slice(0, 3)} UP`),
        );
        expect(
          (await api(`/binary-markets/${market.id}`, { account: other }))
            .trades,
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
      },
      20000,
    );

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
      binaryMarkets.push(previous.id);
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
      binaryMarkets.push(active.id);

      const ethPrevious = await BinaryMarket.openSlot({
        assetPair: "ETHUSDT",
        targetPrice: 3000,
        startTime: new Date(boundary - 300_000),
        endTime: new Date(boundary),
        priceSnapshots: [
          { price: 3000, timestamp: new Date(boundary - 1_000) },
        ],
      });
      binaryMarkets.push(ethPrevious.id);
      await withSystem(() =>
        query(
          "update metamarket.binary_markets set status = 'settled_down' where id = $1",
          [ethPrevious.id],
        ),
      );
      const ethInput = {
        assetPair: "ETHUSDT",
        targetPrice: 2995,
        startTime: new Date(boundary),
        endTime: new Date(boundary + 300_000),
        priceSnapshots: [{ price: 2995, timestamp: new Date(boundary) }],
      };
      const ethActive = await BinaryMarket.openSlot(ethInput);
      binaryMarkets.push(ethActive.id);
      expect((await BinaryMarket.openSlot(ethInput)).id).toBe(ethActive.id);

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
      expect(outcomes.some(({ id }) => id === ethPrevious.id)).toBe(false);
      const ethOutcomes = await api("/binary-markets/ETHUSDT/history", {
        account: player,
      });
      expect(ethOutcomes).toContainEqual(
        expect.objectContaining({ id: ethPrevious.id, status: "settled_down" }),
      );
      expect(
        ethOutcomes.every(({ assetPair }) => assetPair === "ETHUSDT"),
      ).toBe(true);
      const ethPrices = await api("/binary-markets/ETHUSDT/price-history", {
        account: player,
      });
      expect(
        ethPrices.filter(({ timestamp }) =>
          [boundary - 1_000, boundary].includes(timestamp),
        ),
      ).toEqual([
        { price: 3000, timestamp: boundary - 1_000 },
        { price: 2995, timestamp: boundary },
      ]);
      expect(
        await withSystem(() =>
          BinaryMarket.findActive(ethInput.endTime, "ETHUSDT"),
        ),
      ).toMatchObject({ id: ethActive.id });
      expect(
        await api("/binary-markets/active", { account: player }),
      ).toMatchObject({ market: { assetPair: "BTCUSDT" }, livePrice: 100000 });
      expect(
        await api("/binary-markets/ETHUSDT/active", { account: player }),
      ).toMatchObject({ market: { assetPair: "ETHUSDT" }, livePrice: 3000 });
      await api("/binary-markets/UNKNOWN/active", {
        account: player,
        status: 400,
      });
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
      binaryMarkets.push(market.id);
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

    it.each(["BTCUSDT", "ETHUSDT"] as const)(
      "credits an expired %s round once when two scheduled jobs settle it",
      async (assetPair) => {
        await setup(player, `player_${fixture.slice(0, 10)}`);
        const target = assetPair === "BTCUSDT" ? 100000 : 3000;
        const market = await BinaryMarket.openSlot({
          assetPair,
          startTime: new Date(Date.now() - 180000),
          endTime: new Date(Date.now() + 120000),
          targetPrice: target,
          priceSnapshots: [],
        });
        binaryMarkets.push(market.id);
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
            .mockImplementation(async (start, end, pair) =>
              pair === assetPair &&
              start === candidate.startTime.getTime() &&
              end === candidate.endTime.getTime()
                ? [{ price: target + 1000, timestamp: candidate.endTime }]
                : [],
            ),
          vi.spyOn(BinaryMarket, "listExpired").mockResolvedValue([candidate]),
          vi.spyOn(BinaryMarket, "findActive").mockResolvedValue(market),
          vi.spyOn(BinaryMarket, "pruneHistory").mockResolvedValue(undefined),
        ];
        try {
          await Promise.all([
            runScheduledBinaryCycle(assetPair),
            runScheduledBinaryCycle(assetPair),
          ]);
        } finally {
          stubs.forEach((stub) => stub.mockRestore());
        }

        const settled = await api(`/binary-markets/${market.id}`, {
          account: player,
        });
        expect(settled.status).toBe("settled_up");
        expect(settled.priceSnapshots.map(({ price }) => price)).toEqual([
          target,
          target + 1000,
        ]);
        const portfolio = await api("/user", { account: player });
        const payouts = portfolio.tradeHistory.filter(
          (entry) =>
            entry.marketId === market.id && entry.tradeType === "payout",
        );
        expect(payouts).toHaveLength(1);
        expect(payouts[0].marketTitle).toMatch(
          new RegExp(`^${assetPair.slice(0, 3)} UP Payout`),
        );
        expect(portfolio.balance).toBeCloseTo(
          purchase.user.balance + settled.trades[0].payout,
          2,
        );
      },
      20000,
    );
  },
);
