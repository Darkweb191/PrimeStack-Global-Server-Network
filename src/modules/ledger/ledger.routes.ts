import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { LedgerService } from "./ledger.service.js";
import { createAccountSchema, postEntrySchema, reverseEntrySchema, holdFundsSchema } from "./types.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { AppError, NotFoundError, ValidationError } from "../../core/errors.js";

/**
 * Ledger REST routes.
 *
 * These are admin/internal routes (protected by JWT auth) used to
 * manage accounts and post journal entries. Business modules
 * (transfers, settlement, etc.) call the LedgerService directly
 * rather than going through HTTP.
 *
 * Base path: /ledger
 */
export function registerLedgerRoutes(
  app: FastifyInstance,
  ledgerService: LedgerService,
): void {
  // ── Account Management ──────────────────────────

  app.post("/ledger/accounts", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid account data", {
        errors: parsed.error.errors,
      });
    }

    const account = await ledgerService.createAccount(parsed.data);
    return sendCreated(reply, account);
  });

  app.get("/ledger/accounts/:code", async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };
    const account = await ledgerService.getAccount(code);

    if (!account) {
      throw new NotFoundError("Account", code);
    }

    return sendSuccess(reply, account);
  });

  app.get("/ledger/accounts/:code/balance", async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };
    const balance = await ledgerService.getBalance(code);
    return sendSuccess(reply, balance);
  });

  // ── Journal Entries ─────────────────────────────

  app.post("/ledger/entries", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = postEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid journal entry data", {
        errors: parsed.error.errors,
      });
    }

    const entry = await ledgerService.postEntry(parsed.data);
    return sendCreated(reply, entry);
  });

  app.get("/ledger/entries", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;

    const result = await ledgerService.listEntries({
      entryType: query.entryType as string | undefined,
      status: query.status as string | undefined,
      source: query.source as string | undefined,
      page,
      pageSize,
    });

    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/ledger/entries/:reference", async (request: FastifyRequest, reply: FastifyReply) => {
    const { reference } = request.params as { reference: string };
    const entry = await ledgerService.getEntry(reference);

    if (!entry) {
      throw new NotFoundError("Journal entry", reference);
    }

    return sendSuccess(reply, entry);
  });

  app.post("/ledger/entries/:reference/reverse", async (request: FastifyRequest, reply: FastifyReply) => {
    const { reference } = request.params as { reference: string };
    const parsed = reverseEntrySchema.safeParse({
      ...request.body,
      reference,
    });

    if (!parsed.success) {
      throw new ValidationError("Invalid reversal data", {
        errors: parsed.error.errors,
      });
    }

    const reversal = await ledgerService.reverseEntry(parsed.data);
    return sendSuccess(reply, reversal, 201);
  });

  // ── Fund Holds ──────────────────────────────────

  app.post("/ledger/accounts/:code/hold", async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };
    const parsed = holdFundsSchema.safeParse({
      ...request.body,
      accountCode: code,
    });

    if (!parsed.success) {
      throw new ValidationError("Invalid hold funds data", {
        errors: parsed.error.errors,
      });
    }

    const result = await ledgerService.holdFunds(parsed.data);
    return sendSuccess(reply, result);
  });

  app.post("/ledger/accounts/:code/release", async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };
    const body = request.body as { amount: string; reference: string };

    if (!body?.amount || !body?.reference) {
      throw new ValidationError("amount and reference are required");
    }

    const result = await ledgerService.releaseFunds(code, body.amount, body.reference);
    return sendSuccess(reply, result);
  });

  // ── Account Entry History ────────────────────────

  app.get("/ledger/accounts/:code/entries", async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);

    const result = await ledgerService.listAccountEntries(code, page, pageSize);
    return sendPaginated(reply, result.data, result.meta);
  });
}
