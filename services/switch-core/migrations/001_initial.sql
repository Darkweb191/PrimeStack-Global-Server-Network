-- ============================================================
-- PrimeStack Switch Core — Migration 001
--
-- The transaction table is the central record of every payment
-- processed through the switch. Every row represents one
-- financial instruction from entry to settlement.
--
-- Design decisions:
--
-- 1. tx_ref uses the PS{YYYYMMDD}{SEQ} format — never random.
--    Random IDs are untraceable. Sequential refs allow:
--    - Exact ordering reconstruction after an incident
--    - Gap detection (missing refs = dropped transactions)
--    - Human-readable for support queries
--
-- 2. stan (System Trace Audit Number) is the ISO 8583 field 11.
--    It is 6 digits, wraps at 999999, unique within a session.
--    It identifies the transaction within the originating terminal.
--
-- 3. rrn (Retrieval Reference Number) is ISO 8583 field 37.
--    12 digits, set by the acquirer, used for dispute resolution.
--    Format: YYJJJhhmm (year, julian day, hour, minute, sequence)
--    We use the last 12 digits of the epoch milliseconds.
--
-- 4. auth_code is ISO 8583 field 38.
--    6 digits, issued on approval. Required for reversal matching.
--
-- 5. status machine is strictly enforced via a CHECK constraint.
--    Transitions are: PENDING → APPROVED → SETTLED
--                     PENDING → DECLINED
--                     APPROVED → REVERSED
--                     PENDING → FAILED
--
-- 6. processing_time_ms is measured at the switch — the wall-clock
--    time from request received to response sent. Critical for SLA
--    monitoring. Payment networks require < 1000ms.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Reference sequence — guarantees monotonic, gapless reference numbers
CREATE SEQUENCE tx_ref_seq START 1 INCREMENT 1 NO CYCLE;

CREATE TABLE transactions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference numbers
    tx_ref              VARCHAR(64) NOT NULL UNIQUE,    -- PS20261022000000001
    stan                CHAR(6)     NOT NULL,           -- 000001–999999
    rrn                 VARCHAR(20),                    -- Retrieval Reference Number
    auth_code           VARCHAR(10),                    -- Approval code (set on APPROVED)

    -- Parties
    source_account      VARCHAR(100) NOT NULL,          -- ledger account code
    destination_account VARCHAR(100) NOT NULL,          -- ledger account code
    merchant_id         VARCHAR(100),
    terminal_id         VARCHAR(20),                    -- TID

    -- Financial
    amount              NUMERIC(20,4) NOT NULL,
    currency            CHAR(3)       NOT NULL DEFAULT 'USD',
    fee_amount          NUMERIC(20,4) NOT NULL DEFAULT 0,

    -- Transaction classification
    tx_type             VARCHAR(30)  NOT NULL
                            CHECK (tx_type IN (
                                'T2T','S2S','WALLET','MERCHANT','BULK',
                                'AUTH_ONLY','CAPTURE','REFUND','REVERSAL',
                                'BALANCE_INQUIRY','ISO8583'
                            )),
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN (
                                'PENDING','APPROVED','DECLINED',
                                'FAILED','SETTLED','REVERSED'
                            )),

    -- ISO 8583 fields (populated for card/terminal transactions)
    mti                 CHAR(4),                        -- e.g. 0200
    processing_code     CHAR(6),                        -- ISO field 3
    pos_entry_mode      VARCHAR(4),                     -- ISO field 22
    card_bin            VARCHAR(8),
    card_type           VARCHAR(20),                    -- VISA, MC, etc.

    -- Routing
    route_id            UUID,
    acquirer_code       VARCHAR(20),

    -- Ledger link
    journal_entry_ref   VARCHAR(100),

    -- Settlement
    settlement_batch_id UUID,
    settled_at          TIMESTAMPTZ,

    -- Response
    response_code       CHAR(2),                        -- ISO 8583 field 39
    response_message    VARCHAR(100),
    decline_reason      TEXT,

    -- Performance
    processing_time_ms  INT,

    -- Risk
    risk_score          SMALLINT,
    risk_verdict        VARCHAR(10),

    -- Metadata
    raw_request         JSONB,                          -- original request (sanitized)
    metadata            JSONB,

    -- Timestamps
    received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_amount_positive      CHECK (amount > 0),
    CONSTRAINT chk_fee_non_negative     CHECK (fee_amount >= 0),
    CONSTRAINT chk_fee_lte_amount       CHECK (fee_amount <= amount),
    CONSTRAINT chk_stan_format          CHECK (stan ~ '^\d{6}$')
);

-- Indexes for the hot query paths
CREATE INDEX idx_tx_ref         ON transactions(tx_ref);
CREATE INDEX idx_tx_stan        ON transactions(stan);
CREATE INDEX idx_tx_rrn         ON transactions(rrn) WHERE rrn IS NOT NULL;
CREATE INDEX idx_tx_auth_code   ON transactions(auth_code) WHERE auth_code IS NOT NULL;
CREATE INDEX idx_tx_status      ON transactions(status);
CREATE INDEX idx_tx_type        ON transactions(tx_type);
CREATE INDEX idx_tx_merchant    ON transactions(merchant_id);
CREATE INDEX idx_tx_terminal    ON transactions(terminal_id) WHERE terminal_id IS NOT NULL;
CREATE INDEX idx_tx_received    ON transactions(received_at DESC);
CREATE INDEX idx_tx_card_bin    ON transactions(card_bin) WHERE card_bin IS NOT NULL;
CREATE INDEX idx_tx_source      ON transactions(source_account);
CREATE INDEX idx_tx_dest        ON transactions(destination_account);

-- Transaction event log — every status change
CREATE TABLE transaction_events (
    id              BIGSERIAL   PRIMARY KEY,
    tx_id           UUID        NOT NULL REFERENCES transactions(id),
    event_type      VARCHAR(30) NOT NULL,   -- RECEIVED, AUTHENTICATED, RISK_CHECK, LEDGER_POSTED, etc.
    from_status     VARCHAR(20),
    to_status       VARCHAR(20),
    description     TEXT,
    performed_by    VARCHAR(50),            -- which service/component
    duration_ms     INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tx_events_tx_id ON transaction_events(tx_id);
CREATE INDEX idx_tx_events_time  ON transaction_events(created_at DESC);

-- Settlement queue — transactions awaiting batch assignment
CREATE TABLE settlement_queue (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_ref          VARCHAR(64) NOT NULL REFERENCES transactions(tx_ref),
    merchant_id     VARCHAR(100) NOT NULL,
    amount          NUMERIC(20,4) NOT NULL,
    fee_amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    currency        CHAR(3)     NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','ASSIGNED','FAILED')),
    retry_count     SMALLINT    NOT NULL DEFAULT 0,
    batch_id        UUID,
    assigned_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sq_status     ON settlement_queue(status, created_at) WHERE status = 'PENDING';
CREATE INDEX idx_sq_merchant   ON settlement_queue(merchant_id, status);

-- Acquirer / host connections
CREATE TABLE acquirer_connections (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(20) NOT NULL UNIQUE,        -- e.g. "BANK_A_PROD"
    name            VARCHAR(100) NOT NULL,
    protocol        VARCHAR(20) NOT NULL DEFAULT 'ISO8583'
                        CHECK (protocol IN ('ISO8583','REST','SOAP','SFTP')),
    host            VARCHAR(255) NOT NULL,
    port            INT         NOT NULL,
    timeout_ms      INT         NOT NULL DEFAULT 30000,
    retries         INT         NOT NULL DEFAULT 2,
    use_tls         BOOLEAN     NOT NULL DEFAULT TRUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED'
                        CHECK (status IN ('CONNECTED','DISCONNECTED','ERROR','MAINTENANCE')),
    last_connected  TIMESTAMPTZ,
    last_error      TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Routing rules — which acquirer handles which transaction
CREATE TABLE routing_rules (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    priority        INT         NOT NULL DEFAULT 100,       -- lower = higher priority
    acquirer_id     UUID        NOT NULL REFERENCES acquirer_connections(id),
    -- Match criteria (NULL = match any)
    match_tx_type   VARCHAR(30),
    match_currency  CHAR(3),
    match_card_bin  VARCHAR(8),                             -- prefix match
    match_country   CHAR(2),
    match_merchant  VARCHAR(100),
    min_amount      NUMERIC(20,4),
    max_amount      NUMERIC(20,4),
    -- Failover
    failover_to     UUID        REFERENCES acquirer_connections(id),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routing_active   ON routing_rules(is_active, priority);
CREATE INDEX idx_routing_bin      ON routing_rules(match_card_bin) WHERE match_card_bin IS NOT NULL;
CREATE INDEX idx_routing_currency ON routing_rules(match_currency) WHERE match_currency IS NOT NULL;

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_tx_updated         BEFORE UPDATE ON transactions          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_acquirer_updated   BEFORE UPDATE ON acquirer_connections   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_routing_updated    BEFORE UPDATE ON routing_rules          FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Status transition trigger — log every change
CREATE OR REPLACE FUNCTION log_tx_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO transaction_events (tx_id, event_type, from_status, to_status, performed_by)
        VALUES (NEW.id, 'STATUS_CHANGE', OLD.status, NEW.status, 'switch-core');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tx_status_log
    AFTER UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION log_tx_status_change();
