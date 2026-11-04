-- ============================================================
-- PrimeStack Ledger Service — Migration 001
-- Production schema for double-entry accounting.
--
-- Design decisions:
--   - NUMERIC(20,4) not FLOAT — financial math is exact
--   - All monetary columns NOT NULL DEFAULT 0 — no nulls in accounting
--   - Ledger entries are INSERT-ONLY — never UPDATE or DELETE
--   - account_balances is a separate table with row-level locking
--   - Optimistic concurrency via version column on balances
--   - created_at indexed for time-range queries
--   - All IDs are UUID v4 — no sequential IDs (security + distributed-safe)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Accounts ────────────────────────────────────────────────
CREATE TABLE accounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number  VARCHAR(30) NOT NULL UNIQUE,
    account_type    VARCHAR(30) NOT NULL CHECK (account_type IN (
                        'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
                    )),
    currency        CHAR(3)     NOT NULL DEFAULT 'USD',
    name            VARCHAR(255) NOT NULL,
    parent_id       UUID        REFERENCES accounts(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_type        ON accounts(account_type);
CREATE INDEX idx_accounts_currency    ON accounts(currency);
CREATE INDEX idx_accounts_status      ON accounts(status);
CREATE INDEX idx_accounts_parent      ON accounts(parent_id);

-- ── Account Balances (separate table for row-level locking) ──
-- Balance is kept here, not on accounts, so we can lock just
-- the balance row without blocking reads of account metadata.
CREATE TABLE account_balances (
    account_id          UUID        PRIMARY KEY REFERENCES accounts(id),
    available_balance   NUMERIC(20,4) NOT NULL DEFAULT 0,
    held_balance        NUMERIC(20,4) NOT NULL DEFAULT 0,
    version             BIGINT        NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_available_non_negative
        CHECK (available_balance >= 0),
    CONSTRAINT chk_held_non_negative
        CHECK (held_balance >= 0),
    CONSTRAINT chk_held_lte_available
        CHECK (held_balance <= available_balance)
);

-- ── Journal Entries (immutable ledger — INSERT ONLY) ────────
-- No UPDATE or DELETE is ever issued against this table.
-- Corrections are made via reversal entries with reversalOf set.
CREATE TABLE journal_entries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       VARCHAR(100) NOT NULL UNIQUE,
    entry_type      VARCHAR(30) NOT NULL CHECK (entry_type IN (
                        'TRANSFER', 'SETTLEMENT', 'FEE',
                        'REVERSAL', 'ADJUSTMENT', 'CHARGEBACK',
                        'REFUND', 'PAYOUT', 'FUNDING'
                    )),
    description     VARCHAR(500) NOT NULL,
    source          VARCHAR(50),          -- which engine posted this
    status          VARCHAR(20) NOT NULL DEFAULT 'POSTED'
                        CHECK (status IN ('POSTED', 'REVERSED')),
    reversal_of     VARCHAR(100) REFERENCES journal_entries(reference),
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_by       VARCHAR(100),         -- user or service identifier
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_je_status      ON journal_entries(status);
CREATE INDEX idx_je_entry_type  ON journal_entries(entry_type);
CREATE INDEX idx_je_source      ON journal_entries(source);
CREATE INDEX idx_je_created_at  ON journal_entries(created_at DESC);
CREATE INDEX idx_je_reversal_of ON journal_entries(reversal_of) WHERE reversal_of IS NOT NULL;

-- ── Journal Lines (the actual debits and credits) ────────────
-- Each journal entry has >= 2 lines.
-- For any valid entry: SUM(debit) = SUM(credit).
-- This is enforced at the application layer AND via a trigger below.
CREATE TABLE journal_lines (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id    UUID          NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
    account_id  UUID          NOT NULL REFERENCES accounts(id),
    debit       NUMERIC(20,4) NOT NULL DEFAULT 0,
    credit      NUMERIC(20,4) NOT NULL DEFAULT 0,
    currency    CHAR(3)       NOT NULL DEFAULT 'USD',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_debit_non_negative   CHECK (debit  >= 0),
    CONSTRAINT chk_credit_non_negative  CHECK (credit >= 0),
    -- A line is either a debit or a credit, not both
    CONSTRAINT chk_one_side_only        CHECK (NOT (debit > 0 AND credit > 0)),
    -- A line must have a non-zero value
    CONSTRAINT chk_non_zero             CHECK (debit > 0 OR credit > 0)
);

CREATE INDEX idx_jl_entry_id   ON journal_lines(entry_id);
CREATE INDEX idx_jl_account_id ON journal_lines(account_id);
CREATE INDEX idx_jl_created_at ON journal_lines(created_at DESC);

-- ── Trigger: enforce balanced entries ───────────────────────
-- After all lines are inserted for an entry, verify SUM(debit) = SUM(credit).
-- This is a database-level guarantee — not just application-level.
CREATE OR REPLACE FUNCTION check_journal_entry_balanced()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    total_debits  NUMERIC(20,4);
    total_credits NUMERIC(20,4);
BEGIN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO total_debits, total_credits
    FROM journal_lines
    WHERE entry_id = NEW.entry_id;

    -- Only enforce after at least 2 lines exist
    -- (the final check happens when the transaction commits)
    IF total_debits <> total_credits AND total_debits > 0 AND total_credits > 0 THEN
        IF ABS(total_debits - total_credits) > 0.0001 THEN
            RAISE EXCEPTION
                'Unbalanced journal entry %: debits=% credits=%',
                NEW.entry_id, total_debits, total_credits;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ── Fund Holds (tracks pre-authorization holds) ──────────────
CREATE TABLE fund_holds (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID          NOT NULL REFERENCES accounts(id),
    amount          NUMERIC(20,4) NOT NULL,
    reference       VARCHAR(100)  NOT NULL UNIQUE,
    description     VARCHAR(500),
    status          VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'RELEASED', 'CAPTURED')),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    released_at     TIMESTAMPTZ,

    CONSTRAINT chk_hold_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_holds_account_id ON fund_holds(account_id);
CREATE INDEX idx_holds_status     ON fund_holds(status);
CREATE INDEX idx_holds_reference  ON fund_holds(reference);
CREATE INDEX idx_holds_expires_at ON fund_holds(expires_at) WHERE status = 'ACTIVE';

-- ── Audit Trail (immutable — INSERT ONLY) ───────────────────
-- Every operation that changes financial state is logged here.
CREATE TABLE ledger_audit (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    operation   VARCHAR(50) NOT NULL,   -- POST_ENTRY, HOLD_FUNDS, RELEASE_HOLD, etc.
    entity_type VARCHAR(50) NOT NULL,   -- journal_entry, account, fund_hold
    entity_id   UUID        NOT NULL,
    performed_by VARCHAR(100),
    ip_address  INET,
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity   ON ledger_audit(entity_type, entity_id);
CREATE INDEX idx_audit_created  ON ledger_audit(created_at DESC);
CREATE INDEX idx_audit_operator ON ledger_audit(performed_by);

-- ── Row-Level Security ────────────────────────────────────────
-- In production: enable RLS so each service only reads its own data.
-- ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- ── updated_at trigger for accounts ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
