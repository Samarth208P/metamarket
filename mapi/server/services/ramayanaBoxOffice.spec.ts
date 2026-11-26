import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { ramayanaBoxOfficeSnapshot } from "../../../shared/ramayana.ts";
import {
  parseRamayanaBoxOffice,
  refreshInterval,
  subscribeRamayanaBoxOffice,
} from "./ramayanaBoxOffice.ts";
import { attachRamayanaSocket } from "./ramayanaNodeSocket.ts";
import {
  createStreamTicket,
  validStreamTicket,
} from "./ramayanaStreamTicket.ts";

function page(total: string) {
  return `<h2 class="br-h">Overseas and worldwide</h2><div class="br-tiles br-tiles--3"><div class="br-tile"><b>₹1,126.50 Cr</b><span>India gross</span></div><div class="br-tile"><b>₹567.00 Cr</b><span>Overseas gross</span></div><div class="br-tile"><b>₹${total} Cr</b><span>Worldwide gross</span></div></div><table></table>`;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("reads the published headline even with consecutive missing worldwide entries", () => {
  const history = `<table class="br-dw"><thead><tr><th>Day</th><th>Worldwide</th></tr></thead><tbody>
    <tr><td>Day 1</td><td>₹128.75 Cr</td></tr>
    <tr><td>Day 2</td><td>–</td></tr>
    <tr><td>Day 3 · live estimate</td><td>–</td></tr>
    </tbody></table>`;
  expect(
    parseRamayanaBoxOffice(history + page("1,693.50"), {
      ...ramayanaBoxOfficeSnapshot,
      dailyGross: [],
    }),
  ).toMatchObject({
    worldwideGross: 1693.5,
    dailyGross: [128.75],
    pendingDay: 2,
    sourceStatus: "current",
  });
  expect(
    parseRamayanaBoxOffice(
      page("1,693.50").replace("Worldwide gross", "India net"),
    ),
  ).toBeNull();
});

it("pushes corrections to subscribers, shares upstream checks, and keeps the total on failure", async () => {
  vi.useFakeTimers({ now: new Date("2026-01-01") });
  const fetchSource = vi
    .fn()
    .mockResolvedValueOnce(new Response(page("1,705.50")))
    .mockResolvedValueOnce(new Response(page("1,704.25")))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetchSource);
  const send = vi.fn();
  const stop = subscribeRamayanaBoxOffice(send);
  const stopSecond = subscribeRamayanaBoxOffice(vi.fn());
  try {
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(refreshInterval * 2);
    expect(
      send.mock.calls.map(([data]) => {
        const { worldwideGross, sourceStatus } = JSON.parse(data);
        return [worldwideGross, sourceStatus];
      }),
    ).toEqual([
      [1705.5, "current"],
      [1704.25, "current"],
      [1704.25, "saved"],
    ]);
    expect(fetchSource).toHaveBeenCalledTimes(3);
  } finally {
    stop();
    stopSecond();
  }
  await vi.advanceTimersByTimeAsync(refreshInterval);
  expect(fetchSource).toHaveBeenCalledTimes(3);
});

it("delivers the initial and revised totals on the same WebSocket connection", async () => {
  vi.useFakeTimers({
    now: new Date("2026-02-01"),
    toFake: ["Date", "setTimeout", "clearTimeout"],
  });
  const secret = "test-ramayana-feed";
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(page("1,704.25")))
      .mockResolvedValueOnce(new Response(page("1,712.50"))),
  );
  const server = createServer();
  attachRamayanaSocket(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const ticket = createStreamTicket(secret);
  expect(validStreamTicket(ticket, "other secret")).toBe(false);
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/mapi/ramayana/stream?ticket=${ticket}`,
  );
  try {
    const message = await once(socket, "message");
    expect(JSON.parse(message[0].data).worldwideGross).toBe(1704.25);
    const update = once(socket, "message");
    await vi.advanceTimersByTimeAsync(refreshInterval);
    expect(JSON.parse((await update)[0].data).worldwideGross).toBe(1712.5);
  } finally {
    const closed = once(socket, "close");
    socket.close();
    await closed;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
