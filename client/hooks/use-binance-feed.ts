/**
 * Client-side Binance WebSocket hook for live BTC price.
 *
 * Connects directly to wss://stream.binance.com:9443/ws/btcusdt@aggTrade
 * for sub-second price updates in the browser.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@aggTrade";
const MAX_HISTORY = 1000; // Rolling window for chart
const RECONNECT_DELAY = 3000;

export interface PricePoint {
  price: number;
  timestamp: number;
}

export function useBinanceFeed() {
  const [price, setPrice] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const lastSampleRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(BINANCE_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const newPrice = parseFloat(data.p);
          if (!isNaN(newPrice) && newPrice > 0) {
            // Sample every 1 sec to smooth graph and stabilize Up/Down odds
            const now = Date.now();
            if (now - lastSampleRef.current >= 1000) {
              setPrice(newPrice);
              lastSampleRef.current = now;
              setPriceHistory((prev) => {
                const next = [...prev, { price: newPrice, timestamp: now }];
                if (next.length > MAX_HISTORY) next.shift();
                return next;
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        // Error handling via onclose
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (shouldReconnectRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        }
      };
    } catch {
      if (shouldReconnectRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY);
      }
    }
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { price, isConnected, priceHistory };
}
