import { Pool } from "pg";

/**
 * Audit Service Domain
 *
 * INSERT-ONLY. This service never updates or deletes records.
 * Every platform action that has compliance or forensic value
 * is recorded here.
 *
 * Event types (not exhaustive):
 *   TRANSFER_INITIATED      TRANSFER_COMPLETED    TRANSFER_FAILED
 *   TRANSFER_REVERSED       TRANSFER_RISK_HOLD
 *   TERMINAL_REGISTERED     TERMINAL_ACTIVATED    TERMINAL_DECOMMISSIONED
 *   LEDGER_ENTRY_POSTED     LEDGER_ENTRY_REVERSED
 *   AUTH_SUCCESS            AUTH_FAILURE
 *   IP_BLOCKED              IP_WHITELISTED
 *   ADMIN_USER_CREATED      ADMIN_USER_LOGIN      ADMIN_ROLE_CHANGED
 *   SETTLEMENT_BATCH_OPENED SETTLEMENT_COMPLETED
 *   CHARGEBACK_FILED        CHARGEBACK_RESOLVED
 *   SAR_FILED
 */

export type AuditSeverity = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface AuditEventInput {
  actorType:    string;
  actorId?:     string;
  actorIp?:     string;
  eventType:    string;
  severity?:    AuditSeverity;
  resourceType?: string;
  resourceId?:  string;
  description:  string;
  beforeState?: Record<string, unknown>;
  afterState?:  Record<string, unknown>;
  metadata?:    Record<string, unknown>;
  occurredAt?:  Date;
}

/**
 * Record an audit event.
 * Fire-and-forget in most contexts — the caller should not
 * wait for audit logging to complete in the hot path.
 */
export async function record(
  pool:  Pool,
  event: AuditEventInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_events
       (actor_type, actor_id, actor_ip, event_type, severity,
        resource_type, resource_id, description,
        before_state, after_state, metadata, occurred_at)
     VALUES ($1,$2,$3::inet,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      event.actorType,
      event.actorId    ?? null,
      event.actorIp    ?? null,
      event.eventType,
      event.severity   ?? "INFO",
      event.resourceType ?? null,
      event.resourceId ?? null,
      event.description,
      event.beforeState ? JSON.stringify(event.beforeState) : null,
      event.afterState  ? JSON.stringify(event.afterState)  : null,
      event.metadata    ? JSON.stringify(event.metadata)    : null,
      event.occurredAt  ?? new Date(),
    ],
  );
}

/**
 * Query audit events with filtering.
 * Used by the compliance dashboard and incident response.
 */
export async function query(
  pool: Pool,
  filters: {
    actorId?:     string;
    eventType?:   string;
    resourceType?: string;
    resourceId?:  string;
    severity?:    AuditSeverity;
    from?:        Date;
    to?:          Date;
    page:         number;
    pageSize:     number;
  },
) {
  const conditions: string[] = [];
  const params:     unknown[] = [];

  if (filters.actorId) {
    params.push(filters.actorId); conditions.push(`actor_id = $${params.length}`);
  }
  if (filters.eventType) {
    params.push(filters.eventType); conditions.push(`event_type = $${params.length}`);
  }
  if (filters.resourceType) {
    params.push(filters.resourceType); conditions.push(`resource_type = $${params.length}`);
  }
  if (filters.resourceId) {
    params.push(filters.resourceId); conditions.push(`resource_id = $${params.length}`);
  }
  if (filters.severity) {
    params.push(filters.severity); conditions.push(`severity = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from); conditions.push(`occurred_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to); conditions.push(`occurred_at <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT * FROM audit_events ${where}
       ORDER BY occurred_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.pageSize, offset],
    ),
    pool.query(`SELECT COUNT(*) FROM audit_events ${where}`, params),
  ]);

  return {
    data:  rows.rows,
    total: parseInt(count.rows[0].count, 10),
    page:  filters.page,
    pageSize: filters.pageSize,
  };
}

/**
 * Get recent critical/error events (for monitoring dashboard).
 */
export async function getAlerts(pool: Pool, limit = 50) {
  return pool.query(
    `SELECT * FROM audit_events
     WHERE severity IN ('WARN','ERROR','CRITICAL')
       AND occurred_at > NOW() - INTERVAL '24 hours'
     ORDER BY occurred_at DESC
     LIMIT $1`,
    [limit],
  );
}
