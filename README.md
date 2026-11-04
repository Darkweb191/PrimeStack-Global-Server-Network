# PrimeStack Global Server Network — Project Guide

PrimeStack is a payment-switch and asset-gateway codebase containing a TypeScript/Fastify API, a separate Docker Compose service implementation, and a standalone dashboard. It includes foundations for ledger-backed transfers, card transaction lifecycles, merchant operations, ISO 8583, settlement, risk, and administration.

**This repository is not certified or verified as production-ready.** Some interfaces are demos or operational previews, and the runtimes described below are separate implementations, not one unified deployment. Read [Runtime choices](#runtime-choices) and [Known limits and production readiness](#known-limits-and-production-readiness) before deploying or entering financial data.

## Table of contents

- [Start here](#start-here)
- [Runtime choices](#runtime-choices)
- [Architecture and data flow](#architecture-and-data-flow)
- [Source tree](#source-tree)
- [Feature modules](#feature-modules)
- [Dashboards and pages](#dashboards-and-pages)
- [Bank connections and integration guide](#bank-connections-and-integration-guide)
- [Install and run](#install-and-run)
- [Configuration](#configuration)
- [Database and migrations](#database-and-migrations)
- [Authentication and API documentation](#authentication-and-api-documentation)
- [Transactions and accounting](#transactions-and-accounting)
- [Languages](#languages)
- [Testing and troubleshooting](#testing-and-troubleshooting)
- [Known limits and production readiness](#known-limits-and-production-readiness)
- [Further documentation](#further-documentation)

## Start here

1. Choose **one runtime** to work on: [the root Fastify app](#root-fastify-application), [the Docker Compose services](#docker-compose-services), or [the standalone dashboard](#standalone-dashboard). They have different responsibilities and should not be assumed to share the same data or APIs.
2. Read [the setup guide](./SETUP.md) for root-app development, or [the services startup guide](./services/START.md) for the containerized services.
3. Use a disposable local environment and non-production credentials. The example and seed values are for development only.
4. Open `/docs` for the API schema and run focused tests before changing financial or authentication behavior.

## Runtime choices

This repository contains multiple implementation surfaces:

### Root Fastify application

Entry point: `src/server.ts`; routes and plugins are assembled in `src/app.ts`. It uses Prisma with the root `prisma/schema.prisma`, PostgreSQL, and Redis. Start it with `npm run dev` after following [Install and run](#install-and-run). Its default port is 8081.

### Docker Compose services

The `services/` folder contains separately packaged services, shared code, service-specific schemas/configuration, and Compose/Kubernetes deployment files. The API Gateway service is configured as the external entry point on port 8080. See [services/ARCHITECTURE.md](./services/ARCHITECTURE.md) and [services/START.md](./services/START.md). This deployment has a separate service topology and data ownership model from the root Prisma application.

### Standalone dashboard

`start-dashboard.js` serves the UI directly on port 8081 by default. It includes dashboard pages and proxy routes to services. It is not the Fastify application and does not provide Fastify authentication just because both can use the same port.

Dashboard pages use a compact shared layout with smaller typography, controls, tables, and panel spacing; mobile controls retain larger tap targets.

**Port conflict:** the Fastify app and standalone dashboard both default to 8081. Do not start both on the same host/port at the same time. Configure one to use another port if you intentionally need both. `start-primestack.bat` starts the services Compose stack and standalone dashboard; it does not start the root Fastify app.

**Do not expose the standalone dashboard publicly.** Its screens are not a substitute for an authenticated merchant/admin portal, and its bank directory is in-memory demo metadata. Use the Fastify API or the independently deployed services according to the runtime and APIs you have selected.

## Architecture and data flow

The root application is a modular monolith: modules are registered in `src/app.ts`, and generally contain routes, services, schemas, and a module-registration file. PostgreSQL accessed through Prisma stores application records; Redis supports runtime concerns such as caching and risk-related operations.

The service implementation separates capabilities into containers. Its documented transaction path is:

```text
Client/terminal
  -> API Gateway (IP filtering, authentication, request routing)
  -> Switch Core (transaction lifecycle, risk and routing coordination)
  -> Ledger (authoritative financial postings)
  -> Settlement, audit, and notifications
```

The exact processing path depends on which runtime and endpoints are used. A successful API response, an approved transaction record, or an open TCP socket does not by itself prove a completed external payment or bank settlement.

## Source tree

| Path | Purpose |
|---|---|
| `src/server.ts` | Root Fastify process entry point and graceful shutdown |
| `src/app.ts` | Fastify configuration, plugins, and root-module registration |
| `src/config/` | Environment configuration and defaults |
| `src/core/` | Database, Redis, logging, i18n, errors, and shared runtime facilities |
| `src/plugins/` | Authentication, IP filtering, request logging, validation/error handling, and related Fastify plugins |
| `src/modules/` | Root-app domain modules and HTTP routes |
| `src/shared/` | Cross-module utilities and UI helpers |
| `src/locales/` | API translation resources |
| `prisma/schema.prisma` | Root-app database schema |
| `prisma/migrations/` | SQL migrations for existing databases |
| `prisma/seed.ts` | Development seed data |
| `services/` | Independent Docker Compose services and deployment material |
| `start-dashboard.js` | Standalone dashboard server, page templates, and API proxy |
| `dashboard-localization.js` | Browser-side translation catalog and translator for the standalone dashboard |
| `admin-dashboard.html`, `dashboard.html` | Additional static dashboard/demo pages |
| `start-primestack.bat`, `stop-primestack.bat` | Windows service/dashboard startup and shutdown scripts |
| `SETUP.md` | Root-app setup walkthrough |
| `PHASE_17_IMPLEMENTATION_ROADMAP.md` | Delivery sequence and production release gates |

`node_modules*`, `dist/`, local environment files, logs, and generated artifacts are not source-of-truth documentation. Do not commit credentials or local secrets.

## Feature modules

The root Fastify application registers the modules below in `src/app.ts`. Descriptions identify the intended capability; they are not a guarantee that every listed operation is complete, externally integrated, or production-certified.

| Module | What it is for |
|---|---|
| `ledger` | Financial accounts, balanced journal postings, balance checks, and holds. The ledger should be the source of truth for posted financial balances. |
| `wallet` | Wallet operations backed by ledger accounts; it delegates transfer posting to the transfer service. |
| `transfer` | Internal fund-movement records and ledger-backed transfer processing, including wallet and other transfer types. |
| `switch-core` | Card transaction lifecycle operations such as authorization, capture, reversal, settlement, and chargebacks. |
| `merchant` | Merchant registry and scoped merchant-facing resources, including terminals, statements, invoices, payment-link records, and KYC document references. |
| `admin` | Administrator accounts, authentication, user/role workflows, audit-related features, admin dashboards, and bank HostConnection routes. |
| `iso8583` | ISO 8583 parsing/building and configured host-connection management. The connection test described below checks TCP reachability only. |
| `terminal` | Terminal registration and operational management, including device configuration features. |
| `routing` | Route-rule selection and routing configuration. A route decision alone does not mean an external processor completed a payment. |
| `fraud` | Risk evaluation rules and decisions such as velocity, block, or review outcomes. This is not a substitute for a jurisdiction-specific compliance program. |
| `treasury` | Treasury and liquidity-pool records and operations. Some displayed amounts are operator-maintained snapshots, not confirmed bank balances. |
| `monitoring` | Health and operational status views for supported services and entities. |
| `notifications` | Notification records and channel/template functionality; delivery requires the relevant runtime workers and provider configuration. |
| `network` | Network security facilities such as IP allowlisting and key-related workflows. |
| `api-gateway` | API gateway, request-log, and developer-facing API resources for the root app. |
| `swift-payout` | Administrator-only ISO 20022 payout draft generation; does not transmit a payment or prove settlement. |
| `pag` | PrimeStack Global Server Network foundation: asset/network metadata, routes, conversion-rate configuration, liquidity snapshots, and compliance-review records. It does not execute asset settlement or automated screening. |
| `developer-platform` | Application and partner metadata, credential lifecycle, product/rate-plan metadata, webhook endpoint records, and SDK-version records. Several integrations described in its API are metadata-only foundations; see below. |
| `governance` | Governance record workflows for risks, continuity, backup evidence, key metadata, retention policies, change requests, and vendors. Records do not execute the operational controls they describe. |
| `intelligence` | Read-only operational summaries, currency-separated activity, arithmetic baselines, recommendations, and attributed events. It does not autonomously change routing, risk, or treasury settings. |

The separate `services/` deployment has its own service implementations. Its documented service/port mapping is in [services/ARCHITECTURE.md](./services/ARCHITECTURE.md); do not assume module names, endpoint behavior, state, or schemas are interchangeable with the root app.

## Dashboards and pages

The following pages are served by `start-dashboard.js`, unless marked otherwise. Page availability is not evidence that the underlying feature is live or authenticated.

| Page | URL | Purpose and important boundary |
|---|---|---|
| Standalone dashboard home | `/` | Navigation/overview for the standalone dashboard. |
| Platform overview | `/platform` | Platform service and feature overview. |
| Bank Connections | `/platform/banks` | Demo-only bank metadata directory. It is in-memory, unauthenticated, not persisted, and does not connect to banks. |
| Bank Integration Guide | `/platform/bank-guide` | Setup and certification guidance, including the limits of the authenticated TCP check. |
| Funding / Receive Funds / Server Funds | `/platform/funding`, `/platform/receive-funds`, `/platform/server-funds` | Standalone UI views; check each screen's source and service response before treating data or controls as live. |
| IP Whitelist / Settlement / Risk / Merchants | `/platform/whitelist`, `/platform/settlement`, `/platform/risk`, `/platform/merchants` | Standalone operational views/proxies to the configured services. |
| Service Operations Matrix | `/platform/monitoring` | Shows live health-check status and response time for all 14 services, refreshes automatically, and links to each service admin view. Health checks do not represent full dependency, transaction, or bank-connection validation. |
| Merchant views | `/merchant`, `/merchant/send`, `/merchant/t2t`, `/merchant/payout`, `/merchant/balance`, `/merchant/terminals`, `/merchant/keys` | Standalone merchant UI. It is not a secure merchant portal or authenticated merchant session. |
| Operations views | `/ops`, `/ops/terminals`, `/ops/network`, `/ops/iso8583` | Standalone operations pages for service and ISO/network-related views. |
| Admin service views | `/admin/svc/ledger`, `/admin/svc/ipwhitelist`, `/admin/svc/auth`, `/admin/svc/terminal`, `/admin/svc/transfer`, `/admin/svc/risk`, `/admin/svc/audit`, `/admin/svc/settlement`, `/admin/svc/notification`, `/admin/svc/switchcore`, `/admin/svc/security`, `/admin/svc/routing`, `/admin/svc/iso8583`, `/admin/svc/gateway` | Standalone dashboards; API-only modules may link to Swagger rather than provide a full UI. |

The Fastify app contains additional HTML shells and dashboards, including `/admin/dashboard`, `/admin/merchant-home`, `/admin/merchant-dashboard`, `/admin/wallet-dashboard`, `/admin/pag-dashboard`, `/admin/developer-platform-dashboard`, `/admin/governance-dashboard`, `/admin/intelligence-dashboard`, and `/admin/swift-payout-draft`. Open `/docs` and the relevant UI code for the authoritative route list and required permissions. Dashboard data endpoints may be protected even when an HTML shell is publicly served.

The static `admin-dashboard.html` and `dashboard.html` files are separate pages and are not the same application as the standalone server or Fastify views.

The standalone dashboard, static dashboard examples, and Fastify-rendered HTML pages use a slate-and-blue fintech theme by default, with a soft gray canvas, raised/inset neumorphic panels, blue accents, and readable status colors. The standalone dashboard navigation is organized into Platform, Merchant, and Operation tabs, with keyboard-accessible tab switching and responsive tile links. Related metric and card groups align in responsive columns. Fastify-rendered pages retain an optional dark-theme toggle. Decorative cyber HUD and matrix effects are not used in the standard theme.

The Command Center and merchant home preview include keyboard skip navigation and focus indicators, responsive keyboard-operable navigation, accessible table captions and mobile labels, status indicators with text and icons, and reduced-motion support. The Command Center also provides preferences for high contrast, larger text, pausing refresh, screen-reader use, and persistent keyboard-focus emphasis. WCAG 2.2 AA is a design target, not a certification; test with assistive technology in the deployment. These features apply to these two admin views only.

## Bank connections and integration guide

For the planned Plaid Link + Auth workflow in the root Fastify application, see the dedicated [Plaid integration guide](./PLAID_INTEGRATION_README.md). Plaid is not currently implemented in this repository; the guide describes the proposed implementation and setup sequence.

There are **two different bank-related features**:

1. **Standalone directory** (`/platform/banks`): accepts only public metadata in a process-local array. Data disappears on restart. Its `Test Connection` action intentionally returns `testPerformed: false`; there is no bank connectivity test on this screen. Do not enter credentials, account numbers, IBANs, or secrets.
2. **Fastify HostConnection API**: `/admin/bank-connections` lists configured host records; `POST /admin/bank-connections` creates one; `POST /admin/bank-connections/:id/test` attempts a TCP connection to the configured host and port. All routes require an authenticated JWT; creating and testing connections additionally require the `SUPER_ADMIN`, `ADMIN`, or `OPERATOR` role. The test sends no payment and no ISO 8583 message; it does not verify TLS, credentials, message compatibility, or settlement.
3. **Encrypted bank account profiles**: the admin Command Center stores account details separately at `/admin/bank-account-profiles`. Only `SUPER_ADMIN` and `ADMIN` can list, create, or delete profiles. Account numbers, routing numbers, SWIFT codes, bank addresses, account names, and signatories are encrypted using AES-256-GCM before database writes; responses expose only the bank name and last four account digits. There is intentionally no API that returns the original account details. Apply the `20261028080000_bank_account_profiles` migration and configure `BANK_DETAILS_ENCRYPTION_KEY` before saving details. Generate a 32-byte key encoded as base64 and keep it in a secrets manager, separate from database backups. Losing or rotating this key without a planned decrypt-and-reencrypt process makes existing profiles unrecoverable. Serve the dashboard only over HTTPS, restrict database and administrator access, and follow your organization's retention and privacy requirements.

Recommended integration sequence:

1. Obtain the bank's written sandbox endpoint, protocol, message profile, framing, key-exchange process, network allowlisting requirements, and certification cases.
2. Configure access only through the authenticated HostConnection API and restrict outbound network access to bank-approved hosts/ports. Never accept arbitrary endpoint details from an unauthenticated/public user.
3. Keep passwords, private keys, PIN keys, and API tokens out of source code, logs, and HostConnection display fields. Use an approved secret manager and the bank's secure key-injection process.
4. Treat the TCP check as a narrow network diagnostic only.
5. Implement the bank-specific protocol and complete its sandbox certification, failure/reversal/retry testing, reconciliation, and written production approval before enabling live traffic.

The previous Wise Integration dashboard page and route have been removed. The legacy `wise-integration.js` file and `WISE_*` settings may still exist in the repository/environment template, but they are not linked to the current dashboard bank directory. Treat them as legacy/unmaintained; do not start the service or use live credentials without a separate code, security, and bank-certification review.

## Languages

The root API error, notification, and status catalogs currently support five languages: English (`en`), French (`fr`), Spanish (`es`), Arabic (`ar`), and Portuguese (`pt`). Language resolution is `Accept-Language` header → user preference → default (`en`).

The standalone dashboard at `start-dashboard.js` has a separate selector for 30 UI languages: English, French, Spanish, Arabic, Portuguese, German, Italian, Dutch, Russian, Chinese, Japanese, Korean, Hindi, Turkish, Indonesian, Vietnamese, Thai, Swahili, Polish, Ukrainian, Bengali, Persian, Urdu, Hebrew, Greek, Swedish, Norwegian, Danish, Finnish, and Malay. The choice is saved in browser storage. Arabic, Persian, Urdu, and Hebrew use RTL layout. Translation strings are drafts; current coverage focuses on common navigation and health labels, so most page-specific text and API-provided values may remain English. Native-speaker review is needed. The Fastify admin dashboards use the five API languages and send the selected `Accept-Language` with API requests.

## Install and run

### Prerequisites

- Node.js 20+
- npm 9+
- Docker Desktop (for local PostgreSQL/Redis; RabbitMQ is used by the services stack)
- PowerShell on Windows, or a POSIX-compatible shell on Linux/macOS

### Run the root Fastify app locally

From the repository root, in PowerShell:

```powershell
# Start the root Compose file's PostgreSQL and Redis containers
docker compose up -d

# Install dependencies
npm install

# Create a local environment file (do not overwrite an existing .env)
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# Generate Prisma client
npm run prisma:generate

# Create/update a local development schema
npm run prisma:push

# Start Fastify in watch mode
npm run dev
```

Use `npm start` after building (`npm run build`) to run the compiled Fastify app. `npm run prisma:push` is a development convenience, not a production migration strategy. For existing data, read [Database and migrations](#database-and-migrations) before applying schema changes.

The equivalent Bash command to copy the example file is `cp .env.example .env`; only do so if a local `.env` does not already exist. Never replace a working local environment file without backing it up.

### Run the Docker Compose service stack

Follow [services/START.md](./services/START.md) and [services/ARCHITECTURE.md](./services/ARCHITECTURE.md). The service stack is separate from the root Fastify app and has its own containers, APIs, service databases/schemas, and credentials. It exposes the API Gateway on port 8080 and individual service ports for local development.

The root `docker-compose.yml` and `services/docker-compose.yml` both define PostgreSQL/Redis containers and publish ports 5432/6379. The service Compose file also uses RabbitMQ. Their Compose configurations share some fixed container names and ports, so do not start both stacks at once without deliberately resolving the port/container-name conflicts.

### Windows launcher

`start-primestack.bat` starts the Docker service stack and then starts `start-dashboard.js` on port 8081; it does **not** start `src/server.ts` or the root Fastify API. The launcher includes a machine-specific `D:\PrimeStack Global Server Network` path, so edit that path before using it elsewhere. It waits for a fixed number of containers, which is not a full readiness or production validation.

Review `stop-primestack.bat` before running it: in addition to stopping Compose stacks, it executes `docker system prune -f`, which removes unused Docker resources outside this project. Back up or preserve any Docker resources you need first.

## Configuration

The root Fastify app reads environment values from `.env` using `dotenv`. `.env.example` is a template, not a safe production configuration. The main settings read by `src/config/index.ts` are:

| Variable | Purpose | Development default/fallback |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `APP_NAME` | Service name | `primestack-global-server-network` |
| `HOST`, `PORT` | Fastify bind address and port | `0.0.0.0`, `8081` |
| `LOG_LEVEL` | Pino log level | `info` |
| `DATABASE_URL` | Root Prisma PostgreSQL connection string | Local example in `.env.example`; configure it for your database |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Root app Redis connection | `localhost`, `6379`, no password, database `0` |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Admin JWT signing and expiry | Development fallback is not secure |
| `BANK_DETAILS_ENCRYPTION_KEY` | Base64-encoded 32-byte AES-256-GCM key protecting stored bank account profiles | Required to create profiles; there is no insecure fallback |
| `HMAC_ALGORITHM`, `HMAC_HEADER_PREFIX` | Merchant/client request-signing settings | `sha256`, `x-primestack` |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` | API request rate-limit settings | `100` requests per `60` seconds |
| `DEFAULT_LANGUAGE`, `SUPPORTED_LANGUAGES` | API language defaults/catalog selection | `en`; `en,fr,es,ar,pt` |

Use long, unique, randomly generated secrets in production. Never use development database passwords, seed credentials, or the fallback JWT secret on a reachable system. Restrict bind addresses, CORS origins, database access, outbound network access, and firewall rules for the actual deployment. Configure each `services/` package using its own Compose environment and service documentation; the root variables do not automatically configure every container.

### Standalone ISO 20022 engine

`iso20022-engine.js` is a separate Node.js process (default port `8084`); it does not inherit authentication from Fastify. Before starting it, set `ISO20022_LEDGER_HMAC_SECRET` in its environment to a unique random secret of at least 32 bytes. The engine can start without this setting, but `/iso20022/ledger-credit` returns `503` and cannot post to the ledger. The engine does not prompt in a browser or terminal.

For a temporary PowerShell session, generate and set a random 32-byte secret before launching:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$env:ISO20022_LEDGER_HMAC_SECRET = [Convert]::ToBase64String($bytes)
$rng.Dispose()
node .\iso20022-engine.js
```

Keep the value in an OS/deployment secret store for persistent deployments; do not put it in source control or expose it in browser code. Ledger requests must include `X-ISO20022-Timestamp` (Unix seconds), `X-ISO20022-Nonce` (at least 16 random bytes, base64url encoded), and `X-ISO20022-Signature` (64-character hex HMAC-SHA256). Compute the signature over `timestamp + "\n" + nonce + "\n" + exact raw UTF-8 request body`, using the shared secret. Timestamps are accepted within five minutes; nonces are tracked in memory to reject repeats in the current process. Use HTTPS and a single engine instance, or add a shared replay store before running multiple instances/restarting during the validity window. HMAC authenticates possession of the shared secret; it is not per-user authorization, message signing, or a replacement for TLS.

## Database and migrations

- The root Prisma schema is `prisma/schema.prisma`; generate the Prisma client after dependency installation and schema changes.
- `npm run prisma:push` is a quick local-development workflow. It is not a reviewed production migration strategy.
- The repository contains additive SQL migrations for existing databases. Their order and preconditions matter. Read each migration and its accompanying notes below before running it; do not execute every SQL file blindly.
- Back up the database and verify restoration before schema changes. Existing databases may need data conversion as well as schema changes.
- Do not apply a migration separately if a fresh database or `prisma db push` has already created the same schema objects. Follow the notes for that migration and database state.

The development seeder (`npm run seed`) creates sample identities, merchants, keys, ledger accounts, and risk/network records. It is for local testing only. Do not use seed credentials, allow-all IP rules, sample merchants, or example passwords in a deployed environment. Store and rotate any generated key securely.

## Authentication and API documentation

### API documentation

Once the **root Fastify app** is running, visit `http://localhost:8081/docs` for Swagger UI (or use the configured Fastify port). For the containerized services, use the relevant service API documentation and health routes described in `services/`.

The Wallet Center is available at `http://localhost:8081/admin/wallet-dashboard`. Sign in with an admin account; dashboard operations use JWT-authenticated `/admin/wallets` routes. The existing `/wallets` API remains protected by merchant HMAC authentication.

An authenticated transaction can be viewed as a printable PrimeStack summary at `GET /transactions/:stan/summary`. It is generated from the saved transaction record and is explicitly not a SWIFT message, bank confirmation, or proof of external settlement.

### Authentication and API access

Fastify registers JWT, HMAC, IP-whitelist, rate-limit, CORS, security-header, request-log, validation/error, and language plugins in `src/app.ts`. Actual authentication is route-specific: an endpoint can require an admin JWT, merchant HMAC, a particular administrator role, or no authentication. Check the route implementation and Swagger contract before assuming access rules.

- Admin workflows use bearer JWTs and may apply role checks such as `SUPER_ADMIN`, `ADMIN`, or `OPERATOR`.
- Merchant-facing APIs use HMAC authentication where configured. The root app's configured header prefix defaults to `x-primestack`; protect client secrets and never include them in source, screenshots, logs, or support messages.
- IP filtering is another control and does not replace authentication or authorization.
- The Fastify server applies a global rate limit and supports CORS. Production origins, proxy trust, rate limits, and IP rules must be reviewed and explicitly configured.
- Swagger at `/docs` is the primary way to inspect registered root-app request/response schemas. The `primestack-global-server-network.postman_collection.json` file can be imported into Postman for API exploration; use disposable credentials and data.

The standalone dashboard's APIs are separate. Do not infer JWT/HMAC protection from Fastify plugins for any route served by `start-dashboard.js`.

## Transactions and accounting

### Transaction flow

Card transaction states are `AUTHORIZED` → `CAPTURED` → `SETTLED`. Authorization validates the registered active terminal and merchant, runs fraud evaluation and route selection, then records an approval; it does not place a ledger hold or contact an external issuer/processor. Capture records the captured amount (including a supported single partial capture) but does not post financial entries. Settlement selects captured transactions for a merchant, date, and currency, calculates only a configured merchant pricing-plan transaction fee (zero when none applies), posts one balanced ledger entry, and marks the transactions settled. Reversals before settlement cancel an authorization/capture without a ledger posting; settled transactions must use the chargeback workflow. For an existing database, apply `prisma/migrations/20261023040000_card_capture_settlement/migration.sql` after earlier migrations; on a fresh database, or after `prisma db push` using the current schema, do not apply it separately.

Wallet transfers are a separate flow: the wallet route validates wallets, currency, and fees, then the transfer service posts the balanced ledger entry and marks the transfer complete. They do not use card authorization/capture states. A successful internal record or ledger posting does not by itself prove that an external processor, bank, or merchant payout has completed.

The administrator-only SWIFT payout draft tool is available at `http://localhost:8081/admin/swift-payout-draft`. It prepares a single ISO 20022 `pacs.008.001.08` XML draft from entered debtor, creditor, account, amount, BIC, and settlement details. The draft endpoint validates basic structure and IBAN checksums and does not save the bank details or transmit the message. This is not a bank-certified CBPR+ validation and does not move funds; actual payout requires an authorized bank/PSP integration, their profile rules, and their own transmission and acknowledgement workflow.

The PrimeStack Global Server Network operations foundation is at `http://localhost:8081/admin/pag-dashboard` (admin JWT; writes require `SUPER_ADMIN`, `ADMIN`, or `OPERATOR`). For an existing database, apply `prisma/migrations/20261022020000_pag_foundation/migration.sql` after the Phase 10 merchant migration; a fresh database or one updated with `prisma db push` using the current schema must not apply the SQL separately. PAG provides asset/network registries, route configuration and weighted route recommendations, conversion-rate configuration, liquidity snapshot management, asset-account registration, and manual compliance-review records. Route recommendations do not reserve liquidity, perform conversion, run sanctions/AML screening, post the asset ledger, or execute settlement. Liquidity values are operator-maintained snapshots, not verified balances; compliance records are not automated screening.

The Developer Platform foundation dashboard is at `http://localhost:8081/admin/developer-platform-dashboard` (admin JWT). For an existing database, apply `prisma/migrations/20261023010000_developer_platform_foundation/migration.sql` after earlier schema migrations; on a fresh database, or after `prisma db push` using the current schema, do not apply it separately. Administrators can register applications, issue/rotate/revoke app credentials, assign API products and rate-plan metadata, register webhook endpoints, and manage SDK-version metadata, partner records, and certification status. Application API secrets are shown once and stored as SHA-256 hashes; credential lifecycle management is restricted to `SUPER_ADMIN` and `ADMIN`. This foundation does not authenticate those application keys on API traffic, enforce rate plans/product access, deliver webhooks, provide OAuth, isolate tenants, publish marketplace plugins, serve SDK downloads, or produce usage analytics. Webhook callback URLs are configuration only and are not contacted.

The Enterprise Governance Center is at `http://localhost:8081/admin/governance-dashboard` (admin JWT). For an existing database, apply `prisma/migrations/20261023020000_governance_foundation/migration.sql` after prior schema migrations; do not apply it separately to a fresh database or after `prisma db push` with the current schema. It provides records and workflows for enterprise risks, disaster-recovery plans, backup evidence, key lifecycle metadata, data-retention policies, change requests, regulatory report records, vendors, and continuity tests. Change requests enforce an ordered review/approval/implementation/verification record flow and prevent requesters from approving their own requests. These are governance records only: no backup/restore, KMS operation, retention deletion, database replication, failover, regulatory report generation or submission, or production change execution is performed. Existing admin roles remain unchanged; this module does not provide a new enterprise IAM or general four-eyes enforcement layer.

The Phase 16 Intelligence dashboard is at `http://localhost:8081/admin/intelligence-dashboard` (admin JWT). For an existing database, apply `prisma/migrations/20261023030000_intelligence_foundation/migration.sql` after earlier migrations; do not apply separately to a fresh database or after `prisma db push` with the current schema. The read-only dashboard summarizes recorded transactions, successful transaction amounts and completed-transfer fees by currency, merchant activity, host/terminal status, and transaction-log durations. It includes a two-period arithmetic baseline and host-availability review recommendations; these are not validated forecasts or routing decisions. Intelligence events can be recorded through the admin API and are attributed to the authenticated user. Dashboard access permits the existing read roles; event recording is limited to `SUPER_ADMIN`, `ADMIN`, and `OPERATOR`. This foundation does not infer net revenue/profit, train models, create fraud rules, access external AI providers, or execute routing, treasury, settlement, fraud, compliance, or infrastructure actions. The attached root `.env.example` requires no new intelligence settings.

The wallet-account SQL step is safe for a fresh database and should run once after `db push` on an existing database, before using wallet operations. Back up and review existing ledger data before applying it.

An active fee rule with transaction type `WALLET` is applied to wallet transfers and posted through the ledger fee account. Virtual account numbers are local identifiers and do not represent bank-integrated accounts.

### Merchant Acquiring

For an existing database that still has the Phase 9 schema, apply the additive merchant-acquiring SQL migration:

```bash
npm exec -- prisma db execute --file prisma/migrations/20261022010000_merchant_acquiring/migration.sql --schema prisma/schema.prisma
```

On a fresh database, or after running `prisma db push` with the current schema, do not run that SQL separately: Prisma will already have created the new schema objects. Back up existing data before applying a migration.

The Acquiring Dashboard is available at `http://localhost:8081/admin/merchant-dashboard`. It requires an admin JWT. Merchant administration is exposed under `/admin/merchants`; merchant-owned profile, transactions, terminals, settlements, balance, statements, invoices, payment links, and KYC-document submission are exposed under `/merchant/...` and scoped to the merchant authenticated by HMAC. Admin write permissions are role-gated; reviewers can review submitted KYC document references.

KYC document references are metadata only; this module does not upload or store document files. Invoices and payment links are records only and do not collect payment or post settlement. Pricing plans and agent commissions are configuration and are not yet applied to transactions or paid out.

### Health Check

```bash
curl http://localhost:8081/health
```

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Fastify
- **Database:** PostgreSQL via Prisma ORM
- **Cache:** Redis via ioredis
- **Validation:** Zod
- **i18n:** i18next
- **Logging:** Pino
- **Financial math:** decimal.js (28-digit precision, banker's rounding)

## Testing and troubleshooting

### Useful root-app commands

Run these from the repository root:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks/compiles the root TypeScript app into `dist/`. |
| `npm test` | Runs the root Vitest suite once. |
| `npm run test:watch` | Runs Vitest interactively in watch mode. |
| `npm run lint` | Runs ESLint over `src/`. |
| `npm run prisma:generate` | Generates Prisma client code from the current root schema. |
| `npm run prisma:push` | Synchronizes the root Prisma schema to the configured database; use only for local development. |
| `npm run prisma:migrate` | Starts Prisma's development migration workflow. Review generated migrations before sharing/deploying them. |
| `npm run prisma:studio` | Opens Prisma Studio for the configured database; treat it as privileged data access. |
| `npm run seed` | Inserts local development seed data. Never run casually against production. |

The service stack has independent packages and tests. Use the per-service commands documented in [services/START.md](./services/START.md); installing root dependencies does not necessarily install each service's dependencies.

### Health and common problems

| Symptom | Checks |
|---|---|
| Port 8081 is already occupied | The standalone dashboard and root Fastify app both default to 8081. Stop the intended old process or configure a different port, then check `/health`. |
| Port 5432 or 6379 is occupied | Check whether the root Compose stack or services Compose stack is already running. Do not start both without resolving shared ports/container names. |
| Database connection fails / Prisma `P1001` | Check `docker compose ps`, `DATABASE_URL`, the PostgreSQL port, and database readiness. Ensure the root app is pointed at the intended database. |
| Prisma client cannot be imported | Run `npm run prisma:generate` after dependencies are installed and confirm the generated client matches `prisma/schema.prisma`. |
| Swagger is unavailable | Confirm that the root Fastify server is running and open `/docs` on its configured port; the standalone dashboard is not the Swagger host. |
| Standalone page shows unavailable data | Check that `start-dashboard.js` is running and that the relevant upstream service is started and reachable. A working page shell does not prove that its service is live. |
| Bank demo record disappears | This is expected: the standalone bank directory stores records only in process memory. Use the authenticated HostConnection API for configured TCP endpoint records. |
| Bank host test reports reachable | This verifies a TCP socket connection only. It does not certify bank connectivity, TLS, ISO 8583, credentials, or payment processing. |

### Workspace validation status

At the time this guide was prepared (2026-10-28), the root Vitest command could not start because the local dependency installation was incomplete (missing `which`). The TypeScript build also reported existing compiler diagnostics. Those results are not a passing build/test baseline; restore dependencies in a clean development environment, rerun checks, and resolve or explicitly record failures before a release.

## Known limits and production readiness

This project contains functional foundations, previews, and metadata workflows; not every listed feature is a production integration. In particular:

- The standalone dashboard is unauthenticated and is for local/demo use; do not expose it to untrusted networks.
- The standalone bank list is in-memory demo metadata. The authenticated Fastify host test checks TCP reachability only, not bank protocol or payment behavior.
- Card authorization/capture records do not contact an external issuer/processor. The documented settlement flow posts internal ledger entries; this is not evidence that a bank or processor settled externally.
- The SWIFT payout page produces an XML draft only. It does not send money, contact a bank, or certify CBPR+ compliance.
- Merchant KYC document references do not upload/store documents. Invoices/payment links are records and do not collect payment or post settlement. Pricing/agent commissions are not yet automatically applied/paid out.
- PAG route recommendations, liquidity snapshots, and compliance-review records do not execute conversions, settle assets, verify cash, or automatically screen sanctions/AML.
- Developer Platform credentials/products/webhooks/SDKs have metadata-only portions; see the detailed module notes above. Do not assume the metadata is enforced by runtime API traffic.
- Governance entries do not perform backups, restore, key management, retention deletion, failover, or regulatory submissions.
- Intelligence outputs are informational summaries/recommendations, not validated forecasts or automated decisions.
- Admin sign-in shells, accessibility features, and dashboards do not imply that every page has complete authentication, accessibility certification, or production-ready workflows.
- Wise dashboard navigation was removed. The remaining Wise integration script/environment settings are legacy and are not an approved production integration.

Before any real-money or production use, complete the applicable roadmap gates: select the authoritative runtime and data owner, obtain an independent security review, validate all route authorization and tenant boundaries, verify ledger invariants/idempotency/reversals, complete bank/processor certification, prove reconciliation and backup restoration, configure monitoring and on-call response, and obtain legal/compliance and operational approvals. See [PHASE_17_IMPLEMENTATION_ROADMAP.md](./PHASE_17_IMPLEMENTATION_ROADMAP.md). Do not use real funds or sensitive customer data until the controls are implemented and independently validated.

## Further documentation

- [Root application setup](./SETUP.md) — prerequisites, local setup, API testing, troubleshooting, and project structure.
- [Service architecture](./services/ARCHITECTURE.md) — independent containerized services, roles, and port mapping.
- [Service startup](./services/START.md) — running the Compose stack and service-specific development.
- [Phase 17 implementation roadmap](./PHASE_17_IMPLEMENTATION_ROADMAP.md) — phased delivery sequence, MVP boundaries, and production release gates.
- [Postman collection](./primestack-global-server-network.postman_collection.json) — request examples for API exploration; use only non-production credentials.
#   P r i m e s t a c k - G l o b a l - S e r v e r - N e t w o r k  
 