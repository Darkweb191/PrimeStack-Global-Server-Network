import { Pool } from "pg";

/**
 * Terminal Management Platform (TMS) Domain
 *
 * Manages a fleet of payment terminals:
 *   - Groups for batch operations (all UAE terminals, all Verifone, etc.)
 *   - Parameter distribution (push config without a site visit)
 *   - Application version management (payment app, loyalty app)
 *   - Key lifecycle tracking (which HSM key, when injected, when rotated)
 *   - Device analytics (per-terminal daily stats)
 *   - Firmware deployments (download, verify, install, rollback)
 *   - Terminal activity log (audit trail for support)
 *
 * This is what replaces manual terminal management in production.
 * Without a TMS, managing 10,000 terminals requires 10,000 site visits.
 */

export class TmsError extends Error {
  constructor(message: string, public code: string, public httpStatus = 422) {
    super(message);
    this.name = "TmsError";
  }
}

// ── Terminal Groups ──────────────────────────────────────────

export async function createGroup(pool: Pool, input: {
  groupName:    string;
  description?: string;
  groupType:   string;
  matchCriteria?: Record<string, unknown>;
  isDynamic?:  boolean;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO terminal_groups (group_name, description, group_type, match_criteria, is_dynamic)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [input.groupName, input.description ?? null, input.groupType,
     input.matchCriteria ? JSON.stringify(input.matchCriteria) : null, input.isDynamic ?? false],
  );
  return { id: result.rows[0].id };
}

export async function addTerminalToGroup(pool: Pool, groupId: string, terminalId: string): Promise<void> {
  await pool.query(
    "INSERT INTO terminal_group_members (group_id, terminal_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [groupId, terminalId],
  );
}

export async function getGroupTerminals(pool: Pool, groupId: string) {
  return pool.query(
    `SELECT t.id, t.tid, t.serial_number, t.model, t.status, t.last_seen_at,
            m.legal_name as merchant_name, m.merchant_code
     FROM terminal_group_members gm
     JOIN terminals t ON t.id = gm.terminal_id
     JOIN merchants m ON m.id = t.merchant_id
     WHERE gm.group_id = $1 ORDER BY t.tid`,
    [groupId],
  );
}

export async function listGroups(pool: Pool) {
  return pool.query(
    `SELECT g.*, COUNT(gm.terminal_id) as member_count
     FROM terminal_groups g
     LEFT JOIN terminal_group_members gm ON gm.group_id = g.id
     WHERE g.active = TRUE
     GROUP BY g.id ORDER BY g.group_name`,
  );
}

// ── Parameter Distribution ───────────────────────────────────

export async function pushParameter(pool: Pool, input: {
  terminalId:  string;
  paramKey:    string;
  paramValue:  string;
  paramType?:  string;
  updatedBy?:  string;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO terminal_parameters (terminal_id, param_key, param_value, param_type, updated_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (terminal_id, param_key, version) DO UPDATE
       SET param_value = EXCLUDED.param_value, push_status = 'PENDING', updated_at = NOW()
     RETURNING id`,
    [input.terminalId, input.paramKey, input.paramValue, input.paramType ?? "STRING", input.updatedBy ?? null],
  );

  await logActivity(pool, input.terminalId, "PARAM_PUSHED", `Pushed ${input.paramKey}`, input.updatedBy);
  return { id: result.rows[0].id };
}

/**
 * Push a parameter to all terminals in a group.
 * Returns count of terminals updated.
 */
export async function pushParameterToGroup(
  pool:       Pool,
  groupId:    string,
  paramKey:   string,
  paramValue: string,
  paramType:  string = "STRING",
  updatedBy?: string,
): Promise<number> {
  const terminals = await pool.query<{ terminal_id: string }>(
    "SELECT terminal_id FROM terminal_group_members WHERE group_id = $1",
    [groupId],
  );

  let count = 0;
  for (const row of terminals.rows) {
    await pushParameter(pool, {
      terminalId: row.terminal_id, paramKey, paramValue, paramType, updatedBy,
    });
    count++;
  }
  return count;
}

export async function getPendingParameters(pool: Pool, terminalId: string) {
  return pool.query(
    `SELECT id, param_key, param_value, param_type, version
     FROM terminal_parameters
     WHERE terminal_id = $1 AND push_status = 'PENDING'
     ORDER BY created_at ASC`,
    [terminalId],
  );
}

export async function confirmParameter(pool: Pool, paramId: string): Promise<void> {
  await pool.query(
    "UPDATE terminal_parameters SET push_status = 'CONFIRMED', confirmed_at = NOW() WHERE id = $1 AND push_status = 'PUSHED'",
    [paramId],
  );
}

// ── Application Management ───────────────────────────────────

export async function registerApplication(pool: Pool, input: {
  appName:        string;
  description?:   string;
  currentVersion: string;
  minVersion?:    string;
  isCritical?:    boolean;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO applications (app_name, description, current_version, min_version, is_critical)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (app_name) DO UPDATE SET
       current_version = EXCLUDED.current_version,
       min_version = COALESCE(EXCLUDED.min_version, applications.min_version),
       is_critical = EXCLUDED.is_critical
     RETURNING id`,
    [input.appName, input.description ?? null, input.currentVersion, input.minVersion ?? null, input.isCritical ?? false],
  );
  return { id: result.rows[0].id };
}

export async function setTerminalAppVersion(
  pool: Pool,
  terminalId: string,
  appId: string,
  version: string,
): Promise<void> {
  const app = await pool.query<{ id: string; min_version: string | null }>(
    "SELECT id, min_version FROM applications WHERE id = $1", [appId],
  );
  if (!app.rows.length) throw new TmsError("Application not found", "APP_NOT_FOUND", 404);

  const needsUpdate = app.rows[0].min_version && version < app.rows[0].min_version;

  await pool.query(
    `INSERT INTO terminal_app_versions (terminal_id, app_id, installed_version, update_status)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (terminal_id, app_id) DO UPDATE SET
       installed_version = EXCLUDED.installed_version,
       update_status = EXCLUDED.update_status,
       installed_at = NOW()`,
    [terminalId, appId, version, needsUpdate ? "UPDATE_PENDING" : "CURRENT"],
  );
}

export async function getOutdatedTerminals(pool: Pool, appId: string) {
  return pool.query(
    `SELECT tav.terminal_id, tav.installed_version, a.min_version,
            t.tid, t.serial_number, m.merchant_code
     FROM terminal_app_versions tav
     JOIN applications a ON a.id = tav.app_id
     JOIN terminals t ON t.id = tav.terminal_id
     JOIN merchants m ON m.id = t.merchant_id
     WHERE tav.app_id = $1 AND tav.update_status IN ('UPDATE_PENDING','UPDATE_FAILED')`,
    [appId],
  );
}

// ── Key Lifecycle Tracking ───────────────────────────────────

export async function recordKeyInjection(pool: Pool, input: {
  terminalId:   string;
  keyType:      string;
  keyReference: string;
  injectedBy?:  string;
  expiresAt?:   Date;
}): Promise<{ id: string }> {
  // Check for existing active key of same type
  const existing = await pool.query(
    "SELECT id FROM key_lifecycle WHERE terminal_id = $1 AND key_type = $2 AND status = 'ACTIVE'",
    [input.terminalId, input.keyType],
  );

  if (existing.rows.length > 0) {
    // Mark existing as rotated
    await pool.query(
      "UPDATE key_lifecycle SET status = 'ROTATED', rotated_at = NOW() WHERE id = $1",
      [existing.rows[0].id],
    );
  }

  // Get next version
  const versionResult = await pool.query<{ max_ver: number | null }>(
    "SELECT MAX(key_version) as max_ver FROM key_lifecycle WHERE terminal_id = $1 AND key_type = $2",
    [input.terminalId, input.keyType],
  );
  const version = (versionResult.rows[0].max_ver ?? 0) + 1;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO key_lifecycle (terminal_id, key_type, key_reference, key_version, injected_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.terminalId, input.keyType, input.keyReference, version, input.injectedBy ?? null, input.expiresAt ?? null],
  );

  await logActivity(pool, input.terminalId, "KEY_INJECTED",
    `Injected ${input.keyType} v${version} (ref: ${input.keyReference})`, input.injectedBy);

  return { id: result.rows[0].id };
}

export async function rotateKey(pool: Pool, input: {
  terminalId:   string;
  keyType:      string;
  newKeyRef:    string;
  rotatedBy?:   string;
}): Promise<{ id: string }> {
  // Mark current key as rotated
  const current = await pool.query<{ id: string; key_reference: string }>(
    "SELECT id, key_reference FROM key_lifecycle WHERE terminal_id = $1 AND key_type = $2 AND status = 'ACTIVE'",
    [input.terminalId, input.keyType],
  );

  if (!current.rows.length) {
    throw new TmsError(`No active ${input.keyType} found for terminal`, "KEY_NOT_FOUND", 404);
  }

  await pool.query(
    "UPDATE key_lifecycle SET status = 'ROTATED', rotated_at = NOW(), rotated_to = $1 WHERE id = $2",
    [input.newKeyRef, current.rows[0].id],
  );

  // Inject new key
  const newKey = await recordKeyInjection(pool, {
    terminalId:   input.terminalId,
    keyType:      input.keyType,
    keyReference: input.newKeyRef,
    injectedBy:   input.rotatedBy,
  });

  await logActivity(pool, input.terminalId, "KEY_ROTATED",
    `Rotated ${input.keyType}: ${current.rows[0].key_reference} → ${input.newKeyRef}`, input.rotatedBy);

  return newKey;
}

export async function getExpiringKeys(pool: Pool, daysAhead = 30) {
  return pool.query(
    `SELECT kl.*, t.tid, t.serial_number, m.merchant_code
     FROM key_lifecycle kl
     JOIN terminals t ON t.id = kl.terminal_id
     JOIN merchants m ON m.id = t.merchant_id
     WHERE kl.status = 'ACTIVE'
       AND kl.expires_at IS NOT NULL
       AND kl.expires_at <= NOW() + ($1 || ' days')::INTERVAL
     ORDER BY kl.expires_at ASC`,
    [daysAhead],
  );
}

export async function getKeyHistory(pool: Pool, terminalId: string) {
  return pool.query(
    "SELECT * FROM key_lifecycle WHERE terminal_id = $1 ORDER BY key_type, key_version DESC",
    [terminalId],
  );
}

// ── Firmware Deployment ──────────────────────────────────────

export async function deployFirmware(pool: Pool, input: {
  firmwareVersionId: string;
  terminalId:        string;
}): Promise<{ id: string }> {
  // Get current firmware as previous version for rollback
  const terminal = await pool.query<{ firmware_version: string | null }>(
    "SELECT firmware_version FROM terminals WHERE id = $1",
    [input.terminalId],
  );

  const result = await pool.query<{ id: string }>(
    `INSERT INTO firmware_deployments (firmware_version_id, terminal_id, previous_version, status)
     VALUES ($1,$2,$3,'PENDING')
     ON CONFLICT (firmware_version_id, terminal_id) DO UPDATE SET status = 'PENDING'
     RETURNING id`,
    [input.firmwareVersionId, input.terminalId, terminal.rows[0]?.firmware_version ?? null],
  );

  await logActivity(pool, input.terminalId, "FIRMWARE_UPDATE_PENDING",
    `Firmware deployment queued`, undefined);

  return { id: result.rows[0].id };
}

export async function updateDeploymentStatus(
  pool:        Pool,
  deploymentId: string,
  status:      string,
  progress?:   number,
  error?:      string,
): Promise<void> {
  const updates: string[] = ["status = $1", "updated_at = NOW()"];
  const params: unknown[] = [status];

  if (progress !== undefined) { params.push(progress); updates.push(`progress_pct = $${params.length}`); }
  if (status === "DOWNLOADING" && !params.includes("started_at")) { updates.push("started_at = NOW()"); }
  if (status === "INSTALLED") { updates.push("completed_at = NOW()"); }
  if (error) { params.push(error); updates.push(`error_message = $${params.length}`); }

  params.push(deploymentId);

  await pool.query(
    `UPDATE firmware_deployments SET ${updates.join(", ")} WHERE id = $${params.length}`,
    params,
  );

  if (status === "INSTALLED") {
    // Update terminal firmware version
    const deployment = await pool.query<{
      terminal_id: string; firmware_version_id: string;
    }>("SELECT terminal_id, firmware_version_id FROM firmware_deployments WHERE id = $1", [deploymentId]);

    if (deployment.rows.length > 0) {
      const fw = await pool.query<{ version: string }>(
        "SELECT version FROM firmware_versions WHERE id = $1",
        [deployment.rows[0].firmware_version_id],
      );
      if (fw.rows.length > 0) {
        await pool.query(
          "UPDATE terminals SET firmware_version = $1, updated_at = NOW() WHERE id = $2",
          [fw.rows[0].version, deployment.rows[0].terminal_id],
        );
        await logActivity(pool, deployment.rows[0].terminal_id, "FIRMWARE_UPDATED",
          `Updated to ${fw.rows[0].version}`, undefined);
      }
    }
  }
}

export async function getPendingDeployments(pool: Pool, terminalId?: string) {
  const where  = terminalId ? "WHERE fd.terminal_id = $1 AND fd.status IN ('PENDING','DOWNLOADING','INSTALLING')" : "WHERE fd.status IN ('PENDING','DOWNLOADING','INSTALLING')";
  const params = terminalId ? [terminalId] : [];
  return pool.query(
    `SELECT fd.*, fv.version, fv.model, fv.checksum_sha256, fv.size_bytes, t.tid
     FROM firmware_deployments fd
     JOIN firmware_versions fv ON fv.id = fd.firmware_version_id
     JOIN terminals t ON t.id = fd.terminal_id
     ${where} ORDER BY fd.started_at ASC NULLS FIRST`,
    params,
  );
}

export async function rollbackFirmware(pool: Pool, deploymentId: string): Promise<void> {
  const deployment = await pool.query<{
    terminal_id: string; previous_version: string | null;
  }>("SELECT terminal_id, previous_version FROM firmware_deployments WHERE id = $1", [deploymentId]);

  if (!deployment.rows.length) throw new TmsError("Deployment not found", "NOT_FOUND", 404);

  await pool.query(
    "UPDATE firmware_deployments SET status = 'ROLLED_BACK', rollback_initiated = TRUE WHERE id = $1",
    [deploymentId],
  );

  if (deployment.rows[0].previous_version) {
    await pool.query(
      "UPDATE terminals SET firmware_version = $1 WHERE id = $2",
      [deployment.rows[0].previous_version, deployment.rows[0].terminal_id],
    );
    await logActivity(pool, deployment.rows[0].terminal_id, "FIRMWARE_ROLLBACK",
      `Rolled back to ${deployment.rows[0].previous_version}`, undefined);
  }
}

// ── Device Analytics ─────────────────────────────────────────

export async function recordAnalytics(pool: Pool, input: {
  terminalId:      string;
  businessDate:    string;
  txCount?:        number;
  approvedCount?:  number;
  declinedCount?:  number;
  totalAmount?:    string;
  uptimePct?:      number;
  avgResponseMs?:  number;
  errorCount?:     number;
  chargebackCount?: number;
  reversalCount?:  number;
  riskScore?:      number;
  lastIp?:         string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO device_analytics
       (terminal_id, business_date, tx_count, approved_count, declined_count,
        total_amount, uptime_pct, avg_response_ms, error_count,
        chargeback_count, reversal_count, risk_score, last_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::inet)
     ON CONFLICT (terminal_id, business_date) DO UPDATE SET
       tx_count          = EXCLUDED.tx_count,
       approved_count    = EXCLUDED.approved_count,
       declined_count    = EXCLUDED.declined_count,
       total_amount      = EXCLUDED.total_amount,
       uptime_pct        = EXCLUDED.uptime_pct,
       avg_response_ms   = EXCLUDED.avg_response_ms,
       error_count       = EXCLUDED.error_count`,
    [
      input.terminalId, input.businessDate,
      input.txCount ?? 0, input.approvedCount ?? 0, input.declinedCount ?? 0,
      input.totalAmount ?? "0", input.uptimePct ?? 100, input.avgResponseMs ?? null,
      input.errorCount ?? 0, input.chargebackCount ?? 0, input.reversalCount ?? 0,
      input.riskScore ?? 0, input.lastIp ?? null,
    ],
  );
}

export async function getAnalytics(pool: Pool, terminalId: string, days = 30) {
  return pool.query(
    `SELECT * FROM device_analytics
     WHERE terminal_id = $1 AND business_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
     ORDER BY business_date ASC`,
    [terminalId, days],
  );
}

export async function getFleetOverview(pool: Pool) {
  return pool.query(
    `SELECT
       (SELECT COUNT(*) FROM terminals) AS total_terminals,
       (SELECT COUNT(*) FROM terminals WHERE status = 'ACTIVE') AS active_terminals,
       (SELECT COUNT(*) FROM terminals WHERE status = 'INACTIVE') AS inactive_terminals,
       (SELECT COUNT(*) FROM terminals WHERE status = 'DISABLED') AS disabled_terminals,
       (SELECT COUNT(*) FROM terminal_health WHERE status = 'ONLINE') AS online_terminals,
       (SELECT COUNT(*) FROM terminal_health WHERE status = 'OFFLINE') AS offline_terminals,
       (SELECT COUNT(*) FROM terminal_health WHERE status = 'DEGRADED') AS degraded_terminals,
       (SELECT COUNT(*) FROM terminal_app_versions WHERE update_status = 'UPDATE_PENDING') AS pending_updates,
       (SELECT COUNT(*) FROM key_lifecycle
         WHERE status = 'ACTIVE' AND expires_at < NOW() + '30 days'::INTERVAL) AS expiring_keys,
       (SELECT COUNT(*) FROM terminal_commands
         WHERE status = 'PENDING' AND expires_at > NOW()) AS pending_commands`,
  );
}

// ── Terminal Activity Log ────────────────────────────────────

export async function getActivityLog(pool: Pool, terminalId: string, limit = 100) {
  return pool.query(
    `SELECT * FROM terminal_activity
     WHERE terminal_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [terminalId, limit],
  );
}

// ── Private helper ───────────────────────────────────────────

async function logActivity(
  pool:         Pool,
  terminalId:   string,
  activityType: string,
  description:  string,
  performedBy?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO terminal_activity (terminal_id, activity_type, description, performed_by)
     VALUES ($1,$2,$3,$4)`,
    [terminalId, activityType, description, performedBy ?? null],
  ).catch(() => {});
}
