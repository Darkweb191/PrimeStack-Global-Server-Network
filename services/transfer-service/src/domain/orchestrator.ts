import { Pool }           from "pg";
import { Decimal }        from "decimal.js";
import * as Transfer      from "./transfer.js";
import {
  postLedgerEntry,
  getLedgerBalance,
  reverseLedgerEntry,
  evaluateRisk,
  validateTerminal,
}                         from "../client/service-clients.js";
import type { CreateTransferInput } from "./transfer.js";

/**
 * Transfer Orchestrator
 *
 * Coordinates the full transfer pipeline:
 *
 *   INITIATED
 *      ↓
 *   validateTerminals()   — if T2T transfer, verify both TIDs
 *      ↓
 *   evaluateRisk()        — call Risk Service
 *      ↓  BLOCK → fail()
 *      ↓  REVIEW → holdForRisk() (manual approval required)
 *      ↓  ALLOW →
 *   resolveAccounts()     — convert sourceId/destId to ledger account IDs
 *      ↓
 *   postLedgerEntry()     — the ONLY step that moves money
 *      ↓  error → fail()
 *      ↓  success →
 *   complete()            — mark COMPLETED with journal_entry_ref
 *      ↓
 *   publishEvent()        — notify downstream (settlement, notifications)
 *
 * The most important property: if postLedgerEntry() succeeds but
 * complete() fails (e.g. DB crash), we have a journal entry with
 * no matching transfer completion. The reconciliation service
 * detects this and either retries complete() or flags for review.
 *
 * Account ID resolution:
 *   WALLET:   walletAddress is used as account ID directly
 *   TERMINAL: "TERMINAL:{tid}:{currency}"
 *   MERCHANT: "MERCHANT:{merchantCode}:{currency}"
 *   BANK:     "BANK:{bankCode}:{currency}"
 */

export class OrchestratorError extends Error {
  constructor(message: string, public code: string, public httpStatus = 422) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export async function execute(
  pool:     Pool,
  input:    CreateTransferInput,
  ipAddress?: string,
): Promise<Transfer.TransferRecord> {

  // ── 1. Create transfer record (INITIATED) ─────────────────
  let transfer = await Transfer.initiate(pool, input);

  // Already completed via idempotency — return as-is
  if (transfer.status === "COMPLETED") return transfer;

  try {
    // ── 2. Terminal validation (T2T only) ─────────────────────
    if (input.type === "T2T") {
      if (input.sourceType !== "TERMINAL" || input.destType !== "TERMINAL") {
        await Transfer.fail(pool, input.transferRef, "INVALID_T2T", "T2T requires TERMINAL source and dest");
        throw new OrchestratorError("T2T requires TERMINAL source and dest", "INVALID_T2T");
      }
      await validateTerminal(input.sourceId);
      await validateTerminal(input.destId);
    }

    // ── 3. Risk evaluation ────────────────────────────────────
    const riskResult = await evaluateRisk({
      entityRef:   input.transferRef,
      entityType:  "TRANSFER",
      amount:      input.amount,
      currency:    input.currency,
      sourceId:    input.sourceId,
      ipAddress,
      merchantId:  input.metadata?.merchantId as string | undefined,
    });

    if (riskResult.verdict === "BLOCK") {
      await Transfer.fail(
        pool,
        input.transferRef,
        "RISK_BLOCKED",
        riskResult.reason ?? "Blocked by risk rules",
      );
      throw new OrchestratorError(
        riskResult.reason ?? "Transfer blocked by risk engine",
        "RISK_BLOCKED",
        403,
      );
    }

    if (riskResult.verdict === "REVIEW") {
      await Transfer.holdForRisk(
        pool,
        input.transferRef,
        riskResult.reason ?? "Flagged for review",
        riskResult.riskScore,
        riskResult.riskLevel,
      );
      // Return here — transfer needs manual approval before proceeding
      return Transfer.initiate(pool, input); // returns current state
    }

    // ── 4. Resolve ledger account IDs ─────────────────────────
    const sourceAccountId = resolveAccountId(input.sourceType, input.sourceId, input.currency);
    const destAccountId   = resolveAccountId(input.destType,   input.destId,   input.currency);
    const feeAmount       = new Decimal(input.feeAmount ?? "0");
    const totalDebit      = new Decimal(input.amount);
    const netCredit       = totalDebit.minus(feeAmount);

    // Build journal lines based on whether there's a fee
    const lines: Array<{ accountId: string; debit: string; credit: string }> = [
      // Source account debited
      { accountId: sourceAccountId, debit: totalDebit.toString(), credit: "0" },
      // Destination account credited (net of fee)
      { accountId: destAccountId,   debit: "0", credit: netCredit.toString() },
    ];

    if (feeAmount.gt(0)) {
      // Fee account credited
      const feeAccountId = `FEE-${input.type}-${input.currency}`;
      lines.push({ accountId: feeAccountId, debit: "0", credit: feeAmount.toString() });
    }

    // ── 5. Post to Ledger Service (THE money movement) ────────
    const ledgerRef = `JE-${input.transferRef}`;
    const journalEntry = await postLedgerEntry({
      reference:   ledgerRef,
      entryType:   "TRANSFER",
      description: `${input.type} transfer: ${input.description ?? input.transferRef}`,
      source:      input.type,
      postedBy:    input.metadata?.merchantId as string | undefined ?? "transfer-service",
      lines,
    });

    // ── 6. Mark transfer COMPLETED ────────────────────────────
    await Transfer.complete(
      pool,
      input.transferRef,
      journalEntry.reference,
      riskResult.riskScore,
      riskResult.riskLevel,
    );

    // Return updated record
    const completed = await Transfer.initiate(pool, { ...input }); // idempotent fetch
    return completed;

  } catch (err) {
    // If we haven't already marked it failed, do so now
    const currentTransfer = await Transfer.initiate(pool, input);
    if (!["FAILED","REVERSED","COMPLETED"].includes(currentTransfer.status)) {
      const code    = err instanceof OrchestratorError ? err.code : "INTERNAL_ERROR";
      const message = err instanceof Error ? err.message : "Unknown error";
      await Transfer.fail(pool, input.transferRef, code, message);
    }
    throw err;
  }
}

/**
 * Reverse a completed transfer.
 * Calls Ledger Service to reverse the journal entry,
 * then marks the transfer REVERSED.
 */
export async function reverseTransfer(
  pool:       Pool,
  transferRef: string,
  reason:     string,
  reversedBy?: string,
): Promise<Transfer.TransferRecord> {

  const transfer = await (async () => {
    const t = await pool.query("SELECT * FROM transfers WHERE transfer_ref = $1", [transferRef]);
    if (t.rows.length === 0) throw new OrchestratorError(`Transfer not found: ${transferRef}`, "NOT_FOUND", 404);
    return t.rows[0] as { status: string; journal_entry_ref: string | null };
  })();

  if (transfer.status !== "COMPLETED") {
    throw new OrchestratorError(`Cannot reverse transfer with status: ${transfer.status}`, "CANNOT_REVERSE", 409);
  }

  if (!transfer.journal_entry_ref) {
    throw new OrchestratorError("Transfer has no journal entry reference", "NO_JOURNAL_REF", 500);
  }

  // Reverse in the ledger first
  await reverseLedgerEntry(
    transfer.journal_entry_ref,
    reason,
    reversedBy,
  );

  // Then mark the transfer reversed
  await Transfer.reverse(pool, transferRef, reason);

  const rows = await pool.query("SELECT * FROM transfers WHERE transfer_ref = $1", [transferRef]);
  return rows.rows[0] as Transfer.TransferRecord;
}

// ── Private helpers ─────────────────────────────────────────

function resolveAccountId(
  entityType: string,
  entityId:   string,
  currency:   string,
): string {
  switch (entityType) {
    case "WALLET":   return entityId;  // wallet address IS the account ID in the ledger
    case "TERMINAL": return `TERMINAL:${entityId}:${currency}`;
    case "MERCHANT": return `MERCHANT:${entityId}:${currency}`;
    case "BANK":     return `BANK:${entityId}:${currency}`;
    default:
      throw new OrchestratorError(`Unknown source/dest type: ${entityType}`, "INVALID_ENTITY_TYPE");
  }
}
