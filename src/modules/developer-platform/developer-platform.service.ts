import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.js";
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
} from "./developer-platform.types.js";

const applicationInclude = {
  ratePlan: true,
  products: { include: { product: true } },
  keys: {
    select: {
      id: true,
      keyId: true,
      secretLast4: true,
      active: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
};

export class DeveloperPlatformService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard() {
    const [
      applicationCount,
      activeApplications,
      productCount,
      ratePlanCount,
      webhookCount,
      sdkCount,
      partnerCount,
      pendingCertifications,
      applications,
      products,
      ratePlans,
      webhooks,
      sdkVersions,
      partners,
      certifications,
    ] = await Promise.all([
      this.prisma.developerApplication.count(),
      this.prisma.developerApplication.count({ where: { status: "ACTIVE" } }),
      this.prisma.developerApiProduct.count(),
      this.prisma.developerApiRatePlan.count(),
      this.prisma.developerWebhook.count({ where: { active: true } }),
      this.prisma.developerSdkVersion.count(),
      this.prisma.developerPartner.count({ where: { active: true } }),
      this.prisma.developerCertification.count({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      }),
      this.listApplications(),
      this.listProducts(),
      this.listRatePlans(),
      this.listWebhooks(),
      this.listSdkVersions(),
      this.listPartners(),
      this.listCertifications(),
    ]);
    return {
      summary: {
        applications: applicationCount,
        activeApplications,
        products: productCount,
        ratePlans: ratePlanCount,
        activeWebhooks: webhookCount,
        sdkVersions: sdkCount,
        activePartners: partnerCount,
        pendingCertifications,
      },
      applications,
      products,
      ratePlans,
      webhooks,
      sdkVersions,
      partners,
      certifications,
    };
  }

  async listApplications() {
    return this.prisma.developerApplication.findMany({
      include: applicationInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async createApplication(input: CreateApplicationInput) {
    await this.validateAssignments(input.ratePlanId, input.productIds);
    return this.prisma.developerApplication.create({
      data: {
        appName: input.appName,
        ownerId: input.ownerId,
        appType: input.appType,
        ratePlanId: input.ratePlanId,
        products: {
          create: input.productIds.map((productId) => ({
            product: { connect: { id: productId } },
          })),
        },
      },
      include: applicationInclude,
    });
  }

  async updateApplication(id: string, input: UpdateApplicationInput) {
    const existing = await this.prisma.developerApplication.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("Developer application", id);
    await this.validateAssignments(input.ratePlanId, input.productIds);
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.DeveloperApplicationUpdateInput = {
        status: input.status,
      };
      if (input.ratePlanId !== undefined) {
        data.ratePlan = input.ratePlanId
          ? { connect: { id: input.ratePlanId } }
          : { disconnect: true };
      }
      const updated = await tx.developerApplication.update({
        where: { id },
        data,
      });
      if (input.status !== "ACTIVE") {
        await tx.developerApplicationKey.updateMany({
          where: { applicationId: id, active: true },
          data: { active: false, revokedAt: new Date() },
        });
      }
      if (input.productIds !== undefined) {
        await tx.developerApplicationProduct.deleteMany({
          where: { applicationId: id },
        });
        if (input.productIds.length > 0) {
          await tx.developerApplicationProduct.createMany({
            data: input.productIds.map((productId) => ({
              applicationId: id,
              productId,
            })),
          });
        }
      }
      return tx.developerApplication.findUniqueOrThrow({
        where: { id: updated.id },
        include: applicationInclude,
      });
    });
  }

  async createApplicationKey(applicationId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const application = await tx.developerApplication.findUnique({
          where: { id: applicationId },
          select: { id: true, status: true },
        });
        if (!application)
          throw new NotFoundError("Developer application", applicationId);
        if (application.status !== "ACTIVE") {
          throw new ValidationError(
            "Activate the application before creating API credentials",
          );
        }
        const activeKey = await tx.developerApplicationKey.findFirst({
          where: { applicationId, active: true },
          select: { id: true },
        });
        if (activeKey)
          throw new ConflictError(
            "An active application key already exists; rotate it instead",
          );
        return this.createKeyRecord(tx, applicationId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async rotateApplicationKey(applicationId: string, keyId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const application = await tx.developerApplication.findUnique({
          where: { id: applicationId },
          select: { id: true, status: true },
        });
        if (!application)
          throw new NotFoundError("Developer application", applicationId);
        if (application.status !== "ACTIVE") {
          throw new ValidationError(
            "Activate the application before rotating API credentials",
          );
        }
        const previous = await tx.developerApplicationKey.findFirst({
          where: { applicationId, keyId, active: true },
          select: { id: true },
        });
        if (!previous) throw new NotFoundError("Active application key", keyId);
        await tx.developerApplicationKey.update({
          where: { id: previous.id },
          data: { active: false, revokedAt: new Date() },
        });
        return this.createKeyRecord(tx, applicationId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revokeApplicationKey(applicationId: string, keyId: string) {
    const key = await this.prisma.developerApplicationKey.findFirst({
      where: { applicationId, keyId, active: true },
      select: { id: true },
    });
    if (!key) throw new NotFoundError("Active application key", keyId);
    await this.prisma.developerApplicationKey.update({
      where: { id: key.id },
      data: { active: false, revokedAt: new Date() },
    });
    return { keyId, revoked: true };
  }

  async listProducts() {
    return this.prisma.developerApiProduct.findMany({
      orderBy: { productName: "asc" },
      take: 200,
    });
  }

  async createProduct(input: {
    productName: string;
    description?: string;
    active: boolean;
  }) {
    if (
      await this.prisma.developerApiProduct.findUnique({
        where: { productName: input.productName },
      })
    ) {
      throw new ConflictError("API product name already exists");
    }
    return this.prisma.developerApiProduct.create({ data: input });
  }

  async updateProduct(id: string, active: boolean) {
    if (
      !(await this.prisma.developerApiProduct.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("API product", id);
    }
    return this.prisma.developerApiProduct.update({
      where: { id },
      data: { active },
    });
  }

  async listRatePlans() {
    return this.prisma.developerApiRatePlan.findMany({
      orderBy: { planName: "asc" },
      take: 200,
    });
  }

  async createRatePlan(input: {
    planName: string;
    requestsPerMinute?: number | null;
    dailyLimit?: number | null;
  }) {
    if (
      await this.prisma.developerApiRatePlan.findUnique({
        where: { planName: input.planName },
      })
    ) {
      throw new ConflictError("Rate plan name already exists");
    }
    return this.prisma.developerApiRatePlan.create({ data: input });
  }

  async listWebhooks() {
    return this.prisma.developerWebhook.findMany({
      include: { application: { select: { appName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async createWebhook(
    applicationId: string,
    input: { eventName: string; callbackUrl: string },
  ) {
    if (
      !(await this.prisma.developerApplication.findUnique({
        where: { id: applicationId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("Developer application", applicationId);
    }
    return this.prisma.developerWebhook.create({
      data: { applicationId, ...input },
    });
  }

  async updateWebhook(id: string, active: boolean) {
    if (
      !(await this.prisma.developerWebhook.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("Webhook registration", id);
    }
    return this.prisma.developerWebhook.update({
      where: { id },
      data: { active },
    });
  }

  async listSdkVersions() {
    return this.prisma.developerSdkVersion.findMany({
      orderBy: [{ sdkName: "asc" }, { version: "desc" }],
      take: 200,
    });
  }

  async createSdkVersion(input: {
    sdkName: string;
    language: string;
    version: string;
  }) {
    const existing = await this.prisma.developerSdkVersion.findFirst({
      where: input,
      select: { id: true },
    });
    if (existing) throw new ConflictError("SDK version already exists");
    return this.prisma.developerSdkVersion.create({ data: input });
  }

  async listPartners() {
    return this.prisma.developerPartner.findMany({
      orderBy: { partnerName: "asc" },
      take: 200,
    });
  }

  async createPartner(input: {
    partnerName: string;
    partnerType: string;
    active: boolean;
  }) {
    const existing = await this.prisma.developerPartner.findFirst({
      where: { partnerName: input.partnerName, partnerType: input.partnerType },
      select: { id: true },
    });
    if (existing)
      throw new ConflictError("Partner already exists with this type");
    return this.prisma.developerPartner.create({ data: input });
  }

  async updatePartner(id: string, active: boolean) {
    if (
      !(await this.prisma.developerPartner.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("Partner", id);
    }
    return this.prisma.developerPartner.update({
      where: { id },
      data: { active },
    });
  }

  async listCertifications() {
    return this.prisma.developerCertification.findMany({
      include: { application: { select: { appName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async createCertification(input: {
    applicationId: string;
    certificationType: string;
  }) {
    if (
      !(await this.prisma.developerApplication.findUnique({
        where: { id: input.applicationId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("Developer application", input.applicationId);
    }
    return this.prisma.developerCertification.create({ data: input });
  }

  async updateCertification(id: string, status: string) {
    if (
      !(await this.prisma.developerCertification.findUnique({
        where: { id },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("Certification", id);
    }
    return this.prisma.developerCertification.update({
      where: { id },
      data: { status },
    });
  }

  private async validateAssignments(
    ratePlanId?: string | null,
    productIds?: string[],
  ) {
    if (
      ratePlanId &&
      !(await this.prisma.developerApiRatePlan.findUnique({
        where: { id: ratePlanId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("API rate plan", ratePlanId);
    }
    if (productIds === undefined || productIds.length === 0) return;
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length)
      throw new ValidationError("An API product may only be assigned once");
    const count = await this.prisma.developerApiProduct.count({
      where: { id: { in: productIds }, active: true },
    });
    if (count !== productIds.length) {
      throw new ValidationError(
        "All assigned API products must exist and be active",
      );
    }
  }

  private async createKeyRecord(
    tx: Prisma.TransactionClient,
    applicationId: string,
  ) {
    const keyId = `dpk_${randomBytes(16).toString("hex")}`;
    const secret = `dps_${randomBytes(32).toString("hex")}`;
    const secretHash = createHash("sha256").update(secret).digest("hex");
    const secretLast4 = secret.slice(-4);
    const key = await tx.developerApplicationKey.create({
      data: { applicationId, keyId, secretHash, secretLast4 },
      select: { id: true, keyId: true, secretLast4: true, createdAt: true },
    });
    return { ...key, secret };
  }
}
