import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { runScheduledBtcCycle } from "../../../mapi/server/services/binaryScheduler.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const key = Deno.env.get("METAMARKET_CRON_TOKEN");
  const expected = Buffer.from(key ?? "");
  const supplied = Buffer.from(
    request.headers.get("x-metamarket-cron-token") ?? "",
  );
  if (
    !key ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runScheduledBtcCycle();
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("[BTC cron] Cycle failed:", error);
    return Response.json({ error: "BTC cycle failed" }, { status: 503 });
  }
});
