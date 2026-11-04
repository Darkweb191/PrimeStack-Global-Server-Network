import { FastifyInstance, FastifyReply } from "fastify";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { hashPassword, verifyPassword } from "../../shared/utils/crypto.js";
import { config } from "../../config/index.js";
import type { CreateUserInput, UpdateUserInput, UpdateKycInput } from "./types.js";

/**
 * Admin Service
 *
 * Handles platform administration:
 *   - User authentication (login via JWT)
 *   - User CRUD with role-based access control
 *   - Audit logging for all admin actions
 *   - KYC review workflow
 */
export class AdminService {
  constructor(private prisma: PrismaClient) {}

  // ── Authentication ──────────────────────────────

  async login(email: string, password: string, reply?: FastifyReply) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT
    const token = reply
      ? await reply.jwtSign({
          id: user.id,
          email: user.email,
          role: user.role,
          lang: user.preferredLang,
        })
      : undefined;

    logger.info({ userId: user.id, email: user.email }, "Admin login successful");

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        preferredLang: user.preferredLang,
      },
    };
  }

  // ── User Management ─────────────────────────────

  async createUser(input: CreateUserInput, createdBy?: string) {
    // Check if email or username already exists
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { username: input.username }],
      },
    });
    if (existing) {
      throw new ConflictError("User with this email or username already exists");
    }

    const passwordHash = await hashPassword(input.password);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash,
        fullName: input.fullName,
        role: input.role,
        preferredLang: input.preferredLang,
      },
    });

    // Audit log
    await this.createAuditLog({
      userId: createdBy,
      action: "CREATE_USER",
      entity: "User",
      entityId: user.id,
      after: {
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });

    logger.info({ userId: user.id, email: user.email, role: user.role }, "Admin user created");

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      preferredLang: user.preferredLang,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        preferredLang: true,
        isActive: true,
        lastLoginAt: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User", id);
    }

    return user;
  }

  async listUsers(filters: { role?: string; isActive?: boolean; page: number; pageSize: number }) {
    const where: Prisma.UserWhereInput = {};
    if (filters.role) where.role = filters.role as never;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          fullName: true,
          role: true,
          preferredLang: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  async updateUser(id: string, input: UpdateUserInput, updatedBy?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("User", id);
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.fullName) data.fullName = input.fullName;
    if (input.role) data.role = input.role;
    if (input.preferredLang) data.preferredLang = input.preferredLang;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password) data.passwordHash = await hashPassword(input.password);

    const before = {
      fullName: user.fullName,
      role: user.role,
      preferredLang: user.preferredLang,
      isActive: user.isActive,
    };

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        preferredLang: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await this.createAuditLog({
      userId: updatedBy,
      action: "UPDATE_USER",
      entity: "User",
      entityId: id,
      before,
      after: updated,
    });

    logger.info({ userId: id, updatedBy }, "Admin user updated");
    return updated;
  }

  async deleteUser(id: string, deletedBy?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("User", id);
    }

    // Soft delete — just deactivate
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await this.createAuditLog({
      userId: deletedBy,
      action: "DELETE_USER",
      entity: "User",
      entityId: id,
      before: { email: user.email, isActive: true },
      after: { isActive: false },
    });

    logger.info({ userId: id, deletedBy }, "Admin user deactivated");
    return { id, isActive: false };
  }

  // ── Audit Logging ───────────────────────────────

  async createAuditLog(entry: {
    userId?: string;
    merchantId?: string;
    action: string;
    entity: string;
    entityId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        merchantId: entry.merchantId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before as Prisma.InputJsonValue | undefined,
        after: entry.after as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }

  async listAuditLogs(filters: {
    userId?: string;
    merchantId?: string;
    action?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.action) where.action = { contains: filters.action, mode: "insensitive" };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { email: true, fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── KYC Management ──────────────────────────────

  async getKyc(merchantId: string) {
    const kyc = await this.prisma.kycRecord.findUnique({
      where: { merchantId },
      include: { merchant: true },
    });

    if (!kyc) {
      throw new NotFoundError("KYC record", merchantId);
    }

    return kyc;
  }

  async updateKyc(merchantId: string, input: UpdateKycInput, reviewedBy?: string) {
    const kyc = await this.prisma.kycRecord.findUnique({
      where: { merchantId },
    });

    if (!kyc) {
      throw new NotFoundError("KYC record", merchantId);
    }

    if (input.status === "APPROVED") {
      const documents = await this.prisma.merchantKycDocument.findMany({
        where: { merchantId },
        select: { documentType: true, verificationStatus: true },
        orderBy: { createdAt: "desc" },
      });
      const latestStatusByType = new Map<string, string>();
      for (const document of documents) {
        if (!latestStatusByType.has(document.documentType)) {
          latestStatusByType.set(document.documentType, document.verificationStatus);
        }
      }
      if ([...latestStatusByType.values()].some((status) => status !== "VERIFIED")) {
        throw new ValidationError("The latest submission for each merchant document type must be verified before KYC approval");
      }
    }

    const updated = await this.prisma.kycRecord.update({
      where: { merchantId },
      data: {
        status: input.status,
        reviewNotes: input.reviewNotes,
        level: input.level,
        reviewedBy,
        reviewedAt: ["APPROVED", "REJECTED"].includes(input.status) ? new Date() : undefined,
      },
    });

    // If KYC approved, activate the merchant
    if (input.status === "APPROVED") {
      await this.prisma.merchant.update({
        where: { id: merchantId },
        data: { status: "ACTIVE" },
      });
    }

    await this.createAuditLog({
      userId: reviewedBy,
      merchantId,
      action: "UPDATE_KYC",
      entity: "KycRecord",
      entityId: kyc.id,
      before: { status: kyc.status },
      after: { status: input.status, level: input.level },
    });

    logger.info({ merchantId, status: input.status, reviewedBy }, "KYC updated");
    return updated;
  }

  async listPendingKyc(page: number, pageSize: number) {
    const [records, total] = await Promise.all([
      this.prisma.kycRecord.findMany({
        where: {
          status: { in: ["PENDING", "UNDER_REVIEW"] },
        },
        include: {
          merchant: {
            select: { id: true, code: true, legalName: true, email: true, country: true },
          },
        },
        orderBy: { submittedAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.kycRecord.count({
        where: {
          status: { in: ["PENDING", "UNDER_REVIEW"] },
        },
      }),
    ]);

    return {
      data: records,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
