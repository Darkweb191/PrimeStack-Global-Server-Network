import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ForbiddenError, ValidationError } from "../../core/errors.js";
import { sendCreated, sendSuccess } from "../../shared/utils/response.js";
import { pagDashboardHtml } from "./pag-dashboard.js";
import { PagService } from "./pag.service.js";
import {
  assetRouteRequestSchema,
  createAssetAccountSchema,
  createAssetRouteSchema,
  createAssetSchema,
  createComplianceCheckSchema,
  createConversionRateSchema,
  createLiquidityPoolSchema,
  createNetworkSchema,
  resolveComplianceCheckSchema,
  updateLiquiditySnapshotSchema,
} from "./pag.types.js";

const readRoles = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER", "READONLY"];
const writeRoles = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

export function registerPagRoutes(app: FastifyInstance, service: PagService): void {
  app.get("/admin/pag-dashboard", async (_request: FastifyRequest, reply: FastifyReply) =>
    reply.type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(pagDashboardHtml));

  app.register(async (pagApp) => {
    pagApp.addHook("preHandler", async (request, reply) => {
      await pagApp.authenticate(request, reply);
      const role = (request.user as { role?: string } | undefined)?.role;
      const allowed = request.method === "GET" || request.method === "HEAD" || request.url === "/admin/pag/route-selection"
        ? readRoles
        : writeRoles;
      if (!role || !allowed.includes(role)) {
        throw new ForbiddenError("Your admin role cannot perform this PAG operation");
      }
    });

    pagApp.get("/dashboard", async (_request, reply) => sendSuccess(reply, await service.getDashboard()));
    pagApp.get("/assets", async (_request, reply) => sendSuccess(reply, await service.listAssets()));
    pagApp.post("/assets", async (request, reply) => {
      const parsed = createAssetSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid asset", { errors: parsed.error.errors });
      return sendCreated(reply, await service.createAsset(parsed.data));
    });

    pagApp.get("/networks", async (_request, reply) => sendSuccess(reply, await service.listNetworks()));
    pagApp.post("/networks", async (request, reply) => {
      const parsed = createNetworkSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid network", { errors: parsed.error.errors });
      return sendCreated(reply, await service.createNetwork(parsed.data));
    });

    pagApp.get("/routes", async (_request, reply) => sendSuccess(reply, await service.listRoutes()));
    pagApp.post("/routes", async (request, reply) => {
      const parsed = createAssetRouteSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid asset route", { errors: parsed.error.errors });
      return sendCreated(reply, await service.createRoute(parsed.data));
    });
    pagApp.post("/route-selection", async (request, reply) => {
      const parsed = assetRouteRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid route request", { errors: parsed.error.errors });
      return sendSuccess(reply, await service.routeAsset(parsed.data));
    });

    pagApp.get("/conversion-rates", async (_request, reply) => sendSuccess(reply, await service.listConversionRates()));
    pagApp.post("/conversion-rates", async (request, reply) => {
      const parsed = createConversionRateSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid conversion rate", { errors: parsed.error.errors });
      return sendCreated(reply, await service.createConversionRate(parsed.data));
    });

    pagApp.get("/liquidity-pools", async (_request, reply) => sendSuccess(reply, await service.listLiquidityPools()));
    pagApp.post("/liquidity-pools", async (request, reply) => {
      const parsed = createLiquidityPoolSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid liquidity pool", { errors: parsed.error.errors });
      return sendCreated(reply, await service.createLiquidityPool(parsed.data));
    });
    pagApp.put("/liquidity-pools/:id/snapshot", async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateLiquiditySnapshotSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid liquidity snapshot", { errors: parsed.error.errors });
      return sendSuccess(reply, await service.updateLiquiditySnapshot(id, parsed.data));
    });

    pagApp.get("/asset-accounts", async (_request, reply) => sendSuccess(reply, await service.listAssetAccounts()));
    pagApp.post("/asset-accounts", async (request, reply) => {
      const parsed = createAssetAccountSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid asset account", { errors: parsed.error.errors });
      return sendCreated(reply, await service.createAssetAccount(parsed.data));
    });
    pagApp.get("/asset-ledger", async (_request, reply) => sendSuccess(reply, await service.listAssetLedger()));

    pagApp.get("/compliance-checks", async (_request, reply) => sendSuccess(reply, await service.listComplianceChecks()));
    pagApp.post("/compliance-checks", async (request, reply) => {
      const parsed = createComplianceCheckSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid compliance review", { errors: parsed.error.errors });
      return sendCreated(reply, await service.createComplianceCheck(parsed.data));
    });
    pagApp.patch("/compliance-checks/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = resolveComplianceCheckSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid compliance review result", { errors: parsed.error.errors });
      const user = request.user as { id?: string } | undefined;
      return sendSuccess(reply, await service.resolveComplianceCheck(id, parsed.data, user?.id ?? "admin"));
    });
  }, { prefix: "/admin/pag" });
}
