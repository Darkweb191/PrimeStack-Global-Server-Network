import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * Health Proxy Routes
 *
 * The dashboard runs in the browser and can't directly call
 * services on different ports due to browser CORS restrictions.
 *
 * These routes run on the monolith (:8081) and proxy health
 * checks to all microservices, returning a single JSON response
 * the dashboard can use.
 *
 * Also proxies data requests so the dashboard can display
 * real live data instead of hardcoded values.
 */

const SERVICES: Array<{ name: string; port: number; key: string }> = [
  { name: "Ledger Service",      port: 4001, key: "ledger"       },
  { name: "IP Whitelist",        port: 4002, key: "ipWhitelist"  },
  { name: "Auth Service",        port: 4003, key: "auth"         },
  { name: "Terminal Service",    port: 4004, key: "terminal"     },
  { name: "Transfer Service",    port: 4005, key: "transfer"     },
  { name: "Risk Engine",         port: 4006, key: "risk"         },
  { name: "Audit Service",       port: 4007, key: "audit"        },
  { name: "Settlement Engine",   port: 4008, key: "settlement"   },
  { name: "Notification Service",port: 4009, key: "notification" },
  { name: "Switch Core",         port: 4010, key: "switchCore"   },
  { name: "Security Service",    port: 4011, key: "security"     },
  { name: "Routing Engine",      port: 4012, key: "routing"      },
  { name: "ISO 8583 Gateway",    port: 4013, key: "iso8583"      },
  { name: "API Gateway",         port: 8080, key: "gateway"      },
];

async function checkService(port: number): Promise<{ online: boolean; responseMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return { online: res.ok, responseMs: Date.now() - start };
  } catch {
    return { online: false, responseMs: Date.now() - start };
  }
}

export function registerHealthProxy(app: FastifyInstance): void {

  // ── GET /admin/health-all ─────────────────────────────────
  // Returns health status of all 14 microservices.
  // Called by the dashboard every 5 seconds.
  app.get("/admin/health-all", {
    config: { ipWhitelist: false },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const results = await Promise.all(
      SERVICES.map(async (svc) => {
        const { online, responseMs } = await checkService(svc.port);
        return {
          name:      svc.name,
          port:      svc.port,
          key:       svc.key,
          status:    online ? "ONLINE" : "OFFLINE",
          responseMs,
        };
      }),
    );

    const onlineCount  = results.filter((r) => r.status === "ONLINE").length;
    const offlineCount = results.filter((r) => r.status === "OFFLINE").length;

    reply.header("Cache-Control", "no-store");
    return reply.send({
      success: true,
      data: {
        services:     results,
        summary: {
          total:    results.length,
          online:   onlineCount,
          offline:  offlineCount,
          checkedAt: new Date().toISOString(),
        },
      },
    });
  });

  // ── GET /admin/live-data ──────────────────────────────────
  // Fetches real live data from all services and returns it
  // in a single response the dashboard can use to show real numbers.
  app.get("/admin/live-data", {
    config: { ipWhitelist: false },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {

    // Fetch all live data in parallel, silently ignore failures
    const [
      riskDashboard,
      settlementEod,
      terminalFleet,
      routingDashboard,
      iso8583Dashboard,
    ] = await Promise.all([
      fetchJson("http://localhost:4006/risk/dashboard").catch(() => null),
      fetchJson("http://localhost:4008/eod/summary").catch(() => null),
      fetchJson("http://localhost:4004/fleet/overview").catch(() => null),
      fetchJson("http://localhost:4012/dashboard").catch(() => null),
      fetchJson("http://localhost:4013/dashboard").catch(() => null),
    ]);

    reply.header("Cache-Control", "no-store");
    return reply.send({
      success: true,
      data: {
        risk:        riskDashboard,
        settlement:  settlementEod,
        terminals:   terminalFleet,
        routing:     routingDashboard,
        iso8583:     iso8583Dashboard,
        fetchedAt:   new Date().toISOString(),
      },
    });
  });

  // ── GET /admin/service-data/:service ─────────────────────
  // Proxy a specific service endpoint through the monolith.
  // Example: /admin/service-data/risk/blacklist
  //   → proxies to http://localhost:4006/risk/blacklist
  app.get("/admin/service-data/*", {
    config: { ipWhitelist: false },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const urlParts = (request.url).replace("/admin/service-data/", "");
    const [serviceKey, ...pathParts] = urlParts.split("/");
    const svc = SERVICES.find(s => s.key === serviceKey || s.port.toString() === serviceKey);

    if (!svc) {
      return reply.status(404).send({ success: false, error: "Unknown service" });
    }

    const targetPath = pathParts.length > 0 ? "/" + pathParts.join("/") : "/health";
    const data = await fetchJson(`http://localhost:${svc.port}${targetPath}`).catch((err) => ({
      error: err instanceof Error ? err.message : "Service unavailable",
    }));

    reply.header("Cache-Control", "no-store");
    return reply.send({ success: true, data, service: svc.name, port: svc.port });
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { success?: boolean; data?: unknown };
  return data.data ?? data;
}
