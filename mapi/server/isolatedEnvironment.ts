import { randomBytes } from "node:crypto";

const INTEGRATION_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

export function configureIsolatedEnvironment(
  target: "LOCAL" | "PREVIEW",
  values: NodeJS.ProcessEnv,
  frontendUrl: string,
) {
  const local = target === "LOCAL";
  const uri =
    values[`${target}_MONGODB_URI`] ||
    (local ? "mongodb://127.0.0.1:27017/metamarket_local" : "");
  const sessionSecret = values[`${target}_SESSION_SECRET`];

  if (!uri || (!local && !sessionSecret)) {
    throw new Error("Preview requires PREVIEW_MONGODB_URI and PREVIEW_SESSION_SECRET.");
  }

  let mongo: URL;
  try {
    mongo = new URL(uri);
  } catch {
    throw new Error(`${target}_MONGODB_URI must be a valid MongoDB URI.`);
  }

  if (local) {
    if (
      mongo.protocol !== "mongodb:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(mongo.hostname) ||
      mongo.pathname !== "/metamarket_local" ||
      [...mongo.searchParams.keys()].some((key) => key !== "authSource")
    ) {
      throw new Error("Local development requires a loopback MongoDB URI for metamarket_local.");
    }
  } else if (
    !["mongodb:", "mongodb+srv:"].includes(mongo.protocol) ||
    mongo.pathname !== "/metamarket_preview"
  ) {
    throw new Error("Preview requires a MongoDB URI for metamarket_preview.");
  }

  // Set every consumed setting before importing the API. Empty strings keep
  // dotenv and inherited production variables out of optional integrations.
  for (const key of INTEGRATION_KEYS) {
    process.env[key] = values[`${target}_${key}`] || "";
  }
  process.env.MONGODB_URI = uri;
  process.env.SESSION_SECRET = sessionSecret || randomBytes(32).toString("hex");
  process.env.FRONTEND_URL = frontendUrl;
  process.env.GOOGLE_CALLBACK_URL = `${frontendUrl}/mapi/auth/google/callback`;
}
