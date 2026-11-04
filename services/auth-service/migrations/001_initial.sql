-- ============================================================
-- PrimeStack Auth Service — Migration 001
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- HMAC keys for API authentication
CREATE TABLE hmac_keys (
    client_id    VARCHAR(80)  PRIMARY KEY,   -- "psk_<32hex>"
    secret       TEXT         NOT NULL,      -- plaintext in DB (encrypted at volume level)
                                             -- production: use KMS/HSM
    merchant_id  UUID,
    label        VARCHAR(100),
    status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'ROTATED', 'REVOKED')),
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hmac_keys_merchant ON hmac_keys (merchant_id);
CREATE INDEX idx_hmac_keys_status   ON hmac_keys (status);

-- Admin users (JWT-authenticated)
CREATE TABLE admin_users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,    -- bcrypt, cost factor 12+
    full_name     VARCHAR(100) NOT NULL,
    role          VARCHAR(30)  NOT NULL DEFAULT 'READONLY'
                      CHECK (role IN ('SUPER_ADMIN','ADMIN','OPERATOR','REVIEWER','READONLY')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    mfa_secret    TEXT,                     -- TOTP secret, encrypted
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_users_role ON admin_users (role);

-- Auth audit log — every auth event (success + failure)
CREATE TABLE auth_events (
    id          BIGSERIAL    PRIMARY KEY,
    event_type  VARCHAR(30)  NOT NULL,  -- LOGIN, LOGOUT, HMAC_OK, HMAC_FAIL, KEY_ROTATED
    client_id   VARCHAR(80),            -- HMAC client_id
    user_id     UUID         REFERENCES admin_users(id),
    ip_address  INET,
    user_agent  TEXT,
    success     BOOLEAN      NOT NULL,
    failure_reason TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_events_client    ON auth_events (client_id);
CREATE INDEX idx_auth_events_user      ON auth_events (user_id);
CREATE INDEX idx_auth_events_created   ON auth_events (created_at DESC);
CREATE INDEX idx_auth_events_failures  ON auth_events (success) WHERE success = FALSE;

-- Rate limiting buckets for failed auth attempts
-- Prevent brute-force by tracking failed attempts per IP
CREATE TABLE auth_rate_limits (
    ip_address   INET        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    attempt_count INT        NOT NULL DEFAULT 1,
    PRIMARY KEY (ip_address, window_start)
);

CREATE INDEX idx_rate_limits_ip ON auth_rate_limits (ip_address, window_start DESC);

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_hmac_keys_updated
    BEFORE UPDATE ON hmac_keys
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_admin_users_updated
    BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
