import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { BinaryChart } from "@/components/BinaryChart";
import { BinaryTradePanel } from "@/components/BinaryTradePanel";
import { useBinanceFeed } from "@/hooks/use-binance-feed";
import type { BinaryMarket as BinaryMarketType } from "@shared/binaryPrice";
import { ArrowUp, ArrowDown, Clock, Trophy, Activity, Globe, Info, ShieldCheck, Target } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function BinaryMarket() {
  const { price, isConnected, priceHistory } = useBinanceFeed();
  const { user, refreshUser } = useAuth();

  // Fetch the active market from the backend
  const { data: activeData, refetch: refetchActive } = useQuery({
    queryKey: ["binary-market-active"],
    queryFn: async () => {
      const res = await fetch("/mapi/binary-markets/active", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 3000,
    staleTime: 1000,
  });

  const [viewMode, setViewMode] = useState<"live" | "review">("live");
  const [reviewMarketId, setReviewMarketId] = useState<string | null>(null);
  const lastActiveId = React.useRef<string | null>(null);

  // Transition to review mode when active market changes
  useEffect(() => {
    const activeId = activeData?.market?.id;
    if (!activeId) return;

    if (viewMode === "live" && lastActiveId.current && lastActiveId.current !== activeId) {
      setReviewMarketId(lastActiveId.current);
      setViewMode("review");
    }
    lastActiveId.current = activeId;
  }, [activeData?.market?.id, viewMode]);

  // Continuously poll the review market until the backend scheduler officially settles it
  const { data: reviewMarketData } = useQuery({
    queryKey: ["binary-market-review", reviewMarketId],
    queryFn: async () => {
      if (!reviewMarketId) return null;
      const res = await fetch(`/mapi/binary-markets/${reviewMarketId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!reviewMarketId && viewMode === "review",
    refetchInterval: (query) => {
      const data: any = query.state?.data;
      return (data && data.status?.startsWith('settled')) ? false : 2000;
    },
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

  const activeMarket: BinaryMarketType | null = activeData?.market ?? null;
  const reviewMarket: BinaryMarketType | null = reviewMarketData ?? null;
  const history: BinaryMarketType[] = historyData ?? [];

  const displayedMarket = viewMode === "review" && reviewMarket ? reviewMarket : activeMarket;
  const isFrozen = viewMode === "review" && displayedMarket.status.startsWith("settled");

  // Build recent prices array from our client-side feed
  const recentPrices = priceHistory.slice(-30).map((p) => p.price);

  // Periodic user balance refresh (every 10 seconds)
  useEffect(() => {
    if (!user || user.isGuest) return;
    const interval = setInterval(() => {
      refreshUser();
    }, 10000);
    return () => clearInterval(interval);
  }, [user, refreshUser]);

  // Refresh balance when market officially settles
  const marketStatus = displayedMarket?.status;
  useEffect(() => {
    if (marketStatus && marketStatus.startsWith('settled')) {
      refreshUser();
    }
  }, [marketStatus, refreshUser]);

  return (
    <Layout>
      <div className="min-h-screen py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Chart — spans 2 cols on lg */}
          <div className="lg:col-span-2">
            <BinaryChart
              priceHistory={priceHistory}
              targetPrice={displayedMarket?.targetPrice ?? price}
              currentPrice={price}
              isConnected={isConnected}
              frozenAtTime={isFrozen ? new Date(displayedMarket.endTime).getTime() : undefined}
              frozenPrice={isFrozen ? displayedMarket.finalPrice : undefined}
            />

            {/* History Tracker Between Chart and Description */}
            <div className="mt-8 flex items-center gap-4 bg-zinc-900/40 border border-white/5 rounded-2xl px-5 py-3.5 backdrop-blur-sm shadow-inner max-w-fit">
               <div className="border-r border-white/10 pr-4">
                  <Clock className="w-4 h-4 text-zinc-500" />
               </div>
               <div className="pl-1">
                  <PastOutcomes history={history} />
               </div>
            </div>

            {/* Adjusted Market Description Section */}
            <div className="mt-8 space-y-6">
              <div>
                <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-2 tracking-[0.2em]">Description</h4>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                  Predict whether Bitcoin's price will be above or below a target snapshot in 5-minute cycles. 
                  Markets resolve based on the final price against the target price. If Final ≥ Target, <strong>UP</strong> wins. 
                  Otherwise, <strong>DOWN</strong> wins.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-white/5">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-2 tracking-[0.2em]">Price Source</h4>
                  <p className="text-sm text-zinc-300 font-medium">
                    Binance BTC/USDT Live Feed
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Ultra-low latency WebSocket synchronization.
                  </p>
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-2 tracking-[0.2em]">Settlement</h4>
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
            <BinaryTradePanel
              market={displayedMarket}
              currentPrice={price}
              recentPrices={recentPrices}
              isConnected={isConnected}
              isFrozen={isFrozen}
              onGoLive={() => setViewMode("live")}
            />
          </div>
        </div>

      </div>
    </Layout>
  );
}

function PastOutcomes({ history }: { history: BinaryMarketType[] }) {
  // Render the oldest left, newest right. We take the most recent 5
  const recent = [...history].slice(0, 5).reverse();
  
  if (recent.length === 0) {
    return (
      <div className="flex gap-2.5 opacity-20">
        {[1,2,3,4,5].map(i => <div key={i} className="w-7 h-7 rounded-full bg-zinc-700" />)}
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
        {recent.map((m) => {
          const isUp = m.status === "settled_up";
          return (
            <div 
              key={m.id} 
              className={`w-7 h-7 rounded-full flex items-center justify-center shadow-inner ${isUp ? 'bg-[#5dbf75]' : 'bg-[#ef4444]'}`}
            >
              {isUp ? (
                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 5l7 11H5z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-white transform rotate-180" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 5l7 11H5z" />
                </svg>
              )}
            </div>
          );
        })}
    </div>
  );
}
