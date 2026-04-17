// PM-AMM (Prediction Market Automated Market Maker) implementation
// Based on Polymarket's LMSR (Logarithmic Market Scoring Rule) mechanism

export interface MarketPool {
  yesPool: number;
  noPool: number;
  totalLiquidity: number; // Total liquidity in rupees
}

export interface TradeResult {
  newYesPrice: number;
  newNoPrice: number;
  cost: number;
  newPool: MarketPool;
}

// Constants for the AMM
const B = 100; // Liquidity parameter (higher = more liquidity, smoother prices)

/**
 * Calculate current prices based on pool state
 */
export function calculatePrices(pool: MarketPool): {
  yesPrice: number;
  noPrice: number;
} {
  const total = pool.yesPool + pool.noPool;
  if (total === 0) {
    return { yesPrice: 50, noPrice: 50 };
  }

  const yesPrice = (pool.noPool / total) * 100;
  const noPrice = (pool.yesPool / total) * 100;

  return {
    yesPrice: Math.round(yesPrice * 100) / 100,
    noPrice: Math.round(noPrice * 100) / 100,
  };
}

/**
 * Calculate cost to buy shares
 */
export function calculateBuyCost(
  pool: MarketPool,
  outcome: "yes" | "no",
  amount: number,
): number {
  return amount; // Amount represents rupees invested
}

/**
 * Calculate payout for selling shares
 */
export function calculateSellPayout(
  pool: MarketPool,
  outcome: "yes" | "no",
  amount: number,
): number {
  const currentPrices = calculatePrices(pool);
  const price =
    outcome === "yes" ? currentPrices.yesPrice : currentPrices.noPrice;
  return (price / 100) * amount * 0.95; // 5% fee
}

/**
 * Execute a trade
 */
export function executeTrade(
  pool: MarketPool,
  outcome: "yes" | "no",
  amount: number,
  isBuy: boolean,
): TradeResult {
  let cost = 0;
  let newPool = { ...pool };

  if (isBuy) {
    cost = calculateBuyCost(pool, outcome, amount);
    if (outcome === "yes") {
      newPool.yesPool = Math.max(1, newPool.yesPool - amount);
      newPool.noPool += amount;
    } else {
      newPool.noPool = Math.max(1, newPool.noPool - amount);
      newPool.yesPool += amount;
    }
  } else {
    const payout = calculateSellPayout(pool, outcome, amount);
    cost = -payout;
    if (outcome === "yes") {
      newPool.yesPool += amount;
      newPool.noPool = Math.max(1, newPool.noPool - amount);
    } else {
      newPool.noPool += amount;
      newPool.yesPool = Math.max(1, newPool.yesPool - amount);
    }
  }

  const newPrices = calculatePrices(newPool);

  return {
    newYesPrice: newPrices.yesPrice,
    newNoPrice: newPrices.noPrice,
    cost,
    newPool,
  };
}

/**
 * Initialize a new market pool
 */
export function createMarketPool(initialLiquidity: number = 1000): MarketPool {
  return {
    yesPool: initialLiquidity,
    noPool: initialLiquidity,
    totalLiquidity: initialLiquidity,
  };
}

/**
 * Get market probability from prices
 */
export function getImpliedProbability(yesPrice: number): number {
  return yesPrice / 100;
}
