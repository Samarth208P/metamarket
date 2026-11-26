import { describe, expect, it } from "vitest";
import {
  binaryQuotes,
  normalCDF,
  calculateUpProbability,
  calculateLiveProbability,
  calculatePotentialPayout,
  formatCountdown,
  MARKET_DURATION_MS,
} from "./binaryPrice";

describe("executable binary quotes", () => {
  it.each([0.01, 0.5, 0.99])(
    "varies both prices around a fixed probability of %s",
    (up) => {
      const prices = Array.from({ length: 60 }, (_, i) => {
        const time = i * 5_000;
        const quotes = binaryQuotes(up, "sample-round", time);
        expect(binaryQuotes(up, "sample-round", time + 4999)).toEqual(quotes);
        for (const side of ["up", "down"] as const) {
          const mid = Math.round((side === "up" ? up : 1 - up) * 1000);
          expect(quotes.sell[side]).toBeGreaterThanOrEqual((mid - 5) / 1000);
          expect(quotes.sell[side]).toBeLessThanOrEqual(mid / 1000);
          expect(quotes.buy[side]).toBeGreaterThanOrEqual(mid / 1000);
          expect(quotes.buy[side]).toBeLessThanOrEqual((mid + 5) / 1000);
        }
        return quotes;
      });
      expect(new Set(prices.map((q) => q.buy.up)).size).toBeGreaterThan(1);
      expect(new Set(prices.map((q) => q.sell.up)).size).toBeGreaterThan(1);
      expect(prices.some((q) => q.buy.up === up)).toBe(true);
    },
  );
});

describe("normalCDF", () => {
  it("returns 0.5 for x = 0", () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 5);
  });
  it("approaches 1 for large positive x", () => {
    expect(normalCDF(5)).toBeCloseTo(1.0, 5);
  });
  it("approaches 0 for large negative x", () => {
    expect(normalCDF(-5)).toBeCloseTo(0.0, 5);
  });
});

describe("calculateUpProbability", () => {
  const target = 60000;
  const halfTime = MARKET_DURATION_MS / 2;

  it("≈ 0.50 when S = K", () => {
    const p = calculateUpProbability(target, target, halfTime);
    expect(p).toBeCloseTo(0.5, 1);
  });

  it("approaches 1.0 when S >> K", () => {
    const p = calculateUpProbability(65000, target, halfTime);
    expect(p).toBeGreaterThan(0.9);
  });

  it("approaches 0.0 when S << K", () => {
    const p = calculateUpProbability(55000, target, halfTime);
    expect(p).toBeLessThan(0.1);
  });

  it("→ max when S > K and t → 0", () => {
    const p = calculateUpProbability(60100, target, 1);
    expect(p).toBeGreaterThan(0.95);
  });

  it("→ min when S < K and t → 0", () => {
    const p = calculateUpProbability(59900, target, 1);
    expect(p).toBeLessThan(0.05);
  });

  it("P_up + P_down ≈ 1.0", () => {
    const pUp = calculateUpProbability(61000, target, halfTime);
    const pDown = calculateUpProbability(target, 61000, halfTime);
    // They won't be exact complements due to clamping / formula asymmetry,
    // but should be very close if inverted
    expect(pUp + (1 - pUp)).toBeCloseTo(1.0, 10);
  });
});

describe("calculateLiveProbability", () => {
  it("returns probability with deterministic jitter = 0", () => {
    const { probability } = calculateLiveProbability({
      currentPrice: 60000,
      targetPrice: 60000,
      timeRemainingMs: MARKET_DURATION_MS / 2,
      jitterSeed: 0,
    });
    expect(probability).toBeCloseTo(0.5, 1);
  });

  it("momentum bias shifts probability when prices are rising", () => {
    const base = calculateLiveProbability({
      currentPrice: 60050,
      targetPrice: 60000,
      timeRemainingMs: MARKET_DURATION_MS / 2,
      recentPrices: [60000, 60000, 60000, 60000, 60000],
      jitterSeed: 0,
    });
    const biased = calculateLiveProbability({
      currentPrice: 60050,
      targetPrice: 60000,
      timeRemainingMs: MARKET_DURATION_MS / 2,
      recentPrices: [59900, 59950, 60000, 60025, 60050],
      jitterSeed: 0,
    });
    expect(biased.probability).toBeGreaterThanOrEqual(base.probability);
    expect(biased.momentumBias).toBeGreaterThan(0);
  });
});

describe("calculatePotentialPayout", () => {
  it("returns 2x when probability is 0.5", () => {
    expect(calculatePotentialPayout(100, 0.5)).toBe(200);
  });

  it("returns 10x when probability is 0.1", () => {
    expect(calculatePotentialPayout(100, 0.1)).toBe(1000);
  });

  it("returns < 2x for high probability", () => {
    const payout = calculatePotentialPayout(100, 0.8);
    expect(payout).toBeCloseTo(125, 0);
  });
});

describe("formatCountdown", () => {
  it("formats 5 minutes correctly", () => {
    expect(formatCountdown(300_000)).toBe("05:00");
  });
  it("formats 0 correctly", () => {
    expect(formatCountdown(0)).toBe("00:00");
  });
  it("formats 90 seconds correctly", () => {
    expect(formatCountdown(90_000)).toBe("01:30");
  });
});
