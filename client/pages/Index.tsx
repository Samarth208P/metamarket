import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { MarketCard } from "@/components/MarketCard";
import { Market } from "@shared/api";
import { Search, Activity, CheckCircle2, Bookmark } from "lucide-react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

async function fetchMarkets(): Promise<Market[]> {
  const response = await fetch("/mapi/markets", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to load markets");
  }

  return response.json();
}

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const query = searchParams.get("q") || "";
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  const tags = ["Politics", "Crypto", "Sports", "Business", "Entertainment"];

  const { data, isLoading, isError } = useQuery<Market[]>({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    refetchInterval: 15000,
  });

  const [markets, setMarkets] = useState<Market[]>([]);

  const { user, refreshUser, bookmarks, isGuestUser } = useAuth();

  useEffect(() => {
    if (data) {
      setMarkets(data);
      refreshUser(); // Sync balance/holdings whenever markets update
    }
  }, [data]);

  const filteredMarkets = markets.filter((m) => {
    const matchesQuery =
      m.title.toLowerCase().includes(query.toLowerCase()) ||
      m.category.toLowerCase().includes(query.toLowerCase());
    const matchesTag =
      !selectedTag || m.category.toLowerCase() === selectedTag.toLowerCase();
    const matchesBookmarks = !showBookmarksOnly || bookmarks.includes(m.id);
    return matchesQuery && matchesTag && matchesBookmarks;
  });

  const liveMarkets = filteredMarkets.filter((m) => m.status === "active");
  const resolvedMarkets = filteredMarkets.filter((m) => m.status !== "active");

  const handleTrade = (marketId: string, updatedMarket: Market) => {
    setMarkets((current) =>
      current.map((market) =>
        market.id === marketId ? updatedMarket : market,
      ),
    );
  };

  return (
    <Layout>
      <section className="container mx-auto px-4 pt-2 pb-8 md:pt-4 max-w-[1400px]">
        {/* Tag Bar */}
        <div className="flex items-center gap-6 mb-4 overflow-x-auto pb-2 no-scrollbar border-b border-border/20">
          <button
            onClick={() => {
              setSelectedTag(null);
              setShowBookmarksOnly(false);
            }}
            className={cn(
              "px-1 py-3 text-sm font-bold transition-all whitespace-nowrap relative",
              !selectedTag && !showBookmarksOnly
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All Markets
            {!selectedTag && !showBookmarksOnly && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>

          {user && !isGuestUser && (
            <button
              onClick={() => {
                setShowBookmarksOnly(true);
                setSelectedTag(null);
              }}
              className={cn(
                "px-1 py-3 text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 relative",
                showBookmarksOnly
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Bookmark
                className={cn(
                  "w-4 h-4",
                  showBookmarksOnly ? "fill-current" : "",
                )}
              />
              Bookmarks
              {showBookmarksOnly && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          )}

          <div className="h-4 w-[1px] bg-border mx-2 shrink-0 opacity-50" />

          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                setSelectedTag(tag);
                setShowBookmarksOnly(false);
              }}
              className={cn(
                "px-1 py-3 text-sm font-bold transition-all whitespace-nowrap relative",
                selectedTag === tag
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tag}
              {selectedTag === tag && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {query && (
          <div className="mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Search className="w-5 h-5 text-muted-foreground" />
              Search results for "{query}"
            </h2>
          </div>
        )}

        {!query && !selectedTag && !showBookmarksOnly && (
          <Link
            to="/btc"
            className="block mb-8 relative rounded-2xl border border-border bg-card p-5 hover:border-primary/30 transition-all shadow-md group overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none" />
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#f7931a] flex items-center justify-center shrink-0 shadow-lg">
                  <span className="text-white text-2xl font-black">₿</span>
                </div>
                <h3 className="text-xl font-bold group-hover:text-primary transition-colors">
                  BTC 5 Minute Up or Down
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="bg-yes/20 rounded-xl p-3 flex justify-center text-yes border border-yes/20 font-bold text-lg hover:bg-yes/30 transition-colors">
                  Up
                </div>
                <div className="bg-no/20 rounded-xl p-3 flex justify-center text-no border border-no/20 font-bold text-lg hover:bg-no/30 transition-colors">
                  Down
                </div>
              </div>

              <div className="flex items-center justify-between mt-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-bold text-red-500 tracking-wider">
                    LIVE
                  </span>
                  <span>· Bitcoin</span>
                </div>
                <Bookmark className="w-4 h-4" />
              </div>
            </div>
          </Link>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <img src="/animated-logo.svg" alt="Loading" className="w-32 h-32" />
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
              Finding Markets
            </p>
          </div>
        ) : isError ? (
          <div className="text-center py-16">
            <p className="text-sm font-semibold text-muted-foreground">
              Unable to load markets right now.
            </p>
          </div>
        ) : filteredMarkets.length > 0 ? (
          <div className="space-y-12">
            {/* Live Markets Section */}
            {liveMarkets.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-yes" />
                    Live Markets
                  </h2>
                  <span className="text-xs font-bold text-muted-foreground uppercase">
                    {liveMarkets.length} Open
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {liveMarkets.map((market) => (
                    <MarketCard
                      key={market.id}
                      {...market}
                      onTrade={handleTrade}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Resolved Markets Section */}
            {resolvedMarkets.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                    Resolved Markets
                  </h2>
                  <span className="text-xs font-bold text-muted-foreground uppercase">
                    {resolvedMarkets.length} Closed
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-75 grayscale-[0.5]">
                  {resolvedMarkets.map((market) => (
                    <MarketCard
                      key={market.id}
                      {...market}
                      onTrade={handleTrade}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-24 border border-dashed border-border rounded-2xl bg-muted/10">
            <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">
              No markets found
            </h3>
            <p className="text-muted-foreground max-w-xs mx-auto">
              We couldn't find any markets matching your current search or
              filters.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => {
                setSelectedTag(null);
                navigate("/");
              }}
            >
              Clear all filters
            </Button>
          </div>
        )}
      </section>
    </Layout>
  );
}
