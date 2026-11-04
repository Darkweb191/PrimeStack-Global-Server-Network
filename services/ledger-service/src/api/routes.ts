import { IncomingMessage, ServerResponse } from "http";
import { Pool } from "pg";
import {
  postEntry,
  holdFunds,
  releaseHold,
  reverseEntry,
  getBalance,
  type PostEntryInput,
} from "../domain/ledger.js";

/**
 * Ledger Service HTTP API
 *
 * Intentionally minimal — this is a lightweight HTTP layer
 * over the domain logic. All financial guarantees live in
 * the domain functions and the database, not here.
 *
 * In production this would be replaced with gRPC for internal
 * service-to-service calls, with HTTP only for admin/ops.
 */

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  ipAddress: string,
) => Promise<void>;

function ok(res: ServerResponse, data: unknown): void {
  const json = JSON.stringify({ success: true, data });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(json);
}

function created(res: ServerResponse, data: unknown): void {
  const json = JSON.stringify({ success: true, data });
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end(json);
}

function fail(res: ServerResponse, status: number, code: string, message: string): void {
  const json = JSON.stringify({ success: false, error: { code, message } });
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

export function buildHandlers(pool: Pool): Map<string, Handler> {
  const handlers = new Map<string, Handler>();

  // POST /accounts — create a new account (ops/onboarding use)
  handlers.set("POST /accounts", async (_req, res, body, _ip) => {
    const b = body as { accountNumber?: string; accountType?: string; currency?: string; name?: string; metadata?: Record<string, unknown> };
    if (!b?.accountNumber || !b?.accountType || !b?.name) {
      fail(res, 422, "MISSING_FIELDS", "accountNumber, accountType, and name are required");
      return;
    }
    const validTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
    if (!validTypes.includes(b.accountType)) {
      fail(res, 422, "INVALID_TYPE", `accountType must be one of: ${validTypes.join(", ")}`);
      return;
    }
    try {
      // Insert account
      const acctResult = await pool.query(
        `INSERT INTO accounts (account_number, account_type, currency, name, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_number) DO UPDATE SET name = $4, updated_at = NOW()
         RETURNING id, account_number, account_type, currency, name, status`,
        [b.accountNumber, b.accountType, b.currency || "USD", b.name, b.metadata ? JSON.stringify(b.metadata) : null],
      );
      const account = acctResult.rows[0];

      // Create balance row if not exists
      await pool.query(
        `INSERT INTO account_balances (account_id, available_balance, held_balance, version)
         VALUES ($1, 0, 0, 1)
         ON CONFLICT (account_id) DO NOTHING`,
        [account.id],
      );

      created(res, account);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(res, 400, "CREATE_FAILED", msg);
    }
  });

  // GET /accounts — list all accounts
  handlers.set("GET /accounts", async (req, res, _body, _ip) => {
    const qs = new URL(`http://x${req.url ?? "/"}`).searchParams;
    const accountType = qs.get("accountType");
    const result = await pool.query(
      `SELECT a.id, a.account_number, a.account_type, a.currency, a.name, a.status,
              COALESCE(b.available_balance, 0)::text AS available_balance,
              COALESCE(b.held_balance, 0)::text AS held_balance
       FROM accounts a
       LEFT JOIN account_balances b ON b.account_id = a.id
       ${accountType ? "WHERE a.account_type = $1" : ""}
       ORDER BY a.account_number
       LIMIT 100`,
      accountType ? [accountType] : [],
    );
    ok(res, result.rows);
  });

  // GET /accounts/:accountNumber — look up account by account_number
  handlers.set("GET /accounts/:accountNumber", async (req, res, _body, _ip) => {
    const accountNumber = (req as { params?: { accountNumber: string } }).params?.accountNumber;
    if (!accountNumber) { fail(res, 422, "MISSING_PARAM", "accountNumber is required"); return; }
    const result = await pool.query(
      `SELECT a.id, a.account_number, a.account_type, a.currency, a.name, a.status,
              COALESCE(b.available_balance, 0)::text AS available_balance,
              COALESCE(b.held_balance, 0)::text AS held_balance
       FROM accounts a
       LEFT JOIN account_balances b ON b.account_id = a.id
       WHERE a.account_number = $1`,
      [accountNumber],
    );
    if (result.rows.length === 0) {
      fail(res, 404, "NOT_FOUND", `Account not found: ${accountNumber}`);
      return;
    }
    ok(res, result.rows[0]);
  });

  // GET /accounts/:accountNumber/balance — get balance by account_number (user-friendly)
  handlers.set("GET /accounts/:accountNumber/balance", async (req, res, _body, _ip) => {
    const accountNumber = (req as { params?: { accountNumber: string } }).params?.accountNumber;
    if (!accountNumber) { fail(res, 422, "MISSING_PARAM", "accountNumber is required"); return; }
    const result = await pool.query(
      `SELECT a.id, a.account_number, a.currency,
              COALESCE(b.available_balance, 0)::text AS available_balance,
              COALESCE(b.held_balance, 0)::text AS held_balance
       FROM accounts a
       LEFT JOIN account_balances b ON b.account_id = a.id
       WHERE a.account_number = $1`,
      [accountNumber],
    );
    if (result.rows.length === 0) {
      fail(res, 404, "NOT_FOUND", `Account not found: ${accountNumber}`);
      return;
    }
    const row = result.rows[0];
    ok(res, {
      accountId: row.id,
      accountNumber: row.account_number,
      availableBalance: row.available_balance,
      heldBalance: row.held_balance,
      currency: row.currency,
    });
  });


  // POST /entries — post a journal entry
  handlers.set("POST /entries", async (_req, res, body, ip) => {
    const input = body as PostEntryInput;

    if (!input.reference || !input.entryType || !input.description || !input.lines?.length) {
      fail(res, 422, "MISSING_FIELDS", "reference, entryType, description, and lines are required");
      return;
    }

    // Resolve account numbers to UUIDs if needed
    // Lines may use either accountId (UUID) or accountNumber (string)
    const needsResolution = input.lines.some((l) => l.accountId && !l.accountId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
    if (needsResolution) {
      const accountNumbers = [...new Set(
        input.lines
          .filter((l) => l.accountId && !l.accountId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))
          .map((l) => l.accountId)
      )];
      const lookupResult = await pool.query(
        `SELECT id, account_number FROM accounts WHERE account_number = ANY($1)`,
        [accountNumbers],
      );
      const numToId = new Map(lookupResult.rows.map((r: { id: string; account_number: string }) => [r.account_number, r.id]));

      // Auto-create accounts that don't exist (asset accounts for funding pools, etc.)
      for (const num of accountNumbers) {
        if (!numToId.has(num)) {
          const acctType = num.startsWith("FUNDING") ? "LIABILITY" : num.startsWith("TERMINAL") || num.startsWith("WALLET") ? "ASSET" : "LIABILITY";
          const createResult = await pool.query(
            `INSERT INTO accounts (account_number, account_type, currency, name)
             VALUES ($1, $2, $3, $4)
             RETURNING id, account_number`,
            [num, acctType, "USD", num.replace(/:/g, " ")],
          );
          const newAcct = createResult.rows[0];
          await pool.query(
            `INSERT INTO account_balances (account_id, available_balance, held_balance, version)
             VALUES ($1, 0, 0, 1)
             ON CONFLICT (account_id) DO NOTHING`,
            [newAcct.id],
          );
          numToId.set(num, newAcct.id);
        }
      }

      // Replace accountNumber with resolved UUID
      input.lines = input.lines.map((l) => ({
        ...l,
        accountId: numToId.get(l.accountId) ?? l.accountId,
      }));
    }

    try {
      const result = await postEntry(pool, input, ip);
      created(res, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string }).code ?? "POST_FAILED";
      fail(res, 400, code, msg);
    }
  });

  // GET /entries/:reference — get entry by reference
  handlers.set("GET /entries/:ref", async (req, res, _body, _ip) => {
    const reference = (req as { params?: { ref: string } }).params?.ref;
    if (!reference) { fail(res, 422, "MISSING_PARAM", "reference is required"); return; }

    const result = await pool.query(
      `SELECT je.*, json_agg(
         json_build_object(
           'accountId',  jl.account_id,
           'debit',      jl.debit::text,
           'credit',     jl.credit::text
         ) ORDER BY jl.created_at
       ) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl.entry_id = je.id
       WHERE je.reference = $1
       GROUP BY je.id`,
      [reference],
    );

    if (result.rows.length === 0) {
      fail(res, 404, "NOT_FOUND", `Entry not found: ${reference}`);
      return;
    }

    ok(res, result.rows[0]);
  });

  // POST /entries/:reference/reverse — reverse an entry
  handlers.set("POST /entries/:ref/reverse", async (req, res, body, ip) => {
    const reference = (req as { params?: { ref: string } }).params?.ref;
    const { reason, reversedBy } = body as { reason?: string; reversedBy?: string };

    if (!reference) { fail(res, 422, "MISSING_PARAM", "reference is required"); return; }
    if (!reason)    { fail(res, 422, "MISSING_FIELDS", "reason is required"); return; }

    const result = await reverseEntry(pool, reference, reason, reversedBy, ip);
    ok(res, result);
  });

  // GET /accounts/:id/balance — get account balance
  handlers.set("GET /accounts/:id/balance", async (req, res, _body, _ip) => {
    const accountId = (req as { params?: { id: string } }).params?.id;
    if (!accountId) { fail(res, 422, "MISSING_PARAM", "accountId is required"); return; }

    const result = await getBalance(pool, accountId);
    ok(res, result);
  });

  // POST /accounts/:id/holds — create a fund hold
  handlers.set("POST /accounts/:id/holds", async (req, res, body, ip) => {
    const accountId = (req as { params?: { id: string } }).params?.id;
    const input = body as { amount: string; reference: string; description?: string; expiresAt?: string };

    if (!accountId)       { fail(res, 422, "MISSING_PARAM",  "accountId is required"); return; }
    if (!input.reference) { fail(res, 422, "MISSING_FIELDS", "reference is required"); return; }
    if (!input.amount)    { fail(res, 422, "MISSING_FIELDS", "amount is required");    return; }

    const result = await holdFunds(pool, {
      accountId,
      amount:      input.amount,
      reference:   input.reference,
      description: input.description,
      expiresAt:   input.expiresAt ? new Date(input.expiresAt) : undefined,
    }, ip);

    created(res, result);
  });

  // POST /holds/:reference/release — release a fund hold
  handlers.set("POST /holds/:ref/release", async (req, res, body, _ip) => {
    const reference = (req as { params?: { ref: string } }).params?.ref;
    const { releasedBy } = body as { releasedBy?: string };

    if (!reference) { fail(res, 422, "MISSING_PARAM", "reference is required"); return; }

    await releaseHold(pool, reference, releasedBy);
    ok(res, { released: true, reference });
  });

  // GET /health — liveness probe
  handlers.set("GET /health", async (_req, res) => {
    ok(res, { status: "ok", service: "ledger-service" });
  });

  return handlers;
}
