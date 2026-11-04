-- ============================================================
-- PrimeStack Risk Engine — Migration 001 (Production)
--
-- Risk sits between Authentication and Ledger.
-- Every transaction MUST pass through here before a ledger
-- posting occurs. No exceptions.
--
-- Decision flow per transaction:
--   1. Blacklist check  → immediate BLOCK (no scoring)
--   2. Watchlist check  → add base score
--   3. Velocity check   → BLOCK if limit exceeded
--   4. Limit check      → BLOCK if amount > profile limits
--   5. Geo check        → BLOCK if country blocked
--   6. Device check     → score adjustment
--   7. Scoring engine   → composite 0–100 score
--   8. Decision         → APPROVE / REVIEW / DECLINE
--
-- Scoring thresholds (configurable per merchant):
--   0–29   APPROVE   (low risk)
--   30–69  REVIEW    (hold for manual approval)
--   70–100 DECLINE   (high risk)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Reference sequence for AML case numbers
CREATE SEQUENCE aml_case_seq START 1 INCREMENT 1 NO CYCLE;

-- ── Risk Profiles ─────────────────────────────────────────────
-- Per-merchant risk configuration. Controls limits and thresholds.

CREATE TABLE risk_profiles (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         VARCHAR(100) NOT NULL UNIQUE,
    daily_limit         NUMERIC(20,4) NOT NULL DEFAULT 1000000,
    monthly_limit       NUMERIC(20,4) NOT NULL DEFAULT 10000000,
    single_tx_limit     NUMERIC(20,4) NOT NULL DEFAULT 50000,
    -- Velocity controls
    velocity_limit      INT         NOT NULL DEFAULT 100,    -- max tx per window
    velocity_window_sec INT         NOT NULL DEFAULT 3600,   -- window in seconds
    -- Score thresholds (override global defaults)
    review_threshold    SMALLINT    NOT NULL DEFAULT 30,
    decline_threshold   SMALLINT    NOT NULL DEFAULT 70,
    -- Flags
    require_3ds         BOOLEAN     NOT NULL DEFAULT FALSE,
    allow_international BOOLEAN     NOT NULL DEFAULT TRUE,
    risk_level          VARCHAR(20) NOT NULL DEFAULT 'STANDARD'
                            CHECK (risk_level IN ('LOW','STANDARD','HIGH','CRITICAL')),
    active              BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_merchant ON risk_profiles(merchant_id, active);

-- ── Blacklist ─────────────────────────────────────────────────
-- Entities that are unconditionally blocked — no scoring, instant BLOCK.

CREATE TABLE blacklist (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    blacklist_type  VARCHAR(20) NOT NULL
                        CHECK (blacklist_type IN (
                            'IP','ACCOUNT','TERMINAL','MERCHANT',
                            'EMAIL','PHONE','DEVICE','CARD_BIN','COUNTRY'
                        )),
    value           TEXT        NOT NULL,
    reason          TEXT,
    source          VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
                        CHECK (source IN ('MANUAL','AUTOMATED','SANCTIONS_FEED','FRAUD_REPORT')),
    added_by        VARCHAR(100),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (blacklist_type, value)
);

CREATE INDEX idx_blacklist_lookup  ON blacklist(blacklist_type, value);
CREATE INDEX idx_blacklist_type    ON blacklist(blacklist_type);
CREATE INDEX idx_blacklist_expires ON blacklist(expires_at) WHERE expires_at IS NOT NULL;

-- ── Watchlist ─────────────────────────────────────────────────
-- Entities under monitoring — not blocked but affect the risk score.

CREATE TABLE watchlist (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     VARCHAR(30) NOT NULL,
    entity_value    VARCHAR(255) NOT NULL,
    score           SMALLINT    NOT NULL DEFAULT 20,   -- additive score penalty
    reason          TEXT,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_type, entity_value)
);

CREATE INDEX idx_watchlist_lookup ON watchlist(entity_type, entity_value);

-- ── Devices ───────────────────────────────────────────────────
-- Device fingerprints. New device = higher risk score.

CREATE TABLE devices (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_hash     VARCHAR(64) NOT NULL,              -- SHA-256 of fingerprint attributes
    merchant_id     VARCHAR(100),
    account_id      VARCHAR(100),
    -- Fingerprint components (stored for analysis)
    user_agent      TEXT,
    os              VARCHAR(50),
    browser         VARCHAR(50),
    language        VARCHAR(10),
    screen_res      VARCHAR(20),
    timezone        VARCHAR(50),
    ip_address      INET,
    -- Counts
    tx_count        INT         NOT NULL DEFAULT 0,
    fraud_count     INT         NOT NULL DEFAULT 0,
    is_trusted      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_blocked      BOOLEAN     NOT NULL DEFAULT FALSE,
    first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_devices_hash_merchant ON devices(device_hash, merchant_id);
CREATE INDEX idx_devices_account   ON devices(account_id);
CREATE INDEX idx_devices_blocked   ON devices(is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX idx_devices_last_seen ON devices(last_seen DESC);

-- ── Country Rules ─────────────────────────────────────────────
-- Geographic risk controls.

CREATE TABLE country_rules (
    country_code    CHAR(2)     PRIMARY KEY,
    country_name    VARCHAR(100),
    allowed         BOOLEAN     NOT NULL DEFAULT TRUE,
    risk_score      SMALLINT    NOT NULL DEFAULT 0,   -- additive score for transactions from/to
    require_3ds     BOOLEAN     NOT NULL DEFAULT FALSE,
    notes           TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with common countries
INSERT INTO country_rules (country_code, country_name, allowed, risk_score) VALUES
  ('US', 'United States',    TRUE,  0),
  ('GB', 'United Kingdom',   TRUE,  0),
  ('AE', 'UAE',              TRUE,  0),
  ('EU', 'European Union',   TRUE,  0),
  ('CA', 'Canada',           TRUE,  0),
  ('AU', 'Australia',        TRUE,  0),
  ('SG', 'Singapore',        TRUE,  0),
  ('NG', 'Nigeria',          TRUE,  15),
  ('GH', 'Ghana',            TRUE,  10),
  ('KE', 'Kenya',            TRUE,  10),
  ('RU', 'Russia',           TRUE,  25),
  ('CN', 'China',            TRUE,  20),
  ('XX', 'Unknown/Anonymous',FALSE, 100);

-- ── Velocity State ────────────────────────────────────────────
-- Persisted velocity counters (complement Redis for durability).
-- Redis is the primary check — this is the audit record.

CREATE TABLE velocity_events (
    id          BIGSERIAL   PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL,   -- ACCOUNT, IP, TERMINAL, MERCHANT, CARD
    entity_id   VARCHAR(255) NOT NULL,
    amount      NUMERIC(20,4) NOT NULL,
    currency    CHAR(3)     NOT NULL,
    tx_ref      VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_velocity_entity ON velocity_events(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_velocity_ts     ON velocity_events(created_at DESC);

-- Partition hint: for high volume, partition by month
-- PARTITION BY RANGE (created_at)

-- ── Manual Review Queue ───────────────────────────────────────
-- Transactions scoring 30–69 go here for human decision.

CREATE TABLE manual_review (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_ref VARCHAR(100) NOT NULL UNIQUE,
    merchant_id     VARCHAR(100),
    amount          NUMERIC(20,4) NOT NULL,
    currency        CHAR(3)     NOT NULL,
    risk_score      SMALLINT    NOT NULL,
    risk_factors    JSONB,                             -- what contributed to the score
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN (
                            'OPEN','ASSIGNED','APPROVED','REJECTED','EXPIRED'
                        )),
    assigned_to     UUID,
    decision_notes  TEXT,
    assigned_at     TIMESTAMPTZ,
    decided_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '4 hours',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_status    ON manual_review(status, created_at);
CREATE INDEX idx_review_merchant  ON manual_review(merchant_id);
CREATE INDEX idx_review_assigned  ON manual_review(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_review_expires   ON manual_review(expires_at) WHERE status = 'OPEN';

-- ── Risk Decisions (immutable) ────────────────────────────────
-- Every evaluation result logged here. Never updated.

CREATE TABLE risk_decisions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_ref          VARCHAR(100) NOT NULL,
    merchant_id     VARCHAR(100),
    amount          NUMERIC(20,4),
    currency        CHAR(3),
    decision        VARCHAR(10) NOT NULL
                        CHECK (decision IN ('APPROVE','REVIEW','DECLINE','BLOCK')),
    score           SMALLINT    NOT NULL,
    factors         JSONB       NOT NULL DEFAULT '{}',
    blacklist_hit   BOOLEAN     NOT NULL DEFAULT FALSE,
    watchlist_hit   BOOLEAN     NOT NULL DEFAULT FALSE,
    velocity_hit    BOOLEAN     NOT NULL DEFAULT FALSE,
    limit_hit       BOOLEAN     NOT NULL DEFAULT FALSE,
    geo_blocked     BOOLEAN     NOT NULL DEFAULT FALSE,
    new_device      BOOLEAN     NOT NULL DEFAULT FALSE,
    eval_ms         INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_decisions_tx       ON risk_decisions(tx_ref);
CREATE INDEX idx_decisions_decision ON risk_decisions(decision);
CREATE INDEX idx_decisions_score    ON risk_decisions(score DESC);
CREATE INDEX idx_decisions_merchant ON risk_decisions(merchant_id);
CREATE INDEX idx_decisions_ts       ON risk_decisions(created_at DESC);

-- ── AML Cases ────────────────────────────────────────────────
-- Anti-Money Laundering case management.

CREATE TABLE aml_cases (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number     VARCHAR(30) NOT NULL UNIQUE,       -- AML-20261022-000001
    transaction_ref VARCHAR(100),
    merchant_id     VARCHAR(100),
    entity_type     VARCHAR(30),                       -- ACCOUNT, MERCHANT, TERMINAL
    entity_id       VARCHAR(100),
    case_status     VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (case_status IN (
                            'OPEN','UNDER_REVIEW','ESCALATED','CLOSED','REPORTED'
                        )),
    risk_score      SMALLINT,
    total_amount    NUMERIC(20,4),
    currency        CHAR(3),
    investigator    UUID,
    remarks         TEXT,
    evidence        JSONB,
    -- SAR (Suspicious Activity Report) tracking
    sar_filed       BOOLEAN     NOT NULL DEFAULT FALSE,
    sar_reference   VARCHAR(50),
    sar_filed_at    TIMESTAMPTZ,
    -- Timestamps
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aml_status     ON aml_cases(case_status);
CREATE INDEX idx_aml_merchant   ON aml_cases(merchant_id);
CREATE INDEX idx_aml_entity     ON aml_cases(entity_type, entity_id);
CREATE INDEX idx_aml_sar        ON aml_cases(sar_filed) WHERE sar_filed = TRUE;

-- ── Risk Score Rules ──────────────────────────────────────────
-- Configurable scoring rules (loaded at startup, cached).

CREATE TABLE score_rules (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name       VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    condition_type  VARCHAR(30) NOT NULL,
    condition_value JSONB       NOT NULL,              -- {"min": 10000} or {"count": 5}
    score_impact    SMALLINT    NOT NULL,              -- points to add to score
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO score_rules (rule_name, description, condition_type, condition_value, score_impact) VALUES
  ('high_amount_10k',      'Amount > $10,000',             'AMOUNT_GT',    '{"value": 10000}',   20),
  ('high_amount_50k',      'Amount > $50,000',             'AMOUNT_GT',    '{"value": 50000}',   35),
  ('new_device',           'First time seeing this device', 'NEW_DEVICE',   '{}',                 20),
  ('new_ip',               'IP not seen in 30 days',       'NEW_IP',       '{"days": 30}',       15),
  ('country_mismatch',     'Country differs from profile',  'COUNTRY_MISMATCH', '{}',             20),
  ('high_velocity',        'Velocity > 80% of limit',      'VELOCITY_HIGH', '{"pct": 0.8}',      25),
  ('off_hours',            'Transaction outside 06:00–22:00', 'OFF_HOURS', '{}',                  10),
  ('round_number',         'Exact round amount (AML signal)', 'ROUND_AMOUNT', '{}',               10),
  ('new_merchant',         'Merchant < 30 days old',       'NEW_MERCHANT', '{"days": 30}',        15),
  ('international',        'Cross-border transaction',     'INTERNATIONAL', '{}',                  5);

-- ── Triggers ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON risk_profiles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_review_updated   BEFORE UPDATE ON manual_review  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_aml_updated      BEFORE UPDATE ON aml_cases      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-expire open review items
CREATE OR REPLACE FUNCTION expire_review_items()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE manual_review SET status = 'EXPIRED' WHERE status = 'OPEN' AND expires_at < NOW();
    RETURN NULL;
END;
$$;
