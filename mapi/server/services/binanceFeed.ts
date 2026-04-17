/**
 * Binance WebSocket Price Feed Manager (Server-side)
 *
 * Connects to the Binance aggTrade stream for BTCUSDT and provides
 * the latest price to the scheduler and settlement engine.
 */

import { EventEmitter } from "events";

const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@aggTrade";
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

  constructor() {
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
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(BINANCE_WS_URL);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log("[BinanceFeed] Connected to Binance aggTrade stream");
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
        console.error("[BinanceFeed] WebSocket error:", err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.log("[BinanceFeed] Disconnected from Binance");
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

// Singleton instance
export const binanceFeed = new BinanceFeedManager();

/**
 * Fetch latest price from Binance REST API as a fallback
 */
export async function fetchBinancePriceRest(): Promise<number> {
  try {
    const response = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
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
export async function fetchBinanceRecentPricesRest(): Promise<number[]> {
  try {
    const response = await fetch(
      "https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=20",
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
): Promise<number> {
  try {
    // Target the candle that ends AT or JUST BEFORE the timestamp.
    // If market ends at 20:30:00, we want the close of the 20:29:00-20:29:59 candle.
    const startTime = Math.floor((timestampMs - 1) / 60000) * 60000;
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${startTime}&limit=1`,
    );
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
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
