-- ============================================================
-- PrimeStack Settlement Service — Migration 001
--
-- Settlement is the process of netting all completed transfers
-- for a period and producing the actual bank movement instructions.
--
-- Key concepts:
--   settlement_batches  — one batch per merchant per period
--   settlement_items    — one row per transfer in the batch
--   bank_file_exports   — the actual file sent to the bank
--   reconciliation_records — matching internal vs external
--
-- State machine for a batch:
--   OPEN → PROCESSING → COMPLETED → RECONCILED
--                     → FAILED
--
-- Settlement does NOT move money directly.
-- It calls the Ledger Service to post the settlement journal entry.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE settlement_batches (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number        VARCHAR(50) NOT NULL UNIQUE,
    merchant_id         VARCHAR(100) NOT NULL,
    merchant_code       VARCHAR(50)  NOT NULL,
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    currency            CHAR(3)     NOT NULL DEFAULT 'USD',
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN','PROCESSING','COMPLETED','FAILED','RECONCILED')),
    -- Financial totals
    gross_amount        NUMERIC(20,4) NOT NULL DEFAULT 0,
    total_fees          NUMERIC(20,4) NOT NULL DEFAULT 0,
    chargebacks         NUMERIC(20,4) NOT NULL DEFAULT 0,
    adjustments         NUMERIC(20,4) NOT NULL DEFAULT 0,
    net_amount          NUMERIC(20,4) GENERATED ALWAYS AS
                            (gross_amount - total_fees - chargebacks + adjustments) STORED,
    item_count          INT          NOT NULL DEFAULT 0,
    -- Ledger link
    journal_entry_ref   VARCHAR(100),
    -- Bank payout details
    bank_account_id     VARCHAR(100),
    bank_reference      VARCHAR(100),
    -- Timestamps
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_started  TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_period_order    CHECK (period_end > period_start),
    CONSTRAINT chk_gross_positive  CHECK (gross_amount >= 0),
    CONSTRAINT chk_fees_positive   CHECK (total_fees >= 0)
);

CREATE INDEX idx_batches_merchant ON settlement_batches(merchant_id, status);
CREATE INDEX idx_batches_period   ON settlement_batches(period_start, period_end);
CREATE INDEX idx_batches_status   ON settlement_batches(status);

CREATE TABLE settlement_items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID        NOT NULL REFERENCES settlement_batches(id),
    transfer_ref    VARCHAR(100) NOT NULL,
    item_type       VARCHAR(20) NOT NULL DEFAULT 'TRANSFER'
                        CHECK (item_type IN ('TRANSFER','CHARGEBACK','REVERSAL','FEE','ADJUSTMENT')),
    amount          NUMERIC(20,4) NOT NULL,
    fee_amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    net_amount      NUMERIC(20,4) GENERATED ALWAYS AS (amount - fee_amount) STORED,
    currency        CHAR(3)     NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_item_amount_positive CHECK (amount > 0),
    UNIQUE (batch_id, transfer_ref)
);

CREATE INDEX idx_items_batch       ON settlement_items(batch_id);
CREATE INDEX idx_items_transfer    ON settlement_items(transfer_ref);

-- Bank file exports — the actual instructions sent to the bank
CREATE TABLE bank_file_exports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID        NOT NULL REFERENCES settlement_batches(id),
    file_format     VARCHAR(20) NOT NULL DEFAULT 'NACHA'
                        CHECK (file_format IN ('NACHA','SWIFT','SEPA','LOCAL')),
    file_content    TEXT        NOT NULL,          -- The actual file content
    file_hash       CHAR(64)    NOT NULL,          -- SHA-256 of file_content for integrity
    line_count      INT         NOT NULL DEFAULT 0,
    total_amount    NUMERIC(20,4) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'GENERATED'
                        CHECK (status IN ('GENERATED','TRANSMITTED','CONFIRMED','REJECTED')),
    transmitted_at  TIMESTAMPTZ,
    confirmed_at    TIMESTAMPTZ,
    bank_response   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exports_batch  ON bank_file_exports(batch_id);
CREATE INDEX idx_exports_status ON bank_file_exports(status);

-- Reconciliation records — match internal data against external bank statements
CREATE TABLE reconciliation_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID        REFERENCES settlement_batches(id),
    source          VARCHAR(30) NOT NULL,           -- INTERNAL, BANK, PROCESSOR
    reference       VARCHAR(100) NOT NULL,
    expected_amount NUMERIC(20,4) NOT NULL,
    actual_amount   NUMERIC(20,4) NOT NULL,
    difference      NUMERIC(20,4) GENERATED ALWAYS AS
                        (ABS(expected_amount - actual_amount)) STORED,
    currency        CHAR(3)     NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','MATCHED','MISMATCHED','RESOLVED','ESCALATED')),
    notes           TEXT,
    resolved_by     VARCHAR(100),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recon_batch    ON reconciliation_records(batch_id);
CREATE INDEX idx_recon_status   ON reconciliation_records(status);
CREATE INDEX idx_recon_ref      ON reconciliation_records(reference);

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_batches_updated BEFORE UPDATE ON settlement_batches        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recon_updated   BEFORE UPDATE ON reconciliation_records    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
