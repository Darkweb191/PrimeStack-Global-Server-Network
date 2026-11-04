import { Pool }         from "pg";
import { startServer }  from "../../shared/src/http-server.js";
import { buildRoutes }  from "./api/routes.js";
import { buildTmsRoutes } from "./api/tms-routes.js";

const PORT = parseInt(process.env.PORT ?? "4004", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_terminal",
  user:     process.env.PGUSER     ?? "terminal_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      20,
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[terminal-db] pool error:", err.message));

// Merge base terminal routes + TMS routes
const baseRoutes = buildRoutes(pool);
const tmsRoutes  = buildTmsRoutes(pool);
const allRoutes  = [...baseRoutes, ...tmsRoutes];

startServer(allRoutes, PORT, "terminal-service", () => pool.end());
