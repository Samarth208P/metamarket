import { isDeepStrictEqual } from "node:util";
import {
  cutoffTerms,
  winningIndex,
  type CodexDraft,
  type CodexEvidence,
  type CodexReview,
} from "../../../shared/codexMarkets.ts";
import { query } from "../database.ts";
import { ApiError } from "../routes/asyncRoute.ts";
import { publishMarket, settleMarket } from "../routes/markets.ts";
import { invalid, parseDraft, parseEvidence } from "./codexValidation.ts";

// Callers run each operation in one system transaction.
const fields = 'id, revision, phase, draft, market_id as "marketId", evidence';
const table = "metamarket.codex_market_reviews";

function conflict(message: string): never {
  throw new ApiError(409, { error: message });
}

async function locked(id: string) {
  const result = await query<CodexReview>(
    "select " + fields + " from " + table + " where id = $1 for update",
    [id],
  );
  if (!result.rows[0])
    throw new ApiError(404, { error: "Proposal not found." });
  return result.rows[0];
}

export async function listReviews(which: "queue" | "expired" | "drafts") {
  const expired =
    "market_id is not null and phase <> 'settled' and (draft->>'endDate')::timestamptz <= now()";
  const condition =
    which === "expired"
      ? expired
      : which === "drafts"
        ? "market_id is null"
        : "phase = 'draft' or (" +
          expired +
          " and phase <> 'resolution_dismissed')";
  return (
    await query<CodexReview>(
      "select " +
        fields +
        " from " +
        table +
        " where " +
        condition +
        " order by updated_at desc, id",
    )
  ).rows;
}

export async function submitDraft(
  id: string,
  expected: number,
  input: unknown,
) {
  const draft = parseDraft(input);
  if (expected === 0) {
    const created = await query<CodexReview>(
      "insert into " +
        table +
        " (id,revision,phase,draft) values ($1,1,'draft',$2) on conflict(id) do nothing returning " +
        fields,
      [id, draft],
    );
    if (created.rowCount) return created.rows[0];
  }
  const row = await locked(id);
  if (row.revision === expected + 1 && isDeepStrictEqual(draft, row.draft))
    return row;
  if (row.marketId || expected !== row.revision)
    conflict("Draft changed or already published. Read the latest revision.");
  return (
    await query<CodexReview>(
      "update " +
        table +
        " set draft=$2, phase='draft', revision=revision+1, reviewed_by=null, updated_at=now() where id=$1 returning " +
        fields,
      [id, draft],
    )
  ).rows[0];
}

export async function submitEvidence(
  id: string,
  expected: number,
  input: unknown,
) {
  const row = await locked(id);
  if (!row.marketId)
    conflict("Only published Codex markets can receive evidence.");
  const evidence = parseEvidence(input, row.draft);
  if (
    row.revision === expected + 1 &&
    isDeepStrictEqual(row.evidence, evidence)
  )
    return row;
  if (row.phase === "settled" || expected !== row.revision)
    conflict("Resolution changed. Read the latest revision.");
  const phase =
    evidence.status === "missing" ? "awaiting_evidence" : "resolution";
  return (
    await query<CodexReview>(
      "update " +
        table +
        " set evidence=$2, phase=$3, revision=revision+1, reviewed_by=null, updated_at=now() where id=$1 returning " +
        fields,
      [id, evidence, phase],
    )
  ).rows[0];
}

function marketInput(draft: CodexDraft) {
  return {
    title: draft.title,
    category: draft.category,
    description: cutoffTerms(draft),
    endDate: draft.endDate,
    logoUrl: draft.logoUrl,
    marketType: draft.marketType,
    initialB: draft.initialB,
    minB: draft.minB,
    isDynamic: draft.isDynamic,
    ...(draft.marketType === "versus" && {
      optionA: draft.outcomes[0],
      optionB: draft.outcomes[1],
    }),
    ...(draft.marketType === "multi" && {
      teams: draft.outcomes.map((name) => ({ name })),
    }),
  };
}

export async function decideReview(
  id: string,
  expected: number,
  kind: "draft" | "resolution",
  approve: boolean,
  owner: string,
) {
  const row = await locked(id);
  if (expected !== row.revision)
    conflict("This proposal changed. Review the latest version first.");
  const next = approve
    ? kind === "draft"
      ? "live"
      : "settled"
    : kind === "draft"
      ? "draft_dismissed"
      : "resolution_dismissed";
  if (row.phase === next) return row;
  if (row.phase !== kind)
    conflict("This proposal is no longer awaiting that decision.");

  let marketId = row.marketId;
  if (approve && kind === "draft") {
    const draft = parseDraft(row.draft);
    const market = await publishMarket(marketInput(draft), owner, {
      codexProposalId: id,
      codexSourceUrl: draft.sourceUrl,
    });
    marketId = market.id;
  }
  if (approve && kind === "resolution") {
    const evidence = parseEvidence(row.evidence, row.draft);
    if (evidence.status !== "observed")
      invalid("Verified cutoff evidence is required.");
    const index = winningIndex(row.draft, evidence.readings);
    const optionId =
      row.draft.marketType === "multi"
        ? "option-" + index
        : ["yes", "no"][index];
    await settleMarket(marketId, { optionId }, id);
  }
  return (
    await query<CodexReview>(
      "update " +
        table +
        " set phase=$2, market_id=$3, reviewed_by=$4, updated_at=now() where id=$1 returning " +
        fields,
      [id, next, marketId, owner],
    )
  ).rows[0];
}
