import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { BinaryChart } from "@/components/BinaryChart";
import { BinaryTradePanel } from "@/components/BinaryTradePanel";
import { useBinanceFeed } from "@/hooks/use-binance-feed";
import {
  BTC_OUTCOME_HISTORY_LIMIT,
  type BinaryMarket as BinaryMarketType,
  type PricePoint,
} from "@shared/binaryPrice";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function BinaryMarket() {
  const { price, isConnected, priceHistory } = useBinanceFeed();
  const { user, refreshUser } = useAuth();

  const { data: savedPrices, isPending: isPriceHistoryPending } = useQuery({
    queryKey: ["binary-market-price-history"],
    queryFn: async ({ signal }): Promise<PricePoint[]> => {
      const response = await fetch("/mapi/binary-markets/price-history", {
        signal,
      });
      if (!response.ok) throw new Error("Failed to load BTC price history");
      return response.json();
    },
    refetchInterval: 10_000,
    staleTime: 5000,
  });

  const chartHistory = useMemo(() => {
    if (!savedPrices?.length) return priceHistory;
    const lastSaved = savedPrices[savedPrices.length - 1].timestamp;
    return [
      ...savedPrices,
      ...priceHistory.filter((point) => point.timestamp > lastSaved),
    ];
  }, [savedPrices, priceHistory]);
  const chartPrice = chartHistory[chartHistory.length - 1]?.price ?? price;

  // Fetch the active market from the backend
  const { data: activeData, isError: activeMarketError } = useQuery({
    queryKey: ["binary-market-active"],
    queryFn: async () => {
      const res = await fetch("/mapi/binary-markets/active", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    // Poll faster when no market is active (gap between cycles)
    refetchInterval: (query) => (query.state.data?.market ? 3000 : 1500),
    staleTime: 1000,
  });

  // Fetch settled market history
  const { data: historyData } = useQuery({
    queryKey: ["binary-market-history"],
    queryFn: async () => {
      const res = await fetch("/mapi/binary-markets/history", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // Build recent prices array from our client-side feed
  const recentPrices = priceHistory.slice(-30).map((p) => p.price);

  // Server-authoritative probability from /active endpoint
  const serverProbability = activeData?.probability ?? null;

  // Periodic user balance refresh (every 10 seconds)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshUser();
    }, 10000);
    return () => clearInterval(interval);
  }, [user, refreshUser]);

  const activeMarket: BinaryMarketType | null = activeData?.market ?? null;
  const history: BinaryMarketType[] = historyData ?? [];

  // Keep a stable reference to the last known target price and market
  // so the chart doesn't break when market is null between cycles
  const lastTargetPriceRef = useRef<number>(0);
  useEffect(() => {
    if (activeMarket) {
      lastTargetPriceRef.current = activeMarket.targetPrice;
    }
  }, [activeMarket]);

  const stableTargetPrice =
    activeMarket?.targetPrice ?? (lastTargetPriceRef.current || chartPrice);

  // Refresh balance when market officially settles
  const latestSettledMarketId = history[0]?.id;
  useEffect(() => {
    if (latestSettledMarketId) {
      refreshUser();
    }
  }, [latestSettledMarketId, refreshUser]);

  return (
    <Layout>
      <div className="min-h-screen py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Chart — spans 2 cols on lg */}
          <div className="lg:col-span-2">
            <BinaryChart
              priceHistory={isPriceHistoryPending ? [] : chartHistory}
              targetPrice={stableTargetPrice}
              currentPrice={chartPrice}
              isConnected={isConnected}
            />

            <div className="flex mt-5 lg:mt-8 items-center gap-4 bg-zinc-900/40 border border-white/5 rounded-2xl px-5 py-3.5 backdrop-blur-sm shadow-inner max-w-fit">
              <div className="border-r border-white/10 pr-4">
                <Clock className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="pl-1">
                <PastOutcomes history={history} />
              </div>
            </div>

            {/* Adjusted Market Description Section - Hidden on Mobile */}
            <div className="hidden lg:block mt-8 space-y-6">
              <div>
                <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-2 tracking-[0.2em]">
                  Description
                </h4>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                  Predict whether Bitcoin's price will be above or below a
                  target snapshot in 5-minute cycles. Markets resolve based on
                  the final price against the target price. If Final ≥ Target,{" "}
                  <strong>UP</strong> wins. Otherwise, <strong>DOWN</strong>{" "}
                  wins.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-white/5">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-2 tracking-[0.2em]">
                    Price Source
                  </h4>
                  <p className="text-sm text-zinc-300 font-medium">
                    Binance BTC/USDT Live Feed
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Ultra-low latency WebSocket synchronization.
                  </p>
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-2 tracking-[0.2em]">
                    Settlement
                  </h4>
                  <p className="text-sm text-zinc-300 font-medium">
                    Automatic Payouts
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Winnings are credited to your balance instantly upon expiry.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Trade Panel */}
          <div className="lg:col-span-1">
            {activeMarketError && !activeData ? (
              <p className="text-muted-foreground" role="status">
                Live BTC markets are temporarily unavailable.
              </p>
            ) : (
              <BinaryTradePanel
                market={activeMarket}
                currentPrice={price}
                recentPrices={recentPrices}
                isConnected={isConnected}
                serverProbability={serverProbability}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function PastOutcomes({ history }: { history: BinaryMarketType[] }) {
  // Render the oldest on the left and the newest on the right.
  const recent = history.slice(0, BTC_OUTCOME_HISTORY_LIMIT).reverse();

  if (recent.length === 0) {
    return (
      <div className="flex gap-2.5 opacity-20">
        {Array.from({ length: BTC_OUTCOME_HISTORY_LIMIT }, (_, i) => (
          <div key={i} className="w-7 h-7 rounded-full bg-zinc-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2.5" role="group" aria-label="Recent BTC outcomes">
      {recent.map((m) => {
        const isUp = m.status === "settled_up";
        const time = new Date(m.endTime).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const label = `${time} outcome · ${isUp ? "UP" : "DOWN"}`;
        return (
          <Tooltip key={m.id}>
            <TooltipTrigger asChild>
              <span
                role="img"
                tabIndex={0}
                aria-label={label}
                className={`w-7 h-7 rounded-full flex items-center justify-center shadow-inner focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isUp ? "bg-[#5dbf75]" : "bg-[#ef4444]"}`}
              >
                <svg
                  aria-hidden="true"
                  className={`w-3.5 h-3.5 text-white ${isUp ? "" : "rotate-180"}`}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 5l7 11H5z" />
                </svg>
              </span>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
