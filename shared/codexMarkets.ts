export type CutoffRule =
  | {
      kind: "threshold";
      metric: string;
      unit: string;
      comparison: "gt" | "gte" | "lt" | "lte";
      threshold: number;
    }
  | {
      kind: "ranking";
      metric: string;
      unit: string;
      wins: "highest" | "lowest";
    };

// For rankings, outcomes are in published tie-break priority order.
export interface CodexDraft {
  title: string;
  category: string;
  whyNow: string;
  storyUrl: string;
  endDate: string;
  sourceName: string;
  sourceUrl: string;
  archiveExampleUrl: string;
  whyUnsettled: string;
  logoUrl: string;
  marketType: "binary" | "versus" | "multi";
  outcomes: string[];
  rule: CutoffRule;
  initialB: number;
  minB: number;
  isDynamic: boolean;
}

export interface CutoffReading {
  status: "observed";
  evidenceUrl: string;
  observedAt: string;
  readings: number[];
  note: string;
}
export interface MissingReading {
  status: "missing";
  note: string;
}
export type CodexEvidence = CutoffReading | MissingReading;

export type ReviewPhase =
  | "draft"
  | "draft_dismissed"
  | "live"
  | "awaiting_evidence"
  | "resolution"
  | "resolution_dismissed"
  | "settled";
export interface CodexReview {
  id: string;
  revision: number;
  phase: ReviewPhase;
  draft: CodexDraft;
  marketId: string | null;
  evidence: CodexEvidence | null;
}

const comparisons = {
  gt: "greater than",
  gte: "greater than or equal to",
  lt: "less than",
  lte: "less than or equal to",
};

export function cutoffTerms(draft: CodexDraft): string {
  const rule = draft.rule;
  const when = new Date(draft.endDate).toISOString();
  const measurement =
    rule.metric +
    " (" +
    rule.unit +
    ") at " +
    when +
    " according to " +
    draft.sourceName;
  if (rule.kind === "threshold")
    return (
      "Measure " +
      measurement +
      ". Yes wins if the reading is " +
      comparisons[rule.comparison] +
      " " +
      rule.threshold +
      ". Otherwise No wins."
    );
  return (
    "Compare " +
    measurement +
    " for " +
    draft.outcomes.join(", ") +
    ". The " +
    rule.wins +
    " reading wins. For a tie, the first tied outcome in this order wins: " +
    draft.outcomes.join(", ") +
    "."
  );
}

export function winningIndex(draft: CodexDraft, values: number[]): number {
  const r = draft.rule;
  if (
    values.length !== (r.kind === "threshold" ? 1 : draft.outcomes.length) ||
    !values.every(Number.isFinite)
  )
    throw new Error(
      "A finite cutoff reading is required for each measurement.",
    );
  if (r.kind === "ranking") {
    const best =
      r.wins === "highest" ? Math.max(...values) : Math.min(...values);
    return values.indexOf(best);
  }
  const v = values[0];
  const yes = {
    gt: v > r.threshold,
    gte: v >= r.threshold,
    lt: v < r.threshold,
    lte: v <= r.threshold,
  };
  return yes[r.comparison] ? 0 : 1;
}
