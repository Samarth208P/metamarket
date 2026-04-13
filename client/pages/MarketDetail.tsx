import { Layout } from "@/components/Layout";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Market } from "@shared/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CommentsSection } from "@/components/CommentsSection";

async function fetchMarket(id: string): Promise<Market> {
  const response = await fetch(`/mapi/markets/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Market not found");
  }

  return response.json();
}

export default function MarketDetail() {
  const { id } = useParams();
  const { data: market, isLoading, isError } = useQuery<Market>({
    queryKey: ["market", id],
    queryFn: () => fetchMarket(id ?? ""),
    enabled: Boolean(id),
  });

  const chartData = market?.priceHistory.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    yes: point.yesPrice,
    no: point.noPrice,
  })) || [];

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-primary hover:opacity-80 transition-opacity mb-6 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Markets
        </Link>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <img src="/animated-logo.svg" alt="Loading" className="w-16 h-16" />
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest italic">Analyzing Market...</p>
          </div>
        ) : isError || !market ? (
          <div className="text-center py-16 text-muted-foreground">Unable to load market details.</div>
        ) : (
          <section className="space-y-6 max-w-6xl mx-auto">
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              {/* Main Info */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted px-2 py-1 rounded-md">
                    {market.category}
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3 leading-tight">{market.title}</h1>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{market.description}</p>

                <div className="flex gap-4 border-t border-border pt-4 mt-auto">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-muted-foreground uppercase mb-1">Vol</span>
                    <span className="text-base font-bold">₹{market.volume.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Price Panel (Mimicking a trading panel) */}
              <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-center">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">Current Odds</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border border-yes/30 bg-yes/5 rounded-lg">
                    <span className="font-bold text-yes">Yes</span>
                    <span className="text-2xl font-bold">{market.yesPrice.toFixed(0)}p</span>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-no/30 bg-no/5 rounded-lg">
                    <span className="font-bold text-no">No</span>
                    <span className="text-2xl font-bold">{market.noPrice.toFixed(0)}p</span>
                  </div>
                </div>
                {market.status === 'active' && (
                  <p className="text-xs text-center text-muted-foreground mt-4 font-medium">
                    Click market card on home page to trade.
                  </p>
                )}
              </div>
            </div>

            {/* Chart Area */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-lg font-bold text-foreground mb-6">Price History</h2>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                    <XAxis dataKey="time" tick={{ fill: '#888', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value) => `${value.toFixed(0)}p`} tick={{ fill: '#888', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} />
                    <Line type="stepAfter" dataKey="yes" stroke="hsl(var(--yes-color))" strokeWidth={2} dot={false} name="YES" />
                    <Line type="stepAfter" dataKey="no" stroke="hsl(var(--no-color))" strokeWidth={2} dot={false} name="NO" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <CommentsSection marketId={market.id} isLive={market.status === 'active'} />
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
