import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../../core/errors.js";
import { sendCreated, sendSuccess } from "../../shared/utils/response.js";
import { governanceDashboardHtml } from "./governance-dashboard.js";
import { GovernanceService } from "./governance.service.js";
import {
  createBackupRecordSchema,
  createChangeRequestSchema,
  createContinuityTestSchema,
  createDrPlanSchema,
  createKeyRecordSchema,
  createRegulatoryReportSchema,
  createRetentionPolicySchema,
  createRiskSchema,
  createVendorSchema,
  updateBackupRecordSchema,
  updateChangeRequestSchema,
  updateDrPlanSchema,
  updateKeyRecordSchema,
  updateRegulatoryReportSchema,
  updateRetentionPolicySchema,
  updateRiskSchema,
  updateVendorSchema,
} from "./governance.types.js";

const readRoles = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER", "READONLY"];
const writeRoles = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
const changeApprovalRoles = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER"];

function actorId(request: FastifyRequest): string {
  const id = (request.user as { id?: string } | undefined)?.id;
  if (!id)
    throw new UnauthorizedError("Authenticated user identity is required");
  return id;
}

export function registerGovernanceRoutes(
  app: FastifyInstance,
  service: GovernanceService,
): void {
  app.get(
    "/admin/governance-dashboard",
    async (_request: FastifyRequest, reply: FastifyReply) =>
      reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .send(governanceDashboardHtml),
  );

  app.register(
    async (governanceApp) => {
      governanceApp.addHook("preHandler", async (request, reply) => {
        await governanceApp.authenticate(request, reply);
        const role = (request.user as { role?: string } | undefined)?.role;
        const changeApproval =
          request.method === "PATCH" &&
          request.url.includes("/change-requests/");
        const roles =
          request.method === "GET" || request.method === "HEAD"
            ? readRoles
            : changeApproval
              ? changeApprovalRoles
              : writeRoles;
        if (!role || !roles.includes(role))
          throw new ForbiddenError(
            "Your admin role cannot perform this governance operation",
          );
      });

      governanceApp.get("/dashboard", async (_request, reply) =>
        sendSuccess(reply, await service.getDashboard()),
      );

      governanceApp.get("/risks", async (_request, reply) =>
        sendSuccess(reply, await service.listRisks()),
      );
      governanceApp.post("/risks", async (request, reply) => {
        const parsed = createRiskSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid enterprise risk", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createRisk(parsed.data, actorId(request)),
        );
      });
      governanceApp.patch("/risks/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateRiskSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid risk update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateRisk(id, parsed.data, actorId(request)),
        );
      });

      governanceApp.get("/disaster-recovery-plans", async (_request, reply) =>
        sendSuccess(reply, await service.listDrPlans()),
      );
      governanceApp.post("/disaster-recovery-plans", async (request, reply) => {
        const parsed = createDrPlanSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid disaster-recovery plan", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createDrPlan(parsed.data, actorId(request)),
        );
      });
      governanceApp.patch(
        "/disaster-recovery-plans/:id",
        async (request, reply) => {
          const { id } = request.params as { id: string };
          const parsed = updateDrPlanSchema.safeParse(request.body);
          if (!parsed.success)
            throw new ValidationError("Invalid disaster-recovery plan update", {
              errors: parsed.error.errors,
            });
          return sendSuccess(
            reply,
            await service.updateDrPlan(id, parsed.data, actorId(request)),
          );
        },
      );

      governanceApp.get("/backups", async (_request, reply) =>
        sendSuccess(reply, await service.listBackups()),
      );
      governanceApp.post("/backups", async (request, reply) => {
        const parsed = createBackupRecordSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid backup record", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createBackup(parsed.data, actorId(request)),
        );
      });
      governanceApp.patch("/backups/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateBackupRecordSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid backup record update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateBackup(id, parsed.data, actorId(request)),
        );
      });

      governanceApp.get("/key-records", async (_request, reply) =>
        sendSuccess(reply, await service.listKeyRecords()),
      );
      governanceApp.post("/key-records", async (request, reply) => {
        const parsed = createKeyRecordSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid key lifecycle record", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createKeyRecord(parsed.data, actorId(request)),
        );
      });
      governanceApp.patch("/key-records/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateKeyRecordSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid key lifecycle update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateKeyRecord(id, parsed.data, actorId(request)),
        );
      });

      governanceApp.get("/retention-policies", async (_request, reply) =>
        sendSuccess(reply, await service.listRetentionPolicies()),
      );
      governanceApp.post("/retention-policies", async (request, reply) => {
        const parsed = createRetentionPolicySchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid retention policy", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createRetentionPolicy(parsed.data, actorId(request)),
        );
      });
      governanceApp.patch("/retention-policies/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateRetentionPolicySchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid retention policy update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateRetentionPolicy(
            id,
            parsed.data,
            actorId(request),
          ),
        );
      });

      governanceApp.get("/change-requests", async (_request, reply) =>
        sendSuccess(reply, await service.listChangeRequests()),
      );
      governanceApp.post("/change-requests", async (request, reply) => {
        const parsed = createChangeRequestSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid change request", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createChangeRequest(parsed.data, actorId(request)),
        );
      });
      governanceApp.patch("/change-requests/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateChangeRequestSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid change-request transition", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateChangeRequest(id, parsed.data, actorId(request)),
        );
      });

      governanceApp.get("/regulatory-reports", async (_request, reply) =>
        sendSuccess(reply, await service.listRegulatoryReports()),
      );
      governanceApp.post("/regulatory-reports", async (request, reply) => {
        const parsed = createRegulatoryReportSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid regulatory report record", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createRegulatoryReport(parsed.data, actorId(request)),
        );
      });
      governanceApp.patch("/regulatory-reports/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateRegulatoryReportSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid regulatory report update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateRegulatoryReport(
            id,
            parsed.data,
            actorId(request),
          ),
        );
      });

      governanceApp.get("/vendors", async (_request, reply) =>
        sendSuccess(reply, await service.listVendors()),
      );
      governanceApp.post("/vendors", async (request, reply) => {
        const parsed = createVendorSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid vendor", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createVendor(parsed.data, actorId(request)),
        );
      });
      governanceApp.patch("/vendors/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateVendorSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid vendor update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateVendor(id, parsed.data, actorId(request)),
        );
      });

      governanceApp.get("/continuity-tests", async (_request, reply) =>
        sendSuccess(reply, await service.listContinuityTests()),
      );
      governanceApp.post("/continuity-tests", async (request, reply) => {
        const parsed = createContinuityTestSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid continuity test record", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createContinuityTest(parsed.data, actorId(request)),
        );
      });
    },
    { prefix: "/admin/governance" },
  );
}
