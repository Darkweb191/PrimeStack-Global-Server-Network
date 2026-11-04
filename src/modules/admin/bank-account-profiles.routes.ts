import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ForbiddenError, NotFoundError, ValidationError } from "../../core/errors.js";
import { sendCreated, sendSuccess } from "../../shared/utils/response.js";
import { encryptBankAccountDetails } from "./bank-account-vault.js";

const swiftCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/);
const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1).max(100),
  bankAddress: z.string().trim().min(1).max(200),
  accountName: z.string().trim().min(1).max(120),
  accountSignatory: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().regex(/^[0-9 -]{4,40}$/)
    .transform((value) => value.replace(/[ -]/g, ""))
    .pipe(z.string().regex(/^\d{4,34}$/)),
  wireRoutingNumber: z.string().trim().regex(/^\d{9}$/),
  swiftUsd: swiftCode,
  swiftOtherCurrency: swiftCode,
});

const profileIdSchema = z.string().uuid();
const PROFILE_MANAGEMENT_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

function auditUserAgent(request: FastifyRequest): string | undefined {
  const userAgent = request.headers["user-agent"];
  return typeof userAgent === "string" ? userAgent : undefined;
}

type SafeBankAccountProfile = {
  id: string;
  bankName: string;
  accountLast4: string;
  createdAt: Date;
  updatedAt: Date;
};

function assertCanManageProfiles(request: FastifyRequest): { id: string } {
  const user = request.user as { id?: string; role?: string } | undefined;
  if (!user?.id || !user.role || !PROFILE_MANAGEMENT_ROLES.has(user.role)) {
    throw new ForbiddenError("Your role cannot manage bank account profiles");
  }
  return { id: user.id };
}

function safeProfile(profile: SafeBankAccountProfile) {
  return {
    id: profile.id,
    bankName: profile.bankName,
    accountLast4: profile.accountLast4,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function parseProfileId(request: FastifyRequest): string {
  const parsed = profileIdSchema.safeParse((request.params as { id?: unknown }).id);
  if (!parsed.success) throw new ValidationError("Invalid bank account profile ID");
  return parsed.data;
}

export function registerAdminBankAccountProfileRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
): void {
  app.get("/admin/bank-account-profiles", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    assertCanManageProfiles(request);
    reply.header("Cache-Control", "no-store");
    const profiles = await prisma.bankAccountProfile.findMany({
      select: { id: true, bankName: true, accountLast4: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return sendSuccess(reply, profiles.map(safeProfile));
  });

  app.post("/admin/bank-account-profiles", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = assertCanManageProfiles(request);
    reply.header("Cache-Control", "no-store");
    const parsed = bankAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid bank account profile data", { errors: parsed.error.errors });
    }

    const details = parsed.data;
    const profile = await prisma.$transaction(async (transaction) => {
      const created = await transaction.bankAccountProfile.create({
        data: {
          bankName: details.bankName,
          accountLast4: details.accountNumber.slice(-4),
          encryptedDetails: encryptBankAccountDetails(details),
        },
        select: { id: true, bankName: true, accountLast4: true, createdAt: true, updatedAt: true },
      });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          action: "CREATE_BANK_ACCOUNT_PROFILE",
          entity: "BankAccountProfile",
          entityId: created.id,
          after: { bankName: created.bankName },
          ipAddress: request.ip,
          userAgent: auditUserAgent(request),
        },
      });
      return created;
    });

    return sendCreated(reply, safeProfile(profile));
  });

  app.delete("/admin/bank-account-profiles/:id", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = assertCanManageProfiles(request);
    reply.header("Cache-Control", "no-store");
    const id = parseProfileId(request);
    const profile = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.bankAccountProfile.findUnique({
        where: { id },
        select: { id: true, bankName: true, accountLast4: true },
      });
      if (!existing) throw new NotFoundError("Bank account profile", id);

      await transaction.bankAccountProfile.delete({ where: { id } });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          action: "DELETE_BANK_ACCOUNT_PROFILE",
          entity: "BankAccountProfile",
          entityId: existing.id,
          before: { bankName: existing.bankName },
          ipAddress: request.ip,
          userAgent: auditUserAgent(request),
        },
      });
      return existing;
    });

    return sendSuccess(reply, { id: profile.id, deleted: true });
  });
}
