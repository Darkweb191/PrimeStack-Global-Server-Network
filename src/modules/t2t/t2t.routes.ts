import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { prisma } from "../../core/database.js";
import { ForbiddenError, ValidationError, NotFoundError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { sendSuccess, sendCreated } from "../../shared/utils/response.js";

function ref(p: string): string {
  return p + "-" + Date.now().toString(36).toUpperCase() + randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
}

async function init(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "T2tIpWhitelist" (
      ip TEXT NOT NULL PRIMARY KEY,
      note TEXT,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

async function isAllowed(ip: string): Promise<boolean> {
  const rows: { cnt: string }[] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::text as cnt FROM "T2tIpWhitelist" WHERE ip = $1 OR ip = '0.0.0.0'`,
    ip
  );
  return parseInt(rows[0].cnt, 10) > 0;
}

export function registerT2tRoutes(app: FastifyInstance): void {

  app.post("/t2t/whitelist", async (req: FastifyRequest, reply: FastifyReply) => {
    const b = req.body as { ip?: string; action?: string; note?: string };
    if (!b?.ip) throw new ValidationError("ip is required");
    await init();
    if (b.action === "remove") {
      await prisma.$executeRawUnsafe(`DELETE FROM "T2tIpWhitelist" WHERE ip = $1`, b.ip);
      return sendSuccess(reply, { ip: b.ip, action: "removed", message: "IP removed from whitelist" });
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "T2tIpWhitelist" (ip, note) VALUES ($1, $2) ON CONFLICT (ip) DO UPDATE SET note = $2`,
      b.ip, b.note || null
    );
    logger.info({ ip: b.ip }, "T2T IP whitelisted");
    return sendSuccess(reply, { ip: b.ip, action: "added", message: "IP whitelisted successfully" });
  });

  app.get("/t2t/whitelist", async (_req: FastifyRequest, reply: FastifyReply) => {
    await init();
    const rows: { ip: string; note: string | null; added_at: Date }[] =
      await prisma.$queryRawUnsafe(`SELECT ip, note, added_at FROM "T2tIpWhitelist" ORDER BY added_at DESC`);
    return sendSuccess(reply, { whitelistedIps: rows, count: rows.length });
  });

  app.post("/t2t/ping", async (req: FastifyRequest, reply: FastifyReply) => {
    await init();
    const b   = req.body as { terminalId?: string };
    const ip  = req.ip;
    const ok  = await isAllowed(ip);
    if (!ok) {
      return sendSuccess(reply, {
        reachable: false, whitelisted: false, callerIp: ip,
        message: `Your IP (${ip}) is not whitelisted. Ask the receiver to add it via POST /t2t/whitelist`,
      });
    }
    return sendSuccess(reply, {
      reachable: true, whitelisted: true, callerIp: ip,
      terminalId: b?.terminalId || null,
      serverTime: new Date().toISOString(),
      message: "Connected. Your IP is whitelisted. You can send T2T transfers.",
    });
  });

  app.post("/t2t/transfer", async (req: FastifyRequest, reply: FastifyReply) => {
    await init();
    const b = req.body as { amount?: string; currency?: string; sourceId?: string; destId?: string; description?: string };
    const ip = req.ip;

    const ok = await isAllowed(ip);
    if (!ok) throw new ForbiddenError(`IP ${ip} not whitelisted. Call POST /t2t/whitelist first.`);

    if (!b.amount || !b.currency || !b.sourceId || !b.destId) {
      throw new ValidationError("Required: amount, currency, sourceId, destId");
    }
    const amt = parseFloat(b.amount);
    if (isNaN(amt) || amt <= 0) throw new ValidationError("amount must be positive");
    const cur = b.currency.toUpperCase();
    if (cur.length !== 3) throw new ValidationError("currency must be 3 letters (USD, EUR, INR...)");

    const srcTid  = b.sourceId;
    const dstTid  = b.destId;
    const reference = ref("TRF");

    // Get active merchant
    const merchants: { id: string }[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Merchant" WHERE status = 'ACTIVE' LIMIT 1`
    );
    if (!merchants.length) throw new NotFoundError("Merchant", "active");
    const merchantId = merchants[0].id;

    // Auto-create source terminal
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Terminal" (id, tid, "serialNumber", "merchantId", model, location, country, status, "registeredAt", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'External Terminal','External','XX','ACTIVE',NOW(),NOW(),NOW())
       ON CONFLICT (tid) DO NOTHING`,
      randomUUID(), srcTid, "EXT-" + srcTid + "-" + Date.now(), merchantId
    );

    // Auto-create dest terminal
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Terminal" (id, tid, "serialNumber", "merchantId", model, location, country, status, "registeredAt", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'External Terminal','External','XX','ACTIVE',NOW(),NOW(),NOW())
       ON CONFLICT (tid) DO NOTHING`,
      randomUUID(), dstTid, "EXT-" + dstTid + "-" + Date.now(), merchantId
    );

    const srcAcct = `TERMINAL-${srcTid}-${cur}`;
    const dstAcct = `TERMINAL-${dstTid}-${cur}`;

    // Auto-create ledger accounts
    for (const code of [srcAcct, dstAcct]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Account" (id, code, name, type, subtype, currency, balance, "heldBalance", status, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,'ASSET','TERMINAL',$4,0,0,'ACTIVE',NOW(),NOW())
         ON CONFLICT (code) DO NOTHING`,
        randomUUID(), code, "Terminal " + code, cur
      );
    }

    // Create transfer record
    const transferId = randomUUID();
    const jeRef = "JE-" + reference;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Transfer" (id, reference, type, status, amount, currency, "feeAmount", "netAmount",
         "sourceType", "sourceId", "destType", "destId", "sourceAccountId", "destAccountId",
         description, "journalEntryRef", "initiatedAt", "processedAt", "completedAt", "createdAt", "updatedAt")
       VALUES ($1,$2,'T2T','COMPLETED',$3,$4,0,$3,'TERMINAL',$5,'TERMINAL',$6,$7,$8,$9,$10,NOW(),NOW(),NOW(),NOW(),NOW())`,
      transferId, reference, amt, cur, srcTid, dstTid, srcAcct, dstAcct,
      b.description || "T2T transfer", jeRef
    );

    // Update balances
    await prisma.$executeRawUnsafe(`UPDATE "Account" SET balance = balance - $1, "updatedAt" = NOW() WHERE code = $2`, amt, srcAcct);
    await prisma.$executeRawUnsafe(`UPDATE "Account" SET balance = balance + $1, "updatedAt" = NOW() WHERE code = $2`, amt, dstAcct);

    // Get new balances
    const srcBal: { balance: string }[] = await prisma.$queryRawUnsafe(`SELECT balance::text FROM "Account" WHERE code = $1`, srcAcct);
    const dstBal: { balance: string }[] = await prisma.$queryRawUnsafe(`SELECT balance::text FROM "Account" WHERE code = $1`, dstAcct);

    logger.info({ reference, srcTid, dstTid, amt, cur }, "T2T transfer completed");

    return sendCreated(reply, {
      reference,
      type: "T2T",
      status: "COMPLETED",
      amount: amt,
      currency: cur,
      sourceType: "TERMINAL",
      sourceId: srcTid,
      destType: "TERMINAL",
      destId: dstTid,
      journalEntryRef: jeRef,
      sourceBalance: srcBal[0]?.balance || "0",
      destBalance: dstBal[0]?.balance || "0",
      completedAt: new Date().toISOString(),
      message: `Transfer of ${amt} ${cur} from ${srcTid} to ${dstTid} completed`,
    });
  });

  app.get("/t2t/balance/:tid", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tid } = req.params as { tid: string };
    const rows: { balance: string; currency: string }[] = await prisma.$queryRawUnsafe(
      `SELECT balance::text, currency FROM "Account" WHERE code LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`,
      `TERMINAL-${tid}-%`
    );
    if (!rows.length) return sendSuccess(reply, { terminalId: tid, balance: "0.00", currency: "USD", message: "No transactions yet" });
    return sendSuccess(reply, { terminalId: tid, balance: rows[0].balance, currency: rows[0].currency });
  });

  app.get("/t2t/terminals", async (_req: FastifyRequest, reply: FastifyReply) => {
    const rows: { tid: string; model: string | null; location: string | null; country: string }[] =
      await prisma.$queryRawUnsafe(`SELECT tid, model, location, country FROM "Terminal" ORDER BY "createdAt" DESC`);
    return sendSuccess(reply, rows);
  });

  app.get("/t2t/transfers", async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { tid?: string; limit?: string };
    const limit = Math.min(parseInt(q.limit || "20", 10), 100);
    const rows = q.tid
      ? await prisma.$queryRawUnsafe(
          `SELECT reference, type, status::text, amount::text, currency, "sourceId", "destId", "completedAt" FROM "Transfer" WHERE ("sourceId" = $1 OR "destId" = $1) AND type = 'T2T' ORDER BY "createdAt" DESC LIMIT $2`,
          q.tid, limit
        )
      : await prisma.$queryRawUnsafe(
          `SELECT reference, type, status::text, amount::text, currency, "sourceId", "destId", "completedAt" FROM "Transfer" WHERE type = 'T2T' ORDER BY "createdAt" DESC LIMIT $1`,
          limit
        );
    return sendSuccess(reply, rows);
  });
}