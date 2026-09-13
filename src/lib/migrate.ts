import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, poolStats } from "@/db";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Minimal, dependency-free SQL migration runner.
 *
 *  It applies every `drizzle/*.sql` file listed in `drizzle/meta/_journal.json`
 *  in order, records each one in a `__migrations` table, and never re-applies a
 *  migration that already succeeded — so it is safe to run as many times as you
 *  like (deploy hook, one-shot endpoint, or `npm run db:migrate:sql`).
 *
 *  Why not `drizzle-kit migrate`? Because drizzle-kit is a devDependency: it is
 *  not installed on Vercel/Railway at runtime. This runner only needs `fs` and
 *  the already-bundled `drizzle/*.sql` files (see `next.config.ts` →
 *  outputFileTracingIncludes), so migrations can run **from inside** the
 *  deployed app as well as from a laptop.
 *
 *  Works with both drivers: local `pg` TCP pool and Neon serverless websockets.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MigrationInfo {
  idx: number;
  tag: string;
  when: number;
}

export interface MigrationResult {
  ok: boolean;
  driver: string;
  applied: string[];
  skipped: string[];
  /** migrations that were recorded without executing (schema already present) */
  baselined: string[];
  failed: { tag: string; error: string } | null;
  tables: string[];
  counts: { offices: number; users: number; months: number };
  latencyMs: number;
  message: string;
}

const JOURNAL = path.join(process.cwd(), "drizzle", "meta", "_journal.json");

/** Read the migration list from the drizzle journal (sorted by idx). */
export function readJournal(): MigrationInfo[] {
  if (!fs.existsSync(JOURNAL)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(JOURNAL, "utf8")) as {
      entries?: Array<{ idx?: number; tag?: string; when?: number }>;
    };
    return (parsed.entries ?? [])
      .filter((e) => typeof e.tag === "string")
      .map((e) => ({ idx: Number(e.idx ?? 0), tag: String(e.tag), when: Number(e.when ?? 0) }))
      .sort((a, b) => a.idx - b.idx);
  } catch {
    return [];
  }
}

/**
 * Split a drizzle SQL file into individual statements.
 *
 * Drizzle joins statements with `--> statement-breakpoint` (either inline right
 * after a `;` or on its own line). Those markers must be split on FIRST — they
 * start with `--`, so stripping comment lines beforehand would swallow them and
 * silently merge statements together.
 */
export function splitStatements(fileSql: string): string[] {
  const BREAKPOINT = "--> statement-breakpoint";
  const chunks = fileSql.includes(BREAKPOINT)
    ? fileSql.split(BREAKPOINT)
    : fileSql.split(";").map((c) => `${c};`);

  const statements: string[] = [];
  for (const chunk of chunks) {
    // now it is safe to drop full-line SQL comments
    const cleaned = chunk
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim();
    if (!cleaned) continue;

    if (cleaned.includes(";")) {
      // a chunk may still hold several `;`-terminated statements
      for (const part of cleaned.split(";")) {
        const stmt = part.trim();
        if (stmt) statements.push(`${stmt};`);
      }
    } else {
      statements.push(`${cleaned};`);
    }
  }
  return statements;
}

/**
 * Turn a drizzle DDL statement into a re-runnable one.
 *
 * Why: a database created with `drizzle-kit push` (or an earlier version of the
 * app) has the tables but no `__migrations` row, and a baselined migration may
 * still be executed once on a partially-created schema. PostgreSQL has no
 * `CREATE TYPE IF NOT EXISTS` and no `ADD CONSTRAINT IF NOT EXISTS`, so those
 * get wrapped in DO blocks; everything else gets `IF NOT EXISTS`.
 */
export function makeIdempotent(statement: string): string {
  const stmt = statement.trim();

  // CREATE TYPE "public"."role" AS ENUM('a','b');  → guarded DO block
  const enumMatch = /^CREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?(\w+)"?\s+AS\s+ENUM\s*\(([\s\S]*)\)\s*;?$/i.exec(
    stmt,
  );
  if (enumMatch) {
    const typeName = enumMatch[1];
    // the captured value list already carries its own single quotes
    const values = enumMatch[2].trim();
    return `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}') THEN CREATE TYPE "${typeName}" AS ENUM (${values}); END IF; END $$;`;
  }

  // ALTER TABLE "x" ADD CONSTRAINT "y" FOREIGN KEY … → guarded DO block
  const fkMatch = /^ALTER\s+TABLE\s+("?\w+"?)\s+ADD\s+CONSTRAINT\s+"?(\w+)"?\s+([\s\S]+?);?$/i.exec(
    stmt,
  );
  if (fkMatch) {
    const [, table, constraint, rest] = fkMatch;
    return `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN ALTER TABLE ${table} ADD CONSTRAINT "${constraint}" ${rest.trim()}; END IF; END $$;`;
  }

  return stmt
    .replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY)/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/^CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY)/i, "CREATE INDEX IF NOT EXISTS ");
}

/**
 * Detect a database that already has the app schema but no migration history
 * (typical after `drizzle-kit push`). Those migrations are "baselined" —
 * recorded as applied without being executed again.
 */
const SCHEMA_MARKER_TABLES = ["offices", "users", "mess_months", "daily_meals", "members"];

async function looksAlreadyMigrated(existing: Set<string>): Promise<boolean> {
  return SCHEMA_MARKER_TABLES.every((t) => existing.has(t));
}

async function ensureMigrationsTable(): Promise<void> {
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS "__migrations" (
      "id" serial PRIMARY KEY,
      "tag" text NOT NULL UNIQUE,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )`),
  );
}

async function appliedTags(): Promise<Set<string>> {
  const rows = await db.execute(sql.raw(`SELECT tag FROM "__migrations"`));
  const list = (rows as unknown as { rows?: Array<{ tag: string }> })?.rows ?? [];
  return new Set(list.map((r) => String(r.tag)));
}

async function listTables(): Promise<string[]> {
  const rows = await db.execute(
    sql.raw(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    ),
  );
  const list = (rows as unknown as { rows?: Array<{ table_name: string }> })?.rows ?? [];
  return list.map((r) => String(r.table_name));
}

async function countOf(table: string): Promise<number> {
  try {
    const rows = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`));
    const list = (rows as unknown as { rows?: Array<{ n: number }> })?.rows ?? [];
    return Number(list[0]?.n ?? 0);
  } catch {
    return 0; // table does not exist yet
  }
}

/** Apply every pending migration. Idempotent; returns a full report. */
export async function runMigrations(): Promise<MigrationResult> {
  const started = Date.now();
  const stats = poolStats();
  const result: MigrationResult = {
    ok: true,
    driver: stats.driver,
    applied: [],
    skipped: [],
    baselined: [],
    failed: null,
    tables: [],
    counts: { offices: 0, users: 0, months: 0 },
    latencyMs: 0,
    message: "",
  };

  const journal = readJournal();
  if (!journal.length) {
    result.ok = false;
    result.message =
      "drizzle/meta/_journal.json পাওয়া যায়নি — বিল্ডে drizzle/ ফোল্ডারটি অন্তর্ভুক্ত আছে কিনা দেখুন।";
    result.latencyMs = Date.now() - started;
    return result;
  }

  try {
    await ensureMigrationsTable();
    const done = await appliedTags();
    const existingTables = new Set(await listTables());

    // baselining: schema is there but history is empty → record it as applied
    if (!done.size && (await looksAlreadyMigrated(existingTables))) {
      for (const entry of journal) {
        await db.execute(
          sql`INSERT INTO "__migrations" (tag) VALUES (${entry.tag}) ON CONFLICT (tag) DO NOTHING`,
        );
        done.add(entry.tag);
        result.baselined.push(entry.tag);
      }
      result.message = "";
    }

    for (const entry of journal) {
      if (done.has(entry.tag)) {
        result.skipped.push(entry.tag);
        continue;
      }

      const file = path.join(process.cwd(), "drizzle", `${entry.tag}.sql`);
      if (!fs.existsSync(file)) {
        result.failed = { tag: entry.tag, error: `${entry.tag}.sql ফাইল পাওয়া যায়নি` };
        result.ok = false;
        break;
      }

      const statements = splitStatements(fs.readFileSync(file, "utf8")).map(makeIdempotent);
      try {
        // one transaction per migration file → all-or-nothing
        await db.transaction(async (tx) => {
          const runner = tx as unknown as typeof db;
          for (const stmt of statements) {
            await runner.execute(sql.raw(stmt));
          }
          await runner.execute(
            sql`INSERT INTO "__migrations" (tag) VALUES (${entry.tag}) ON CONFLICT (tag) DO NOTHING`,
          );
        });
        result.applied.push(entry.tag);
      } catch (err) {
        result.failed = {
          tag: entry.tag,
          error: err instanceof Error ? err.message : String(err),
        };
        result.ok = false;
        break;
      }
    }

    result.tables = await listTables();
    result.counts = {
      offices: await countOf("offices"),
      users: await countOf("users"),
      months: await countOf("mess_months"),
    };
    if (!result.ok) {
      result.message =
        `মাইগ্রেশন ব্যর্থ: ${result.failed?.tag} — ${result.failed?.error}` +
        " | অসম্পূর্ণ/বেমানান স্কিমা থাকলে ট্রান্সজেকশন রোলব্যাক হয়েছে (ডেটা নিরাপদ)। " +
        "সমাধান: সম্পূর্ণ খালি ডেটাবেস ব্যবহার করুন, অথবা পুরনো স্কিমা মুছে (npm run db:reset) আবার চালান।";
    } else if (result.applied.length) {
      result.message = `${result.applied.length}টি মাইগ্রেশন প্রয়োগ হয়েছে (${result.applied.join(", ")})`;
    } else if (result.baselined.length) {
      result.message = `ডেটাবেসে স্কিমা আগেই তৈরি ছিল (drizzle-kit push) — ${result.baselined.join(", ")} বেসলাইন হিসেবে রেকর্ড করা হয়েছে`;
    } else {
      result.message = "সব মাইগ্রেশন আগেই প্রয়োগ করা আছে — স্কিমা সর্বশেষ অবস্থায় আছে";
    }
  } catch (err) {
    result.ok = false;
    result.message =
      err instanceof Error ? `ডেটাবেসে সংযোগ করা যায়নি: ${err.message}` : "অজানা ত্রুটি";
  }

  result.latencyMs = Date.now() - started;
  return result;
}

/** Lightweight schema/status probe — used by /api/setup/status. */
export async function setupStatus(): Promise<{
  migrated: boolean;
  tables: string[];
  missing: string[];
  counts: { offices: number; users: number; months: number };
  driver: string;
  databaseOk: boolean;
  error?: string;
}> {
  const required = [
    "offices",
    "users",
    "sessions",
    "mess_months",
    "members",
    "daily_meals",
    "bazar_expenses",
    "deposits",
    "other_incomes",
    "extra_expenses",
    "sync_logs",
    "audit_logs",
    "settings",
  ];
  const stats = poolStats();
  try {
    const tables = await listTables();
    const missing = required.filter((t) => !tables.includes(t));
    return {
      migrated: missing.length === 0,
      tables,
      missing,
      counts: {
        offices: await countOf("offices"),
        users: await countOf("users"),
        months: await countOf("mess_months"),
      },
      driver: stats.driver,
      databaseOk: true,
    };
  } catch (err) {
    return {
      migrated: false,
      tables: [],
      missing: required,
      counts: { offices: 0, users: 0, months: 0 },
      driver: stats.driver,
      databaseOk: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
