# Plaid Integration — Link + Auth

This guide describes how to add Plaid Link and Plaid Auth to the **root Fastify application** in this repository. The intended first release lets an authenticated merchant link a bank account and retrieve the account details needed for verification. It does **not** cover initiating ACH payments or Plaid Transfer.

> **Implementation status:** This repository does not currently include a Plaid SDK, Plaid API routes, Plaid database models, or Plaid environment configuration. The routes and configuration names below are proposed implementation steps, not endpoints or settings that are already available. Do not send live bank data to the application until the integration has been implemented, tested, and approved for production use.

## Contents

- [How the integration should work](#how-the-integration-should-work)
- [1. Create and configure a Plaid application](#1-create-and-configure-a-plaid-application)
- [2. Configure server credentials](#2-configure-server-credentials)
- [3. Define account ownership and storage](#3-define-account-ownership-and-storage)
- [4. Implement the backend API](#4-implement-the-backend-api)
- [5. Add Plaid Link to the client](#5-add-plaid-link-to-the-client)
- [6. Add webhooks if needed](#6-add-webhooks-if-needed)
- [7. Test in Sandbox](#7-test-in-sandbox)
- [8. Prepare for production](#8-prepare-for-production)
- [Security requirements](#security-requirements)
- [Suggested delivery checklist](#suggested-delivery-checklist)
- [Plaid documentation](#plaid-documentation)

## How the integration should work

The root API is a TypeScript/Fastify application assembled in `src/app.ts`, with PostgreSQL persistence through Prisma. The recommended Link + Auth flow is:

1. An authenticated client asks the PrimeStack backend for a short-lived Plaid Link token.
2. The client opens Plaid Link using that Link token.
3. After the customer successfully links an institution, the client sends the one-time `public_token` to the backend.
4. The backend exchanges the public token with Plaid and receives an `access_token` and `item_id`.
5. The backend encrypts and stores the access token, associated with the authenticated owner.
6. When verification details are needed, the backend calls Plaid Auth and returns only the minimum permitted information to the client.

The Plaid `access_token` must remain server-side. The client must never receive it.

## 1. Create and configure a Plaid application

1. Create an application in the Plaid Dashboard.
2. Begin with the **Sandbox** environment.
3. Request/enable the Plaid products and countries required for the intended account-linking and Auth use cases. Product availability, supported institutions, and production access depend on Plaid approval and the use case.
4. Configure allowed Link domains and any OAuth redirect URI required by the institutions or Link configuration you use.
5. Obtain Sandbox credentials from the Dashboard. Keep production credentials separate and do not use them during local development.
6. Review Plaid's current Auth, Link, privacy, and data-retention requirements for your jurisdiction and use case.

## 2. Configure server credentials

Add server-side Plaid configuration to `src/config/index.ts` and list the variable names (without values) in `.env.example`. The exact names are a project implementation choice; one proposed set is:

```dotenv
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
PLAID_COUNTRY_CODES=US
PLAID_REDIRECT_URI=
PLAID_TOKEN_ENCRYPTION_KEY=
```

Guidance:

- Validate configuration at startup, including the selected Plaid environment and required credentials.
- Use the Plaid SDK's environment constants rather than accepting an arbitrary API host from a request or environment value.
- Configure country codes and redirect URI for the actual product requirements. Do not treat the example values above as universally appropriate.
- Generate and store the token-encryption key in a secrets manager. Use a dedicated key-management plan; do not assume the existing `BANK_DETAILS_ENCRYPTION_KEY` is appropriate for Plaid tokens.
- Do not commit `.env`, credentials, access tokens, or encryption keys.

## 3. Define account ownership and storage

Before creating database models, decide whether each linked Item belongs to a merchant or to an individual end user. The root app already attaches a merchant identity to HMAC-authenticated requests, but an end-user flow would require its own authenticated owner identity and authorization rules. Do not accept an owner ID from an unauthenticated or untrusted request body.

Add Prisma models and a migration for the selected ownership model. Store only what the product needs, such as:

- Owner/merchant relationship.
- Plaid `item_id`, institution identifier/name, and connection status.
- Plaid `access_token`, encrypted before persistence.
- Account identifiers required for server-side lookup, with account metadata/masks only where possible.
- Creation/update timestamps and optional consent or re-link state required by the application.

Do not store full account/routing numbers or raw Auth responses unless required and approved. If any sensitive account data must be retained, encrypt it and define access controls, retention, deletion, and key-rotation procedures before launch. The normal API response should expose only limited account metadata, such as a display name, account type, and mask.

## 4. Implement the backend API

Create a `src/modules/plaid/` module with Zod validation, service logic, routes, and module registration in `src/app.ts`. Follow existing module patterns and use the project's response/error helpers.

Suggested endpoints (names can be adjusted to the API conventions):

| Endpoint | Purpose |
|---|---|
| `POST /plaid/link-token` | Create a Link token for the authenticated owner and requested products/country settings. |
| `POST /plaid/public-token` | Validate and exchange the one-time public token; encrypt and save the resulting access token. |
| `GET /plaid/accounts` | Return limited account metadata for the authenticated owner's linked Items. |
| `POST /plaid/items/:id/auth` | Retrieve/refresh Auth data server-side when verification is needed; return only approved fields. |
| `DELETE /plaid/items/:id` | Revoke/remove the linked Item through the appropriate Plaid flow and delete or retain local data according to policy. |

Implementation requirements:

- Authenticate every merchant/user route and enforce ownership on every Item and account lookup.
- Obtain the owner from verified authentication context, not a request-supplied owner ID.
- Validate all request bodies and parameters.
- Exchange `public_token` only on the backend, and avoid logging either token.
- Handle Plaid API errors explicitly. Do not return credentials, raw provider errors, or success-shaped fallback data.
- Make exchange and persistence safe against retries so the same Link completion cannot create duplicate local Items.
- Return only necessary account data; do not return access tokens or full account/routing numbers.

The existing HMAC plugin applies to non-admin routes. It is designed for server-to-server callers and must not be used by putting an HMAC secret in browser code. Choose an appropriate authenticated browser-to-backend session or token flow before exposing Link endpoints in a web client.

## 5. Add Plaid Link to the client

1. Add Plaid Link to an authenticated merchant-facing client, not to an unauthenticated public page.
2. Request a Link token from `POST /plaid/link-token`.
3. Initialize Plaid Link with the returned Link token using Plaid's supported client library.
4. On successful Link, send the one-time `public_token` to `POST /plaid/public-token`.
5. Show a clear success, failure, and re-link state without displaying provider credentials or sensitive account values.

Do not put the Plaid client secret, Plaid access token, encryption key, or an HMAC signing secret in browser JavaScript. The standalone dashboard is documented as a demo/operational preview, not an authenticated merchant portal.

## 6. Add webhooks if needed

Webhooks are optional for a minimal Link + Auth verification flow, but may be needed to keep Item status current.

If webhooks are implemented:

- Create a dedicated endpoint and verify each webhook using Plaid's documented signature-verification process before processing it.
- Make processing idempotent and tolerate retries and out-of-order delivery.
- Persist only the event details needed to update local status; do not log secrets or sensitive account data.
- The global HMAC plugin currently protects non-admin routes. Exempt the webhook path narrowly only when the Plaid signature verification is implemented and tested. Never leave a webhook endpoint unverified.

## 7. Test in Sandbox

Add automated tests for:

- Plaid configuration validation and environment selection.
- Link-token creation and the requested products/country settings.
- Public-token exchange, encryption, and database persistence.
- Ownership checks, including attempts to read or delete another owner's Item.
- Duplicate/retried token exchange behavior.
- Limited API response fields and redaction of tokens/account details.
- Plaid API failures, invalid input, and database failures.
- Webhook signature verification and duplicate delivery, if webhooks are implemented.

Then complete an end-to-end Sandbox test:

1. Start the root Fastify API using the setup steps in [SETUP.md](./SETUP.md).
2. Link a Plaid Sandbox institution through the authenticated client.
3. Confirm the Item and encrypted access token are persisted.
4. Request Auth data and confirm the response contains only the approved minimum.
5. Confirm logs, errors, database-facing admin views, and browser traffic do not expose secrets or full account details.
6. Exercise unlinking, provider errors, and re-linking.

Do not use production credentials or real customer account data for local tests.

## 8. Prepare for production

Before enabling production:

1. Complete Plaid's required production access, product approval, and compliance steps.
2. Configure production credentials in a secrets manager and select Plaid's production environment explicitly.
3. Deploy only behind HTTPS and configure the exact allowed Link domains and OAuth redirect URIs.
4. Review authorization, ownership scoping, rate limits, audit logging, data minimization, retention, and deletion behavior.
5. Define encryption-key backup, rotation, and recovery procedures. Losing a key without a recovery plan can make stored Plaid access tokens unusable.
6. Test institution availability, OAuth, expired/revoked connections, re-linking, retries, and operational alerts.
7. Obtain the required security, legal, privacy, and business approvals before linking live accounts.

Link + Auth does not itself move money or guarantee that an account is eligible for a particular payment. Do not use a successful link or Auth response as a substitute for payment authorization, settlement, reconciliation, or Plaid's product-specific requirements.

## Security requirements

- Treat Plaid access tokens as high-sensitivity credentials: encrypt at rest, restrict access, and never expose them to the client.
- Never commit credentials or secrets, and never write them to application logs or error responses.
- Scope every record and operation to the authenticated owner.
- Store and return the least data needed for the approved use case.
- Use Plaid's documented token revocation/unlink flow and remove retained data according to applicable policy.
- Keep development/Sandbox and production credentials and data fully separated.
- Do not treat the existing TCP bank-host connection test or encrypted bank-account profile feature as a Plaid integration; they are separate project capabilities.

## Suggested delivery checklist

- [ ] Confirm owner model, countries, products, and account-verification use case.
- [ ] Create and configure a Plaid Dashboard application for Sandbox.
- [ ] Add SDK and validated server configuration.
- [ ] Add encrypted token storage, Prisma migration, and ownership constraints.
- [ ] Implement authenticated Link-token, token-exchange, account, Auth, and unlink operations.
- [ ] Integrate Link in an authenticated client.
- [ ] Add scoped webhook handling if required.
- [ ] Add automated tests and complete Sandbox end-to-end testing.
- [ ] Complete production approvals, secrets setup, security/privacy review, and operational readiness.

## Plaid documentation

Use the current official Plaid documentation for SDK versions, API details, product eligibility, and security requirements:

- [Plaid Link](https://plaid.com/docs/link/)
- [Plaid Auth](https://plaid.com/docs/auth/)
- [Plaid API quickstart](https://plaid.com/docs/quickstart/)
- [Plaid webhooks](https://plaid.com/docs/api/webhooks/)
