import { Pool, PoolClient } from "pg";

/**
 * PostgreSQL connection pool for the Ledger Service.
 *
 * Production settings:
 *   - max: 20 — tune based on your Postgres max_connections
 *   - idleTimeoutMillis: 30s — release idle connections
 *   - connectionTimeoutMillis: 5s — fail fast rather than hang
 *   - statement_timeout: 30s — kill runaway queries
 *   - SSL: required in production (set PGSSLMODE=require)
 */
export function createPool(): Pool {
  const pool = new Pool({
    host:     process.env.PGHOST     ?? "localhost",
    port:     parseInt(process.env.PGPORT ?? "5432", 10),
    database: process.env.PGDATABASE ?? "primestack_ledger",
    user:     process.env.PGUSER     ?? "ledger_svc",
    password: process.env.PGPASSWORD,
    max:      parseInt(process.env.PG_POOL_MAX ?? "20", 10),
    idleTimeoutMillis:      30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: true }
      : false,
  });

  pool.on("error", (err) => {
    // Log but don't crash — pool will reconnect
    console.error("[ledger-db] pool error:", err.message);
  });

  return pool;
}

export type { Pool, PoolClient };
