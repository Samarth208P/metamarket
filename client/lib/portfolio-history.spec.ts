import { describe, expect, it } from "vitest";
import type { TradeHistoryEntry } from "@shared/api";
import { groupPortfolioHistory } from "./portfolio-history";

function btcEntry(
  tradeType: TradeHistoryEntry["tradeType"],
  amount: number,
  marketTitle: string,
  timestamp: string,
): TradeHistoryEntry {
  return {
    marketId: "btc-round-1",
    marketTitle,
    tradeType,
    optionId: "up",
    optionName: "Up",
    amount,
    shares: 1,
    averagePrice: 74,
    fee: 0,
    cashDelta: tradeType === "buy" ? -amount : amount,
    timestamp,
  };
}

describe("groupPortfolioHistory", () => {
  it("groups buys, sells and payouts by round ID regardless of their stored titles", () => {
    const buy = btcEntry(
      "buy",
      500,
      "BTC UP @ 74p (Tgt: $59,149.9)",
      "2026-11-22T07:29:00Z",
    );
    const sell = {
      ...btcEntry(
        "sell",
        200,
        "BTC DOWN @ 41p (Tgt: $59,149.9)",
        "2026-11-22T07:29:45Z",
      ),
      optionId: "down",
      optionName: "Down",
    };
    const payout = btcEntry(
      "payout",
      600.41,
      "BTC UP Payout (Tgt: $59,149.9)",
      "2026-11-22T07:30:00Z",
    );
    const anotherPayout = { ...payout, amount: 78, cashDelta: 78 };
    const anotherRound = {
      ...buy,
      marketId: "btc-round-2",
      timestamp: "2026-11-22T07:32:00Z",
    };

    const { markets, totalTrades } = groupPortfolioHistory([
      buy,
      payout,
      anotherRound,
      sell,
      anotherPayout,
    ]);

    expect(totalTrades).toBe(3);
    expect(markets.map((market) => market.id)).toEqual([
      "btc-round-2",
      "btc-round-1",
    ]);
    expect(markets[1]).toMatchObject({
      title: "BTC Up or Down (Target $59,149.9)",
      latestActivity: payout.timestamp,
      trades: [
        { entry: sell, price: "41p" },
        { entry: buy, price: "74p" },
      ],
      payout: 678.41,
    });
  });

  it("keeps the title and settlement visible when a market has only a payout in history", () => {
    const payout = {
      ...btcEntry(
        "payout",
        0,
        "Will it rain tomorrow?",
        "2026-11-22T06:00:00Z",
      ),
      marketId: "weather",
    };

    expect(groupPortfolioHistory([payout])).toMatchObject({
      totalTrades: 0,
      markets: [{ title: payout.marketTitle, trades: [], payout: 0 }],
    });
    expect(groupPortfolioHistory()).toEqual({ totalTrades: 0, markets: [] });
  });
});
