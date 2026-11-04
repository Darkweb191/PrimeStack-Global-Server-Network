import { Pool }         from "pg";
import { startServer }  from "../../shared/src/http-server.js";
import { buildRoutes }  from "./api/routes.js";

const PORT = parseInt(process.env.PORT ?? "4008", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_settlement",
  user:     process.env.PGUSER     ?? "settlement_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      20,
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[settlement-db] pool error:", err.message));

startServer(buildRoutes(pool), PORT, "settlement-service", () => pool.end());
