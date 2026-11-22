import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { runScheduledBinaryCycles } from "../../../mapi/server/services/binaryScheduler.ts";

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
    await runScheduledBinaryCycles();
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("[Binary market cron] Cycle failed:", error);
    return Response.json(
      { error: "Binary market cycle failed" },
      { status: 503 },
    );
  }
});
