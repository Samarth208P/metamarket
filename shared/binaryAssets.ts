export const BINARY_ASSETS = {
  BTCUSDT: {
    symbol: "BTC",
    name: "Bitcoin",
    path: "/btc",
    icon: "/bitcoin-logo.svg",
    accent: "#f7931a",
  },
  ETHUSDT: {
    symbol: "ETH",
    name: "Ethereum",
    path: "/eth",
    icon: "/ethereum-logo.png",
    accent: "#a5b4fc",
  },
} as const;

export type BinaryAssetPair = keyof typeof BINARY_ASSETS;
export type BinaryAsset = (typeof BINARY_ASSETS)[BinaryAssetPair];

export const DEFAULT_BINARY_ASSET = "BTCUSDT";
export const BINARY_ASSET_PAIRS = Object.keys(
  BINARY_ASSETS,
) as BinaryAssetPair[];

export function isBinaryAssetPair(value: unknown): value is BinaryAssetPair {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BINARY_ASSETS, value)
  );
}
