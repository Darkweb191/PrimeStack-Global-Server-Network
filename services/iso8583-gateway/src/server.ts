import { Pool }            from "pg";
import { startServer }    from "../../shared/src/http-server.js";
import { ConnectionPool } from "./network/connection-manager.js";
import { buildRoutes }    from "./api/routes.js";

const PORT = parseInt(process.env.PORT ?? "4013", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_iso8583",
  user:     process.env.PGUSER     ?? "iso8583_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      parseInt(process.env.PG_POOL_MAX ?? "20", 10),
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[iso8583-db] pool error:", err.message));

// ── Connection Pool ──────────────────────────────────────────
// Loads all active hosts from DB and opens connection pools.
// Skips connection if SKIP_CONNECTIONS=true (for dev/test mode)

const connPool = new ConnectionPool(pool);

if (process.env.SKIP_CONNECTIONS !== "true") {
  connPool.loadHosts().then(() => {
    console.log("[iso8583-gw] Connection pools initialized");
  }).catch(err => {
    console.error("[iso8583-gw] Failed to load hosts:", err.message);
  });
} else {
  console.log("[iso8583-gw] SKIP_CONNECTIONS=true — running in parser-only mode");
}

// ── HTTP Server ──────────────────────────────────────────────

const routes = buildRoutes(pool, connPool);

startServer(routes, PORT, "iso8583-gateway", async () => {
  connPool.disconnectAll();
  await pool.end();
});
