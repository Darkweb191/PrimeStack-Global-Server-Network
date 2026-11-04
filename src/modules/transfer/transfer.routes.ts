import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { TransferService } from "./transfer.service.js";
import { createTransferSchema, bulkTransferSchema } from "./types.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * Transfer REST routes.
 *
 * Base path: /transfers
 */
export function registerTransferRoutes(
  app: FastifyInstance,
  transferService: TransferService,
): void {
  app.post("/transfers", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid transfer data", { errors: parsed.error.errors });
    }

    const transfer = await transferService.createTransfer(parsed.data);
    return sendCreated(reply, transfer);
  });

  app.post("/transfers/bulk", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = bulkTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid bulk transfer data", { errors: parsed.error.errors });
    }

    const result = await transferService.createBulkTransfer(parsed.data);
    return sendCreated(reply, result);
  });

  app.get("/transfers", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;

    const result = await transferService.listTransfers({
      type: query.type as string | undefined,
      status: query.status as string | undefined,
      merchantId: query.merchantId as string | undefined,
      page,
      pageSize,
    });

    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/transfers/:reference", async (request: FastifyRequest, reply: FastifyReply) => {
    const { reference } = request.params as { reference: string };
    const transfer = await transferService.getTransfer(reference);
    return sendSuccess(reply, transfer);
  });

  app.post("/transfers/:reference/reverse", async (request: FastifyRequest, reply: FastifyReply) => {
    const { reference } = request.params as { reference: string };
    const body = request.body as { reason: string };

    if (!body?.reason) {
      throw new ValidationError("reason is required");
    }

    const transfer = await transferService.reverseTransfer(reference, body.reason);
    return sendSuccess(reply, transfer);
  });
}
