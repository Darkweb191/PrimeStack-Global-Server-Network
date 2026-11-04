-- ============================================================
-- PrimeStack Notification Service — Migration 001
--
-- Handles all outbound communications:
--   EMAIL, SMS, WEBHOOK, IN_APP, PUSH
--
-- Delivery model:
--   1. Event arrives → create notification record (PENDING)
--   2. Worker picks it up → attempt delivery
--   3. Success → DELIVERED; Failure → increment attempt_count
--   4. After max_attempts → FAILED (no more retries)
--
-- Templates stored in DB for runtime editing without deploys.
-- Multi-language templates (en, fr, es, ar, pt).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Templates — one per (code, channel, language)
CREATE TABLE notification_templates (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(100) NOT NULL,          -- e.g. TRANSFER_COMPLETED
    channel     VARCHAR(20) NOT NULL
                    CHECK (channel IN ('EMAIL','SMS','WEBHOOK','IN_APP','PUSH')),
    language    CHAR(5)     NOT NULL DEFAULT 'en',
    subject     VARCHAR(255),                   -- email subject / push title
    body        TEXT        NOT NULL,           -- template with {{variable}} placeholders
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code, channel, language)
);

CREATE INDEX idx_templates_code ON notification_templates(code, channel, language);

-- Outbound notifications queue + delivery log
CREATE TABLE notifications (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Routing
    template_code   VARCHAR(100) NOT NULL,
    channel         VARCHAR(20) NOT NULL
                        CHECK (channel IN ('EMAIL','SMS','WEBHOOK','IN_APP','PUSH')),
    language        CHAR(5)     NOT NULL DEFAULT 'en',
    recipient       VARCHAR(500) NOT NULL,      -- email addr, phone, webhook URL, user_id
    -- Content (rendered at queue time)
    subject         VARCHAR(500),
    body            TEXT        NOT NULL,
    -- Association
    merchant_id     VARCHAR(100),
    entity_type     VARCHAR(50),                -- transfer, terminal, settlement
    entity_id       VARCHAR(100),
    -- Delivery tracking
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SENDING','DELIVERED','FAILED','CANCELLED')),
    attempt_count   SMALLINT    NOT NULL DEFAULT 0,
    max_attempts    SMALLINT    NOT NULL DEFAULT 3,
    last_error      TEXT,
    -- Webhook-specific: HMAC signature for delivery verification
    webhook_secret  TEXT,
    -- Timestamps
    scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_status    ON notifications(status, next_retry_at) WHERE status IN ('PENDING','SENDING');
CREATE INDEX idx_notifications_merchant  ON notifications(merchant_id);
CREATE INDEX idx_notifications_entity    ON notifications(entity_type, entity_id);
CREATE INDEX idx_notifications_created   ON notifications(created_at DESC);

-- Webhook endpoint registry
CREATE TABLE webhook_endpoints (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id VARCHAR(100) NOT NULL,
    url         TEXT        NOT NULL,
    secret      TEXT        NOT NULL,           -- HMAC secret for signing deliveries
    events      JSONB       NOT NULL DEFAULT '[]', -- subscribed event types
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    label       VARCHAR(100),
    failure_count INT       NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_merchant ON webhook_endpoints(merchant_id, is_active);

-- Webhook delivery attempts log
CREATE TABLE webhook_deliveries (
    id              BIGSERIAL   PRIMARY KEY,
    notification_id UUID        NOT NULL REFERENCES notifications(id),
    endpoint_id     UUID        NOT NULL REFERENCES webhook_endpoints(id),
    attempt_number  SMALLINT    NOT NULL,
    request_body    TEXT,
    request_headers JSONB,
    response_status INT,
    response_body   TEXT,
    duration_ms     INT,
    success         BOOLEAN     NOT NULL,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_notification ON webhook_deliveries(notification_id);
CREATE INDEX idx_deliveries_success      ON webhook_deliveries(success);

-- Seed default templates for all languages
INSERT INTO notification_templates (code, channel, language, subject, body) VALUES
-- English
('TRANSFER_COMPLETED','EMAIL','en','Transfer Completed','Your {{type}} transfer of {{amount}} {{currency}} has been completed. Reference: {{reference}}'),
('TRANSFER_FAILED','EMAIL','en','Transfer Failed','Your transfer of {{amount}} {{currency}} has failed. Reason: {{reason}}. Reference: {{reference}}'),
('TRANSFER_RISK_HOLD','EMAIL','en','Transfer Under Review','Your transfer of {{amount}} {{currency}} is under review. Reference: {{reference}}'),
('TERMINAL_OFFLINE','EMAIL','en','Terminal Offline Alert','Terminal {{tid}} has gone offline. Last seen: {{lastSeen}}'),
('SETTLEMENT_COMPLETED','EMAIL','en','Settlement Completed','Settlement batch {{batchNumber}} has been completed. Net amount: {{netAmount}} {{currency}}'),
('CHARGEBACK_FILED','EMAIL','en','Chargeback Filed','A chargeback of {{amount}} {{currency}} has been filed. Case: {{caseNumber}}'),
('KYC_APPROVED','EMAIL','en','KYC Approved','Your KYC verification has been approved.'),
('KYC_REJECTED','EMAIL','en','KYC Rejected','Your KYC verification was rejected. Reason: {{reason}}'),
('LOW_BALANCE','EMAIL','en','Low Balance Alert','Account {{accountCode}} balance ({{balance}}) is below the minimum threshold ({{minBalance}}).'),
-- French
('TRANSFER_COMPLETED','EMAIL','fr','Transfert Terminé','Votre transfert {{type}} de {{amount}} {{currency}} est terminé. Référence: {{reference}}'),
('TRANSFER_FAILED','EMAIL','fr','Transfert Échoué','Votre transfert de {{amount}} {{currency}} a échoué. Raison: {{reason}}'),
('TERMINAL_OFFLINE','EMAIL','fr','Terminal Hors Ligne','Le terminal {{tid}} est hors ligne. Dernière connexion: {{lastSeen}}'),
-- Spanish
('TRANSFER_COMPLETED','EMAIL','es','Transferencia Completada','Su transferencia {{type}} de {{amount}} {{currency}} ha sido completada. Referencia: {{reference}}'),
('TRANSFER_FAILED','EMAIL','es','Transferencia Fallida','Su transferencia de {{amount}} {{currency}} ha fallado. Motivo: {{reason}}'),
-- Arabic
('TRANSFER_COMPLETED','EMAIL','ar','تم إكمال التحويل','تم إكمال تحويل {{type}} بقيمة {{amount}} {{currency}}. المرجع: {{reference}}'),
('TRANSFER_FAILED','EMAIL','ar','فشل التحويل','فشل تحويلك بقيمة {{amount}} {{currency}}. السبب: {{reason}}'),
-- Portuguese
('TRANSFER_COMPLETED','EMAIL','pt','Transferência Concluída','Sua transferência {{type}} de {{amount}} {{currency}} foi concluída. Referência: {{reference}}'),
('TRANSFER_FAILED','EMAIL','pt','Transferência Falhou','Sua transferência de {{amount}} {{currency}} falhou. Motivo: {{reason}}'),
-- Webhook variants (language-agnostic)
('TRANSFER_COMPLETED','WEBHOOK','en','transfer.completed','{"event":"transfer.completed","data":{"reference":"{{reference}}","amount":"{{amount}}","currency":"{{currency}}","status":"COMPLETED"}}'),
('TRANSFER_FAILED','WEBHOOK','en','transfer.failed','{"event":"transfer.failed","data":{"reference":"{{reference}}","amount":"{{amount}}","currency":"{{currency}}","reason":"{{reason}}"}}'),
('TERMINAL_OFFLINE','WEBHOOK','en','terminal.offline','{"event":"terminal.offline","data":{"tid":"{{tid}}","lastSeen":"{{lastSeen}}"}}'),
('SETTLEMENT_COMPLETED','WEBHOOK','en','settlement.completed','{"event":"settlement.completed","data":{"batchNumber":"{{batchNumber}}","netAmount":"{{netAmount}}","currency":"{{currency}}"}}');

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_templates_updated  BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notif_updated      BEFORE UPDATE ON notifications           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_webhooks_updated   BEFORE UPDATE ON webhook_endpoints       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
