import { randomUUID } from "node:crypto";
import { ApiError } from "../routes/asyncRoute.ts";

export const MAX_MARKET_IMAGE_BYTES = 5 * 1024 * 1024;
const bucket = "market-images";

function imageType(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mime: "image/jpeg" };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return { extension: "png", mime: "image/png" };
  }
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", mime: "image/webp" };
  }
  throw new ApiError(415, { error: "Upload a JPEG, PNG, or WebP image." });
}

function storageConfig() {
  const production = process.env.NODE_ENV === "production";
  const url = production
    ? process.env.SUPABASE_URL
    : (process.env.METAMARKET_DEV_STORAGE_URL ?? process.env.SUPABASE_DEV_URL);
  const key = production
    ? process.env.METAMARKET_STORAGE_KEY
    : (process.env.METAMARKET_DEV_STORAGE_KEY ??
      process.env.SUPABASE_DEV_STORAGE_KEY);
  if (!url || !key || !URL.canParse(url)) {
    throw new ApiError(503, { error: "Market image storage is unavailable." });
  }
  const origin = new URL(url);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
    origin.hostname,
  );
  if (
    production
      ? loopback || origin.protocol !== "https:"
      : !loopback || !["http:", "https:"].includes(origin.protocol)
  ) {
    throw new ApiError(503, { error: "Market image storage is unavailable." });
  }
  const uploadOrigin = production
    ? origin
    : process.env.METAMARKET_DEV_STORAGE_ORIGIN || origin;
  return { origin, key, uploadOrigin };
}

export async function uploadMarketImage(bytes: Buffer) {
  if (bytes.length > MAX_MARKET_IMAGE_BYTES) {
    throw new ApiError(413, { error: "Images must be 5 MB or smaller." });
  }
  const { extension, mime } = imageType(bytes);
  const { origin, key, uploadOrigin } = storageConfig();
  const object = `${bucket}/${randomUUID()}.${extension}`;
  let response: Response;

  try {
    response = await fetch(
      new URL(`/storage/v1/object/${object}`, uploadOrigin),
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": mime,
          "Cache-Control": "max-age=31536000",
        },
        body: new Uint8Array(bytes),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new ApiError(502, { error: "Could not reach market image storage." });
  }

  await response.body?.cancel().catch(() => {});
  if (!response.ok) {
    console.error("[Storage] Market image upload failed:", response.status);
    throw new ApiError(502, { error: "Could not store the market image." });
  }

  return new URL(`/storage/v1/object/public/${object}`, origin).href;
}
