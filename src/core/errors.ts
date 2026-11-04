/**
 * Domain-specific error classes for PrimeStack Switch.
 * All errors extend AppError so the error handler plugin
 * can serialize them consistently with i18n support.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR",
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Resource not found — 404 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(message, 404, "NOT_FOUND", { resource, id });
  }
}

/** Validation failed — 422 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

/** Authentication failed — 401 */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/** Insufficient permissions — 403 */
export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, "FORBIDDEN");
  }
}

/** Resource conflict — 409 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, "CONFLICT", details);
  }
}

/** Rate limit exceeded — 429 */
export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
  }
}

/** Ledger-specific errors */
export class LedgerError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, "LEDGER_ERROR", details);
  }
}

/** Double-entry violation — debits do not equal credits */
export class UnbalancedEntryError extends LedgerError {
  constructor(debits: string, credits: string) {
    super("Journal entry is unbalanced", { debits, credits });
    this.code = "UNBALANCED_ENTRY";
    this.statusCode = 422;
  }
}

/** Account has insufficient funds for a debit */
export class InsufficientFundsError extends LedgerError {
  constructor(accountCode: string, available: string, required: string) {
    super("Insufficient funds", { accountCode, available, required });
    this.code = "INSUFFICIENT_FUNDS";
    this.statusCode = 422;
  }
}

/** Account is frozen or closed */
export class AccountNotActiveError extends LedgerError {
  constructor(accountCode: string, status: string) {
    super("Account is not active", { accountCode, status });
    this.code = "ACCOUNT_NOT_ACTIVE";
    this.statusCode = 422;
  }
}

/** IP not whitelisted — 403 */
export class IpNotWhitelistedError extends AppError {
  constructor(ip: string) {
    super("IP address not whitelisted", 403, "IP_NOT_WHITELISTED", { ip });
  }
}

/** HMAC signature invalid — 401 */
export class HmacSignatureError extends AppError {
  constructor(message = "Invalid HMAC signature") {
    super(message, 401, "HMAC_INVALID");
  }
}
