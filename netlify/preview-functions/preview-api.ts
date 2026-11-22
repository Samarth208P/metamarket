import type { Handler, HandlerResponse } from "@netlify/functions";
import serverless from "serverless-http";
import { configureIsolatedEnvironment } from "../../mapi/server/isolatedEnvironment.js";

const functionPath = "/.netlify/functions/preview-api";
const previewUrl = "https://develop--mytamarket.netlify.app";
let appPromise: Promise<ReturnType<typeof serverless>> | undefined;

async function startPreviewApi() {
  configureIsolatedEnvironment("PREVIEW", process.env, previewUrl);
  process.env.NODE_ENV = "production";
  const { connectDB, createServer } = await import("../../mapi/server/index.js");
  await connectDB({ serverSelectionTimeoutMS: 5_000 });
  return serverless(await createServer({ enableBinaryMarkets: false }), {
    basePath: functionPath,
  });
}

export const handler: Handler = async (event, context) => {
  const path = event.path.startsWith(functionPath)
    ? event.path.slice(functionPath.length)
    : event.path;

  if (path === "/mapi/ping") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping", environment: "preview" }),
    };
  }

  try {
    appPromise ??= startPreviewApi();
    const app = await appPromise;
    return (await app(event, context)) as HandlerResponse;
  } catch (error) {
    appPromise = undefined;
    console.error("[Preview API] Request failed:", error);
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "The preview API is unavailable." }),
    };
  }
};
