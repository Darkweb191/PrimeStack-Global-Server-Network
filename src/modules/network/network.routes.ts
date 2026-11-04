import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { NetworkService } from "./network.service.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * Network REST routes — IP whitelist, HMAC keys, API keys, certificates.
 * Base path: /network
 */
export function registerNetworkRoutes(
  app: FastifyInstance,
  networkService: NetworkService,
): void {
  // ── IP Whitelist ────────────────────────────────

  app.get("/network/ip-whitelist", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await networkService.listIps({
      merchantId: query.merchantId as string | undefined,
      status: query.status as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.post("/network/ip-whitelist", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      ipAddress: string;
      label?: string;
      merchantId?: string;
      expiresAt?: string;
    };
    if (!body?.ipAddress) throw new ValidationError("ipAddress is required");

    const entry = await networkService.addIp({
      ipAddress: body.ipAddress,
      label: body.label,
      merchantId: body.merchantId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    return sendCreated(reply, entry);
  });

  app.delete("/network/ip-whitelist/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await networkService.removeIp(id);
    return sendSuccess(reply, result);
  });

  // ── HMAC Keys ────────────────────────────────────

  app.get("/network/hmac-keys", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const keys = await networkService.listHmacKeys(query.merchantId as string | undefined);
    return sendSuccess(reply, keys);
  });

  app.post("/network/hmac-keys", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      merchantId?: string;
      label?: string;
      expiresAt?: string;
    };
    const key = await networkService.createHmacKey({
      merchantId: body?.merchantId,
      label: body?.label,
      expiresAt: body?.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    return sendCreated(reply, key);
  });

  app.post("/network/hmac-keys/:keyId/rotate", async (request: FastifyRequest, reply: FastifyReply) => {
    const { keyId } = request.params as { keyId: string };
    const key = await networkService.rotateHmacKey(keyId);
    return sendSuccess(reply, key);
  });

  app.post("/network/hmac-keys/:keyId/revoke", async (request: FastifyRequest, reply: FastifyReply) => {
    const { keyId } = request.params as { keyId: string };
    const result = await networkService.revokeHmacKey(keyId);
    return sendSuccess(reply, result);
  });

  // ── API Keys ────────────────────────────────────

  app.get("/network/api-keys", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    if (!query.merchantId) throw new ValidationError("merchantId query param is required");
    const keys = await networkService.listApiKeys(query.merchantId as string);
    return sendSuccess(reply, keys);
  });

  app.post("/network/api-keys", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      merchantId: string;
      label?: string;
      scopes?: string[];
      expiresAt?: string;
    };
    if (!body?.merchantId) throw new ValidationError("merchantId is required");
    const key = await networkService.createApiKey({
      merchantId: body.merchantId,
      label: body.label,
      scopes: body.scopes,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    return sendCreated(reply, key);
  });

  app.post("/network/api-keys/:keyId/revoke", async (request: FastifyRequest, reply: FastifyReply) => {
    const { keyId } = request.params as { keyId: string };
    const result = await networkService.revokeApiKey(keyId);
    return sendSuccess(reply, result);
  });

  // ── Certificates ────────────────────────────────

  app.get("/network/certificates", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const certs = await networkService.listCertificates(query.certType as string | undefined);
    return sendSuccess(reply, certs);
  });

  app.post("/network/certificates", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.label || !body?.certType || !body?.publicKey || !body?.validFrom || !body?.validTo) {
      throw new ValidationError("label, certType, publicKey, validFrom, and validTo are required");
    }
    const cert = await networkService.storeCertificate({
      label: body.label as string,
      certType: body.certType as string,
      subject: body.subject as string | undefined,
      issuer: body.issuer as string | undefined,
      serialNumber: body.serialNumber as string | undefined,
      publicKey: body.publicKey as string,
      privateKey: body.privateKey as string | undefined,
      fingerprint: body.fingerprint as string | undefined,
      validFrom: new Date(body.validFrom as string),
      validTo: new Date(body.validTo as string),
    });
    return sendCreated(reply, cert);
  });

  app.get("/network/certificates/expiring", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const days = parseInt(String(query.days ?? "30"), 10);
    const expiring = await networkService.getExpiringCertificates(days);
    return sendSuccess(reply, expiring);
  });
}
