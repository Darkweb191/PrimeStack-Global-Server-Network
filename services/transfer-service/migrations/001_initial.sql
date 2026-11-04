-- ============================================================
-- PrimeStack Transfer Service — Migration 001
--
-- The transfer table records every fund movement request.
-- Actual balance changes happen in the Ledger Service.
-- This table is the business record; the ledger is the
-- financial record. They must always agree.
--
-- State machine:
--   INITIATED → VALIDATING → RISK_HOLD → PROCESSING → COMPLETED
--                                                    → FAILED
--                                                    → REVERSED
--
-- The journal_entry_ref links to the Ledger Service entry
-- that executed the actual balance change.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE transfers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_ref        VARCHAR(100) NOT NULL UNIQUE,   -- external idempotency key
    transfer_type       VARCHAR(20) NOT NULL
                            CHECK (transfer_type IN ('T2T','S2S','IP2IP','WALLET','MERCHANT','BULK')),
    status              VARCHAR(20) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','VALIDATING','RISK_HOLD',
                                'PROCESSING','COMPLETED','FAILED','REVERSED'
                            )),

    -- Source and destination
    source_type         VARCHAR(20) NOT NULL,            -- WALLET, TERMINAL, MERCHANT, BANK
    source_id           VARCHAR(100) NOT NULL,           -- address, TID, merchant code, etc.
    dest_type           VARCHAR(20) NOT NULL,
    dest_id             VARCHAR(100) NOT NULL,

    -- Financial
    amount              NUMERIC(20,4) NOT NULL,
    currency            CHAR(3)       NOT NULL DEFAULT 'USD',
    fee_amount          NUMERIC(20,4) NOT NULL DEFAULT 0,
    net_amount          NUMERIC(20,4) GENERATED ALWAYS AS (amount - fee_amount) STORED,

    -- Ledger link — set once the Ledger Service confirms posting
    journal_entry_ref   VARCHAR(100),

    -- Risk
    risk_score          SMALLINT,
    risk_level          VARCHAR(10),    -- LOW, MEDIUM, HIGH, CRITICAL
    risk_hold_reason    TEXT,

    -- Failure
    failure_code        VARCHAR(30),
    failure_reason      TEXT,

    -- Metadata
    description         TEXT,
    metadata            JSONB,
    initiated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    reversed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Financial integrity: net_amount must not be negative
    CONSTRAINT chk_amount_positive  CHECK (amount > 0),
    CONSTRAINT chk_fee_non_negative CHECK (fee_amount >= 0),
    CONSTRAINT chk_fee_lte_amount   CHECK (fee_amount <= amount)
);

CREATE INDEX idx_transfers_ref          ON transfers(transfer_ref);
CREATE INDEX idx_transfers_status       ON transfers(status);
CREATE INDEX idx_transfers_type         ON transfers(transfer_type);
CREATE INDEX idx_transfers_source       ON transfers(source_type, source_id);
CREATE INDEX idx_transfers_dest         ON transfers(dest_type, dest_id);
CREATE INDEX idx_transfers_created      ON transfers(created_at DESC);
CREATE INDEX idx_transfers_journal_ref  ON transfers(journal_entry_ref) WHERE journal_entry_ref IS NOT NULL;

-- Transfer state transitions log — every status change recorded
CREATE TABLE transfer_events (
    id              BIGSERIAL   PRIMARY KEY,
    transfer_id     UUID        NOT NULL REFERENCES transfers(id),
    from_status     VARCHAR(20),
    to_status       VARCHAR(20) NOT NULL,
    reason          TEXT,
    performed_by    VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfer_events_transfer ON transfer_events(transfer_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_transfers_updated
    BEFORE UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Transition trigger: log every status change
CREATE OR REPLACE FUNCTION log_transfer_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO transfer_events (transfer_id, from_status, to_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transfer_status_log
    AFTER UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION log_transfer_transition();
