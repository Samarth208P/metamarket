import { once } from "node:events";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "./index.ts";
import BinaryMarket from "./models/BinaryMarket.ts";
import Market, { newMarket } from "./models/Market.ts";
import { newId } from "./database.ts";
import User, { type IUser } from "./models/User.ts";
import { startBinaryMarketServices } from "./routes/binaryMarkets.ts";

vi.mock("./routes/binaryMarkets.ts", async (importOriginal) => {
  const module =
    await importOriginal<typeof import("./routes/binaryMarkets.ts")>();
  return { ...module, startBinaryMarketServices: vi.fn() };
});

const sessionSecret = "test-market-session-secret";
const account: IUser = {
  id: newId(),
  googleId: "fixture",
  email: "fixture@example.com",
  name: "Fixture",
  username: "market_player",
  termsAcceptedAt: new Date(),
  isAdmin: false,
  balance: 1000,
  tradeHistory: [],
  positions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};
const signature = createHmac("sha256", sessionSecret)
  .update(account.id)
  .digest("base64")
  .replace(/=+$/, "");
const cookie = `userId=${encodeURIComponent(`s:${account.id}.${signature}`)}`;

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", sessionSecret);
  vi.spyOn(User, "findById").mockResolvedValue(account);
});

async function withApi(
  enableBinaryMarkets: boolean | undefined,
  test: (get: (path: string) => Promise<Response>) => Promise<void>,
) {
  const app = await createServer({ enableBinaryMarkets });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    await test((path) =>
      fetch(`http://127.0.0.1:${port}/mapi${path}`, { headers: { cookie } }),
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function makeMarket(title: string, priceHistory = []) {
  return newMarket({ title, description: title, priceHistory });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(startBinaryMarketServices).mockReset();
});

describe("market failure isolation", () => {
  it("lists healthy markets and contains an unreadable detail record", async () => {
    const healthy = makeMarket("Healthy market");
    const broken = makeMarket("Broken chart", [null]);
    const markets = [healthy, broken];
    vi.spyOn(Market, "list").mockResolvedValue(markets);
    vi.spyOn(Market, "findById").mockImplementation(
      async (id) => markets.find((market) => market.id === id) ?? null,
    );
    vi.spyOn(User, "listPortfolios").mockResolvedValue([]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await withApi(false, async (get) => {
      const list = await get("/markets");
      expect(list.status).toBe(200);
      expect((await list.json()).map((market) => market.id)).toEqual([
        healthy.id,
      ]);

      const failed = await get(`/markets/${broken.id}`);
      expect(failed.status).toBe(500);
      expect(await failed.json()).toEqual({
        error: "Unable to complete this request.",
      });

      expect((await get(`/markets/${healthy.id}`)).status).toBe(200);
      expect((await get("/leaderboard")).status).toBe(200);
      expect((await get("/binary-markets/active")).status).toBe(503);
    });
    expect(
      log.mock.calls.some(([message]) => message.includes(broken.id)),
    ).toBe(true);
    expect(startBinaryMarketServices).not.toHaveBeenCalled();
  });

  it("returns an API error when a database request rejects and still serves ping", async () => {
    vi.spyOn(Market, "list").mockRejectedValue(
      new Error("Database query failed"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await withApi(false, async (get) => {
      expect((await get("/markets")).status).toBe(500);
      expect((await get("/ping")).status).toBe(200);
    });
  });

  it("keeps the regular API serving when BTC initialization fails", async () => {
    vi.mocked(startBinaryMarketServices).mockImplementation(() => {
      throw new Error("BTC feed initialization failed");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Market, "list").mockResolvedValue([]);

    await withApi(undefined, async (get) => {
      const btc = await get("/binary-markets/active");
      expect(btc.status).toBe(503);
      expect(await btc.json()).toEqual({
        error: "Live BTC markets are temporarily unavailable.",
      });
      expect((await get("/markets")).status).toBe(200);
      expect((await get("/ping")).status).toBe(200);
    });
    expect(startBinaryMarketServices).toHaveBeenCalledOnce();
  });

  it("serves the BTC route after account setup when the module starts", async () => {
    vi.spyOn(BinaryMarket, "listHistory").mockResolvedValue([]);

    await withApi(undefined, async (get) => {
      const history = await get("/binary-markets/history");
      expect(history.status).toBe(200);
      expect(await history.json()).toEqual([]);
      expect((await get("/unknown")).status).toBe(404);
    });
  });
});
