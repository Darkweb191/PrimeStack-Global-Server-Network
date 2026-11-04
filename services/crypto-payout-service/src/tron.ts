import { TronWeb } from "tronweb";
import type { CryptoConfig } from "./config.js";

/**
 * TRON TRC-20 broadcaster.
 *
 * Signs a TRC-20 `transfer` with the configured hot-wallet key and
 * broadcasts it through the configured provider. It never fabricates a
 * transaction hash — the hash returned here comes from the network.
 */

export class BroadcasterError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "BroadcasterError";
  }
}

export type BroadcastStatus = "CONFIRMED" | "PENDING";

export interface BroadcastResult {
  txHash: string;
  status: BroadcastStatus;
  from: string;
  to: string;
  amount: string;
  asset: string;
  network: string;
  contract: string;
  blockNumber: number | null;
  broadcastAt: string;
}

const TRC20_DECIMALS = 6;          // USDT on TRON uses 6 decimals
const FEE_LIMIT_SUN = 100_000_000; // 100 TRX ceiling for energy/bandwidth
const CONFIRM_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 3_000;

/** Convert a human decimal string (e.g. "119.0000") to TRC-20 base units. */
export function toBaseUnits(amount: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new BroadcasterError("INVALID_AMOUNT", `Amount must be a positive decimal number: "${amount}"`);
  }
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) {
    throw new BroadcasterError("INVALID_AMOUNT", `Amount has more than ${decimals} decimal places: "${amount}"`);
  }
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0")).toString();
}

export async function broadcastTrc20(
  cfg: CryptoConfig,
  toAddress: string,
  amount: string,
): Promise<BroadcastResult> {
  if (!TronWeb.isAddress(toAddress)) {
    throw new BroadcasterError("INVALID_ADDRESS", `Not a valid TRON address: ${toAddress}`);
  }

  const baseUnits = toBaseUnits(amount, TRC20_DECIMALS);

  const tronWeb = new TronWeb({
    fullHost: cfg.fullHost,
    headers: cfg.apiKey ? { "TRON-PRO-API-KEY": cfg.apiKey } : {},
    privateKey: cfg.privateKey,
  });

  const from = tronWeb.defaultAddress.base58;
  if (!from || typeof from !== "string") {
    throw new BroadcasterError("NO_SIGNER", "Could not derive a signer address from TRON_HOT_WALLET_PRIVATE_KEY");
  }

  let txHash: string;
  try {
    const contract = await tronWeb.contract().at(cfg.usdtContract);
    const sent: unknown = await contract.methods.transfer(toAddress, baseUnits).send({ feeLimit: FEE_LIMIT_SUN });
    txHash = typeof sent === "string" ? sent : "";
  } catch (err) {
    throw new BroadcasterError("BROADCAST_FAILED", err instanceof Error ? err.message : String(err));
  }
  if (!txHash) {
    throw new BroadcasterError("BROADCAST_FAILED", "Provider did not return a transaction hash");
  }

  // Bounded confirmation wait. We never report CONFIRMED unless the
  // transaction is actually included in a block.
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const info = await tronWeb.trx.getTransactionInfo(txHash);
    if (info && info.blockNumber) {
      const result = info.receipt && info.receipt.result;
      if (result && result !== "SUCCESS") {
        throw new BroadcasterError("TX_REVERTED", `On-chain transaction reverted: ${result}`);
      }
      return {
        txHash, status: "CONFIRMED", from, to: toAddress, amount,
        asset: "USDT", network: "TRC20", contract: cfg.usdtContract,
        blockNumber: info.blockNumber, broadcastAt: new Date().toISOString(),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    txHash, status: "PENDING", from, to: toAddress, amount,
    asset: "USDT", network: "TRC20", contract: cfg.usdtContract,
    blockNumber: null, broadcastAt: new Date().toISOString(),
  };
}
