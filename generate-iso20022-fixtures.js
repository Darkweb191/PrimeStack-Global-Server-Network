#!/usr/bin/env node
/**
 * PrimeStack — ISO 20022 Test-Fixture Generator
 * =============================================
 *
 * Emits structurally spec-correct ISO 20022 payment messages for integration
 * testing ONLY:
 *
 *   pain.001.001.13  CustomerCreditTransferInitiation
 *   pacs.008.001.10  FIToFICustomerCreditTransfer
 *   pacs.002.001.13  FIToFIPaymentStatusReport
 *
 * Deliberate design constraints:
 *   - Every party, account, BIC, IBAN and LEI is SYNTHETIC. Institution codes
 *     are always "TEST"; nothing resolves to a real financial institution.
 *   - No settlement outcome and no AML/KYC result is asserted. The pacs.002
 *     fixture carries status PDNG (pending) with a proprietary test reason and
 *     no compliance envelope of any kind.
 *   - Every artifact carries the watermark "TEST FIXTURE — NOT A BANK RECORD".
 *   - No "certified" / "verified" trust badges and no API credentials.
 *
 * Usage:  node generate-iso20022-fixtures.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WATERMARK = 'TEST FIXTURE — NOT A BANK RECORD';
const NOTICE =
  'Synthetic ISO 20022 message produced for software integration testing. ' +
  'It does not represent a real payment, a real institution, a real account, ' +
  'a settlement outcome, or a compliance decision.';
const OUT_DIR = path.join(__dirname, 'NEW IMPLEMENTS', 'ISO20022_TEST_FIXTURES');

// Official ISO 20022 message definition identifiers and document roots.
const MSG = {
  pain001: { id: 'pain.001.001.13', root: 'CstmrCdtTrfInitn' },
  pacs008: { id: 'pacs.008.001.10', root: 'FIToFICstmrCdtTrf' },
  pacs002: { id: 'pacs.002.001.13', root: 'FIToFIPmtStsRpt' },
};

// ─── Code registries used for validation ────────────────────────────────────

// ISO 3166-1 alpha-2 country codes accepted by the fixture validator.
const ISO_3166_ALPHA2 = new Set(
  ('AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ ' +
    'CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO ' +
    'FR GA GB GD GE GH GI GL GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM ' +
    'MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY QA RO ' +
    'RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT ' +
    'TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW').split(' ')
);

// ISO 4217 currency codes used by the fixture scenarios.
const ISO_4217 = new Set(['EUR', 'GBP', 'USD', 'AED', 'CHF', 'SGD', 'JPY', 'AUD', 'CAD']);

// IBAN country registry (structure + total length) for the supported set.
const IBAN_SPEC = {
  AE: { len: 23, bban: (r) => randDigits(r, 19) },                                   // 3 bank + 16 acct
  DE: { len: 22, bban: (r) => randDigits(r, 18) },                                   // 8 bank + 10 acct
  ES: { len: 24, bban: (r) => randDigits(r, 20) },
  FR: { len: 27, bban: (r) => randDigits(r, 5) + randDigits(r, 5) + randAlnum(r, 11) + randDigits(r, 2) },
  GB: { len: 22, bban: (r) => randAlpha(r, 4) + randDigits(r, 14) },
  NL: { len: 18, bban: (r) => randAlpha(r, 4) + randDigits(r, 10) },
};

// ─── Deterministic PRNG (reproducible fixtures) ─────────────────────────────

function seedFrom(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randDigits(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += String(Math.floor(rng() * 10));
  return s;
}
function randAlpha(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHA[Math.floor(rng() * ALPHA.length)];
  return s;
}
function randAlnum(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALNUM[Math.floor(rng() * ALNUM.length)];
  return s;
}

/** RFC 8144 UETR — a UUID, generated deterministically from the fixture seed. */
function uuidFromRng(rng) {
  const bytes = [];
  for (let i = 0; i < 16; i++) bytes.push(Math.floor(rng() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── MOD 97-10 (ISO 7064) primitives ────────────────────────────────────────

/** Iterative mod-97 over a string of digits and/or letters (A=10 … Z=35). */
function mod97(str) {
  let rem = 0;
  for (const ch of str) {
    const isDigit = ch >= '0' && ch <= '9';
    const v = isDigit ? Number(ch) : ch.charCodeAt(0) - 55;
    rem = (rem * (v > 9 ? 100 : 10) + v) % 97;
  }
  return rem;
}

function ibanCheckDigits(country, bban) {
  const cd = 98 - mod97(bban + country + '00');
  return String(cd).padStart(2, '0');
}

function leiCheckDigits(first18) {
  const cd = 98 - mod97(first18 + '00');
  return String(cd).padStart(2, '0');
}

// ─── Validators ─────────────────────────────────────────────────────────────

/** ISO 9362 (BIC). Returns { valid, errors, syntheticInstitution }. */
function validateBIC(bic) {
  const errors = [];
  if (typeof bic !== 'string' || !bic) return { valid: false, errors: ['BIC must be a non-empty string'] };
  const b = bic.toUpperCase();
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(b)) {
    return { valid: false, errors: ['BIC must match [A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})? per ISO 9362'] };
  }
  const country = b.slice(4, 6);
  if (!ISO_3166_ALPHA2.has(country)) errors.push(`country code "${country}" is not a valid ISO 3166-1 alpha-2 code`);
  return { valid: errors.length === 0, errors, syntheticInstitution: b.slice(0, 4) === 'TEST' };
}

/** ISO 13616 (IBAN) with MOD 97-10 checksum. */
function validateIBAN(iban) {
  const errors = [];
  if (typeof iban !== 'string' || !iban) return { valid: false, errors: ['IBAN must be a non-empty string'] };
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s)) {
    return { valid: false, errors: ['IBAN must match [A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}'] };
  }
  const country = s.slice(0, 2);
  const spec = IBAN_SPEC[country];
  if (!spec) {
    errors.push(`country "${country}" is outside the fixture IBAN registry`);
  } else if (s.length !== spec.len) {
    errors.push(`length ${s.length} does not match IBAN registry length ${spec.len} for ${country}`);
  }
  if (mod97(s.slice(4) + s.slice(0, 4)) !== 1) errors.push('MOD 97-10 checksum failed');
  return { valid: errors.length === 0, errors };
}

/** ISO 17442 (LEI): 4 LOU + 2 reserved "00" + 12 entity + 2 check digits. */
function validateLEI(lei) {
  const errors = [];
  if (typeof lei !== 'string' || !lei) return { valid: false, errors: ['LEI must be a non-empty string'] };
  const s = lei.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(s)) {
    return { valid: false, errors: ['LEI must be 20 characters with 2 trailing check digits (ISO 17442)'] };
  }
  if (s.slice(4, 6) !== '00') errors.push('characters 5-6 must be the reserved value "00"');
  const expected = leiCheckDigits(s.slice(0, 18));
  if (expected !== s.slice(18, 20)) errors.push(`check digits "${s.slice(18, 20)}" != expected "${expected}"`);
  return { valid: errors.length === 0, errors };
}

// ─── Synthetic identifier factories ─────────────────────────────────────────

/** Synthetic BIC: institution code is always TEST, never a real institution. */
function syntheticBIC(rng, country, office = 'T1') {
  const bic = `TEST${country}${office}XXX`;
  const v = validateBIC(bic);
  if (!v.valid || !v.syntheticInstitution) throw new Error(`generated BIC failed self-check: ${bic} ${v.errors.join('; ')}`);
  return bic;
}

function syntheticIBAN(rng, country) {
  const spec = IBAN_SPEC[country];
  if (!spec) throw new Error(`no IBAN structure registered for ${country}`);
  const bban = spec.bban(rng);
  const iban = country + ibanCheckDigits(country, bban) + bban;
  const v = validateIBAN(iban);
  if (!v.valid) throw new Error(`generated IBAN failed self-check: ${iban} ${v.errors.join('; ')}`);
  return iban;
}

function syntheticLEI(rng) {
  // LOU prefix "TEST" + reserved "00" + 12-character synthetic entity id.
  const first18 = 'TEST00' + randAlnum(rng, 12);
  const lei = first18 + leiCheckDigits(first18);
  const v = validateLEI(lei);
  if (!v.valid) throw new Error(`generated LEI failed self-check: ${lei} ${v.errors.join('; ')}`);
  return lei;
}

// ─── Fixture scenarios ──────────────────────────────────────────────────────

const PARTIES = [
  { name: 'ALPHA TEST HOLDINGS LTD', country: 'DE' },
  { name: 'BETA FIXTURE TRADING GMBH', country: 'DE' },
  { name: 'GAMMA SYNTHETIC LOGISTICS BV', country: 'NL' },
  { name: 'DELTA EXAMPLE SYSTEMS SARL', country: 'FR' },
  { name: 'EPSILON SAMPLE SUPPLIES LTD', country: 'GB' },
  { name: 'ZETA DEMO PARTNERS LLC', country: 'AE' },
];

const SCENARIOS = [
  { id: 'EUR_SEPA_CORE_DE_FR', currency: 'EUR', transactions: [{ amount: '12500.00', debtor: 0, creditor: 3 }] },
  { id: 'EUR_SEPA_INSTANT_NL_ES', currency: 'EUR', transactions: [{ amount: '480.75', debtor: 2, creditor: 1 }] },
  { id: 'GBP_FASTER_PAYMENT_GB_GB', currency: 'GBP', transactions: [{ amount: '8600.00', debtor: 4, creditor: 4 }] },
  { id: 'AED_LOCAL_TRANSFER_AE_AE', currency: 'AED', transactions: [{ amount: '45000.00', debtor: 5, creditor: 5 }] },
  {
    id: 'EUR_BULK_PAYMENT_DE_NL',
    currency: 'EUR',
    // pain.001 carries a single debtor at PmtInf level, so all transactions in
    // this batch are debited from the same (synthetic) party.
    transactions: [
      { amount: '1500.00', debtor: 0, creditor: 2 },
      { amount: '2750.50', debtor: 0, creditor: 3 },
      { amount: '990.25', debtor: 0, creditor: 4 },
    ],
  },
  { id: 'EUR_HIGH_VALUE_DE_ES', currency: 'EUR', transactions: [{ amount: '975000.00', debtor: 1, creditor: 3 }] },
];

const PARTY_COUNTRY_TO_IBAN = { DE: 'DE', NL: 'NL', FR: 'FR', GB: 'GB', AE: 'AE' };

// ─── Value helpers ──────────────────────────────────────────────────────────

function amount(n) {
  return Number(n).toFixed(2);
}
function sumAmounts(txs) {
  return txs.reduce((a, t) => a + Number(t.amount), 0).toFixed(2);
}
function isoDateTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function comment() {
  return `<!-- ${WATERMARK}. ${NOTICE} -->`;
}
function watermarkText(ref) {
  return `${WATERMARK} | ref ${ref}`;
}

// ─── Message builders ───────────────────────────────────────────────────────

function buildPain001(ctx) {
  const { msgId, createdAt, executionDate, currency, debtor, debtorAccount, debtorAgent, initiator, txs } = ctx;
  const total = sumAmounts(txs);

  const txXml = txs
    .map(
      (t) => `      <CdtTrfTxInf>
        <PmtId>
          <InstrId>${t.instrId}</InstrId>
          <EndToEndId>${t.endToEndId}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="${currency}">${amount(t.amount)}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BICFI>${t.creditorAgent}</BICFI>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${t.creditorName}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${t.creditorAccount}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${watermarkText(t.endToEndId)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
${comment()}
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${MSG.pain001.id}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${createdAt}</CreDtTm>
      <NbOfTxs>${txs.length}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <InitgPty>
        <Nm>${initiator}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${ctx.pmtInfId}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>${txs.length > 1 ? 'true' : 'false'}</BtchBookg>
      <NbOfTxs>${txs.length}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>${ctx.serviceLevel}</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>
        <Dt>${executionDate}</Dt>
      </ReqdExctnDt>
      <Dbtr>
        <Nm>${debtor.name}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${debtorAccount}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${debtorAgent}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>${ctx.chargeBearer}</ChrgBr>
${txXml}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

function buildPacs008(ctx) {
  const tx = ctx.txs[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
${comment()}
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${MSG.pacs008.id}">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${ctx.msgId}</MsgId>
      <CreDtTm>${ctx.createdAt}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${tx.instrId}</InstrId>
        <EndToEndId>${tx.endToEndId}</EndToEndId>
        <TxId>${tx.txId}</TxId>
        <UETR>${tx.uetr}</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${ctx.currency}">${amount(tx.amount)}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${ctx.settlementDate}</IntrBkSttlmDt>
      <ChrgBr>${ctx.chargeBearer}</ChrgBr>
      <Dbtr>
        <Nm>${tx.debtorName}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${tx.debtorAccount}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${tx.debtorAgent}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>${tx.creditorAgent}</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>${tx.creditorName}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${tx.creditorAccount}</IBAN>
        </Id>
      </CdtrAcct>
      <RmtInf>
        <Ustrd>${watermarkText(tx.endToEndId)}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
}

/**
 * pacs.002 status report. Status is PDNG (pending) with a proprietary test
 * reason — the fixture never asserts that a payment settled.
 */
function buildPacs002(ctx) {
  const tx = ctx.txs[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
${comment()}
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${MSG.pacs002.id}">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>${ctx.statusMsgId}</MsgId>
      <CreDtTm>${ctx.createdAt}</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <StsId>${ctx.statusId}</StsId>
      <OrgnlGrpInf>
        <OrgnlMsgId>${ctx.msgId}</OrgnlMsgId>
        <OrgnlMsgNmId>${MSG.pacs008.id}</OrgnlMsgNmId>
      </OrgnlGrpInf>
      <OrgnlInstrId>${tx.instrId}</OrgnlInstrId>
      <OrgnlEndToEndId>${tx.endToEndId}</OrgnlEndToEndId>
      <OrgnlTxId>${tx.txId}</OrgnlTxId>
      <OrgnlUETR>${tx.uetr}</OrgnlUETR>
      <TxSts>PDNG</TxSts>
      <StsRsnInf>
        <Rsn>
          <Prtry>TESTFIXTURE</Prtry>
        </Rsn>
        <AddtlInf>${WATERMARK}</AddtlInf>
      </StsRsnInf>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`;
}

// ─── Structural validation of generated XML ─────────────────────────────────

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Field-path level checks against the expected ISO 20022 structure. */
function validateMessage(kind, xml, ctx) {
  const passed = [];
  const failed = [];
  const check = (cond, ok, bad) => (cond ? passed.push(ok) : failed.push(bad));

  const expectedNs = `urn:iso:std:iso:20022:tech:xsd:${MSG[kind].id}`;
  check(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'XML declaration present', 'missing XML declaration');
  check(xml.includes(`xmlns="${expectedNs}"`), `default namespace ${MSG[kind].id}`, `wrong or missing namespace for ${MSG[kind].id}`);
  check(xml.includes(`<${MSG[kind].root}>`), `root element ${MSG[kind].root}`, `missing root element ${MSG[kind].root}`);
  check(xml.includes(WATERMARK), 'watermark present in document', 'watermark MISSING from document');

  // Shared header fields
  const msgIds = extractAll(xml, 'MsgId');
  check(msgIds.length >= 1 && msgIds.every((s) => s.length > 0 && s.length <= 35), 'GrpHdr/MsgId present and <= 35 chars', 'GrpHdr/MsgId missing or too long');

  // Identifier field validation. pacs.002 is a status report: it references the
  // original message and carries no agent/account detail, so those presence
  // checks apply only to the party-bearing messages.
  const carriesParties = kind !== 'pacs002';

  const bics = extractAll(xml, 'BICFI');
  const bicResults = bics.map((b) => ({ b, r: validateBIC(b) }));
  const badBic = bicResults.filter((x) => !x.r.valid);
  if (carriesParties) check(bics.length > 0, `${bics.length} BICFI value(s) present`, 'no BICFI values found');
  check(badBic.length === 0, `all ${bics.length} BICFI values are structurally valid (ISO 9362)`, `invalid BICFI: ${badBic.map((x) => x.b).join(', ')}`);
  check(bicResults.every((x) => x.r.syntheticInstitution), 'every BICFI uses the synthetic institution code TEST', 'a BICFI does not use the synthetic institution code TEST');

  const ibans = extractAll(xml, 'IBAN');
  const badIban = ibans.filter((i) => !validateIBAN(i).valid);
  if (carriesParties) check(ibans.length > 0, `${ibans.length} IBAN value(s) present`, 'no IBAN values found');
  check(badIban.length === 0, `all ${ibans.length} IBAN values pass MOD 97-10 (ISO 13616)`, `invalid IBAN: ${badIban.join(', ')}`);

  const leis = extractAll(xml, 'LEI');
  if (leis.length) {
    const badLei = leis.filter((l) => !validateLEI(l).valid);
    check(badLei.length === 0, `all ${leis.length} LEI values pass ISO 17442`, `invalid LEI: ${badLei.join(', ')}`);
  }

  // Amount / currency — every ISO 20022 amount element carries Ccy="XXX".
  const currencies = [...new Set((xml.match(/Ccy="([A-Z]{3})"/g) || []).map((s) => s.replace(/Ccy="([A-Z]{3})"/, '$1')))];
  if (carriesParties) {
    const badCcy = currencies.filter((c) => !ISO_4217.has(c));
    check(currencies.length > 0 && badCcy.length === 0, `currency code(s) in ISO 4217: ${currencies.join(', ')}`, `unknown currency code: ${badCcy.join(', ')}`);
  }

  // Kind-specific structure
  if (kind === 'pain001') {
    const txCount = (xml.match(/<CdtTrfTxInf>/g) || []).length;
    const nbOtx = extractAll(xml, 'NbOfTxs').map(Number);
    check(nbOtx.length >= 1 && nbOtx.every((n) => n === txCount), `NbOfTxs (${txCount}) matches CdtTrfTxInf count`, 'NbOfTxs does not match transaction count');
    const ctrlSums = extractAll(xml, 'CtrlSum');
    const expected = sumAmounts(ctx.txs);
    check(ctrlSums.length >= 1 && ctrlSums.every((s) => s === expected), `CtrlSum equals sum of InstdAmt (${expected})`, `CtrlSum mismatch (expected ${expected}, got ${ctrlSums.join('/')})`);
    check(xml.includes('<PmtMtd>TRF</PmtMtd>'), 'PmtInf/PmtMtd = TRF', 'missing PmtMtd');
    check(xml.includes('<ChrgBr>'), 'PmtInf/ChrgBr present', 'missing ChrgBr');
  }

  if (kind === 'pacs008') {
    const uetr = extractAll(xml, 'UETR');
    check(uetr.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uetr[0]),
      'PmtId/UETR is a valid RFC 8144 UUID', `invalid UETR: ${uetr.join(', ')}`);
    check(xml.includes('<IntrBkSttlmDt>'), 'IntrBkSttlmDt present (mandatory in pacs.008.001.10)', 'missing IntrBkSttlmDt');
    check(xml.includes('<SttlmMtd>CLRG</SttlmMtd>'), 'SttlmInf/SttlmMtd = CLRG', 'missing SttlmMtd');
  }

  if (kind === 'pacs002') {
    check(xml.includes('<TxSts>PDNG</TxSts>'), 'TxSts = PDNG (no settlement asserted)', 'TxSts must be PDNG — fixture must not assert a settlement outcome');
    check(xml.includes('<OrgnlMsgNmId>'), 'OrgnlGrpInf/OrgnlMsgNmId present', 'missing OrgnlMsgNmId');
    check(!/ACSC|ACCC|ACSP|ACTC/.test(xml), 'no accepted/settled status codes present', 'document contains a settlement status code');
    check(!/AML|KYC|risk_score|sanction/i.test(xml), 'no compliance/AML/KYC assertions present', 'document contains compliance assertions');
  }

  return { message: MSG[kind].id, valid: failed.length === 0, passed, failed };
}

// ─── Fixture assembly ───────────────────────────────────────────────────────

function buildFixture(scenario) {
  const rng = mulberry32(seedFrom(scenario.id));
  const now = new Date();
  const settlementDate = isoDate(new Date(now.getTime() + 24 * 3600 * 1000));

  const txs = scenario.transactions.map((t, i) => {
    const debtor = PARTIES[t.debtor];
    const creditor = PARTIES[t.creditor];
    return {
      amount: amount(t.amount),
      debtorName: debtor.name,
      creditorName: creditor.name,
      debtorAgent: syntheticBIC(rng, PARTY_COUNTRY_TO_IBAN[debtor.country], 'T1'),
      creditorAgent: syntheticBIC(rng, PARTY_COUNTRY_TO_IBAN[creditor.country], 'T2'),
      debtorAccount: syntheticIBAN(rng, PARTY_COUNTRY_TO_IBAN[debtor.country]),
      creditorAccount: syntheticIBAN(rng, PARTY_COUNTRY_TO_IBAN[creditor.country]),
      instrId: `INSTR-${scenario.id}-${i + 1}`,
      endToEndId: `E2E-${scenario.id}-${i + 1}`,
      txId: `TX-${scenario.id}-${i + 1}`,
      uetr: uuidFromRng(rng),
    };
  });

  // LEI is generated and validated but attached only to the fixture metadata,
  // not to the payment messages (party LEIs are optional in these messages).
  const debtorLei = syntheticLEI(rng);

  const ctx = {
    msgId: `MSG-${scenario.id}-001`,
    statusMsgId: `STS-${scenario.id}-001`,
    statusId: `ST-${scenario.id}-001`,
    pmtInfId: `PMTINF-${scenario.id}-001`,
    createdAt: isoDateTime(now),
    executionDate: settlementDate,
    settlementDate,
    currency: scenario.currency,
    serviceLevel: scenario.currency === 'GBP' ? 'URGP' : 'SEPA',
    chargeBearer: 'SLEV',
    initiator: PARTIES[0].name,
    debtor: PARTIES[scenario.transactions[0].debtor],
    debtorAccount: txs[0].debtorAccount,
    debtorAgent: txs[0].debtorAgent,
    txs,
  };

  const xml = {
    pain001: buildPain001(ctx),
    pacs008: buildPacs008(ctx),
    pacs002: buildPacs002(ctx),
  };

  const validations = {
    pain001: validateMessage('pain001', xml.pain001, ctx),
    pacs008: validateMessage('pacs008', xml.pacs008, ctx),
    pacs002: validateMessage('pacs002', xml.pacs002, ctx),
  };

  return { scenario, ctx, txs, debtorLei, xml, validations };
}

// ─── Output ─────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildIndex(entries) {
  const rows = entries
    .map((e) => {
      const all = Object.values(e.validations);
      const checks = all.reduce((a, v) => a + v.passed.length, 0);
      const bad = all.reduce((a, v) => a + v.failed.length, 0);
      const status = bad === 0 ? 'STRUCTURAL VALIDATION: PASS' : `STRUCTURAL VALIDATION: FAIL (${bad})`;
      const total = e.txs.reduce((a, t) => a + Number(t.amount), 0).toFixed(2);
      return `<tr>
        <td><code>${escHtml(e.scenario.id)}</code></td>
        <td>${escHtml(e.scenario.currency)} ${escHtml(total)}</td>
        <td>${e.txs.length}</td>
        <td class="${bad === 0 ? 'ok' : 'bad'}">${escHtml(status)} <span class="muted">(${checks} checks)</span></td>
        <td class="links">
          <a href="${escHtml(e.scenario.id)}/pain.001.xml">pain.001</a>
          <a href="${escHtml(e.scenario.id)}/pacs.008.xml">pacs.008</a>
          <a href="${escHtml(e.scenario.id)}/pacs.002.xml">pacs.002</a>
          <a href="${escHtml(e.scenario.id)}/fixture.json">json</a>
        </td>
      </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ISO 20022 Test Fixtures — ${escHtml(WATERMARK)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f4f5f7; color: #2b2f36; font-size: 14px; line-height: 1.55; }
  .watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
  .watermark span { transform: rotate(-24deg); font-size: 44px; font-weight: 800; letter-spacing: 4px; color: #9aa2ad; opacity: 0.16; text-align: center; white-space: pre-line; }
  .wrap { position: relative; z-index: 1; max-width: 1040px; margin: 0 auto; padding: 40px 24px 64px; }
  .banner { background: #3a3f47; color: #f4f5f7; border-radius: 10px; padding: 16px 20px; margin-bottom: 8px; font-weight: 700; letter-spacing: 1px; }
  .banner small { display: block; font-weight: 400; letter-spacing: 0; color: #c9ced6; margin-top: 6px; }
  h1 { font-size: 22px; margin: 24px 0 6px; }
  p.lede { color: #616a76; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #eceef1; vertical-align: top; }
  th { background: #eceef1; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: #5a626d; }
  tr:last-child td { border-bottom: none; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; }
  .ok { color: #2f6b4f; font-weight: 600; }
  .bad { color: #8f3434; font-weight: 600; }
  .muted { color: #8b939e; font-weight: 400; }
  .links a { display: inline-block; margin-right: 10px; color: #35577d; text-decoration: none; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; }
  .links a:hover { text-decoration: underline; }
  footer { margin-top: 20px; color: #8b939e; font-size: 12px; }
  @media (max-width: 640px) { th:nth-child(3), td:nth-child(3) { display: none; } .watermark span { font-size: 26px; } }
</style>
</head>
<body>
<div class="watermark"><span>TEST FIXTURE
NOT A BANK RECORD</span></div>
<div class="wrap">
  <div class="banner">TEST FIXTURE — NOT A BANK RECORD<small>${escHtml(NOTICE)}</small></div>
  <h1>ISO 20022 Test Fixtures</h1>
  <p class="lede">Generated by <code>generate-iso20022-fixtures.js</code>. All identifiers are synthetic; no settlement or compliance outcome is asserted.</p>
  <table>
    <thead><tr><th>Scenario</th><th>Amount</th><th>Tx</th><th>Status</th><th>Files</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <footer>${entries.length} scenarios · pain.001.001.13 · pacs.008.001.10 · pacs.002.001.13</footer>
</div>
</body>
</html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const entries = [];
  let failures = 0;

  for (const scenario of SCENARIOS) {
    const fixture = buildFixture(scenario);
    const dir = path.join(OUT_DIR, scenario.id);
    fs.mkdirSync(dir, { recursive: true });

    const files = {
      'pain.001.xml': fixture.xml.pain001,
      'pacs.008.xml': fixture.xml.pacs008,
      'pacs.002.xml': fixture.xml.pacs002,
    };
    const digests = {};
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content, 'utf8');
      digests[name] = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    }

    const bad = Object.values(fixture.validations).reduce((a, v) => a + v.failed.length, 0);
    if (bad) failures += bad;

    fs.writeFileSync(
      path.join(dir, 'fixture.json'),
      JSON.stringify(
        {
          watermark: WATERMARK,
          notice: NOTICE,
          synthetic: true,
          generated_at: fixture.ctx.createdAt,
          scenario: {
            id: scenario.id,
            currency: scenario.currency,
            transactions: fixture.txs.map((t) => ({
              amount: t.amount,
              debtor_agent_bic: t.debtorAgent,
              debtor_account_iban: t.debtorAccount,
              creditor_agent_bic: t.creditorAgent,
              creditor_account_iban: t.creditorAccount,
              instruction_id: t.instrId,
              end_to_end_id: t.endToEndId,
              transaction_id: t.txId,
              uetr: t.uetr,
            })),
            synthetic_party_lei: fixture.debtorLei,
          },
          messages: Object.keys(files).map((name) => ({
            file: name,
            sha256: digests[name],
          })),
          validation: fixture.validations,
        },
        null,
        2
      ),
      'utf8'
    );

    entries.push(fixture);

    const checks = Object.values(fixture.validations).reduce((a, v) => a + v.passed.length, 0);
    console.log(`  ${bad === 0 ? 'PASS' : 'FAIL'}  ${scenario.id.padEnd(28)} ${checks} structural checks, ${bad} failures`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), buildIndex(entries), 'utf8');

  console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${entries.length} scenarios written to ${OUT_DIR}`);
  console.log(`Watermark applied to every artifact: "${WATERMARK}"`);
  if (failures) process.exitCode = 1;
}

main();
