import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "@/lib/db/types";

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
