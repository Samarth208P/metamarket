import type { Market } from "@shared/api";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  ListFilter,
  Loader2,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { adminRequest, formatRupees, marketTypeLabels } from "./markets";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const statuses = {
  open: {
    label: "Open",
    style: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  closed: {
    label: "Awaiting resolution",
    style: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  resolved: { label: "Resolved", style: "bg-muted text-muted-foreground" },
};

const filters = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Awaiting resolution" },
  { id: "resolved", label: "Resolved" },
] as const;

function getMarketStatus(market: Market, now: number): keyof typeof statuses {
  if (market.status !== "active") return "resolved";
  return market.endDate && Date.parse(market.endDate) <= now
    ? "closed"
    : "open";
}

function getOutcomes(market: Market) {
  if (market.marketType === "multi") return market.options ?? [];
  if (market.marketType === "versus") {
    return [
      { id: "yes", name: market.optionA || market.shortA || "Side A" },
      { id: "no", name: market.optionB || market.shortB || "Side B" },
    ];
  }
  return [
    { id: "yes", name: "Yes" },
    { id: "no", name: "No" },
  ];
}

function toLocalInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

type MarketActionProps = {
  market: Market;
  onUpdated: (market: Market) => void;
};

function EditMarket({ market, onUpdated }: MarketActionProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [baseB, setBaseB] = useState("");
  const [minB, setMinB] = useState("");
  const [isDynamic, setIsDynamic] = useState(false);
  const { toast } = useToast();

  const update = useMutation({
    mutationFn: () =>
      adminRequest<Market>(
        `/markets/${market.id}`,
        "Unable to update market.",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endDate:
              date === toLocalInputValue(market.endDate)
                ? undefined
                : date
                  ? new Date(date).toISOString()
                  : null,
            initialB: Number(baseB),
            minB: Number(minB),
            isDynamic,
          }),
        },
      ),
    onSuccess: (updatedMarket) => {
      onUpdated(updatedMarket);
      setOpen(false);
      toast({
        title: "Market settings saved",
        description: updatedMarket.title,
        notificationKind: "market",
        notificationHref: `/market/${updatedMarket.id}`,
      });
    },
  });

  function changeOpen(nextOpen: boolean) {
    if (update.isPending) return;
    if (nextOpen) {
      setDate(toLocalInputValue(market.endDate));
      setBaseB(String(market.initialB ?? 1000));
      setMinB(String(market.minB ?? 250));
      setIsDynamic(Boolean(market.isDynamic));
      update.reset();
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="hover:bg-muted hover:text-foreground"
        >
          Edit settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl">
        <DialogHeader className="pr-5">
          <DialogTitle>Edit market settings</DialogTitle>
          <DialogDescription>{market.title}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!update.isPending) update.mutate();
          }}
        >
          <fieldset disabled={update.isPending} className="min-w-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-market-close">Closes at (optional)</Label>
              <Input
                id="edit-market-close"
                type="datetime-local"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-describedby="edit-market-close-hint"
              />
              <p
                id="edit-market-close-hint"
                className="text-xs text-muted-foreground"
              >
                Your local time. Leave blank to keep trading open until
                resolution.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-market-base">Base liquidity (B)</Label>
                <Input
                  id="edit-market-base"
                  type="number"
                  min={1}
                  step="any"
                  value={baseB}
                  onChange={(event) => setBaseB(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-market-min">Minimum liquidity (B)</Label>
                <Input
                  id="edit-market-min"
                  type="number"
                  min={1}
                  step="any"
                  value={minB}
                  onChange={(event) => setMinB(event.target.value)}
                  required
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={isDynamic}
                onChange={(event) => setIsDynamic(event.target.checked)}
              />{" "}
              Dynamic liquidity
            </label>
          </fieldset>
          {update.error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {update.error.message}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => changeOpen(false)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveMarket({ market, onUpdated }: MarketActionProps) {
  const [open, setOpen] = useState(false);
  const [optionId, setOptionId] = useState("");
  const { toast } = useToast();
  const outcomes = getOutcomes(market);

  const resolve = useMutation({
    mutationFn: () =>
      adminRequest<Market>(
        `/markets/${market.id}/resolve`,
        "Unable to resolve market.",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId }),
        },
      ),
    onSuccess: (updatedMarket) => {
      setOpen(false);
      onUpdated(updatedMarket);
      toast({
        title: "Market resolved",
        description: updatedMarket.title,
        notificationKind: "market",
        notificationHref: `/market/${updatedMarket.id}`,
        notificationKey: `resolved:${updatedMarket.id}`,
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (resolve.isPending) return;
        setOpen(nextOpen);
        if (nextOpen) {
          setOptionId("");
          resolve.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
          disabled={!outcomes.length}
        >
          Resolve market
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl">
        <DialogHeader className="pr-5">
          <DialogTitle>Resolve market</DialogTitle>
          <DialogDescription>{market.title}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (optionId && !resolve.isPending) resolve.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="market-winner">Winning outcome</Label>
            <Select
              value={optionId}
              onValueChange={setOptionId}
              disabled={resolve.isPending}
            >
              <SelectTrigger id="market-winner">
                <SelectValue placeholder="Choose an outcome" />
              </SelectTrigger>
              <SelectContent>
                {outcomes.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            Confirming ends trading and pays out winning positions. Settlement
            is final.
          </p>
          {resolve.error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {resolve.error.message}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={resolve.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!optionId || resolve.isPending}
            >
              {resolve.isPending ? "Resolving…" : "Confirm resolution"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MarketDirectory({
  markets,
  isLoading,
  hasError,
  onRetry,
  onUpdated,
}: {
  markets: Market[];
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onUpdated: (market: Market) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [expandedId, setExpandedId] = useState<string>();
  const now = Date.now();
  const term = search.trim().toLowerCase();
  const visibleMarkets = markets.filter((market) => {
    const matchesStatus =
      filter === "all" || filter === getMarketStatus(market, now);
    return (
      matchesStatus &&
      [market.title, market.category].some((value) =>
        value.toLowerCase().includes(term),
      )
    );
  });

  return (
    <section
      id="manage-markets"
      aria-labelledby="manage-markets-title"
      className="min-w-0 scroll-mt-20 self-start rounded-2xl border bg-card shadow-sm lg:sticky lg:top-20"
    >
      <header className="flex items-center gap-3 border-b px-4 py-3.5 sm:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <ListFilter className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="manage-markets-title"
            className="text-lg font-bold tracking-tight"
          >
            Manage markets
          </h2>
          <p className="text-sm text-muted-foreground">
            Find, edit, and resolve existing markets.
          </p>
        </div>
      </header>

      <div className="space-y-3 border-b px-4 py-4 sm:px-6">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search managed markets"
            placeholder="Search by title or category"
            className="bg-background pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div
          role="group"
          aria-label="Market status"
          className="flex flex-wrap gap-1.5"
        >
          {filters.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={filter === id}
              className="h-8 border-transparent bg-transparent px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:border-primary/20 aria-pressed:bg-primary/10 aria-pressed:font-semibold aria-pressed:text-foreground"
              onClick={() => setFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 px-4 py-14 text-sm text-muted-foreground"
        >
          <Loader2
            className="size-4 motion-safe:animate-spin"
            aria-hidden="true"
          />{" "}
          Loading markets…
        </div>
      ) : hasError && !markets.length ? (
        <div className="space-y-3 px-4 py-12 text-center">
          <p role="alert" className="text-sm font-semibold">
            Unable to load markets.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <p
            role="status"
            className="border-b bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground sm:px-6"
          >
            {visibleMarkets.length === markets.length
              ? `${markets.length} ${markets.length === 1 ? "market" : "markets"}`
              : `${visibleMarkets.length} of ${markets.length} markets`}
          </p>
          {visibleMarkets.length === 0 ? (
            <div className="space-y-3 px-4 py-12 text-center">
              <p className="text-sm font-semibold">
                {markets.length ? "No matching markets" : "No markets yet"}
              </p>
              {markets.length ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  New markets will appear here after you create them.
                </p>
              )}
            </div>
          ) : (
            <ul
              aria-label="Markets"
              className="divide-y overflow-y-auto rounded-b-2xl lg:max-h-[max(15rem,calc(100dvh-19rem))]"
            >
              {visibleMarkets.map((market) => {
                const status = getMarketStatus(market, now);
                const isExpanded = market.id === expandedId;
                const winnerId =
                  market.resolvedOptionId ||
                  (market.status === "resolved_yes" ? "yes" : "no");
                const winner =
                  status === "resolved" &&
                  getOutcomes(market).find(({ id }) => id === winnerId)?.name;

                return (
                  <li key={market.id}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={`market-details-${market.id}`}
                      className="flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-expanded:bg-primary/[0.045] sm:px-6"
                      onClick={() =>
                        setExpandedId(isExpanded ? undefined : market.id)
                      }
                    >
                      {market.logoUrl && (
                        <img
                          src={market.logoUrl}
                          alt=""
                          loading="lazy"
                          className="size-9 shrink-0 rounded-lg border object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium",
                              statuses[status].style,
                            )}
                          >
                            <span
                              className="size-1.5 rounded-full bg-current"
                              aria-hidden="true"
                            />
                            {statuses[status].label}
                          </span>
                          <span>{market.category}</span>
                          <span aria-hidden="true">/</span>
                          <span>{marketTypeLabels[market.marketType]}</span>
                        </span>
                        <span className="mt-1.5 block text-sm font-semibold leading-snug text-foreground">
                          {market.title}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {market.endDate && (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarClock
                                className="size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              <time dateTime={market.endDate}>
                                {dateFormat.format(new Date(market.endDate))}
                              </time>
                            </span>
                          )}
                          <span className="tabular-nums">
                            {formatRupees(market.volume)} volume
                          </span>
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "mt-0.5 size-4 shrink-0 text-muted-foreground",
                          isExpanded && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    <div
                      id={`market-details-${market.id}`}
                      hidden={!isExpanded}
                      className="space-y-3 border-t bg-muted/15 px-4 py-4 sm:px-6"
                    >
                      {isExpanded && (
                        <>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                            {market.description}
                          </p>
                          {winner && (
                            <p className="text-sm font-medium">
                              Winner{" "}
                              <span className="ml-1 font-semibold text-primary">
                                {winner}
                              </span>
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            {status !== "resolved" && (
                              <>
                                <EditMarket
                                  market={market}
                                  onUpdated={onUpdated}
                                />
                                <ResolveMarket
                                  market={market}
                                  onUpdated={onUpdated}
                                />
                              </>
                            )}
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="hover:bg-muted hover:text-foreground"
                            >
                              <Link to={`/market/${market.id}`}>
                                View market <ArrowUpRight aria-hidden="true" />
                              </Link>
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
