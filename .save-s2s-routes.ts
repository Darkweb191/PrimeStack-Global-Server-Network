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

const TAG_RECEIPT   = "S2S Engine ? Receipt Templates";
const TAG_CONN      = "S2S Engine ? Connections";
const TAG_PAYMENT   = "S2S Engine ? Incoming Payments";
const TAG_WITHDRAW  = "S2S Engine ? Bank Withdrawals";

const HMAC_SECURITY = [{ HMAC: [] }];


const TAG_RECEIPT  = "S2S Engine — Receipt Templates";
const TAG_CONN     = "S2S Engine — Connections";
const TAG_PAYMENT  = "S2S Engine — Incoming Payments";
const TAG_WITHDRAW = "S2S Engine — Bank Withdrawals";

export function registerS2sEngineRoutes(
  app: FastifyInstance,
  service: S2sEngineService,
): void {

  // ?? Receipt Templates ???????????????????????????????????????

  app.get("/s2s/receipt-templates", {
    schema: {
      tags: [TAG_RECEIPT],
      summary: "List your receipt templates",
      description: "Returns all receipt templates for the authenticated merchant. Templates define which fields appear on payment receipts.",
      security: HMAC_SECURITY,
      response: { 200: { description: "List of receipt templates", type: "object" } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const templates = await service.listReceiptTemplates(merchantId);
    return sendSuccess(reply, templates);
  });

  app.get("/s2s/receipt-templates/:id", {
    schema: {
      tags: [TAG_RECEIPT],
      summary: "Get a receipt template by ID",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid", description: "Template UUID" } } },
      response: { 200: { description: "Receipt template object", type: "object" } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const template = await service.getReceiptTemplate(id);
    if (template.merchantId !== merchantId) throw new ForbiddenError();
    return sendSuccess(reply, template);
  });

  app.post("/s2s/receipt-templates", {
    schema: {
      tags: [TAG_RECEIPT],
      summary: "Create a receipt template",
      description: "Create a new receipt template by defining which fields appear on payment receipts.",
      security: HMAC_SECURITY,
      body: {
        type: "object",
        required: ["name", "templateJson"],
        properties: {
          name:        { type: "string", description: "Template name", example: "Standard Receipt" },
          description: { type: "string", description: "Optional description" },
          isDefault:   { type: "boolean", description: "Set as default for this merchant", default: false },
          templateJson: {
            type: "object",
            description: "Template field definitions",
            properties: {
              version:    { type: "string", default: "1.0" },
              footerNote: { type: "string", description: "Text shown at bottom of receipt" },
              fields: {
                type: "array",
                items: {
                  type: "object",
                  required: ["key", "label", "source"],
                  properties: {
                    key:      { type: "string", description: "Field identifier", example: "ref" },
                    label:    { type: "string", description: "Display label", example: "Payment Reference" },
                    source:   { type: "string", description: "Data path on payment object (dot-notation)", example: "reference" },
                    required: { type: "boolean", default: false },
                    format:   { type: "string", enum: ["text", "currency", "date", "datetime", "masked"], default: "text" },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const parsed = createReceiptTemplateSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid receipt template", { errors: parsed.error.errors });
    const template = await service.createReceiptTemplate(merchantId, parsed.data);
    return sendCreated(reply, template);
  });

  app.post("/s2s/receipt-templates/upload", {
    schema: {
      tags: [TAG_RECEIPT],
      summary: "Upload a receipt template from a JSON file",
      description: `Upload a JSON file that defines receipt layout and fields.\n\n**How to use:**\n1. Prepare a JSON file matching the schema below\n2. Set \`Content-Type: application/json\`\n3. POST the file contents as the request body\n\n**Example file:**\n\`\`\`json\n{\n  "name": "Standard Receipt",\n  "isDefault": true,\n  "template": {\n    "version": "1.0",\n    "fields": [\n      { "key": "ref", "label": "Reference", "source": "reference", "required": true, "format": "text" },\n      { "key": "amount", "label": "Amount", "source": "amount", "required": true, "format": "currency" },\n      { "key": "date", "label": "Date", "source": "createdAt", "format": "datetime" },\n      { "key": "sender", "label": "Sender Ref", "source": "senderReference", "format": "text" }\n    ],\n    "footerNote": "Auto-generated by PrimeStack GSN"\n  }\n}\n\`\`\``,
      security: HMAC_SECURITY,
      body: {
        type: "object",
        required: ["name", "template"],
        properties: {
          name:        { type: "string", description: "Template name", example: "Standard Receipt" },
          description: { type: "string", description: "Optional description" },
          isDefault:   { type: "boolean", default: false, description: "Make this the default template" },
          template: {
            type: "object",
            required: ["fields"],
            description: "Receipt layout definition",
            properties: {
              version:    { type: "string", default: "1.0" },
              footerNote: { type: "string" },
              fields: {
                type: "array",
                description: "List of fields to show on the receipt",
                items: {
                  type: "object",
                  required: ["key", "label", "source"],
                  properties: {
                    key:      { type: "string", example: "ref",       description: "Field key (unique identifier)" },
                    label:    { type: "string", example: "Reference", description: "Human-readable label on the receipt" },
                    source:   { type: "string", example: "reference", description: "Dot-notation path on the payment data object" },
                    required: { type: "boolean", default: false },
                    format:   { type: "string", enum: ["text","currency","date","datetime","masked"], default: "text" },
                  },
                },
              },
            },
          },
        },
      },
      response: { 201: { description: "Template created successfully", type: "object" } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const parsed = receiptTemplateUploadSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid receipt template JSON file.", { errors: parsed.error.errors });
    const template = await service.createReceiptTemplate(merchantId, {
      name: parsed.data.name,
      description: parsed.data.description,
      templateJson: parsed.data.template,
      isDefault: parsed.data.isDefault,
    });
    return sendCreated(reply, template, { message: "Receipt template uploaded and saved successfully" });
  });

  app.patch("/s2s/receipt-templates/:id", {
    schema: {
      tags: [TAG_RECEIPT],
      summary: "Update a receipt template",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const parsed = updateReceiptTemplateSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid update data", { errors: parsed.error.errors });
    const template = await service.updateReceiptTemplate(id, merchantId, parsed.data);
    return sendSuccess(reply, template);
  });

  app.delete("/s2s/receipt-templates/:id", {
    schema: {
      tags: [TAG_RECEIPT],
      summary: "Delete a receipt template",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      response: { 204: { description: "Deleted" } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    await service.deleteReceiptTemplate(id, merchantId);
    return sendNoContent(reply);
  });

  // ?? Connections ?????????????????????????????????????????????

  app.post("/s2s/connections", {
    schema: {
      tags: [TAG_CONN],
      summary: "Register a new S2S connection",
      description: "Creates a connection to an external payment server. The API secret is encrypted with AES-256-GCM before storage ? it is shown only in the response of this call.",
      security: HMAC_SECURITY,
      body: {
        type: "object",
        required: ["name", "endpointUrl", "apiSecret", "supportedCurrencies"],
        properties: {
          name:               { type: "string", description: "Human-readable connection name", example: "ICICI EazyPay Incoming" },
          endpointUrl:        { type: "string", format: "uri", description: "Remote server HTTPS endpoint URL", example: "https://payments.yourserver.com/api" },
          apiSecret:          { type: "string", minLength: 16, description: "Shared HMAC secret (min 16 chars). Stored encrypted. Shown once only.", example: "my-secure-secret-min-16-chars" },
          apiKeyHeader:       { type: "string", default: "x-api-key", description: "HTTP header name to send apiSecret in outbound calls" },
          callbackUrl:        { type: "string", format: "uri", description: "HTTPS URL to POST receipt data to after payment completes" },
          allowedIps:         { type: "array", items: { type: "string" }, description: "IP allowlist ? only these IPs can push funds to this connection", example: ["216.24.57.16", "216.24.57.18"] },
          supportedCurrencies:{ type: "array", items: { type: "string" }, description: "Accepted currency codes", example: ["USD", "INR", "EUR"] },
          dailyLimitAmount:   { type: "string", description: "Maximum total amount per day (optional)", example: "50000.00" },
          singleTxLimitAmount:{ type: "string", description: "Maximum amount per single transaction (optional)", example: "10000.00" },
          receiptTemplateId:  { type: "string", format: "uuid", description: "Default receipt template ID (optional)" },
        },
      },
      response: { 201: { description: "Connection created. Save the apiSecretMasked ? the raw secret is not stored in readable form.", type: "object" } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const parsed = createConnectionSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid connection data", { errors: parsed.error.errors });
    const connection = await service.createConnection(merchantId, parsed.data);
    return sendCreated(reply, sanitizeConnection(connection));
  });

  app.get("/s2s/connections", {
    schema: {
      tags: [TAG_CONN],
      summary: "List your S2S connections",
      security: HMAC_SECURITY,
      querystring: {
        type: "object",
        properties: {
          status:   { type: "string", enum: ["ACTIVE","INACTIVE","SUSPENDED","TESTING"], description: "Filter by status" },
          page:     { type: "integer", default: 1 },
          pageSize: { type: "integer", default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = parsePagination(query);
    const result = await service.listConnections(merchantId, { status: query.status as string | undefined, page, pageSize });
    return sendPaginated(reply, result.data.map(sanitizeConnection), { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) });
  });

  app.get("/s2s/connections/:id", {
    schema: {
      tags: [TAG_CONN],
      summary: "Get a connection by ID",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const connection = await service.getConnection(id);
    if (connection.merchantId !== merchantId) throw new ForbiddenError();
    return sendSuccess(reply, sanitizeConnection(connection));
  });

  app.patch("/s2s/connections/:id", {
    schema: {
      tags: [TAG_CONN],
      summary: "Update a connection",
      description: "Update connection settings. To change the apiSecret, use the rotate-secret endpoint instead.",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const parsed = updateConnectionSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid update data", { errors: parsed.error.errors });
    const connection = await service.updateConnection(id, merchantId, parsed.data);
    return sendSuccess(reply, sanitizeConnection(connection));
  });

  app.post("/s2s/connections/:id/rotate-secret", {
    schema: {
      tags: [TAG_CONN],
      summary: "Rotate the API secret",
      description: "Replace the connection's API secret with a new one. Update your remote server immediately after rotating.",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      body: {
        type: "object",
        required: ["newSecret"],
        properties: { newSecret: { type: "string", minLength: 16, description: "New shared secret (min 16 characters)" } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const body = request.body as { newSecret?: string };
    if (!body?.newSecret || body.newSecret.length < 16) throw new ValidationError("newSecret is required and must be at least 16 characters");
    const result = await service.rotateConnectionSecret(id, merchantId, body.newSecret);
    return sendSuccess(reply, result);
  });

  app.post("/s2s/connections/:id/ping", {
    schema: {
      tags: [TAG_CONN],
      summary: "Ping ? test connection to remote server",
      description: "Sends a signed GET request to the remote server's health endpoint. Returns reachability, HTTP status, and latency.",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      response: {
        200: {
          type: "object",
          description: "Ping result",
          properties: {
            reachable:  { type: "boolean" },
            statusCode: { type: "integer" },
            latencyMs:  { type: "integer" },
            url:        { type: "string" },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const result = await service.pingConnection(id, merchantId);
    return sendSuccess(reply, result);
  });

  // ?? Payments (Incoming Funds) ????????????????????????????????

  app.post("/s2s/connections/:id/receive", {
    schema: {
      tags: [TAG_PAYMENT],
      summary: "Receive funds from external server",
      description: `**The primary fund-receive endpoint.** Your remote payment server calls this to push funds into PrimeStack GSN.\n\n**Required headers from sender:**\n- \`x-s2s-timestamp\` ? Unix ms timestamp (must be within 5 minutes)\n- \`x-s2s-nonce\` ? Random unique string (8?128 chars). Prevents replay attacks.\n- \`x-s2s-signature\` ? \`HMAC-SHA256(apiSecret, JSON.stringify({connectionId, amount, currency, timestamp, nonce, senderReference}))\`\n- \`x-s2s-idempotency-key\` ? Unique key per attempt. Duplicate keys return the original payment.\n\n**On success:** Funds are credited to the receiverWalletAddr via a double-entry journal entry.`,
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid", description: "Connection ID" } } },
      headers: {
        type: "object",
        required: ["x-s2s-timestamp","x-s2s-signature","x-s2s-nonce","x-s2s-idempotency-key"],
        properties: {
          "x-s2s-timestamp":       { type: "string", description: "Unix millisecond timestamp", example: "1730660400000" },
          "x-s2s-nonce":           { type: "string", description: "Random unique string (8?128 chars)", example: "a1b2c3d4e5f6a7b8" },
          "x-s2s-signature":       { type: "string", description: "HMAC-SHA256 of canonical JSON payload" },
          "x-s2s-idempotency-key": { type: "string", description: "Unique key per payment attempt", example: "ORDER-20261103-001" },
        },
      },
      body: {
        type: "object",
        required: ["amount", "currency", "receiverWalletAddr"],
        properties: {
          amount:             { type: "string", description: "Payment amount", example: "1500.00" },
          currency:           { type: "string", minLength: 3, maxLength: 3, description: "3-letter currency code", example: "USD" },
          feeAmount:          { type: "string", description: "Fee to deduct from amount (default: 0)", example: "15.00" },
          senderReference:    { type: "string", description: "Reference from the sender's system", example: "ACME-TXN-001" },
          senderAccountId:    { type: "string", description: "Sender's account identifier" },
          receiverWalletAddr: { type: "string", description: "Destination wallet address in this switch", example: "WALLET-MERCHANT-001-USD" },
          receiptTemplateId:  { type: "string", format: "uuid", description: "Receipt template to use (optional)" },
          metadata:           { type: "object", description: "Any additional data", example: { orderId: "ORD-001" } },
        },
      },
      response: { 201: { description: "Payment completed. Funds credited to wallet.", type: "object" } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id: connectionId } = request.params as { id: string };
    const timestamp      = request.headers["x-s2s-timestamp"] as string | undefined;
    const signature      = request.headers["x-s2s-signature"] as string | undefined;
    const nonce          = request.headers["x-s2s-nonce"] as string | undefined;
    const idempotencyKey = request.headers["x-s2s-idempotency-key"] as string | undefined;
    if (!timestamp || !signature || !nonce || !idempotencyKey) throw new ValidationError("Missing required S2S headers: x-s2s-timestamp, x-s2s-signature, x-s2s-nonce, x-s2s-idempotency-key");
    if (nonce.length < 8 || nonce.length > 128) throw new ValidationError("x-s2s-nonce must be 8?128 characters");
    if (idempotencyKey.length < 8 || idempotencyKey.length > 255) throw new ValidationError("x-s2s-idempotency-key must be 8?255 characters");
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Date.now() - ts > 5 * 60 * 1000) throw new ValidationError("x-s2s-timestamp is expired or invalid");
    const connection = await service.getConnection(connectionId);
    const callerIp = request.ip;
    if (connection.allowedIps && connection.allowedIps.length > 0 && !connection.allowedIps.includes(callerIp)) throw new ForbiddenError(`Caller IP ${callerIp} is not in the allowedIps list`);
    const body = request.body as Record<string, unknown>;
    const parsed = createS2sPaymentSchema.safeParse({ ...body, connectionId });
    if (!parsed.success) throw new ValidationError("Invalid payment data", { errors: parsed.error.errors });
    const payment = await service.receivePayment({ ...parsed.data, idempotencyKey, nonce }, signature, timestamp);
    return sendCreated(reply, payment);
  });

  app.get("/s2s/payments", {
    schema: {
      tags: [TAG_PAYMENT],
      summary: "List incoming payments",
      security: HMAC_SECURITY,
      querystring: {
        type: "object",
        properties: {
          connectionId: { type: "string", format: "uuid", description: "Filter by connection" },
          status:       { type: "string", enum: ["PENDING","PROCESSING","AUTHENTICATED","COMPLETED","FAILED","REVERSED","EXPIRED"] },
          currency:     { type: "string", description: "Filter by currency, e.g. USD" },
          page:         { type: "integer", default: 1 },
          pageSize:     { type: "integer", default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = parsePagination(query);
    const result = await service.listPayments({ merchantId, connectionId: query.connectionId as string | undefined, status: query.status as string | undefined, currency: query.currency as string | undefined, page, pageSize });
    return sendPaginated(reply, result.data, { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) });
  });

  app.get("/s2s/payments/:id", {
    schema: {
      tags: [TAG_PAYMENT],
      summary: "Get a payment by ID",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const payment = await service.getPayment(id);
    if (payment.merchantId !== merchantId) throw new ForbiddenError();
    return sendSuccess(reply, payment);
  });

  app.get("/s2s/payments/:id/receipt", {
    schema: {
      tags: [TAG_PAYMENT],
      summary: "Get rendered receipt for a payment",
      description: "Returns the rendered receipt fields for a COMPLETED payment.",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const payment = await service.getPayment(id);
    if (payment.merchantId !== merchantId) throw new ForbiddenError();
    if (!payment.receiptData) throw new NotFoundError("Receipt", id);
    return sendSuccess(reply, { paymentReference: payment.reference, status: payment.status, receipt: payment.receiptData });
  });

  app.post("/s2s/payments/:id/reverse", {
    schema: {
      tags: [TAG_PAYMENT],
      summary: "Reverse a completed payment",
      description: "Posts a reversal journal entry and marks the payment as REVERSED.",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      body: {
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", description: "Reason for reversal", example: "Customer requested refund" } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const body = request.body as { reason?: string };
    if (!body?.reason) throw new ValidationError("reason is required");
    const payment = await service.reversePayment(id, merchantId, body.reason);
    return sendSuccess(reply, payment);
  });

  // ?? Bank Withdrawals ?????????????????????????????????????????

  app.post("/s2s/withdrawals", {
    schema: {
      tags: [TAG_WITHDRAW],
      summary: "Submit a bank withdrawal",
      description: "Debit an internal wallet and create a withdrawal instruction to an external bank account (SWIFT/SEPA/ACH/UPI).",
      security: HMAC_SECURITY,
      body: {
        type: "object",
        required: ["connectionId","walletAddress","amount","currency","bankName","bankCountry","accountHolderName"],
        properties: {
          connectionId:      { type: "string", format: "uuid", description: "Your S2S connection ID" },
          paymentId:         { type: "string", format: "uuid", description: "Link to a specific incoming payment (optional)" },
          walletAddress:     { type: "string", description: "Source wallet to debit", example: "WALLET-MERCHANT-001-INR" },
          amount:            { type: "string", description: "Withdrawal amount", example: "5000.00" },
          currency:          { type: "string", description: "3-letter currency code", example: "INR" },
          feeAmount:         { type: "string", description: "Fee deducted from amount (default: 0)", example: "25.00" },
          bankName:          { type: "string", description: "Beneficiary bank name", example: "ICICI Bank" },
          bankCountry:       { type: "string", minLength: 2, maxLength: 2, description: "2-letter country code", example: "IN" },
          accountHolderName: { type: "string", description: "Account holder full name", example: "M/S.UNITED SOLAR AND WIND POWER TECHNOLOGIES" },
          iban:              { type: "string", description: "IBAN (required for SEPA/EU)" },
          swiftBic:          { type: "string", description: "SWIFT/BIC code", example: "ICICINBBCTS" },
          accountNumber:     { type: "string", description: "Account number (required if no IBAN)", example: "029905003783" },
          routingNumber:     { type: "string", description: "ACH routing number (US only)", example: "026073008" },
          bankAddress:       { type: "string", description: "Bank address" },
        },
      },
      response: { 201: { description: "Withdrawal submitted. Wallet debited. Execute the bank transfer to complete.", type: "object" } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const parsed = createBankWithdrawalSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid withdrawal data", { errors: parsed.error.errors });
    const withdrawal = await service.createBankWithdrawal(merchantId, parsed.data);
    return sendCreated(reply, withdrawal);
  });

  app.get("/s2s/withdrawals", {
    schema: {
      tags: [TAG_WITHDRAW],
      summary: "List bank withdrawals",
      security: HMAC_SECURITY,
      querystring: {
        type: "object",
        properties: {
          connectionId: { type: "string", format: "uuid" },
          status:       { type: "string", enum: ["PENDING","SUBMITTED","PROCESSING","COMPLETED","FAILED","CANCELLED"] },
          page:         { type: "integer", default: 1 },
          pageSize:     { type: "integer", default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const merchantId = requireMerchantId(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = parsePagination(query);
    const result = await service.listWithdrawals({ merchantId, connectionId: query.connectionId as string | undefined, status: query.status as string | undefined, page, pageSize });
    return sendPaginated(reply, result.data, { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) });
  });

  app.get("/s2s/withdrawals/:id", {
    schema: {
      tags: [TAG_WITHDRAW],
      summary: "Get a withdrawal by ID",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const merchantId = requireMerchantId(request);
    const withdrawal = await service.getWithdrawal(id);
    if (withdrawal.merchantId !== merchantId) throw new ForbiddenError();
    return sendSuccess(reply, withdrawal);
  });

  app.patch("/s2s/withdrawals/:id/status", {
    schema: {
      tags: [TAG_WITHDRAW],
      summary: "Update withdrawal status",
      description: "Mark a withdrawal as COMPLETED or FAILED after the bank wire has been executed.",
      security: HMAC_SECURITY,
      params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
      body: {
        type: "object",
        required: ["status"],
        properties: {
          status:        { type: "string", enum: ["PROCESSING","COMPLETED","FAILED","CANCELLED"], description: "New status" },
          failureReason: { type: "string", description: "Reason for failure (required when status is FAILED)" },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: "PROCESSING"|"COMPLETED"|"FAILED"|"CANCELLED"; failureReason?: string };
    if (!body?.status) throw new ValidationError("status is required");
    const allowed = ["PROCESSING","COMPLETED","FAILED","CANCELLED"];
    if (!allowed.includes(body.status)) throw new ValidationError(`status must be one of: ${allowed.join(", ")}`);
    const withdrawal = await service.updateWithdrawalStatus(id, body.status, body.failureReason);
    return sendSuccess(reply, withdrawal);
  });
}

// ?? Helpers ????????????????????????????????????????????????????????

function requireMerchantId(request: FastifyRequest): string {
  const merchantId = request.merchant?.id;
  if (!merchantId) throw new ForbiddenError("Merchant context not found ? HMAC authentication required");
  return merchantId;
}

function sanitizeConnection(conn: S2sConnectionRow): Record<string, unknown> {
  const { apiSecret, ...rest } = conn as S2sConnectionRow & Record<string, unknown>;
  return {
    ...rest,
    apiSecretMasked: typeof apiSecret === "string"
      ? `${"*".repeat(Math.max(0, (apiSecret as string).length - 4))}${(apiSecret as string).slice(-4)}`
      : "***",
  };
}
