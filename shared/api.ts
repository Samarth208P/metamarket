/**
 * Shared code between client and server.
 */

export type MarketType = "binary" | "versus" | "multi";
export type MarketStatus =
  | "active"
  | "resolved_yes"
  | "resolved_no"
  | "resolved_option";
export type AmmType = "legacy" | "lmsr";

export interface Position {
  marketId: string;
  optionId: string;
  optionName?: string;
  shares: number;
}

export interface TradeHistoryEntry {
  marketId: string;
  marketTitle: string;
  tradeType: "buy" | "sell" | "payout";
  optionId: string;
  optionName: string;
  amount: number;
  shares: number;
  averagePrice: number;
  fee: number;
  cashDelta: number;
  timestamp: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  termsAcceptedAt: string | null;
  needsOnboarding: boolean;
  starterGift: { amount: number } | null;
  isAdmin: boolean;
  balance: number;
  tradeHistory?: TradeHistoryEntry[];
  positions?: Position[];
  holdings?: {
    marketId: string;
    teamIndex?: number;
    yesShares: number;
    noShares: number;
  }[];
}

export interface PriceHistoryPoint {
  yesPrice?: number;
  noPrice?: number;
  allPrices?: number[];
  prices?: { optionId: string; price: number }[];
  note: string;
  timestamp: string;
}

export interface MarketOption {
  id: string;
  name: string;
  shortName?: string;
  imageUrl?: string;
  shares: number;
  price: number;
}

export interface QuoteResponse {
  marketId: string;
  optionId: string;
  optionName: string;
  type: "buy" | "sell";
  amount: number;
  expectedShares: number;
  minShares: number;
  grossPayout: number;
  netPayout: number;
  fee: number;
  averagePrice: number;
  currentPrice: number;
  quotedAt: string;
  expiresAt: string;
  currentB: number;
}

export interface Market {
  id: string;
  title: string;
  description: string;
  category: string;
  marketType: MarketType;
  ammType: AmmType;
  optionA?: string;
  optionB?: string;
  shortA?: string;
  shortB?: string;
  logoUrl?: string;
  teams?: {
    name: string;
    imageUrl?: string;
    yesPool?: number;
    noPool?: number;
    yesPrice?: number;
    noPrice?: number;
  }[];
  options: MarketOption[];
  status: MarketStatus;
  volume: number;
  priceHistory: PriceHistoryPoint[];
  resolvedOutcome?: "yes" | "no";
  resolvedOptionId?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  yesPrice: number;
  noPrice: number;
  yesPool?: number;
  noPool?: number;
  initialB?: number;
  minB?: number;
  isDynamic?: boolean;
  currentB?: number;
  quoteTtlMs?: number;
}

export interface LeaderboardUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  balance: number;
  holdingsValue: number;
  totalNetWorth: number;
  rank: number;
  rankTrend: number;
}

export interface SolvencyOverview {
  realReserves: number;
  totalPotentialPayouts: number;
  solvencyRatio: number;
  threshold: number;
  isBelowThreshold: boolean;
}

export interface TradeResponse {
  market: Market;
  user: User;
  trade: {
    type: "buy" | "sell";
    optionId: string;
    optionName: string;
    amount: number;
    shares: number;
    fee: number;
    cashDelta: number;
    averagePrice: number;
  };
  quote: QuoteResponse;
}

export interface AuthSuccessResponse {
  user: User;
}

export interface AuthErrorResponse {
  error: string;
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const PLAY_TERMS = {
  virtualFunds:
    "I understand MetaMarket uses simulated funds with no cash value or withdrawals.",
  playOnly:
    "I agree to use MetaMarket for simulated trading and entertainment only.",
};

export interface OnboardingRequest {
  username: string;
  virtualFunds: boolean;
  playOnly: boolean;
}
