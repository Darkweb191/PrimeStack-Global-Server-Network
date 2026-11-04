import { Pool }             from "pg";
import { startServer, send } from "../../shared/src/http-server.js";
import * as Notification     from "./domain/notification.js";

const PORT = parseInt(process.env.PORT ?? "4009", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_notification",
  user:     process.env.PGUSER     ?? "notification_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      20,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis:  5_000,
});

pool.on("error", (err) => console.error("[notification-db] pool error:", err.message));

// ── Delivery Worker ──────────────────────────────────────────
// Process pending notifications every 5 seconds
const workerInterval = setInterval(async () => {
  try {
    const count = await Notification.processDeliveryBatch(pool);
    if (count > 0) console.log(`[notification-worker] delivered ${count} notifications`);
  } catch (err) {
    console.error("[notification-worker] error:", err);
  }
}, 5_000);

// ── HTTP Routes ──────────────────────────────────────────────
const routes = [
  {
    method: "GET", pattern: "/health",
    handler: async (_r: unknown, res: Parameters<typeof send>[0]) =>
      send(res, 200, { success: true, data: { status: "ok", service: "notification-service" } }),
  },
  {
    // POST /notifications — queue a notification
    method: "POST", pattern: "/notifications",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as Parameters<typeof Notification.queue>[1];
        if (!b?.templateCode || !b?.channel || !b?.recipient)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "templateCode, channel, recipient required" } });
        const result = await Notification.queue(pool, b);
        send(res, 201, { success: true, data: result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof Notification.NotificationError ? err.code : "INTERNAL_ERROR";
        send(res, 500, { success: false, error: { code, message: msg } });
      }
    },
  },
  {
    // POST /events — dispatch a webhook event
    method: "POST", pattern: "/events",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as { event: string; payload: Record<string, unknown>; merchantId?: string };
        if (!b?.event || !b?.payload)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "event and payload required" } });
        const result = await Notification.dispatchWebhookEvent(pool, b.event, b.payload, b.merchantId);
        send(res, 200, { success: true, data: result });
      } catch (err) {
        send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } });
      }
    },
  },
  {
    // GET /notifications — list with filters
    method: "GET", pattern: "/notifications",
    handler: async (req: { url?: string }, res: Parameters<typeof send>[0]) => {
      try {
        const qs = new URL(`http://x${req.url ?? "/"}`).searchParams;
        const result = await Notification.listNotifications(pool, {
          merchantId: qs.get("merchantId") ?? undefined,
          status:     qs.get("status")     ?? undefined,
          channel:    qs.get("channel")    ?? undefined,
          entityId:   qs.get("entityId")   ?? undefined,
          page:       parseInt(qs.get("page")     ?? "1",  10),
          pageSize:   parseInt(qs.get("pageSize") ?? "20", 10),
        });
        send(res, 200, { success: true, data: result.data, meta: { total: result.total } });
      } catch (err) {
        send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } });
      }
    },
  },
  {
    // POST /webhooks — register a webhook endpoint
    method: "POST", pattern: "/webhooks",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as Parameters<typeof Notification.registerWebhook>[1];
        if (!b?.merchantId || !b?.url || !b?.secret || !b?.events?.length)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "merchantId, url, secret, events required" } });
        const result = await Notification.registerWebhook(pool, b);
        send(res, 201, { success: true, data: result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof Notification.NotificationError ? err.code : "INTERNAL_ERROR";
        send(res, 400, { success: false, error: { code, message: msg } });
      }
    },
  },
];

startServer(routes as never, PORT, "notification-service", async () => {
  clearInterval(workerInterval);
  await pool.end();
});
