import "dotenv/config";
import { randomBytes } from "node:crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { RequestHandler } from "express";
import { USERNAME_PATTERN } from "../../../shared/api.ts";
import User, { needsOnboarding, serializeUser } from "../models/User.ts";
import { asyncRoute } from "./asyncRoute.ts";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const FRONTEND_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://metamarket.live"
    : "http://localhost:8080")
).replace(/\/$/, "");
const GMAIL_ADMIN_EMAIL = "samarth208p@gmail.com";
const WORKSPACE_ADMIN_EMAILS = new Set([
  "samarth_p@mt.iitr.ac.in",
  "yash1@mt.iitr.ac.in",
]);
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};
const oauthStateCookie = {
  ...cookieOptions,
  path: "/mapi/auth/google/callback",
};

// ── Passport Initialization ─────────────────────────────────────
export function initializePassport() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn("⚠️ Google Auth skipped: Missing GOOGLE_CLIENT_ID or SECRET");
    return;
  }

  try {
    passport.use(
      new GoogleStrategy(
        {
          clientID: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          callbackURL:
            process.env.GOOGLE_CALLBACK_URL ||
            `${FRONTEND_URL}/mapi/auth/google/callback`,
          proxy: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const verifiedEmail = profile.emails?.find(
              (email) => email.verified === true,
            );
            const email = verifiedEmail?.value.trim().toLowerCase();
            if (!email || !profile.id) {
              return done(null, false, {
                message: "A verified Google email is required",
              });
            }

            const user = await User.signIn({
              googleId: profile.id,
              email,
              name: profile.displayName || email.split("@")[0],
              isAdmin:
                email === GMAIL_ADMIN_EMAIL ||
                (WORKSPACE_ADMIN_EMAILS.has(email) &&
                  Boolean(profile._json.hd)),
            });

            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        },
      ) as any,
    );
    console.log("✅ Google Auth strategy initialized");
  } catch (error) {
    console.error("❌ Google Auth initialization failed:", error);
  }
}

// Auth handlers
export const handleGoogleAuth: RequestHandler = (req, res, next) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: "Auth not configured on server" });
  }
  const state = randomBytes(32).toString("base64url");
  res.cookie("oauthState", state, {
    ...oauthStateCookie,
    signed: true,
    maxAge: 10 * 60 * 1000,
  });
  passport.authenticate("google", {
    scope: ["openid", "profile", "email"],
    prompt: "select_account",
    session: false,
    state,
  })(req, res, next);
};

export const handleGoogleCallback: RequestHandler = (req, res, next) => {
  const state = req.signedCookies?.oauthState;
  res.clearCookie("oauthState", oauthStateCookie);
  if (!state || state !== req.query.state) {
    return res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }

  passport.authenticate("google", { session: false }, (err, user) => {
    if (err || !user) {
      return res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    }

    // Set a signed cookie with the userId (stateless auth)
    res.cookie("userId", user.id, {
      ...cookieOptions,
      signed: true,
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    });

    res.redirect(
      needsOnboarding(user) ? `${FRONTEND_URL}/login` : FRONTEND_URL,
    );
  })(req, res, next);
};

export const requireAccount: RequestHandler = (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  next();
};

export const requireOnboardingComplete: RequestHandler = (req, res, next) => {
  if (needsOnboarding(req.user)) {
    return res.status(403).json({
      code: "ONBOARDING_REQUIRED",
      error: "Choose a username and accept the play terms to continue.",
    });
  }
  next();
};

export const handleLogout: RequestHandler = (_req, res) => {
  res.clearCookie("userId", cookieOptions);
  res.json({ success: true });
};

export const handleGetUser: RequestHandler = (req, res) => {
  res.json(serializeUser(req.user));
};

function isUsernameTaken(error: unknown) {
  const violation = error as { code?: string; constraint?: string } | null;
  return (
    violation?.code === "23505" &&
    violation.constraint === "accounts_username_unique"
  );
}

export const handleOnboarding = asyncRoute(async (req, res) => {
  const { username: proposedUsername, virtualFunds, playOnly } = req.body ?? {};
  const username =
    typeof proposedUsername === "string" ? proposedUsername.trim() : "";
  if (
    !USERNAME_PATTERN.test(username) ||
    virtualFunds !== true ||
    playOnly !== true
  ) {
    return res.status(400).json({
      error:
        "Enter a username with 3–24 letters, numbers, or underscores and accept both play terms.",
    });
  }
  const account = req.user;
  if (!needsOnboarding(account)) return res.json(serializeUser(account));

  try {
    const user = await User.completeOnboarding(account.id, username);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    return res.json(serializeUser(user));
  } catch (error) {
    if (isUsernameTaken(error)) {
      return res
        .status(409)
        .json({ error: "That username is taken. Choose another." });
    }
    throw error;
  }
});

export const handleUpdateUsername = asyncRoute(async (req, res) => {
  const proposedUsername = req.body?.username;
  const username =
    typeof proposedUsername === "string" ? proposedUsername.trim() : "";
  if (!USERNAME_PATTERN.test(username)) {
    return res.status(400).json({
      error: "Enter a username with 3–24 letters, numbers, or underscores.",
    });
  }

  try {
    const user = await User.updateUsername(req.user.id, username);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    return res.json({ username: user.username });
  } catch (error) {
    if (isUsernameTaken(error)) {
      return res
        .status(409)
        .json({ error: "That username is taken. Choose another." });
    }
    throw error;
  }
});

export const handleAcknowledgeStarterGift = asyncRoute(async (req, res) => {
  await User.acknowledgeGift(req.user.id);
  res.sendStatus(204);
});

export const handleClearHistory = asyncRoute(async (req, res) => {
  const user = await User.clearHistory(req.user.id);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json({ success: true, user: serializeUser(user) });
});
