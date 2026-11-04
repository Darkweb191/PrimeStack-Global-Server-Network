-- ============================================================
-- PrimeStack Security Service — Migration 001
--
-- This service is the security layer for the entire platform.
-- It manages ALL cryptographic identities:
--
--   API Keys     — scoped access tokens per merchant/terminal
--   HMAC Keys    — request signing secrets
--   mTLS Certs   — mutual TLS for service-to-service and terminal
--   Terminal Keys — per-terminal encryption keys (index only — actual key in HSM)
--   RBAC         — roles, permissions, assignments
--   Sessions     — admin UI session tokens with idle timeout
--   Key Rotation — audit trail for all cryptographic material
--
-- Security principles applied here:
--
-- 1. Secrets are NEVER stored in plaintext.
--    API key secrets: bcrypt hash (one-way, verification only)
--    HMAC secrets: AES-256-GCM encrypted, key in KMS/HSM reference
--    Private keys: never stored — generated in HSM or shown once
--
-- 2. Every cryptographic operation is logged in security_events.
--    WHO created/rotated/revoked a key, WHEN, from WHERE.
--
-- 3. Key expiry is enforced at the application layer, not by
--    deleting records. Expired keys are kept for audit purposes.
--
-- 4. Terminal keys are managed by INDEX only.
--    The actual encryption keys are in the HSM.
--    The DB stores only: which HSM key slot is assigned to which terminal.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Roles and Permissions ────────────────────────────────────

CREATE TABLE roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system   BOOLEAN     NOT NULL DEFAULT FALSE,  -- system roles cannot be deleted
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (name, description, is_system) VALUES
  ('SUPER_ADMIN',  'Full platform access',                              TRUE),
  ('ADMIN',        'Administrative access, no key management',          TRUE),
  ('OPERATOR',     'Day-to-day operations, no configuration changes',   TRUE),
  ('REVIEWER',     'Read-only access plus review queue',                TRUE),
  ('READONLY',     'Read-only access to all data',                      TRUE),
  ('MERCHANT_ADMIN','Merchant-scoped administrative access',            FALSE),
  ('TERMINAL_OPS', 'Terminal management access only',                   FALSE),
  ('SETTLEMENT',   'Settlement and reconciliation access only',         FALSE);

CREATE TABLE permissions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,   -- e.g. "transactions:read"
    resource    VARCHAR(50)  NOT NULL,          -- "transactions", "ledger", "terminals"
    action      VARCHAR(20)  NOT NULL,          -- "read", "write", "delete", "approve"
    description TEXT
);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ── API Keys ─────────────────────────────────────────────────

CREATE TABLE api_keys (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id          VARCHAR(80) NOT NULL UNIQUE,   -- "apk_{32hex}"  — public identifier
    key_hash        TEXT        NOT NULL,           -- bcrypt(secret) — one-way
    merchant_id     VARCHAR(100),
    terminal_id     VARCHAR(20),
    label           VARCHAR(100),
    scopes          TEXT[]      NOT NULL DEFAULT '{}',  -- ["transfers:write","balances:read"]
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED','EXPIRED')),
    ip_restriction  CIDR[],                        -- optional CIDR list for this key
    last_used_at    TIMESTAMPTZ,
    last_used_ip    INET,
    expires_at      TIMESTAMPTZ,
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_merchant  ON api_keys(merchant_id, status);
CREATE INDEX idx_api_keys_terminal  ON api_keys(terminal_id) WHERE terminal_id IS NOT NULL;
CREATE INDEX idx_api_keys_status    ON api_keys(status);
CREATE INDEX idx_api_keys_expires   ON api_keys(expires_at) WHERE status = 'ACTIVE';

-- ── HMAC Keys ────────────────────────────────────────────────

CREATE TABLE hmac_keys (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           VARCHAR(80) NOT NULL UNIQUE,   -- "psk_{32hex}"
    -- secret stored encrypted: AES-256-GCM, key referenced by kms_key_ref
    secret_encrypted    TEXT        NOT NULL,
    kms_key_ref         VARCHAR(100),                  -- KMS key ARN/ID used to encrypt
    algorithm           VARCHAR(20) NOT NULL DEFAULT 'sha256',
    merchant_id         VARCHAR(100),
    terminal_id         VARCHAR(20),
    label               VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','ROTATED','REVOKED','EXPIRED')),
    rotated_from        VARCHAR(80) REFERENCES hmac_keys(client_id),
    grace_expires_at    TIMESTAMPTZ,               -- after rotation: old key accepted until this
    expires_at          TIMESTAMPTZ,
    last_used_at        TIMESTAMPTZ,
    created_by          VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hmac_merchant ON hmac_keys(merchant_id, status);
CREATE INDEX idx_hmac_status   ON hmac_keys(status);

-- ── mTLS Certificates ────────────────────────────────────────

CREATE TABLE certificates (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    label           VARCHAR(100) NOT NULL,
    cert_type       VARCHAR(20) NOT NULL
                        CHECK (cert_type IN ('CA','SERVER','CLIENT','TERMINAL')),
    subject         TEXT,
    issuer          TEXT,
    serial_number   VARCHAR(100),
    fingerprint_sha256 CHAR(64)  NOT NULL UNIQUE,
    public_key_pem  TEXT        NOT NULL,
    -- Private key is NEVER stored here in production
    -- In development, stored encrypted; in production, in HSM
    private_key_pem TEXT,                          -- DEV ONLY: remove in production
    cert_pem        TEXT        NOT NULL,
    -- Association
    merchant_id     VARCHAR(100),
    terminal_id     VARCHAR(20),
    -- Lifecycle
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_to        TIMESTAMPTZ NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','REVOKED','EXPIRED','SUPERSEDED')),
    revoked_at      TIMESTAMPTZ,
    revocation_reason TEXT,
    -- HSM reference for terminal keys
    hsm_key_ref     VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_certs_terminal    ON certificates(terminal_id) WHERE terminal_id IS NOT NULL;
CREATE INDEX idx_certs_merchant    ON certificates(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX idx_certs_valid_to    ON certificates(valid_to);
CREATE INDEX idx_certs_fingerprint ON certificates(fingerprint_sha256);

-- ── Terminal Key Index ───────────────────────────────────────
-- Maps each terminal to its HSM key slot.
-- The actual encryption key NEVER leaves the HSM.

CREATE TABLE terminal_key_index (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     VARCHAR(20) NOT NULL UNIQUE,
    -- Master key reference in HSM
    master_key_ref  VARCHAR(100) NOT NULL,          -- HSM slot/label reference
    -- Derived key references (rotated periodically)
    pin_key_ref     VARCHAR(100),                   -- PIN encryption key (ISO 9564)
    mac_key_ref     VARCHAR(100),                   -- Message Authentication Code key
    data_key_ref    VARCHAR(100),                   -- Data encryption key
    -- Key version tracking
    key_version     INT          NOT NULL DEFAULT 1,
    -- Status
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','KEY_EXPIRED','DECOMMISSIONED')),
    last_rotated_at TIMESTAMPTZ,
    next_rotation_at TIMESTAMPTZ,                   -- scheduled rotation date
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── User Accounts ────────────────────────────────────────────

CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,          -- bcrypt, cost factor 13+
    full_name       VARCHAR(100) NOT NULL,
    role_id         UUID         NOT NULL REFERENCES roles(id),
    merchant_id     VARCHAR(100),                   -- scoped to a merchant (NULL = platform)
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    mfa_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
    mfa_secret_enc  TEXT,                           -- TOTP secret, AES-256-GCM encrypted
    failed_attempts SMALLINT     NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    last_login_ip   INET,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    must_change_password BOOLEAN   NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role     ON users(role_id);
CREATE INDEX idx_users_merchant ON users(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX idx_users_active   ON users(is_active);

-- ── Sessions ─────────────────────────────────────────────────

CREATE TABLE sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id),
    token_hash      TEXT        NOT NULL UNIQUE,    -- SHA-256 of the session token
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_revoked      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE is_revoked = FALSE;

-- ── Security Events (immutable audit log) ────────────────────

CREATE TABLE security_events (
    id              BIGSERIAL   PRIMARY KEY,
    event_type      VARCHAR(50) NOT NULL,   -- KEY_CREATED, KEY_ROTATED, LOGIN_FAILED, etc.
    severity        VARCHAR(10) NOT NULL DEFAULT 'INFO'
                        CHECK (severity IN ('DEBUG','INFO','WARN','ERROR','CRITICAL')),
    actor_type      VARCHAR(20) NOT NULL,   -- USER, SERVICE, SYSTEM
    actor_id        VARCHAR(100),
    actor_ip        INET,
    resource_type   VARCHAR(30),            -- api_key, hmac_key, cert, user, session
    resource_id     VARCHAR(100),
    description     TEXT        NOT NULL,
    metadata        JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sec_events_type      ON security_events(event_type);
CREATE INDEX idx_sec_events_actor     ON security_events(actor_id);
CREATE INDEX idx_sec_events_resource  ON security_events(resource_type, resource_id);
CREATE INDEX idx_sec_events_occurred  ON security_events(occurred_at DESC);
CREATE INDEX idx_sec_events_severity  ON security_events(severity) WHERE severity IN ('WARN','ERROR','CRITICAL');

-- ── updated_at triggers ──────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_api_keys_updated    BEFORE UPDATE ON api_keys             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hmac_keys_updated   BEFORE UPDATE ON hmac_keys            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated       BEFORE UPDATE ON users                FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_terminal_key_updated BEFORE UPDATE ON terminal_key_index  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
