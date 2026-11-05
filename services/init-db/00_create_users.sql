-- ============================================================
-- PrimeStack — Database Users and Schemas
--
-- Each service gets its own PostgreSQL user with CONNECT
-- and USAGE only on its own schema.
-- No service can read another service's tables.
-- ============================================================

-- Ledger Service
CREATE USER ledger_svc WITH PASSWORD 'ledger_secret';
CREATE DATABASE primestack_ledger OWNER ledger_svc;
GRANT CONNECT ON DATABASE primestack_ledger TO ledger_svc;

-- IP Whitelist Service
CREATE USER ipwl_svc WITH PASSWORD 'ipwl_secret';
CREATE DATABASE primestack_ipwl OWNER ipwl_svc;
GRANT CONNECT ON DATABASE primestack_ipwl TO ipwl_svc;

-- Auth Service
CREATE USER auth_svc WITH PASSWORD 'auth_secret';
CREATE DATABASE primestack_auth OWNER auth_svc;
GRANT CONNECT ON DATABASE primestack_auth TO auth_svc;

-- Terminal Service
CREATE USER terminal_svc WITH PASSWORD 'terminal_secret';
CREATE DATABASE primestack_terminal OWNER terminal_svc;
GRANT CONNECT ON DATABASE primestack_terminal TO terminal_svc;

-- Transfer Service
CREATE USER transfer_svc WITH PASSWORD 'transfer_secret';
CREATE DATABASE primestack_transfer OWNER transfer_svc;
GRANT CONNECT ON DATABASE primestack_transfer TO transfer_svc;

-- Risk Service
CREATE USER risk_svc WITH PASSWORD 'risk_secret';
CREATE DATABASE primestack_risk OWNER risk_svc;
GRANT CONNECT ON DATABASE primestack_risk TO risk_svc;

-- Settlement Service
CREATE USER settlement_svc WITH PASSWORD 'settlement_secret';
CREATE DATABASE primestack_settlement OWNER settlement_svc;
GRANT CONNECT ON DATABASE primestack_settlement TO settlement_svc;

-- Notification Service
CREATE USER notification_svc WITH PASSWORD 'notification_secret';
CREATE DATABASE primestack_notification OWNER notification_svc;
GRANT CONNECT ON DATABASE primestack_notification TO notification_svc;

-- Audit Service
CREATE USER audit_svc WITH PASSWORD 'audit_secret';
CREATE DATABASE primestack_audit OWNER audit_svc;
GRANT CONNECT ON DATABASE primestack_audit TO audit_svc;

-- Switch Core Service
CREATE USER switch_svc WITH PASSWORD 'switch_secret';
CREATE DATABASE primestack_switch OWNER switch_svc;
GRANT CONNECT ON DATABASE primestack_switch TO switch_svc;

-- Security Service
CREATE USER security_svc WITH PASSWORD 'security_secret';
CREATE DATABASE primestack_security OWNER security_svc;
GRANT CONNECT ON DATABASE primestack_security TO security_svc;

-- Routing Service
CREATE USER routing_svc WITH PASSWORD 'routing_secret';
CREATE DATABASE primestack_routing OWNER routing_svc;
GRANT CONNECT ON DATABASE primestack_routing TO routing_svc;

-- ISO 8583 Gateway
CREATE USER iso8583_svc WITH PASSWORD 'iso8583_secret';
CREATE DATABASE primestack_iso8583 OWNER iso8583_svc;
GRANT CONNECT ON DATABASE primestack_iso8583 TO iso8583_svc;
