import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { BinaryChart } from "@/components/BinaryChart";
import { BinaryTradePanel } from "@/components/BinaryTradePanel";
import { useBinanceFeed } from "@/hooks/use-binance-feed";
import {
  BINARY_OUTCOME_HISTORY_LIMIT,
  type BinaryMarket as BinaryMarketType,
} from "@shared/binaryPrice";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { BINARY_ASSETS, type BinaryAssetPair } from "@shared/binaryAssets";
import {
  activeBinaryMarketQuery,
  binaryOutcomeHistoryQuery,
  binaryPriceHistoryQuery,
} from "@/lib/binary-markets";

const payoutFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

export default function BinaryMarket({
  assetPair,
}: {
  assetPair: BinaryAssetPair;
}) {
  const asset = BINARY_ASSETS[assetPair];
  const { price, isConnected, priceHistory } = useBinanceFeed(assetPair);
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const initialSide = searchParams.get("side") === "down" ? "down" : "up";

  const { data: savedPrices, isPending: isPriceHistoryPending } = useQuery(
    binaryPriceHistoryQuery(assetPair),
  );

  const { data: activeData, isError: activeMarketError } = useQuery(
    activeBinaryMarketQuery(assetPair),
  );

  const chartHistory = useMemo(() => {
    if (!savedPrices?.length) return priceHistory;
    const lastSaved = savedPrices[savedPrices.length - 1].timestamp;
    return [
      ...savedPrices,
      ...priceHistory.filter((point) => point.timestamp > lastSaved),
    ];
  }, [savedPrices, priceHistory]);
  const chartPrice =
    isConnected && price > 0
      ? price
      : activeData?.livePrice ||
        chartHistory[chartHistory.length - 1]?.price ||
        0;

  const { data: historyData } = useQuery(binaryOutcomeHistoryQuery(assetPair));

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
  const latestSettlement = useRef<number>();

  useEffect(() => {
    latestSettlement.current = undefined;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !historyData) return;
    const latest = historyData[0] ? Date.parse(historyData[0].endTime) : 0;
    const previous = latestSettlement.current;
    if (previous !== undefined) {
      for (const market of historyData) {
        if (Date.parse(market.endTime) <= previous) break;
        const positions = market.trades.filter(
          (trade) => trade.userId === user.id && !trade.sold,
        );
        if (!positions.length) continue;
        const payout = positions.reduce(
          (total, trade) => total + trade.payout,
          0,
        );
        toast({
          type: "background",
          title: `${asset.symbol} market settled`,
          description: `${market.status === "settled_up" ? "UP" : "DOWN"} won. Payout ${payoutFormat.format(payout)}.`,
          notificationKind: "market",
          notificationHref: asset.path,
          notificationKey: `${asset.symbol.toLowerCase()}-settled:${market.id}`,
        });
      }
    }
    latestSettlement.current = Math.max(previous ?? latest, latest);
  }, [asset, historyData, user?.id]);

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
  }, [latestSettledMarketId, user?.id]);

  return (
    <Layout>
      <div className="min-h-screen py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Chart — spans 2 cols on lg */}
          <div className="lg:col-span-2">
            <BinaryChart
              asset={asset}
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
                <PastOutcomes history={history} symbol={asset.symbol} />
              </div>
            </div>

            {/* Adjusted Market Description Section - Hidden on Mobile */}
            <div className="hidden lg:block mt-8 space-y-6">
              <div>
                <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-2 tracking-[0.2em]">
                  Description
                </h4>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                  Predict whether the {asset.symbol} price will be above or
                  below a target snapshot in 5-minute cycles. Markets resolve
                  based on the final price against the target price. If Final ≥
                  Target, <strong>UP</strong> wins. Otherwise,{" "}
                  <strong>DOWN</strong> wins. Buy and sell quotes vary by up to
                  half a paisa on either side of the market price. The spread
                  updates every five seconds.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-white/5">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-2 tracking-[0.2em]">
                    Price Source
                  </h4>
                  <p className="text-sm text-zinc-300 font-medium">
                    Binance {asset.symbol}/USDT Live Feed
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
                Live {asset.symbol} markets are temporarily unavailable.
              </p>
            ) : (
              <BinaryTradePanel
                key={`${activeMarket?.id}:${initialSide}`}
                asset={asset}
                initialSide={initialSide}
                market={activeMarket}
                quotes={activeMarketError ? undefined : activeData?.quotes}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function PastOutcomes({
  history,
  symbol,
}: {
  history: BinaryMarketType[];
  symbol: string;
}) {
  // Render the oldest on the left and the newest on the right.
  const recent = history.slice(0, BINARY_OUTCOME_HISTORY_LIMIT).reverse();

  if (recent.length === 0) {
    return (
      <div className="flex gap-2.5 opacity-20">
        {Array.from({ length: BINARY_OUTCOME_HISTORY_LIMIT }, (_, i) => (
          <div key={i} className="w-7 h-7 rounded-full bg-zinc-700" />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex gap-2.5"
      role="group"
      aria-label={`Recent ${symbol} outcomes`}
    >
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
