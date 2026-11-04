-- ============================================================
-- PrimeStack Terminal Service — Migration 001
--
-- The terminal registry is the source of truth for all
-- physical and virtual payment terminals.
--
-- Security notes:
--   - public_key stores the terminal's RSA/EC public key
--     for message signing verification
--   - master_key_index references the key held in the HSM
--     (not the key itself — never store HSM keys in DB)
--   - last_seen_at is updated on every heartbeat, not on
--     every transaction, to avoid write contention
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE merchants (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_code   VARCHAR(50) NOT NULL UNIQUE,
    legal_name      VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','TERMINATED')),
    country         CHAR(2)     NOT NULL DEFAULT 'US',
    mcc             CHAR(4),                           -- Merchant Category Code
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_status ON merchants(status);
CREATE INDEX idx_merchants_code   ON merchants(merchant_code);

CREATE TABLE terminals (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tid              VARCHAR(20) NOT NULL UNIQUE,      -- Terminal ID (8 chars for ISO 8583)
    merchant_id      UUID        NOT NULL REFERENCES merchants(id),
    serial_number    VARCHAR(100) NOT NULL UNIQUE,
    model            VARCHAR(100),
    firmware_version VARCHAR(50),
    os_version       VARCHAR(50),
    country          CHAR(2)     NOT NULL DEFAULT 'US',
    timezone         VARCHAR(50) NOT NULL DEFAULT 'UTC',
    location_label   VARCHAR(255),
    status           VARCHAR(20) NOT NULL DEFAULT 'REGISTERED'
                         CHECK (status IN ('REGISTERED','ACTIVE','INACTIVE','DISABLED','DECOMMISSIONED')),
    -- Cryptographic identity of the terminal
    public_key       TEXT,                             -- PEM-encoded public key for msg signing
    master_key_index VARCHAR(50),                      -- Reference to HSM key slot (not the key)
    -- Timestamps
    last_seen_at     TIMESTAMPTZ,
    registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decommissioned_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_terminals_merchant ON terminals(merchant_id);
CREATE INDEX idx_terminals_status   ON terminals(status);
CREATE INDEX idx_terminals_tid      ON terminals(tid);

-- Terminal health — one row per terminal, updated on heartbeat
CREATE TABLE terminal_health (
    terminal_id         UUID    PRIMARY KEY REFERENCES terminals(id) ON DELETE CASCADE,
    status              VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
                            CHECK (status IN ('ONLINE','OFFLINE','DEGRADED','MAINTENANCE')),
    heartbeat_at        TIMESTAMPTZ,
    cpu_usage_pct       SMALLINT CHECK (cpu_usage_pct BETWEEN 0 AND 100),
    memory_usage_pct    SMALLINT CHECK (memory_usage_pct BETWEEN 0 AND 100),
    disk_usage_pct      SMALLINT CHECK (disk_usage_pct BETWEEN 0 AND 100),
    battery_level_pct   SMALLINT CHECK (battery_level_pct BETWEEN 0 AND 100),
    network_latency_ms  INT,
    error_code          VARCHAR(20),
    error_message       TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_status ON terminal_health(status);

-- EMV application parameters per terminal
CREATE TABLE terminal_emv_params (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id UUID    NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    aid         VARCHAR(32) NOT NULL,                  -- Application Identifier
    label       VARCHAR(100) NOT NULL,                 -- e.g. "VISA", "MASTERCARD"
    version     VARCHAR(20),
    config      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (terminal_id, aid)
);

CREATE INDEX idx_emv_terminal ON terminal_emv_params(terminal_id);

-- Remote command queue — commands waiting to be delivered to terminal
CREATE TABLE terminal_commands (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id UUID        NOT NULL REFERENCES terminals(id),
    command     VARCHAR(50) NOT NULL,                  -- REBOOT, UPDATE_CONFIG, DOWNLOAD_KEYS, etc.
    payload     JSONB,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','SENT','ACK','FAILED','EXPIRED')),
    sent_at     TIMESTAMPTZ,
    acked_at    TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commands_terminal ON terminal_commands(terminal_id, status);
CREATE INDEX idx_commands_expires  ON terminal_commands(expires_at) WHERE status = 'PENDING';

-- Firmware version catalog
CREATE TABLE firmware_versions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    version      VARCHAR(50) NOT NULL,
    model        VARCHAR(100) NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    download_url TEXT,
    size_bytes   INT,
    release_notes TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE','DEPRECATED','RETIRED')),
    released_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version, model)
);

CREATE INDEX idx_firmware_model ON firmware_versions(model, status);

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_merchants_updated  BEFORE UPDATE ON merchants          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_terminals_updated  BEFORE UPDATE ON terminals          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_emv_updated        BEFORE UPDATE ON terminal_emv_params FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_health_updated     BEFORE UPDATE ON terminal_health    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
