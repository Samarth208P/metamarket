import { useState, useEffect, useRef, useCallback } from "react";

const BINANCE_WS_URL = "wss://data-stream.binance.vision:9443/ws/btcusdt@aggTrade";
const MAX_HISTORY = 1000;
const RECONNECT_DELAY = 3000;

export interface PricePoint {
  price: number;
  timestamp: number;
}

// Global state to persist data across page navigations
let globalPrice = 0;
let globalIsConnected = false;
let globalPriceHistory: PricePoint[] = [];
let observers: Set<(data: { price: number; isConnected: boolean; history: PricePoint[] }) => void> = new Set();
let ws: WebSocket | null = null;
let lastSampleTime = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function notifyObservers() {
  const data = {
    price: globalPrice,
    isConnected: globalIsConnected,
    history: [...globalPriceHistory]
  };
  observers.forEach(callback => callback(data));
}

function startGlobalFeed() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(BINANCE_WS_URL);

    ws.onopen = () => {
      globalIsConnected = true;
      notifyObservers();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newPrice = parseFloat(data.p);
        if (!isNaN(newPrice) && newPrice > 0) {
          const now = Date.now();
          if (now - lastSampleTime >= 1000) {
            globalPrice = newPrice;
            lastSampleTime = now;
            globalPriceHistory.push({ price: newPrice, timestamp: now });
            if (globalPriceHistory.length > MAX_HISTORY) {
              globalPriceHistory.shift();
            }
            notifyObservers();
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      globalIsConnected = false;
      ws = null;
      notifyObservers();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(startGlobalFeed, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      if (ws) ws.close();
    };
  } catch (e) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startGlobalFeed, RECONNECT_DELAY);
  }
}

// Start the feed immediately when the module is loaded
if (typeof window !== "undefined") {
  startGlobalFeed();
}

export function useBinanceFeed() {
  const [data, setData] = useState({
    price: globalPrice,
    isConnected: globalIsConnected,
    priceHistory: globalPriceHistory
  });

  useEffect(() => {
    const observer = (newData: { price: number; isConnected: boolean; history: PricePoint[] }) => {
      setData({
        price: newData.price,
        isConnected: newData.isConnected,
        priceHistory: newData.history
      });
    };

    observers.add(observer);
    // Sync immediately
    observer({ price: globalPrice, isConnected: globalIsConnected, history: globalPriceHistory });

    return () => {
      observers.delete(observer);
    };
  }, []);

  return data;
}
