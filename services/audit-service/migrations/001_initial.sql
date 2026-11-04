-- ============================================================
-- PrimeStack Audit Service — Migration 001
--
-- The audit log is INSERT-ONLY. No UPDATE, no DELETE.
-- It is the compliance and forensic record for the platform.
--
-- In production: this table should be in a separate database
-- instance with a write-only service account. Even the audit
-- service itself should only have INSERT + SELECT, never UPDATE.
--
-- For long-term retention: partition by month and archive
-- to object storage (S3, GCS) after 90 days.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE audit_events (
    id              BIGSERIAL   PRIMARY KEY,
    -- WHO
    actor_type      VARCHAR(30) NOT NULL,    -- SERVICE, ADMIN_USER, API_CLIENT, SYSTEM
    actor_id        VARCHAR(100),            -- service name, user_id, client_id
    actor_ip        INET,
    -- WHAT
    event_type      VARCHAR(50) NOT NULL,    -- TRANSFER_INITIATED, TRANSFER_COMPLETED, etc.
    severity        VARCHAR(10) NOT NULL DEFAULT 'INFO'
                        CHECK (severity IN ('DEBUG','INFO','WARN','ERROR','CRITICAL')),
    -- WHERE (which resource was affected)
    resource_type   VARCHAR(50),             -- transfer, terminal, account, user, etc.
    resource_id     VARCHAR(100),
    -- DETAILS
    description     TEXT        NOT NULL,
    before_state    JSONB,                   -- state before the action
    after_state     JSONB,                   -- state after the action
    metadata        JSONB,
    -- WHEN
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition strategy: audit_events_2026_01, audit_events_2026_02, etc.
-- For now use a single table with indexes.
CREATE INDEX idx_audit_actor      ON audit_events(actor_type, actor_id);
CREATE INDEX idx_audit_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_resource   ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_occurred   ON audit_events(occurred_at DESC);
CREATE INDEX idx_audit_severity   ON audit_events(severity) WHERE severity IN ('WARN','ERROR','CRITICAL');

-- Suspicious activity flags (for SAR reporting)
CREATE TABLE suspicious_activity_reports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       VARCHAR(100) NOT NULL UNIQUE,    -- SAR reference number
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       VARCHAR(100) NOT NULL,
    description     TEXT        NOT NULL,
    evidence        JSONB,
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN','UNDER_REVIEW','FILED','CLOSED')),
    filed_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
