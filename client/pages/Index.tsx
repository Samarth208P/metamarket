import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { MarketCard } from "@/components/MarketCard";
import { Market } from "@shared/api";
import { Search } from "lucide-react";

async function fetchMarkets(): Promise<Market[]> {
  const response = await fetch("/api/markets", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to load markets");
  }

  return response.json();
}

export default function Index() {
  const { data, isLoading, isError } = useQuery<Market[]>({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    refetchInterval: 15000,
  });

  const [markets, setMarkets] = useState<Market[]>([]);

  useEffect(() => {
    if (data) {
      setMarkets(data);
    }
  }, [data]);

  const handleTrade = (marketId: string, updatedMarket: Market) => {
    setMarkets((current) => current.map((market) => (market.id === marketId ? updatedMarket : market)));
  };

  return (
    <Layout>
      <section className="container mx-auto px-4 py-6 md:py-8 max-w-[1400px]">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Markets</h1>
        </div>

        {isLoading ? (
          <div className="text-center py-16">
            <p className="text-sm font-semibold text-muted-foreground">Loading markets...</p>
          </div>
        ) : isError ? (
          <div className="text-center py-16">
            <p className="text-sm font-semibold text-muted-foreground">Unable to load markets right now.</p>
          </div>
        ) : markets.length > 0 ? (
          /* Tighter grid configuration */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {markets.map((market) => (
              <MarketCard
                key={market.id}
                id={market.id}
                title={market.title}
                marketType={market.marketType}
                optionA={market.optionA}
                optionB={market.optionB}
                shortA={market.shortA}
                shortB={market.shortB}
                logoUrl={market.logoUrl}
                teams={market.teams}
                description={market.description}
                category={market.category}
                volume={market.volume}
                yesPrice={market.yesPrice}
                noPrice={market.noPrice}
                priceHistory={market.priceHistory}
                pool={{ yesPool: market.yesPool, noPool: market.noPool, totalLiquidity: market.yesPool + market.noPool }}
                onTrade={handleTrade}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border border-border rounded-xl bg-card">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground mb-1">No markets available</h3>
            <p className="text-sm text-muted-foreground">Check back later for new prediction markets.</p>
          </div>
        )}
      </section>
    </Layout>
  );
}
