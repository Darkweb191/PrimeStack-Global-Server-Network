import { Pool }            from "pg";
import { createClient }   from "redis";
import { startServer }    from "../../shared/src/http-server.js";
import { buildRoutes }    from "./api/routes.js";

const PORT = parseInt(process.env.PORT ?? "4006", 10);

// PostgreSQL — risk decisions, blacklist, profiles, AML cases
const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_risk",
  user:     process.env.PGUSER     ?? "risk_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      parseInt(process.env.PG_POOL_MAX ?? "20", 10),
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});
pool.on("error", (err) => console.error("[risk-db] pool error:", err.message));

// Redis — velocity counters (primary, sub-millisecond)
const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
await redis.connect();
redis.on("error", (err) => console.error("[risk-redis] error:", err.message));

const routes = buildRoutes(pool, redis as never);

startServer(routes, PORT, "risk-service", async () => {
  await pool.end();
  await redis.quit();
});
