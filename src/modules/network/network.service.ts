import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { NotFoundError, ConflictError, ValidationError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { invalidateIpWhitelistCache } from "../../plugins/ip-whitelist.js";

/**
 * Network Service
 *
 * Manages all network security components:
 *   - IP whitelist (single IPs and CIDR ranges)
 *   - HMAC keys (create, rotate, revoke per merchant)
 *   - API keys (scoped keys for programmatic access)
 *   - TLS/mTLS certificates (store and track expiry)
 *
 * Every write to IP whitelist also invalidates the Redis cache
 * so the IP whitelist plugin picks up changes immediately.
 */
export class NetworkService {
  constructor(private prisma: PrismaClient) {}

  // ── IP Whitelist ────────────────────────────────

  async addIp(input: {
    ipAddress: string;
    label?: string;
    merchantId?: string;
    expiresAt?: Date;
  }) {
    // Validate IP or CIDR format
    if (!this.isValidIpOrCidr(input.ipAddress)) {
      throw new ValidationError(`Invalid IP address or CIDR: ${input.ipAddress}`);
    }

    const entry = await this.prisma.ipWhitelistEntry.create({
      data: {
        ipAddress: input.ipAddress,
        label: input.label,
        merchantId: input.merchantId,
        status: "ACTIVE",
        expiresAt: input.expiresAt,
      },
    });

    await invalidateIpWhitelistCache();
    logger.info({ ipAddress: input.ipAddress, merchantId: input.merchantId }, "IP whitelisted");
    return entry;
  }

  async removeIp(id: string) {
    const entry = await this.prisma.ipWhitelistEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundError("IP whitelist entry", id);

    await this.prisma.ipWhitelistEntry.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await invalidateIpWhitelistCache();
    logger.info({ id, ipAddress: entry.ipAddress }, "IP removed from whitelist");
    return { id, removed: true };
  }

  async listIps(filters: {
    merchantId?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.IpWhitelistEntryWhereInput = {};
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.status) where.status = filters.status as never;

    const [entries, total] = await Promise.all([
      this.prisma.ipWhitelistEntry.findMany({
        where,
        include: { merchant: { select: { code: true, legalName: true } } },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.ipWhitelistEntry.count({ where }),
    ]);

    return {
      data: entries,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── HMAC Keys ────────────────────────────────────

  async createHmacKey(input: {
    merchantId?: string;
    label?: string;
    expiresAt?: Date;
  }) {
    const keyId = `psk_${randomBytes(16).toString("hex")}`;
    const secret = randomBytes(32).toString("hex");

    const key = await this.prisma.hmacKey.create({
      data: {
        keyId,
        secret, // In production: encrypt at rest with KMS
        merchantId: input.merchantId,
        algorithm: "sha256",
        status: "ACTIVE",
        expiresAt: input.expiresAt,
      },
      include: { merchant: { select: { code: true, legalName: true } } },
    });

    logger.info({ keyId, merchantId: input.merchantId }, "HMAC key created");

    // Return the secret only on creation — it won't be shown again
    return {
      ...key,
      secret, // plaintext shown once
    };
  }

  async rotateHmacKey(keyId: string) {
    const existing = await this.prisma.hmacKey.findUnique({ where: { keyId } });
    if (!existing) throw new NotFoundError("HMAC key", keyId);

    if (existing.status !== "ACTIVE") {
      throw new ConflictError(`Cannot rotate key with status: ${existing.status}`);
    }

    // Mark old key as rotated
    await this.prisma.hmacKey.update({
      where: { keyId },
      data: { status: "ROTATED" },
    });

    // Create a new key for the same merchant
    const newKeyId = `psk_${randomBytes(16).toString("hex")}`;
    const newSecret = randomBytes(32).toString("hex");

    const newKey = await this.prisma.hmacKey.create({
      data: {
        keyId: newKeyId,
        secret: newSecret,
        merchantId: existing.merchantId,
        algorithm: existing.algorithm,
        status: "ACTIVE",
        rotatedFrom: keyId,
      },
    });

    logger.info({ oldKeyId: keyId, newKeyId }, "HMAC key rotated");
    return { ...newKey, secret: newSecret };
  }

  async revokeHmacKey(keyId: string) {
    const key = await this.prisma.hmacKey.findUnique({ where: { keyId } });
    if (!key) throw new NotFoundError("HMAC key", keyId);

    await this.prisma.hmacKey.update({
      where: { keyId },
      data: { status: "REVOKED" },
    });

    logger.info({ keyId }, "HMAC key revoked");
    return { keyId, revoked: true };
  }

  async listHmacKeys(merchantId?: string) {
    const where: Prisma.HmacKeyWhereInput = {};
    if (merchantId) where.merchantId = merchantId;

    return this.prisma.hmacKey.findMany({
      where,
      select: {
        keyId: true,
        algorithm: true,
        status: true,
        merchantId: true,
        rotatedFrom: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        merchant: { select: { code: true, legalName: true } },
        // secret is intentionally excluded from list
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── API Keys ────────────────────────────────────

  async createApiKey(input: {
    merchantId: string;
    label?: string;
    scopes?: string[];
    expiresAt?: Date;
  }) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: input.merchantId },
    });
    if (!merchant) throw new NotFoundError("Merchant", input.merchantId);

    const keyId = `apk_${randomBytes(16).toString("hex")}`;
    const rawSecret = randomBytes(32).toString("hex");
    const hashedSecret = createHash("sha256").update(rawSecret).digest("hex");

    const key = await this.prisma.apiKey.create({
      data: {
        keyId,
        keySecret: hashedSecret,
        merchantId: input.merchantId,
        label: input.label,
        scopes: input.scopes ?? [],
        status: "ACTIVE",
        expiresAt: input.expiresAt,
      },
    });

    logger.info({ keyId, merchantId: input.merchantId }, "API key created");

    // Return raw secret only at creation time
    return {
      ...key,
      rawSecret, // shown once — store securely
    };
  }

  async revokeApiKey(keyId: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { keyId } });
    if (!key) throw new NotFoundError("API key", keyId);

    await this.prisma.apiKey.update({
      where: { keyId },
      data: { status: "REVOKED" },
    });

    logger.info({ keyId }, "API key revoked");
    return { keyId, revoked: true };
  }

  async listApiKeys(merchantId: string) {
    return this.prisma.apiKey.findMany({
      where: { merchantId },
      select: {
        keyId: true,
        label: true,
        scopes: true,
        status: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        // keySecret is intentionally excluded
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── Certificates ────────────────────────────────

  async storeCertificate(input: {
    label: string;
    certType: string;
    subject?: string;
    issuer?: string;
    serialNumber?: string;
    publicKey: string;
    privateKey?: string;
    fingerprint?: string;
    validFrom: Date;
    validTo: Date;
    metadata?: Record<string, unknown>;
  }) {
    const cert = await this.prisma.apiCertificate.create({
      data: {
        label: input.label,
        certType: input.certType,
        subject: input.subject,
        issuer: input.issuer,
        serialNumber: input.serialNumber,
        publicKey: input.publicKey,
        privateKey: input.privateKey, // Encrypt at rest in production
        fingerprint: input.fingerprint,
        validFrom: input.validFrom,
        validTo: input.validTo,
        status: "ACTIVE",
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    logger.info({ certId: cert.id, certType: input.certType, label: input.label }, "Certificate stored");
    return cert;
  }

  async listCertificates(certType?: string) {
    const where: Prisma.ApiCertificateWhereInput = {};
    if (certType) where.certType = certType;

    return this.prisma.apiCertificate.findMany({
      where,
      select: {
        id: true,
        label: true,
        certType: true,
        subject: true,
        issuer: true,
        serialNumber: true,
        fingerprint: true,
        validFrom: true,
        validTo: true,
        status: true,
        createdAt: true,
        // publicKey and privateKey excluded by default
      },
      orderBy: { validTo: "asc" },
    });
  }

  async getExpiringCertificates(daysAhead = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);

    return this.prisma.apiCertificate.findMany({
      where: {
        status: "ACTIVE",
        validTo: { lte: threshold },
      },
      orderBy: { validTo: "asc" },
    });
  }

  // ── Private Helpers ─────────────────────────────

  private isValidIpOrCidr(value: string): boolean {
    // IPv4
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    // IPv6 (simplified)
    const ipv6 = /^[0-9a-fA-F:]+$/;
    return ipv4.test(value) || ipv6.test(value);
  }
}
