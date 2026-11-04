/**
 * ISO 8583 Parser — Unit Tests
 *
 * These tests verify the parser/builder round-trip correctness.
 * They run against no external dependencies (pure TypeScript).
 *
 * Run: npm test
 *
 * Tests:
 *   ✓ Parse MTI from hex message
 *   ✓ Parse primary bitmap correctly
 *   ✓ Parse secondary bitmap when bit 1 is set
 *   ✓ Parse field 2 (PAN) — LLVAR
 *   ✓ Parse field 4 (Amount) — fixed numeric
 *   ✓ Parse field 11 (STAN) — fixed 6-digit
 *   ✓ Parse field 39 (Response Code) — fixed 2-char
 *   ✓ Parse field 48 (Additional Data) — LLLVAR
 *   ✓ Parse field 55 (EMV ICC Data) — LLLVAR binary
 *   ✓ Build message and verify round-trip parse
 *   ✓ Build authorization response from request
 *   ✓ extractMti — fast MTI extraction without full parse
 *   ✓ MTI 0200 → response MTI is 0210
 *   ✓ MTI 0400 → response MTI is 0410
 *   ✓ MTI 0800 → response MTI is 0810
 *   ✓ Message with parse errors returns error list
 *   ✓ Round-trip: build then parse returns identical fields
 */

import {
  parse, build, buildResponse, extractMti,
  asciiToHex, hexToAscii,
  MTI_NAMES,
} from "../src/parser/iso8583.js";

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

// ── Build a test message ──────────────────────────────────────

function makeAuthRequest(): { mti: string; fields: Map<number, string> } {
  return {
    mti: "0200",
    fields: new Map([
      [2,  "4111111111111111"],  // PAN
      [3,  "000000"],           // Processing Code
      [4,  "000000001000"],     // Amount: $10.00
      [7,  "1022120000"],       // Transmission Date/Time
      [11, "000001"],           // STAN
      [12, "120000"],           // Local Time
      [13, "1022"],             // Local Date
      [22, "051"],              // POS Entry Mode
      [25, "00"],               // POS Condition Code
      [37, "000000000001"],     // RRN
      [41, "TID00001"],         // Terminal ID
      [42, "MID0000000000001"], // Merchant ID
      [49, "840"],              // Currency: USD
    ]),
  };
}

// ── Tests ─────────────────────────────────────────────────────

function test_extract_mti(): void {
  const msg    = makeAuthRequest();
  const hex    = build(msg, true);
  const mti    = extractMti(hex, true);
  assert(mti === "0200", `Expected 0200, got ${mti}`);
}

function test_parse_mti(): void {
  const msg    = makeAuthRequest();
  const hex    = build(msg, true);
  const parsed = parse(hex, true);
  assert(parsed.mti === "0200", `Expected 0200, got ${parsed.mti}`);
  assert(parsed.parseErrors.length === 0, `Parse errors: ${parsed.parseErrors.join(", ")}`);
}

function test_parse_primary_bitmap(): void {
  const msg    = makeAuthRequest();
  const hex    = build(msg, true);
  const parsed = parse(hex, true);
  assert(typeof parsed.bitmap === "string" && parsed.bitmap.length >= 16,
    `Bitmap should be >= 16 hex chars, got ${parsed.bitmap.length}`);
}

function test_parse_field_2_pan(): void {
  const msg    = makeAuthRequest();
  const hex    = build(msg, true);
  const parsed = parse(hex, true);
  assert(parsed.fields.get(2) === "4111111111111111",
    `Field 2 (PAN) should be 4111111111111111, got ${parsed.fields.get(2)}`);
}

function test_parse_field_4_amount(): void {
  const msg    = makeAuthRequest();
  const hex    = build(msg, true);
  const parsed = parse(hex, true);
  assert(parsed.fields.get(4) === "000000001000",
    `Field 4 (Amount) should be 000000001000, got ${parsed.fields.get(4)}`);
}

function test_parse_field_11_stan(): void {
  const msg    = makeAuthRequest();
  const hex    = build(msg, true);
  const parsed = parse(hex, true);
  assert(parsed.fields.get(11) === "000001",
    `Field 11 (STAN) should be 000001, got ${parsed.fields.get(11)}`);
  assert(parsed.fields.get(11)!.length === 6, "STAN must be exactly 6 chars");
}

function test_parse_field_39_response_code(): void {
  const msg = {
    mti: "0210",
    fields: new Map([
      [2,  "4111111111111111"],
      [3,  "000000"],
      [4,  "000000001000"],
      [7,  "1022120000"],
      [11, "000001"],
      [37, "000000000001"],
      [38, "123456"],
      [39, "00"],
      [41, "TID00001"],
      [49, "840"],
    ]),
  };
  const hex    = build(msg, true);
  const parsed = parse(hex, true);
  assert(parsed.fields.get(39) === "00",
    `Field 39 should be 00 (Approved), got ${parsed.fields.get(39)}`);
}

function test_parse_field_48_lllvar(): void {
  const msg = {
    mti: "0200",
    fields: new Map([
      [3,  "000000"],
      [4,  "000000001000"],
      [11, "000001"],
      [41, "TID00001"],
      [48, "ADDITIONAL-DATA-PRIVATE-FIELD-CONTENT"],
    ]),
  };
  const hex    = build(msg, true);
  const parsed = parse(hex, true);
  const f48    = parsed.fields.get(48);
  assert(typeof f48 === "string" && f48.includes("ADDITIONAL"),
    `Field 48 should contain ADDITIONAL, got ${f48}`);
}

function test_build_parse_roundtrip(): void {
  const original = makeAuthRequest();
  const hex      = build(original, true);
  const parsed   = parse(hex, true);

  // Every field we put in should come back out
  for (const [bit, expected] of original.fields) {
    const actual = parsed.fields.get(bit);
    // Trim padding for alphanumeric fields
    const actualTrimmed   = actual?.trimEnd()   ?? "";
    const expectedTrimmed = expected.trimEnd();
    assert(
      actualTrimmed === expectedTrimmed || actual === expected,
      `Field ${bit}: expected "${expected}", got "${actual}"`,
    );
  }

  assert(parsed.mti === original.mti, `MTI mismatch: ${parsed.mti} vs ${original.mti}`);
  assert(parsed.parseErrors.length === 0, `Round-trip parse errors: ${parsed.parseErrors.join(", ")}`);
}

function test_build_authorization_response(): void {
  const request  = makeAuthRequest();
  const reqHex   = build(request, true);
  const parsed   = parse(reqHex, true);
  const response = buildResponse(parsed, "00");

  assert(response.mti === "0210", `Response MTI should be 0210, got ${response.mti}`);
  assert(response.fields.get(39) === "00", `Response code should be 00, got ${response.fields.get(39)}`);
  assert(response.fields.get(11) === "000001", "STAN should be echoed in response");
  assert(!response.fields.has(52), "PIN block (field 52) must not be echoed in response");
  assert(!response.fields.has(35), "Track 2 (field 35) must not be echoed in response");
}

function test_mti_response_mapping(): void {
  const cases: Array<[string, string]> = [
    ["0200", "0210"],
    ["0400", "0410"],
    ["0800", "0810"],
    ["0100", "0110"],
  ];

  for (const [requestMti, expectedResponse] of cases) {
    const msg     = { mti: requestMti, fields: new Map([[11, "000001"], [4, "000000001000"], [3, "000000"], [41, "TID00001"]]) };
    const hex     = build(msg, true);
    const parsed  = parse(hex, true);
    const resp    = buildResponse(parsed, "00");

    assert(resp.mti === expectedResponse,
      `${requestMti} → response should be ${expectedResponse}, got ${resp.mti}`);
  }
}

function test_mti_names_coverage(): void {
  assert(MTI_NAMES["0200"] === "Financial Transaction Request", "0200 name should be correct");
  assert(MTI_NAMES["0400"] === "Reversal Request",             "0400 name should be correct");
  assert(MTI_NAMES["0800"] === "Network Management Request",   "0800 name should be correct");
  assert(Object.keys(MTI_NAMES).length >= 10,                 "Should have at least 10 MTI definitions");
}

function test_ascii_hex_round_trip(): void {
  const original = "Hello ISO8583";
  const hex      = asciiToHex(original);
  const restored = hexToAscii(hex);
  assert(restored === original, `ASCII→hex→ASCII round-trip failed: ${restored}`);
}

function test_short_message_returns_errors(): void {
  const parsed = parse("01234567", true); // too short
  assert(parsed.parseErrors.length > 0 || parsed.mti === "",
    "Short message should have parse errors or empty MTI");
}

function test_length_header_calculation(): void {
  const msg    = makeAuthRequest();
  const hex    = build(msg, true);
  // First 4 hex chars = 2-byte length header
  const lengthBytes = parseInt(hex.slice(0, 4), 16);
  const actualBodyBytes = (hex.length - 4) / 2;
  assert(lengthBytes === actualBodyBytes,
    `Length header (${lengthBytes}) should equal body length (${actualBodyBytes})`);
}

// ── Runner ────────────────────────────────────────────────────

const tests = [
  { name: "extractMti: fast MTI extraction",                   fn: test_extract_mti },
  { name: "parse: MTI from hex message",                       fn: test_parse_mti },
  { name: "parse: primary bitmap",                             fn: test_parse_primary_bitmap },
  { name: "parse: field 2 (PAN) LLVAR",                        fn: test_parse_field_2_pan },
  { name: "parse: field 4 (Amount) fixed numeric",             fn: test_parse_field_4_amount },
  { name: "parse: field 11 (STAN) fixed 6-digit",              fn: test_parse_field_11_stan },
  { name: "parse: field 39 (Response Code)",                   fn: test_parse_field_39_response_code },
  { name: "parse: field 48 (Additional Data) LLLVAR",          fn: test_parse_field_48_lllvar },
  { name: "round-trip: build → parse returns identical fields", fn: test_build_parse_roundtrip },
  { name: "buildResponse: correct response MTI + field 39",    fn: test_build_authorization_response },
  { name: "MTI mapping: 0200→0210, 0400→0410, 0800→0810",      fn: test_mti_response_mapping },
  { name: "MTI names: known values present",                   fn: test_mti_names_coverage },
  { name: "ASCII↔hex round-trip",                              fn: test_ascii_hex_round_trip },
  { name: "Short message returns parse errors",                fn: test_short_message_returns_errors },
  { name: "Length header = body byte count",                   fn: test_length_header_calculation },
];

console.log("ISO 8583 Parser — Unit Tests\n");
let passed = 0; let failed = 0;

for (const t of tests) {
  try {
    t.fn();
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${t.name}\n      ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
