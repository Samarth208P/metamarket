import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  cutoffTerms,
  winningIndex,
  type CodexReview,
} from "@shared/codexMarkets";
import { marketCatalogKey } from "@/lib/markets";
import { adminRequest, marketTypeLabels } from "./markets";

function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a
      className="break-words text-primary underline underline-offset-2"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

function ProposalCard({
  row,
  blocked,
  refresh,
}: {
  row: CodexReview;
  blocked: boolean;
  refresh: () => Promise<void>;
}) {
  const { draft, phase, evidence } = row;
  const creation = phase === "draft";
  const actionable = creation || phase === "resolution";
  const observed = evidence?.status === "observed" ? evidence : undefined;
  const winner = observed
    ? draft.outcomes[winningIndex(draft, observed.readings)]
    : undefined;
  const [imageState, setImageState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const expired = Date.parse(draft.endDate) <= Date.now();

  async function decide(action: "approve" | "dismiss") {
    setBusy(true);
    setError("");
    try {
      await adminRequest(
        "/admin/codex/" + row.id + "/" + action,
        "Review failed.",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: creation ? "draft" : "resolution",
            revision: row.revision,
          }),
        },
      );
      toast({
        title:
          action === "dismiss"
            ? "Proposal dismissed"
            : creation
              ? "Market published"
              : "Market settled",
        description: draft.title,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
      toast({
        title: "Review could not be applied",
        description: e instanceof Error ? e.message : "Refresh and try again.",
        variant: "destructive",
      });
    } finally {
      try {
        await refresh();
      } finally {
        setBusy(false);
      }
    }
  }
  return (
    <article className="space-y-3 break-words rounded-xl border bg-card p-4">
      <header className="flex items-start gap-3">
        <img
          className="size-12 shrink-0 rounded-md border bg-muted object-cover"
          src={draft.logoUrl}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setImageState("ready")}
          onError={() => setImageState("failed")}
        />
        <div>
          <p className="text-xs text-muted-foreground">
            {creation ? "Publication" : "Settlement"} · Revision {row.revision}
          </p>
          <h3 className="font-semibold">{draft.title}</h3>
        </div>
      </header>
      {creation && (
        <p className="text-sm">
          {draft.whyNow}{" "}
          <SourceLink url={draft.storyUrl}>Story source</SourceLink>
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Cutoff</dt>
        <dd>{new Date(draft.endDate).toUTCString()}</dd>
        <dt className="text-muted-foreground">Source</dt>
        <dd>
          <SourceLink url={draft.sourceUrl}>{draft.sourceName}</SourceLink>
        </dd>
        {creation && (
          <>
            <dt className="text-muted-foreground">Market</dt>
            <dd>
              {marketTypeLabels[draft.marketType]} · {draft.category}
            </dd>
            <dt className="text-muted-foreground">Outcomes</dt>
            <dd>{draft.outcomes.join(" / ")}</dd>
            <dt className="text-muted-foreground">Liquidity</dt>
            <dd>
              {draft.isDynamic ? "Dynamic" : "Fixed"} · Base {draft.initialB} ·
              Minimum {draft.minB}
            </dd>
          </>
        )}
      </dl>
      <p className="whitespace-pre-wrap text-sm">{cutoffTerms(draft)}</p>
      {creation && (
        <p className="text-sm text-muted-foreground">
          {draft.whyUnsettled}{" "}
          <SourceLink url={draft.archiveExampleUrl}>
            Historical reading
          </SourceLink>{" "}
          · <SourceLink url={draft.logoUrl}>Image</SourceLink>
        </p>
      )}
      {observed && (
        <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">Proposed winner · {winner}</p>
          <p>
            {observed.readings
              .map(
                (v, i) =>
                  (draft.rule.kind === "ranking"
                    ? draft.outcomes[i] + " "
                    : "") +
                  v +
                  " " +
                  draft.rule.unit,
              )
              .join(" · ")}
          </p>
          <p>{observed.note}</p>
          <p>
            <SourceLink url={observed.evidenceUrl}>Cutoff evidence</SourceLink>{" "}
            · {new Date(observed.observedAt).toUTCString()}
          </p>
        </div>
      )}
      {!actionable && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          <strong>
            {phase === "awaiting_evidence"
              ? "Awaiting evidence"
              : "Awaiting a Codex check"}
          </strong>
          {evidence?.note && " · " + evidence.note}. Check again with “Check
          expired markets” in Codex.
        </p>
      )}
      {creation && (expired || blocked || imageState === "failed") && (
        <p className="text-sm text-destructive">
          {expired
            ? "The proposed cutoff has passed."
            : blocked
              ? "Publication is paused by the solvency guard."
              : "The image could not load. Revise the draft in Codex."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {actionable && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              busy ||
              (creation && (expired || blocked || imageState !== "ready"))
            }
            onClick={() => decide("approve")}
          >
            {creation ? "Approve & publish" : "Approve & settle " + winner}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => decide("dismiss")}
          >
            Dismiss
          </Button>
        </div>
      )}
    </article>
  );
}

export function CodexWorkspace({
  children,
  blocked,
}: {
  children: ReactNode;
  blocked: boolean;
}) {
  const [review, setReview] = useState(false);
  const { user } = useAuth();
  const client = useQueryClient();
  const result = useQuery({
    queryKey: ["codexReviews", user?.id],
    queryFn: () =>
      adminRequest<{ enabled: boolean; reviews: CodexReview[] }>(
        "/admin/codex",
        "Could not load reviews.",
      ),
    refetchOnWindowFocus: true,
  });
  const rows = result.data?.reviews ?? [];
  async function refresh() {
    await Promise.all([
      result.refetch(),
      client.invalidateQueries({ queryKey: marketCatalogKey }),
      client.invalidateQueries({ queryKey: ["market"] }),
      client.invalidateQueries({ queryKey: ["adminSolvency"] }),
    ]);
  }

  return (
    <div id="market-workspace" className="min-w-0 space-y-3">
      {(result.data?.enabled || result.isError) && (
        <div
          aria-label="Market creation and review"
          className="flex flex-wrap gap-2"
        >
          <Button
            type="button"
            size="sm"
            variant={review ? "outline" : "default"}
            aria-pressed={!review}
            onClick={() => setReview(false)}
          >
            Manual creation
          </Button>
          <Button
            type="button"
            size="sm"
            variant={review ? "default" : "outline"}
            aria-pressed={review}
            onClick={() => {
              setReview(true);
              void result.refetch();
            }}
          >
            Codex reviews{rows.length ? " (" + rows.length + ")" : ""}
          </Button>
        </div>
      )}
      <div hidden={review}>{children}</div>
      {review && (
        <section aria-label="Codex review queue" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Codex reviews</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => result.refetch()}
              disabled={result.isFetching}
            >
              Refresh
            </Button>
          </div>
          {result.isError && <p role="alert">{result.error.message}</p>}
          {!result.isError && !rows.length && (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              No proposals to review. In Codex, ask “Create a market” or “Check
              expired markets”.
            </p>
          )}
          {rows.map((row) => (
            <ProposalCard
              key={row.id + "-" + row.revision}
              row={row}
              blocked={blocked}
              refresh={refresh}
            />
          ))}
        </section>
      )}
    </div>
  );
}
