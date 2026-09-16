import { sql as sqlTag } from "drizzle-orm";
import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool } from "pg";
import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Single shared database connection.
 *
 *  PostgreSQL is the PRIMARY database (Google Sheets is only a sync/reporting
 *  copy). Two drivers are supported and the right one is picked automatically:
 *
 *   • local server / VPS / Docker   → `pg` TCP pool        (default)
 *   • Vercel / Cloudflare / Lambda  → Neon WebSocket pool  (serverless safe)
 *
 *  Neon is selected when
 *      DB_DRIVER=neon                       (explicit), or
 *      the DATABASE_URL host contains "neon.tech"
 *  — which covers Neon's pooler host, e.g.
 *      postgresql://user:pass@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/db?sslmode=require
 *
 *  Both drivers expose the same Drizzle query surface used across the app, and
 *  both support `db.execute(sql.raw(...))`, so the migrate/seed/reset scripts
 *  work unchanged against either one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://messapp:messapp@127.0.0.1:5432/mess_manager";

function detectDriver(): "neon" | "pg" {
  const forced = (process.env.DB_DRIVER ?? "").trim().toLowerCase();
  if (forced === "neon" || forced === "neon-serverless") return "neon";
  if (forced === "pg" || forced === "node-postgres") return "pg";
  try {
    const host = new URL(DATABASE_URL).hostname.toLowerCase();
    if (host.includes("neon.tech")) return "neon";
  } catch {
    /* malformed URL → fall back to pg, which will surface the real error */
  }
  return "pg";
}

export const DB_DRIVER = detectDriver();
export const IS_NEON = DB_DRIVER === "neon";

/**
 * Serverless notes (Neon driver v1.x):
 *  • the bundled `ws` is used automatically in Node runtimes
 *  • `useSecureWebSocket` stays true — Neon's proxy has a valid certificate
 *  • `coalesceWrites` batches rapid small writes (meal grid saves) into one round trip
 */
if (IS_NEON) {
  neonConfig.coalesceWrites = true;
  // Node runtimes (local dev/scripts, some serverless hosts) ship no global
  // WebSocket — then the Neon driver must use the `ws` package. Platforms with
  // a built-in WebSocket (Vercel) keep their global implementation.
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== "function") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const wsMod = require("ws") as { WebSocket?: unknown; default?: unknown };
      const Ws = wsMod.WebSocket ?? wsMod.default ?? wsMod;
      neonConfig.webSocketConstructor = Ws as typeof WebSocket;
    } catch {
      /* no `ws` available — let the driver surface its own connection error */
    }
  }
}

type AnyDatabase = (NodePgDatabase<typeof schema> | NeonDatabase<typeof schema>) &
  NodePgDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __messClient: Pool | NeonPool | undefined;
  // eslint-disable-next-line no-var
  var __messDb: AnyDatabase | undefined;
}

function createClient(): { client: Pool | NeonPool; database: AnyDatabase } {
  if (IS_NEON) {
    const client = new NeonPool({
      connectionString: DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 15_000,
      // Neon requires TLS; the pooler URL usually carries ?sslmode=require already
      ssl: { rejectUnauthorized: false },
    });
    return {
      client,
      database: drizzleNeon(client, { schema, logger: false }) as unknown as AnyDatabase,
    };
  }

  const client = new Pool({
    connectionString: DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: false,
  });
  return {
    client,
    database: drizzleNodePg(client, { schema, logger: false }) as unknown as AnyDatabase,
  };
}

if (!global.__messClient || !global.__messDb) {
  const created = createClient();
  global.__messClient = created.client;
  global.__messDb = created.database;
}

/** Drizzle instance used by every query in the app. */
export const db = global.__messDb;

/** The raw client — `Pool` locally, `NeonPool` on serverless. */
export const pool = global.__messClient;

export type DB = typeof db;

/** Driver-aware connection pool stats for /api/health. */
export function poolStats(): { driver: string; total: number; idle: number; waiting: number } {
  const p = pool as (Pool & NeonPool) | undefined;
  return {
    driver: IS_NEON ? "neon-serverless (websocket)" : "node-postgres (tcp)",
    total: Number(p?.totalCount ?? 0),
    idle: Number(p?.idleCount ?? 0),
    waiting: Number(p?.waitingCount ?? 0),
  };
}

/** Close the connection pool (CLI scripts; a no-op cost on serverless). */
export async function closeDb(): Promise<void> {
  try {
    await (pool as Pool)?.end?.();
  } catch {
    /* already closed */
  }
}

/** Quick liveness probe used by /api/health and the migration runner. */
export async function pingDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await db.execute(sqlOne);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** tiny constant query, created once */
const sqlOne = sqlTag`select 1`;

export * from "./schema";
