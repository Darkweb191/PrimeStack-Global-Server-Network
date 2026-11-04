-- ============================================================
-- PrimeStack Settlement Service — Migration 002
-- Enhanced reconciliation and financial reports
--
-- Settlement lifecycle:
--   Authorization → Ledger → Settlement Queue
--      → Settlement Processing → Reconciliation → Financial Reports
--
-- This migration adds:
--   - Position tracking (intraday + end-of-day)
--   - Reconciliation workflow (PENDING → MATCHED/MISMATCHED → RESOLVED)
--   - Adjustment records (disputes, corrections)
--   - Financial report snapshots
--   - Reversals tracking in settlement context
-- ============================================================

-- ── Intraday positions ────────────────────────────────────────
-- Running balance per merchant per currency throughout the day.
-- Updated atomically on every settlement batch item.

CREATE TABLE IF NOT EXISTS intraday_positions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     VARCHAR(100) NOT NULL,
    currency        CHAR(3)     NOT NULL,
    date            DATE        NOT NULL DEFAULT CURRENT_DATE,
    opening_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
    gross_credits   NUMERIC(20,4) NOT NULL DEFAULT 0,
    gross_debits    NUMERIC(20,4) NOT NULL DEFAULT 0,
    fees_charged    NUMERIC(20,4) NOT NULL DEFAULT 0,
    chargebacks     NUMERIC(20,4) NOT NULL DEFAULT 0,
    adjustments     NUMERIC(20,4) NOT NULL DEFAULT 0,
    closing_balance NUMERIC(20,4) GENERATED ALWAYS AS
                        (opening_balance + gross_credits - gross_debits - fees_charged - chargebacks + adjustments) STORED,
    is_closed       BOOLEAN     NOT NULL DEFAULT FALSE,  -- set at EOD processing
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (merchant_id, currency, date)
);

CREATE INDEX IF NOT EXISTS idx_positions_merchant ON intraday_positions(merchant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_positions_open     ON intraday_positions(is_closed) WHERE is_closed = FALSE;

-- ── Settlement adjustments ────────────────────────────────────
-- Manual corrections, fee adjustments, dispute credits/debits.

CREATE TABLE IF NOT EXISTS settlement_adjustments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID        REFERENCES settlement_batches(id),
    merchant_id     VARCHAR(100) NOT NULL,
    adjustment_type VARCHAR(30) NOT NULL
                        CHECK (adjustment_type IN (
                            'FEE_CORRECTION','CHARGEBACK_CREDIT',
                            'DISPUTE_DEBIT','INTERCHANGE_ADJUSTMENT',
                            'MANUAL_CREDIT','MANUAL_DEBIT','REFUND'
                        )),
    amount          NUMERIC(20,4) NOT NULL,
    currency        CHAR(3)     NOT NULL,
    description     TEXT        NOT NULL,
    reference       VARCHAR(100) NOT NULL UNIQUE,
    journal_entry_ref VARCHAR(100),
    applied_by      VARCHAR(100),
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adj_batch    ON settlement_adjustments(batch_id);
CREATE INDEX IF NOT EXISTS idx_adj_merchant ON settlement_adjustments(merchant_id);

-- ── End-of-day positions ──────────────────────────────────────
-- Snapshot of closing position per merchant per day.
-- Immutable once created.

CREATE TABLE IF NOT EXISTS eod_positions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     VARCHAR(100) NOT NULL,
    currency        CHAR(3)     NOT NULL,
    position_date   DATE        NOT NULL,
    opening_balance NUMERIC(20,4) NOT NULL,
    closing_balance NUMERIC(20,4) NOT NULL,
    net_movement    NUMERIC(20,4) NOT NULL,
    total_credits   NUMERIC(20,4) NOT NULL DEFAULT 0,
    total_debits    NUMERIC(20,4) NOT NULL DEFAULT 0,
    total_fees      NUMERIC(20,4) NOT NULL DEFAULT 0,
    total_chargebacks NUMERIC(20,4) NOT NULL DEFAULT 0,
    tx_count        INT         NOT NULL DEFAULT 0,
    journal_entry_ref VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (merchant_id, currency, position_date)
);

CREATE INDEX IF NOT EXISTS idx_eod_merchant ON eod_positions(merchant_id, position_date DESC);

-- ── Financial reports ──────────────────────────────────────────
-- Pre-computed report snapshots (daily, monthly, quarterly).

CREATE TABLE IF NOT EXISTS financial_reports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type     VARCHAR(20) NOT NULL
                        CHECK (report_type IN ('DAILY','MONTHLY','QUARTERLY','ANNUAL')),
    period_start    DATE        NOT NULL,
    period_end      DATE        NOT NULL,
    merchant_id     VARCHAR(100),             -- NULL = platform-wide
    currency        CHAR(3)     NOT NULL,
    total_volume    NUMERIC(20,4) NOT NULL DEFAULT 0,
    total_tx_count  INT         NOT NULL DEFAULT 0,
    approved_count  INT         NOT NULL DEFAULT 0,
    declined_count  INT         NOT NULL DEFAULT 0,
    reversal_count  INT         NOT NULL DEFAULT 0,
    chargeback_count INT        NOT NULL DEFAULT 0,
    gross_revenue   NUMERIC(20,4) NOT NULL DEFAULT 0,  -- fees collected
    net_payout      NUMERIC(20,4) NOT NULL DEFAULT 0,  -- paid to merchants
    report_data     JSONB,                               -- full breakdown
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_type, period_start, merchant_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_reports_type    ON financial_reports(report_type, period_start);
CREATE INDEX IF NOT EXISTS idx_reports_merchant ON financial_reports(merchant_id) WHERE merchant_id IS NOT NULL;

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_positions_updated
    BEFORE UPDATE ON intraday_positions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
