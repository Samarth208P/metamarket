import { Layout } from "@/components/Layout";
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  ChevronDown,
  Clock,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { groupPortfolioHistory } from "@/lib/portfolio-history";

const cashAmount = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

function formatActivityDate(timestamp: string) {
  return new Date(timestamp).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

export default function Portfolio() {
  const { user, clearHistory } = useAuth();
  const { markets, totalTrades } = groupPortfolioHistory(user?.tradeHistory);

  const handleClearHistory = async () => {
    if (
      window.confirm(
        "Are you sure you want to clear your entire trade history? This cannot be undone.",
      )
    ) {
      await clearHistory();
    }
  };

  return (
    <Layout>
      <section className="container mx-auto px-4 py-8 md:py-16">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <Briefcase className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Your Portfolio
              </h1>
              <p className="text-muted-foreground">
                Track your betting history and past performance
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Available Balance
                </p>
                <div className="h-2 w-2 rounded-full bg-green-500" />
              </div>
              <p className="text-4xl font-black text-foreground">
                ₹{user?.balance.toLocaleString()}
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-center">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Total Trades
              </p>
              <p className="text-4xl font-black text-primary">{totalTrades}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <h2 className="font-semibold text-lg">Trade History</h2>
              {markets.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 h-8"
                  onClick={handleClearHistory}
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </Button>
              )}
            </div>

            {markets.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground/50 italic">
                No history
              </div>
            ) : (
              <div className="divide-y divide-border">
                {markets.map((market) => (
                  <details key={market.id} className="ui-details group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <div className="break-words font-semibold">
                          {market.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {market.trades.length}{" "}
                            {market.trades.length === 1 ? "trade" : "trades"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" aria-hidden="true" />
                            <time dateTime={market.latestActivity}>
                              {formatActivityDate(market.latestActivity)}
                            </time>
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                        {market.payout !== null && (
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">
                              Payout
                            </div>
                            <div
                              className={`font-semibold tabular-nums ${market.payout > 0 ? "text-green-500" : "text-muted-foreground"}`}
                            >
                              {cashAmount.format(market.payout)}
                            </div>
                          </div>
                        )}
                        <ChevronDown
                          className="ui-chevron size-4 text-muted-foreground group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </div>
                    </summary>

                    {market.trades.length > 0 ? (
                      <ul className="divide-y divide-border border-t border-border bg-muted/20">
                        {market.trades.map(({ entry, price }, index) => {
                          const isBuy = entry.tradeType === "buy";
                          const DirectionIcon = isBuy
                            ? ArrowDownRight
                            : ArrowUpRight;
                          return (
                            <li
                              key={index}
                              className="flex items-center justify-between gap-3 px-4 py-3 sm:pl-8"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="break-words text-primary border-primary/40"
                                  >
                                    {entry.optionName || entry.optionId}
                                  </Badge>
                                  {price && (
                                    <span className="text-sm text-muted-foreground">
                                      @ {price}
                                    </span>
                                  )}
                                </div>
                                <time
                                  dateTime={entry.timestamp}
                                  className="mt-1 block text-xs text-muted-foreground"
                                >
                                  {formatActivityDate(entry.timestamp)}
                                </time>
                              </div>
                              <div
                                className={`shrink-0 text-right ${isBuy ? "text-destructive" : "text-green-500"}`}
                              >
                                <div className="flex items-center justify-end gap-1 font-bold tabular-nums">
                                  <DirectionIcon
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                  {cashAmount.format(
                                    Math.abs(entry.cashDelta ?? entry.amount),
                                  )}
                                </div>
                                <span className="text-xs uppercase tracking-wider opacity-80">
                                  {entry.tradeType}
                                </span>
                                {isBuy && entry.fee > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    Includes {cashAmount.format(entry.fee)} fee
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="border-t border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:pl-8">
                        No buys or sells in history for this market.
                      </p>
                    )}
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
