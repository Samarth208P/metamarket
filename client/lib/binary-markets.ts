import { queryOptions } from "@tanstack/react-query";
import {
  DEFAULT_BINARY_ASSET,
  type BinaryAsset,
  type BinaryAssetPair,
} from "@shared/binaryAssets";
import type {
  BinaryMarket,
  BinaryQuotes,
  PricePoint,
} from "@shared/binaryPrice";

export const binaryMarketCategory = "Crypto";

export function binaryMarketTitle(asset: BinaryAsset) {
  return `${asset.symbol} 5 Minute Up or Down`;
}

interface ActiveBinaryMarket {
  market: BinaryMarket | null;
  livePrice: number;
  quotes?: BinaryQuotes;
}

async function fetchBinaryMarket<T>(
  assetPair: BinaryAssetPair,
  endpoint: "active" | "price-history" | "history",
  signal: AbortSignal,
): Promise<T> {
  const pairPath = assetPair === DEFAULT_BINARY_ASSET ? "" : `/${assetPair}`;
  const response = await fetch(`/mapi/binary-markets${pairPath}/${endpoint}`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) throw new Error(`Failed to load ${assetPair} ${endpoint}`);
  return response.json();
}

export function activeBinaryMarketQuery(assetPair: BinaryAssetPair) {
  return queryOptions({
    queryKey: ["binary-market-active", assetPair],
    queryFn: ({ signal }) =>
      fetchBinaryMarket<ActiveBinaryMarket>(assetPair, "active", signal),
    refetchInterval: (query) => (query.state.data?.market ? 3_000 : 1_500),
    staleTime: 1_000,
  });
}

export function binaryPriceHistoryQuery(assetPair: BinaryAssetPair) {
  return queryOptions({
    queryKey: ["binary-market-price-history", assetPair],
    queryFn: ({ signal }) =>
      fetchBinaryMarket<PricePoint[]>(assetPair, "price-history", signal),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function binaryOutcomeHistoryQuery(assetPair: BinaryAssetPair) {
  return queryOptions({
    queryKey: ["binary-market-history", assetPair],
    queryFn: ({ signal }) =>
      fetchBinaryMarket<BinaryMarket[]>(assetPair, "history", signal),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}
