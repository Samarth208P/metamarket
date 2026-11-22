import type { TradeHistoryEntry } from "@shared/api";

interface MarketHistory {
  id: string;
  title: string;
  latestActivity: string;
  trades: { entry: TradeHistoryEntry; price?: string }[];
  payout: number | null;
}

// Binary rounds store the asset, side and execution price or payout in the history title.
const binaryHistoryTitle =
  /^(BTC|ETH) (?:UP|DOWN) (?:@ (\d+p)|Payout) \(Tgt: (\$[^)]+)\)$/;

export function groupPortfolioHistory(history: TradeHistoryEntry[] = []) {
  const sortedHistory = [...history].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
  const markets = new Map<string, MarketHistory>();
  let totalTrades = 0;

  for (const entry of sortedHistory) {
    const binary = binaryHistoryTitle.exec(entry.marketTitle);
    let market = markets.get(entry.marketId);
    if (!market) {
      market = {
        id: entry.marketId,
        title: binary
          ? `${binary[1]} Up or Down (Target ${binary[3]})`
          : entry.marketTitle,
        latestActivity: entry.timestamp,
        trades: [],
        payout: null,
      };
      markets.set(market.id, market);
    }

    if (entry.tradeType === "payout") {
      market.payout = (market.payout ?? 0) + entry.amount;
    } else {
      market.trades.push({ entry, price: binary?.[2] });
      totalTrades++;
    }
  }

  return { markets: [...markets.values()], totalTrades };
}
