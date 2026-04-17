import type { MarketOption, QuoteResponse } from "./api";

export const SELL_FEE_RATE = 0.05;
export const QUOTE_TTL_MS = 15000;
const EPSILON = 1e-9;

export interface LmsrOptionState {
  id: string;
  shares: number;
}

export interface LmsrState {
  options: LmsrOptionState[];
}

function logSumExp(values: number[]): number {
  const maxValue = Math.max(...values);
  const sum = values.reduce(
    (acc, value) => acc + Math.exp(value - maxValue),
    0,
  );
  return maxValue + Math.log(sum);
}

export function clampMinB(value: number, minB: number): number {
  return Math.max(minB, value);
}

export function calculateCurrentB(params: {
  initialB: number;
  isDynamic?: boolean;
  minB?: number;
  createdAt?: Date | string;
  endDate?: Date | string;
}): number {
  const minB = Math.max(1, params.minB ?? Math.max(1, params.initialB * 0.25));
  if (!params.isDynamic || !params.endDate || !params.createdAt) {
    return clampMinB(params.initialB, minB);
  }

  const createdAt = new Date(params.createdAt).getTime();
  const endDate = new Date(params.endDate).getTime();
  const now = Date.now();

  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(endDate) ||
    endDate <= createdAt
  ) {
    return clampMinB(params.initialB, minB);
  }

  const totalDuration = endDate - createdAt;
  const remaining = Math.max(0, endDate - now);
  const ratio = remaining / totalDuration;
  return clampMinB(params.initialB * ratio, minB);
}

export function costFunction(state: LmsrState, b: number): number {
  if (!state.options.length) return 0;
  const scaled = state.options.map((option) => option.shares / b);
  return b * logSumExp(scaled);
}

export function getOptionPrices(
  state: LmsrState,
  b: number,
): Record<string, number> {
  const scaled = state.options.map((option) => option.shares / b);
  const logDenominator = logSumExp(scaled);
  const prices: Record<string, number> = {};

  state.options.forEach((option) => {
    prices[option.id] = Math.exp(option.shares / b - logDenominator);
  });

  return prices;
}

export function getOptionPrice(
  state: LmsrState,
  b: number,
  optionId: string,
): number {
  return getOptionPrices(state, b)[optionId] ?? 0;
}

export function applyShareDelta(
  state: LmsrState,
  optionId: string,
  delta: number,
): LmsrState {
  return {
    options: state.options.map((option) => ({
      ...option,
      shares:
        option.id === optionId
          ? Math.max(0, option.shares + delta)
          : option.shares,
    })),
  };
}

export function quoteBuy(
  state: LmsrState,
  b: number,
  optionId: string,
  spend: number,
): {
  shares: number;
  averagePrice: number;
  currentPrice: number;
} {
  const currentPrice = getOptionPrice(state, b, optionId);
  if (spend <= 0 || currentPrice <= 0) {
    return { shares: 0, averagePrice: 0, currentPrice };
  }

  const baseCost = costFunction(state, b);
  let low = 0;
  let high = Math.max((spend / Math.max(currentPrice, 0.01)) * 2, 1);

  while (
    costFunction(applyShareDelta(state, optionId, high), b) - baseCost <
    spend
  ) {
    high *= 2;
    if (high > 1_000_000) break;
  }

  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const cost =
      costFunction(applyShareDelta(state, optionId, mid), b) - baseCost;
    if (cost < spend) low = mid;
    else high = mid;
  }

  const shares = Math.max(low, 0);
  return {
    shares,
    averagePrice: spend / Math.max(shares, EPSILON),
    currentPrice,
  };
}

export function quoteSell(
  state: LmsrState,
  b: number,
  optionId: string,
  shares: number,
): {
  grossPayout: number;
  netPayout: number;
  fee: number;
  averagePrice: number;
  currentPrice: number;
} {
  const currentPrice = getOptionPrice(state, b, optionId);
  if (shares <= 0) {
    return {
      grossPayout: 0,
      netPayout: 0,
      fee: 0,
      averagePrice: 0,
      currentPrice,
    };
  }

  const nextState = applyShareDelta(state, optionId, -shares);
  const grossPayout = Math.max(
    costFunction(state, b) - costFunction(nextState, b),
    0,
  );
  const fee = grossPayout * SELL_FEE_RATE;
  const netPayout = grossPayout - fee;

  return {
    grossPayout,
    netPayout,
    fee,
    averagePrice: netPayout / Math.max(shares, EPSILON),
    currentPrice,
  };
}

export function createQuote(params: {
  marketId: string;
  type: "buy" | "sell";
  option: MarketOption;
  amount: number;
  expectedShares: number;
  grossPayout?: number;
  netPayout?: number;
  fee?: number;
  averagePrice: number;
  currentPrice: number;
  currentB: number;
  tolerance?: number;
}): QuoteResponse {
  const quotedAt = new Date();
  const tolerance = params.tolerance ?? 0.02;

  return {
    marketId: params.marketId,
    optionId: params.option.id,
    optionName: params.option.name,
    type: params.type,
    amount: params.amount,
    expectedShares: params.expectedShares,
    minShares:
      params.type === "buy"
        ? params.expectedShares * (1 - tolerance)
        : params.expectedShares,
    grossPayout: params.grossPayout ?? 0,
    netPayout: params.netPayout ?? 0,
    fee: params.fee ?? 0,
    averagePrice: params.averagePrice,
    currentPrice: params.currentPrice,
    quotedAt: quotedAt.toISOString(),
    expiresAt: new Date(quotedAt.getTime() + QUOTE_TTL_MS).toISOString(),
    currentB: params.currentB,
  };
}
