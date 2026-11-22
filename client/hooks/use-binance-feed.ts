import { useSyncExternalStore } from "react";
import { BINARY_ASSET_PAIRS, type BinaryAssetPair } from "@shared/binaryAssets";
import type { PricePoint } from "@shared/binaryPrice";

const MAX_HISTORY = 1_000;
const RECONNECT_DELAY = 3_000;

function createFeed(assetPair: BinaryAssetPair) {
  const observers = new Set<() => void>();
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshot = {
    price: 0,
    isConnected: false,
    priceHistory: [] as PricePoint[],
  };

  function publish(update: Partial<typeof snapshot>) {
    snapshot = { ...snapshot, ...update };
    observers.forEach((observer) => observer());
  }

  function connect() {
    if (socket || observers.size === 0) return;

    try {
      socket = new WebSocket(
        "wss://data-stream.binance.vision:9443/ws/" +
          assetPair.toLowerCase() +
          "@aggTrade",
      );
      socket.onopen = () => publish({ isConnected: true });
      socket.onmessage = ({ data }) => {
        try {
          const price = Number(JSON.parse(data).p);
          const timestamp = Date.now();
          const last = snapshot.priceHistory[snapshot.priceHistory.length - 1];
          if (
            !Number.isFinite(price) ||
            price <= 0 ||
            (last && timestamp - last.timestamp < 1000)
          )
            return;
          publish({
            price,
            priceHistory: [
              ...snapshot.priceHistory.slice(1 - MAX_HISTORY),
              { price, timestamp },
            ],
          });
        } catch {
          // Ignore malformed exchange messages.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        socket = null;
        publish({ isConnected: false });
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
      };
    } catch {
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(observer: () => void) {
      observers.add(observer);
      if (observers.size === 1) connect();
      return () => {
        observers.delete(observer);
        if (observers.size > 0) return;
        clearTimeout(reconnectTimer);
        if (socket) {
          socket.onopen =
            socket.onmessage =
            socket.onerror =
            socket.onclose =
              null;
          socket.close();
          socket = null;
        }
        publish({ isConnected: false });
      };
    },
  };
}

const feeds = new Map(
  BINARY_ASSET_PAIRS.map((pair) => [pair, createFeed(pair)]),
);

export function useBinanceFeed(assetPair: BinaryAssetPair) {
  const feed = feeds.get(assetPair);
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot);
}
