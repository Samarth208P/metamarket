import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export const ramayanaStreamPath = "/mapi/ramayana/stream";

function signature(expires: string, secret: string) {
  return createHmac("sha256", secret)
    .update("ramayana-feed:" + expires)
    .digest("base64url");
}

export function createStreamTicket(secret: string) {
  const expires = String(Date.now() + 60_000);
  return expires + "." + signature(expires, secret);
}

export function validStreamTicket(ticket: string | null, secret: string) {
  const match = ticket?.match(/^(\d{13})\.([A-Za-z0-9_-]{43})$/);
  if (!secret || !match || Number(match[1]) <= Date.now()) return false;
  return timingSafeEqual(
    Buffer.from(match[2]),
    Buffer.from(signature(match[1], secret)),
  );
}
