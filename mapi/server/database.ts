import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

const accountScope = new AsyncLocalStorage<string>();
const transactionScope = new AsyncLocalStorage<{
  client: PoolClient;
  system: boolean;
}>();
let pool: Pool | undefined;

function databasePool() {
  if (pool) return pool;
  const production = process.env.NODE_ENV === "production";
  const variable = production
    ? "METAMARKET_DATABASE_URL"
    : "SUPABASE_DEV_DATABASE_URL";
  const connectionString =
    process.env[variable] ??
    (!production ? process.env.METAMARKET_DEV_DATABASE_URL : undefined);
  if (!connectionString) throw new Error(`${variable} is required`);
  const url = new URL(connectionString);
  if (url.username.split(".")[0] !== "metamarket_backend") {
    throw new Error(`${variable} must use the metamarket_backend login`);
  }
  const local = [
    "127.0.0.1",
    "localhost",
    "[::1]",
    "db.supabase.internal",
    "host.docker.internal",
  ].includes(url.hostname);
  if (!production && !local)
    throw new Error("Development requires a local Supabase database");
  if (
    production &&
    (local || url.searchParams.get("sslmode") !== "verify-full")
  ) {
    throw new Error(
      "Production requires a remote Supabase database with sslmode=verify-full",
    );
  }
  pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 8000 });
  pool.on("error", () => console.error("[DB] Idle connection failed"));
  return pool;
}

export function newId() {
  return randomBytes(12).toString("hex");
}

export function isRecordId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
}

export function withAccount<T>(id: string, operation: () => T) {
  return accountScope.run(id, operation);
}

async function transaction<T>(
  system: boolean,
  operation: () => Promise<T>,
): Promise<T> {
  const current = transactionScope.getStore();
  if (current) {
    if (system && !current.system)
      throw new Error("Cannot elevate a player transaction");
    return operation();
  }
  const client = await databasePool().connect();
  let releaseError: Error | undefined;
  try {
    await client.query("begin");
    await client.query(
      system
        ? "set local role metamarket_system"
        : "set local role metamarket_player",
    );
    await client.query("select set_config('metamarket.account_id', $1, true)", [
      accountScope.getStore() ?? "",
    ]);
    const result = await transactionScope.run({ client, system }, operation);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      releaseError = rollbackError as Error;
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

export function withSystem<T>(operation: () => Promise<T>) {
  return transaction(true, operation);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  const current = transactionScope.getStore();
  if (current) return current.client.query<T>(sql, values);
  return transaction(false, () => query<T>(sql, values));
}

export async function connectDB() {
  await withSystem(() => query("select 1 from metamarket.accounts limit 0"));
}

export async function closeDB() {
  const existingPool = pool;
  pool = undefined;
  await existingPool?.end();
}
