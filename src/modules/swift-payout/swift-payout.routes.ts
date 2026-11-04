import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ForbiddenError, ValidationError } from "../../core/errors.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { swiftPayoutDashboardHtml } from "./swift-payout-dashboard.js";
import { generateSwiftPayoutDraft } from "./swift-payout.service.js";
import { swiftPayoutDraftSchema } from "./swift-payout.types.js";

const payoutDraftRoles = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

export function registerSwiftPayoutModule(app: FastifyInstance): void {
  app.get("/admin/swift-payout-draft", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(swiftPayoutDashboardHtml);
  });

  app.register(async (adminApp) => {
    adminApp.addHook("preHandler", async (request, reply) => {
      await adminApp.authenticate(request, reply);
      const role = (request.user as { role?: string } | undefined)?.role;
      if (!role || !payoutDraftRoles.includes(role)) {
        throw new ForbiddenError("Your admin role cannot create SWIFT payout drafts");
      }
    });

    adminApp.post("/swift-payouts/draft", async (request, reply) => {
      const parsed = swiftPayoutDraftSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid SWIFT payout draft", { errors: parsed.error.errors });
      }
      return sendSuccess(reply, generateSwiftPayoutDraft(parsed.data));
    });
  }, { prefix: "/admin" });
}
