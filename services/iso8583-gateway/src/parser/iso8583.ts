/**
 * ISO 8583 Message Parser & Builder
 *
 * Handles the binary protocol used by payment terminals and hosts.
 *
 * Message structure:
 *   [2-byte length header] [4-byte MTI] [8-byte primary bitmap] [fields...]
 *
 * If bit 1 of primary bitmap is set, a secondary bitmap follows (fields 65-128).
 *
 * Field encoding types:
 *   n       — numeric, right-justified, zero-padded
 *   an      — alphanumeric, left-justified, space-padded
 *   ans     — alphanumeric + special chars
 *   b       — binary
 *   z       — track data (Track 2 format)
 *   LLVAR   — 2-digit length prefix + variable data
 *   LLLVAR  — 3-digit length prefix + variable data
 *
 * MTI format: VERSION FUNCTION CLASS ORIGINATOR
 *   0200 → Financial Transaction Request
 *   0210 → Financial Transaction Response
 *   0400 → Reversal Request
 *   0410 → Reversal Response
 *   0420 → Reversal Advice
 *   0800 → Network Management Request
 *   0810 → Network Management Response
 *   0820 → Network Management Advice
 */

export type FieldEncoding = "n" | "an" | "ans" | "b" | "z" | "LLVAR" | "LLLVAR" | "LLVAR_N" | "LLLVAR_AN";

export interface FieldDefinition {
  bit:         number;
  name:        string;  
  type:        FieldEncoding;
  maxLen:      number;
  description: string;
}

export interface ParsedMessage {
  mti:         string;
  bitmap:      string;         // hex representation of all bitmaps
  fields:      Map<number, string>;
  rawHex:      string;
  parseErrors: string[];
}

export interface BuildInput {
  mti:    string;
  fields: Map<number, string>;
}

// ── Standard ISO 8583 field definitions ──────────────────────

export const FIELD_DEFS: Map<number, FieldDefinition> = new Map([
  [1,   { bit: 1,   name: "Bitmap Secondary",         type: "b",       maxLen: 8,   description: "Secondary Bitmap" }],
  [2,   { bit: 2,   name: "PAN",                      type: "LLVAR_N", maxLen: 19,  description: "Primary Account Number" }],
  [3,   { bit: 3,   name: "Processing Code",           type: "n",       maxLen: 6,   description: "Processing Code" }],
  [4,   { bit: 4,   name: "Amount Transaction",        type: "n",       maxLen: 12,  description: "Amount, Transaction" }],
  [5,   { bit: 5,   name: "Amount Settlement",         type: "n",       maxLen: 12,  description: "Amount, Settlement" }],
  [7,   { bit: 7,   name: "Transmission DateTime",     type: "n",       maxLen: 10,  description: "Transmission Date & Time (MMDDhhmmss)" }],
  [11,  { bit: 11,  name: "STAN",                      type: "n",       maxLen: 6,   description: "System Trace Audit Number" }],
  [12,  { bit: 12,  name: "Local Time",                type: "n",       maxLen: 6,   description: "Local Transaction Time (hhmmss)" }],
  [13,  { bit: 13,  name: "Local Date",                type: "n",       maxLen: 4,   description: "Local Transaction Date (MMDD)" }],
  [14,  { bit: 14,  name: "Expiration Date",           type: "n",       maxLen: 4,   description: "Expiration Date (YYMM)" }],
  [18,  { bit: 18,  name: "MCC",                       type: "n",       maxLen: 4,   description: "Merchant Category Code" }],
  [22,  { bit: 22,  name: "POS Entry Mode",             type: "n",       maxLen: 3,   description: "Point of Service Entry Mode" }],
  [25,  { bit: 25,  name: "POS Condition Code",         type: "n",       maxLen: 2,   description: "POS Condition Code" }],
  [32,  { bit: 32,  name: "Acquiring Institution ID",  type: "LLVAR",   maxLen: 11,  description: "Acquiring Institution ID Code" }],
  [35,  { bit: 35,  name: "Track 2",                   type: "LLVAR",   maxLen: 37,  description: "Track 2 Data" }],
  [37,  { bit: 37,  name: "RRN",                       type: "an",      maxLen: 12,  description: "Retrieval Reference Number" }],
  [38,  { bit: 38,  name: "Authorization Code",        type: "an",      maxLen: 6,   description: "Authorization Identification Response" }],
  [39,  { bit: 39,  name: "Response Code",             type: "an",      maxLen: 2,   description: "Response Code" }],
  [41,  { bit: 41,  name: "Terminal ID",               type: "ans",     maxLen: 8,   description: "Card Acceptor Terminal ID" }],
  [42,  { bit: 42,  name: "Merchant ID",               type: "ans",     maxLen: 15,  description: "Card Acceptor ID Code" }],
  [43,  { bit: 43,  name: "Merchant Name",             type: "ans",     maxLen: 40,  description: "Card Acceptor Name/Location" }],
  [48,  { bit: 48,  name: "Additional Data Private",   type: "LLLVAR",  maxLen: 999, description: "Additional Data - Private" }],
  [49,  { bit: 49,  name: "Currency Code",             type: "n",       maxLen: 3,   description: "Currency Code, Transaction" }],
  [52,  { bit: 52,  name: "PIN Block",                 type: "b",       maxLen: 8,   description: "Personal ID Number Data" }],
  [54,  { bit: 54,  name: "Additional Amounts",        type: "LLLVAR",  maxLen: 120, description: "Additional Amounts" }],
  [55,  { bit: 55,  name: "ICC Data",                  type: "LLLVAR",  maxLen: 255, description: "ICC System Related Data (EMV)" }],
  [60,  { bit: 60,  name: "Reserved Private 1",        type: "LLLVAR",  maxLen: 999, description: "Reserved Private" }],
  [61,  { bit: 61,  name: "Reserved Private 2",        type: "LLLVAR",  maxLen: 999, description: "Reserved Private" }],
  [63,  { bit: 63,  name: "Reserved Private 4",        type: "LLLVAR",  maxLen: 999, description: "Reserved Private" }],
  [64,  { bit: 64,  name: "MAC",                       type: "b",       maxLen: 8,   description: "Message Authentication Code" }],
  [70,  { bit: 70,  name: "Network Management Code",   type: "n",       maxLen: 3,   description: "Network Management Information Code" }],
  [90,  { bit: 90,  name: "Original Data Elements",    type: "n",       maxLen: 42,  description: "Original Data Elements" }],
  [95,  { bit: 95,  name: "Replacement Amounts",       type: "ans",     maxLen: 42,  description: "Replacement Amounts" }],
  [100, { bit: 100, name: "Receiving Institution ID",  type: "LLVAR",   maxLen: 11,  description: "Receiving Institution ID Code" }],
  [102, { bit: 102, name: "Account ID 1",              type: "LLVAR",   maxLen: 28,  description: "Account Identification 1" }],
  [103, { bit: 103, name: "Account ID 2",              type: "LLVAR",   maxLen: 28,  description: "Account Identification 2" }],
  [128, { bit: 128, name: "MAC 2",                     type: "b",       maxLen: 8,   description: "Secondary MAC" }],
]);

// ── MTI definitions ───────────────────────────────────────────

export const MTI_NAMES: Record<string, string> = {
  "0100": "Authorization Request",
  "0110": "Authorization Response",
  "0120": "Authorization Advice",
  "0121": "Authorization Advice Repeat",
  "0130": "Authorization Advice Response",
  "0200": "Financial Transaction Request",
  "0210": "Financial Transaction Response",
  "0220": "Financial Transaction Advice",
  "0221": "Financial Transaction Advice Repeat",
  "0230": "Financial Transaction Advice Response",
  "0400": "Reversal Request",
  "0410": "Reversal Response",
  "0420": "Reversal Advice",
  "0421": "Reversal Advice Repeat",
  "0430": "Reversal Advice Response",
  "0500": "Reconciliation Request",
  "0510": "Reconciliation Response",
  "0800": "Network Management Request",
  "0810": "Network Management Response",
  "0820": "Network Management Advice",
};

// ── Parser ────────────────────────────────────────────────────

/**
 * Parse an ISO 8583 message from a hex string.
 *
 * Input: full message hex (including 2-byte length header if present)
 * Returns: ParsedMessage with all fields extracted.
 */
export function parse(hexMessage: string, hasLengthHeader = true): ParsedMessage {
  const errors: string[] = [];
  const fields  = new Map<number, string>();
  let   offset  = 0;

  if (!hexMessage || hexMessage.length < 8) {
    return { mti: "", bitmap: "", fields, rawHex: hexMessage, parseErrors: ["Message too short"] };
  }

  // Strip 2-byte (4 hex chars) length header if present
  if (hasLengthHeader) {
    offset += 4;
  }

  // ── MTI: 4 bytes = 8 hex chars ────────────────────────────
  const mti = hexToAscii(hexMessage.slice(offset, offset + 8));
  offset += 8;

  if (hexMessage.length < offset + 16) {
    return { mti, bitmap: "", fields, rawHex: hexMessage, parseErrors: ["Message too short for bitmap"] };
  }

  // ── Primary bitmap: 8 bytes = 16 hex chars ────────────────
  const primaryBitmapHex = hexMessage.slice(offset, offset + 16);
  const primaryBits      = hexToBits(primaryBitmapHex);
  offset += 16;

  let bitmapHex = primaryBitmapHex;

  // ── Secondary bitmap (bit 1 set) ──────────────────────────
  let secondaryBits: number[] = [];
  if (primaryBits[0] === 1) {
    if (hexMessage.length < offset + 16) {
      errors.push("Secondary bitmap present but message too short");
    } else {
      const secondaryBitmapHex = hexMessage.slice(offset, offset + 16);
      secondaryBits = hexToBits(secondaryBitmapHex);
      bitmapHex    += secondaryBitmapHex;
      offset       += 16;
    }
  }

  // ── Parse each present field ───────────────────────────────
  for (let bit = 2; bit <= 128; bit++) {
    const inPrimary   = bit <= 64 && primaryBits[bit - 1] === 1;
    const inSecondary = bit > 64  && secondaryBits[bit - 65] === 1;

    if (!inPrimary && !inSecondary) continue;
    if (bit === 1) continue; // secondary bitmap, already handled

    const def = FIELD_DEFS.get(bit);
    if (!def) {
      errors.push(`Unknown field ${bit} — skipping remaining fields`);
      break;
    }

    try {
      const { value, consumed } = extractField(hexMessage, offset, def);
      fields.set(bit, value);
      offset += consumed;
    } catch (err) {
      errors.push(`Field ${bit} (${def.name}): ${err instanceof Error ? err.message : err}`);
      break;
    }
  }

  return { mti, bitmap: bitmapHex, fields, rawHex: hexMessage, parseErrors: errors };
}

/**
 * Build an ISO 8583 message hex string from MTI and fields.
 */
export function build(input: BuildInput, addLengthHeader = true): string {
  const mtiHex = asciiToHex(input.mti);

  // Determine which fields are present (bits 2–128)
  const presentBits = [...input.fields.keys()].filter(b => b >= 2 && b <= 128).sort((a, b) => a - b);
  const hasSecondary = presentBits.some(b => b > 64);

  // Build bitmaps
  const primaryBits   = new Array(64).fill(0);
  const secondaryBits = new Array(64).fill(0);

  if (hasSecondary) primaryBits[0] = 1; // flag secondary bitmap

  for (const bit of presentBits) {
    if (bit <= 64) primaryBits[bit - 1]   = 1;
    else           secondaryBits[bit - 65] = 1;
  }

  const bitmapHex = bitsToHex(primaryBits)
                  + (hasSecondary ? bitsToHex(secondaryBits) : "");

  // Build field data
  let fieldData = "";
  for (const bit of presentBits) {
    const def   = FIELD_DEFS.get(bit);
    const value = input.fields.get(bit) ?? "";
    if (!def) continue;
    fieldData += buildField(value, def);
  }

  let message = mtiHex + bitmapHex + fieldData;

  if (addLengthHeader) {
    const byteLen = message.length / 2;
    message = byteLen.toString(16).padStart(4, "0") + message;
  }

  return message.toUpperCase();
}

/**
 * Parse just the MTI from a message (fast path for routing).
 */
export function extractMti(hexMessage: string, hasLengthHeader = true): string {
  const offset = hasLengthHeader ? 4 : 0;
  if (hexMessage.length < offset + 8) return "";
  return hexToAscii(hexMessage.slice(offset, offset + 8));
}

/**
 * Create a response message from a request.
 * Copies all request fields, changes MTI to response type,
 * and adds response code in field 39.
 */
export function buildResponse(
  request:      ParsedMessage,
  responseCode: string,
  additionalFields?: Map<number, string>,
): BuildInput {
  const responseMti = getResponseMti(request.mti);
  const fields      = new Map(request.fields);

  fields.set(39, responseCode.padStart(2, "0").slice(0, 2));

  if (additionalFields) {
    for (const [bit, val] of additionalFields) {
      fields.set(bit, val);
    }
  }

  // Remove fields that shouldn't be echoed in responses
  fields.delete(52); // PIN block — never echo
  fields.delete(35); // Track 2 — never echo

  return { mti: responseMti, fields };
}

/**
 * Create a network management echo response (0810).
 */
export function buildEchoResponse(request: ParsedMessage): BuildInput {
  return buildResponse(request, "00");
}

// ── Private helpers ───────────────────────────────────────────

function extractField(
  hex:    string,
  offset: number,
  def:    FieldDefinition,
): { value: string; consumed: number } {

  switch (def.type) {
    case "n":
    case "an":
    case "ans":
    case "b":
    case "z": {
      // Fixed length
      const byteLen = def.type === "b" ? def.maxLen : def.maxLen;
      const hexLen  = def.type === "b" ? byteLen * 2 : byteLen * 2;

      if (offset + hexLen > hex.length) {
        throw new Error(`Insufficient data for field ${def.bit} (need ${hexLen} hex chars at offset ${offset})`);
      }

      const raw   = hex.slice(offset, offset + hexLen);
      const value = def.type === "b" ? raw : hexToAscii(raw).trimEnd();

      return { value, consumed: hexLen };
    }

    case "LLVAR":
    case "LLVAR_N": {
      // 2-digit length prefix
      if (offset + 4 > hex.length) throw new Error(`Insufficient data for LLVAR length at ${offset}`);
      const lenStr = hexToAscii(hex.slice(offset, offset + 4));
      const len    = parseInt(lenStr, 10);
      if (isNaN(len) || len < 0) throw new Error(`Invalid LLVAR length: ${lenStr}`);
      const dataHex = hex.slice(offset + 4, offset + 4 + len * 2);
      if (dataHex.length < len * 2) throw new Error(`Insufficient LLVAR data for field ${def.bit}`);
      return { value: hexToAscii(dataHex), consumed: 4 + len * 2 };
    }

    case "LLLVAR":
    case "LLLVAR_AN": {
      // 3-digit length prefix
      if (offset + 6 > hex.length) throw new Error(`Insufficient data for LLLVAR length at ${offset}`);
      const lenStr = hexToAscii(hex.slice(offset, offset + 6));
      const len    = parseInt(lenStr, 10);
      if (isNaN(len) || len < 0) throw new Error(`Invalid LLLVAR length: ${lenStr}`);
      const dataHex = hex.slice(offset + 6, offset + 6 + len * 2);
      if (dataHex.length < len * 2) throw new Error(`Insufficient LLLVAR data for field ${def.bit}`);
      return { value: hexToAscii(dataHex), consumed: 6 + len * 2 };
    }

    default:
      throw new Error(`Unknown field type: ${def.type}`);
  }
}

function buildField(value: string, def: FieldDefinition): string {
  switch (def.type) {
    case "n": {
      const padded = value.replace(/\D/g, "").padStart(def.maxLen, "0").slice(-def.maxLen);
      return asciiToHex(padded);
    }
    case "an":
    case "ans": {
      const padded = value.slice(0, def.maxLen).padEnd(def.maxLen, " ");
      return asciiToHex(padded);
    }
    case "b":
      return value.slice(0, def.maxLen * 2).padEnd(def.maxLen * 2, "0");
    case "LLVAR":
    case "LLVAR_N": {
      const data = value.slice(0, def.maxLen);
      return asciiToHex(data.length.toString().padStart(2, "0")) + asciiToHex(data);
    }
    case "LLLVAR":
    case "LLLVAR_AN": {
      const data = value.slice(0, def.maxLen);
      return asciiToHex(data.length.toString().padStart(3, "0")) + asciiToHex(data);
    }
    default:
      return asciiToHex(value.slice(0, def.maxLen));
  }
}

function getResponseMti(requestMti: string): string {
  const map: Record<string, string> = {
    "0100": "0110", "0120": "0130", "0200": "0210", "0220": "0230",
    "0400": "0410", "0420": "0430", "0500": "0510",
    "0800": "0810", "0820": "0830",
  };
  return map[requestMti] ?? requestMti.slice(0, 2) + String(parseInt(requestMti.slice(2), 10) + 10).padStart(2, "0");
}

export function hexToAscii(hex: string): string {
  let result = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    result += String.fromCharCode(code);
  }
  return result;
}

export function asciiToHex(str: string): string {
  return str.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function hexToBits(hex: string): number[] {
  const bits: number[] = [];
  for (const c of hex) {
    const n = parseInt(c, 16);
    bits.push((n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1);
  }
  return bits;
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex.toUpperCase();
}
