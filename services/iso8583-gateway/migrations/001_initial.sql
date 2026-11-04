-- ============================================================
-- PrimeStack ISO 8583 Gateway — Migration 001
--
-- The Network Gateway layer turns PrimeStack into a real
-- payment switch capable of speaking to external hosts.
--
-- Position in architecture:
--   Terminal → API Gateway → Switch Core
--     → ISO 8583 Gateway → [Host A | Host B | Processor]
--
-- This service owns:
--   - Host registry (IP, port, protocol, TLS config)
--   - Network sessions (persistent TCP/TLS connections)
--   - Message store (every inbound and outbound message)
--   - Message tracking (full lifecycle per transaction)
--   - Network health metrics (response times, success rates)
--   - Failover configuration (primary → secondary → tertiary)
--   - Connection pool state
--   - Transaction journal (immutable audit trail)
--
-- Note on actual ISO 8583 connectivity:
--   Real host connections to Visa, Mastercard, or bank processors
--   require: network agreements, certification testing, HSM for
--   MAC/PIN key management, and sponsor bank relationships.
--   This schema and code handles the technical layer correctly.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Hosts ─────────────────────────────────────────────────────
-- Registry of every external host we connect to.

CREATE TABLE hosts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    host_name       VARCHAR(100) NOT NULL UNIQUE,   -- "ACQUIRER_A_PROD"
    host_type       VARCHAR(20) NOT NULL
                        CHECK (host_type IN (
                            'ACQUIRER','ISSUER','PROCESSOR',
                            'SWITCH','INTERNAL','TEST'
                        )),
    protocol        VARCHAR(20) NOT NULL
                        CHECK (protocol IN (
                            'ISO8583_TCP','ISO8583_TLS',
                            'ISO8583_MQ','REST'
                        )),
    hostname        VARCHAR(255) NOT NULL,
    port            INT         NOT NULL,
    -- TLS configuration
    use_tls         BOOLEAN     NOT NULL DEFAULT TRUE,
    tls_verify      BOOLEAN     NOT NULL DEFAULT TRUE,
    cert_ref        VARCHAR(100),            -- ref to security-service cert
    -- ISO 8583 specifics
    header_length   SMALLINT    NOT NULL DEFAULT 2,    -- 2 or 4 byte length header
    encoding        VARCHAR(10) NOT NULL DEFAULT 'ASCII'
                        CHECK (encoding IN ('ASCII','EBCDIC','BCD')),
    -- Network management
    heartbeat_interval_sec INT  NOT NULL DEFAULT 30,
    reconnect_delay_sec    INT  NOT NULL DEFAULT 5,
    max_reconnect_attempts INT  NOT NULL DEFAULT 10,
    -- Connection pooling
    pool_size       SMALLINT    NOT NULL DEFAULT 5,
    -- Timeouts
    connect_timeout_ms INT      NOT NULL DEFAULT 10000,
    read_timeout_ms    INT      NOT NULL DEFAULT 30000,
    -- Status
    status          VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
                        CHECK (status IN (
                            'ONLINE','OFFLINE','DEGRADED',
                            'MAINTENANCE','CONNECTING','ERROR'
                        )),
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    last_connected  TIMESTAMPTZ,
    last_error      TEXT,
    -- Metadata
    description     TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hosts_type   ON hosts(host_type, active);
CREATE INDEX idx_hosts_status ON hosts(status);

-- ── Network Sessions ──────────────────────────────────────────
-- One row per active/recent TCP/TLS connection to a host.
-- Connection pools maintain multiple sessions per host.

CREATE TABLE network_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id         UUID        NOT NULL REFERENCES hosts(id),
    session_key     VARCHAR(50) NOT NULL UNIQUE,    -- "ACQUIRER_A_PROD:0" (pool slot)
    session_status  VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED'
                        CHECK (session_status IN (
                            'CONNECTED','DISCONNECTED',
                            'RECONNECTING','AUTHENTICATED','ERROR'
                        )),
    remote_addr     VARCHAR(50),
    local_port      INT,
    -- ISO 8583 session state
    last_stan       CHAR(6),             -- last STAN sent on this session
    pending_count   INT         NOT NULL DEFAULT 0,   -- in-flight messages
    -- Stats for this session
    messages_sent   BIGINT      NOT NULL DEFAULT 0,
    messages_recv   BIGINT      NOT NULL DEFAULT 0,
    errors          INT         NOT NULL DEFAULT 0,
    -- Timing
    connected_at    TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_host   ON network_sessions(host_id, session_status);
CREATE INDEX idx_sessions_status ON network_sessions(session_status);

-- ── Messages ──────────────────────────────────────────────────
-- Every ISO 8583 message sent or received — the raw record.

CREATE TABLE switch_messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       VARCHAR(100) NOT NULL,           -- tx_ref from switch-core
    mti             CHAR(4)     NOT NULL,             -- 0200, 0210, 0400, 0800 etc.
    direction       VARCHAR(10) NOT NULL
                        CHECK (direction IN ('INBOUND','OUTBOUND')),
    host_id         UUID        REFERENCES hosts(id),
    session_id      UUID        REFERENCES network_sessions(id),
    -- ISO 8583 fields (parsed)
    stan            CHAR(6),
    rrn             VARCHAR(20),
    amount          NUMERIC(20,4),
    currency        CHAR(3),
    processing_code CHAR(6),
    terminal_id     VARCHAR(20),
    merchant_id     VARCHAR(100),
    response_code   CHAR(2),
    auth_code       VARCHAR(10),
    -- Raw data
    raw_hex         TEXT,                            -- full message in hex
    parsed_fields   JSONB,                           -- all parsed ISO fields
    -- Status
    status          VARCHAR(20) NOT NULL DEFAULT 'RECEIVED'
                        CHECK (status IN (
                            'RECEIVED','PARSED','ROUTING',
                            'FORWARDED','RESPONDED','ERROR','TIMEOUT'
                        )),
    -- Timing
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    forwarded_at    TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    processing_ms   INT,
    -- Error
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_ref       ON switch_messages(reference);
CREATE INDEX idx_messages_mti       ON switch_messages(mti);
CREATE INDEX idx_messages_direction ON switch_messages(direction);
CREATE INDEX idx_messages_status    ON switch_messages(status);
CREATE INDEX idx_messages_stan      ON switch_messages(stan) WHERE stan IS NOT NULL;
CREATE INDEX idx_messages_time      ON switch_messages(received_at DESC);

-- ── Message Tracking ──────────────────────────────────────────
-- Full lifecycle trace per transaction. Nothing disappears.

CREATE TABLE transaction_journal (
    id              BIGSERIAL   PRIMARY KEY,
    reference       VARCHAR(100) NOT NULL,
    activity        TEXT        NOT NULL,
    data            JSONB,
    performed_by    VARCHAR(50) NOT NULL DEFAULT 'iso8583-gateway',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journal_ref  ON transaction_journal(reference);
CREATE INDEX idx_journal_time ON transaction_journal(created_at DESC);

-- ── Network Health ────────────────────────────────────────────
-- Health metrics per host, updated after every message exchange.

CREATE TABLE network_health (
    host_id              UUID    PRIMARY KEY REFERENCES hosts(id),
    response_time_ms     INT     NOT NULL DEFAULT 0,
    avg_response_time_ms INT     NOT NULL DEFAULT 0,
    min_response_time_ms INT,
    max_response_time_ms INT,
    successful_requests  BIGINT  NOT NULL DEFAULT 0,
    failed_requests      BIGINT  NOT NULL DEFAULT 0,
    timeout_count        BIGINT  NOT NULL DEFAULT 0,
    success_rate         NUMERIC(5,2) DEFAULT 100.00,
    last_check_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hourly health snapshots for trend analysis
CREATE TABLE network_health_history (
    id              BIGSERIAL   PRIMARY KEY,
    host_id         UUID        NOT NULL REFERENCES hosts(id),
    bucket_hour     TIMESTAMPTZ NOT NULL,
    avg_response_ms INT,
    success_count   INT         NOT NULL DEFAULT 0,
    failure_count   INT         NOT NULL DEFAULT 0,
    success_rate    NUMERIC(5,2),
    UNIQUE (host_id, bucket_hour)
);

CREATE INDEX idx_health_history_host ON network_health_history(host_id, bucket_hour DESC);

-- ── Failover Configuration ────────────────────────────────────

CREATE TABLE network_failover (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_host    UUID    NOT NULL REFERENCES hosts(id),
    secondary_host  UUID    NOT NULL REFERENCES hosts(id),
    priority        INT     NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_codes   TEXT[], -- ISO 8583 response codes that trigger failover e.g. ARRAY['91','92','96']
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (primary_host, priority)
);

CREATE INDEX idx_failover_primary ON network_failover(primary_host, is_active, priority);

-- ── Real-time Metrics ─────────────────────────────────────────

CREATE TABLE transaction_metrics (
    business_day    DATE        PRIMARY KEY,
    approved_count  BIGINT      NOT NULL DEFAULT 0,
    declined_count  BIGINT      NOT NULL DEFAULT 0,
    reversal_count  BIGINT      NOT NULL DEFAULT 0,
    timeout_count   BIGINT      NOT NULL DEFAULT 0,
    error_count     BIGINT      NOT NULL DEFAULT 0,
    total_volume    NUMERIC(20,4) NOT NULL DEFAULT 0,
    avg_response_ms INT         NOT NULL DEFAULT 0,
    peak_tps        INT         NOT NULL DEFAULT 0,
    success_rate    NUMERIC(5,2) GENERATED ALWAYS AS
                        (CASE WHEN (approved_count + declined_count) = 0 THEN 100.00
                         ELSE ROUND(100.0 * approved_count / (approved_count + declined_count), 2)
                         END) STORED,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Queue depth snapshots (every minute)
CREATE TABLE queue_depth_log (
    id              BIGSERIAL   PRIMARY KEY,
    pending_count   INT         NOT NULL,
    processing_count INT        NOT NULL,
    failed_count    INT         NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queue_log_time ON queue_depth_log(recorded_at DESC);

-- ── updated_at triggers ───────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_hosts_updated    BEFORE UPDATE ON hosts            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON network_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
