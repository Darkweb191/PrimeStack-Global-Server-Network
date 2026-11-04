import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { MerchantService } from "./merchant.service.js";
import {
  assignAgentSchema,
  assignMerchantWalletSchema,
  createAgentSchema,
  createKycDocumentSchema,
  createMerchantInvoiceSchema,
  createMerchantSchema,
  createMidSchema,
  createPaymentLinkSchema,
  createPricingPlanSchema,
  merchantRiskProfileSchema,
  reviewKycDocumentSchema,
  updateMerchantSchema,
  updateMerchantStatusSchema,
} from "./merchant.types.js";
import {
  sendSuccess,
  sendCreated,
  sendPaginated,
  parsePagination,
} from "../../shared/utils/response.js";
import { UnauthorizedError, ValidationError } from "../../core/errors.js";

/**
 * Merchant REST routes.
 * Base path: /merchants
 */
export function registerMerchantRoutes(
  app: FastifyInstance,
  merchantService: MerchantService,
): void {
  app.get("/merchants/overview", async (_request, reply) => {
    return sendSuccess(reply, await merchantService.getMerchantDashboard());
  });

  app.post(
    "/merchants",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createMerchantSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid merchant data", {
          errors: parsed.error.errors,
        });
      }
      const merchant = await merchantService.createMerchant(parsed.data);
      return sendCreated(reply, merchant);
    },
  );

  app.get(
    "/merchants",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, pageSize } = parsePagination(
        request.query as Record<string, unknown>,
      );
      const query = request.query as Record<string, unknown>;
      const result = await merchantService.listMerchants({
        status: query.status as string | undefined,
        country: query.country as string | undefined,
        page,
        pageSize,
      });
      return sendPaginated(reply, result.data, result.meta);
    },
  );

  app.get("/merchants/:id/home", async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendSuccess(reply, await merchantService.getMerchantHome(id));
  });

  app.get(
    "/merchants/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const merchant = await merchantService.getMerchant(id);
      return sendSuccess(reply, merchant);
    },
  );

  app.get(
    "/merchants/:id/stats",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const stats = await merchantService.getMerchantStats(id);
      return sendSuccess(reply, stats);
    },
  );

  app.patch(
    "/merchants/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = updateMerchantSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid update data", {
          errors: parsed.error.errors,
        });
      }
      const merchant = await merchantService.updateMerchant(id, parsed.data);
      return sendSuccess(reply, merchant);
    },
  );

  app.post(
    "/merchants/:id/suspend",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { reason?: string };
      const merchant = await merchantService.suspendMerchant(id, body?.reason);
      return sendSuccess(reply, merchant);
    },
  );

  app.post(
    "/merchants/:id/reactivate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const merchant = await merchantService.reactivateMerchant(id);
      return sendSuccess(reply, merchant);
    },
  );

  app.patch("/merchants/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateMerchantStatusSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid merchant status", {
        errors: parsed.error.errors,
      });
    return sendSuccess(
      reply,
      await merchantService.setMerchantStatus(id, parsed.data.status),
    );
  });

  app.get("/merchants/:id/mids", async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendSuccess(reply, await merchantService.listMerchantIds(id));
  });

  app.post("/merchants/:id/mids", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createMidSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid MID data", {
        errors: parsed.error.errors,
      });
    return sendCreated(
      reply,
      await merchantService.createMerchantId(id, parsed.data),
    );
  });

  app.get("/merchants/:id/terminals", async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendSuccess(reply, await merchantService.listMerchantTerminals(id));
  });

  app.put(
    "/merchants/:id/terminals/:terminalId/mid",
    async (request, reply) => {
      const { id, terminalId } = request.params as {
        id: string;
        terminalId: string;
      };
      const body = request.body as { mid?: string };
      if (!body?.mid?.trim()) throw new ValidationError("mid is required");
      return sendSuccess(
        reply,
        await merchantService.assignTerminal(id, terminalId, body.mid.trim()),
      );
    },
  );

  app.get("/merchants/:id/kyc-documents", async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendSuccess(reply, await merchantService.listKycDocuments(id));
  });

  app.post("/merchants/:id/kyc-documents", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createKycDocumentSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid KYC document", {
        errors: parsed.error.errors,
      });
    return sendCreated(
      reply,
      await merchantService.addKycDocument(id, parsed.data),
    );
  });

  app.patch("/merchants/kyc-documents/:documentId", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const parsed = reviewKycDocumentSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid KYC review", {
        errors: parsed.error.errors,
      });
    const reviewerId = (request.user as { id?: string } | undefined)?.id;
    return sendSuccess(
      reply,
      await merchantService.reviewKycDocument(documentId, {
        ...parsed.data,
        reviewedBy: reviewerId,
      }),
    );
  });

  app.put("/merchants/:id/risk-profile", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = merchantRiskProfileSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid risk profile", {
        errors: parsed.error.errors,
      });
    return sendSuccess(
      reply,
      await merchantService.setRiskProfile(id, parsed.data),
    );
  });

  app.get("/pricing-plans", async (_request, reply) => {
    return sendSuccess(reply, await merchantService.listPricingPlans());
  });

  app.post("/pricing-plans", async (request, reply) => {
    const parsed = createPricingPlanSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid pricing plan", {
        errors: parsed.error.errors,
      });
    return sendCreated(
      reply,
      await merchantService.createPricingPlan(parsed.data),
    );
  });

  app.put("/merchants/:id/pricing-plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { pricingPlanId?: string | null };
    if (
      body?.pricingPlanId !== null &&
      typeof body?.pricingPlanId !== "string"
    ) {
      throw new ValidationError("pricingPlanId must be a UUID or null");
    }
    return sendSuccess(
      reply,
      await merchantService.assignPricingPlan(id, body.pricingPlanId ?? null),
    );
  });

  app.post("/merchants/:id/wallet-accounts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = assignMerchantWalletSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid merchant wallet mapping", {
        errors: parsed.error.errors,
      });
    return sendCreated(
      reply,
      await merchantService.mapMerchantWallet(id, parsed.data),
    );
  });

  app.get("/agents", async (_request, reply) => {
    return sendSuccess(reply, await merchantService.listAgents());
  });

  app.post("/agents", async (request, reply) => {
    const parsed = createAgentSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid agent", {
        errors: parsed.error.errors,
      });
    return sendCreated(reply, await merchantService.createAgent(parsed.data));
  });

  app.put("/merchants/:id/agent", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = assignAgentSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid agent assignment", {
        errors: parsed.error.errors,
      });
    return sendSuccess(
      reply,
      await merchantService.assignAgent(id, parsed.data.agentId),
    );
  });
}

function merchantContext(request: FastifyRequest): string {
  if (!request.merchant?.id)
    throw new UnauthorizedError("Merchant authentication is required");
  return request.merchant.id;
}

export function registerMerchantPortalRoutes(
  app: FastifyInstance,
  merchantService: MerchantService,
): void {
  app.get("/merchant/profile", async (request, reply) => {
    return sendSuccess(
      reply,
      await merchantService.getMerchant(merchantContext(request)),
    );
  });

  app.get("/merchant/transactions", async (request, reply) => {
    const { page, pageSize } = parsePagination(
      request.query as Record<string, unknown>,
    );
    const result = await merchantService.listMerchantTransactions(
      merchantContext(request),
      page,
      pageSize,
    );
    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/merchant/terminals", async (request, reply) => {
    return sendSuccess(
      reply,
      await merchantService.listMerchantTerminals(merchantContext(request)),
    );
  });

  app.get("/merchant/kyc-documents", async (request, reply) => {
    return sendSuccess(
      reply,
      await merchantService.listKycDocuments(merchantContext(request)),
    );
  });

  app.post("/merchant/kyc-documents", async (request, reply) => {
    const parsed = createKycDocumentSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid KYC document", {
        errors: parsed.error.errors,
      });
    return sendCreated(
      reply,
      await merchantService.addKycDocument(
        merchantContext(request),
        parsed.data,
      ),
    );
  });

  app.get("/merchant/settlements", async (request, reply) => {
    const { page, pageSize } = parsePagination(
      request.query as Record<string, unknown>,
    );
    const result = await merchantService.listMerchantSettlements(
      merchantContext(request),
      page,
      pageSize,
    );
    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/merchant/balance", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const currency = String(query.currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new ValidationError("currency must be a three-letter code");
    return sendSuccess(
      reply,
      await merchantService.getMerchantBalance(
        merchantContext(request),
        currency,
      ),
    );
  });

  app.get("/merchant/statements", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = parsePagination(query);
    const currency = String(query.currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new ValidationError("currency must be a three-letter code");
    const result = await merchantService.listMerchantStatement(
      merchantContext(request),
      currency,
      page,
      pageSize,
    );
    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/merchant/invoices", async (request, reply) => {
    const { page, pageSize } = parsePagination(
      request.query as Record<string, unknown>,
    );
    const result = await merchantService.listInvoices(
      merchantContext(request),
      page,
      pageSize,
    );
    return sendPaginated(reply, result.data, result.meta);
  });

  app.post("/merchant/invoices", async (request, reply) => {
    const parsed = createMerchantInvoiceSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid invoice", {
        errors: parsed.error.errors,
      });
    return sendCreated(
      reply,
      await merchantService.createInvoice(merchantContext(request), {
        ...parsed.data,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
      }),
    );
  });

  app.get("/merchant/payment-links", async (request, reply) => {
    const { page, pageSize } = parsePagination(
      request.query as Record<string, unknown>,
    );
    const result = await merchantService.listPaymentLinks(
      merchantContext(request),
      page,
      pageSize,
    );
    return sendPaginated(reply, result.data, result.meta);
  });

  app.post("/merchant/payment-links", async (request, reply) => {
    const parsed = createPaymentLinkSchema.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError("Invalid payment link", {
        errors: parsed.error.errors,
      });
    return sendCreated(
      reply,
      await merchantService.createPaymentLink(merchantContext(request), {
        ...parsed.data,
        expiresAt: parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : undefined,
      }),
    );
  });
}
