import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.js";
import {
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
  parsePagination,
} from "../../shared/utils/response.js";
import { S2sEngineService } from "./s2s-engine.service.js";
import {
  createConnectionSchema,
  createBankWithdrawalSchema,
  createS2sPaymentSchema,
  createReceiptTemplateSchema,
  receiptTemplateUploadSchema,
  updateConnectionSchema,
  updateReceiptTemplateSchema,
  type S2sConnectionRow,
} from "./types.js";

/**
 * S2S Engine Routes
 *
 * Route groups:
 *   /s2s/connections          — Manage server connections & credentials
 *   /s2s/connections/:id/receive  — Receive incoming funds from remote server
 *   /s2s/payments             — Query and reverse incoming payments
 *   /s2s/withdrawals          — Submit and track bank withdrawals
 *   /s2s/receipt-templates    — Manage JSON receipt templates (incl. file upload)
 *
 * Authentication:
 *   All routes require HMAC authentication (handled globally by auth plugin).
 *   The authenticated merchant is available as request.merchant.
 *
 *   The fund-receive endpoint additionally requires the remote server to sign
 *   its request with the connection's API secret (x-s2s-signature header).
 */
export function registerS2sEngineRoutes(
  app: FastifyInstance,
  service: S2sEngineService,
): void {

  // ── Receipt Templates ───────────────────────────────────────

  /**
   * GET /s2s/receipt-templates
   * List all receipt templates for the authenticated merchant.
   */
  app.get("/s2s/receipt-templates", async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const templates = await service.listReceiptTemplates(merchantId);
    return sendSuccess(reply, templates);
  });

  /**
   * GET /s2s/receipt-templates/:id
   */
  app.get("/s2s/receipt-templates/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const template = await service.getReceiptTemplate(id);
    if (template.merchantId !== merchantId) throw new ForbiddenError();
    return sendSuccess(reply, template);
  });

  /**
   * POST /s2s/receipt-templates
   * Create a receipt template from a JSON body.
   */
  app.post("/s2s/receipt-templates", async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const parsed = createReceiptTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid receipt template", { errors: parsed.error.errors });
    }
    const template = await service.createReceiptTemplate(merchantId, parsed.data);
    return sendCreated(reply, template);
  });

  /**
   * POST /s2s/receipt-templates/upload
   *
   * JSON file upload endpoint. The customer sends a JSON file as the raw
   * request body (Content-Type: application/json). The engine parses the
   * file and validates it against the receipt template upload schema.
   *
   * Example request:
   *   POST /s2s/receipt-templates/upload
   *   Content-Type: application/json
   *   Body: {
   *     "name": "Standard Receipt",
   *     "isDefault": true,
   *     "template": {
   *       "version": "1.0",
   *       "fields": [
   *         { "key": "ref", "label": "Reference", "source": "reference", "required": true, "format": "text" },
   *         { "key": "amount", "label": "Amount", "source": "amount", "required": true, "format": "currency" },
   *         { "key": "date", "label": "Date", "source": "createdAt", "format": "datetime" },
   *         { "key": "sender", "label": "Sender Ref", "source": "senderReference", "format": "text" }
   *       ],
   *       "footerNote": "This is an automated receipt from PrimeStack."
   *     }
   *   }
   */
  app.post("/s2s/receipt-templates/upload", async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const parsed = receiptTemplateUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid receipt template JSON file. See schema for required structure.",
        { errors: parsed.error.errors },
      );
    }

    const template = await service.createReceiptTemplate(merchantId, {
      name: parsed.data.name,
      description: parsed.data.description,
      templateJson: parsed.data.template,
      isDefault: parsed.data.isDefault,
    });

    return sendCreated(reply, template, {
      message: "Receipt template uploaded and saved successfully",
    });
  });

  /**
   * PATCH /s2s/receipt-templates/:id
   */
  app.patch("/s2s/receipt-templates/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const parsed = updateReceiptTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid update data", { errors: parsed.error.errors });
    }
    const template = await service.updateReceiptTemplate(id, merchantId, parsed.data);
    return sendSuccess(reply, template);
  });

  /**
   * DELETE /s2s/receipt-templates/:id
   */
  app.delete("/s2s/receipt-templates/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    await service.deleteReceiptTemplate(id, merchantId);
    return sendNoContent(reply);
  });

  // ── Connections ─────────────────────────────────────────────

  /**
   * POST /s2s/connections
   * Register a new S2S connection (external server endpoint + credentials).
   */
  app.post("/s2s/connections", async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const parsed = createConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid connection data", { errors: parsed.error.errors });
    }
    const connection = await service.createConnection(merchantId, parsed.data);
    return sendCreated(reply, sanitizeConnection(connection));
  });

  /**
   * GET /s2s/connections
   */
  app.get("/s2s/connections", async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = parsePagination(query);
    const result = await service.listConnections(merchantId, {
      status: query.status as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data.map(sanitizeConnection), {
      page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize),
    });
  });

  /**
   * GET /s2s/connections/:id
   */
  app.get("/s2s/connections/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const connection = await service.getConnection(id);
    if (connection.merchantId !== merchantId) throw new ForbiddenError();
    return sendSuccess(reply, sanitizeConnection(connection));
  });

  /**
   * PATCH /s2s/connections/:id
   * Update connection settings. To update the apiSecret, use the rotate endpoint.
   */
  app.patch("/s2s/connections/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const parsed = updateConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid update data", { errors: parsed.error.errors });
    }
    const connection = await service.updateConnection(id, merchantId, parsed.data);
    return sendSuccess(reply, sanitizeConnection(connection));
  });

  /**
   * POST /s2s/connections/:id/rotate-secret
   * Rotate the API secret for a connection. Provide the new secret in the body.
   *
   * Request body: { "newSecret": "your-new-secret-min-16-chars" }
   */
  app.post("/s2s/connections/:id/rotate-secret", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const body = request.body as { newSecret?: string };
    if (!body?.newSecret || body.newSecret.length < 16) {
      throw new ValidationError("newSecret is required and must be at least 16 characters");
    }
    const result = await service.rotateConnectionSecret(id, merchantId, body.newSecret);
    return sendSuccess(reply, result);
  });

  // ── Payments (Incoming Funds) ────────────────────────────────

  /**
   * POST /s2s/connections/:id/receive
   *
   * The primary fund-receive endpoint. The remote server calls this to push
   * funds into the switch.
   *
   * Required headers from the remote server:
   *   x-s2s-timestamp       — Unix ms timestamp (must be within 5 minutes)
   *   x-s2s-nonce           — Random unique string (hex, UUID, etc.) — prevents replay attacks
   *   x-s2s-signature       — HMAC-SHA256(apiSecret, JSON.stringify(canonicalPayload))
   *   x-s2s-idempotency-key — Unique key per payment attempt for idempotent retries
   *
   * Canonical payload for HMAC:
   *   JSON.stringify({ connectionId, amount, currency, timestamp, nonce, senderReference })
   *
   * IP enforcement:
   *   If the connection has a non-empty allowedIps list, the caller's IP must
   *   be in that list. Configure Fastify with trustProxy: true so request.ip
   *   reflects the real upstream IP.
   */
  app.post("/s2s/connections/:id/receive", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id: connectionId } = request.params as { id: string };

    const timestamp      = request.headers["x-s2s-timestamp"] as string | undefined;
    const signature      = request.headers["x-s2s-signature"] as string | undefined;
    const nonce          = request.headers["x-s2s-nonce"] as string | undefined;
    const idempotencyKey = request.headers["x-s2s-idempotency-key"] as string | undefined;

    if (!timestamp || !signature || !nonce || !idempotencyKey) {
      throw new ValidationError(
        "Missing required S2S headers: x-s2s-timestamp, x-s2s-signature, x-s2s-nonce, x-s2s-idempotency-key",
      );
    }
    if (nonce.length < 8 || nonce.length > 128) {
      throw new ValidationError("x-s2s-nonce must be 8–128 characters");
    }
    if (idempotencyKey.length < 8 || idempotencyKey.length > 255) {
      throw new ValidationError("x-s2s-idempotency-key must be 8–255 characters");
    }

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Date.now() - ts > 5 * 60 * 1000) {
      throw new ValidationError("x-s2s-timestamp is expired or invalid");
    }

    // IP allowlist enforcement — load connection first, check IP before any further work
    const connection = await service.getConnection(connectionId);
    const callerIp = request.ip;
    if (
      connection.allowedIps &&
      connection.allowedIps.length > 0 &&
      !connection.allowedIps.includes(callerIp)
    ) {
      throw new ForbiddenError(
        `Caller IP ${callerIp} is not in the allowedIps list for this connection`,
      );
    }

    const body   = request.body as Record<string, unknown>;
    const parsed = createS2sPaymentSchema.safeParse({ ...body, connectionId });
    if (!parsed.success) {
      throw new ValidationError("Invalid payment data", { errors: parsed.error.errors });
    }

    const payment = await service.receivePayment(
      { ...parsed.data, idempotencyKey, nonce },
      signature,
      timestamp,
    );
    return sendCreated(reply, payment);
  });

  /**
   * POST /s2s/connections/:id/ping
   *
   * Test connectivity to the remote server's endpointUrl.
   * Sends a signed HEAD request to the endpoint using the stored apiSecret.
   * Useful to verify a new connection before going live.
   *
   * Response includes: reachable (boolean), statusCode, latencyMs
   */
  app.post("/s2s/connections/:id/ping", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const result = await service.pingConnection(id, merchantId);
    return sendSuccess(reply, result);
  });

  /**
   * GET /s2s/payments
   * List all S2S payments (filter by connectionId, status, currency).
   */
  app.get("/s2s/payments", async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = parsePagination(query);
    const result = await service.listPayments({
      merchantId,
      connectionId: query.connectionId as string | undefined,
      status: query.status as string | undefined,
      currency: query.currency as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, {
      page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize),
    });
  });

  /**
   * GET /s2s/payments/:id
   */
  app.get("/s2s/payments/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const payment = await service.getPayment(id);
    if (payment.merchantId !== merchantId) throw new ForbiddenError();
    return sendSuccess(reply, payment);
  });

  /**
   * POST /s2s/payments/:id/reverse
   * Reverse a completed payment and post a reversal journal entry.
   * Body: { "reason": "Customer requested refund" }
   */
  app.post("/s2s/payments/:id/reverse", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const body = request.body as { reason?: string };
    if (!body?.reason) throw new ValidationError("reason is required");
    const payment = await service.reversePayment(id, merchantId, body.reason);
    return sendSuccess(reply, payment);
  });

  // ── Bank Withdrawals ─────────────────────────────────────────

  /**
   * POST /s2s/withdrawals
   *
   * Submit a bank withdrawal instruction.
   *
   * The engine will:
   *   1. Verify the wallet has sufficient available balance
   *   2. Post a debit journal entry on the source wallet
   *   3. Create the withdrawal record with full bank destination details
   *   4. Return the withdrawal record — your operations team or bank API
   *      should then execute the actual wire/ACH transfer
   *
   * Required: one of iban, accountNumber, or swiftBic.
   */
  app.post("/s2s/withdrawals", async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const parsed = createBankWithdrawalSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid withdrawal data", { errors: parsed.error.errors });
    }
    const withdrawal = await service.createBankWithdrawal(merchantId, parsed.data);
    return sendCreated(reply, withdrawal);
  });

  /**
   * GET /s2s/withdrawals
   * List withdrawals with optional filters: connectionId, status.
   */
  app.get("/s2s/withdrawals", async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = parsePagination(query);
    const result = await service.listWithdrawals({
      merchantId,
      connectionId: query.connectionId as string | undefined,
      status: query.status as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, {
      page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize),
    });
  });

  /**
   * GET /s2s/withdrawals/:id
   */
  app.get("/s2s/withdrawals/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const withdrawal = await service.getWithdrawal(id);
    if (withdrawal.merchantId !== merchantId) throw new ForbiddenError();
    return sendSuccess(reply, withdrawal);
  });

  /**
   * PATCH /s2s/withdrawals/:id/status  (admin — use admin JWT)
   * Update the status of a withdrawal after bank confirmation.
   * Body: { "status": "COMPLETED" | "FAILED" | "PROCESSING", "failureReason": "..." }
   */
  app.patch("/s2s/withdrawals/:id/status", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
      failureReason?: string;
    };
    if (!body?.status) throw new ValidationError("status is required");
    const allowed = ["PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
    if (!allowed.includes(body.status)) {
      throw new ValidationError(`status must be one of: ${allowed.join(", ")}`);
    }
    const withdrawal = await service.updateWithdrawalStatus(id, body.status, body.failureReason);
    return sendSuccess(reply, withdrawal);
  });

  /**
   * GET /s2s/payments/:id/receipt
   * Return just the rendered receipt data for a completed payment.
   */
  app.get("/s2s/payments/:id/receipt", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const payment = await service.getPayment(id);
    if (payment.merchantId !== merchantId) throw new ForbiddenError();
    if (!payment.receiptData) {
      throw new NotFoundError("Receipt", id);
    }
    return sendSuccess(reply, {
      paymentReference: payment.reference,
      status: payment.status,
      receipt: payment.receiptData,
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────

function requireMerchantId(request: FastifyRequest): string {
  const merchantId = request.merchant?.id;
  if (!merchantId) {
    throw new ForbiddenError("Merchant context not found — HMAC authentication required");
  }
  return merchantId;
}

/**
 * Mask the apiSecret before returning connection data.
 * The secret is shown only on creation; subsequent reads return a masked value.
 */
function sanitizeConnection(conn: S2sConnectionRow): Record<string, unknown> {
  const { apiSecret, ...rest } = conn as S2sConnectionRow & Record<string, unknown>;
  return {
    ...rest,
    apiSecretMasked: typeof apiSecret === "string"
      ? `${"*".repeat(Math.max(0, (apiSecret as string).length - 4))}${(apiSecret as string).slice(-4)}`
      : "***",
  };
}
