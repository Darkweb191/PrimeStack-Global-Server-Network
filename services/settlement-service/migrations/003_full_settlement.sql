-- ============================================================
-- PrimeStack Settlement Engine — Migration 003
-- Full Settlement & Reconciliation Schema
--
-- This is where money becomes final.
-- A transfer is a message. Settlement is the accounting event.
--
-- Architecture:
--   Authorization → Ledger Posting → Settlement Queue
--     → Settlement Processor → Settlement Accounts → Reconciliation
--
-- Settlement flow:
--   1. Approved transactions enter settlement_queue
--   2. Net positions computed per participant per business date
--   3. Single net settlement instruction per participant
--   4. Settlement accounts debited/credited
--   5. Reconciliation compares: Switch Ledger vs Settlement Ledger
--      vs Bank Statements vs Processor Reports
--   6. Exceptions queued for investigation
--   7. EOD: freeze day, generate batches, calc positions, reports
--
-- Key principle:
--   Every settlement operation posts a journal entry to the Ledger.
--   The settlement engine never modifies balances directly.
-- ============================================================

-- ── Settlement Accounts ───────────────────────────────────────
-- Every participant (merchant, processor, bank) has a settlement
-- account that tracks their position on the network.

CREATE TABLE IF NOT EXISTS settlement_accounts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_code    VARCHAR(50) NOT NULL UNIQUE,
    participant_type    VARCHAR(20) NOT NULL
                            CHECK (participant_type IN (
                                'MERCHANT','PROCESSOR','BANK','INTERNAL','ISSUER'
                            )),
    account_currency    CHAR(3)     NOT NULL DEFAULT 'USD',
    available_balance   NUMERIC(20,4) NOT NULL DEFAULT 0,
    reserved_balance    NUMERIC(20,4) NOT NULL DEFAULT 0,
    pending_credits     NUMERIC(20,4) NOT NULL DEFAULT 0,
    pending_debits      NUMERIC(20,4) NOT NULL DEFAULT 0,
    -- Limits
    overdraft_limit     NUMERIC(20,4) NOT NULL DEFAULT 0,
    daily_debit_limit   NUMERIC(20,4),
    -- Ledger link
    ledger_account_code VARCHAR(100),  -- mirrors a Ledger Service account
    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_available_non_negative CHECK (available_balance >= 0 - overdraft_limit)
);

CREATE INDEX idx_settlement_accts_type   ON settlement_accounts(participant_type, status);
CREATE INDEX idx_settlement_accts_status ON settlement_accounts(status);

-- ── Settlement Queue ───────────────────────────────────────────
-- Every approved transaction enters this queue awaiting settlement.
-- Items are batched by business date and participant.

CREATE TABLE IF NOT EXISTS settlement_queue (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       VARCHAR(100) NOT NULL UNIQUE,  -- tx_ref from switch
    source_code     VARCHAR(50) NOT NULL,           -- participant_code of sender
    dest_code       VARCHAR(50) NOT NULL,           -- participant_code of receiver
    amount          NUMERIC(20,4) NOT NULL,
    fee_amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    currency        CHAR(3)     NOT NULL DEFAULT 'USD',
    tx_type         VARCHAR(30),
    settlement_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (settlement_status IN (
                            'PENDING','PROCESSING','SETTLED','FAILED','RETRYING','EXCLUDED'
                        )),
    retry_count     SMALLINT    NOT NULL DEFAULT 0,
    max_retries     SMALLINT    NOT NULL DEFAULT 3,
    batch_id        UUID,       -- assigned when batched
    failure_reason  TEXT,
    business_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sq_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_sq_status       ON settlement_queue(settlement_status, business_date);
CREATE INDEX idx_sq_business_date ON settlement_queue(business_date);
CREATE INDEX idx_sq_source       ON settlement_queue(source_code);
CREATE INDEX idx_sq_dest         ON settlement_queue(dest_code);
CREATE INDEX idx_sq_batch        ON settlement_queue(batch_id) WHERE batch_id IS NOT NULL;

-- ── Net Positions ─────────────────────────────────────────────
-- Instead of settling each transaction individually, we net
-- all transactions per participant per business date.
-- TX1 +100, TX2 +50, TX3 -20, TX4 +30 → NET +160 (one settlement)

CREATE TABLE IF NOT EXISTS net_positions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id  UUID        NOT NULL REFERENCES settlement_accounts(id),
    participant_code VARCHAR(50) NOT NULL,
    business_date   DATE        NOT NULL,
    currency        CHAR(3)     NOT NULL,
    gross_credits   NUMERIC(20,4) NOT NULL DEFAULT 0,
    gross_debits    NUMERIC(20,4) NOT NULL DEFAULT 0,
    fees            NUMERIC(20,4) NOT NULL DEFAULT 0,
    net_amount      NUMERIC(20,4) GENERATED ALWAYS AS (gross_credits - gross_debits - fees) STORED,
    tx_count        INT         NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN','CALCULATED','SETTLED','FAILED')),
    batch_id        UUID,
    journal_entry_ref VARCHAR(100),
    calculated_at   TIMESTAMPTZ,
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (participant_id, business_date, currency)
);

CREATE INDEX idx_net_positions_date   ON net_positions(business_date, status);
CREATE INDEX idx_net_positions_part   ON net_positions(participant_id);
CREATE INDEX idx_net_positions_status ON net_positions(status);

-- ── Settlement Batches (enhanced) ────────────────────────────
-- Already exists from migration 001; add new columns via ALTER

ALTER TABLE settlement_batches
    ADD COLUMN IF NOT EXISTS settlement_date   DATE,
    ADD COLUMN IF NOT EXISTS settlement_type   VARCHAR(20) DEFAULT 'BATCH'
        CHECK (settlement_type IN ('BATCH','REAL_TIME','NET')),
    ADD COLUMN IF NOT EXISTS participant_count INT         DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_eod_batch      BOOLEAN     NOT NULL DEFAULT FALSE;

-- ── Reversals ─────────────────────────────────────────────────
-- A reversal undoes a settled transaction.
-- Requires a new journal entry in the Ledger.

CREATE TABLE IF NOT EXISTS reversals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reversal_ref    VARCHAR(100) NOT NULL UNIQUE,
    original_tx     VARCHAR(100) NOT NULL,  -- original tx_ref
    original_amount NUMERIC(20,4) NOT NULL,
    currency        CHAR(3)     NOT NULL,
    reason_code     VARCHAR(20),
    reason_desc     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN (
                            'PENDING','PROCESSING','COMPLETED','FAILED','REJECTED'
                        )),
    -- Reversal always requires a new journal entry
    journal_entry_ref VARCHAR(100),
    initiated_by    VARCHAR(100),
    approved_by     VARCHAR(100),
    initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reversals_original ON reversals(original_tx);
CREATE INDEX idx_reversals_status   ON reversals(status);

-- ── Chargebacks ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chargebacks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number     VARCHAR(30) NOT NULL UNIQUE,   -- CB-20261022-000001
    transaction_ref VARCHAR(100) NOT NULL,
    merchant_id     VARCHAR(100),
    amount          NUMERIC(20,4) NOT NULL,
    currency        CHAR(3)     NOT NULL DEFAULT 'USD',
    reason_code     VARCHAR(20),
    reason_desc     TEXT,
    -- Card network chargeback codes (Visa/MC)
    network_ref     VARCHAR(50),
    -- Status machine: OPEN → REPRESENTMENT → WON/LOST → CLOSED
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN (
                            'OPEN','REPRESENTMENT','PRE_ARBITRATION',
                            'WON','LOST','CLOSED','EXPIRED'
                        )),
    -- Evidence and decision
    evidence        JSONB,
    merchant_response TEXT,
    decision_notes  TEXT,
    -- Ledger link (debit merchant, credit chargeback reserve)
    journal_entry_ref VARCHAR(100),
    -- Deadlines
    response_deadline TIMESTAMPTZ,
    -- Staff
    assigned_to     UUID,
    -- Timestamps
    filed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at    TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE chargeback_seq START 1 NO CYCLE;

CREATE INDEX idx_cb_status     ON chargebacks(status);
CREATE INDEX idx_cb_merchant   ON chargebacks(merchant_id);
CREATE INDEX idx_cb_tx         ON chargebacks(transaction_ref);
CREATE INDEX idx_cb_deadline   ON chargebacks(response_deadline) WHERE status IN ('OPEN','REPRESENTMENT');

-- ── Reconciliation Records (enhanced) ────────────────────────

CREATE TABLE IF NOT EXISTS recon_records (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date       DATE        NOT NULL,
    source              VARCHAR(30) NOT NULL
                            CHECK (source IN (
                                'SWITCH_LEDGER','SETTLEMENT_LEDGER',
                                'BANK_STATEMENT','PROCESSOR_REPORT','MANUAL'
                            )),
    reference           VARCHAR(100) NOT NULL,
    participant_code    VARCHAR(50),
    switch_amount       NUMERIC(20,4),
    settlement_amount   NUMERIC(20,4),
    bank_amount         NUMERIC(20,4),
    difference          NUMERIC(20,4) GENERATED ALWAYS AS
                            (ABS(COALESCE(switch_amount,0) - COALESCE(settlement_amount,0))) STORED,
    currency            CHAR(3)     NOT NULL DEFAULT 'USD',
    recon_status        VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (recon_status IN (
                                'PENDING','MATCHED','MISMATCH','MISSING','EXCEPTION'
                            )),
    exception_reason    TEXT,
    resolved_by         VARCHAR(100),
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source, reference, business_date)
);

CREATE INDEX idx_recon_date       ON recon_records(business_date, recon_status);
CREATE INDEX idx_recon_status     ON recon_records(recon_status);
CREATE INDEX idx_recon_participant ON recon_records(participant_code);

-- ── Reconciliation Exceptions ─────────────────────────────────

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recon_id        UUID        REFERENCES recon_records(id),
    transaction_ref VARCHAR(100) NOT NULL,
    exception_type  VARCHAR(30) NOT NULL
                        CHECK (exception_type IN (
                            'AMOUNT_MISMATCH','MISSING_RECORD',
                            'DUPLICATE_SETTLEMENT','INVALID_CURRENCY',
                            'UNAUTHORIZED_DEBIT','TIMING_DIFFERENCE'
                        )),
    exception_reason TEXT       NOT NULL,
    switch_amount   NUMERIC(20,4),
    external_amount NUMERIC(20,4),
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED','ESCALATED')),
    assigned_to     VARCHAR(100),
    resolution      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exceptions_status ON reconciliation_exceptions(status);
CREATE INDEX idx_exceptions_tx     ON reconciliation_exceptions(transaction_ref);

-- ── Business Reports ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS business_reports (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date         DATE        NOT NULL,
    report_type         VARCHAR(20) NOT NULL DEFAULT 'DAILY'
                            CHECK (report_type IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY')),
    total_transactions  BIGINT      NOT NULL DEFAULT 0,
    approved_count      BIGINT      NOT NULL DEFAULT 0,
    declined_count      BIGINT      NOT NULL DEFAULT 0,
    reversal_count      BIGINT      NOT NULL DEFAULT 0,
    chargeback_count    BIGINT      NOT NULL DEFAULT 0,
    total_volume        NUMERIC(20,4) NOT NULL DEFAULT 0,
    settlement_volume   NUMERIC(20,4) NOT NULL DEFAULT 0,
    failed_transactions BIGINT      NOT NULL DEFAULT 0,
    total_fees          NUMERIC(20,4) NOT NULL DEFAULT 0,
    net_revenue         NUMERIC(20,4) NOT NULL DEFAULT 0,
    currency            CHAR(3)     NOT NULL DEFAULT 'USD',
    report_data         JSONB,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_date, report_type, currency)
);

CREATE INDEX idx_biz_reports_date ON business_reports(report_date DESC);

-- ── EOD State Machine ─────────────────────────────────────────
-- Tracks the end-of-day processing state to prevent duplicate runs.

CREATE TABLE IF NOT EXISTS eod_runs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date   DATE        NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'INITIATED'
                        CHECK (status IN (
                            'INITIATED','FREEZING','BATCHING',
                            'NETTING','RECONCILING','REPORTING','COMPLETED','FAILED'
                        )),
    step_results    JSONB,      -- progress per step
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    run_by          VARCHAR(100)
);

CREATE INDEX idx_eod_runs_date ON eod_runs(business_date DESC);

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_sa_updated    BEFORE UPDATE ON settlement_accounts      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sq_updated    BEFORE UPDATE ON settlement_queue          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_np_updated    BEFORE UPDATE ON net_positions             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rev_updated   BEFORE UPDATE ON reversals                 FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cb_updated    BEFORE UPDATE ON chargebacks               FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recon_updated BEFORE UPDATE ON recon_records             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_exc_updated   BEFORE UPDATE ON reconciliation_exceptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
