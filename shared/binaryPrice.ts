/**
 * Binary Price Market — Probability Engine
 *
 * Implements a Modified Black-Scholes model for pricing
 * cash-or-nothing binary call options on BTC price.
 *
 * P_up = Φ(d2), where d2 = [ln(S/K) - (σ²/2)t] / (σ√t)
 */

// ─── Constants ────────────────────────────────────────────────────────
export const MARKET_DURATION_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_VOLATILITY = 0.0015; // Sharply narrowed to make 5m candles feel more decisive
export const VIV_JITTER_RANGE = 0.00001;
export const MOMENTUM_BIAS_CAP = 0.05; // More aggressive sentiment shift
export const MIN_PROBABILITY = 0.01; // Allow prices to go near 0
export const MAX_PROBABILITY = 0.99; // Allow prices to go near 100p
export const PRICE_SNAPSHOT_INTERVAL_MS = 1_000; // 1 s chart resolution

// ─── Types ────────────────────────────────────────────────────────────

export type BinaryMarketStatus =
  | "waiting"
  | "active"
  | "settled_up"
  | "settled_down";

export interface BinaryTrade {
  userId: string;
  userName?: string;
  side: "up" | "down";
  amount: number;
  entryProbability: number;
  payout: number; // 0 until settled
  timestamp: string;
  sold?: boolean;
}

export interface BinaryPriceSnapshot {
  price: number;
  timestamp: string;
}

export interface BinaryMarket {
  id: string;
  assetPair: string;
  targetPrice: number;
  finalPrice?: number;
  startTime: string;
  endTime: string;
  status: BinaryMarketStatus;
  trades: BinaryTrade[];
  priceSnapshots: BinaryPriceSnapshot[];
  volume: number;
  createdAt: string;
}

export interface BinaryTradeRequest {
  side: "up" | "down";
  amount: number;
}

export interface BinaryTradeResponse {
  market: BinaryMarket;
  trade: BinaryTrade;
  userBalance: number;
}

// ─── Math Helpers ─────────────────────────────────────────────────────

/**
 * Standard normal CDF — rational approximation (Abramowitz & Stegun 26.2.17).
 * Accurate to ~1.5 × 10⁻⁷.
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Core d₂ calculation:
 *   d₂ = [ln(S/K) − (σ²/2)·t] / (σ·√t)
 *
 * @param currentPrice  S — live BTC price
 * @param targetPrice   K — "Price to Beat"
 * @param timeRemaining t — fraction (we use seconds / seconds-in-a-day)
 * @param volatility    σ — active volatility (base + jitter)
 */
export function calculateD2(
  currentPrice: number,
  targetPrice: number,
  timeRemaining: number,
  volatility: number,
): number {
  if (timeRemaining <= 0) {
    // At expiry: deterministic
    return currentPrice >= targetPrice ? 100 : -100;
  }
  if (targetPrice <= 0 || currentPrice <= 0) return 0;

  const sqrtT = Math.sqrt(timeRemaining);
  const numerator =
    Math.log(currentPrice / targetPrice) -
    (volatility * volatility * timeRemaining) / 2;
  return numerator / (volatility * sqrtT);
}

/**
 * Calculate the UP probability from raw inputs.
 * Returns a value clamped to [MIN_PROBABILITY, MAX_PROBABILITY].
 */
export function calculateUpProbability(
  currentPrice: number,
  targetPrice: number,
  timeRemainingMs: number,
  volatility: number = DEFAULT_VOLATILITY,
): number {
  // Convert ms → fraction of a day for BTC vol scaling
  const tDays = Math.max(0, timeRemainingMs) / (24 * 60 * 60 * 1000);

  if (tDays <= 0) {
    return currentPrice >= targetPrice
      ? MAX_PROBABILITY
      : MIN_PROBABILITY;
  }

  const d2 = calculateD2(currentPrice, targetPrice, tDays, volatility);
  const raw = normalCDF(d2);

  return clampProbability(raw);
}

/**
 * Calculate the full "live" probability incorporating:
 *   1. Base CDF probability
 *   2. Variable Implied Volatility (VIV) jitter
 *   3. Momentum bias from Rate of Change (ROC)
 */
export function calculateLiveProbability(params: {
  currentPrice: number;
  targetPrice: number;
  timeRemainingMs: number;
  recentPrices?: number[]; // last N prices for ROC (newest last)
  jitterSeed?: number; // deterministic jitter for testing
}): { probability: number; activeVolatility: number; momentumBias: number } {
  const {
    currentPrice,
    targetPrice,
    timeRemainingMs,
    recentPrices = [],
  } = params;

  // 1. VIV Jitter — add a small random perturbation to σ
  const jitter =
    params.jitterSeed !== undefined
      ? params.jitterSeed
      : (Math.random() * 2 - 1) * VIV_JITTER_RANGE;
  const activeVolatility = Math.max(0.001, DEFAULT_VOLATILITY + jitter);

  // 2. Base CDF probability
  let probability = calculateUpProbability(
    currentPrice,
    targetPrice,
    timeRemainingMs,
    activeVolatility,
  );

  // 3. Smoother "Decision Boost"
  // Instead of a hard threshold, we use a sigmoid-like boost that scales with pctDiff
  // This makes the transition from 50p to higher/lower feel more natural.
  const priceDiff = currentPrice - targetPrice;
  const pctDiff = priceDiff / targetPrice;
  
  if (Math.abs(pctDiff) > 0) {
    // Decision intensity increases as time runs out
    const totalDuration = MARKET_DURATION_MS;
    const timeProgress = 1 - (timeRemainingMs / totalDuration);
    const timeFactor = 0.5 + (timeProgress * 0.5); // 0.5 to 1.0

    // Boost ranges from 0 to 0.15 based on price distance, scaled by time
    const boostMagnitude = Math.min(0.15, Math.abs(pctDiff) * 5000) * timeFactor;
    
    if (priceDiff > 0) {
      // Ensure it's at least slightly above 50p if price is up
      probability = Math.max(probability, 0.52 + boostMagnitude);
    } else {
      // Ensure it's at most slightly below 50p if price is down
      probability = Math.min(probability, 0.48 - boostMagnitude);
    }
  }

  // 4. Momentum Bias — shift based on Rate of Change
  let momentumBias = 0;
  if (recentPrices.length >= 3) {
    const recent = recentPrices.slice(-5);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (first > 0) {
      const roc = (last - first) / first;
      // Scale ROC to a ±5% bias
      momentumBias = clamp(roc * 20, -MOMENTUM_BIAS_CAP, MOMENTUM_BIAS_CAP);
      probability = clampProbability(probability + momentumBias);
    }
  }

  return { probability, activeVolatility, momentumBias };
}

/**
 * Calculate expected payout for a binary option trade.
 * Binary option: pays (amount / entryProbability) capped at 2x.
 */
export function calculatePotentialPayout(
  amount: number,
  probability: number,
): number {
  if (probability <= 0) return 0;
  return amount / probability;
}

// ─── Utility ──────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampProbability(p: number): number {
  return clamp(p, MIN_PROBABILITY, MAX_PROBABILITY);
}

/**
 * Format a probability (0–1) as paise string, e.g. "67p"
 */
export function formatPaise(probability: number): string {
  return `${Math.round(probability * 100)}p`;
}

/**
 * Format milliseconds as mm:ss countdown string.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
