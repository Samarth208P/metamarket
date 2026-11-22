import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(
  new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
);
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
const localDatabase =
  "postgresql://metamarket_backend:metamarket_local_dev@127.0.0.1:54322/postgres";
const excluded =
  "gotrue,realtime,imgproxy,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
const options = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };

function run(...args) {
  return execFileSync(process.execPath, [cli, ...args], options);
}

try {
  console.log("Starting local Supabase Postgres and Storage…");
  run("start", "-x", excluded);
  run("db", "push");
  run(
    "db",
    "query",
    "alter role metamarket_backend password 'metamarket_local_dev'",
  );

  const status = JSON.parse(run("status", "-o", "json"));
  const storageOrigin = new URL(status.API_URL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(storageOrigin.hostname)) {
    throw new Error("Expected a loopback URL for local Storage");
  }
  // The local Storage container has its own service key even with GoTrue disabled.
  const container = JSON.parse(
    execFileSync("docker", ["inspect", "supabase_storage_metamarket"], options),
  )[0];
  const storageKey = container.Config.Env.find((value) =>
    value.startsWith("SERVICE_KEY="),
  )?.slice("SERVICE_KEY=".length);
  if (!storageKey || !/^[\w.-]+$/.test(storageKey)) {
    throw new Error("Local Storage did not provide a service key");
  }

  let env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  for (const [name, value] of Object.entries({
    SUPABASE_DEV_DATABASE_URL: localDatabase,
    SUPABASE_DEV_URL: storageOrigin.origin,
    SUPABASE_DEV_STORAGE_KEY: storageKey,
  })) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    env = pattern.test(env)
      ? env.replace(pattern, `${name}=${value}`)
      : `${env.trimEnd()}\n${name}=${value}\n`;
  }
  writeFileSync(envFile, env, { mode: 0o600 });
  console.log(
    "Local Postgres and Storage are ready. Development settings are in .env.",
  );
} catch (error) {
  // Never print CLI output that could contain credentials.
  const reason =
    error.status == null
      ? "local setup error"
      : `command exited with status ${error.status}`;
  console.error(
    `Could not start local Supabase (${reason}). Check the local stack with the Supabase CLI.`,
  );
  process.exitCode = 1;
}
