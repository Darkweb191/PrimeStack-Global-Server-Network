---
inclusion: always
---

# PrimeStack Switch — Project Context

## What This Is
A production-grade **TypeScript + Fastify + PostgreSQL + Redis** payment switch and asset gateway. It is a modular monolith — one deployable, clean module boundaries, designed to extract to microservices when needed.

## Architecture: the Ledger is everything
Every financial operation — transfer, settlement, fee, chargeback, reversal — creates an **immutable double-entry journal entry** in PostgreSQL. No orphaned data. No silent failures. The ledger is at `src/modules/ledger/`.

## Tech Stack
- **Runtime**: Node.js 24 + TypeScript 5
- **Framework**: Fastify 4 with fp plugins
- **ORM**: Prisma 5 (PostgreSQL)
- **Cache/Queue**: Redis via ioredis
- **Validation**: Zod
- **i18n**: i18next (en, fr, es, ar, pt)
- **Auth**: HMAC-SHA256 (API) + JWT (Admin)
- **Financial math**: decimal.js (28-digit, banker's rounding)
- **Logging**: Pino structured JSON logs

## Module Map (15 modules)
| Module | Path | Routes |
|--------|------|--------|
| Ledger | `src/modules/ledger/` | `/ledger/*` |
| Wallet | `src/modules/wallet/` | `/wallets/*` |
| Transfer | `src/modules/transfer/` | `/transfers/*` |
| Admin | `src/modules/admin/` | `/admin/*` |
| ISO 8583 | `src/modules/iso8583/` | `/iso8583/*` |
| Terminal | `src/modules/terminal/` | `/terminals/*` |
| Routing | `src/modules/routing/` | `/routes/*`, `/bins/*` |
| Switch Core | `src/modules/switch-core/` | `/settlement/*`, `/reconciliation/*`, `/chargebacks/*`, `/transactions/*` |
| Fraud | `src/modules/fraud/` | `/fraud/*` |
| Treasury | `src/modules/treasury/` | `/treasury/*` |
| Monitoring | `src/modules/monitoring/` | `/monitoring/*` |
| Notifications | `src/modules/notifications/` | `/notifications/*` |
| Network | `src/modules/network/` | `/network/*` |
| Merchant | `src/modules/merchant/` | `/merchants/*` |
| API Gateway | `src/modules/api-gateway/` | `/api-gateway/*` |

## Module File Pattern
Every module follows this exact pattern:
```
src/modules/<name>/
  types.ts        — Zod schemas + TypeScript types
  <name>.service.ts — Business logic, database operations
  <name>.routes.ts  — Fastify route handlers
  <name>.module.ts  — Service instantiation, route registration, exports
```

## Startup Commands
```bash
docker compose up -d          # PostgreSQL + Redis
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts        # Admin user + sample data
npm run dev                   # Server at http://localhost:8081
```

## Default Credentials (from seed)
- Admin: `admin@primestack.io` / `Admin@2026`
- Merchant: `MERCHANT-001`
- HMAC Key ID: `psk_demo_key_001` (secret shown in seed output)

## Key Design Rules
1. **Never use raw `number` for money** — always `Decimal` from `src/core/decimal.ts`
2. **Every financial change goes through `LedgerService.postEntry()`** — never update balances directly
3. **Errors extend `AppError`** from `src/core/errors.ts` — never throw plain `Error` in services
4. **i18n**: error messages use `request.t('errors.CODE')` — never hardcode user-facing strings
5. **Response shape**: always use `sendSuccess()`, `sendCreated()`, `sendPaginated()` from `src/shared/utils/response.ts`
6. **Module exports**: services are singleton exports from `*.module.ts` — import from there, not from service files directly
