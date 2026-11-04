-- ============================================================
-- PrimeStack Routing Engine — Migration 001 (Production)
--
-- The Routing Engine is the brain of the payment switch.
-- It decides WHERE a transaction goes after risk approval.
--
-- Without routing: you have a wallet.
-- With routing: you have a network.
--
-- Full switch flow:
--   Authentication → Risk → Routing → Ledger → Settlement
--
-- Routing resolves:
--   INTERNAL_T2T    — terminal to terminal on our network
--   INTERNAL_WALLET — wallet to wallet on our network
--   PROCESSOR       — external card processor (Visa, MC, etc.)
--   BANK            — direct bank integration
--   CRYPTO          — blockchain settlement
--   SETTLEMENT      — end-of-day batch settlement
--
-- Decision algorithm:
--   1. Merchant-specific route (highest priority)
--   2. Terminal-specific route
--   3. Routing rules match (BIN, currency, amount, card type, country)
--   4. Default catch-all route
--   5. No route → decline with code 92
--
-- Failover chain:
--   Primary → Secondary → Tertiary
--   If primary returns 91/92/96 or times out → try secondary
--   Response codes that trigger failover: 91, 92, 96 (system errors)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Connections registry ──────────────────────────────────────
-- Physical connection details for every endpoint the switch talks to.

CREATE TABLE connections (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_name VARCHAR(100) NOT NULL UNIQUE,
    protocol        VARCHAR(30) NOT NULL
                        CHECK (protocol IN (
                            'ISO8583_TCP','ISO8583_TLS',
                            'REST_HTTP','REST_HTTPS',
                            'TCP_SOCKET','MQ_AMQP',
                            'INTERNAL'
                        )),
    host            VARCHAR(255) NOT NULL,
    port            INT         NOT NULL,
    timeout_ms      INT         NOT NULL DEFAULT 10000,
    retries         INT         NOT NULL DEFAULT 1,
    use_tls         BOOLEAN     NOT NULL DEFAULT TRUE,
    -- TLS details (references to cert IDs in security-service)
    cert_ref        VARCHAR(100),        -- client cert reference
    ca_cert_ref     VARCHAR(100),        -- CA cert reference
    -- Connection pooling
    pool_size       INT         NOT NULL DEFAULT 5,
    keep_alive      BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Status
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Metadata
    description     TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_connections_protocol ON connections(protocol, active);

-- ── Routes ────────────────────────────────────────────────────
-- A route = one named destination, backed by a connection.
-- Routes are the units of routing table management.

CREATE TABLE routes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    route_name      VARCHAR(100) NOT NULL UNIQUE,
    route_type      VARCHAR(30) NOT NULL
                        CHECK (route_type IN (
                            'INTERNAL_T2T',
                            'INTERNAL_WALLET',
                            'INTERNAL_MERCHANT',
                            'PROCESSOR',
                            'BANK',
                            'CRYPTO',
                            'SETTLEMENT'
                        )),
    connection_id   UUID        REFERENCES connections(id),
    priority        INT         NOT NULL DEFAULT 100,  -- lower = higher priority
    -- Failover chain (up to 3 levels)
    failover_id     UUID        REFERENCES routes(id),  -- first failover
    -- Network details (for display/logging)
    destination     VARCHAR(255) NOT NULL,   -- human-readable: "Processor A (10.0.0.10:5000)"
    network         VARCHAR(20),              -- VISA, MASTERCARD, UNIONPAY, INTERNAL
    -- Status
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Stats (updated by health worker)
    success_rate    NUMERIC(5,2) DEFAULT 100.00,
    avg_response_ms INT,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routes_type     ON routes(route_type, active);
CREATE INDEX idx_routes_priority ON routes(priority) WHERE active = TRUE;
CREATE INDEX idx_routes_network  ON routes(network) WHERE network IS NOT NULL;

-- ── Route health ───────────────────────────────────────────────
-- Real-time health status per route. Updated by health check worker.

CREATE TABLE route_health (
    route_id        UUID        PRIMARY KEY REFERENCES routes(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN'
                        CHECK (status IN ('ONLINE','DEGRADED','OFFLINE','UNKNOWN','MAINTENANCE')),
    response_ms     INT,
    success_count   INT         NOT NULL DEFAULT 0,
    failure_count   INT         NOT NULL DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_error      TEXT,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_route_health_status ON route_health(status);

-- ── Routing rules ──────────────────────────────────────────────
-- Priority-ordered match rules. First matching rule wins.

CREATE TABLE routing_rules (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name       VARCHAR(100) NOT NULL,
    description     TEXT,
    priority        INT         NOT NULL DEFAULT 100,
    route_id        UUID        NOT NULL REFERENCES routes(id),
    -- Match criteria — NULL = wildcard (match any)
    tx_type         VARCHAR(30),              -- T2T, WALLET, MERCHANT, etc.
    currency        CHAR(3),
    card_bin        VARCHAR(8),               -- prefix match
    card_network    VARCHAR(20),              -- VISA, MC, AMEX, etc.
    country_code    CHAR(2),
    merchant_id     VARCHAR(100),
    min_amount      NUMERIC(20,4),
    max_amount      NUMERIC(20,4),
    -- Time window (NULL = any time)
    active_from     TIME,
    active_to       TIME,
    -- Status
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_priority   ON routing_rules(priority) WHERE is_active = TRUE;
CREATE INDEX idx_rules_tx_type    ON routing_rules(tx_type) WHERE tx_type IS NOT NULL;
CREATE INDEX idx_rules_currency   ON routing_rules(currency) WHERE currency IS NOT NULL;
CREATE INDEX idx_rules_bin        ON routing_rules(card_bin) WHERE card_bin IS NOT NULL;
CREATE INDEX idx_rules_merchant   ON routing_rules(merchant_id) WHERE merchant_id IS NOT NULL;

-- ── Merchant routes ────────────────────────────────────────────
-- Per-merchant route overrides. Always evaluated before global rules.

CREATE TABLE merchant_routes (
    merchant_id     VARCHAR(100) NOT NULL,
    route_id        UUID         NOT NULL REFERENCES routes(id),
    priority        INT          NOT NULL DEFAULT 1,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (merchant_id, route_id)
);

CREATE INDEX idx_merchant_routes ON merchant_routes(merchant_id, is_active, priority);

-- ── Terminal routes ────────────────────────────────────────────
-- Per-terminal route overrides (e.g. specific terminal uses a dedicated processor).

CREATE TABLE terminal_routes (
    terminal_id     VARCHAR(20)  NOT NULL,
    route_id        UUID         NOT NULL REFERENCES routes(id),
    priority        INT          NOT NULL DEFAULT 1,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (terminal_id, route_id)
);

CREATE INDEX idx_terminal_routes ON terminal_routes(terminal_id, is_active, priority);

-- ── Message queues ─────────────────────────────────────────────
-- Maps transaction types to RabbitMQ queues.

CREATE TABLE message_queues (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name      VARCHAR(100) NOT NULL UNIQUE,
    route_id        UUID         REFERENCES routes(id),
    tx_type         VARCHAR(30),
    description     TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO message_queues (queue_name, tx_type, description) VALUES
  ('t2t.transfer.queue',     'T2T',        'Terminal-to-terminal transfers'),
  ('wallet.transfer.queue',  'WALLET',     'Wallet-to-wallet transfers'),
  ('merchant.transfer.queue','MERCHANT',   'Merchant transfers'),
  ('settlement.queue',       'SETTLEMENT', 'Settlement batch processing'),
  ('reversal.queue',         'REVERSAL',   'Transaction reversals'),
  ('iso8583.inbound.queue',  'ISO8583',    'Inbound ISO 8583 messages'),
  ('iso8583.outbound.queue', 'ISO8583',    'Outbound ISO 8583 messages');

-- ── Routing decisions log (immutable) ─────────────────────────

CREATE TABLE routing_log (
    id              BIGSERIAL   PRIMARY KEY,
    tx_ref          VARCHAR(100) NOT NULL,
    tx_type         VARCHAR(30),
    merchant_id     VARCHAR(100),
    terminal_id     VARCHAR(20),
    route_id        UUID         REFERENCES routes(id),
    route_name      VARCHAR(100),
    route_type      VARCHAR(30),
    match_reason    VARCHAR(50),    -- 'MERCHANT_SPECIFIC','TERMINAL_SPECIFIC','RULE','DEFAULT'
    rule_id         UUID,
    failover_used   BOOLEAN     NOT NULL DEFAULT FALSE,
    failover_attempt SMALLINT   NOT NULL DEFAULT 0,
    decision_ms     INT,
    outcome         VARCHAR(20),    -- ROUTED, NO_ROUTE, FAILOVER
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routing_log_tx       ON routing_log(tx_ref);
CREATE INDEX idx_routing_log_route    ON routing_log(route_id);
CREATE INDEX idx_routing_log_merchant ON routing_log(merchant_id);
CREATE INDEX idx_routing_log_time     ON routing_log(created_at DESC);

-- ── Traffic analytics (hourly rollup) ─────────────────────────

CREATE TABLE traffic_stats (
    route_id        UUID        NOT NULL REFERENCES routes(id),
    bucket_hour     TIMESTAMPTZ NOT NULL,   -- truncated to hour
    tx_count        INT         NOT NULL DEFAULT 0,
    success_count   INT         NOT NULL DEFAULT 0,
    failure_count   INT         NOT NULL DEFAULT 0,
    total_amount    NUMERIC(20,4) NOT NULL DEFAULT 0,
    avg_response_ms INT,
    PRIMARY KEY (route_id, bucket_hour)
);

CREATE INDEX idx_traffic_stats_time ON traffic_stats(bucket_hour DESC);

-- ── Seed initial internal routes ──────────────────────────────

INSERT INTO connections (connection_name, protocol, host, port, description) VALUES
  ('internal-t2t',     'INTERNAL', 'internal', 0, 'Internal T2T processor'),
  ('internal-wallet',  'INTERNAL', 'internal', 0, 'Internal wallet processor'),
  ('internal-merchant','INTERNAL', 'internal', 0, 'Internal merchant processor');

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_connections_updated ON connections    BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_routes_updated      ON routes         BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rules_updated       ON routing_rules  BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION set_updated_at();
