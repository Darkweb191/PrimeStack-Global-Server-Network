# PrimeStack Global Server Network — Setup Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| Docker | Any | PostgreSQL + Redis |
| npm | 9+ | Package manager |

---

## 1. Install Dependencies

```powershell
npm install
```

If the install is slow, try:
```powershell
npm install --prefer-offline
# or with legacy peer deps if you hit conflicts:
npm install --legacy-peer-deps
```

---

## 2. Start Infrastructure

```powershell
docker compose up -d
```

This starts:
- **PostgreSQL 16** on `localhost:5432` (user: `primestack`, pass: `primestack`, db: `primestack`)
- **Redis 7** on `localhost:6379`

Wait ~10 seconds, then verify:
```powershell
docker compose ps
```

---

## 3. Environment Configuration

The `.env` file is pre-configured for local development. No changes needed to start.

For production, update these values in `.env`:
```
JWT_SECRET=<256-bit random key>
DATABASE_URL=<your PostgreSQL connection string>
REDIS_HOST=<your Redis host>
REDIS_PASSWORD=<your Redis password>
```

---

## 4. Generate Prisma Client

```powershell
npx prisma generate
```

---

## 5. Create Database Tables

```powershell
npx prisma db push
```

This creates all 30+ tables from `prisma/schema.prisma`. For production, use migrations instead:
```powershell
npx prisma migrate dev --name init
```

---

## 6. Seed Initial Data

```powershell
npx tsx prisma/seed.ts
```

This creates:
- **Admin user**: `admin@primestack.io` / `Admin@2026`
- **Sample merchant**: `MERCHANT-001`
- **HMAC key**: `psk_demo_key_001` (secret displayed in output — save it)
- **10 system ledger accounts** (funding, fees, settlement, chargeback reserves)
- **IP whitelist**: localhost + allow-all (dev only)
- **2 default fraud rules**: card velocity (10/min) + AML threshold ($10,000)

---

## 7. Start the Server

```powershell
npm run dev
```

Output:
```
[INFO] Database connected
[INFO] Redis connected
[INFO] i18n initialized { languages: ['en','fr','es','ar','pt'] }
[INFO] Fastify application configured
[INFO] PrimeStack Global Server Network started — development mode { port: 8081 }
[INFO] API documentation available at /docs
```

---

## 8. Verify It's Running

```powershell
# Health check
Invoke-WebRequest http://localhost:8081/health | Select-Object -ExpandProperty Content

# Or visit in browser:
# http://localhost:8081/docs      — Swagger UI
# http://localhost:8081/api-gateway/info  — API overview
```

---

## Testing with Postman

1. Import `primestack-global-server-network.postman_collection.json` into Postman
2. Set the collection variable `base_url` to `http://localhost:8081`
3. Run **Admin → Login** first — it auto-saves the JWT token
4. Set `merchant_id` to the ID of a created merchant
5. Explore all 15 modules from the collection

---

## Common Issues

### `Error: Missing required environment variable`
The `.env` file is missing or not loaded. Copy `.env.example` to `.env`.

### `Can't reach database server`
Docker containers aren't running. Run `docker compose up -d` and wait 10 seconds.

### `P1001: Can't reach database server`
Prisma can't connect. Check `DATABASE_URL` in `.env` matches your Docker setup.

### `npm install` hangs
Network issue. Try:
```powershell
npm install --prefer-offline --no-audit --no-fund
```
Or configure a faster npm mirror:
```powershell
npm config set registry https://registry.npmmirror.com
npm install
```

---

## Project Structure

```
primestack-global-server-network/
├── prisma/
│   ├── schema.prisma       # Full database schema (30+ models)
│   └── seed.ts             # Initial data seeder
├── src/
│   ├── server.ts           # Entry point
│   ├── app.ts              # Fastify app + all 15 modules registered
│   ├── config/             # Environment config
│   ├── core/               # DB, Redis, logger, i18n, errors, decimal
│   ├── plugins/            # Fastify plugins (auth, i18n, IP whitelist, etc.)
│   ├── modules/            # 15 feature modules
│   │   ├── ledger/         # Double-entry accounting
│   │   ├── wallet/         # Digital wallets
│   │   ├── transfer/       # T2T, S2S, IP2IP, bulk transfers
│   │   ├── admin/          # Users, audit, KYC
│   │   ├── iso8583/        # ISO 8583 message engine
│   │   ├── terminal/       # Terminal management
│   │   ├── routing/        # Route rules, BIN routing
│   │   ├── switch-core/    # Auth, reversal, capture, settlement, chargebacks
│   │   ├── fraud/          # Velocity, blacklist, AML, risk scoring
│   │   ├── treasury/       # Float, liquidity, reserves
│   │   ├── monitoring/     # Dashboard, live feeds
│   │   ├── notifications/  # Multi-channel with i18n
│   │   ├── network/        # IP whitelist, HMAC, API keys, certs
│   │   ├── merchant/       # Merchant onboarding, stats
│   │   └── api-gateway/    # Webhooks, request logs, developer portal
│   ├── shared/             # Response helpers, crypto utils
│   └── locales/            # i18n translations (en, fr, es, ar, pt)
├── .kiro/
│   ├── hooks/              # Kiro automation hooks
│   └── steering/           # Kiro project context
├── .env                    # Local environment (not committed)
├── .env.example            # Environment template
├── docker-compose.yml      # PostgreSQL + Redis
├── primestack-global-server-network.postman_collection.json
└── SETUP.md                # This file
```

---

## Adding a New Module

1. Create `src/modules/<name>/` with:
   - `types.ts` — Zod schemas + TypeScript types
   - `<name>.service.ts` — Business logic
   - `<name>.routes.ts` — Fastify route handlers
   - `<name>.module.ts` — Exports service singleton, registers routes

2. In `<name>.module.ts`:
   ```typescript
   import { prisma } from "../../core/database.js";
   export const myService = new MyService(prisma);
   export function registerMyModule(app: FastifyInstance) {
     registerMyRoutes(app, myService);
   }
   ```

3. In `src/app.ts`:
   ```typescript
   import { registerMyModule } from "./modules/<name>/<name>.module.js";
   // ...
   registerMyModule(app);
   ```

4. Export from `src/modules/index.ts`

---

## Scaling to Microservices

When you're ready to extract a module:
1. Each module has clear boundaries and its own service class
2. The ledger is the hardest to extract — do it last
3. Replace direct service imports with HTTP clients or a message broker (NATS/Kafka)
4. The Prisma schema can be split per-service with foreign keys replaced by IDs

---

## Production Checklist

- [ ] Replace JWT_SECRET with 256-bit random key
- [ ] Set Redis password
- [ ] Remove `0.0.0.0/0` from IP whitelist (seed adds it for dev only)
- [ ] Run `npx prisma migrate dev` instead of `prisma db push`
- [ ] Configure TLS certificates for API gateway
- [ ] Enable HMAC key rotation schedule
- [ ] Set up log aggregation (Pino sends JSON — works with Datadog/Splunk/CloudWatch)
- [ ] Configure webhook delivery worker (current implementation queues to Redis — needs a consumer)
- [ ] Review and tighten fraud velocity rules for your transaction volumes
- [ ] Enable MFA for admin users
