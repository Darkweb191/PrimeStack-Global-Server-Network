import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ForbiddenError, ValidationError } from "../../core/errors.js";
import { sendCreated, sendSuccess } from "../../shared/utils/response.js";
import { developerPlatformDashboardHtml } from "./developer-platform-dashboard.js";
import { DeveloperPlatformService } from "./developer-platform.service.js";
import {
  createApplicationSchema,
  createCertificationSchema,
  createPartnerSchema,
  createProductSchema,
  createRatePlanSchema,
  createSdkVersionSchema,
  createWebhookSchema,
  updateActiveSchema,
  updateApplicationSchema,
  updateCertificationSchema,
} from "./developer-platform.types.js";

const readRoles = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER", "READONLY"];
const writeRoles = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
const credentialRoles = ["SUPER_ADMIN", "ADMIN"];

export function registerDeveloperPlatformRoutes(
  app: FastifyInstance,
  service: DeveloperPlatformService,
): void {
  app.get(
    "/admin/developer-platform-dashboard",
    async (_request: FastifyRequest, reply: FastifyReply) =>
      reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .send(developerPlatformDashboardHtml),
  );

  app.register(
    async (platformApp) => {
      platformApp.addHook("preHandler", async (request, reply) => {
        await platformApp.authenticate(request, reply);
        const role = (request.user as { role?: string } | undefined)?.role;
        const credentialRoute = request.url.includes("/api-keys");
        const roles =
          request.method === "GET" || request.method === "HEAD"
            ? readRoles
            : credentialRoute
              ? credentialRoles
              : writeRoles;
        if (!role || !roles.includes(role)) {
          throw new ForbiddenError(
            "Your admin role cannot perform this developer platform operation",
          );
        }
      });

      platformApp.get("/dashboard", async (_request, reply) =>
        sendSuccess(reply, await service.getDashboard()),
      );

      platformApp.get("/applications", async (_request, reply) =>
        sendSuccess(reply, await service.listApplications()),
      );
      platformApp.post("/applications", async (request, reply) => {
        const parsed = createApplicationSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid developer application", {
            errors: parsed.error.errors,
          });
        return sendCreated(reply, await service.createApplication(parsed.data));
      });
      platformApp.patch("/applications/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateApplicationSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid application update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateApplication(id, parsed.data),
        );
      });
      platformApp.post("/applications/:id/api-keys", async (request, reply) => {
        const { id } = request.params as { id: string };
        return sendCreated(reply, await service.createApplicationKey(id));
      });
      platformApp.post(
        "/applications/:id/api-keys/:keyId/rotate",
        async (request, reply) => {
          const { id, keyId } = request.params as { id: string; keyId: string };
          return sendCreated(
            reply,
            await service.rotateApplicationKey(id, keyId),
          );
        },
      );
      platformApp.delete(
        "/applications/:id/api-keys/:keyId",
        async (request, reply) => {
          const { id, keyId } = request.params as { id: string; keyId: string };
          return sendSuccess(
            reply,
            await service.revokeApplicationKey(id, keyId),
          );
        },
      );

      platformApp.get("/products", async (_request, reply) =>
        sendSuccess(reply, await service.listProducts()),
      );
      platformApp.post("/products", async (request, reply) => {
        const parsed = createProductSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid API product", {
            errors: parsed.error.errors,
          });
        return sendCreated(reply, await service.createProduct(parsed.data));
      });
      platformApp.patch("/products/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateActiveSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid API product update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateProduct(id, parsed.data.active),
        );
      });

      platformApp.get("/rate-plans", async (_request, reply) =>
        sendSuccess(reply, await service.listRatePlans()),
      );
      platformApp.post("/rate-plans", async (request, reply) => {
        const parsed = createRatePlanSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid API rate plan", {
            errors: parsed.error.errors,
          });
        return sendCreated(reply, await service.createRatePlan(parsed.data));
      });

      platformApp.get("/webhooks", async (_request, reply) =>
        sendSuccess(reply, await service.listWebhooks()),
      );
      platformApp.post("/applications/:id/webhooks", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = createWebhookSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid webhook registration", {
            errors: parsed.error.errors,
          });
        return sendCreated(reply, await service.createWebhook(id, parsed.data));
      });
      platformApp.patch("/webhooks/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateActiveSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid webhook update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateWebhook(id, parsed.data.active),
        );
      });

      platformApp.get("/sdk-versions", async (_request, reply) =>
        sendSuccess(reply, await service.listSdkVersions()),
      );
      platformApp.post("/sdk-versions", async (request, reply) => {
        const parsed = createSdkVersionSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid SDK version", {
            errors: parsed.error.errors,
          });
        return sendCreated(reply, await service.createSdkVersion(parsed.data));
      });

      platformApp.get("/partners", async (_request, reply) =>
        sendSuccess(reply, await service.listPartners()),
      );
      platformApp.post("/partners", async (request, reply) => {
        const parsed = createPartnerSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid partner", {
            errors: parsed.error.errors,
          });
        return sendCreated(reply, await service.createPartner(parsed.data));
      });
      platformApp.patch("/partners/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateActiveSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid partner update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updatePartner(id, parsed.data.active),
        );
      });

      platformApp.get("/certifications", async (_request, reply) =>
        sendSuccess(reply, await service.listCertifications()),
      );
      platformApp.post("/certifications", async (request, reply) => {
        const parsed = createCertificationSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid certification", {
            errors: parsed.error.errors,
          });
        return sendCreated(
          reply,
          await service.createCertification(parsed.data),
        );
      });
      platformApp.patch("/certifications/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = updateCertificationSchema.safeParse(request.body);
        if (!parsed.success)
          throw new ValidationError("Invalid certification update", {
            errors: parsed.error.errors,
          });
        return sendSuccess(
          reply,
          await service.updateCertification(id, parsed.data.status),
        );
      });
    },
    { prefix: "/admin/developer-platform" },
  );
}
