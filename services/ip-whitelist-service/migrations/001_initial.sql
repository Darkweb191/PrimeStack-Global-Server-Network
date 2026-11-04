-- ============================================================
-- PrimeStack IP Whitelist Service — Migration 001
--
-- Uses PostgreSQL's native INET and CIDR types for correct
-- IP range matching. This is safer and faster than doing
-- CIDR arithmetic in application code.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ip_whitelist stores allowed IPs and CIDR ranges
-- The `ip_range` column uses CIDR type so PostgreSQL
-- can use the && and >> operators for range checks.
CREATE TABLE ip_whitelist (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID,                         -- NULL = global rule
    ip_range    CIDR        NOT NULL,         -- e.g. 10.0.0.0/8 or 192.168.1.100/32
    label       VARCHAR(100),
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_client_ip UNIQUE (client_id, ip_range)
);

-- GiST index for fast inet_contains / inet_contained_by queries
-- This is what makes "is 192.168.1.55 in any listed CIDR?" fast.
CREATE INDEX idx_whitelist_ip_range  ON ip_whitelist USING GIST (ip_range inet_ops);
CREATE INDEX idx_whitelist_client_id ON ip_whitelist (client_id) WHERE active = TRUE;
CREATE INDEX idx_whitelist_active    ON ip_whitelist (active);

-- Access log — every check is recorded for audit purposes
CREATE TABLE ip_check_log (
    id          BIGSERIAL   PRIMARY KEY,
    client_ip   INET        NOT NULL,
    client_id   UUID,
    allowed     BOOLEAN     NOT NULL,
    matched_id  UUID        REFERENCES ip_whitelist(id),
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_check_log_ip        ON ip_check_log (client_ip);
CREATE INDEX idx_check_log_checked   ON ip_check_log (checked_at DESC);
CREATE INDEX idx_check_log_blocked   ON ip_check_log (allowed) WHERE allowed = FALSE;

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_whitelist_updated
    BEFORE UPDATE ON ip_whitelist
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
