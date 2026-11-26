import type {
  CodexDraft,
  CodexEvidence,
  CutoffRule,
} from "../../../shared/codexMarkets.ts";
import { ApiError } from "../routes/asyncRoute.ts";

export function invalid(message: string): never {
  throw new ApiError(400, { error: message });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("Expected an object.");
  return value as Record<string, unknown>;
}

function field(value: unknown, label: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    invalid("Invalid " + label + ".");
  return value.trim();
}

function number(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value))
    invalid("Invalid " + label + ".");
  return value;
}

function choice<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (!options.includes(value as T)) invalid("Invalid " + label + ".");
  return value as T;
}

function link(value: unknown, label: string) {
  const s = field(value, label, 2048);
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    invalid("Invalid " + label + " URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    invalid(label + " must be an HTTPS link without credentials.");
  return url.href;
}

function sourceLink(value: unknown, source: string) {
  const url = link(value, "evidence");
  if (new URL(url).origin !== new URL(source).origin)
    invalid("Evidence must come from the published source origin.");
  return url;
}

function instant(value: unknown) {
  const input = field(value, "timestamp", 40);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(
      input,
    ) ||
    !Number.isFinite(Date.parse(input))
  )
    invalid("Use an ISO timestamp with time zone.");
  return new Date(input).toISOString();
}

export function parseDraft(value: unknown, now = Date.now()): CodexDraft {
  const d = object(value);
  const title = field(d.title, "title", 200);
  const endDate = instant(d.endDate);
  if (Date.parse(endDate) <= now) invalid("The cutoff must be in the future.");
  const marketType = choice(
    d.marketType,
    ["binary", "versus", "multi"] as const,
    "market format",
  );
  if (
    !Array.isArray(d.outcomes) ||
    d.outcomes.length < 2 ||
    d.outcomes.length > 32
  )
    invalid("Provide between 2 and 32 named outcomes.");
  const outcomes = d.outcomes.map((v) => field(v, "outcome", 100));
  if (
    new Set(outcomes.map((s) => s.toLowerCase())).size !== outcomes.length ||
    (marketType !== "multi" && outcomes.length !== 2) ||
    (marketType === "binary" && (outcomes[0] !== "Yes" || outcomes[1] !== "No"))
  )
    invalid("Outcomes must be distinct and match the selected format.");
  const r = object(d.rule);
  const metric = field(r.metric, "point-in-time metric", 180);
  const unit = field(r.unit, "measurement unit", 60);
  if (
    /\b(ever|at any (?:time|point)|before (?:expiry|the cutoff)|first to|all[- ]time high|cumulative|total (?:sales|streams|views) (?:by|since))\b/i.test(
      title + " " + metric,
    )
  )
    invalid("Use a measurement that can change until the exact cutoff.");
  let rule: CutoffRule;
  if (r.kind === "threshold" && marketType === "binary") {
    rule = {
      kind: "threshold",
      metric,
      unit,
      comparison: choice(
        r.comparison,
        ["gt", "gte", "lt", "lte"] as const,
        "comparison",
      ),
      threshold: number(r.threshold, "threshold"),
    };
  } else if (r.kind === "ranking" && marketType !== "binary") {
    rule = {
      kind: "ranking",
      metric,
      unit,
      wins: choice(r.wins, ["highest", "lowest"] as const, "ranking direction"),
    };
  } else
    invalid(
      "Use a cutoff threshold for Yes/No and a cutoff ranking for named outcomes.",
    );
  const initialB = number(d.initialB, "base liquidity");
  const minB = number(d.minB, "minimum liquidity");
  if (
    initialB < 10 ||
    minB < 1 ||
    minB > initialB ||
    initialB > Number.MAX_SAFE_INTEGER ||
    typeof d.isDynamic !== "boolean"
  )
    invalid("Invalid liquidity settings.");
  const sourceUrl = link(d.sourceUrl, "source");
  return {
    title,
    category: field(d.category, "category", 80),
    whyNow: field(d.whyNow, "reason to participate"),
    storyUrl: link(d.storyUrl, "story"),
    endDate,
    sourceName: field(d.sourceName, "source name", 100),
    sourceUrl,
    archiveExampleUrl: sourceLink(d.archiveExampleUrl, sourceUrl),
    whyUnsettled: field(
      d.whyUnsettled,
      "explanation of why the result can change until expiry",
    ),
    logoUrl: link(d.logoUrl, "image"),
    marketType,
    outcomes,
    rule,
    initialB,
    minB,
    isDynamic: d.isDynamic,
  };
}

export function parseEvidence(
  value: unknown,
  draft: CodexDraft,
  now = Date.now(),
): CodexEvidence {
  if (now < Date.parse(draft.endDate)) invalid("Trading is still open.");
  const e = object(value);
  const note = field(e.note, "evidence note", 1000);
  if (e.status === "missing") return { status: "missing", note };
  if (e.status !== "observed")
    invalid("Expected observed or missing evidence.");
  const observedAt = instant(e.observedAt);
  if (observedAt !== draft.endDate)
    invalid("The observation must match the published cutoff.");
  const count = draft.rule.kind === "threshold" ? 1 : draft.outcomes.length;
  if (!Array.isArray(e.readings) || e.readings.length !== count)
    invalid("Provide one reading for each measurement in published order.");
  return {
    status: "observed",
    evidenceUrl: sourceLink(e.evidenceUrl, draft.sourceUrl),
    observedAt,
    readings: e.readings.map((v) => number(v, "reading")),
    note,
  };
}
