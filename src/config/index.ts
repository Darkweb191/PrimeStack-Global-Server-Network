import dotenv from "dotenv";

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function int(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Invalid integer for ${key}: ${raw}`);
  return parsed;
}

function list(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  app: {
    name: required("APP_NAME", "primestack-global-server-network"),
    env: required("NODE_ENV", "development"),
    port: int("PORT", 8081),
    host: required("HOST", "0.0.0.0"),
    logLevel: required("LOG_LEVEL", "info"),
  },

  database: {
    url: required("DATABASE_URL", "postgresql://primestack:primestack@localhost:5432/primestack?schema=public"),
  },

  redis: {
    host: required("REDIS_HOST", "localhost"),
    port: int("REDIS_PORT", 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: int("REDIS_DB", 0),
  },

  jwt: {
    secret: required("JWT_SECRET", "dev-secret-change-in-production"),
    expiresIn: required("JWT_EXPIRES_IN", "24h"),
  },

  hmac: {
    algorithm: required("HMAC_ALGORITHM", "sha256"),
    headerPrefix: required("HMAC_HEADER_PREFIX", "x-primestack"),
  },

  rateLimit: {
    max: int("RATE_LIMIT_MAX", 100),
    window: int("RATE_LIMIT_WINDOW", 60),
  },

  i18n: {
    defaultLanguage: required("DEFAULT_LANGUAGE", "en"),
    supportedLanguages: list("SUPPORTED_LANGUAGES", ["en", "fr", "es", "ar", "pt"]),
  },

  s2s: {
    /**
     * 64-hex-char (32-byte) AES-256-GCM key for encrypting connection API secrets at rest.
     * Must be set via S2S_SECRET_KEY environment variable in production.
     */
    secretKey: required("S2S_SECRET_KEY", "0000000000000000000000000000000000000000000000000000000000000000"),
  },
  banks: {
    sg: {
      accountHolder: process.env.BANK_SG_ACCOUNT_HOLDER ?? "",
      bankName:      process.env.BANK_SG_BANK_NAME      ?? "",
      accountNumber: process.env.BANK_SG_ACCOUNT_NUMBER  ?? "",
      swiftBic:      process.env.BANK_SG_SWIFT_BIC       ?? "",
      currency:      process.env.BANK_SG_CURRENCY         ?? "SGD",
      country:       process.env.BANK_SG_COUNTRY          ?? "SG",
    },
    in2: {
      accountHolder: process.env.BANK_IN2_ACCOUNT_HOLDER ?? "",
      bankName:      process.env.BANK_IN2_BANK_NAME      ?? "",
      accountNumber: process.env.BANK_IN2_ACCOUNT_NUMBER  ?? "",
      merchantId:    process.env.BANK_IN2_MERCHANT_ID     ?? "",
      vpa:           process.env.BANK_IN2_VPA             ?? "",
      mobile:        process.env.BANK_IN2_MOBILE           ?? "",
      swiftBic:      process.env.BANK_IN2_SWIFT_BIC        ?? "ICICINBBCTS",
      currency:      process.env.BANK_IN2_CURRENCY         ?? "INR",
      country:       process.env.BANK_IN2_COUNTRY          ?? "IN",
      gateway:       process.env.BANK_IN2_GATEWAY          ?? "ICICI_EAZYPAY",
    },
  },
} as const;

export type AppConfig = typeof config;
