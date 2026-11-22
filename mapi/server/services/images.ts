import { randomUUID } from "node:crypto";
import { MAX_IMAGE_BYTES } from "../../../shared/api.ts";
import { ApiError } from "../routes/asyncRoute.ts";

type ImageBucket = "market-images" | "profile-images";

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

function storageOrigin() {
  const production = process.env.NODE_ENV === "production";
  const url = production
    ? process.env.SUPABASE_URL
    : (process.env.METAMARKET_DEV_STORAGE_URL ?? process.env.SUPABASE_DEV_URL);
  if (!url || !URL.canParse(url)) return null;
  const origin = new URL(url);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
    origin.hostname,
  );
  if (
    production
      ? loopback || origin.protocol !== "https:"
      : !loopback || !["http:", "https:"].includes(origin.protocol)
  ) {
    return null;
  }
  return origin;
}

function storageConfig() {
  const production = process.env.NODE_ENV === "production";
  const origin = storageOrigin();
  const key = production
    ? process.env.METAMARKET_STORAGE_KEY
    : (process.env.METAMARKET_DEV_STORAGE_KEY ??
      process.env.SUPABASE_DEV_STORAGE_KEY);
  if (!origin || !key) {
    throw new ApiError(503, { error: "Image storage is unavailable." });
  }
  const uploadOrigin = production
    ? origin
    : process.env.METAMARKET_DEV_STORAGE_ORIGIN || origin;
  return { key, uploadOrigin };
}

export function publicImageUrl(
  bucket: ImageBucket,
  path: string | null | undefined,
) {
  const origin = storageOrigin();
  if (!origin || !path) return null;
  return new URL(
    `/storage/v1/object/public/${bucket}/${encodeURIComponent(path)}`,
    origin,
  ).href;
}

export async function uploadImage(bucket: ImageBucket, bytes: Buffer) {
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, { error: "Images must be 5 MB or smaller." });
  }
  const { extension, mime } = imageType(bytes);
  const { key, uploadOrigin } = storageConfig();
  const path = `${randomUUID()}.${extension}`;
  let response: Response;

  try {
    response = await fetch(
      new URL(`/storage/v1/object/${bucket}/${path}`, uploadOrigin),
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": mime,
          "Cache-Control":
            bucket === "market-images" ? "max-age=31536000" : "max-age=60",
        },
        body: new Uint8Array(bytes),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new ApiError(502, { error: "Could not reach image storage." });
  }

  await response.body?.cancel().catch(() => {});
  if (!response.ok) {
    console.error("[Storage] Image upload failed:", bucket, response.status);
    throw new ApiError(502, { error: "Could not store the image." });
  }

  return path;
}

export async function removeProfileImage(path: string) {
  const { key, uploadOrigin } = storageConfig();
  const response = await fetch(
    new URL("/storage/v1/object/profile-images", uploadOrigin),
    {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [path] }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  await response.body?.cancel().catch(() => {});
  if (!response.ok)
    throw new Error(`Storage deletion failed (${response.status})`);
}
