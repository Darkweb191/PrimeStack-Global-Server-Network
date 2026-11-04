/**
 * Runtime configuration for the crypto payout service.
 *
 * Everything here is read from the environment at call time.
 * The service is fail-closed: if the signer or provider endpoint
 * is not explicitly configured, loadConfig() throws and the caller
 * must refuse the operation. There is no simulated/fallback path.
 */

export class ConfigError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface CryptoConfig {
  /** TRON node / provider endpoint, e.g. https://api.trongrid.io */
  fullHost: string;
  /** Optional provider API key (TronGrid), sent as TRON-PRO-API-KEY. */
  apiKey?: string;
  /** Private key of the funded hot wallet that signs payouts. */
  privateKey: string;
  /** TRC-20 contract address. Defaults to mainnet USDT. */
  usdtContract: string;
}

/** Mainnet USDT (TRC-20) contract address. */
const DEFAULT_USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** True only when the minimum required credentials are present. */
export function isConfigured(): boolean {
  return Boolean(env("TRON_HOT_WALLET_PRIVATE_KEY") && env("TRON_FULL_HOST"));
}

/** Resolve config or throw ConfigError (NOT_CONFIGURED) when incomplete. */
export function loadConfig(): CryptoConfig {
  const privateKey = env("TRON_HOT_WALLET_PRIVATE_KEY");
  const fullHost   = env("TRON_FULL_HOST");

  if (!privateKey) {
    throw new ConfigError(
      "NOT_CONFIGURED",
      "TRON_HOT_WALLET_PRIVATE_KEY is not set — crypto payouts are disabled (fail-closed)",
    );
  }
  if (!fullHost) {
    throw new ConfigError(
      "NOT_CONFIGURED",
      "TRON_FULL_HOST is not set — crypto payouts are disabled (fail-closed)",
    );
  }

  return {
    fullHost,
    apiKey: env("TRON_API_KEY") || undefined,
    privateKey,
    usdtContract: env("TRON_USDT_CONTRACT") || DEFAULT_USDT_TRC20,
  };
}
