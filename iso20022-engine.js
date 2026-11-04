/**
 * PrimeStack — ISO 20022 Payment Container Engine
 *
 * World-level bank-accepting payment template system.
 * Built against official ISO 20022 2025/2026 XSD schemas:
 *   pain.001.001.13  — Customer Credit Transfer Initiation
 *   pain.002.001.15  — Customer Payment Status Report
 *   pain.007.001.13  — Customer Payment Reversal
 *   pain.008.001.12  — Customer Direct Debit Initiation
 *   pacs.008.001.10  — FI to FI Customer Credit Transfer
 *   pacs.009.001.10  — FI Credit Transfer
 *   camt.053.001.10  — Bank to Customer Statement
 *
 * Generates RFC 8259 compliant multi-payload JSON containers
 * that banks can parse, validate, and process.
 *
 * Endpoints:
 *   POST /iso20022/generate        — build a full container from inputs
 *   POST /iso20022/validate        — validate metadata, identifiers, hashes, and balances
 *   POST /iso20022/parse           — parse an existing container
 *   POST /iso20022/ack             — generate ACCC/RJCT acknowledgement
 *   POST /iso20022/pain001         — generate pain.001 payment initiation
 *   POST /iso20022/pain002         — generate pain.002 status report
 *   GET  /iso20022/templates       — list available templates
 *   GET  /iso20022/schemas         — list loaded XSD schemas
 *   POST /iso20022/ledger-credit   — post validated container to ledger
 *
 * Loaded XSD files are listed for discovery only; validation does not execute
 * XSD rules. Use the receiving institution's profile for final acceptance.
 */

import { createServer } from "http";
import { readFileSync, readdirSync, existsSync } from "fs";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT         = parseInt(process.env.ISO20022_PORT || "8084", 10);
const DASHBOARD    = process.env.DASHBOARD_URL || "http://localhost:8081";
const LEDGER_HMAC_SECRET = process.env.ISO20022_LEDGER_HMAC_SECRET || "";
const LEDGER_HMAC_SECRET_VALID = Buffer.byteLength(LEDGER_HMAC_SECRET, "utf8") >= 32;
const LEDGER_HMAC_WINDOW_SECONDS = 300;
const ledgerRequestNonces = new Map();
const SCHEMA_DIR   = join(__dirname, "NEW IMPLEMENTS", "archive__fa41824c37",
                          "archive_business_area_payments_initiation_15ec35b631");

// ── Load XSD schemas ────────────────────────────────────────────
const schemas = {};
if (existsSync(SCHEMA_DIR)) {
  readdirSync(SCHEMA_DIR).filter(f => f.endsWith(".xsd")).forEach(f => {
    const name = f.replace(".xsd", "");
    schemas[name] = readFileSync(join(SCHEMA_DIR, f), "utf8");
    console.log(`[iso20022] Loaded schema: ${name}`);
  });
}

// ── Helpers ─────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function verifyLedgerRequest(req, rawBody) {
  if (!LEDGER_HMAC_SECRET_VALID) {
    return {
      status: 503,
      error: "Ledger posting is disabled: configure ISO20022_LEDGER_HMAC_SECRET with at least 32 bytes",
    };
  }

  const timestamp = req.headers["x-iso20022-timestamp"];
  const nonce = req.headers["x-iso20022-nonce"];
  const signature = req.headers["x-iso20022-signature"];
  if (typeof timestamp !== "string" || !/^\d{10}$/.test(timestamp) ||
      typeof nonce !== "string" || !/^[A-Za-z0-9_-]{22,128}$/.test(nonce) ||
      typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) {
    return {
      status: 401,
      error: "Missing or malformed HMAC headers (X-ISO20022-Timestamp, X-ISO20022-Nonce, X-ISO20022-Signature)",
    };
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > LEDGER_HMAC_WINDOW_SECONDS) {
    return { status: 401, error: "HMAC timestamp is outside the allowed five-minute window" };
  }

  const signedContent = Buffer.concat([
    Buffer.from(`${timestamp}\n${nonce}\n`, "utf8"),
    rawBody,
  ]);
  const expected = createHmac("sha256", LEDGER_HMAC_SECRET).update(signedContent).digest();
  const received = Buffer.from(signature, "hex");
  if (!timingSafeEqual(expected, received)) {
    return { status: 401, error: "HMAC signature verification failed" };
  }

  for (const [usedNonce, expiry] of ledgerRequestNonces) {
    if (expiry <= nowSeconds) ledgerRequestNonces.delete(usedNonce);
  }
  if (ledgerRequestNonces.has(nonce)) {
    return { status: 401, error: "HMAC nonce has already been used" };
  }
  if (ledgerRequestNonces.size >= 100000) {
    return { status: 503, error: "HMAC replay cache is full; retry after existing entries expire" };
  }
  ledgerRequestNonces.set(nonce, nowSeconds + LEDGER_HMAC_WINDOW_SECONDS);
  return null;
}

function now() { return new Date().toISOString(); }
function today() { return new Date().toISOString().split("T")[0]; }

function msgId() { return randomUUID().replace(/-/g, ""); }

// ── XML Builder helpers ──────────────────────────────────────────
function xmlEscapeValues(value) {
  if (typeof value === "string") {
    return value.replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    })[character]);
  }
  if (Array.isArray(value)) return value.map(xmlEscapeValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, xmlEscapeValues(item)]));
  }
  return value;
}

function xmlUnescape(value = "") {
  return value.replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
  })[entity]);
}

const IBAN_LENGTHS = {
  AD: 24, AE: 23, AL: 28, AO: 25, AT: 20, AZ: 28, BA: 20, BE: 16,
  BF: 27, BG: 22, BH: 22, BI: 27, BJ: 28, BR: 29, BY: 28, CH: 21,
  CI: 28, CM: 27, CG: 27, CR: 22, CV: 25, CY: 28, CZ: 24, DE: 22,
  DZ: 24, EG: 29, GA: 27, GQ: 27,
  DK: 18, DO: 28, EE: 20, ES: 24, FI: 18, FO: 18, FR: 27,
  GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28,
  IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20,
  IR: 26, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25,
  MA: 28, MC: 27, MD: 24, ME: 22, MG: 27, MK: 19, ML: 28, MR: 27,
  MT: 31, MU: 30, MZ: 25, NE: 28, NI: 32, NL: 18,
  NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, SN: 28, ST: 25,
  SV: 28, TG: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24,
  XK: 20,
};

function normalizeIban(value) {
  return String(value).replace(/\s/g, "").toUpperCase();
}

function isValidIban(value) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) ||
      IBAN_LENGTHS[iban.slice(0, 2)] !== iban.length) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const digits = character >= "A" && character <= "Z"
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function validatePaymentIdentifiers(p) {
  const issues = [];
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    return ["payment input must be a JSON object"];
  }
  if (p.transactions !== undefined && !Array.isArray(p.transactions)) {
    issues.push("transactions must be an array");
  }
  const transactions = Array.isArray(p.transactions) ? p.transactions : [];
  const bicValues = [
    ["debtorAgentBIC", p.debtorAgentBIC],
    ["creditorAgentBIC", p.creditorAgentBIC],
    ...transactions.flatMap((tx, index) => [
      [`transactions[${index}].debtorAgentBIC`, tx?.debtorAgentBIC],
      [`transactions[${index}].creditorAgentBIC`, tx?.creditorAgentBIC],
    ]),
  ];
  for (const [field, value] of bicValues) {
    if (value && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(value)) {
      issues.push(`${field} must be a valid 8- or 11-character BIC`);
    }
  }

  const accounts = [
    ["debtorAccount", p.debtorAccount],
    ["creditorAccount", p.creditorAccount],
    ...transactions.flatMap((tx, index) => [
      [`transactions[${index}].debtorAccount`, tx?.debtorAccount],
      [`transactions[${index}].creditorAccount`, tx?.creditorAccount],
    ]),
  ];
  for (const [field, account] of accounts) {
    if (account?.iban && !isValidIban(account.iban)) {
      issues.push(`${field}.iban is invalid (country length or MOD 97 checksum failed)`);
    }
  }

  if (p.uetr && (typeof p.uetr !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.uetr))) {
    issues.push("uetr must be a UUID version 4");
  }
  return issues;
}

function tag(name, value, attrs = "") {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return `<${name}${attrs}>${value}</${name}>`;
  return `<${name}${attrs}>${value}</${name}>`;
}

function postalAddress(addr = {}) {
  return `<PstlAdr>
          ${addr.streetName  ? `<StrtNm>${addr.streetName}</StrtNm>`  : ""}
          ${addr.buildingNo  ? `<BldgNb>${addr.buildingNo}</BldgNb>`  : ""}
          ${addr.postCode    ? `<PstCd>${addr.postCode}</PstCd>`      : ""}
          ${addr.townName    ? `<TwnNm>${addr.townName}</TwnNm>`      : ""}
          ${addr.country     ? `<Ctry>${addr.country}</Ctry>`         : ""}
        </PstlAdr>`;
}

function partyId(p = {}) {
  return `
        <Nm>${p.name || ""}</Nm>
        ${p.address ? postalAddress(p.address) : ""}
        ${p.lei ? `<Id><OrgId><LEI>${p.lei}</LEI></OrgId></Id>` : ""}`;
}

function accountId(acct = {}) {
  if (acct.iban) return `<Id><IBAN>${normalizeIban(acct.iban)}</IBAN></Id>`;
  if (acct.accountNumber) return `<Id><Othr><Id>${acct.accountNumber}</Id></Othr></Id>`;
  return `<Id><Othr><Id>${acct.id || "UNKNOWN"}</Id></Othr></Id>`;
}

function finInstn(bic) {
  return `<FinInstnId><BICFI>${bic}</BICFI></FinInstnId>`;
}

// ── pain.001.001.13 — Customer Credit Transfer Initiation ──────
function buildPain001(p) {
  p = xmlEscapeValues(p);
  const id = msgId("PAIN001");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.13"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.13 pain.001.001.13.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${p.msgId || id}</MsgId>
      <CreDtTm>${p.createdAt || now()}</CreDtTm>
      <NbOfTxs>${p.transactions?.length || 1}</NbOfTxs>
      <CtrlSum>${p.totalAmount || p.amount}</CtrlSum>
      <InitgPty>
        <Nm>${p.initiatingParty?.name || p.debtor?.name || ""}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${p.paymentInfoId || msgId("PMTINF")}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${p.transactions?.length || 1}</NbOfTxs>
      <CtrlSum>${p.totalAmount || p.amount}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>${p.serviceLevel || "SEPA"}</Cd></SvcLvl>
        <LclInstrm><Cd>${p.localInstrument || "CORE"}</Cd></LclInstrm>
        <CtgyPurp><Cd>${p.categoryPurpose || "SUPP"}</Cd></CtgyPurp>
      </PmtTpInf>
      <ReqdExctnDt>
        <Dt>${p.requestedExecutionDate || today()}</Dt>
      </ReqdExctnDt>
      <Dbtr>${partyId(p.debtor)}</Dbtr>
      <DbtrAcct>${accountId(p.debtorAccount)}</DbtrAcct>
      <DbtrAgt>${finInstn(p.debtorAgentBIC)}</DbtrAgt>
      ${(p.transactions || [{ id: p.instructionId, endToEndId: p.endToEndId, amount: p.amount, currency: p.currency, creditor: p.creditor, creditorAccount: p.creditorAccount, creditorAgentBIC: p.creditorAgentBIC, remittanceInfo: p.remittanceInfo }]).map(tx => `
      <CdtTrfTxInf>
        <PmtId>
          <InstrId>${tx.id || msgId("INSTR")}</InstrId>
          <EndToEndId>${tx.endToEndId || msgId("E2E")}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="${tx.currency || p.currency || "USD"}">${tx.amount}</InstdAmt>
        </Amt>
        <ChrgBr>${tx.chargeBearing || p.chargeBearing || "SLEV"}</ChrgBr>
        <CdtrAgt>${finInstn(tx.creditorAgentBIC || p.creditorAgentBIC)}</CdtrAgt>
        <Cdtr>${partyId(tx.creditor || p.creditor)}</Cdtr>
        <CdtrAcct>${accountId(tx.creditorAccount || p.creditorAccount)}</CdtrAcct>
        <Purp><Cd>${tx.purpose || p.purpose || "BEXP"}</Purp>
        <RmtInf>
          <Ustrd>${tx.remittanceInfo || p.remittanceInfo || ""}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`).join("\n")}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
  return xml.trim();
}

// ── pain.002.001.15 — Customer Payment Status Report ───────────
function buildPain002(p) {
  p = xmlEscapeValues(p);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.15"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrPmtStsRpt>
    <GrpHdr>
      <MsgId>${msgId("PAIN002")}</MsgId>
      <CreDtTm>${now()}</CreDtTm>
    </GrpHdr>
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>${p.originalMsgId}</OrgnlMsgId>
      <OrgnlMsgNmId>${p.originalMsgType || "pain.001.001.13"}</OrgnlMsgNmId>
      <GrpSts>${p.status}</GrpSts>
      ${p.reason ? `<StsRsnInf><Rsn><Cd>${p.reason}</Cd></Rsn></StsRsnInf>` : ""}
    </OrgnlGrpInfAndSts>
    ${p.transactions ? p.transactions.map(tx => `
    <OrgnlPmtInfAndSts>
      <OrgnlPmtInfId>${tx.originalPmtInfId}</OrgnlPmtInfId>
      <TxInfAndSts>
        <OrgnlInstrId>${tx.originalInstrId}</OrgnlInstrId>
        <OrgnlEndToEndId>${tx.originalEndToEndId}</OrgnlEndToEndId>
        <TxSts>${tx.status}</TxSts>
        ${tx.reason ? `<StsRsnInf><Rsn><Cd>${tx.reason}</Cd></Rsn></StsRsnInf>` : ""}
      </TxInfAndSts>
    </OrgnlPmtInfAndSts>`).join("") : ""}
  </CstmrPmtStsRpt>
</Document>`;
  return xml.trim();
}

// ── pacs.008.001.10 — FI to FI Customer Credit Transfer ────────
function buildPacs008(p) {
  p = xmlEscapeValues(p);
  const uetr = p.uetr || randomUUID();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${p.msgId || msgId("PACS008")}</MsgId>
      <CreDtTm>${p.createdAt || now()}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>${p.settlementMethod || "CLRG"}</SttlmMtd>
        ${p.settlementMethod === "INDA" || !p.settlementMethod || p.settlementMethod === "CLRG"
          ? `<ClrSys><Prtry>${p.clearingSystem || "LOCAL"}</Prtry></ClrSys>` : ""}
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${p.instructionId || msgId("INSTR")}</InstrId>
        <EndToEndId>${p.endToEndId || msgId("E2E")}</EndToEndId>
        <TxId>${p.transactionId || p.sendingBankTRN || msgId("TXN")}</TxId>
        <UETR>${uetr}</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${p.currency || "USD"}">${p.amount}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${p.settlementDate || today()}</IntrBkSttlmDt>
      <ChrgBr>${p.chargeBearing || "OUR"}</ChrgBr>
      <Dbtr>${partyId(p.debtor)}</Dbtr>
      <DbtrAcct>${accountId(p.debtorAccount)}</DbtrAcct>
      <DbtrAgt>${finInstn(p.debtorAgentBIC)}</DbtrAgt>
      <CdtrAgt>${finInstn(p.creditorAgentBIC)}</CdtrAgt>
      <Cdtr>${partyId(p.creditor)}</Cdtr>
      <CdtrAcct>${accountId(p.creditorAccount)}</CdtrAcct>
      <Purp><Cd>${p.purpose || "S2S"}</Cd></Purp>
      <RmtInf>
        <Ustrd>${p.remittanceInfo || p.reference || ""}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
  return xml.trim();
}

// ── pacs.009.001.10 — FI Credit Transfer ───────────────────────
function buildPacs009(p) {
  p = xmlEscapeValues(p);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.009.001.10">
  <FICdtTrf>
    <GrpHdr>
      <MsgId>${p.msgId || msgId("PACS009")}</MsgId>
      <CreDtTm>${p.createdAt || now()}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>${p.settlementMethod || "CLRG"}</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${p.instructionId || msgId("INSTR")}</InstrId>
        <EndToEndId>${p.endToEndId || msgId("E2E")}</EndToEndId>
        <TxId>${p.transactionId || p.sendingBankTRN || msgId("TXN")}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${p.currency || "USD"}">${p.amount}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${p.settlementDate || today()}</IntrBkSttlmDt>
      <Dbtr>${finInstn(p.debtorAgentBIC)}</Dbtr>
      <Cdtr>${finInstn(p.creditorAgentBIC)}</Cdtr>
    </CdtTrfTxInf>
  </FICdtTrf>
</Document>`;
  return xml.trim();
}

// ── camt.053.001.10 — Bank to Customer Statement ───────────────
function buildCamt053(p) {
  p = xmlEscapeValues(p);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.10">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${p.msgId || msgId("CAMT053")}</MsgId>
      <CreDtTm>${now()}</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>${p.statementId || msgId("STMT")}</Id>
      <ElctrncSeqNb>${p.sequenceNumber || 1}</ElctrncSeqNb>
      <CreDtTm>${now()}</CreDtTm>
      <Acct>
        ${accountId(p.account)}
        <Ccy>${p.currency || "USD"}</Ccy>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="${p.currency || "USD"}">${p.openingBalance}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>${p.statementDate || today()}</Dt></Dt>
      </Bal>
      ${(p.entries || []).map(e => `
      <Ntry>
        <Amt Ccy="${e.currency || p.currency || "USD"}">${e.amount}</Amt>
        <CdtDbtInd>${e.creditDebitIndicator || "DBIT"}</CdtDbtInd>
        <Sts>${e.status || "BOOK"}</Sts>
        <BookgDt><Dt>${e.bookingDate || today()}</Dt></BookgDt>
        <ValDt><Dt>${e.valueDate || today()}</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs>
              <EndToEndId>${e.endToEndId || ""}</EndToEndId>
              <PmtId>
                <InstrId>${e.instructionId || ""}</InstrId>
                <EndToEndId>${e.endToEndId || ""}</EndToEndId>
                <TxId>${e.transactionId || ""}</TxId>
              </PmtId>
            </Refs>
            <RmtInf><Ustrd>${e.remittanceInfo || ""}</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>`).join("")}
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="${p.currency || "USD"}">${p.closingBalance}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>${p.statementDate || today()}</Dt></Dt>
      </Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
  return xml.trim();
}

// ── Build full RFC 8259 multi-payload container ─────────────────
function buildContainer(p) {
  const uetr = p.uetr || randomUUID();
  const payment = { ...p, uetr };
  const pacs008xml = buildPacs008(payment);
  const pacs009xml = buildPacs009(payment);

  // Compute camt.053 balances
  const openBal   = Number(p.openingBalance ?? 0);
  const amount    = Number(p.amount ?? 0);
  const closeBal  = ((Math.round(openBal * 100) - Math.round(amount * 100)) / 100).toFixed(2);

  const camt053xml = buildCamt053({
    ...p,
    openingBalance: openBal.toFixed(2),
    closingBalance: closeBal,
    entries: [{
      amount:                 p.amount,
      currency:               p.currency || "USD",
      creditDebitIndicator:   "DBIT",
      status:                 "BOOK",
      bookingDate:            p.settlementDate || today(),
      valueDate:              p.settlementDate || today(),
      endToEndId:             p.endToEndId,
      instructionId:          p.instructionId,
      transactionId:          p.transactionId || p.sendingBankTRN,
      remittanceInfo:         p.remittanceInfo || "",
    }],
  });

  const container = {
    header: {
      file_type:           "ISO20022_MULTI_PAYLOAD_CONTAINER",
      version:             "3.54.1.0.5",
      exported_at:         now(),
      execution_mode:      p.executionMode || "PRODUCTION_API_CONTAINER",
      tenant_id:           p.tenantId || "PRIMESTACK_CORE",
      target_institution:  p.targetInstitution || "",
      generated_by:        "PrimeStack ISO 20022 Engine",
      schema_version:      "2025_2026",
    },
    transaction_metadata: {
      sending_bank_trn:           p.sendingBankTRN || p.transactionId || msgId("TRN"),
      instruction_id:             p.instructionId  || msgId("INS"),
      end_to_end_id:              p.endToEndId     || msgId("E2E"),
      settlement_amount:          parseFloat(p.amount),
      currency:                   p.currency || "USD",
      value_date:                 p.settlementDate || today(),
      electronic_sequence_number: p.sequenceNumber || 1,
      debtor_agent_bic:           p.debtorAgentBIC,
      creditor_agent_bic:         p.creditorAgentBIC,
      uetr,
    },
    iso20022_telemetry: {
      pacs008: {
        filename:    `pacs008_${Date.now()}.xml`,
        sha256_hash: sha256(pacs008xml),
        xml_content: pacs008xml,
      },
      pacs009: {
        filename:    `pacs009_${Date.now()}.xml`,
        sha256_hash: sha256(pacs009xml),
        xml_content: pacs009xml,
      },
      camt053: {
        filename:    `camt053_${Date.now()}.xml`,
        sha256_hash: sha256(camt053xml),
        xml_content: camt053xml,
      },
    },
    callback_config: {
      callback_url:             p.callbackUrl || "",
      expected_response_status: "ACCC",
    },
  };

  return container;
}

// ── Validate a container ────────────────────────────────────────
function validateContainer(container) {
  const issues  = [];
  const passed  = [];

  if (!container || typeof container !== "object" || Array.isArray(container)) {
    return {
      valid: false,
      passed: 0,
      issues: 1,
      details: { passed, issues: ["container must be a JSON object"] },
    };
  }

  // Header checks
  const h = container.header || {};
  if (!h.file_type)          issues.push("header.file_type missing");             else passed.push("header.file_type present");
  if (!h.version)            issues.push("header.version missing");               else passed.push("header.version present");
  if (!h.exported_at)        issues.push("header.exported_at missing");           else passed.push("header.exported_at present");
  if (!h.execution_mode)     issues.push("header.execution_mode missing");        else passed.push("header.execution_mode present");
  if (!h.tenant_id)          issues.push("header.tenant_id missing");             else passed.push("header.tenant_id present");
  if (!h.target_institution) issues.push("header.target_institution missing");    else passed.push("header.target_institution present");

  // Transaction metadata checks
  const m = container.transaction_metadata || {};
  if (!m.sending_bank_trn)          issues.push("transaction_metadata.sending_bank_trn missing");    else passed.push("sending_bank_trn present");
  if (!m.instruction_id)             issues.push("transaction_metadata.instruction_id missing");      else passed.push("instruction_id present");
  if (!m.end_to_end_id)              issues.push("transaction_metadata.end_to_end_id missing");       else passed.push("end_to_end_id present");
  if (!Number.isFinite(Number(m.settlement_amount)) || Number(m.settlement_amount) <= 0) issues.push("settlement_amount must be a finite number > 0"); else passed.push(`settlement_amount = ${m.settlement_amount}`);
  if (!m.currency || !/^[A-Z]{3}$/.test(m.currency))   issues.push("currency must be 3 uppercase letters (ISO 4217)"); else passed.push(`currency = ${m.currency}`);
  if (!m.value_date || !/^\d{4}-\d{2}-\d{2}$/.test(m.value_date)) issues.push("value_date must be YYYY-MM-DD"); else passed.push("value_date valid");
  if (!m.debtor_agent_bic)           issues.push("debtor_agent_bic missing");                         else passed.push(`debtor_agent_bic = ${m.debtor_agent_bic}`);
  if (!m.creditor_agent_bic)         issues.push("creditor_agent_bic missing");                       else passed.push(`creditor_agent_bic = ${m.creditor_agent_bic}`);

  // ISO 9362 BIC format
  if (m.debtor_agent_bic) {
    if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(m.debtor_agent_bic)) issues.push(`debtor_agent_bic invalid: ${m.debtor_agent_bic}`);
    else passed.push("debtor_agent_bic format valid");
  }
  if (m.creditor_agent_bic) {
    if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(m.creditor_agent_bic)) issues.push(`creditor_agent_bic invalid: ${m.creditor_agent_bic}`);
    else passed.push("creditor_agent_bic format valid");
  }

  if (!m.uetr || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(m.uetr)) {
    issues.push("transaction_metadata.uetr must be a UUID version 4");
  } else {
    passed.push("uetr UUID version 4 valid");
  }

  // ISO 20022 payloads
  const t = container.iso20022_telemetry || {};
  ["pacs008", "pacs009", "camt053"].forEach(key => {
    if (!t[key]) {
      issues.push(`iso20022_telemetry.${key} missing`);
    } else {
      passed.push(`${key} payload present`);
      // SHA-256 verification
      if (typeof t[key].xml_content === "string" && typeof t[key].sha256_hash === "string") {
        const computed = sha256(t[key].xml_content);
        if (computed === t[key].sha256_hash) {
          passed.push(`${key} SHA-256 hash verified`);
        } else {
          issues.push(`${key} SHA-256 hash MISMATCH — stored: ${t[key].sha256_hash.slice(0,16)}... computed: ${computed.slice(0,16)}...`);
        }
        const ibanMatches = t[key].xml_content.matchAll(/<IBAN>([^<]*)<\/IBAN>/g);
        for (const match of ibanMatches) {
          if (!isValidIban(match[1])) issues.push(`${key} contains an invalid IBAN`);
        }
      } else {
        issues.push(`${key} missing xml_content or sha256_hash`);
      }
    }
  });

  // camt.053 balance reconciliation
  if (typeof t.camt053?.xml_content === "string") {
    const xml = t.camt053.xml_content;
    const opbd = Number(xml.match(/<Cd>OPBD<\/Cd>[\s\S]*?<Amt[^>]*>(-?[\d.]+)<\/Amt>/)?.[1]);
    const clbd = Number(xml.match(/<Cd>CLBD<\/Cd>[\s\S]*?<Amt[^>]*>(-?[\d.]+)<\/Amt>/)?.[1]);
    const entries = [...xml.matchAll(/<Ntry>[\s\S]*?<Amt[^>]*>(-?[\d.]+)<\/Amt>[\s\S]*?<CdtDbtInd>(CRDT|DBIT)<\/CdtDbtInd>[\s\S]*?<\/Ntry>/g)];
    if (Number.isFinite(opbd) && Number.isFinite(clbd)) {
      const entryDeltaCents = entries.reduce((sum, match) => {
        const amountCents = Math.round(Number(match[1]) * 100);
        return sum + (match[2] === "CRDT" ? amountCents : -amountCents);
      }, 0);
      const expectedCents = Math.round(opbd * 100) + entryDeltaCents;
      const closingCents = Math.round(clbd * 100);
      if (entries.length && expectedCents === closingCents) {
        passed.push(`camt.053 balances reconcile across ${entries.length} entries`);
      } else {
        issues.push(`camt.053 balance mismatch: expected ${(expectedCents / 100).toFixed(2)}, found ${clbd.toFixed(2)}`);
      }
    }
  }

  // Callback
  const cb = container.callback_config || {};
  if (!cb.callback_url) issues.push("callback_config.callback_url missing"); else passed.push("callback_url present");
  if (cb.expected_response_status !== "ACCC") issues.push("expected_response_status should be ACCC"); else passed.push("expected_response_status = ACCC");

  // exported_at format
  try { new Date(h.exported_at).toISOString(); passed.push("exported_at ISO 8601 valid"); }
  catch { issues.push("exported_at not valid ISO 8601"); }

  return {
    valid:      issues.length === 0,
    passed:     passed.length,
    issues:     issues.length,
    details:    { passed, issues },
  };
}

// ── Platform ledger post ────────────────────────────────────────
async function postToLedger(container) {
  const m   = container.transaction_metadata;
  const ref = `ISO20022-${m.sending_bank_trn}-${Date.now()}`;

  try {
    const r = await fetch(`${DASHBOARD}/api/wallets/entries`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference:   ref,
        entryType:   "FUNDING",
        description: `ISO 20022 incoming: ${m.currency} ${m.settlement_amount} via ${m.debtor_agent_bic}`,
        metadata: {
          source:           "iso20022_engine",
          sendingBankTRN:   m.sending_bank_trn,
          instructionId:    m.instruction_id,
          endToEndId:       m.end_to_end_id,
          debtorAgentBIC:   m.debtor_agent_bic,
          creditorAgentBIC: m.creditor_agent_bic,
          targetInstitution: container.header.target_institution,
          tenantId:          container.header.tenant_id,
          valueDate:         m.value_date,
        },
        lines: [
          { accountId: `${m.debtor_agent_bic}:INCOMING:${m.currency}`, debit: String(m.settlement_amount), credit: "0.00" },
          { accountId: `PLATFORM:RESERVE:${m.currency}`,               debit: "0.00", credit: String(m.settlement_amount) },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    return r.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── HTTP Server ──────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end(); return;
  }

  const [path] = (req.url || "/").split("?");

  // ── Health ────────────────────────────────────────────────────
  if (path === "/health") {
    return json(res, 200, {
      status: "ok", service: "iso20022-engine",
      schemasLoaded: Object.keys(schemas).length,
      schemas: Object.keys(schemas),
    });
  }

  // ── List schemas ──────────────────────────────────────────────
  if (req.method === "GET" && path === "/iso20022/schemas") {
    return json(res, 200, {
      success: true,
      data: Object.keys(schemas).map(k => ({
        name: k,
        namespace: `urn:iso:std:iso:20022:tech:xsd:${k}`,
        sizeBytes: schemas[k].length,
      })),
    });
  }

  // ── List templates ────────────────────────────────────────────
  if (req.method === "GET" && path === "/iso20022/templates") {
    return json(res, 200, {
      success: true,
      data: [
        { id: "full_container",  name: "Full Multi-Payload Container",   messages: ["pacs.008", "pacs.009", "camt.053"], useCase: "Interbank settlement, SWIFT" },
        { id: "pain001",         name: "Customer Credit Transfer Init",   messages: ["pain.001"],                         useCase: "Customer initiates payment" },
        { id: "pain002",         name: "Payment Status Report",           messages: ["pain.002"],                         useCase: "Bank confirms/rejects payment" },
        { id: "pacs008_only",    name: "FI to FI Credit Transfer",        messages: ["pacs.008"],                         useCase: "Bank to bank wire" },
        { id: "pacs009_only",    name: "FI Credit Transfer",              messages: ["pacs.009"],                         useCase: "Central bank settlement" },
        { id: "camt053_only",    name: "Bank to Customer Statement",      messages: ["camt.053"],                         useCase: "Account statement" },
      ],
    });
  }

  // ── Generate container ────────────────────────────────────────
  if (req.method === "POST" && path === "/iso20022/generate") {
    const raw = await readBody(req);
    let p;
    try { p = JSON.parse(raw.toString()); }
    catch { return json(res, 400, { success: false, error: "Invalid JSON body" }); }

    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return json(res, 400, { success: false, error: "Request body must be a JSON object" });
    }
    const required = ["amount", "currency", "debtorAgentBIC", "creditorAgentBIC"];
    const missing  = required.filter(k => !p[k]);
    if (missing.length) {
      return json(res, 422, { success: false, error: { message: `Missing required fields: ${missing.join(", ")}` } });
    }
    const identifierIssues = validatePaymentIdentifiers(p);
    if (identifierIssues.length) {
      return json(res, 422, { success: false, error: { message: "Invalid payment identifiers", details: identifierIssues } });
    }

    const container  = buildContainer(p);
    const validation = validateContainer(container);

    return json(res, 200, {
      success:    true,
      validation,
      container,
    });
  }

  // ── Validate container ────────────────────────────────────────
  if (req.method === "POST" && path === "/iso20022/validate") {
    const raw = await readBody(req);
    let container;
    try { container = JSON.parse(raw.toString()); }
    catch { return json(res, 400, { success: false, error: "Invalid JSON body" }); }

    const result = validateContainer(container);
    return json(res, 200, { success: true, data: result });
  }

  // ── pain.001 generator ────────────────────────────────────────
  if (req.method === "POST" && path === "/iso20022/pain001") {
    const raw = await readBody(req);
    let p;
    try { p = JSON.parse(raw.toString()); }
    catch { return json(res, 400, { success: false, error: "Invalid JSON body" }); }

    const identifierIssues = validatePaymentIdentifiers(p);
    if (identifierIssues.length) {
      return json(res, 422, { success: false, error: { message: "Invalid payment identifiers", details: identifierIssues } });
    }
    const xml  = buildPain001(p);
    const hash = sha256(xml);
    return json(res, 200, {
      success: true,
      data: {
        messageType: "pain.001.001.13",
        namespace:   "urn:iso:std:iso:20022:tech:xsd:pain.001.001.13",
        sha256_hash: hash,
        xml,
      },
    });
  }

  // ── pain.002 generator ────────────────────────────────────────
  if (req.method === "POST" && path === "/iso20022/pain002") {
    const raw = await readBody(req);
    let p;
    try { p = JSON.parse(raw.toString()); }
    catch { return json(res, 400, { success: false, error: "Invalid JSON body" }); }

    const xml  = buildPain002(p);
    const hash = sha256(xml);
    return json(res, 200, {
      success: true,
      data: {
        messageType: "pain.002.001.15",
        namespace:   "urn:iso:std:iso:20022:tech:xsd:pain.002.001.15",
        sha256_hash: hash,
        xml,
      },
    });
  }

  // ── Acknowledgement generator (camt.025 ACCC/RJCT) ───────────
  if (req.method === "POST" && path === "/iso20022/ack") {
    const raw = await readBody(req);
    let p;
    try { p = JSON.parse(raw.toString()); }
    catch { return json(res, 400, { success: false, error: "Invalid JSON body" }); }

    const callbackUrl = p.callbackUrl;
    p = xmlEscapeValues(p);
    const status   = p.status || "ACCC"; // ACCC=Accepted, RJCT=Rejected, PDNG=Pending
    const ackXml   = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.025.001.07">
  <Rct>
    <MsgHdr>
      <MsgId>${msgId("ACK")}</MsgId>
      <CreDtTm>${now()}</CreDtTm>
    </MsgHdr>
    <OrgnlMsgAndSts>
      <OrgnlMsgId>${p.originalMsgId || ""}</OrgnlMsgId>
      <OrgnlMsgNmId>${p.originalMsgType || "pacs.008.001.10"}</OrgnlMsgNmId>
      <Sts>${status}</Sts>
      ${p.reason ? `<Rsn><Cd>${p.reason}</Cd></Rsn>` : ""}
    </OrgnlMsgAndSts>
  </Rct>
</Document>`;

    const hash = sha256(ackXml);

    // If callback URL provided, POST the ack
    if (callbackUrl) {
      fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/xml", "X-ISO20022-Status": status },
        body: ackXml,
        signal: AbortSignal.timeout(10000),
      }).then(r => console.log(`[iso20022] ACK sent to ${callbackUrl} — ${r.status}`))
        .catch(e => console.warn(`[iso20022] ACK callback failed: ${e.message}`));
    }

    return json(res, 200, {
      success: true,
      data: {
        status,
        messageType: "camt.025.001.07",
        sha256_hash: hash,
        xml: ackXml,
        callbackSent: !!p.callbackUrl,
      },
    });
  }

  // ── Post to platform ledger ───────────────────────────────────
  if (req.method === "POST" && path === "/iso20022/ledger-credit") {
    const raw = await readBody(req);
    const authError = verifyLedgerRequest(req, raw);
    if (authError) {
      return json(res, authError.status, { success: false, error: authError.error });
    }

    let container;
    try { container = JSON.parse(raw.toString()); }
    catch { return json(res, 400, { success: false, error: "Invalid JSON body" }); }

    // Validate first
    const validation = validateContainer(container);
    if (!validation.valid && container.strict !== false) {
      return json(res, 422, {
        success: false,
        error: { message: "Container failed validation — fix issues before ledger post" },
        validation,
      });
    }

    const ledgerResult = await postToLedger(container);
    return json(res, ledgerResult.success !== false ? 201 : 502, {
      success:    ledgerResult.success !== false,
      validation,
      ledger:     ledgerResult,
    });
  }

  // ── Parse an existing container ───────────────────────────────
  if (req.method === "POST" && path === "/iso20022/parse") {
    const raw = await readBody(req);
    let container;
    try { container = JSON.parse(raw.toString()); }
    catch { return json(res, 400, { success: false, error: "Invalid JSON body" }); }

    const validation = validateContainer(container);
    const m          = container.transaction_metadata || {};
    const h          = container.header || {};

    // Extract key fields from embedded XML
    const pacs008    = container.iso20022_telemetry?.pacs008?.xml_content || "";
    const txId       = xmlUnescape((pacs008.match(/<TxId>([^<]+)<\/TxId>/))?.[1] || "");
    const debtorNm   = xmlUnescape((pacs008.match(/<Dbtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/))?.[1] || "");
    const creditorNm = xmlUnescape((pacs008.match(/<Cdtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/))?.[1] || "");
    const rmtInf     = xmlUnescape((pacs008.match(/<Ustrd>([^<]+)<\/Ustrd>/))?.[1] || "");

    return json(res, 200, {
      success: true,
      data: {
        validation,
        summary: {
          fileType:          h.file_type,
          tenantId:          h.tenant_id,
          targetInstitution: h.target_institution,
          sendingBankTRN:    m.sending_bank_trn,
          instructionId:     m.instruction_id,
          endToEndId:        m.end_to_end_id,
          transactionId:     txId,
          settlementAmount:  m.settlement_amount,
          currency:          m.currency,
          valueDate:         m.value_date,
          debtorAgentBIC:    m.debtor_agent_bic,
          creditorAgentBIC:  m.creditor_agent_bic,
          debtorName:        debtorNm,
          creditorName:      creditorNm,
          remittanceInfo:    rmtInf,
          payloads:          Object.keys(container.iso20022_telemetry || {}),
          callbackUrl:       container.callback_config?.callback_url,
        },
      },
    });
  }

  return json(res, 404, { error: "Not found", path });
});

server.listen(PORT, () => {
  if (!LEDGER_HMAC_SECRET_VALID) {
    console.error("[iso20022] Ledger posting disabled: set ISO20022_LEDGER_HMAC_SECRET to a secret of at least 32 bytes");
  } else {
    console.log("[iso20022] Ledger posting requires HMAC-SHA256 authentication");
  }
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║      PrimeStack — ISO 20022 Payment Engine               ║
╠═══════════════════════════════════════════════════════════╣
║  Health:      http://localhost:${PORT}/health                  ║
║  Generate:    POST /iso20022/generate                     ║
║  Validate:    POST /iso20022/validate                     ║
║  Parse:       POST /iso20022/parse                        ║
║  ACK:         POST /iso20022/ack                          ║
║  pain.001:    POST /iso20022/pain001                      ║
║  pain.002:    POST /iso20022/pain002                      ║
║  Schemas:     GET  /iso20022/schemas                      ║
║  Templates:   GET  /iso20022/templates                    ║
║  Ledger:      POST /iso20022/ledger-credit                ║
╠═══════════════════════════════════════════════════════════╣
║  XSD Schemas loaded: ${String(Object.keys(schemas).length).padEnd(38)}║
╚═══════════════════════════════════════════════════════════╝
`);
});
