import { Pool }         from "pg";
import { startServer }  from "../../shared/src/http-server.js";
import { buildRoutes }  from "./api/routes.js";
import { runHealthCheck } from "./domain/routing.js";

const PORT = parseInt(process.env.PORT ?? "4012", 10);
const HEALTH_CHECK_INTERVAL_MS = parseInt(process.env.HEALTH_CHECK_INTERVAL ?? "30000", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_routing",
  user:     process.env.PGUSER     ?? "routing_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      20,
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[routing-db] pool error:", err.message));

// ── Health Check Worker ──────────────────────────────────────
// Runs every 30s — pings each active route connection and updates
// route_health table. This drives the failover logic.

let healthWorker: ReturnType<typeof setInterval>;

async function runAllHealthChecks(): Promise<void> {
  try {
    const routes = await pool.query<{ id: string; route_name: string }>(
      "SELECT id, route_name FROM routes WHERE active = TRUE",
    );

    for (const route of routes.rows) {
      try {
        const result = await runHealthCheck(pool, route.id);
        if (result.status !== "ONLINE") {
          console.warn(
            `[routing-health] ${route.route_name} → ${result.status} (${result.responseMs}ms)`,
          );
        }
      } catch (err) {
        console.error(`[routing-health] check failed for ${route.route_name}:`, err);
      }
    }
  } catch (err) {
    console.error("[routing-health] worker error:", err);
  }
}

// Run initial health check then start the interval
runAllHealthChecks().catch(console.error);
healthWorker = setInterval(runAllHealthChecks, HEALTH_CHECK_INTERVAL_MS);

// ── HTTP Server ──────────────────────────────────────────────

const routes = buildRoutes(pool);

startServer(routes, PORT, "routing-service", async () => {
  clearInterval(healthWorker);
  await pool.end();
});
