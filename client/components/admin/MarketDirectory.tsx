import type { Market } from "@shared/api";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Activity,
  CheckCheck,
  ChevronDown,
  Clock3,
  Layers3,
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
import { DisclosurePanel } from "@/components/ui/disclosure-panel";

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
  {
    id: "all",
    label: "All markets",
    icon: Layers3,
    color: "bg-primary/10 text-primary",
  },
  {
    id: "open",
    label: "Open",
    icon: Activity,
    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "closed",
    label: "Awaiting resolution",
    icon: Clock3,
    color: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  {
    id: "resolved",
    label: "Resolved",
    icon: CheckCheck,
    color: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
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
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl"
        overlayClassName="bg-black/60"
      >
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
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl"
        overlayClassName="bg-black/60"
      >
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
  const counts = { all: markets.length, open: 0, closed: 0, resolved: 0 };
  for (const market of markets) counts[getMarketStatus(market, now)]++;
  const countAvailable = !isLoading && !(hasError && !markets.length);
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
    <div className="space-y-5 sm:space-y-6">
      <div
        role="group"
        aria-label="Filter markets by status"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
      >
        {filters.map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            aria-controls="manage-markets"
            onClick={() => setFilter(id)}
            className="admin-filter relative flex min-w-0 flex-col items-start gap-2 rounded-xl border bg-card/60 px-3.5 py-3 text-left sm:gap-3 sm:px-5 sm:py-4"
          >
            <span className="flex w-full items-center justify-between gap-1.5">
              <span className="text-xs font-medium sm:text-sm">{label}</span>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-md sm:size-7",
                  color,
                )}
              >
                <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
              </span>
            </span>
            <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums sm:text-3xl">
              {countAvailable ? counts[id] : "—"}
            </span>
          </button>
        ))}
      </div>
      <section
        id="manage-markets"
        aria-labelledby="market-directory-title"
        className="min-w-0 overflow-hidden rounded-xl border bg-card"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <h2
            id="market-directory-title"
            className="text-lg font-semibold tracking-tight"
          >
            Market directory
          </h2>
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search managed markets"
              placeholder="Search by title or category"
              className="h-9 bg-background/70 pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </header>

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
            <p role="status" className="sr-only">
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
              <>
                <div
                  aria-hidden="true"
                  className="admin-columns admin-column-labels border-b bg-background/35 text-xs font-medium text-muted-foreground"
                >
                  <span>Market</span>
                  <span>Status</span>
                  <span>Closes</span>
                  <span className="text-right">Volume</span>
                </div>
                <ul aria-label="Markets" className="divide-y">
                  {visibleMarkets.map((market) => {
                    const status = getMarketStatus(market, now);
                    const isExpanded = market.id === expandedId;
                    const winnerId =
                      market.resolvedOptionId ||
                      (market.status === "resolved_yes" ? "yes" : "no");
                    const winner =
                      status === "resolved" &&
                      getOutcomes(market).find(({ id }) => id === winnerId)
                        ?.name;

                    return (
                      <li key={market.id}>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={`market-details-${market.id}`}
                          className="admin-columns admin-row w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-expanded:bg-primary/[0.035]"
                          onClick={() =>
                            setExpandedId(isExpanded ? undefined : market.id)
                          }
                        >
                          <span className="admin-market-name flex min-w-0 items-center gap-3">
                            {market.logoUrl ? (
                              <img
                                src={market.logoUrl}
                                alt=""
                                loading="lazy"
                                className="size-11 shrink-0 rounded-lg border object-cover"
                              />
                            ) : (
                              <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-muted/50 text-muted-foreground">
                                <Layers3
                                  className="size-5"
                                  aria-hidden="true"
                                />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold leading-snug text-foreground">
                                {market.title}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {market.category}{" "}
                                <span aria-hidden="true">·</span>{" "}
                                {marketTypeLabels[market.marketType]}
                              </span>
                            </span>
                          </span>
                          <span
                            className={cn(
                              "admin-market-status inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium leading-none",
                              statuses[status].style,
                            )}
                          >
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-current"
                              aria-hidden="true"
                            />
                            {statuses[status].label}
                          </span>
                          <span className="admin-market-close text-xs text-muted-foreground">
                            <span className="sr-only">Closes </span>
                            {market.endDate ? (
                              <time dateTime={market.endDate}>
                                {dateFormat.format(new Date(market.endDate))}
                              </time>
                            ) : (
                              "No cutoff"
                            )}
                          </span>
                          <span className="admin-market-volume text-sm font-medium tabular-nums">
                            {formatRupees(market.volume)}
                            <span className="text-xs font-normal text-muted-foreground md:sr-only">
                              {" "}
                              volume
                            </span>
                          </span>
                          <ChevronDown
                            className={cn(
                              "ui-chevron admin-row-chevron size-4 text-muted-foreground",
                              isExpanded && "rotate-180",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                        <DisclosurePanel
                          id={`market-details-${market.id}`}
                          open={isExpanded}
                        >
                          <div className="space-y-3 border-t bg-background/35 px-4 py-4 md:pl-[4.75rem] md:pr-6">
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
                              {status !== "resolved" &&
                                !market.codexSourceUrl && (
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
                                  View market{" "}
                                  <ArrowUpRight aria-hidden="true" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </DisclosurePanel>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
