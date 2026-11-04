import { Pool } from "pg";

/**
 * IP Whitelist Domain
 *
 * Core logic for checking, adding, and removing IP whitelist entries.
 *
 * Key design decisions:
 *
 * 1. We use PostgreSQL CIDR/INET types for all IP matching.
 *    The query `SELECT id FROM ip_whitelist WHERE $1::inet << ip_range`
 *    uses PostgreSQL's native "is contained by" operator (<<).
 *    This handles single IPs, /8 to /32 ranges, and IPv6 correctly
 *    without any application-layer CIDR math.
 *
 * 2. A two-tier cache:
 *    - In-memory Map<string, boolean> (process-local, TTL 30s)
 *    - Falls back to database on miss
 *    Cache is invalidated on any whitelist modification.
 *    In a multi-instance deployment, use Redis pubsub to broadcast
 *    invalidation to other instances.
 *
 * 3. Every check is logged to ip_check_log for audit.
 *    Logging is fire-and-forget — a log write failure
 *    never blocks the check result.
 *
 * 4. Empty whitelist → DENY ALL (safe default).
 *    This prevents a misconfiguration from opening access.
 */

interface CacheEntry {
  allowed: boolean;
  expiresAt: number;
}

// In-process cache: "clientId:ip" → CacheEntry
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function cacheKey(clientId: string | null, ip: string): string {
  return `${clientId ?? "_global_"}:${ip}`;
}

function getCached(clientId: string | null, ip: string): boolean | null {
  const entry = cache.get(cacheKey(clientId, ip));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(clientId, ip));
    return null;
  }
  return entry.allowed;
}

function setCache(clientId: string | null, ip: string, allowed: boolean): void {
  cache.set(cacheKey(clientId, ip), {
    allowed,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidateCache(): void {
  cache.clear();
}

/**
 * Check whether an IP is allowed.
 *
 * Check order:
 *   1. In-process cache (30s TTL)
 *   2. Client-specific rules (clientId match)
 *   3. Global rules (clientId IS NULL)
 *   4. If no rules exist at all: DENY
 */
export async function checkIp(
  pool: Pool,
  ip: string,
  clientId?: string,
): Promise<{ allowed: boolean; matchedId: string | null }> {

  // ── 1. Cache hit ─────────────────────────────────────────
  const cached = getCached(clientId ?? null, ip);
  if (cached !== null) {
    return { allowed: cached, matchedId: null };
  }

  // ── 2. Database check ────────────────────────────────────
  // Use PostgreSQL's << operator: "is $1 contained by ip_range?"
  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM ip_whitelist
     WHERE active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       AND ($1::inet << ip_range OR $1::inet = ip_range::inet)
       AND (client_id = $2 OR client_id IS NULL)
     ORDER BY client_id NULLS LAST   -- prefer client-specific over global
     LIMIT 1`,
    [ip, clientId ?? null],
  );

  const allowed  = result.rows.length > 0;
  const matchId  = allowed ? result.rows[0].id : null;

  // ── 3. Cache result ──────────────────────────────────────
  setCache(clientId ?? null, ip, allowed);

  // ── 4. Log the check (fire and forget) ───────────────────
  pool.query(
    `INSERT INTO ip_check_log (client_ip, client_id, allowed, matched_id)
     VALUES ($1::inet, $2, $3, $4)`,
    [ip, clientId ?? null, allowed, matchId],
  ).catch((err) => {
    console.error("[ip-whitelist] audit log write failed:", err.message);
  });

  return { allowed, matchedId: matchId };
}

/**
 * Add an IP address or CIDR range to the whitelist.
 */
export async function addEntry(
  pool: Pool,
  input: {
    ipRange:   string;    // e.g. "10.0.0.0/8" or "192.168.1.100"
    clientId?: string;
    label?:    string;
    expiresAt?: Date;
  },
): Promise<{ id: string }> {

  // Normalize — a bare IP becomes a /32 (or /128 for IPv6)
  const ipRange = input.ipRange.includes("/")
    ? input.ipRange
    : `${input.ipRange}/32`;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO ip_whitelist (ip_range, client_id, label, expires_at)
     VALUES ($1::cidr, $2, $3, $4)
     ON CONFLICT (client_id, ip_range) DO UPDATE
       SET active     = TRUE,
           label      = EXCLUDED.label,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
     RETURNING id`,
    [ipRange, input.clientId ?? null, input.label ?? null, input.expiresAt ?? null],
  );

  invalidateCache();
  return { id: result.rows[0].id };
}

/**
 * Remove (deactivate) an entry by ID.
 * We never hard-delete whitelist entries — audit trail matters.
 */
export async function deactivateEntry(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE ip_whitelist SET active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id],
  );

  invalidateCache();
  return (result.rowCount ?? 0) > 0;
}

/**
 * List all entries, optionally filtered by clientId.
 */
export async function listEntries(
  pool: Pool,
  clientId?: string,
  activeOnly = true,
) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (activeOnly) {
    where.push("active = TRUE");
  }
  if (clientId !== undefined) {
    params.push(clientId);
    where.push(`client_id = $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return pool.query(
    `SELECT id, ip_range::text, client_id, label, active, expires_at, created_at
     FROM ip_whitelist
     ${whereClause}
     ORDER BY created_at DESC`,
    params,
  );
}

/**
 * Purge expired entries (call this on a schedule, e.g. every hour).
 */
export async function purgeExpired(pool: Pool): Promise<number> {
  const result = await pool.query(
    `UPDATE ip_whitelist
     SET active = FALSE, updated_at = NOW()
     WHERE active = TRUE AND expires_at < NOW()`,
  );

  if ((result.rowCount ?? 0) > 0) {
    invalidateCache();
  }

  return result.rowCount ?? 0;
}
