-- ============================================================
-- PrimeStack Terminal Management Platform — Migration 002
--
-- Extends the basic terminal registry with full TMS capabilities:
--
--   ├── Terminal Groups        — batch manage terminals as a unit
--   ├── Parameter Distribution  — push config/EMV params remotely
--   ├── Application Management — terminal app versions + updates
--   ├── Key Lifecycle Tracking — which HSM key is where, rotation
--   ├── Device Analytics        — per-terminal stats, fraud signals
--   └── Remote Updates         — firmware versioning + deployment
--
-- This is the layer that manages the fleet of payment terminals
-- in production — thousands of devices across merchants.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Terminal Groups ───────────────────────────────────────────
-- Group terminals for batch operations (e.g. "all POS terminals in UAE",
-- "all Verifone V400m devices", "merchant X's terminals").

CREATE TABLE terminal_groups (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name      VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    group_type      VARCHAR(30) NOT NULL
                        CHECK (group_type IN (
                            'MERCHANT','GEOGRAPHIC',
                            'HARDWARE','PROCESSOR','CUSTOM'
                        )),
    -- Criteria for dynamic group membership
    match_criteria  JSONB,      -- {"merchant_id":"...", "model":"V400m", "country":"AE"}
    is_dynamic      BOOLEAN     NOT NULL DEFAULT FALSE,
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groups_type ON terminal_groups(group_type, active);

-- ── Terminal Group Membership ────────────────────────────────
-- Static membership (for non-dynamic groups).

CREATE TABLE terminal_group_members (
    group_id        UUID        NOT NULL REFERENCES terminal_groups(id) ON DELETE CASCADE,
    terminal_id     UUID        NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, terminal_id)
);

CREATE INDEX idx_group_members_terminal ON terminal_group_members(terminal_id);

-- ── Parameter Distribution ───────────────────────────────────
-- Configuration parameters that can be pushed to terminals.
-- Each parameter has a key, value, and optional version for A/B rollouts.

CREATE TABLE terminal_parameters (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    param_key       VARCHAR(100) NOT NULL,   -- e.g. "MERCHANT_NAME", "SUPPORTED_AIDS"
    param_value     TEXT        NOT NULL,
    param_type      VARCHAR(20) NOT NULL DEFAULT 'STRING'
                        CHECK (param_type IN ('STRING','NUMERIC','JSON','BINARY','BOOLEAN')),
    version         INT         NOT NULL DEFAULT 1,
    -- Push status
    push_status     VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (push_status IN ('PENDING','PUSHED','CONFIRMED','FAILED')),
    pushed_at       TIMESTAMPTZ,
    confirmed_at    TIMESTAMPTZ,
    -- Audit
    updated_by      VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (terminal_id, param_key, version)
);

CREATE INDEX idx_params_terminal  ON terminal_parameters(terminal_id, push_status);
CREATE INDEX idx_params_push      ON terminal_parameters(push_status) WHERE push_status = 'PENDING';

-- ── Application Management ──────────────────────────────────
-- Terminal applications and versions (payment app, loyalty app, etc.)

CREATE TABLE applications (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name        VARCHAR(100) NOT NULL UNIQUE,   -- "PAYMENT_APP", "LOYALTY_APP"
    description     TEXT,
    current_version VARCHAR(30) NOT NULL,            -- "2.4.1"
    min_version     VARCHAR(30),                      -- terminals below this must update
    is_critical     BOOLEAN     NOT NULL DEFAULT FALSE, -- must be installed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE terminal_app_versions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    app_id          UUID        NOT NULL REFERENCES applications(id),
    installed_version VARCHAR(30) NOT NULL,
    installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_status   VARCHAR(20) NOT NULL DEFAULT 'CURRENT'
                        CHECK (update_status IN (
                            'CURRENT','UPDATE_PENDING','UPDATING',
                            'UPDATE_FAILED','ROLLBACK'
                        )),
    UNIQUE (terminal_id, app_id)
);

CREATE INDEX idx_app_versions_terminal ON terminal_app_versions(terminal_id);
CREATE INDEX idx_app_versions_status   ON terminal_app_versions(update_status) WHERE update_status != 'CURRENT';

-- ── Key Lifecycle Tracking ───────────────────────────────────
-- Tracks which HSM key is assigned to which terminal and when.
-- The actual keys are in the HSM — this table only stores references.

CREATE TABLE key_lifecycle (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    key_type        VARCHAR(30) NOT NULL
                        CHECK (key_type IN (
                            'MASTER_KEY','PIN_KEY','MAC_KEY',
                            'DATA_KEY','RSA_KEY_PAIR','CA_CERT'
                        )),
    key_reference   VARCHAR(100) NOT NULL,    -- HSM slot reference (NOT the key itself)
    key_version     INT         NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','EXPIRED','COMPROMISED','REVOKED','ROTATED')),
    -- Lifecycle
    injected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    rotated_at      TIMESTAMPTZ,
    rotated_to      VARCHAR(100),     -- new key reference
    revoked_reason  TEXT,
    -- Audit
    injected_by     VARCHAR(100),
    UNIQUE (terminal_id, key_type, key_version)
);

CREATE INDEX idx_keys_terminal  ON key_lifecycle(terminal_id, status);
CREATE INDEX idx_keys_type      ON key_lifecycle(key_type, status);
CREATE INDEX idx_keys_expires   ON key_lifecycle(expires_at) WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;

-- ── Device Analytics ──────────────────────────────────────────
-- Per-terminal aggregated stats for fleet management.

CREATE TABLE device_analytics (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     UUID        NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    business_date   DATE        NOT NULL,
    -- Volume
    tx_count        INT         NOT NULL DEFAULT 0,
    approved_count  INT         NOT NULL DEFAULT 0,
    declined_count  INT         NOT NULL DEFAULT 0,
    total_amount    NUMERIC(20,4) NOT NULL DEFAULT 0,
    -- Reliability
    uptime_pct      NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    avg_response_ms INT,
    error_count     INT         NOT NULL DEFAULT 0,
    offline_count   INT         NOT NULL DEFAULT 0,
    -- Fraud signals
    chargeback_count INT        NOT NULL DEFAULT 0,
    reversal_count  INT         NOT NULL DEFAULT 0,
    risk_score      SMALLINT    NOT NULL DEFAULT 0,
    -- Connection
    ip_changes      INT         NOT NULL DEFAULT 0,
    last_ip          INET,
    -- Unique
    UNIQUE (terminal_id, business_date)
);

CREATE INDEX idx_analytics_date   ON device_analytics(business_date DESC);
CREATE INDEX idx_analytics_terminal ON device_analytics(terminal_id);

-- ── Firmware Catalog (enhanced) ──────────────────────────────
-- Already exists in migration 001; add deployment tracking.

CREATE TABLE firmware_deployments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    firmware_version_id UUID    NOT NULL REFERENCES firmware_versions(id),
    terminal_id     UUID        NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','DOWNLOADING','INSTALLING','INSTALLED','FAILED','ROLLED_BACK')),
    progress_pct    SMALLINT    NOT NULL DEFAULT 0,    -- 0–100
    downloaded_bytes BIGINT     NOT NULL DEFAULT 0,
    checksum_verified BOOLEAN  NOT NULL DEFAULT FALSE,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    -- Rollback
    previous_version VARCHAR(50),
    rollback_initiated BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (firmware_version_id, terminal_id)
);

CREATE INDEX idx_deployments_terminal ON firmware_deployments(terminal_id, status);
CREATE INDEX idx_deployments_status   ON firmware_deployments(status) WHERE status IN ('PENDING','DOWNLOADING','INSTALLING');

-- ── Terminal Activity Log ────────────────────────────────────
-- Every significant terminal event for audit and support.

CREATE TABLE terminal_activity (
    id              BIGSERIAL   PRIMARY KEY,
    terminal_id     UUID        NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    activity_type   VARCHAR(40) NOT NULL,
    -- REGISTERED, ACTIVATED, DECOMMISSIONED, FIRMWARE_UPDATED,
    -- KEY_INJECTED, KEY_ROTATED, PARAM_PUSHED, CONFIG_CHANGED,
    -- HEALTH_DEGRADED, HEALTH_RECOVERED, REMOTE_COMMAND_SENT
    description     TEXT        NOT NULL,
    performed_by    VARCHAR(100),
    ip_address      INET,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_terminal ON terminal_activity(terminal_id, created_at DESC);
CREATE INDEX idx_activity_type     ON terminal_activity(activity_type);

-- ── updated_at triggers ──────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_groups_updated  BEFORE UPDATE ON terminal_groups      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_params_updated  BEFORE UPDATE ON terminal_parameters    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_apps_updated   BEFORE UPDATE ON applications           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
