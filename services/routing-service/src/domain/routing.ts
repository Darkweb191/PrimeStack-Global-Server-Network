import { Pool }    from "pg";
import { Decimal } from "decimal.js";

/**
 * Routing Engine — Production Switch Brain
 *
 * Determines WHERE a transaction goes after authentication and risk.
 * This is what turns a collection of services into a payment network.
 *
 * Decision algorithm (first match wins, in priority order):
 *
 *   1. Terminal-specific route  (terminal_routes table)
 *   2. Merchant-specific route  (merchant_routes table)
 *   3. Routing rules            (rules evaluated by priority ASC)
 *   4. No match → outcome: NO_ROUTE → decline with ISO code 92
 *
 * Failover chain:
 *   If the primary route's health is OFFLINE or DEGRADED,
 *   the engine walks the failover_id chain automatically.
 *   Each failover attempt is logged.
 *
 * Routing rule matching:
 *   A rule matches when ALL non-NULL criteria match the transaction.
 *   Rules ordered by priority ASC — lower number = higher priority.
 *   Time window enforced using server-local time (set TZ correctly).
 *
 * Performance:
 *   The routing decision must complete in < 10ms.
 *   All active rules are loaded in a single indexed query.
 *   No N+1 queries in the hot path.
 */

export class RoutingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RoutingError";
  }
}

export interface RouteInput {
  txRef:        string;
  txType:       string;   // T2T, WALLET, MERCHANT, PROCESSOR, SETTLEMENT
  amount:       string;
  currency:     string;
  merchantId?:  string;
  terminalId?:  string;
  cardBin?:     string;
  cardNetwork?: string;   // VISA, MASTERCARD, AMEX, UNIONPAY
  countryCode?: string;
}

export interface RouteDecision {
  routeId:       string;
  routeName:     string;
  routeType:     string;
  destination:   string;
  connectionId:  string | null;
  protocol:      string | null;
  host:          string | null;
  port:          number | null;
  timeoutMs:     number;
  retries:       number;
  useTls:        boolean;
  failoverId:    string | null;
  matchReason:   string;
  ruleId?:       string;
  queueName?:    string;   // RabbitMQ queue name if applicable
}

type RoutingRule = Record<string, unknown> & { id: string; route_id: string };

// ── Main routing function ─────────────────────────────────────

/**
 * Determine the route for a transaction.
 * Returns null if no route found (caller should decline with code 92).
 */
export async function resolveRoute(
  pool:  Pool,
  input: RouteInput,
): Promise<RouteDecision | null> {

  const startTime = Date.now();
  const amount    = new Decimal(input.amount);

  // ── 1. Terminal-specific route ────────────────────────────
  if (input.terminalId) {
    const route = await getTerminalRoute(pool, input.terminalId);
    if (route) {
      await logDecision(pool, input, route, "TERMINAL_SPECIFIC", null, false, 0, Date.now() - startTime, "ROUTED");
      return route;
    }
  }

  // ── 2. Merchant-specific route ────────────────────────────
  if (input.merchantId) {
    const route = await getMerchantRoute(pool, input.merchantId);
    if (route) {
      await logDecision(pool, input, route, "MERCHANT_SPECIFIC", null, false, 0, Date.now() - startTime, "ROUTED");
      return route;
    }
  }

  // ── 3. Rules-based routing ────────────────────────────────
  const rules = await loadActiveRules(pool);
  const now   = new Date();
  const nowTime = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}:00`;

  for (const rule of rules) {
    if (!ruleMatches(rule, input, amount, nowTime)) continue;

    // Load the route
    const route = await getRouteById(pool, rule.route_id);
    if (!route) continue;

    // Check health — if unhealthy, try failover
    const finalRoute = await resolveWithFailover(pool, route);
    if (!finalRoute) continue;

    const usedFailover = finalRoute.routeId !== route.routeId;
    await logDecision(pool, input, finalRoute, "RULE", rule.id, usedFailover, usedFailover ? 1 : 0, Date.now() - startTime, "ROUTED");
    return finalRoute;
  }

  // ── 4. No route found ─────────────────────────────────────
  await logDecision(pool, input, null, "NONE", null, false, 0, Date.now() - startTime, "NO_ROUTE");
  return null;
}

/**
 * Resolve failover chain for a route.
 * Walks route.failover_id until a healthy route is found or chain is exhausted.
 * Max 3 levels of failover.
 */
export async function resolveWithFailover(
  pool:    Pool,
  route:   RouteDecision,
  maxHops = 3,
): Promise<RouteDecision | null> {

  let current: RouteDecision | null = route;
  let hop = 0;

  while (current && hop <= maxHops) {
    const health = await getRouteHealth(pool, current.routeId);

    // ONLINE or UNKNOWN → use this route
    if (!health || health === "ONLINE" || health === "UNKNOWN") {
      return current;
    }

    // OFFLINE or DEGRADED → try failover
    if (!current.failoverId) return null;

    current = await getRouteById(pool, current.failoverId);
    hop++;
  }

  return null;
}

// ── Route / Connection CRUD ──────────────────────────────────

export async function createConnection(pool: Pool, input: {
  connectionName: string;
  protocol:       string;
  host:           string;
  port:           number;
  timeoutMs?:     number;
  retries?:       number;
  useTls?:        boolean;
  poolSize?:      number;
  description?:   string;
  metadata?:      Record<string, unknown>;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO connections
       (connection_name, protocol, host, port, timeout_ms, retries, use_tls, pool_size, description, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      input.connectionName, input.protocol, input.host, input.port,
      input.timeoutMs ?? 10000, input.retries ?? 1, input.useTls ?? true,
      input.poolSize ?? 5, input.description ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
  return { id: result.rows[0].id };
}

export async function createRoute(pool: Pool, input: {
  routeName:    string;
  routeType:    string;
  connectionId?: string;
  priority?:    number;
  failoverId?:  string;
  destination:  string;
  network?:     string;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO routes (route_name, route_type, connection_id, priority, failover_id, destination, network)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      input.routeName, input.routeType, input.connectionId ?? null,
      input.priority ?? 100, input.failoverId ?? null, input.destination, input.network ?? null,
    ],
  );

  // Create health record
  await pool.query(
    "INSERT INTO route_health (route_id, status) VALUES ($1, 'UNKNOWN')",
    [result.rows[0].id],
  );

  return { id: result.rows[0].id };
}

export async function createRule(pool: Pool, input: {
  ruleName:     string;
  routeId:      string;
  priority?:    number;
  txType?:      string;
  currency?:    string;
  cardBin?:     string;
  cardNetwork?: string;
  countryCode?: string;
  merchantId?:  string;
  minAmount?:   string;
  maxAmount?:   string;
  activeFrom?:  string;
  activeTo?:    string;
  description?: string;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO routing_rules
       (rule_name, route_id, priority, tx_type, currency, card_bin,
        card_network, country_code, merchant_id, min_amount, max_amount,
        active_from, active_to, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      input.ruleName, input.routeId, input.priority ?? 100,
      input.txType ?? null, input.currency ?? null, input.cardBin ?? null,
      input.cardNetwork ?? null, input.countryCode ?? null, input.merchantId ?? null,
      input.minAmount ?? null, input.maxAmount ?? null,
      input.activeFrom ?? null, input.activeTo ?? null, input.description ?? null,
    ],
  );
  return { id: result.rows[0].id };
}

export async function assignMerchantRoute(pool: Pool, merchantId: string, routeId: string, priority = 1): Promise<void> {
  await pool.query(
    `INSERT INTO merchant_routes (merchant_id, route_id, priority)
     VALUES ($1,$2,$3)
     ON CONFLICT (merchant_id, route_id) DO UPDATE SET priority = EXCLUDED.priority, is_active = TRUE`,
    [merchantId, routeId, priority],
  );
}

export async function assignTerminalRoute(pool: Pool, terminalId: string, routeId: string, priority = 1): Promise<void> {
  await pool.query(
    `INSERT INTO terminal_routes (terminal_id, route_id, priority)
     VALUES ($1,$2,$3)
     ON CONFLICT (terminal_id, route_id) DO UPDATE SET priority = EXCLUDED.priority, is_active = TRUE`,
    [terminalId, routeId, priority],
  );
}

// ── Health management ────────────────────────────────────────

/**
 * Update route health after a transaction attempt.
 * Called by the switch-core after each routing attempt.
 */
export async function recordRouteOutcome(
  pool:        Pool,
  routeId:     string,
  success:     boolean,
  responseMs:  number,
  error?:      string,
): Promise<void> {

  const statusSql = success
    ? `status = CASE WHEN failure_count > 0 THEN 'DEGRADED' ELSE 'ONLINE' END`
    : `status = CASE WHEN failure_count >= 5 THEN 'OFFLINE' ELSE 'DEGRADED' END`;

  await pool.query(
    `UPDATE route_health SET
       ${statusSql},
       response_ms     = $1,
       success_count   = success_count + CASE WHEN $2 THEN 1 ELSE 0 END,
       failure_count   = failure_count + CASE WHEN $2 THEN 0 ELSE 1 END,
       last_success_at = CASE WHEN $2 THEN NOW() ELSE last_success_at END,
       last_failure_at = CASE WHEN $2 THEN last_failure_at ELSE NOW() END,
       last_error      = CASE WHEN $2 THEN NULL ELSE $3 END,
       checked_at      = NOW()
     WHERE route_id = $4`,
    [responseMs, success, error ?? null, routeId],
  );

  // Update route stats
  await pool.query(
    `UPDATE routes SET
       success_rate = (
         SELECT ROUND(100.0 * success_count / NULLIF(success_count + failure_count, 0), 2)
         FROM route_health WHERE route_id = $1
       ),
       avg_response_ms = $2,
       last_used_at    = NOW()
     WHERE id = $1`,
    [routeId, responseMs],
  );

  // Update hourly traffic stats
  const bucket = new Date();
  bucket.setMinutes(0, 0, 0);

  await pool.query(
    `INSERT INTO traffic_stats (route_id, bucket_hour, tx_count, success_count, failure_count)
     VALUES ($1,$2,1,$3,$4)
     ON CONFLICT (route_id, bucket_hour) DO UPDATE SET
       tx_count      = traffic_stats.tx_count + 1,
       success_count = traffic_stats.success_count + EXCLUDED.success_count,
       failure_count = traffic_stats.failure_count + EXCLUDED.failure_count`,
    [routeId, bucket, success ? 1 : 0, success ? 0 : 1],
  );
}

/**
 * Health check worker — called every 30 seconds per route.
 * Pings the connection endpoint and updates route_health.
 */
export async function runHealthCheck(pool: Pool, routeId: string): Promise<{
  routeId: string;
  status:  string;
  responseMs: number;
}> {
  const route = await getRouteById(pool, routeId);
  if (!route) return { routeId, status: "UNKNOWN", responseMs: 0 };

  // Internal routes are always ONLINE
  if (route.protocol === "INTERNAL" || !route.host) {
    await pool.query(
      `UPDATE route_health SET status = 'ONLINE', checked_at = NOW() WHERE route_id = $1`,
      [routeId],
    );
    return { routeId, status: "ONLINE", responseMs: 0 };
  }

  // For real connections: attempt a TCP connect with timeout
  const start = Date.now();
  let status  = "ONLINE";
  let error   = "";

  try {
    // Use Node.js net.createConnection with timeout
    await tcpPing(route.host, route.port ?? 80, 5000);
    status = "ONLINE";
  } catch (err) {
    status = "OFFLINE";
    error  = err instanceof Error ? err.message : String(err);
  }

  const responseMs = Date.now() - start;

  await pool.query(
    `UPDATE route_health
     SET status = $1, response_ms = $2, last_error = $3,
         last_failure_at = CASE WHEN $1 = 'OFFLINE' THEN NOW() ELSE last_failure_at END,
         last_success_at = CASE WHEN $1 = 'ONLINE'  THEN NOW() ELSE last_success_at END,
         checked_at = NOW()
     WHERE route_id = $4`,
    [status, responseMs, error || null, routeId],
  );

  return { routeId, status, responseMs };
}

// ── List operations ──────────────────────────────────────────

export async function listRoutes(pool: Pool, activeOnly = true) {
  const where = activeOnly ? "WHERE r.active = TRUE" : "";
  return pool.query(
    `SELECT r.*, c.protocol, c.host, c.port, c.timeout_ms,
            h.status as health_status, h.response_ms, h.checked_at,
            f.route_name as failover_name
     FROM routes r
     LEFT JOIN connections c ON c.id = r.connection_id
     LEFT JOIN route_health h ON h.route_id = r.id
     LEFT JOIN routes f ON f.id = r.failover_id
     ${where}
     ORDER BY r.priority ASC, r.route_name`,
  );
}

export async function listConnections(pool: Pool) {
  return pool.query("SELECT * FROM connections WHERE active = TRUE ORDER BY connection_name");
}

export async function listRules(pool: Pool, activeOnly = true) {
  const where = activeOnly ? "WHERE rr.is_active = TRUE" : "";
  return pool.query(
    `SELECT rr.*, r.route_name, r.route_type
     FROM routing_rules rr
     JOIN routes r ON r.id = rr.route_id
     ${where}
     ORDER BY rr.priority ASC`,
  );
}

export async function getTrafficStats(pool: Pool, hours = 24) {
  return pool.query(
    `SELECT r.route_name, r.route_type,
            SUM(ts.tx_count)      as total_tx,
            SUM(ts.success_count) as success_tx,
            SUM(ts.failure_count) as failure_tx,
            AVG(ts.avg_response_ms) as avg_response_ms,
            100.0 * SUM(ts.success_count) / NULLIF(SUM(ts.tx_count), 0) as success_rate
     FROM traffic_stats ts
     JOIN routes r ON r.id = ts.route_id
     WHERE ts.bucket_hour >= NOW() - ($1 || ' hours')::INTERVAL
     GROUP BY r.id, r.route_name, r.route_type
     ORDER BY total_tx DESC`,
    [hours],
  );
}

export async function getDashboard(pool: Pool) {
  const [routes, healthSummary, recentDecisions, queueStatus] = await Promise.all([
    listRoutes(pool),
    pool.query<{ status: string; cnt: string }>(
      "SELECT status, COUNT(*) as cnt FROM route_health GROUP BY status",
    ),
    pool.query(
      "SELECT outcome, COUNT(*) as cnt FROM routing_log WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY outcome",
    ),
    pool.query("SELECT * FROM message_queues WHERE is_active = TRUE ORDER BY queue_name"),
  ]);

  const health: Record<string, number> = {};
  for (const row of healthSummary.rows) {
    health[row.status] = parseInt(row.cnt, 10);
  }

  const decisions: Record<string, number> = {};
  for (const row of recentDecisions.rows) {
    decisions[row.outcome] = parseInt(row.cnt, 10);
  }

  return {
    routes:          routes.rows,
    healthSummary:   health,
    recentDecisions: decisions,
    messageQueues:   queueStatus.rows,
  };
}

// ── Private helpers ──────────────────────────────────────────

async function getTerminalRoute(pool: Pool, terminalId: string): Promise<RouteDecision | null> {
  const result = await pool.query(
    `SELECT r.id, r.route_name, r.route_type, r.destination, r.connection_id, r.failover_id,
            c.protocol, c.host, c.port, c.timeout_ms, c.retries, c.use_tls
     FROM terminal_routes tr
     JOIN routes r ON r.id = tr.route_id
     LEFT JOIN connections c ON c.id = r.connection_id
     WHERE tr.terminal_id = $1 AND tr.is_active = TRUE AND r.active = TRUE
     ORDER BY tr.priority ASC
     LIMIT 1`,
    [terminalId],
  );
  return result.rows.length > 0 ? mapToDecision(result.rows[0], "TERMINAL_SPECIFIC") : null;
}

async function getMerchantRoute(pool: Pool, merchantId: string): Promise<RouteDecision | null> {
  const result = await pool.query(
    `SELECT r.id, r.route_name, r.route_type, r.destination, r.connection_id, r.failover_id,
            c.protocol, c.host, c.port, c.timeout_ms, c.retries, c.use_tls
     FROM merchant_routes mr
     JOIN routes r ON r.id = mr.route_id
     LEFT JOIN connections c ON c.id = r.connection_id
     WHERE mr.merchant_id = $1 AND mr.is_active = TRUE AND r.active = TRUE
     ORDER BY mr.priority ASC
     LIMIT 1`,
    [merchantId],
  );
  return result.rows.length > 0 ? mapToDecision(result.rows[0], "MERCHANT_SPECIFIC") : null;
}

async function getRouteById(pool: Pool, routeId: string): Promise<RouteDecision | null> {
  const result = await pool.query(
    `SELECT r.id, r.route_name, r.route_type, r.destination, r.connection_id, r.failover_id,
            c.protocol, c.host, c.port, c.timeout_ms, c.retries, c.use_tls
     FROM routes r
     LEFT JOIN connections c ON c.id = r.connection_id
     WHERE r.id = $1 AND r.active = TRUE`,
    [routeId],
  );
  return result.rows.length > 0 ? mapToDecision(result.rows[0], "RULE") : null;
}

async function loadActiveRules(pool: Pool): Promise<RoutingRule[]> {
  const result = await pool.query<RoutingRule>(
    `SELECT * FROM routing_rules WHERE is_active = TRUE ORDER BY priority ASC`,
  );
  return result.rows;
}

async function getRouteHealth(pool: Pool, routeId: string): Promise<string | null> {
  const result = await pool.query<{ status: string }>(
    "SELECT status FROM route_health WHERE route_id = $1",
    [routeId],
  );
  return result.rows[0]?.status ?? null;
}

function ruleMatches(
  rule:    Record<string, unknown>,
  input:   RouteInput,
  amount:  Decimal,
  nowTime: string,
): boolean {
  if (rule.tx_type      && rule.tx_type      !== input.txType)      return false;
  if (rule.currency     && rule.currency     !== input.currency)     return false;
  if (rule.card_network && rule.card_network !== input.cardNetwork)  return false;
  if (rule.country_code && rule.country_code !== input.countryCode) return false;
  if (rule.merchant_id  && rule.merchant_id  !== input.merchantId)  return false;

  // BIN prefix match
  if (rule.card_bin) {
    if (!input.cardBin || !input.cardBin.startsWith(rule.card_bin as string)) return false;
  }

  // Amount range (inclusive)
  if (rule.min_amount && amount.lt(rule.min_amount as string)) return false;
  if (rule.max_amount && amount.gt(rule.max_amount as string)) return false;

  // Time window
  if (rule.active_from && rule.active_to) {
    const from = rule.active_from as string;
    const to   = rule.active_to   as string;
    if (nowTime < from || nowTime > to) return false;
  }

  return true;
}

function mapToDecision(row: Record<string, unknown>, matchReason: string): RouteDecision {
  return {
    routeId:      row.id      as string,
    routeName:    row.route_name  as string,
    routeType:    row.route_type  as string,
    destination:  row.destination as string,
    connectionId: row.connection_id as string | null,
    protocol:     row.protocol as string | null,
    host:         row.host     as string | null,
    port:         row.port     as number | null,
    timeoutMs:    (row.timeout_ms as number | null) ?? 10000,
    retries:      (row.retries   as number | null) ?? 1,
    useTls:       (row.use_tls   as boolean | null) ?? true,
    failoverId:   row.failover_id as string | null,
    matchReason,
  };
}

async function logDecision(
  pool:          Pool,
  input:         RouteInput,
  route:         RouteDecision | null,
  matchReason:   string,
  ruleId:        string | null,
  failoverUsed:  boolean,
  failoverHops:  number,
  decisionMs:    number,
  outcome:       string,
): Promise<void> {
  await pool.query(
    `INSERT INTO routing_log
       (tx_ref, tx_type, merchant_id, terminal_id,
        route_id, route_name, route_type,
        match_reason, rule_id, failover_used, failover_attempt,
        decision_ms, outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      input.txRef, input.txType, input.merchantId ?? null, input.terminalId ?? null,
      route?.routeId ?? null, route?.routeName ?? null, route?.routeType ?? null,
      matchReason, ruleId, failoverUsed, failoverHops,
      decisionMs, outcome,
    ],
  ).catch(() => { /* non-critical */ });
}

async function tcpPing(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Dynamic import to avoid top-level await
    import("net").then(({ createConnection }) => {
      const socket = createConnection({ host, port });
      const timer  = setTimeout(() => { socket.destroy(); reject(new Error("Connection timeout")); }, timeoutMs);
      socket.on("connect", () => { clearTimeout(timer); socket.destroy(); resolve(); });
      socket.on("error",   (err) => { clearTimeout(timer); reject(err); });
    });
  });
}
