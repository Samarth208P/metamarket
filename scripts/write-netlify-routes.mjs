import { writeFile } from "node:fs/promises";

const target = process.argv[2];
if (target !== "production" && target !== "preview") {
  throw new Error("Specify a production or preview Netlify build.");
}

const production = target === "production";
if (
  production &&
  (process.env.CONTEXT !== "production" || process.env.BRANCH !== "main")
) {
  throw new Error("Production API routing requires the Netlify main production deploy.");
}

const api = production
  ? "https://metamarket-backend.onrender.com/mapi/:splat"
  : "/.netlify/functions/preview-api/mapi/:splat";

await writeFile("dist/_redirects", `/mapi/* ${api} 200!\n/* /index.html 200\n`);
if (!production) {
  await writeFile("dist/_headers", "/*\n  X-Robots-Tag: noindex, nofollow\n");
}
