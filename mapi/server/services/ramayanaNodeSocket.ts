import type { Server } from "node:net";
import { WebSocketServer } from "ws";
import { subscribeRamayanaBoxOffice } from "./ramayanaBoxOffice.ts";
import {
  ramayanaStreamPath,
  validStreamTicket,
} from "./ramayanaStreamTicket.ts";

export function attachRamayanaSocket(server: Server) {
  const feed = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on("upgrade", (request, socket, head) => {
    if (request.url?.split("?", 1)[0] !== ramayanaStreamPath) return;
    const url = new URL(request.url, "http://localhost");
    if (
      !validStreamTicket(
        url.searchParams.get("ticket"),
        process.env.SESSION_SECRET,
      )
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    feed.handleUpgrade(request, socket, head, (client) => {
      const stop = subscribeRamayanaBoxOffice((data) => {
        if (client.readyState === 1) client.send(data);
      });
      client.once("close", stop);
      client.on("error", () => client.terminate());
    });
  });
  server.once("close", () => feed.close());
}
