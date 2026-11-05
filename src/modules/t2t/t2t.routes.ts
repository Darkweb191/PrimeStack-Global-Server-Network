import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { prisma } from "../../core/database.js";
import { redis } from "../../core/redis.js";
import { ForbiddenError, ValidationError, NotFoundError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { sendSuccess, sendCreated } from "../../shared/utils/response.js";

function generateRef(prefix: string): string {
  return prefix + "-" + Date.now().toString(36).toUpperCase() + randomUUID().slice(0, 6).toUpperCase();
}

export function registerT2tRoutes(app: FastifyInstance): void {

  // WHITELIST: Add/remove IP
  app.post("/t2t/whitelist", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { ip?: string; action?: string };
    if (!body?.ip) throw new ValidationError("ip is required");
    const ip = body.ip;
    if (body.action === "remove") {
      await redis.srem("t2t:whitelist", ip);
      return sendSuccess(reply, { ip, action: "removed" });
    }
    await redis.sadd("t2t:whitelist", ip);
    return sendSuccess(reply, { ip, action: "added" });
  });

  // WHITELIST: List IPs
  app.get("/t2t/whitelist", async (_request: FastifyRequest, reply: FastifyReply) => {
    const ips = await redis.smembers("t2t:whitelist");
    return sendSuccess(reply, { whitelistedIps: ips, count: ips.length });
  });

  // PING: Verify sender connectivity + whitelist check
  app.post("/t2t/ping", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { terminalId?: string };
    const callerIp = request.ip;
    const isWhitelisted = await redis.sismember("t2t:whitelist", callerIp);
    if (!isWhitelisted) {
      return sendSuccess(reply, {
        reachable: false,
        whitelisted: false,
        callerIp,
        message: "Your IP " + callerIp + " is not whitelisted. Ask the receiver to whitelist it.",
      });
    }
    return sendSuccess(reply, {
      reachable: true,
      whitelisted: true,
      callerIp,
      terminalId: body?.terminalId || null,
      serverTime: new Date().toISOString(),
      message: "Connection verified. You can send T2T transfers.",
    });
  });

  // TRANSFER: Execute T2T transfer
  app.post("/t2t/transfer", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      amount: string;
      currency: string;
      sourceId: string;
      destId: string;
      description?: string;
    };
    const callerIp = request.ip;

    // IP whitelist check
    const isWhitelisted = await redis.sismember("t2t:whitelist", callerIp);
    if (!isWhitelisted) {
      throw new ForbiddenError("IP " + callerIp + " not whitelisted");
    }

    // Validate
    if (!body.amount || !body.currency || !body.sourceId || !body.destId) {
      throw new ValidationError("Missing: amount, currency, sourceId, destId");
    }
    const amount = parseFloat(body.amount);
    if (isNaN(amount) || amount <= 0) throw new ValidationError("Amount must be positive");
    if (body.currency.length !== 3) throw new ValidationError("Currency must be 3 letters");

    const sourceTid = body.sourceId;
    const destTid = body.destId;
    const currency = body.currency.toUpperCase();
    const reference = generateRef("TRF");

    try {
      // Auto-create source terminal if missing
      const srcCount = await prisma.$queryRaw<{count: bigint}[]>`SELECT COUNT(*) as count FROM "Terminal" WHERE tid = ${sourceTid}`;
      if (BigInt(srcCount[0].count) === 0n) {
        const merchant = await prisma.$queryRaw<{id: string}[]>`SELECT id FROM "Merchant" WHERE status = 'ACTIVE' LIMIT 1`;
        if (!merchant.length) throw new NotFoundError("Merchant", "active");
        await prisma.$executeRaw`INSERT INTO "Terminal" (id, tid, "serialNumber", "merchantId", model, location, country, status, "registeredAt", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${sourceTid}, ${"EXT-" + sourceTid + "-" + Date.now()}, ${merchant[0].id}, 'External', 'External', 'XX', 'ACTIVE', NOW(), NOW(), NOW()) ON CONFLICT (tid) DO NOTHING`;
        logger.info({ tid: sourceTid }, "Source terminal auto-created");
      }

      // Auto-create dest terminal if missing
      const dstCount = await prisma.$queryRaw<{count: bigint}[]>`SELECT COUNT(*) as count FROM "Terminal" WHERE tid = ${destTid}`;
      if (BigInt(dstCount[0].count) === 0n) {
        const merchant = await prisma.$queryRaw<{id: string}[]>`SELECT id FROM "Merchant" WHERE status = 'ACTIVE' LIMIT 1`;
        if (!merchant.length) throw new NotFoundError("Merchant", "active");
        await prisma.$executeRaw`INSERT INTO "Terminal" (id, tid, "serialNumber", "merchantId", model, location, country, status, "registeredAt", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${destTid}, ${"EXT-" + destTid + "-" + Date.now()}, ${merchant[0].id}, 'External', 'External', 'XX', 'ACTIVE', NOW(), NOW(), NOW()) ON CONFLICT (tid) DO NOTHING`;
        logger.info({ tid: destTid }, "Dest terminal auto-created");
      }

      // Auto-create ledger accounts
      const sourceAcct = "TERMINAL-" + sourceTid + "-" + currency;
      const destAcct = "TERMINAL-" + destTid + "-" + currency;

      for (const acct of [sourceAcct, destAcct]) {
        const acctCount = await prisma.$queryRaw<{count: bigint}[]>`SELECT COUNT(*) as count FROM "Account" WHERE code = ${acct}`;
        if (BigInt(acctCount[0].count) === 0n) {
          await prisma.$executeRaw`INSERT INTO "Account" (id, code, name, type, subtype, currency, balance, "heldBalance", status, "createdAt", "updatedAt") VALUES (${randomUUID()}, ${acct}, ${"Terminal " + acct}, 'ASSET', 'TERMINAL', ${currency}, 0, 0, 'ACTIVE', NOW(), NOW()) ON CONFLICT (code) DO NOTHING`;
        }
      }

      // Create transfer record
      const transferId = randomUUID();
      await prisma.$executeRaw`INSERT INTO "Transfer" (id, reference, type, status, amount, currency, "feeAmount", "netAmount", "sourceType", "sourceId", "destType", "destId", "sourceAccountId", "destAccountId", description, "journalEntryRef", "initiatedAt", "processedAt", "completedAt", "createdAt", "updatedAt") VALUES (${transferId}, ${reference}, 'T2T', 'COMPLETED', ${amount}, ${currency}, 0, ${amount}, 'TERMINAL', ${sourceTid}, 'TERMINAL', ${destTid}, ${sourceAcct}, ${destAcct}, ${body.description || "T2T transfer"}, ${"JE-" + reference}, NOW(), NOW(), NOW(), NOW(), NOW())`;

      // Update balances: source decreases, destination increases
      await prisma.$executeRaw`UPDATE "Account" SET balance = balance - ${amount}, "updatedAt" = NOW() WHERE code = ${sourceAcct}`;
      await prisma.$executeRaw`UPDATE "Account" SET balance = balance + ${amount}, "updatedAt" = NOW() WHERE code = ${destAcct}`;

      // Get new balances
      const srcBal = await prisma.$queryRaw<{balance: any}[]>`SELECT balance FROM "Account" WHERE code = ${sourceAcct}`;
      const dstBal = await prisma.$queryRaw<{balance: any}[]>`SELECT balance FROM "Account" WHERE code = ${destAcct}`;

      logger.info({ reference, sourceTid, destTid, amount }, "T2T transfer completed");

      return sendCreated(reply, {
        reference,
        type: "T2T",
        status: "COMPLETED",
        amount: amount,
        currency: currency,
        sourceType: "TERMINAL",
        sourceId: sourceTid,
        destType: "TERMINAL",
        destId: destTid,
        journalEntryRef: "JE-" + reference,
        sourceNewBalance: srcBal[0]?.balance?.toString() || "0",
        destNewBalance: dstBal[0]?.balance?.toString() || "0",
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, reference }, "T2T transfer failed");
      throw error;
    }
  });

  // BALANCE: Get terminal balance
  app.get("/t2t/balance/:tid", async (request: FastifyRequest, reply: FastifyReply) => {
    const { tid } = request.params as { tid: string };
    const accountCode = "TERMINAL-" + tid + "-USD";
    const rows = await prisma.$queryRaw<{balance: any; currency: string}[]>`SELECT balance, currency FROM "Account" WHERE code = ${accountCode}`;
    if (!rows.length) {
      return sendSuccess(reply, { terminalId: tid, balance: "0", currency: "USD" });
    }
    return sendSuccess(reply, { terminalId: tid, balance: rows[0].balance.toString(), currency: rows[0].currency });
  });

  // LIST TERMINALS
  app.get("/t2t/terminals", async (_request: FastifyRequest, reply: FastifyReply) => {
    const rows = await prisma.$queryRaw<{tid: string; status: string; model: string | null}[]>`SELECT tid, status::text, model FROM "Terminal" ORDER BY "createdAt" DESC`;
    return sendSuccess(reply, rows);
  });
}