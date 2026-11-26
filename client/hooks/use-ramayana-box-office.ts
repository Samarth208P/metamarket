import { useEffect, useState } from "react";
import {
  ramayanaBoxOfficeSnapshot,
  type RamayanaBoxOffice,
} from "@shared/ramayana";

export function useRamayanaBoxOffice() {
  const [report, setReport] = useState(ramayanaBoxOfficeSnapshot);

  useEffect(() => {
    const controller = new AbortController();
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2000;

    function accept(next: RamayanaBoxOffice) {
      if (
        !Number.isFinite(next.worldwideGross) ||
        !Number.isFinite(next.checkedAt) ||
        !Array.isArray(next.dailyGross) ||
        !next.dailyGross.length ||
        !next.dailyGross.every(Number.isFinite)
      )
        throw new Error("Invalid box office report");
      setReport((previous) =>
        next.checkedAt >= previous.checkedAt
          ? next
          : { ...previous, sourceStatus: next.sourceStatus },
      );
    }

    function retry() {
      clearTimeout(timer);
      if (controller.signal.aborted) return;
      timer = setTimeout(connect, delay);
      delay = Math.min(30_000, delay * 2);
    }

    async function connect() {
      try {
        const response = await fetch("/mapi/ramayana/box-office", {
          credentials: "include",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(18_000),
          ]),
        });
        if (!response.ok) throw new Error("Box office report unavailable");
        const { streamUrl, ...snapshot } = await response.json();
        if (controller.signal.aborted) return;
        accept(snapshot as RamayanaBoxOffice);
        if (!streamUrl) throw new Error("Stream unavailable");
        const url = new URL(streamUrl, window.location.href);
        if (url.protocol === "https:") url.protocol = "wss:";
        if (url.protocol === "http:") url.protocol = "ws:";
        const client = new WebSocket(url);
        socket = client;
        timer = setTimeout(() => client.close(), 20_000);
        client.onmessage = ({ data }) => {
          try {
            accept(JSON.parse(data));
            delay = 2000;
            clearTimeout(timer);
            timer = setTimeout(() => client.close(), 90_000);
          } catch {
            client.close();
          }
        };
        client.onerror = () => client.close();
        client.onclose = retry;
      } catch {
        if (!controller.signal.aborted) {
          setReport((previous) => ({ ...previous, sourceStatus: "saved" }));
          retry();
        }
      }
    }
    void connect();
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (socket) {
        socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
      }
    };
  }, []);
  return report;
}
