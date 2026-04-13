import { describe, expect, it } from "vitest";
import { costFunction, getOptionPrices, quoteBuy, quoteSell, type LmsrState } from "./lmsr";

describe("lmsr math", () => {
  const state: LmsrState = {
    options: [
      { id: "yes", shares: 1000 },
      { id: "no", shares: 1000 },
    ],
  };

  it("keeps prices stable and normalized", () => {
    const prices = getOptionPrices(state, 100);
    expect(prices.yes).toBeCloseTo(0.5, 5);
    expect(prices.no).toBeCloseTo(0.5, 5);
    expect(prices.yes + prices.no).toBeCloseTo(1, 5);
  });

  it("quotes a buy close to the requested spend", () => {
    const spend = 250;
    const result = quoteBuy(state, 100, "yes", spend);
    const nextState: LmsrState = {
      options: [
        { id: "yes", shares: state.options[0].shares + result.shares },
        state.options[1],
      ],
    };

    const actualSpend = costFunction(nextState, 100) - costFunction(state, 100);
    expect(actualSpend).toBeCloseTo(spend, 2);
    expect(result.shares).toBeGreaterThan(0);
  });

  it("quotes a sell with fee applied", () => {
    const result = quoteSell(
      {
        options: [
          { id: "yes", shares: 1200 },
          { id: "no", shares: 1000 },
        ],
      },
      100,
      "yes",
      25
    );

    expect(result.grossPayout).toBeGreaterThan(result.netPayout);
    expect(result.fee).toBeGreaterThan(0);
    expect(result.averagePrice).toBeGreaterThan(0);
  });

  it("round-trips with only fee loss", () => {
    const buy = quoteBuy(state, 100, "yes", 100);
    const boughtState: LmsrState = {
      options: [
        { id: "yes", shares: state.options[0].shares + buy.shares },
        state.options[1],
      ],
    };
    const sell = quoteSell(boughtState, 100, "yes", buy.shares);

    expect(sell.grossPayout).toBeCloseTo(100, 2);
    expect(sell.netPayout).toBeLessThan(100);
  });
});
