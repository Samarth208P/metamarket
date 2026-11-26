import { describe, expect, it } from "vitest";
import { maxPurchaseAmount, pricePurchase } from "./purchase";

describe("purchase costs", () => {
  it.each([
    [1, 1, 2],
    [4.99, 1, 5.99],
    [5, 1.01, 6.01],
    [25, 1.03, 26.03],
    [100, 1.1, 101.1],
    [10000, 11, 10011],
  ])("prices a ₹%s purchase", (amount, fee, totalCost) => {
    expect(pricePurchase(amount)).toEqual({ fee, totalCost });
  });

  it.each([0, 0.99, 1, 1.01, 2.01, 6, 6.01, 25.5, 1000, 15000.39])(
    "finds the largest affordable purchase for a ₹%s balance",
    (balance) => {
      const max = maxPurchaseAmount(balance);
      expect(pricePurchase(max).totalCost).toBeLessThanOrEqual(balance);
      expect(pricePurchase(max + 0.01).totalCost).toBeGreaterThan(balance);
    },
  );
});
