/**
 * Binance WebSocket Price Feed Manager (Server-side)
 *
 * Connects to a Binance aggTrade stream and provides
 * the latest price to the scheduler and settlement engine.
 */

import { EventEmitter } from "node:events";
import {
  DEFAULT_BINARY_ASSET,
  type BinaryAssetPair,
} from "../../../shared/binaryAssets.ts";

const RECONNECT_DELAY_MS = 3000;
const MAX_RECENT_PRICES = 30; // ~30 seconds of data for ROC

export interface PriceTick {
  price: number;
  timestamp: number;
}

class BinanceFeedManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private latestPrice: number = 0;
  private recentPrices: number[] = [];
  private isConnected: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect: boolean = true;

  constructor(private readonly assetPair: BinaryAssetPair) {
    super();
    this.setMaxListeners(50);
  }

  start(): void {
    this.shouldReconnect = true;
    this.connect();
  }

  stop(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen =
        this.ws.onmessage =
        this.ws.onerror =
        this.ws.onclose =
          null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(
        `wss://data-stream.binance.vision:9443/ws/${this.assetPair.toLowerCase()}@aggTrade`,
      );

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log(
          `[BinanceFeed] Connected to ${this.assetPair} aggTrade stream`,
        );
        this.emit("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          const price = parseFloat(data.p);
          if (!isNaN(price) && price > 0) {
            this.latestPrice = price;
            this.recentPrices.push(price);
            if (this.recentPrices.length > MAX_RECENT_PRICES) {
              this.recentPrices.shift();
            }
            this.emit("price", { price, timestamp: Date.now() } as PriceTick);
          }
        } catch {
          // Ignore bad messages
        }
      };

      this.ws.onerror = (err) => {
        console.error(`[BinanceFeed] ${this.assetPair} WebSocket error:`, err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.log(`[BinanceFeed] Disconnected from ${this.assetPair} stream`);
        this.emit("disconnected");
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error("[BinanceFeed] Failed to connect:", err);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(
      `[BinanceFeed] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  getLatestPrice(): number {
    return this.latestPrice;
  }

  getRecentPrices(): number[] {
    return [...this.recentPrices];
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

export const binanceFeeds: Record<BinaryAssetPair, BinanceFeedManager> = {
  BTCUSDT: new BinanceFeedManager("BTCUSDT"),
  ETHUSDT: new BinanceFeedManager("ETHUSDT"),
};

/**
 * Fetch latest price from Binance REST API as a fallback
 */
export async function fetchBinancePriceRest(
  assetPair: BinaryAssetPair = DEFAULT_BINARY_ASSET,
): Promise<number> {
  try {
    const response = await fetch(
      `https://data-api.binance.vision/api/v3/ticker/price?symbol=${assetPair}`,
      { signal: AbortSignal.timeout(5000) },
    );
    const data = await response.json();
    const price = parseFloat(data.price);
    if (!isNaN(price) && price > 0) {
      return price;
    }
    return 0;
  } catch (err) {
    console.error("[BinanceFeed] REST Fallback failed:", err);
    return 0;
  }
}

/**
 * Fetch recent prices from Binance REST API as a fallback for Serverless
 * Returns an array of the last ~20 recent trade prices.
 */
export async function fetchBinanceRecentPricesRest(
  assetPair: BinaryAssetPair = DEFAULT_BINARY_ASSET,
): Promise<number[]> {
  try {
    const response = await fetch(
      `https://data-api.binance.vision/api/v3/trades?symbol=${assetPair}&limit=20`,
      { signal: AbortSignal.timeout(5000) },
    );
    const data = await response.json();
    if (Array.isArray(data)) {
      return data
        .map((t: any) => parseFloat(t.price))
        .filter((p) => !isNaN(p) && p > 0);
    }
    return [];
  } catch (err) {
    console.error("[BinanceFeed] Recent Prices REST Fallback failed:", err);
    return [];
  }
}

/**
 * Fetch historical price from Binance REST API for a specific timestamp
 * Uses the 1-minute kline (candle) closing price.
 */
export async function fetchBinancePriceAtTime(
  timestampMs: number,
  assetPair: BinaryAssetPair = DEFAULT_BINARY_ASSET,
): Promise<number> {
  try {
    // Target the candle that ends AT or JUST BEFORE the timestamp.
    // If market ends at 20:30:00, we want the close of the 20:29:00-20:29:59 candle.
    const startTime = Math.floor((timestampMs - 1) / 60000) * 60000;
    const response = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${assetPair}&interval=1m&startTime=${startTime}&limit=1`,
      { signal: AbortSignal.timeout(5000) },
    );
    const data = await response.json();
    if (response.ok && Array.isArray(data) && data[0]?.[0] === startTime) {
      // kline[4] is the close price
      const closePrice = parseFloat(data[0][4]);
      if (!isNaN(closePrice) && closePrice > 0) {
        return closePrice;
      }
    }
    return 0;
  } catch (err) {
    console.error("[BinanceFeed] Historical fetch failed:", err);
    return 0;
  }
}

export async function fetchBinanceSecondPrices(
  startTime: number,
  endTime: number,
  assetPair: BinaryAssetPair = DEFAULT_BINARY_ASSET,
) {
  if (endTime <= startTime) return [];

  const response = await fetch(
    `https://data-api.binance.vision/api/v3/klines?symbol=${assetPair}&interval=1s&startTime=${startTime}&endTime=${endTime - 1}&limit=300`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Binance second candles returned ${response.status}`);
  }

  const candles: unknown = await response.json();
  if (!Array.isArray(candles))
    throw new Error("Invalid Binance candle response");

  return candles.map((candle, index) => {
    const openTime = startTime + index * 1000;
    const timestamp = openTime + 1000;
    const price = Number(candle?.[4]);
    if (
      candle?.[0] !== openTime ||
      candle?.[6] !== timestamp - 1 ||
      timestamp > endTime ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      throw new Error("Missing or invalid Binance second candle");
    }
    return { price, timestamp: new Date(timestamp) };
  });
}
