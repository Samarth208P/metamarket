import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { query, withSystem } from "../database.ts";
import { ApiError, asyncRoute, transactionRoute } from "./asyncRoute.ts";
import {
  decideReview,
  listReviews,
  submitDraft,
  submitEvidence,
} from "../services/codexReviews.ts";
import { invalid } from "../services/codexValidation.ts";

const agent = Router();
const owner = Router();
const digest = (value: string) => createHash("sha256").update(value).digest();
agent.use((req, res, next) => {
  const key = process.env.METAMARKET_CODEX_TOKEN;
  const bearer = req.get("authorization") ?? "";
  if (!key || !timingSafeEqual(digest(bearer), digest("Bearer " + key)))
    return res
      .status(401)
      .json({ error: "A valid Codex submission token is required." });
  next();
});

function proposalId(value: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    invalid("Invalid proposal ID.");
  return value;
}

function revision(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    invalid("Provide the expected revision.");
  return value;
}

agent.get(
  "/drafts",
  transactionRoute(async () => ({
    drafts: await listReviews("drafts"),
    marketTitles: (
      await query<{ title: string }>(
        "select state->>'title' as title from metamarket.markets where status='active' order by created_at desc",
      )
    ).rows.map((m) => m.title),
  })),
);
agent.get(
  "/expired",
  transactionRoute(() => listReviews("expired")),
);
agent.put(
  "/drafts/:id",
  transactionRoute((req) =>
    submitDraft(
      proposalId(req.params.id),
      revision(req.body?.revision),
      req.body?.draft,
    ),
  ),
);
agent.put(
  "/evidence/:id",
  transactionRoute((req) =>
    submitEvidence(
      proposalId(req.params.id),
      revision(req.body?.revision),
      req.body?.evidence,
    ),
  ),
);

function isOwner(user: Express.User | undefined) {
  const email = process.env.METAMARKET_REVIEW_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(email && user?.isAdmin && user.email.toLowerCase() === email);
}

owner.get(
  "/",
  asyncRoute(async (req, res) => {
    if (!req.user?.isAdmin)
      throw new ApiError(403, { error: "Admin access required." });
    if (!isOwner(req.user)) return res.json({ enabled: false, reviews: [] });
    res.json({
      enabled: true,
      reviews: await withSystem(() => listReviews("queue")),
    });
  }),
);

owner.post(
  "/:id/:action",
  (req, res, next) => {
    if (!isOwner(req.user))
      return res
        .status(403)
        .json({
          error: "Only the configured market owner may approve or dismiss.",
        });
    next();
  },
  transactionRoute((req) => {
    const { kind } = req.body ?? {};
    if (
      !["approve", "dismiss"].includes(req.params.action) ||
      (kind !== "draft" && kind !== "resolution")
    )
      invalid("Invalid review decision.");
    return decideReview(
      proposalId(req.params.id),
      revision(req.body?.revision),
      kind,
      req.params.action === "approve",
      req.user.id,
    );
  }),
);

export { agent as codexAgentRoutes, owner as codexOwnerRoutes };
