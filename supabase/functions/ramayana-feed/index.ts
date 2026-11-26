import { subscribeRamayanaBoxOffice } from "../../../mapi/server/services/ramayanaBoxOffice.ts";
import { validStreamTicket } from "../../../mapi/server/services/ramayanaStreamTicket.ts";

Deno.serve((request) => {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response(null, { status: 426 });
  }
  const ticket = new URL(request.url).searchParams.get("ticket");
  if (!validStreamTicket(ticket, Deno.env.get("SESSION_SECRET") ?? "")) {
    return new Response(null, { status: 403 });
  }
  const { socket, response } = Deno.upgradeWebSocket(request);
  let stop: (() => void) | undefined;
  socket.onopen = () => {
    stop = subscribeRamayanaBoxOffice((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });
  };
  socket.onclose = () => stop?.();
  socket.onerror = () => stop?.();
  return response;
});
