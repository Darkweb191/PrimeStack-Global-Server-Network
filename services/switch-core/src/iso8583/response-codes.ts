/**
 * ISO 8583 Response Codes — Field 39
 *
 * The authoritative reference for every outcome in a payment switch.
 * These codes are sent back to the terminal in the response message.
 * The terminal displays the corresponding message or action to the cardholder.
 *
 * Sources: ISO 8583:1987, Visa VICA, Mastercard GCMS spec
 */

export const RESPONSE_CODES: Record<string, { message: string; category: string; approved: boolean }> = {
  "00": { message: "Approved",                            category: "APPROVED",     approved: true  },
  "01": { message: "Refer to card issuer",                category: "REFER",        approved: false },
  "02": { message: "Refer to issuer special conditions",  category: "REFER",        approved: false },
  "03": { message: "Invalid merchant",                    category: "INVALID",      approved: false },
  "04": { message: "Pick up card",                        category: "PICKUP",       approved: false },
  "05": { message: "Do not honor",                        category: "DECLINE",      approved: false },
  "06": { message: "Error",                               category: "ERROR",        approved: false },
  "07": { message: "Pick up card, special conditions",    category: "PICKUP",       approved: false },
  "08": { message: "Honor with identification",           category: "APPROVED",     approved: true  },
  "09": { message: "Request in progress",                 category: "PROCESSING",   approved: false },
  "10": { message: "Approved for partial amount",         category: "APPROVED",     approved: true  },
  "11": { message: "Approved VIP",                        category: "APPROVED",     approved: true  },
  "12": { message: "Invalid transaction",                 category: "INVALID",      approved: false },
  "13": { message: "Invalid amount",                      category: "INVALID",      approved: false },
  "14": { message: "Invalid card number",                 category: "INVALID",      approved: false },
  "15": { message: "No such issuer",                      category: "INVALID",      approved: false },
  "17": { message: "Customer cancellation",               category: "CANCELLED",    approved: false },
  "19": { message: "Re-enter transaction",                category: "RETRY",        approved: false },
  "20": { message: "Invalid response",                    category: "ERROR",        approved: false },
  "21": { message: "No action taken",                     category: "ERROR",        approved: false },
  "25": { message: "Unable to locate record",             category: "NOT_FOUND",    approved: false },
  "28": { message: "File temporarily unavailable",        category: "UNAVAILABLE",  approved: false },
  "30": { message: "Format error",                        category: "ERROR",        approved: false },
  "31": { message: "Bank not supported",                  category: "UNSUPPORTED",  approved: false },
  "33": { message: "Expired card",                        category: "EXPIRED",      approved: false },
  "34": { message: "Suspected fraud",                     category: "FRAUD",        approved: false },
  "36": { message: "Restricted card",                     category: "RESTRICTED",   approved: false },
  "37": { message: "Card acceptor call acquirer",         category: "REFER",        approved: false },
  "38": { message: "Allowable PIN tries exceeded",        category: "SECURITY",     approved: false },
  "39": { message: "No credit account",                   category: "INVALID",      approved: false },
  "40": { message: "Function not supported",              category: "UNSUPPORTED",  approved: false },
  "41": { message: "Lost card",                           category: "PICKUP",       approved: false },
  "43": { message: "Stolen card",                         category: "PICKUP",       approved: false },
  "51": { message: "Insufficient funds",                  category: "DECLINE",      approved: false },
  "52": { message: "No checking account",                 category: "INVALID",      approved: false },
  "53": { message: "No savings account",                  category: "INVALID",      approved: false },
  "54": { message: "Expired card",                        category: "EXPIRED",      approved: false },
  "55": { message: "Incorrect PIN",                       category: "SECURITY",     approved: false },
  "56": { message: "No card record",                      category: "NOT_FOUND",    approved: false },
  "57": { message: "Transaction not permitted to cardholder", category: "RESTRICTED", approved: false },
  "58": { message: "Transaction not permitted to terminal",   category: "RESTRICTED", approved: false },
  "59": { message: "Suspected fraud",                     category: "FRAUD",        approved: false },
  "61": { message: "Exceeds withdrawal amount limit",     category: "LIMIT",        approved: false },
  "62": { message: "Restricted card",                     category: "RESTRICTED",   approved: false },
  "63": { message: "Security violation",                  category: "SECURITY",     approved: false },
  "65": { message: "Exceeds withdrawal frequency limit",  category: "LIMIT",        approved: false },
  "68": { message: "Response received too late",          category: "TIMEOUT",      approved: false },
  "75": { message: "Allowable PIN tries exceeded",        category: "SECURITY",     approved: false },
  "76": { message: "Invalid/nonexistent account",         category: "INVALID",      approved: false },
  "77": { message: "Invalid/nonexistent account",         category: "INVALID",      approved: false },
  "78": { message: "Invalid/nonexistent account",         category: "INVALID",      approved: false },
  "79": { message: "Already reversed",                    category: "DUPLICATE",    approved: false },
  "82": { message: "Negative CAM/dCVV/iCVV/CVV results", category: "SECURITY",     approved: false },
  "85": { message: "No reason to decline",                category: "APPROVED",     approved: true  },
  "88": { message: "Cryptographic failure",               category: "SECURITY",     approved: false },
  "89": { message: "Authentication failure",              category: "SECURITY",     approved: false },
  "91": { message: "Card issuer unavailable",             category: "UNAVAILABLE",  approved: false },
  "92": { message: "Unable to route transaction",         category: "ROUTING",      approved: false },
  "93": { message: "Transaction cannot be completed",     category: "DECLINE",      approved: false },
  "94": { message: "Duplicate transmission",              category: "DUPLICATE",    approved: false },
  "95": { message: "Reconcile error",                     category: "ERROR",        approved: false },
  "96": { message: "System malfunction",                  category: "SYSTEM_ERROR", approved: false },
  "99": { message: "Reserved for national use",           category: "RESERVED",     approved: false },
};

/**
 * Resolve the appropriate response code for a Switch Core outcome.
 */
export function resolveResponseCode(reason: string): string {
  const map: Record<string, string> = {
    INSUFFICIENT_FUNDS:       "51",
    ACCOUNT_NOT_ACTIVE:       "57",
    ACCOUNT_NOT_FOUND:        "15",
    TERMINAL_NOT_FOUND:       "57",
    TERMINAL_NOT_ACTIVE:      "58",
    MERCHANT_SUSPENDED:       "57",
    RISK_BLOCKED:             "34",
    RISK_VELOCITY:            "61",
    INVALID_AMOUNT:           "13",
    INVALID_CURRENCY:         "12",
    DUPLICATE_STAN:           "94",
    DUPLICATE_TX_REF:         "94",
    ALREADY_REVERSED:         "79",
    LEDGER_ERROR:             "96",
    TIMEOUT:                  "68",
    ROUTING_FAILED:           "92",
    UNKNOWN:                  "05",
  };

  return map[reason] ?? "05";
}

export function getResponseInfo(code: string) {
  return RESPONSE_CODES[code] ?? { message: "Unknown response", category: "UNKNOWN", approved: false };
}
