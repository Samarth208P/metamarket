import { once } from "node:events";
import type { AddressInfo } from "node:net";
import passport from "passport";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as database from "./database.ts";
import { createServer } from "./index.ts";
import Market from "./models/Market.ts";
import User, { STARTER_BALANCE, type IUser } from "./models/User.ts";

vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_CALLBACK_URL =
    "http://localhost:8080/mapi/auth/google/callback";
  process.env.FRONTEND_URL = "http://localhost:8080";
});

type Request = (path: string, options?: RequestInit) => Promise<Response>;

async function withApi(test: (request: Request) => Promise<void>) {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.spyOn(database, "connectDB").mockResolvedValue(undefined);
  const app = await createServer({ enableBinaryMarkets: false });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    await test((path, options) =>
      fetch(`http://127.0.0.1:${port}/mapi${path}`, {
        redirect: "manual",
        ...options,
      }),
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function sessionCookie(response: Response, name: string) {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0];
}

function stubGoogleProfile(verified: boolean, email = "Player@gmail.com") {
  const useStrategy = passport.use.bind(passport);
  vi.spyOn(passport, "use").mockImplementation((strategy) => {
    const google = strategy as any;
    google._oauth2.getOAuthAccessToken = (_code, _params, done) =>
      done(null, "access-token");
    google.userProfile = (_token, done) =>
      done(null, {
        id: "google-player",
        emails: [{ value: email, verified }],
        displayName: "Google Player",
        _json: {},
      });
    return useStrategy(strategy);
  });
}

async function signIn(request: Request) {
  const redirect = await request("/auth/google");
  const state = new URL(redirect.headers.get("location")).searchParams.get(
    "state",
  );
  expect(state).toBeTruthy();
  return request(`/auth/google/callback?code=test-code&state=${state}`, {
    headers: { cookie: sessionCookie(redirect, "oauthState") },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Google sign-in and required account setup", () => {
  it("rejects an OAuth callback without its state cookie and blocks anonymous app APIs", async () => {
    const update = vi.spyOn(User, "signIn");
    await withApi(async (request) => {
      const callback = await request(
        "/auth/google/callback?code=test-code&state=wrong",
      );
      expect(callback.headers.get("location")).toContain(
        "/login?error=auth_failed",
      );
      expect(sessionCookie(callback, "userId")).toBeUndefined();
      expect(update).not.toHaveBeenCalled();
      expect((await request("/markets")).status).toBe(401);
      expect((await request("/leaderboard")).status).toBe(401);
      expect(
        (await request("/user/onboarding", { method: "POST" })).status,
      ).toBe(401);
      expect((await request("/health")).status).toBe(200);
    });
  });

  it("rejects an unverified Google email before writing an account", async () => {
    stubGoogleProfile(false, "samarth208p@gmail.com");
    const update = vi.spyOn(User, "signIn");
    await withApi(async (request) => {
      const callback = await signIn(request);
      expect(callback.headers.get("location")).toContain(
        "/login?error=auth_failed",
      );
      expect(sessionCookie(callback, "userId")).toBeUndefined();
      expect(update).not.toHaveBeenCalled();
    });
  });

  it("grants initial admin access to the verified Gmail account without a Workspace domain", async () => {
    stubGoogleProfile(true, "Samarth208P@gmail.com");
    const update = vi.spyOn(User, "signIn").mockResolvedValue({
      id: database.newId(),
      isAdmin: true,
    } as IUser);
    await withApi(async (request) => {
      const callback = await signIn(request);
      expect(sessionCookie(callback, "userId")).toBeTruthy();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "samarth208p@gmail.com",
          isAdmin: true,
        }),
      );
    });
  });

  it("accepts Gmail, requires setup across the API, and grants the starter gift once", async () => {
    stubGoogleProfile(true);
    let account: IUser;
    vi.spyOn(User, "signIn").mockImplementation(async (profile) => {
      account ??= {
        id: database.newId(),
        ...profile,
        balance: STARTER_BALANCE,
        starterGiftAmount: STARTER_BALANCE,
        tradeHistory: [],
        positions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return account;
    });
    vi.spyOn(User, "findById").mockImplementation(async () => account);
    const update = vi
      .spyOn(User, "completeOnboarding")
      .mockImplementation(async (_id, username) => {
        account.username = username;
        account.termsAcceptedAt = new Date();
        return account;
      });
    vi.spyOn(User, "acknowledgeGift").mockImplementation(async () => {
      account.starterGiftSeenAt ??= new Date();
    });
    vi.spyOn(Market, "list").mockResolvedValue([]);
    vi.spyOn(User, "listAdmins").mockResolvedValue([]);
    await withApi(async (request) => {
      const callback = await signIn(request);
      expect(callback.headers.get("location")).toBe(
        "http://localhost:8080/login",
      );
      const cookie = sessionCookie(callback, "userId");
      expect(cookie).toBeTruthy();
      const get = (path: string) => request(path, { headers: { cookie } });
      const post = (path: string, body?: object) =>
        request(path, {
          method: "POST",
          headers: { cookie, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

      const user = await (await get("/user")).json();
      expect(user).toMatchObject({
        email: "player@gmail.com",
        isAdmin: false,
        username: null,
        needsOnboarding: true,
        balance: 1000,
        starterGift: { amount: 1000 },
      });
      expect(user).not.toHaveProperty("googleId");
      for (const path of [
        "/markets",
        "/leaderboard",
        "/binary-markets/history",
        "/admin/list",
      ]) {
        const response = await get(path);
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
          code: "ONBOARDING_REQUIRED",
        });
      }
      expect((await post("/auth/clear-history")).status).toBe(403);
      expect((await post("/user/starter-gift/acknowledge")).status).toBe(403);

      const setup = {
        username: "Market_Player",
        virtualFunds: true,
        playOnly: true,
      };
      expect(
        (await post("/user/onboarding", { ...setup, playOnly: false })).status,
      ).toBe(400);
      expect(
        (await post("/user/onboarding", { ...setup, username: "bad name" }))
          .status,
      ).toBe(400);
      update.mockRejectedValueOnce({
        code: "23505",
        constraint: "accounts_username_unique",
      });
      expect((await post("/user/onboarding", setup)).status).toBe(409);

      const complete = await post("/user/onboarding", setup);
      expect(complete.status).toBe(200);
      expect(await complete.json()).toMatchObject({
        username: setup.username,
        needsOnboarding: false,
      });
      expect(account.termsAcceptedAt).toBeInstanceOf(Date);
      expect((await get("/markets")).status).toBe(200);
      expect((await get("/admin/list")).status).toBe(403);

      account.balance = 850;
      const retry = await post("/user/onboarding", {
        ...setup,
        username: "AnotherName",
      });
      expect(await retry.json()).toMatchObject({
        username: setup.username,
        balance: 850,
      });
      expect((await post("/user/starter-gift/acknowledge")).status).toBe(204);
      expect((await post("/user/starter-gift/acknowledge")).status).toBe(204);

      const returning = await signIn(request);
      expect(new URL(returning.headers.get("location")).pathname).toBe("/");
      expect(await (await get("/user")).json()).toMatchObject({
        balance: 850,
        starterGift: null,
        username: setup.username,
      });
    });
  });
});
