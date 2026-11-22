import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { BinaryMarketCard } from "@/components/BinaryMarketCard";
import { MagicBento, type MagicBentoItem } from "@/components/MagicBento";
import { MarketCard } from "@/components/MarketCard";
import { RamayanaMarketCard } from "@/components/RamayanaMarketCard";
import { MarketErrorBoundary } from "@/components/MarketErrorBoundary";
import { Market } from "@shared/api";
import { Search, Activity, CheckCircle2, Bookmark } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { binaryMarketCategory, binaryMarketTitle } from "@/lib/binary-markets";
import { fetchMarkets, marketCatalogKey } from "@/lib/markets";
import { BINARY_ASSETS, BINARY_ASSET_PAIRS } from "@shared/binaryAssets";
import { RAMAYANA_MARKET_ID } from "@shared/ramayana";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const query = searchParams.get("q") || "";
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  const tags = ["Politics", "Crypto", "Sports", "Business", "Entertainment"];

  const { data, isLoading, isError } = useQuery<Market[]>({
    queryKey: marketCatalogKey,
    queryFn: fetchMarkets,
    refetchInterval: 15000,
  });

  const [markets, setMarkets] = useState<Market[]>([]);

  const { user, refreshUser, bookmarks, toggleBookmark } = useAuth();
  const visibleBinaryMarkets = BINARY_ASSET_PAIRS.filter((pair) => {
    const asset = BINARY_ASSETS[pair];
    return (
      (!selectedTag || selectedTag === binaryMarketCategory) &&
      (!showBookmarksOnly || bookmarks.includes(asset.path)) &&
      [binaryMarketTitle(asset), asset.name, binaryMarketCategory].some(
        (value) => value.toLowerCase().includes(query.toLowerCase()),
      )
    );
  });

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
  const ramayanaMarket = liveMarkets.find((m) => m.id === RAMAYANA_MARKET_ID);
  const liveMarketCount = liveMarkets.length + visibleBinaryMarkets.length;

  const handleTrade = (marketId: string, updatedMarket: Market) => {
    setMarkets((current) =>
      current.map((market) =>
        market.id === marketId ? updatedMarket : market,
      ),
    );
  };

  const marketTile = (market: Market): MagicBentoItem => ({
    id: market.id,
    accent: market.id === RAMAYANA_MARKET_ID ? "#edbd77" : undefined,
    content: (
      <MarketErrorBoundary
        market={market.id}
        resetKey={market}
        fallback={
          <article className="p-5">
            <h3 className="font-semibold">{market.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Market temporarily unavailable.
            </p>
          </article>
        }
      >
        {market.id === RAMAYANA_MARKET_ID ? (
          <RamayanaMarketCard market={market} />
        ) : (
          <MarketCard {...market} onTrade={handleTrade} />
        )}
      </MarketErrorBoundary>
    ),
  });

  const binaryTiles = visibleBinaryMarkets.map(
    (pair, index): MagicBentoItem => {
      const { path, accent } = BINARY_ASSETS[pair];
      return {
        id: path,
        accent,
        colSpan:
          visibleBinaryMarkets.length === 1
            ? 8
            : ramayanaMarket
              ? 4
              : index === 0
                ? 7
                : 5,
        content: (
          <BinaryMarketCard
            assetPair={pair}
            isBookmarked={bookmarks.includes(path)}
            onToggleBookmark={() => toggleBookmark(path)}
          />
        ),
      };
    },
  );

  const filterClass = (active: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      active
        ? "border-primary/35 bg-primary/10 text-primary"
        : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
    );

  return (
    <Layout>
      <section className="container mx-auto max-w-[1400px] px-4 pb-12">
        <div
          className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border py-4 sm:mb-8 sm:gap-2 sm:py-6"
          role="group"
          aria-label="Market filters"
        >
          <button
            type="button"
            aria-pressed={!selectedTag && !showBookmarksOnly}
            onClick={() => {
              setSelectedTag(null);
              setShowBookmarksOnly(false);
            }}
            className={filterClass(!selectedTag && !showBookmarksOnly)}
          >
            All Markets
          </button>

          {user && (
            <button
              type="button"
              aria-pressed={showBookmarksOnly}
              onClick={() => {
                setShowBookmarksOnly(true);
                setSelectedTag(null);
              }}
              className={filterClass(showBookmarksOnly)}
            >
              <Bookmark
                aria-hidden="true"
                className={cn(
                  "w-4 h-4",
                  showBookmarksOnly ? "fill-current" : "",
                )}
              />
              Bookmarks
            </button>
          )}

          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={selectedTag === tag}
              onClick={() => {
                setSelectedTag(tag);
                setShowBookmarksOnly(false);
              }}
              className={filterClass(selectedTag === tag)}
            >
              {tag}
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

        <div className="space-y-12">
          {liveMarketCount > 0 && (
            <section className="space-y-4" aria-labelledby="live-markets">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="live-markets"
                  className="flex items-center gap-2 text-lg font-bold tracking-tight"
                >
                  <Activity aria-hidden="true" className="size-5 text-yes" />
                  Live markets
                </h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {liveMarketCount}{" "}
                  {liveMarketCount === 1 ? "market" : "markets"}
                </span>
              </div>
              <MagicBento
                items={[
                  ...(ramayanaMarket ? [marketTile(ramayanaMarket)] : []),
                  ...binaryTiles,
                  ...liveMarkets
                    .filter((market) => market.id !== RAMAYANA_MARKET_ID)
                    .map(marketTile),
                ]}
              />
            </section>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-6">
              <img
                src="/animated-logo.svg"
                alt="Loading"
                className="w-32 h-32"
              />
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
          ) : resolvedMarkets.length > 0 ? (
            <section className="space-y-4" aria-labelledby="resolved-markets">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="resolved-markets"
                  className="flex items-center gap-2 text-lg font-bold tracking-tight"
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-5 text-muted-foreground"
                  />
                  Resolved markets
                </h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {resolvedMarkets.length} closed
                </span>
              </div>
              <MagicBento items={resolvedMarkets.map(marketTile)} />
            </section>
          ) : liveMarketCount === 0 ? (
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
                  setShowBookmarksOnly(false);
                  navigate("/");
                }}
              >
                Clear all filters
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </Layout>
  );
}
