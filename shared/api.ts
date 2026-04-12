/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */


/**
 * User interface for authentication
 */
export interface User {
  id: string;
  email: string;
  name: string;
  enrollmentNumber?: string;
  isAdmin: boolean;
  balance: number;
  tradeHistory?: any[];

  holdings?: {
    marketId: string;
    teamIndex?: number;
    yesShares: number;
    noShares: number;
  }[];
}

export interface PriceHistoryPoint {
  yesPrice: number;
  noPrice: number;
  note: string;
  timestamp: string;
}

export interface Market {
  id: string;
  title: string;
  description: string;
  category: string;
  marketType: "binary" | "versus" | "multi";
  optionA?: string;
  optionB?: string;
  shortA?: string;
  shortB?: string;
  logoUrl?: string;
  teams?: { name: string; imageUrl?: string; yesPool: number; noPool: number; yesPrice: number; noPrice: number }[];
  status: "active" | "resolved_yes" | "resolved_no";
  yesPool: number;
  noPool: number;
  volume: number;
  priceHistory: PriceHistoryPoint[];
  resolvedOutcome?: "yes" | "no";
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  yesPrice: number;
  noPrice: number;
}

export interface LeaderboardUser {
  id: string;
  name: string;
  enrollmentNumber: string;
  balance: number;
  holdingsValue: number;
  totalNetWorth: number;
  rank: number;
  rankTrend: number;
}

export interface TradeResponse {
  market: Market;
  user: User;
  trade: {
    type: "buy" | "sell";
    outcome: "yes" | "no";
    amount: number;
    cost: number;
  };
}

/**
 * Auth response types
 */
export interface AuthSuccessResponse {
  user: User;
}

export interface AuthErrorResponse {
  error: string;
}
