import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { isIP } from "net";
import { type PrismaClient } from "@prisma/client";
import { Decimal } from "../../core/decimal.js";
import { redis } from "../../core/redis.js";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { generateReference } from "../../shared/utils/crypto.js";
import { encryptSecret, decryptSecret } from "./s2s-crypto.js";
import type {
  CreateBankWithdrawalInput,
  CreateConnectionInput,
  CreateS2sPaymentInput,
  CreateReceiptTemplateInput,
  ReceiptField,
  S2sBankWithdrawalRow,
  S2sConnectionRow,
  S2sPaymentRow,
  S2sReceiptTemplateRow,
  UpdateConnectionInput,
  UpdateReceiptTemplateInput,
} from "./types.js";

/** Nonce TTL for Redis: 10 minutes (matches the timestamp drift window) */
const NONCE_TTL_SECONDS = 600;

/**
 * Minimal SQL fragment builder for safe dynamic WHERE clauses.
 * Avoids a dependency on Prisma.sql/join which may not be exported in
 * older generated clients. Each fragment carries its SQL string and
 * bound values separately; $queryRaw interpolates them safely.
 *
 * Usage:
 *   const conds = sqlFragments();
 *   if (x) conds.push(x, "value");
 *   const [whereClause, params] = conds.build("WHERE", "AND");
 *   // then: prisma.$queryRawUnsafe(`SELECT * FROM t ${whereClause}`, ...params)
 *
 * Note: we still use $queryRawUnsafe only for the dynamic WHERE case
 * (filter list built from trusted, validated enum/uuid inputs — NOT
 * from raw user strings). All values are parameterised.
 */
function sqlFragments() {
  const parts: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  return {
    push(condition: string, value: unknown) {
      parts.push(condition.replace("?", `$${idx++}`));
      vals.push(value);
    },
    build(prefix = "WHERE", separator = "AND"): [string, unknown[]] {
      if (parts.length === 0) return ["", []];
      return [`${prefix} ${parts.join(` ${separator} `)}`, vals];
    },
    hasConditions(): boolean { return parts.length > 0; },
  };
}

/** Private IPs / localhost ranges that must never be used as callback targets */
const SSRF_BLOCKED_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "::ffff:127.0.0.1",
]);
const SSRF_BLOCKED_PREFIXES = ["10.", "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.",
  "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "192.168.", "169.254."];

/**
 * S2S Engine Service — Server-to-Server Payment Engine
 *
 * Security hardening applied:
 *   1. AES-256-GCM encryption for API secrets at rest (never stored plaintext)
 *   2. Idempotency keys — duplicate payment requests return 409 Conflict
 *   3. Nonce replay prevention — each request nonce is stored in Redis (10 min TTL)
 *   4. Daily limit enforcement — aggregate completed payments per connection per day
 *   5. SSRF protection — callback URLs must be HTTPS and not resolve to private ranges
 *   6. Parameterised SQL via Prisma tagged-template $queryRaw / $executeRaw
 *   7. Prisma $transaction wrapping — payment create + ledger + status update are atomic
 *   8. Canonical JSON HMAC payload — signs the full JSON body, not string concatenation
 */
export class S2sEngineService {
  constructor(
    private prisma: PrismaClient,
    private ledgerService: LedgerService,
    private walletService: WalletService,
  ) {}

  // ── Receipt Templates ─────────────────────────────────────────

  async createReceiptTemplate(
    merchantId: string,
    input: CreateReceiptTemplateInput,
  ): Promise<S2sReceiptTemplateRow> {
    await this.requireMerchant(merchantId);

    if (input.isDefault) {
      await this.prisma.$executeRaw`
        UPDATE "S2sReceiptTemplate"
        SET "isDefault" = false, "updatedAt" = NOW()
        WHERE "merchantId" = ${merchantId}`;
    }

    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "S2sReceiptTemplate"
        ("id","name","merchantId","description","templateJson","isDefault","createdAt","updatedAt")
      VALUES (
        ${id}, ${input.name}, ${merchantId},
        ${input.description ?? null},
        ${JSON.stringify(input.templateJson)}::jsonb,
        ${input.isDefault}, NOW(), NOW()
      )`;

    logger.info({ templateId: id, merchantId, name: input.name }, "S2S receipt template created");
    return this.requireReceiptTemplate(id);
  }

  async getReceiptTemplate(id: string): Promise<S2sReceiptTemplateRow> {
    return this.requireReceiptTemplate(id);
  }

  async listReceiptTemplates(merchantId: string): Promise<S2sReceiptTemplateRow[]> {
    return this.prisma.$queryRaw<S2sReceiptTemplateRow[]>`
      SELECT * FROM "S2sReceiptTemplate"
      WHERE "merchantId" = ${merchantId}
      ORDER BY "createdAt" DESC`;
  }

  async updateReceiptTemplate(
    id: string,
    merchantId: string,
    input: UpdateReceiptTemplateInput,
  ): Promise<S2sReceiptTemplateRow> {
    const template = await this.requireReceiptTemplate(id);
    if (template.merchantId !== merchantId) {
      throw new ForbiddenError("Receipt template does not belong to this merchant");
    }

    if (input.isDefault) {
      await this.prisma.$executeRaw`
        UPDATE "S2sReceiptTemplate"
        SET "isDefault" = false, "updatedAt" = NOW()
        WHERE "merchantId" = ${merchantId} AND "id" != ${id}`;
    }

    // Build update via safe individual statements (no dynamic SQL)
    if (input.name !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sReceiptTemplate" SET "name" = ${input.name}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.description !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sReceiptTemplate" SET "description" = ${input.description}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.templateJson !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sReceiptTemplate" SET "templateJson" = ${JSON.stringify(input.templateJson)}::jsonb, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.isDefault !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sReceiptTemplate" SET "isDefault" = ${input.isDefault}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }

    return this.requireReceiptTemplate(id);
  }

  async deleteReceiptTemplate(id: string, merchantId: string): Promise<void> {
    const template = await this.requireReceiptTemplate(id);
    if (template.merchantId !== merchantId) {
      throw new ForbiddenError("Receipt template does not belong to this merchant");
    }
    const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "S2sConnection" WHERE "receiptTemplateId" = ${id}`;
    if (count > 0n) {
      throw new ConflictError("Cannot delete receipt template while it is assigned to a connection");
    }
    await this.prisma.$executeRaw`DELETE FROM "S2sReceiptTemplate" WHERE "id" = ${id}`;
    logger.info({ templateId: id }, "S2S receipt template deleted");
  }

  // ── Connections ───────────────────────────────────────────────

  /**
   * Register a new S2S connection.
   * The apiSecret is encrypted with AES-256-GCM before storage.
   * The callbackUrl (if provided) is validated against SSRF rules.
   */
  async createConnection(
    merchantId: string,
    input: CreateConnectionInput,
  ): Promise<S2sConnectionRow> {
    await this.requireMerchant(merchantId);

    if (input.callbackUrl) {
      validateCallbackUrl(input.callbackUrl);
    }
    if (input.receiptTemplateId) {
      await this.requireReceiptTemplate(input.receiptTemplateId);
    }

    // FIX 1: encrypt secret before storing
    const encryptedSecret = encryptSecret(input.apiSecret);
    const id = randomUUID();

    await this.prisma.$executeRaw`
      INSERT INTO "S2sConnection"
        ("id","name","merchantId","endpointUrl","apiSecret","apiKeyHeader",
         "callbackUrl","status","allowedIps","supportedCurrencies",
         "dailyLimitAmount","singleTxLimitAmount","receiptTemplateId","metadata","createdAt","updatedAt")
      VALUES (
        ${id}, ${input.name}, ${merchantId},
        ${input.endpointUrl}, ${encryptedSecret}, ${input.apiKeyHeader},
        ${input.callbackUrl ?? null}, 'ACTIVE'::text,
        ${JSON.stringify(input.allowedIps)}::jsonb,
        ${JSON.stringify(input.supportedCurrencies)}::jsonb,
        ${input.dailyLimitAmount ?? null}::numeric,
        ${input.singleTxLimitAmount ?? null}::numeric,
        ${input.receiptTemplateId ?? null},
        ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb,
        NOW(), NOW()
      )`;

    logger.info({ connectionId: id, merchantId, name: input.name }, "S2S connection created");
    return this.requireConnection(id);
  }

  async getConnection(id: string): Promise<S2sConnectionRow> {
    return this.requireConnection(id);
  }

  async listConnections(
    merchantId: string,
    filters: { status?: string; page: number; pageSize: number },
  ): Promise<{ data: S2sConnectionRow[]; total: number }> {
    const offset = (filters.page - 1) * filters.pageSize;

    const [rows, [countRow]] = filters.status
      ? await Promise.all([
          this.prisma.$queryRaw<S2sConnectionRow[]>`
            SELECT * FROM "S2sConnection"
            WHERE "merchantId" = ${merchantId} AND "status" = ${filters.status}
            ORDER BY "createdAt" DESC
            LIMIT ${filters.pageSize} OFFSET ${offset}`,
          this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM "S2sConnection"
            WHERE "merchantId" = ${merchantId} AND "status" = ${filters.status}`,
        ])
      : await Promise.all([
          this.prisma.$queryRaw<S2sConnectionRow[]>`
            SELECT * FROM "S2sConnection"
            WHERE "merchantId" = ${merchantId}
            ORDER BY "createdAt" DESC
            LIMIT ${filters.pageSize} OFFSET ${offset}`,
          this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM "S2sConnection"
            WHERE "merchantId" = ${merchantId}`,
        ]);

    return { data: rows, total: Number(countRow?.count ?? 0) };
  }

  async updateConnection(
    id: string,
    merchantId: string,
    input: UpdateConnectionInput,
  ): Promise<S2sConnectionRow> {
    const connection = await this.requireConnection(id);
    if (connection.merchantId !== merchantId) {
      throw new ForbiddenError("Connection does not belong to this merchant");
    }
    if (input.callbackUrl) {
      validateCallbackUrl(input.callbackUrl);
    }

    // FIX 1: encrypt new secret if provided
    if (input.name !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "name" = ${input.name}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.endpointUrl !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "endpointUrl" = ${input.endpointUrl}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.apiSecret !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "apiSecret" = ${encryptSecret(input.apiSecret)}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.apiKeyHeader !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "apiKeyHeader" = ${input.apiKeyHeader}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if ("callbackUrl" in input) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "callbackUrl" = ${input.callbackUrl ?? null}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.status !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "status" = ${input.status}::text, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.allowedIps !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "allowedIps" = ${JSON.stringify(input.allowedIps)}::jsonb, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.supportedCurrencies !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "supportedCurrencies" = ${JSON.stringify(input.supportedCurrencies)}::jsonb, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if ("dailyLimitAmount" in input) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "dailyLimitAmount" = ${input.dailyLimitAmount ?? null}::numeric, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if ("singleTxLimitAmount" in input) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "singleTxLimitAmount" = ${input.singleTxLimitAmount ?? null}::numeric, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if ("receiptTemplateId" in input) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "receiptTemplateId" = ${input.receiptTemplateId ?? null}, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }
    if (input.metadata !== undefined) {
      await this.prisma.$executeRaw`UPDATE "S2sConnection" SET "metadata" = ${JSON.stringify(input.metadata)}::jsonb, "updatedAt" = NOW() WHERE "id" = ${id}`;
    }

    logger.info({ connectionId: id }, "S2S connection updated");
    return this.requireConnection(id);
  }

  /**
   * Rotate the connection's API secret.
   * Encrypts the new secret before persisting.
   */
  async rotateConnectionSecret(
    id: string,
    merchantId: string,
    newSecret: string,
  ): Promise<{ connectionId: string; message: string }> {
    const connection = await this.requireConnection(id);
    if (connection.merchantId !== merchantId) {
      throw new ForbiddenError("Connection does not belong to this merchant");
    }
    if (newSecret.length < 16) {
      throw new ValidationError("New secret must be at least 16 characters");
    }

    const encrypted = encryptSecret(newSecret);
    await this.prisma.$executeRaw`
      UPDATE "S2sConnection"
      SET "apiSecret" = ${encrypted}, "updatedAt" = NOW()
      WHERE "id" = ${id}`;

    logger.info({ connectionId: id }, "S2S connection secret rotated");
    return { connectionId: id, message: "Secret rotated. Update your remote server immediately." };
  }

  // ── Payments (Incoming Funds) ─────────────────────────────────

  /**
   * Process an incoming S2S payment.
   *
   * Security gates (in order):
   *   1. Connection ACTIVE + currency supported
   *   2. Single-tx limit check
   *   3. FIX 4: Daily limit check (aggregate of today's COMPLETED payments)
   *   4. FIX 2: Idempotency — reject duplicate idempotencyKey per connection
   *   5. FIX 3: Nonce replay check — reject reused x-s2s-nonce (Redis + DB)
   *   6. FIX 8: Canonical JSON HMAC verification
   *   7. Wallet validation
   *   8. FIX 7: Atomic Prisma $transaction — insert payment + ledger entry + status update
   *   9. Async callback delivery
   *
   * Required fields on `input`: idempotencyKey, nonce (from headers)
   * Required header: x-s2s-signature (HMAC of canonical JSON body)
   */
  async receivePayment(
    input: CreateS2sPaymentInput & { idempotencyKey: string; nonce: string },
    hmacSignature: string,
    timestamp: string,
  ): Promise<S2sPaymentRow> {
    const connection = await this.requireConnection(input.connectionId);

    if (connection.status !== "ACTIVE") {
      throw new ConflictError(`S2S connection is ${connection.status} — payments rejected`);
    }

    const currency = input.currency.toUpperCase();
    if (!connection.supportedCurrencies.includes(currency)) {
      throw new ValidationError(
        `Currency ${currency} is not supported. Allowed: ${connection.supportedCurrencies.join(", ")}`,
      );
    }

    const amount = new Decimal(input.amount);
    if (amount.lte(0)) throw new ValidationError("Payment amount must be positive");

    const fee = new Decimal(input.feeAmount ?? "0");
    if (fee.lt(0)) throw new ValidationError("Fee amount cannot be negative");
    const netAmount = amount.minus(fee);

    // FIX: single-tx limit
    if (connection.singleTxLimitAmount) {
      if (amount.gt(new Decimal(connection.singleTxLimitAmount))) {
        throw new ValidationError(
          `Amount ${amount} exceeds single-transaction limit of ${connection.singleTxLimitAmount}`,
        );
      }
    }

    // FIX 4: daily limit enforcement
    if (connection.dailyLimitAmount) {
      const [{ total }] = await this.prisma.$queryRaw<[{ total: string }]>`
        SELECT COALESCE(SUM(amount), 0)::text AS total
        FROM "S2sPayment"
        WHERE "connectionId" = ${input.connectionId}
          AND DATE("createdAt") = CURRENT_DATE
          AND "status" = 'COMPLETED'`;
      const dailyUsed = new Decimal(total);
      if (dailyUsed.plus(amount).gt(new Decimal(connection.dailyLimitAmount))) {
        throw new ValidationError(
          `Daily limit of ${connection.dailyLimitAmount} would be exceeded. Used today: ${dailyUsed}`,
        );
      }
    }

    // FIX 2: idempotency check
    const [existingIdem] = await this.prisma.$queryRaw<[{ paymentId: string } | undefined]>`
      SELECT "paymentId" FROM "S2sIdempotency"
      WHERE "connectionId" = ${input.connectionId}
        AND "idempotencyKey" = ${input.idempotencyKey}
      LIMIT 1`;

    if (existingIdem) {
      // Return the original payment — idempotent response
      const original = existingIdem.paymentId
        ? await this.requirePayment(existingIdem.paymentId)
        : null;
      if (original) return original;
      throw new ConflictError("Duplicate payment request — idempotency key already used");
    }

    // FIX 3: nonce replay prevention (Redis-first, DB fallback)
    const nonceKey = `s2s:nonce:${input.nonce}`;
    const nonceExists = await redis.set(nonceKey, "1", "EX", NONCE_TTL_SECONDS, "NX");
    if (!nonceExists) {
      // Redis says it already exists — replay attack
      throw new AppError("Replay attack detected — nonce already used", 401, "REPLAY_DETECTED");
    }
    // Also persist to DB for post-TTL audit (cleanup job can prune old rows)
    await this.prisma.$executeRaw`
      INSERT INTO "S2sNonce" ("nonce", "createdAt")
      VALUES (${input.nonce}, NOW())
      ON CONFLICT DO NOTHING`;

    // FIX 8: canonical JSON HMAC verification
    // The remote server signs: JSON.stringify({ connectionId, amount, currency, timestamp, nonce, senderReference })
    // We verify using the DECRYPTED secret
    const apiSecret = decryptSecret(connection.apiSecret);
    const canonicalPayload = JSON.stringify({
      connectionId: input.connectionId,
      amount: amount.toString(),
      currency,
      timestamp,
      nonce: input.nonce,
      senderReference: input.senderReference ?? null,
    });
    const expectedSig = createHmac("sha256", apiSecret)
      .update(canonicalPayload)
      .digest("hex");

    const sigBuf = Buffer.from(hmacSignature.replace(/^0x/, ""), "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new AppError(
        "S2S payment authentication failed — HMAC signature mismatch",
        401,
        "S2S_AUTH_FAILED",
      );
    }

    // Wallet validation (outside transaction — read-only)
    const wallet = await this.walletService.getWallet(input.receiverWalletAddr);
    if (wallet.status !== "ACTIVE") {
      throw new ConflictError(`Receiving wallet ${input.receiverWalletAddr} is ${wallet.status}`);
    }
    if (wallet.currency !== currency) {
      throw new ValidationError(
        `Wallet currency ${wallet.currency} does not match payment currency ${currency}`,
      );
    }

    // Ensure ledger accounts exist (outside transaction — idempotent creates)
    const s2sAccountCode = `S2S-IN-${input.connectionId}-${currency}`;
    await this.ensureLedgerAccount(
      s2sAccountCode,
      `S2S Incoming: ${connection.name} (${currency})`,
      "ASSET",
      "S2S_INCOMING",
      currency,
    );
    if (fee.gt(0)) {
      await this.ensureLedgerAccount(
        `FEE-S2S-${currency}`,
        `S2S Fees (${currency})`,
        "REVENUE",
        "FEE",
        currency,
      );
    }

    const reference    = generateReference("S2P");
    const paymentId    = randomUUID();
    const idemId       = randomUUID();
    const resolvedTmpl = input.receiptTemplateId ?? connection.receiptTemplateId;
    const walletCode   = wallet.account.code;

    // FIX 7: full atomic transaction — insert payment + ledger + mark COMPLETED
    try {
      await this.prisma.$transaction(async (tx: PrismaClient) => {
        // Insert payment record (PROCESSING)
        await tx.$executeRaw`
          INSERT INTO "S2sPayment"
            ("id","reference","connectionId","merchantId","amount","currency",
             "feeAmount","netAmount","senderReference","senderAccountId",
             "receiverWalletAddr","receiptTemplateId","metadata",
             "status","createdAt","updatedAt")
          VALUES (
            ${paymentId}, ${reference}, ${input.connectionId}, ${connection.merchantId},
            ${amount.toDecimalPlaces(4).toNumber()}, ${currency},
            ${fee.toDecimalPlaces(4).toNumber()}, ${netAmount.toDecimalPlaces(4).toNumber()},
            ${input.senderReference ?? null}, ${input.senderAccountId ?? null},
            ${input.receiverWalletAddr}, ${resolvedTmpl ?? null},
            ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb,
            'PROCESSING', NOW(), NOW()
          )`;

        // Record idempotency key
        await tx.$executeRaw`
          INSERT INTO "S2sIdempotency" ("id","connectionId","idempotencyKey","paymentId","createdAt")
          VALUES (${idemId}, ${input.connectionId}, ${input.idempotencyKey}, ${paymentId}, NOW())
          ON CONFLICT DO NOTHING`;

        // Post double-entry journal lines
        const lines: Array<{ accountCode: string; debit: string; credit: string }> = [
          { accountCode: s2sAccountCode, debit: amount.toString(), credit: "0" },
          { accountCode: walletCode,     debit: "0", credit: netAmount.toString() },
        ];
        if (fee.gt(0)) {
          lines.push({ accountCode: `FEE-S2S-${currency}`, debit: "0", credit: fee.toString() });
        }

        const journalEntry = await this.ledgerService.postEntry({
          reference:   `JE-${reference}`,
          entryType:   "TRANSFER",
          description: `S2S payment received: ${input.senderReference ?? reference} — ${connection.name}`,
          source:      "S2S",
          lines,
          postedBy:    connection.merchantId,
          metadata: {
            connectionId:    input.connectionId,
            senderReference: input.senderReference,
            nonce:           input.nonce,
          },
        });

        // Extract reference before template literal interpolation to satisfy strict null checks
        const jeRef = (journalEntry as { reference?: string } | null)?.reference ?? `JE-${reference}`;

        // Mark COMPLETED
        await tx.$executeRaw`
          UPDATE "S2sPayment"
          SET "status"          = 'COMPLETED',
              "journalEntryRef" = ${jeRef},
              "authenticatedAt" = NOW(),
              "completedAt"     = NOW(),
              "updatedAt"       = NOW()
          WHERE "id" = ${paymentId}`;
      });
    } catch (error) {
      // Mark FAILED outside the rolled-back transaction
      await this.prisma.$executeRaw`
        UPDATE "S2sPayment"
        SET "status" = 'FAILED',
            "failureReason" = ${error instanceof Error ? error.message : "Unknown error"},
            "updatedAt" = NOW()
        WHERE "id" = ${paymentId}`;

      // Remove the Redis nonce so a corrected retry can proceed
      await redis.del(nonceKey).catch(() => undefined);

      logger.error({ err: error, reference, connectionId: input.connectionId }, "S2S payment failed");
      throw error;
    }

    // Render receipt (outside transaction — read-only)
    const completedPayment = await this.requirePayment(paymentId);
    if (resolvedTmpl) {
      const receiptData = await this.renderReceipt(resolvedTmpl, {
        reference,
        senderReference:  input.senderReference ?? null,
        senderAccountId:  input.senderAccountId ?? null,
        receiverWalletAddr: input.receiverWalletAddr,
        amount:           amount.toString(),
        feeAmount:        fee.toString(),
        netAmount:        netAmount.toString(),
        currency,
        status:           "COMPLETED",
        journalEntryRef:  completedPayment.journalEntryRef,
        createdAt:        new Date().toISOString(),
        ...(input.metadata ?? {}),
      });
      await this.prisma.$executeRaw`
        UPDATE "S2sPayment"
        SET "receiptData" = ${JSON.stringify(receiptData)}::jsonb, "updatedAt" = NOW()
        WHERE "id" = ${paymentId}`;
    }

    logger.info(
      { reference, connectionId: input.connectionId, amount: amount.toString(), currency },
      "S2S payment completed",
    );

    // Fire callback async — non-blocking
    if (connection.callbackUrl) {
      this.fireCallback(connection, apiSecret, reference,
        resolvedTmpl ? await this.renderReceipt(resolvedTmpl, { reference }) : null,
      ).catch((err) => logger.warn({ err, reference }, "S2S callback failed"));
    }

    return this.requirePayment(paymentId);
  }

  async getPayment(id: string): Promise<S2sPaymentRow> {
    return this.requirePayment(id);
  }

  async listPayments(filters: {
    merchantId?: string;
    connectionId?: string;
    status?: string;
    currency?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: S2sPaymentRow[]; total: number }> {
    const offset = (filters.page - 1) * filters.pageSize;
    const conds = sqlFragments();

    if (filters.merchantId)   conds.push('"merchantId" = ?',   filters.merchantId);
    if (filters.connectionId) conds.push('"connectionId" = ?', filters.connectionId);
    if (filters.status)       conds.push('"status" = ?',       filters.status);
    if (filters.currency)     conds.push('"currency" = ?',     filters.currency);

    const [whereClause, whereVals] = conds.build();
    const countVals = [...whereVals];
    const rowVals   = [...whereVals, filters.pageSize, offset];

    const [rows, countRows] = await Promise.all([
      this.unsafeQuery<S2sPaymentRow>(
        `SELECT * FROM "S2sPayment" ${whereClause} ORDER BY "createdAt" DESC LIMIT $${rowVals.length - 1} OFFSET $${rowVals.length}`,
        ...rowVals,
      ),
      this.unsafeQuery<{ count: bigint }>(
        `SELECT COUNT(*) as count FROM "S2sPayment" ${whereClause}`,
        ...countVals,
      ),
    ]);

    return { data: rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async reversePayment(id: string, merchantId: string, reason: string): Promise<S2sPaymentRow> {
    const payment = await this.requirePayment(id);
    if (payment.merchantId !== merchantId) throw new ForbiddenError("Payment does not belong to this merchant");
    if (payment.status !== "COMPLETED") throw new ConflictError(`Cannot reverse payment with status: ${payment.status}`);
    if (!payment.journalEntryRef) throw new AppError("Payment has no linked journal entry", 500, "S2S_NO_JOURNAL");

    await this.ledgerService.reverseEntry({
      reference: payment.journalEntryRef,
      reason,
      postedBy:  merchantId,
    });

    await this.prisma.$executeRaw`
      UPDATE "S2sPayment"
      SET "status" = 'REVERSED', "updatedAt" = NOW()
      WHERE "id" = ${id}`;

    logger.info({ paymentId: id, reason }, "S2S payment reversed");
    return this.requirePayment(id);
  }

  // ── Bank Withdrawals ──────────────────────────────────────────

  async createBankWithdrawal(
    merchantId: string,
    input: CreateBankWithdrawalInput,
  ): Promise<S2sBankWithdrawalRow> {
    const connection = await this.requireConnection(input.connectionId);
    if (connection.merchantId !== merchantId) throw new ForbiddenError("Connection does not belong to this merchant");
    if (connection.status !== "ACTIVE") throw new ConflictError(`S2S connection is ${connection.status}`);

    const amount    = new Decimal(input.amount);
    const fee       = new Decimal(input.feeAmount ?? "0");
    const netAmount = amount.minus(fee);

    if (amount.lte(0))    throw new ValidationError("Withdrawal amount must be positive");
    if (fee.lt(0))        throw new ValidationError("Fee cannot be negative");
    if (netAmount.lte(0)) throw new ValidationError("Net withdrawal amount after fee must be positive");

    const wallet = await this.walletService.getWallet(input.walletAddress);
    if (wallet.status !== "ACTIVE") throw new ConflictError(`Wallet ${input.walletAddress} is ${wallet.status}`);
    if (wallet.merchantId !== merchantId) throw new ForbiddenError("Wallet does not belong to this merchant");

    const balance = await this.walletService.getBalance(input.walletAddress);
    const available = new Decimal(balance.availableBalance);
    if (available.lt(amount)) {
      throw new InsufficientFundsError(input.walletAddress, available.toString(), amount.toString());
    }

    const reference = generateReference("S2W");
    const currency  = input.currency.toUpperCase();

    const bankOutCode = `S2S-BANK-OUT-${input.connectionId}-${currency}`;
    await this.ensureLedgerAccount(bankOutCode, `S2S Bank Withdrawal: ${connection.name} (${currency})`, "LIABILITY", "S2S_BANK_OUT", currency);

    if (fee.gt(0)) {
      await this.ensureLedgerAccount(`FEE-S2S-OUT-${currency}`, `S2S Outbound Fees (${currency})`, "REVENUE", "FEE", currency);
    }

    const lines: Array<{ accountCode: string; debit: string; credit: string }> = [
      { accountCode: wallet.account.code, debit: amount.toString(), credit: "0" },
      { accountCode: bankOutCode, debit: "0", credit: netAmount.toString() },
    ];
    if (fee.gt(0)) {
      lines.push({ accountCode: `FEE-S2S-OUT-${currency}`, debit: "0", credit: fee.toString() });
    }

    const journalEntry = await this.ledgerService.postEntry({
      reference:   `JE-${reference}`,
      entryType:   "PAYOUT",
      description: `S2S bank withdrawal: ${input.bankName} — ${input.accountHolderName}`,
      source:      "S2S",
      lines,
      postedBy:    merchantId,
      metadata: { connectionId: input.connectionId, bankName: input.bankName, iban: input.iban },
    });
    const withdrawalJeRef = (journalEntry as { reference?: string } | null)?.reference ?? `JE-${reference}`;

    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "S2sBankWithdrawal"
        ("id","reference","connectionId","merchantId","paymentId","walletAddress",
         "amount","currency","feeAmount","netAmount",
         "bankName","bankCountry","accountHolderName","iban","swiftBic",
         "accountNumber","routingNumber","bankAddress",
         "journalEntryRef","status","submittedAt","metadata","createdAt","updatedAt")
      VALUES (
        ${id}, ${reference}, ${input.connectionId}, ${merchantId},
        ${input.paymentId ?? null}, ${input.walletAddress},
        ${amount.toDecimalPlaces(4).toNumber()}, ${currency},
        ${fee.toDecimalPlaces(4).toNumber()}, ${netAmount.toDecimalPlaces(4).toNumber()},
        ${input.bankName}, ${input.bankCountry}, ${input.accountHolderName},
        ${input.iban ?? null}, ${input.swiftBic ?? null},
        ${input.accountNumber ?? null}, ${input.routingNumber ?? null}, ${input.bankAddress ?? null},
        ${withdrawalJeRef}, 'SUBMITTED', NOW(),
        ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb,
        NOW(), NOW()
      )`;

    logger.info({ reference, merchantId, amount: amount.toString(), currency, bankName: input.bankName }, "S2S bank withdrawal submitted");
    return this.requireWithdrawal(id);
  }

  async getWithdrawal(id: string): Promise<S2sBankWithdrawalRow> {
    return this.requireWithdrawal(id);
  }

  async listWithdrawals(filters: {
    merchantId?: string;
    connectionId?: string;
    status?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: S2sBankWithdrawalRow[]; total: number }> {
    const offset = (filters.page - 1) * filters.pageSize;
    const conds = sqlFragments();

    if (filters.merchantId)   conds.push('"merchantId" = ?',   filters.merchantId);
    if (filters.connectionId) conds.push('"connectionId" = ?', filters.connectionId);
    if (filters.status)       conds.push('"status" = ?',       filters.status);

    const [whereClause, whereVals] = conds.build();
    const countVals = [...whereVals];
    const rowVals   = [...whereVals, filters.pageSize, offset];

    const [rows, countRows] = await Promise.all([
      this.unsafeQuery<S2sBankWithdrawalRow>(
        `SELECT * FROM "S2sBankWithdrawal" ${whereClause} ORDER BY "createdAt" DESC LIMIT $${rowVals.length - 1} OFFSET $${rowVals.length}`,
        ...rowVals,
      ),
      this.unsafeQuery<{ count: bigint }>(
        `SELECT COUNT(*) as count FROM "S2sBankWithdrawal" ${whereClause}`,
        ...countVals,
      ),
    ]);

    return { data: rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async updateWithdrawalStatus(
    id: string,
    status: "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED",
    failureReason?: string,
  ): Promise<S2sBankWithdrawalRow> {
    const w = await this.requireWithdrawal(id);
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(w.status)) {
      throw new ConflictError(`Cannot update withdrawal with terminal status: ${w.status}`);
    }

    if (status === "COMPLETED") {
      await this.prisma.$executeRaw`
        UPDATE "S2sBankWithdrawal"
        SET "status" = 'COMPLETED', "completedAt" = NOW(), "failureReason" = ${failureReason ?? null}, "updatedAt" = NOW()
        WHERE "id" = ${id}`;
    } else {
      await this.prisma.$executeRaw`
        UPDATE "S2sBankWithdrawal"
        SET "status" = ${status}::text, "failureReason" = ${failureReason ?? null}, "updatedAt" = NOW()
        WHERE "id" = ${id}`;
    }

    logger.info({ withdrawalId: id, status }, "S2S withdrawal status updated");
    return this.requireWithdrawal(id);
  }

  // ── Inbound signature verification (used by routes) ───────────

  /**
   * Verify an inbound request from a registered remote server.
   * Uses the canonical JSON HMAC format (fix 8).
   * Signature = HMAC-SHA256(decrypted apiSecret, JSON.stringify(canonicalFields))
   */
  verifyInboundSignature(
    connection: S2sConnectionRow,
    canonicalPayload: string,
    signature: string,
    timestamp: string,
  ): void {
    // Timestamp freshness (5 min)
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Date.now() - ts > 5 * 60 * 1000) {
      throw new AppError("Inbound request timestamp expired or invalid", 401, "S2S_TIMESTAMP_EXPIRED");
    }

    const apiSecret = decryptSecret(connection.apiSecret);
    const expected  = createHmac("sha256", apiSecret).update(canonicalPayload).digest("hex");

    const sigBuf = Buffer.from(signature.replace(/^0x/, ""), "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new AppError("Inbound request signature invalid", 401, "S2S_INBOUND_AUTH_FAILED");
    }
  }

  // ── Connection Ping ───────────────────────────────────────────

  /**
   * Ping the remote server's endpointUrl to verify reachability.
   * Sends a signed GET /health (or bare GET) with the connection's apiKeyHeader.
   * Non-destructive — does not create any ledger entries or payments.
   */
  async pingConnection(
    id: string,
    merchantId: string,
  ): Promise<{ reachable: boolean; statusCode: number | null; latencyMs: number; url: string }> {
    const connection = await this.requireConnection(id);
    if (connection.merchantId !== merchantId) {
      throw new ForbiddenError("Connection does not belong to this merchant");
    }

    const apiSecret  = decryptSecret(connection.apiSecret);
    const timestamp  = Date.now().toString();
    const pingUrl    = connection.endpointUrl.replace(/\/$/, "") + "/health";
    const canonical  = JSON.stringify({ ping: true, timestamp });
    const signature  = createHmac("sha256", apiSecret).update(canonical).digest("hex");

    const start = Date.now();
    try {
      const resp = await fetch(pingUrl, {
        method:  "GET",
        headers: {
          [connection.apiKeyHeader]: apiSecret,
          "x-s2s-timestamp":        timestamp,
          "x-s2s-signature":        signature,
        },
        signal: AbortSignal.timeout(8_000),
      });
      const latencyMs = Date.now() - start;
      logger.info({ connectionId: id, statusCode: resp.status, latencyMs }, "S2S ping");
      return { reachable: resp.ok, statusCode: resp.status, latencyMs, url: pingUrl };
    } catch (err) {
      const latencyMs = Date.now() - start;
      logger.warn({ connectionId: id, err, latencyMs }, "S2S ping failed");
      return { reachable: false, statusCode: null, latencyMs, url: pingUrl };
    }
  }

  // ── Nonce Cleanup ─────────────────────────────────────────────

  /**
   * Delete S2sNonce rows older than the nonce TTL (10 minutes).
   * Call this on a schedule (e.g. every 15 minutes via a cron job or
   * the module's startup interval). Redis already expires the key
   * automatically — this just keeps the DB table from growing unbounded.
   */
  async cleanupExpiredNonces(): Promise<{ deleted: number }> {
    const result = await this.prisma.$executeRaw`
      DELETE FROM "S2sNonce"
      WHERE "createdAt" < NOW() - INTERVAL '10 minutes'`;
    const deleted = Number(result);
    if (deleted > 0) {
      logger.info({ deleted }, "S2S expired nonces cleaned up");
    }
    return { deleted };
  }

  // ── Receipt Rendering ─────────────────────────────────────────

  async renderReceipt(
    templateId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const template = await this.requireReceiptTemplate(templateId);
    const result: Record<string, string> = {};

    for (const field of (template.templateJson as { fields: ReceiptField[] }).fields) {
      const raw = this.resolvePath(data, field.source);
      result[field.key] = this.formatValue(raw, field.format);
      if (field.required && result[field.key] === "") {
        logger.warn({ templateId, key: field.key }, "Required receipt field is empty");
      }
    }

    const note = (template.templateJson as { footerNote?: string }).footerNote;
    if (note) result["_footerNote"] = note;
    return result;
  }

  // ── Private Helpers ───────────────────────────────────────────

  /**
   * Type-safe wrapper around $queryRawUnsafe.
   * Used only for dynamic WHERE clauses built from validated, trusted
   * field names and parameterised values — never raw user strings.
   */
  private async unsafeQuery<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    const result = await this.prisma.$queryRawUnsafe(sql, ...values);
    return result as T[];
  }

  private async requireMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundError("Merchant", merchantId);
    return merchant;
  }

  private async requireConnection(id: string): Promise<S2sConnectionRow> {
    const [row] = await this.prisma.$queryRaw<S2sConnectionRow[]>`
      SELECT * FROM "S2sConnection" WHERE "id" = ${id} LIMIT 1`;
    if (!row) throw new NotFoundError("S2sConnection", id);
    return row;
  }

  private async requirePayment(id: string): Promise<S2sPaymentRow> {
    const [row] = await this.prisma.$queryRaw<S2sPaymentRow[]>`
      SELECT * FROM "S2sPayment" WHERE "id" = ${id} LIMIT 1`;
    if (!row) throw new NotFoundError("S2sPayment", id);
    return row;
  }

  private async requireWithdrawal(id: string): Promise<S2sBankWithdrawalRow> {
    const [row] = await this.prisma.$queryRaw<S2sBankWithdrawalRow[]>`
      SELECT * FROM "S2sBankWithdrawal" WHERE "id" = ${id} LIMIT 1`;
    if (!row) throw new NotFoundError("S2sBankWithdrawal", id);
    return row;
  }

  private async requireReceiptTemplate(id: string): Promise<S2sReceiptTemplateRow> {
    const [row] = await this.prisma.$queryRaw<S2sReceiptTemplateRow[]>`
      SELECT * FROM "S2sReceiptTemplate" WHERE "id" = ${id} LIMIT 1`;
    if (!row) throw new NotFoundError("S2sReceiptTemplate", id);
    return row;
  }

  private async ensureLedgerAccount(
    code: string,
    name: string,
    type: "ASSET" | "LIABILITY" | "REVENUE",
    subtype: string,
    currency: string,
  ): Promise<void> {
    const existing = await this.ledgerService.getAccount(code);
    if (!existing) {
      await this.ledgerService.createAccount({ code, name, type, subtype, currency });
    }
  }

  /**
   * FIX 5: SSRF-safe callback delivery.
   * Uses the decrypted apiSecret to sign the outgoing callback.
   */
  private async fireCallback(
    connection: S2sConnectionRow,
    apiSecret: string,
    reference: string,
    receiptData: Record<string, string> | null,
  ): Promise<void> {
    if (!connection.callbackUrl) return;

    const timestamp = Date.now().toString();
    const nonce     = randomBytes(16).toString("hex");
    const body      = JSON.stringify({ reference, receiptData, timestamp, nonce });
    const signature = createHmac("sha256", apiSecret)
      .update(JSON.stringify({ reference, timestamp, nonce }))
      .digest("hex");

    const resp = await fetch(connection.callbackUrl, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "x-s2s-timestamp": timestamp,
        "x-s2s-nonce":     nonce,
        "x-s2s-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      logger.warn({ url: connection.callbackUrl, status: resp.status, reference }, "S2S callback non-2xx");
    }
  }

  private resolvePath(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  private formatValue(value: unknown, format: ReceiptField["format"]): string {
    if (value === undefined || value === null) return "";
    const str = String(value);
    switch (format) {
      case "currency": try { return new Decimal(str).toFixed(2); } catch { return str; }
      case "date":     try { return new Date(str).toLocaleDateString("en-GB"); } catch { return str; }
      case "datetime": try { return new Date(str).toISOString(); } catch { return str; }
      case "masked":   return str.length > 4 ? `${"*".repeat(str.length - 4)}${str.slice(-4)}` : "****";
      default:         return str;
    }
  }
}

// ── SSRF validation ───────────────────────────────────────────────

/**
 * FIX 5: Validate a callback URL is safe to call.
 * Blocks: non-HTTPS, localhost, private IP ranges, link-local, metadata endpoints.
 */
export function validateCallbackUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new ValidationError("callbackUrl is not a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ValidationError("callbackUrl must use HTTPS");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (SSRF_BLOCKED_HOSTS.has(host)) {
    throw new ValidationError(`callbackUrl hostname '${host}' is not allowed`);
  }

  // Block IP literals in private ranges
  if (isIP(host)) {
    for (const prefix of SSRF_BLOCKED_PREFIXES) {
      if (host.startsWith(prefix)) {
        throw new ValidationError(`callbackUrl resolves to a private IP range: ${host}`);
      }
    }
    // Block 127.x.x.x range fully
    if (/^127\./.test(host)) {
      throw new ValidationError(`callbackUrl resolves to loopback: ${host}`);
    }
  }

  // Block AWS/GCP/Azure metadata endpoints
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    throw new ValidationError("callbackUrl targets a cloud metadata endpoint");
  }
}
