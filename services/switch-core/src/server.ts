import { Pool }         from "pg";
import { startServer }  from "../../shared/src/http-server.js";
import { buildRoutes }  from "./api/routes.js";

const PORT = parseInt(process.env.PORT ?? "4010", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_switch",
  user:     process.env.PGUSER     ?? "switch_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      parseInt(process.env.PG_POOL_MAX ?? "40", 10), // higher pool for hot path
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[switch-db] pool error:", err.message));
startServer(buildRoutes(pool), PORT, "switch-core", () => pool.end());
