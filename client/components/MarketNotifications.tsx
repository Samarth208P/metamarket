import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMatch } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { fetchMarkets, marketCatalogKey } from "@/lib/markets";
import { RAMAYANA_MARKET_ID, RAMAYANA_PATH } from "@shared/ramayana";

type MarketPhase = "open" | "closed" | "resolved";

export function MarketNotifications() {
  const { user, bookmarks } = useAuth();
  const regularMarket = useMatch("/market/:id");
  const ramayanaMarket = useMatch(RAMAYANA_PATH);
  const viewedId = ramayanaMarket
    ? RAMAYANA_MARKET_ID
    : regularMarket?.params.id;
  const isCatalogOpen = Boolean(useMatch("/"));
  const trackedIds = useMemo(() => {
    const ids = new Set(bookmarks);
    if (viewedId) ids.add(viewedId);
    for (const position of user?.positions ?? []) {
      if (position.shares > 0) ids.add(position.marketId);
    }
    for (const holding of user?.holdings ?? []) {
      if (holding.yesShares > 0 || holding.noShares > 0)
        ids.add(holding.marketId);
    }
    return ids;
  }, [bookmarks, viewedId, user?.positions, user?.holdings]);

  const enabled = Boolean(user && !user.needsOnboarding && trackedIds.size);
  const { data: markets, dataUpdatedAt } = useQuery({
    queryKey: marketCatalogKey,
    queryFn: fetchMarkets,
    enabled,
    refetchInterval: enabled && !isCatalogOpen ? 15_000 : false,
    staleTime: 15_000,
  });
  const previous = useRef(new Map<string, MarketPhase>());

  useEffect(() => {
    previous.current.clear();
  }, [user?.id]);

  useEffect(() => {
    if (!enabled || !markets) {
      previous.current.clear();
      return;
    }

    const next = new Map<string, MarketPhase>();
    const now = Date.now();
    for (const market of markets) {
      if (!trackedIds.has(market.id)) continue;
      let phase: MarketPhase = "open";
      if (market.status !== "active") phase = "resolved";
      else if (market.endDate && Date.parse(market.endDate) <= now)
        phase = "closed";

      next.set(market.id, phase);
      const prior = previous.current.get(market.id);
      if (!prior || prior === phase || phase === "open") continue;

      toast({
        type: "background",
        title: phase === "closed" ? "Market closed" : "Market resolved",
        description: market.title,
        notificationKind: "market",
        notificationHref:
          market.id === RAMAYANA_MARKET_ID
            ? RAMAYANA_PATH
            : `/market/${market.id}`,
        notificationKey:
          phase === "closed"
            ? `closed:${market.id}:${market.endDate}`
            : `resolved:${market.id}`,
      });
    }
    previous.current = next;
  }, [enabled, markets, dataUpdatedAt, trackedIds]);

  return null;
}
