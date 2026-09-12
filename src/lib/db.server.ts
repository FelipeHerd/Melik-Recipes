import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "@/lib/db/types";

// pg's default DATE (oid 1082) parser builds a Date anchored to the server's
// LOCAL timezone, which can silently shift the calendar day by +/-1 depending
// on the host's TZ (verified: inserting "2026-09-12" came back as
// "2026-09-11T23:00:00.000Z" on a UTC+1 host). The only DATE column in this
// schema (profiles.voice_usage_date) is compared as a plain "YYYY-MM-DD"
// string against businessToday() (voice.server.ts), so disable parsing and
// keep the raw string pg received from Postgres — this also matches what
// Supabase/PostgREST used to send over the wire.
pg.types.setTypeParser(1082, (value: string) => value);

// Single Postgres connection pool for the whole app. There is no more
// "browser client" vs "service-role client" split from the Supabase days —
// every DB access now happens server-side, and authorization is enforced by
// src/lib/auth/authorize.server.ts rather than by which client you picked.
declare global {
  // eslint-disable-next-line no-var
  var __melikDb: Kysely<Database> | undefined;
}

function createDb(): Kysely<Database> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new pg.Pool({ connectionString });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

// Guard against creating a new pool on every Vite/Nitro dev-mode HMR reload.
export const db: Kysely<Database> = globalThis.__melikDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__melikDb = db;
}

// node-postgres does NOT auto-serialize JS objects/arrays for jsonb columns
// (a plain array is instead bound as a Postgres ARRAY literal and fails with
// "invalid input syntax for type json") — always JSON.stringify a value
// before writing it to a jsonb column (ingredients_json, instructions_json,
// messages, metadata). Reads come back already parsed, no toJsonb needed.
export function toJsonb(value: unknown): string {
  return JSON.stringify(value);
}

// node-postgres returns timestamptz/date columns as JS Date objects, but
// the client-side code across this app expects the ISO-string wire format
// Supabase/PostgREST used to send — convert at each server function's
// return boundary with this helper.
export function isoOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}
