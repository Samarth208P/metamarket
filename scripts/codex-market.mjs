import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const usage = `Usage: node scripts/codex-market.mjs <command>
  new-id
  drafts
  expired
  create <id> <draft.json>
  revise <id> <current-revision> <draft.json>
  report <id> <current-revision> <evidence.json>
Use - for a JSON file to read from stdin.`;

async function jsonInput(file) {
  let text = "";
  if (file === "-") {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) text += chunk;
  } else {
    text = await readFile(file, "utf8");
  }
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

async function main(args) {
  const [operation, id, version, file] = args;
  if (!operation || operation === "--help") return console.log(usage);
  if (operation === "new-id") return console.log(randomUUID());
  const commands = { drafts: 1, expired: 1, create: 3, revise: 4, report: 4 };
  if (
    !Object.hasOwn(commands, operation) ||
    args.length !== commands[operation]
  )
    throw new Error(usage);

  const base = new URL(
    process.env.METAMARKET_CODEX_API_URL || "http://localhost:8080/mapi",
  );
  const token = process.env.METAMARKET_CODEX_TOKEN;
  if (!token)
    throw new Error(
      "Configure METAMARKET_CODEX_TOKEN for the selected MetaMarket API.",
    );
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      ))
  )
    throw new Error(
      "Use HTTPS for the API URL or HTTP on loopback for local development.",
    );

  let path = operation;
  let body;
  if (id) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))
      throw new Error("Expected a UUID from new-id or drafts.");
    const revision = operation === "create" ? 0 : Number(version);
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new Error("Invalid revision.");
    const input = await jsonInput(operation === "create" ? version : file);
    const evidence = operation === "report";
    path = (evidence ? "evidence/" : "drafts/") + id;
    body = JSON.stringify(
      evidence ? { revision, evidence: input } : { revision, draft: input },
    );
  }
  const url = base.href.replace(/\/$/, "") + "/codex/agent/" + path;
  const response = await fetch(url, {
    method: body ? "PUT" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: "Bearer " + token,
      ...(body && { "Content-Type": "application/json" }),
    },
    body,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null)
    throw new Error(
      result?.error || "MetaMarket API returned " + response.status,
    );
  console.log(JSON.stringify(result, null, 2));
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message, error.cause?.code ?? "");
  process.exitCode = 1;
});
