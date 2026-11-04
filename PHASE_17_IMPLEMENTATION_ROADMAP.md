# Phase 17: PrimeStack Implementation Roadmap

## Purpose

Turn the existing PrimeStack architecture into a sequence of verifiable releases. This is a delivery roadmap, not a proposal to add another business module.

## Current repository baseline

The workspace already contains two implementation surfaces:

- The root application is a Fastify/TypeScript modular monolith backed by Prisma, PostgreSQL, and Redis.
- `services/` contains independently packaged TypeScript services, a shared package, Docker Compose orchestration, and Kubernetes manifests. The service set already covers identity/authentication, security, IP filtering, ledger, transfers, risk, settlement, merchant-facing gateway functions, terminal management, routing, ISO 8583, audit, and notifications.

Treat these as existing foundations, not evidence of production readiness. Each capability must pass the release gates below before being called production-ready. Avoid implementing the same financial write path in both applications: designate one authoritative runtime for each production API and data owner, and document any migration or compatibility boundary before changing it.

The current service documentation describes the deployed architecture in [services/ARCHITECTURE.md](./services/ARCHITECTURE.md) and startup sequence in [services/START.md](./services/START.md). This roadmap supplements those documents with release sequencing and acceptance criteria.

## Delivery principles

1. **Ship a bounded MVP before expanding the platform.** Do not make PAG, autonomous operations, or every listed service a prerequisite for the first release.
2. **Preserve the existing stack by default.** Continue with TypeScript and Fastify, PostgreSQL, Redis, and the current RabbitMQ integration. NestJS, Kong/NGINX, Kafka, or a new repository split require an explicit architecture decision record (ADR), migration plan, and ownership justification.
3. **Make financial state authoritative.** The ledger is the system of record for posted balances and journal entries. Wallet and transfer APIs must not maintain independent spendable balances.
4. **Treat security, risk controls, audit, and recovery as launch requirements.** A feature list is not a production control. No public financial endpoint can bypass authentication, authorization, replay protection, limits, and audit requirements.
5. **Release from evidence.** Every milestone has automated tests, operational procedures, and an explicit go/no-go review. A service being present or starting in Compose is not a release gate.
6. **Keep intelligence advisory in the MVP.** Existing Phase 16 summaries and recommendations are informational; automated routing, fraud-rule changes, treasury actions, and self-healing remain out of scope until separately approved and controlled.

## MVP scope (Version 1)

### Included capabilities

- Identity and authentication for administrators, operators, and merchant/API clients.
- API security: HMAC verification, IP allowlisting, key lifecycle, replay protection, and role-based access.
- Ledger-backed accounts and wallet operations.
- Idempotent transfer orchestration with explicit state transitions.
- Merchant and admin portals for the supported MVP workflows.
- Settlement processing, reconciliation, and operational reports.
- Audit trail, service health, deployment, backup, and incident procedures needed to operate the above safely.

### Explicitly deferred

- New asset-gateway/PAG product capabilities and asset routing.
- Advanced TMS functionality beyond what is required for the selected launch workflows.
- New treasury automation, predictive analytics, AI models, autonomous actions, and cross-region active-active operation.
- Replacing the current framework, broker, API gateway, or repository structure without an approved ADR.

### MVP boundary decision

The service architecture currently includes risk evaluation in the transaction flow, while the proposed MVP list does not name Risk. For a live payment release, retain a minimum non-bypassable risk control in the transaction authorization path (at minimum configured limits and explicit block/review outcomes). Advanced risk analytics and model-driven decisions can remain deferred. Do not remove an existing risk check merely to match the feature list.

## Build sequence and release gates

| Step | Workstream | Main repository areas | Exit criteria |
|---|---|---|---|
| 0 | Establish a reproducible baseline | Root `package.json`, `services/*/package.json`, Compose and CI configuration | Each deployable package has a documented install/build/test command; CI runs those commands from a clean checkout; package and migration ownership is clear; existing failures are recorded separately from new failures. |
| 1 | Identity and security | `services/auth-service`, `services/security-service`, `services/ip-whitelist-service`, API gateway, root admin auth | Authentication and authorization are tested on every protected route; HMAC canonicalization and timestamp/replay behavior are specified; secrets are never logged; key creation, rotation, revocation, and recovery are auditable; denied access is tested. |
| 2 | Ledger foundation | `services/ledger-service`, root Prisma ledger if retained | Journal postings are atomic and balanced; concurrent updates preserve balance invariants; duplicate requests are idempotent; reversals are compensating entries rather than edits; reconciliation can detect any unexplained imbalance. |
| 3 | Wallets and transfers | Root wallet/transfer modules and `services/transfer-service` | Wallet balances derive from the ledger; account ownership and currency are checked; transfer lifecycle, timeout, retry, and reversal behavior are explicit; repeated client requests cannot post twice; failure-injection tests cover partial downstream outages. |
| 4 | Transaction entry and minimum risk controls | `services/api-gateway-service`, `services/switch-core`, `services/risk-service` | The gateway is the documented external entry point; authentication, allowlisting, request validation, idempotency, risk decision, and audit happen before an irreversible posting; declines and reviews have stable response semantics. |
| 5 | Settlement, reconciliation, and reports | `services/settlement-service`, root settlement/reporting modules | Settlement batches are reproducible and auditable; external/bank records can be reconciled with switch records; exceptions are visible and actionable; reports identify their source, period, currency, and generation time; reruns cannot settle a batch twice. |
| 6 | Merchant and admin MVP experience | Root merchant/admin modules and gateway routes | Merchant data is tenant-scoped; administrator actions are role-gated and audited; portal workflows use the same supported APIs as integrations; errors, pagination, and authorization behavior are tested. |
| 7 | End-to-end MVP qualification | `services/docker-compose.yml`, deployment and test configuration | A clean environment can be started, migrated, smoke-tested, and shut down from documented instructions; end-to-end tests cover authorized, declined, duplicate, timeout/retry, reversal, settlement, and reconciliation paths; no unresolved critical/high release blockers remain. |
| 8 | Controlled pilot and production release | Deployment, monitoring, runbooks, backup/restore procedures | Named owners approve operational and security risks; load and recovery targets are agreed and demonstrated; alerts and on-call escalation are exercised; backup restoration and rollback are rehearsed; pilot limits and stop conditions are documented before enabling real traffic. |

The sequence is dependency-aware: security precedes externally reachable financial operations; ledger precedes wallet and transfer posting; settlement and reconciliation validate the end-to-end accounting path; portals consume the same controlled APIs rather than bypassing service boundaries.

## Service-to-product mapping

| Product capability | Existing implementation candidates | Roadmap treatment |
|---|---|---|
| Identity and security | `services/auth-service`, `services/security-service`, `services/ip-whitelist-service`, root admin authentication | Consolidate responsibility and remove ambiguous/legacy authentication paths before MVP. |
| Ledger and wallets | `services/ledger-service`, root `src/modules/ledger`, `src/modules/wallet` | Select and document the authoritative ledger and wallet write path; prove financial invariants before expanding integrations. |
| Transfers and transaction switch | `services/transfer-service`, `services/switch-core`, root transfer and API-gateway modules | Define API ownership, idempotency contract, transaction states, and downstream failure behavior. |
| Risk | `services/risk-service`, root fraud module | Keep minimum controls in the MVP authorization path; defer advanced intelligence, not mandatory safeguards. |
| Settlement and reporting | `services/settlement-service`, root settlement/treasury/report modules | Qualify reconciliation and safe reruns before production settlement. |
| Merchant experience | Root merchant module and API gateway | Include the workflows required by the first customer cohort; keep merchant scoping server-enforced. |
| Terminal management | `services/terminal-service`, root terminal module | Extend in Version 2 except for terminal functions required by the MVP transaction path. |
| Routing and network control | `services/routing-service`, `services/iso8583-gateway`, root routing/ISO 8583 modules | Keep required transaction routing in the MVP where applicable; defer expanded NCC dashboards and adaptive routing. |
| Intelligence | Root `src/modules/intelligence` | Advisory/read-only in the MVP; autonomous actions need a separate control and approval design. |
| PAG and asset capabilities | Root `src/modules/pag` | Version 3; independently qualify custody, conversion, liquidity, compliance, and settlement boundaries before launch. |

## Version roadmap

### Version 1: controlled payment MVP

Deliver the MVP scope and pass all release gates. Start with a limited pilot and an agreed transaction/product boundary; expand only after operational evidence supports it.

### Version 2: operational scale

Add TMS/device monitoring, remote commands, merchant settlement workflows, API-platform enforcement, and treasury operations. Require authorization, approval, audit, and rollback controls for commands and treasury changes.

### Version 3: asset and network expansion

Add PAG, asset routing, multi-currency asset handling, network directory, and liquidity-engine capabilities. Require explicit custody and ledger boundaries, independently reconciled balances, compliance controls, and partner/network certification before enabling value movement.

### Version 4: intelligence and controlled automation

Improve forecasting, anomaly detection, and revenue/risk intelligence from validated, governed data. Automation is a separate release decision: begin with recommendations and human approval, then permit only narrowly scoped, reversible actions with policy bounds, audit evidence, kill switches, and tested rollback.

## Definition of done for each service change

- Request/response and event contracts are versioned or have an explicit compatibility policy.
- Input validation, authorization, tenant scoping, timeout, retry, idempotency, and error behavior are defined where applicable.
- Unit tests cover domain rules; integration tests cover persistence and downstream boundaries; contract tests cover service consumers.
- Financial writes are transactionally safe and auditable; sensitive data and credentials are excluded from logs.
- Database migrations are reviewed, repeatable in a clean environment, and have a documented rollback or forward-recovery procedure.
- Health/readiness behavior, structured logs, correlation identifiers, metrics, and actionable alerts are present.
- Runbook, ownership, deployment configuration, and rollback steps are updated with the implementation.

## Program-level release gates

Do not enable production traffic until all of the following are satisfied:

- **Financial integrity:** no unresolved ledger imbalance; duplicate/retried requests and reversals have verified outcomes.
- **Security:** threat review completed for exposed routes; authentication, authorization, secret handling, audit, and key rotation are exercised.
- **Resilience:** agreed service-level, capacity, recovery-time, and recovery-point objectives are documented and tested; restore and rollback have been rehearsed.
- **Operations:** monitoring, alert ownership, incident escalation, support responsibilities, and customer communication procedures are ready.
- **Compliance and data:** data classification, retention, access, and reporting obligations are reviewed for the launch jurisdictions and partners.
- **Release governance:** residual risks, pilot limits, stop conditions, and launch approval are recorded by accountable owners.

## Immediate next actions

1. Establish clean-checkout build/test results for the root application and each deployable service; separate dependency/tooling failures from code failures.
2. Produce a short ADR naming the authoritative runtime and database owner for each financial capability where both the root app and a standalone service exist.
3. Trace one end-to-end MVP payment path and record its API contracts, state transitions, ledger postings, risk decisions, settlement outcome, and audit events.
4. Turn each Step 0-8 exit criterion into tracked issues with an owner, dependency, and test evidence; estimate them only after code and environment gaps are confirmed.
5. Release behind a controlled pilot gate; do not treat the blueprint's target stack or layer count as a mandate to migrate working components.
