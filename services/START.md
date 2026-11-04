# PrimeStack Switch — How to Start

## Full stack with Docker

```bash
cd services

# Start all infrastructure + services
docker compose up --build

# Services come up in this order (enforced by healthchecks):
#   1. postgres + redis + rabbitmq
#   2. ledger-service       :4001
#   3. ip-whitelist-service  :4002
#   4. auth-service          :4003
#   5. security-service      :4011
#   6. terminal-service      :4004
#   7. risk-service          :4006
#   8. routing-service       :4012
#   9. transfer-service      :4005  (needs ledger + risk)
#  10. switch-core           :4010  (needs ledger + risk + routing)
#  11. settlement-service    :4008  (needs ledger)
#  12. notification-service   :4009
#  13. iso8583-gateway        :4013  (needs switch-core)
#  14. audit-service          :4007
#  15. api-gateway            :8080  (single external entry point)
```

## Individual service (development)

```bash
# 1. Start infrastructure
docker compose up postgres redis rabbitmq -d

# 2. Run the ledger service (foundation — start first)
cd services/ledger-service
npm install
npx tsx src/server.ts
# → [ledger-service] listening on port 4001

# 3. Run the security service (handles HMAC + API keys)
cd services/security-service
npm install
npx tsx src/server.ts
# → [security-service] listening on port 4011

# 4. Run the risk engine (Redis + PostgreSQL)
cd services/risk-service
npm install
npx tsx src/server.ts
# → [risk-service] listening on port 4006

# 5. Run the routing engine
cd services/routing-service
npm install
npx tsx src/server.ts
# → [routing-service] listening on port 4012

# 6. Run the switch core (the transaction engine)
cd services/switch-core
npm install
npx tsx src/server.ts
# → [switch-core] listening on port 4010

# 7. Run the API gateway (entry point)
cd services/api-gateway-service
npm install
npx tsx src/server.ts
# → [api-gateway] listening on port 8080
```

## Run migrations manually

```bash
# Each service has its own database
psql -U primestack -d primestack_ledger    -f ledger-service/migrations/001_initial.sql
psql -U primestack -d primestack_auth      -f auth-service/migrations/001_initial.sql
psql -U primestack -d primestack_security   -f security-service/migrations/001_initial.sql
psql -U primestack -d primestack_ipwl      -f ip-whitelist-service/migrations/001_initial.sql
psql -U primestack -d primestack_terminal   -f terminal-service/migrations/001_initial.sql
psql -U primestack -d primestack_terminal   -f terminal-service/migrations/002_tms.sql
psql -U primestack -d primestack_transfer   -f transfer-service/migrations/001_initial.sql
psql -U primestack -d primestack_risk       -f risk-service/migrations/001_initial.sql
psql -U primestack -d primestack_audit      -f audit-service/migrations/001_initial.sql
psql -U primestack -d primestack_settlement -f settlement-service/migrations/001_initial.sql
psql -U primestack -d primestack_settlement -f settlement-service/migrations/002_reconciliation.sql
psql -U primestack -d primestack_settlement -f settlement-service/migrations/003_full_settlement.sql
psql -U primestack -d primestack_notification -f notification-service/migrations/001_initial.sql
psql -U primestack -d primestack_routing    -f routing-service/migrations/001_initial.sql
psql -U primestack -d primestack_iso8583    -f iso8583-gateway/migrations/001_initial.sql
```

## Verify services are running

```bash
for port in 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010 4011 4012 4013 8080; do
  curl -s http://localhost:$port/health | head -1
  echo " (port $port)"
done
```

## Run all test suites

```bash
# 9 test suites, 94 tests total
cd services/ledger-service     && npm install && npm test    # 12 tests — ledger guarantees
cd services/transfer-service   && npm install && npm test    # 6 tests  — orchestration
cd services/risk-service       && npm install && npm test     # 12 tests — risk pipeline
cd services/routing-service    && npm install && npm test    # 12 tests — routing + failover
cd services/settlement-service && npm install && npm test   # 13 tests — settlement + EOD
cd services/switch-core        && npm install && npm test    # 10 tests — references + ISO
cd services/security-service  && npm install && npm test    # 12 tests — HMAC + bcrypt + RBAC
cd services/iso8583-gateway   && npm install && npm test     # 15 tests — parser round-trip
cd services/terminal-service   && npm install && npm test    # 18 tests — TMS lifecycle
```

## Service ports summary

| Port | Service | Phase | Purpose |
|------|---------|-------|---------|
| 4001 | ledger-service | 1 | Double-entry accounting (SERIALIZABLE) |
| 4002 | ip-whitelist-service | 1 | CIDR/INET network filtering |
| 4003 | auth-service | 1 | Legacy HMAC (use security-service) |
| 4004 | terminal-service | 1+8 | Terminal registry + full TMS |
| 4005 | transfer-service | 1 | Fund movement orchestration |
| 4006 | risk-service | 4 | Velocity/blacklist/scoring/AML |
| 4007 | audit-service | 1 | INSERT-ONLY compliance log |
| 4008 | settlement-service | 6 | Net settlement, NACHA, EOD, chargebacks |
| 4009 | notification-service | 1 | Multi-channel delivery + i18n |
| 4010 | switch-core | 2 | Transaction lifecycle engine |
| 4011 | security-service | 2 | API keys, HMAC, RBAC, key rotation |
| 4012 | routing-service | 5 | BIN routing, acquirer failover |
| 4013 | iso8583-gateway | 7 | Parser, builder, host connections |
| 8080 | api-gateway | Infra | Single external entry point |

## Create your first HMAC key

```bash
curl -X POST http://localhost:4011/hmac/keys \
  -H "Content-Type: application/json" \
  -d '{"label":"My first key"}'
# Response: { "data": { "clientId": "psk_...", "secret": "..." } }
# → SAVE THE SECRET — it will never be shown again
```

## Add your IP to the whitelist

```bash
curl -X POST http://localhost:4002/entries \
  -H "Content-Type: application/json" \
  -d '{"ipRange":"YOUR_IP/32","label":"My dev machine"}'
```

## Send your first transaction through the switch

```bash
# Sign and send via the API gateway
CLIENT_ID="psk_..."
SECRET="..."
TIMESTAMP=$(date +%s%3N)
BODY='{"txType":"WALLET","sourceAccount":"wallet-alice","destinationAccount":"wallet-bob","amount":"50","currency":"USD"}'
BODY_HASH=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)
PAYLOAD="POST\n/v1/transactions\n$TIMESTAMP\n$BODY_HASH"
SIGNATURE=$(echo -e "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST http://localhost:8080/v1/transactions \
  -H "Content-Type: application/json" \
  -H "x-primestack-client-id: $CLIENT_ID" \
  -H "x-primestack-timestamp: $TIMESTAMP" \
  -H "x-primestack-signature: $SIGNATURE" \
  -d "$BODY"

# Response: { "success": true, "data": { "txRef": "PS20261022000000001", "responseCode": "00", "approved": true } }
```

## Parse an ISO 8583 message

```bash
curl -X POST http://localhost:4013/parse \
  -H "Content-Type: application/json" \
  -d '{"hexMessage":"00080200..."}'
# Returns: { "mti": "0200", "fields": {"2":"4111...","4":"000000001000",...} }
```

## Run the EOD settlement cycle

```bash
curl -X POST http://localhost:4008/eod/run \
  -H "Content-Type: application/json" \
  -d '{"businessDate":"2026-10-22","runBy":"ops-admin"}'

# Returns: { "batchId": "...", "participantsSettled": 42, "totalVolume": "1250000.00" }
```
