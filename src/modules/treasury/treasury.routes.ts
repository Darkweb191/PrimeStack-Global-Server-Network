import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { TreasuryService } from "./treasury.service.js";
import { sendSuccess, sendCreated } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * Treasury REST routes.
 * Base path: /treasury
 */
export function registerTreasuryRoutes(
  app: FastifyInstance,
  treasuryService: TreasuryService,
): void {
  // ── Float ────────────────────────────────────────

  app.post("/treasury/float", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.name || !body?.currency) {
      throw new ValidationError("name and currency are required");
    }
    const float = await treasuryService.createFloatAccount(body as never);
    return sendCreated(reply, float);
  });

  app.get("/treasury/float", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const floats = await treasuryService.listFloatAccounts(query.currency as string | undefined);
    return sendSuccess(reply, floats);
  });

  app.get("/treasury/float/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const float = await treasuryService.getFloatAccount(id);
    return sendSuccess(reply, float);
  });

  app.get("/treasury/float/check/low-balance", async (_request: FastifyRequest, reply: FastifyReply) => {
    const lowBalances = await treasuryService.checkLowBalance();
    return sendSuccess(reply, lowBalances);
  });

  // ── Liquidity ────────────────────────────────────

  app.post("/treasury/liquidity", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.name || !body?.currency || !body?.totalLiquidity) {
      throw new ValidationError("name, currency, and totalLiquidity are required");
    }
    const pool = await treasuryService.createLiquidityPool(body as never);
    return sendCreated(reply, pool);
  });

  app.get("/treasury/liquidity", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const pools = await treasuryService.listLiquidityPools(query.currency as string | undefined);
    return sendSuccess(reply, pools);
  });

  app.get("/treasury/liquidity/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const pool = await treasuryService.getLiquidityPool(id);
    return sendSuccess(reply, pool);
  });

  app.patch("/treasury/liquidity/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { totalLiquidity?: string; reservedLiquidity?: string };
    const pool = await treasuryService.updateLiquidity(id, body);
    return sendSuccess(reply, pool);
  });

  // ── Reserves ────────────────────────────────────

  app.post("/treasury/reserves", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.name || !body?.type || !body?.currency) {
      throw new ValidationError("name, type, and currency are required");
    }
    const reserve = await treasuryService.createReserveAccount(body as never);
    return sendCreated(reply, reserve);
  });

  app.get("/treasury/reserves", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const reserves = await treasuryService.listReserveAccounts(query.type as string | undefined);
    return sendSuccess(reply, reserves);
  });

  app.get("/treasury/reserves/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const reserve = await treasuryService.getReserveAccount(id);
    return sendSuccess(reply, reserve);
  });
}
