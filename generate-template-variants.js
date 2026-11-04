/**
 * PrimeStack ISO 20022 — Bank-Grade Template Variants Generator
 * 
 * Generates 8 distinct professional template types so you can choose the one
 * that matches your banking scenario. Each variant has different ISO 20022
 * message structures, clearing systems, compliance fields, and routing.
 *
 * Variants:
 *   1. SWIFT_GPI_CROSSBORDER  — Cross-border GPI (MT103 equivalent)
 *   2. SEPA_INSTANT           — SEPA Instant Credit Transfer (SCT Inst)
 *   3. FEDWIRE_RTGS           — US Fedwire Real-Time Gross Settlement
 *   4. CORRESPONDENT_NOSTRO   — Correspondent Nostro/Vostro settlement
 *   5. TRADE_FINANCE_LC       — Trade Finance backed by Letter of Credit
 *   6. TREASURY_FX            — Treasury interbank with FX conversion
 *   7. BULK_PAYMENT_PAIN001   — Bulk payment initiation (pain.001)
 *   8. HIGH_VALUE_URGENT      — Urgent high-value priority settlement
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

const uuid = () => crypto.randomUUID().toUpperCase();
const sha256 = (d) => crypto.createHash('sha256').update(d, 'utf8').digest('hex');
const hmac = (d, k) => crypto.createHmac('sha256', k).update(d, 'utf8').digest('hex');
const nowISO = () => new Date().toISOString();
const fmt = (n) => Number(n).toFixed(2);
const esc = (s) => !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

const SIGN_KEY = process.env.ISO20022_SIGNING_KEY || 'primestack-iso20022-2026';

// ─── Bank Configurations ────────────────────────────────────────────────────

const BANKS = {
  TECHCOMBANK: {
    label: 'VIETNAM TECHNOLOGICAL AND COMMERCIAL JOINT-STOCK BANK (TECHCOMBANK)',
    shortName: 'TECHCOMBANK',
    bic: 'VTCBVNVX',
    branch: 'TCB HO CHI MINH',
    branchId: 'VTCBVNVX',
    country: 'VN',
    address: { street: '225-227 XO VIET NGHE TINH STREET', postCode: '700000', town: 'HO CHI MINH CITY', subDiv: 'BINH THANH', country: 'VN' },
    headOffice: '6 QUANG TRUNG, HOAN KIEM, HANOI, VIETNAM',
    phone: '+84-28-7303-6556',
    account: '19239630459986',
    accountCcy: 'USD',
    customerName: 'BEAUT UNIVERSE COMPANY LIMITED',
    customerAddr: { street: '225-227 XO VIET NGHE TINH STREET', postCode: '700000', town: 'HO CHI MINH CITY', country: 'VN' },
    customerReg: '0312994934', customerRegType: 'TXID',
    clearingSystem: 'VND-CLEAR',
    purposeCode: 'SUPP', categoryPurpose: 'SUPP',
    remittanceRef: 'INV-TCB-2026-0001',
  },
  BNI: {
    label: 'PT. BANK NEGARA INDONESIA (PERSERO) TBK',
    shortName: 'BNI',
    bic: 'BNINIDJA',
    branch: 'BNI KC MELAWAI RAYA',
    branchId: 'BNINIDJAXXX',
    country: 'ID',
    address: { street: 'JL. ISKANDARSYAH II, KEBAYORAN BARU', postCode: '12170', town: 'JAKARTA SELATAN', subDiv: 'DKI JAKARTA', country: 'ID' },
    headOffice: 'JL. JEND. SUDIRMAN KAV. 1, JAKARTA PUSAT, INDONESIA',
    phone: '+62-21-23588000',
    account: '8055775589',
    accountCcy: 'EUR',
    customerName: 'PT. RAJA AL AZHAR MINING',
    customerAddr: { street: 'CITRA GARDEN, CLUSTER DA VINCI BLOK D1 NO. 12', postCode: '70248', town: 'BANJARMASIN, KALIMANTAN SELATAN', country: 'ID' },
    customerReg: '3011210022773', customerRegType: 'TXID',
    clearingSystem: 'INDODJA722',
    purposeCode: 'BEXP', categoryPurpose: 'SUPP',
    remittanceRef: 'INV-BNI-2026-0001',
  },
  SCHWAB: {
    label: 'CHARLES SCHWAB & CO., INC.',
    shortName: 'SCHWAB',
    bic: 'SCHBUS33',
    branch: 'SCHWAB HEAD OFFICE',
    branchId: 'SCHBUS33',
    country: 'US',
    address: { street: '3000 SCHWAB WAY', postCode: '94119', town: 'SAN FRANCISCO', subDiv: 'CA', country: 'US' },
    headOffice: '3000 SCHWAB WAY, SAN FRANCISCO, CA 94119, USA',
    phone: '+1-415-627-7000',
    account: '1093-2904-8821',
    accountCcy: 'USD',
    customerName: 'PRIMESTACK HOLDINGS AG',
    customerAddr: { street: 'BAHNHOFSTRASSE 50', postCode: '8000', town: 'ZURICH', country: 'CH' },
    customerReg: 'CH-020.4.092.841-5', customerRegType: 'TXID',
    clearingSystem: 'USCH',
    purposeCode: 'S2S', categoryPurpose: 'SUPP',
    remittanceRef: 'INV-SCHWAB-2026-0001',
  },
  HSBC_HK: {
    label: 'THE HONGKONG AND SHANGHAI BANKING CORP LTD',
    shortName: 'HSBC',
    bic: 'HSBCHKHH',
    branch: 'HSBC HK MAIN',
    branchId: 'HSBCHKHH',
    country: 'HK',
    address: { street: '1 QUEENS ROAD CENTRAL', postCode: '0000', town: 'HONG KONG', subDiv: 'CENTRAL', country: 'HK' },
    headOffice: '1 QUEENS ROAD CENTRAL, HONG KONG',
    phone: '+852-2822-1818',
    account: '004-582-192-388',
    accountCcy: 'USD',
    customerName: 'PRIMESTACK ASIA PACIFIC LTD',
    customerAddr: { street: 'TOWER 1 ICC, 1 AUSTIN ROAD WEST', postCode: '0000', town: 'KOWLOON', country: 'HK' },
    customerReg: 'HK-0399818', customerRegType: 'TXID',
    clearingSystem: 'HKICL',
    purposeCode: 'SUPP', categoryPurpose: 'SUPP',
    remittanceRef: 'INV-HSBC-2026-0001',
  },
  DBS_SG: {
    label: 'DBS BANK LTD',
    shortName: 'DBS',
    bic: 'DBSSSGSG',
    branch: 'DBS MAIN BRANCH',
    branchId: 'DBSSSGSG',
    country: 'SG',
    address: { street: '12 MARINA BOULEVARD', postCode: '018982', town: 'SINGAPORE', subDiv: 'MARINA BAY', country: 'SG' },
    headOffice: '12 MARINA BOULEVARD, SINGAPORE 018982',
    phone: '+65-6878-8888',
    account: '003-904882-001',
    accountCcy: 'SGD',
    customerName: 'PRIMESTACK SINGAPORE PTE LTD',
    customerAddr: { street: '8 MARINA VIEW', postCode: '018960', town: 'SINGAPORE', country: 'SG' },
    customerReg: '201712345X', customerRegType: 'TXID',
    clearingSystem: 'MAS-EPS',
    purposeCode: 'SUPP', categoryPurpose: 'SUPP',
    remittanceRef: 'INV-DBS-2026-0001',
  },
};

const SENDER = {
  label: 'LCB SOUTH SUDAN CORE BANKING SYSTEM',
  shortName: 'LCB CORE',
  bic: 'LICMSSJB',
  branch: 'LCB HEAD OFFICE JUBA',
  branchId: 'LICMSSJB',
  country: 'SS',
  address: { street: 'Juba Main Banking Boulevard', building: '1', postCode: '0001', town: 'JUBA', subDiv: 'CENTRAL EQUATORIA', country: 'SS' },
  account: '0000-0100-0000-0000',
  accountCcy: 'USD',
  customerName: 'LCB SAMPLE DEBTOR CORP LIMITED',
  customerAddr: { street: 'Financial Boulevard', building: '100', postCode: '10001', town: 'Commercial City', country: 'US' },
};

// ─── Variant Definitions ─────────────────────────────────────────────────────

const VARIANTS = {
  // 1. SWIFT GPI Cross-Border (MT103 equivalent)
  SWIFT_GPI_CROSSBORDER: {
    title: 'SWIFT GPI Cross-Border Credit Transfer',
    description: 'ISO 20022 CBPR+ compliant cross-border payment with full SWIFT GPI tracking, UETR, correspondent chain, regulatory reporting, and charge bearer breakdown. Direct equivalent of MT103+MT202 cover.',
    icon: '🌍',
    messages: ['pacs.008.001.10', 'pacs.009.001.10', 'pacs.002.001.12', 'camt.053.001.10'],
    clearingSystem: 'SWIFT',
    serviceLevel: 'SDVA',
    chargeBearer: 'SHAR',
    priority: 'NORM',
    deliveryMode: 'STORE_AND_FORWARD',
    correspondentChain: true,
    regulatoryReporting: true,
    gpiTracking: true,
    uniqueFields: ['UETR', 'IntrmyAgt1/2/3', 'RgltryRptg', 'ChrgBrInf', 'SplmtryData/GPI'],
  },

  // 2. SEPA Instant Credit Transfer
  SEPA_INSTANT: {
    title: 'SEPA Instant Credit Transfer (SCT Inst)',
    description: 'Eurozone instant payment via SCT Inst scheme. Settlement in seconds through TARGET Instant Payment Settlement (TIPS). IBAN mandatory, SHA charge bearer, max €100,000 per transaction.',
    icon: '⚡',
    messages: ['pacs.008.001.10', 'pacs.002.001.12', 'camt.053.001.10'],
    clearingSystem: 'TIPS',
    serviceLevel: 'SDVA',
    chargeBearer: 'SHAR',
    priority: 'URGT',
    deliveryMode: 'REAL_TIME',
    correspondentChain: false,
    regulatoryReporting: false,
    gpiTracking: false,
    sepaSpecific: true,
    instantSettlement: true,
    maxAmount: 100000,
    currency: 'EUR',
    uniqueFields: ['SvcLvl/SDVA', 'InstgAgt/InstdAgt (TIPS)', 'IBAN', 'No correspondent chain', 'TIPS clearing'],
  },

  // 3. Fedwire RTGS
  FEDWIRE_RTGS: {
    title: 'US Fedwire Real-Time Gross Settlement',
    description: 'US domestic high-value payment via Federal Reserve Fedwire. Same-day settlement, irrevocable, final. US dollar only, Fed routing numbers, FED clearing system.',
    icon: '🇺🇸',
    messages: ['pacs.008.001.10', 'pacs.009.001.10', 'pacs.002.001.12', 'camt.053.001.10'],
    clearingSystem: 'FED',
    serviceLevel: 'SDVA',
    chargeBearer: 'OUR',
    priority: 'HIGH',
    deliveryMode: 'REAL_TIME',
    correspondentChain: true,
    regulatoryReporting: true,
    gpiTracking: false,
    fedwireSpecific: true,
    currency: 'USD',
    uniqueFields: ['FedRoutingNumber', 'FRB_District', 'Same_Day_Settlement', 'IAT_Flag'],
  },

  // 4. Correspondent Nostro/Vostro
  CORRESPONDENT_NOSTRO: {
    title: 'Correspondent Nostro/Vostro Settlement',
    description: 'Institution-to-institution settlement through correspondent nostro/vostro accounts. Full multi-bank chain with cover payment, SWIFT messaging, and reconciliation.',
    icon: '🏦',
    messages: ['pacs.009.001.10', 'pacs.008.001.10', 'pacs.002.001.12', 'camt.053.001.10', 'camt.029.001.11'],
    clearingSystem: 'SWIFT',
    serviceLevel: 'SDVA',
    chargeBearer: 'SHAR',
    priority: 'NORM',
    deliveryMode: 'STORE_AND_FORWARD',
    correspondentChain: true,
    regulatoryReporting: true,
    gpiTracking: true,
    nostroVostro: true,
    uniqueFields: ['NostroAcct', 'VostroAcct', 'CoverPayment', 'ReconciliationRef', 'camt.029'],
  },

  // 5. Trade Finance L/C Backed
  TRADE_FINANCE_LC: {
    title: 'Trade Finance — Letter of Credit Backed Payment',
    description: 'Payment backed by Documentary Letter of Credit (L/C). Includes L/C reference, issuing bank, confirming bank, trade docs, BPO reference. Full trade compliance with UCP 600.',
    icon: '📋',
    messages: ['pacs.008.001.10', 'pacs.009.001.10', 'pacs.002.001.12', 'camt.053.001.10'],
    clearingSystem: 'SWIFT',
    serviceLevel: 'URGP',
    chargeBearer: 'OUR',
    priority: 'NORM',
    deliveryMode: 'STORE_AND_FORWARD',
    correspondentChain: true,
    regulatoryReporting: true,
    gpiTracking: true,
    tradeFinance: true,
    uniqueFields: ['LC_Reference', 'IssuingBank_BIC', 'ConfirmingBank_BIC', 'UCP600', 'BPO_Reference', 'TradeDocs'],
  },

  // 6. Treasury Interbank FX
  TREASURY_FX: {
    title: 'Treasury Interbank with FX Conversion',
    description: 'Treasury desk interbank transfer with currency conversion. Includes FX rate, counter-value amount, dealing reference, value date, settlement via CLS where applicable.',
    icon: '💱',
    messages: ['pacs.008.001.10', 'pacs.009.001.10', 'pacs.002.001.12', 'camt.053.001.10'],
    clearingSystem: 'CLS',
    serviceLevel: 'SDVA',
    chargeBearer: 'SHAR',
    priority: 'HIGH',
    deliveryMode: 'REAL_TIME',
    correspondentChain: true,
    regulatoryReporting: true,
    gpiTracking: false,
    fxConversion: true,
    uniqueFields: ['XchgRate', 'CntrValAmt', 'DealRef', 'CLS_Settlement', 'NDF_Flag', 'ValueDate_Forward'],
  },

  // 7. Bulk Payment Initiation (pain.001)
  BULK_PAYMENT_PAIN001: {
    title: 'Bulk Payment Initiation (pain.001)',
    description: 'Customer-to-bank payment initiation for multiple beneficiaries in a single batch. Uses pain.001.001.13 schema with batch booking indicator, checksums, and per-transaction details.',
    icon: '📦',
    messages: ['pain.001.001.13', 'pain.002.001.15', 'camt.053.001.10'],
    clearingSystem: 'SWIFT',
    serviceLevel: 'GABA',
    chargeBearer: 'SHAR',
    priority: 'NORM',
    deliveryMode: 'STORE_AND_FORWARD',
    correspondentChain: false,
    regulatoryReporting: false,
    gpiTracking: false,
    bulkPayment: true,
    uniqueFields: ['PmtInf (batch)', 'NbOfTxs (multi)', 'CtrlSum', 'BtchBookg', 'ReqdExctnDt', 'pain.001.001.13'],
  },

  // 8. High-Value Urgent
  HIGH_VALUE_URGENT: {
    title: 'High-Value Urgent Settlement',
    description: 'Priority high-value payment requiring immediate settlement. URGT priority, immediate execution, real-time confirmation. Typically used for time-critical treasury, margin calls, or regulatory deposits.',
    icon: '🚀',
    messages: ['pacs.008.001.10', 'pacs.009.001.10', 'pacs.002.001.12', 'camt.053.001.10'],
    clearingSystem: 'SWIFT',
    serviceLevel: 'URGP',
    chargeBearer: 'OUR',
    priority: 'URGT',
    deliveryMode: 'REAL_TIME',
    correspondentChain: true,
    regulatoryReporting: true,
    gpiTracking: true,
    urgent: true,
    uniqueFields: ['SttlmPrty/URGT', 'SvcLvl/URGP', 'ImmediateExecution', 'RealTimeConfirm', 'PriorityAlert'],
  },
};

// ─── XML Builders ───────────────────────────────────────────────────────────

function buildPostalAddress(addr, indent = '          ') {
  const parts = [];
  if (addr.street) parts.push(`${indent}<StrtNm>${esc(addr.street)}</StrtNm>`);
  if (addr.building) parts.push(`${indent}<BldgNb>${esc(addr.building)}</BldgNb>`);
  if (addr.postCode) parts.push(`${indent}<PstCd>${esc(addr.postCode)}</PstCd>`);
  if (addr.town) parts.push(`${indent}<TwnNm>${esc(addr.town)}</TwnNm>`);
  if (addr.subDiv) parts.push(`${indent}<CtrySubDvsn>${esc(addr.subDiv)}</CtrySubDvsn>`);
  if (addr.country) parts.push(`${indent}<Ctry>${esc(addr.country)}</Ctry>`);
  return parts.join('\n');
}

function buildFinInstnId(bic, name, addr, branchId, branchName, indent = '        ') {
  let xml = `${indent}<FinInstnId>\n`;
  xml += `${indent}  <BICFI>${bic}</BICFI>\n`;
  if (name) xml += `${indent}  <Nm>${esc(name)}</Nm>\n`;
  if (addr) {
    xml += `${indent}  <PstlAdr>\n`;
    xml += buildPostalAddress(addr, `${indent}    `) + '\n';
    xml += `${indent}  </PstlAdr>\n`;
  }
  xml += `${indent}</FinInstnId>`;
  if (branchId) {
    xml += `\n${indent}<BrnchId>\n`;
    xml += `${indent}  <Id>${branchId}</Id>\n`;
    if (branchName) xml += `${indent}  <Nm>${esc(branchName)}</Nm>\n`;
    xml += `${indent}</BrnchId>`;
  }
  return xml;
}

function buildCorrespondentChain(chain, indent = '      ') {
  let xml = '';
  if (chain.intrmyAgt1) {
    xml += `${indent}<IntrmyAgt1>\n`;
    xml += `${indent}  <FinInstnId>\n`;
    xml += `${indent}    <BICFI>${chain.intrmyAgt1.bic}</BICFI>\n`;
    xml += `${indent}    <Nm>${esc(chain.intrmyAgt1.name)}</Nm>\n`;
    if (chain.intrmyAgt1.clearing) {
      xml += `${indent}    <ClrSysMmbId>\n`;
      xml += `${indent}      <ClrSysId><Cd>${chain.intrmyAgt1.clearing}</Cd></ClrSysId>\n`;
      xml += `${indent}      <MmbId>${chain.intrmyAgt1.account}</MmbId>\n`;
      xml += `${indent}    </ClrSysMmbId>\n`;
    }
    xml += `${indent}  </FinInstnId>\n`;
    xml += `${indent}</IntrmyAgt1>\n`;
  }
  if (chain.intrmyAgt2) {
    xml += `${indent}<IntrmyAgt2>\n`;
    xml += `${indent}  <FinInstnId>\n`;
    xml += `${indent}    <BICFI>${chain.intrmyAgt2.bic}</BICFI>\n`;
    xml += `${indent}    <Nm>${esc(chain.intrmyAgt2.name)}</Nm>\n`;
    if (chain.intrmyAgt2.clearing) {
      xml += `${indent}    <ClrSysMmbId>\n`;
      xml += `${indent}      <ClrSysId><Cd>${chain.intrmyAgt2.clearing}</Cd></ClrSysId>\n`;
      xml += `${indent}      <MmbId>${chain.intrmyAgt2.account}</MmbId>\n`;
      xml += `${indent}    </ClrSysMmbId>\n`;
    }
    xml += `${indent}  </FinInstnId>\n`;
    xml += `${indent}</IntrmyAgt2>\n`;
  }
  return xml;
}

// ─── pacs.008 Builder (parameterized by variant) ───────────────────────────

function buildPacs008(bank, variant, txn, chain) {
  const v = variant;
  const ccy = v.currency || bank.accountCcy;
  const amt = fmt(txn.amount);
  const uetr = txn.uetr;
  const vd = txn.valueDate;
  const cre = txn.creDtTm;
  const msgId = `PACS008-${txn.batchId}`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${cre}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <SttlmAcct>
          <Id><Othr><Id>${chain?.intrmyAgt1?.account || 'NOSTRO-001'}</Id></Othr></Id>
          <Ccy>${ccy}</Ccy>
        </SttlmAcct>
        <ClrSys><Cd>${v.clearingSystem}</Cd></ClrSys>
      </SttlmInf>
      <InstgAgt><FinInstnId><BICFI>${SENDER.bic}</BICFI></FinInstnId></InstgAgt>
      <InstdAgt><FinInstnId><BICFI>${bank.bic}</BICFI></FinInstnId></InstdAgt>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${txn.instructionId}</InstrId>
        <EndToEndId>${txn.endToEndId}</EndToEndId>
        <TxId>${txn.txId}</TxId>
        <UETR>${uetr}</UETR>`;

  // SEPA: add ClrSysRef with TIPS
  if (v.sepaSpecific) {
    xml += `
        <ClrSysRef><ClrSysId><Cd>TIPS</Cd></ClrSysId><EndToEndId>${txn.endToEndId}</EndToEndId></ClrSysRef>`;
  }

  xml += `
      </PmtId>
      <IntrBkSttlmAmt Ccy="${ccy}">${amt}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${vd}</IntrBkSttlmDt>
      <SttlmPrty>${v.priority}</SttlmPrty>`;

  // SEPA instant settlement timing
  if (v.instantSettlement) {
    xml += `
      <SttlmTmInd>+</SttlmTmInd>`;
  }

  // FX conversion
  if (v.fxConversion) {
    xml += `
      <IntrBkSttlmAmt Ccy="${ccy}">${amt}</IntrBkSttlmAmt>
      <EqvtAmt>
        <InstdAmt Ccy="${txn.fxTargetCcy || 'EUR'}">${fmt(txn.amount * (txn.fxRate || 0.92))}</InstdAmt>
        <XchgRate>${txn.fxRate || '0.92000'}</XchgRate>
      </EqvtAmt>`;
  }

  xml += `
      <ChrgBr>${v.chargeBearer}</ChrgBr>`;

  // Charge bearer info for cross-border
  if (v.correspondentChain && !v.sepaSpecific) {
    xml += `
      <ChrgBrInf>
        <ChrgBr>${v.chargeBearer}</ChrgBr>
        <ChrgsAmt Ccy="${ccy}">${fmt(txn.amount * 0.001)}</ChrgsAmt>
        <ChrgsAcct>
          <Id><Othr><Id>CHRGES-${SENDER.bic}</Id></Othr></Id>
          <Ccy>${ccy}</Ccy>
        </ChrgsAcct>
      </ChrgBrInf>`;
  }

  // Debtor
  xml += `
      <Dbtr>
        <Nm>${esc(SENDER.customerName)}</Nm>
        <PstlAdr>
          <AdrLine>${esc(`${SENDER.customerAddr.street}, ${SENDER.customerAddr.town}, ${SENDER.customerAddr.country}`)}</AdrLine>
${buildPostalAddress(SENDER.customerAddr, '          ')}
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id><Othr><Id>${SENDER.account}</Id></Othr></Id>
        <Ccy>${SENDER.accountCcy}</Ccy>
      </DbtrAcct>
      <DbtrAgt>
${buildFinInstnId(SENDER.bic, SENDER.shortName, SENDER.address, SENDER.branchId, SENDER.branch, '        ')}
      </DbtrAgt>`;

  // Correspondent chain
  if (v.correspondentChain) {
    xml += '\n' + buildCorrespondentChain(chain, '      ');
  }

  // Creditor agent
  xml += `
      <CdtrAgt>
${buildFinInstnId(bank.bic, bank.label, bank.address, bank.branchId, bank.branch, '        ')}
      </CdtrAgt>`;

  // Creditor
  xml += `
      <Cdtr>
        <Nm>${esc(bank.customerName)}</Nm>
        <PstlAdr>
          <AdrLine>${esc(`${bank.customerAddr.street}, ${bank.customerAddr.town}, ${bank.customerAddr.country}`)}</AdrLine>
${buildPostalAddress(bank.customerAddr, '          ')}
        </PstlAdr>
        <Id><OrgId><Othr><Id>${bank.customerReg}</Id><SchmeNm><Cd>${bank.customerRegType}</Cd></SchmeNm></Othr></OrgId></Id>
      </Cdtr>
      <CdtrAcct>
        <Id><Othr><Id>${bank.account}</Id></Othr></Id>
        <Ccy>${bank.accountCcy}</Ccy>
        <Nm>${esc(bank.customerName)}</Nm>
      </CdtrAcct>`;

  // Service level
  xml += `
      <Purp><Cd>${bank.purposeCode}</Cd></Purp>
      <CtgyPurp><Cd>${bank.categoryPurpose}</Cd></CtgyPurp>`;

  // Trade finance fields
  if (v.tradeFinance) {
    xml += `
      <RgltryRptg>
        <Dtls>
          <Tp>CREDIT</Tp>
          <Dt><Dt>${vd}</Dt></Dt>
          <Ctry>${SENDER.country}</Ctry>
          <Cd>C001</Cd>
          <Amt Ccy="${ccy}">${amt}</Amt>
        </Dtls>
      </RgltryRptg>
      <SplmtryData>
        <Envlp>
          <Nm>TradeFinance</Nm>
          <Val>L/C Ref: ${txn.lcRef || 'LC-2026-0001'} | Issuing Bank: ${SENDER.bic} | Confirming Bank: ${chain?.intrmyAgt1?.bic || 'CHASUS33'} | UCP600 | BPO Ref: ${txn.bpoRef || 'BPO-2026-0001'}</Val>
        </Envlp>
      </SplmtryData>`;
  } else if (v.regulatoryReporting) {
    xml += `
      <RgltryRptg>
        <Dtls>
          <Tp>CREDIT</Tp>
          <Dt><Dt>${vd}</Dt></Dt>
          <Ctry>${SENDER.country}</Ctry>
          <Cd>C001</Cd>
          <Amt Ccy="${ccy}">${amt}</Amt>
        </Dtls>
        <Dtls>
          <Tp>DECLARE</Tp>
          <Dt><Dt>${vd}</Dt></Dt>
          <Ctry>${bank.country}</Ctry>
          <Cd>C002</Cd>
          <Inf>${esc(`Cross-border payment to ${bank.shortName} — ${bank.country}`)}</Inf>
        </Dtls>
      </RgltryRptg>`;
  }

  // Structured remittance
  xml += `
      <RmtInf>
        <Strd>
          <RfrdDocInf>
            <TpCdOrPrtry><Cd>CINV</Cd></TpCdOrPrtry>
            <Ref>${bank.remittanceRef}</Ref>
            <RltdDt>${vd}</RltdDt>
          </RfrdDocInf>
        </Strd>
        <Ustrd>${esc(`PAYMENT ${bank.shortName} ${bank.country} UETR:${uetr} REF:${bank.remittanceRef}`)}</Ustrd>
      </RmtInf>`;

  // GPI tracking
  if (v.gpiTracking) {
    xml += `
      <SplmtryData>
        <Envlp>
          <Nm>GPI_TrackingRef</Nm>
          <Val>${uetr}</Val>
        </Envlp>
      </SplmtryData>`;
  }

  // FX dealing reference
  if (v.fxConversion) {
    xml += `
      <SplmtryData>
        <Envlp>
          <Nm>FX_DealRef</Nm>
          <Val>${txn.dealRef || 'FX-2026-0001'} | Rate:${txn.fxRate || '0.92000'} | CLS:${txn.clsSettlement ? 'YES' : 'NO'}</Val>
        </Envlp>
      </SplmtryData>`;
  }

  // Urgent alert
  if (v.urgent) {
    xml += `
      <SplmtryData>
        <Envlp>
          <Nm>UrgentPaymentAlert</Nm>
          <Val>PRIORITY=URGT | EXECUTION=IMMEDIATE | CONFIRM=REALTIME | Alert sent to both institutions</Val>
        </Envlp>
      </SplmtryData>`;
  }

  xml += `
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

  return xml;
}

// ─── pacs.009 Builder ───────────────────────────────────────────────────────

function buildPacs009(bank, variant, txn, chain) {
  const v = variant;
  const ccy = v.currency || bank.accountCcy;
  const amt = fmt(txn.amount);
  const uetr = txn.uetr;
  const msgId = `PACS009-${txn.batchId}`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.009.001.10">
  <FICdtTrf>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${txn.creDtTm}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <SttlmAcct>
          <Id><Othr><Id>${chain?.intrmyAgt1?.account || 'NOSTRO-001'}</Id></Othr></Id>
          <Ccy>${ccy}</Ccy>
        </SttlmAcct>
        <ClrSys><Cd>${v.clearingSystem}</Cd></ClrSys>
      </SttlmInf>
      <InstgAgt><FinInstnId><BICFI>${SENDER.bic}</BICFI><Nm>${esc(SENDER.shortName)}</Nm></FinInstnId></InstgAgt>
      <InstdAgt><FinInstnId><BICFI>${bank.bic}</BICFI><Nm>${esc(bank.shortName)}</Nm></FinInstnId></InstdAgt>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${txn.instructionId}</InstrId>
        <EndToEndId>${txn.endToEndId}</EndToEndId>
        <TxId>${txn.txId}</TxId>
        <UETR>${uetr}</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${ccy}">${amt}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${txn.valueDate}</IntrBkSttlmDt>
      <SttlmPrty>${v.priority}</SttlmPrty>
      <ChrgBr>${v.chargeBearer}</ChrgBr>`;

  // Nostro/Vostro account info
  if (v.nostroVostro) {
    xml += `
      <SplmtryData>
        <Envlp>
          <Nm>NostroVostro</Nm>
          <Val>Nostro:${chain?.intrmyAgt1?.account || 'N/A'} | Vostro:${bank.account} | CoverRef:COVER-${txn.batchId} | ReconRef:RECON-${txn.batchId}</Val>
        </Envlp>
      </SplmtryData>`;
  }

  // Correspondent chain
  if (v.correspondentChain && chain) {
    xml += '\n' + buildCorrespondentChain(chain, '      ');
  }

  xml += `
      <Dbtr>
        <FinInstnId>
          <BICFI>${SENDER.bic}</BICFI>
          <Nm>${esc(SENDER.shortName)}</Nm>
        </FinInstnId>
      </Dbtr>
      <Cdtr>
        <FinInstnId>
          <BICFI>${bank.bic}</BICFI>
          <Nm>${esc(bank.shortName)}</Nm>
        </FinInstnId>
      </Cdtr>`;

  // Trade finance
  if (v.tradeFinance) {
    xml += `
      <SplmtryData>
        <Envlp>
          <Nm>TradeFinance</Nm>
          <Val>L/C Ref: ${txn.lcRef || 'LC-2026-0001'} | UCP600 | BPO Ref: ${txn.bpoRef || 'BPO-2026-0001'}</Val>
        </Envlp>
      </SplmtryData>`;
  }

  // FX
  if (v.fxConversion) {
    xml += `
      <SplmtryData>
        <Envlp>
          <Nm>FX_DealRef</Nm>
          <Val>${txn.dealRef || 'FX-2026-0001'} | Rate:${txn.fxRate || '0.92000'} | CLS:${txn.clsSettlement ? 'YES' : 'NO'}</Val>
        </Envlp>
      </SplmtryData>`;
  }

  xml += `
      <Purp><Cd>${bank.purposeCode}</Cd></Purp>
      <RmtInf>
        <Ustrd>${esc(`INSTITUTION TRANSFER ${bank.shortName} UETR:${uetr} ${bank.remittanceRef}`)}</Ustrd>
      </RmtInf>`;

  if (v.gpiTracking) {
    xml += `
      <SplmtryData>
        <Envlp><Nm>GPI_TrackingRef</Nm><Val>${uetr}</Val></Envlp>
      </SplmtryData>`;
  }

  xml += `
    </CdtTrfTxInf>
  </FICdtTrf>
</Document>`;

  return xml;
}

// ─── pacs.002 Builder ───────────────────────────────────────────────────────

function buildPacs002(bank, variant, txn) {
  const v = variant;
  const ccy = v.currency || bank.accountCcy;
  const amt = fmt(txn.amount);
  const msgId = `PACS002-${txn.batchId}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.12">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${txn.creDtTm}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <InstgAgt><FinInstnId><BICFI>${bank.bic}</BICFI></FinInstnId></InstgAgt>
      <InstdAgt><FinInstnId><BICFI>${SENDER.bic}</BICFI></FinInstnId></InstdAgt>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlGrpInf><OrgnlMsgId>PACS008-${txn.batchId}</OrgnlMsgId></OrgnlGrpInf>
      <OrgnlTxId>${txn.txId}</OrgnlTxId>
      <OrgnlInstrId>${txn.instructionId}</OrgnlInstrId>
      <OrgnlEndToEndId>${txn.endToEndId}</OrgnlEndToEndId>
      <OrgnlUETR>${txn.uetr}</OrgnlUETR>
      <TxSts>ACCC</TxSts>
      <StsRsnInf>
        <Rsn><Cd>G000</Cd></Rsn>
        <AddtlInf>Transaction accepted and settled — clear funds${v.urgent ? ' — URGENT PRIORITY' : ''}</AddtlInf>
      </StsRsnInf>
      <AccptncDtTm>${txn.creDtTm}</AccptncDtTm>
      <OrgnlTxRef>
        <Amt><IntrBkSttlmAmt Ccy="${ccy}">${amt}</IntrBkSttlmAmt></Amt>
        <IntrBkSttlmDt>${txn.valueDate}</IntrBkSttlmDt>
        <SttlmPrty>${v.priority}</SttlmPrty>
        <PmtTpInf>
          <ClrChanl>${v.instantSettlement ? 'RTGS' : 'STANDARD'}</ClrChanl>
          <SvcLvl><Cd>${v.serviceLevel}</Cd></SvcLvl>
          <CtgyPurp><Cd>${bank.categoryPurpose}</Cd></CtgyPurp>
        </PmtTpInf>
        <DbtrAgt><FinInstnId><BICFI>${SENDER.bic}</BICFI></FinInstnId></DbtrAgt>
        <CdtrAgt><FinInstnId><BICFI>${bank.bic}</BICFI></FinInstnId></CdtrAgt>
        <Cdtr><Nm>${esc(bank.customerName)}</Nm></Cdtr>
        <CdtrAcct>
          <Id><Othr><Id>${bank.account}</Id></Othr></Id>
          <Ccy>${bank.accountCcy}</Ccy>
        </CdtrAcct>
      </OrgnlTxRef>
${v.gpiTracking ? `      <SplmtryData>\n        <Envlp><Nm>GPI_TrackingRef</Nm><Val>${txn.uetr}</Val></Envlp>\n      </SplmtryData>` : ''}
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`;
}

// ─── camt.053 Builder ───────────────────────────────────────────────────────

function buildCamt053(bank, variant, txn, chain) {
  const v = variant;
  const ccy = v.currency || bank.accountCcy;
  const amt = fmt(txn.amount);
  const opn = fmt(txn.amount * 5);
  const cls = fmt(txn.amount * 4);
  const msgId = `CAMT053-${txn.batchId}`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.10">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${txn.creDtTm}</CreDtTm>
      <MsgRcpt>
        <Nm>${esc(SENDER.shortName)}</Nm>
        <Id><OrgId><Othr><Id>${SENDER.bic}</Id></Othr></OrgId></Id>
      </MsgRcpt>
    </GrpHdr>
    <Stmt>
      <Id>STMT-${txn.batchId}</Id>
      <ElctrncSeqNb>1</ElctrncSeqNb>
      <CreDtTm>${txn.creDtTm}</CreDtTm>
      <FrToDt>
        <FrDtTm>${txn.valueDate}T00:00:00Z</FrDtTm>
        <ToDtTm>${txn.valueDate}T23:59:59Z</ToDtTm>
      </FrToDt>
      <Acct>
        <Id><Othr><Id>${SENDER.account}</Id></Othr></Id>
        <Ccy>${ccy}</Ccy>
        <Ownr><Nm>${esc(SENDER.shortName)}</Nm></Ownr>
        <Svcr><FinInstnId><BICFI>${chain?.intrmyAgt1?.bic || 'CHASUS33'}</BICFI></FinInstnId></Svcr>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="${ccy}">${opn}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>${txn.valueDate}</Dt></Dt>
      </Bal>
      <Ntry>
        <NtryRef>ENTRY-${txn.batchId}-001</NtryRef>
        <Amt Ccy="${ccy}">${amt}</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <RvslInd>false</RvslInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>${txn.valueDate}</Dt></BookgDt>
        <ValDt><Dt>${txn.valueDate}</Dt></ValDt>
        <AcctSvcrRef>ASR-${txn.batchId}-001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs>
              <InstrId>${txn.instructionId}</InstrId>
              <EndToEndId>${txn.endToEndId}</EndToEndId>
              <TxId>${txn.txId}</TxId>
              <UETR>${txn.uetr}</UETR>
              <AcctSvcrRef>ASR-${txn.batchId}-001</AcctSvcrRef>
            </Refs>
            <Amt Ccy="${ccy}">${amt}</Amt>
            <CdtDbtInd>DBIT</CdtDbtInd>`;

  // FX details in statement
  if (v.fxConversion) {
    xml += `
            <AmtDtls>
              <TxAmt><Amt Ccy="${ccy}">${amt}</Amt></TxAmt>
              <CntrValAmt>
                <SrcCcy>${ccy}</SrcCcy>
                <TgtCcy>${txn.fxTargetCcy || 'EUR'}</TgtCcy>
                <XchgRate>${txn.fxRate || '0.92000'}</XchgRate>
              </CntrValAmt>
            </AmtDtls>`;
  } else {
    xml += `
            <AmtDtls>
              <TxAmt><Amt Ccy="${ccy}">${amt}</Amt></TxAmt>
            </AmtDtls>`;
  }

  xml += `
            <BkTxCd>
              <Domn><Cd>PMNT</Cd><Fmly><Cd>XDCL</Cd><SubFmlyCd>XBCR</SubFmlyCd></Fmly></Domn>
            </BkTxCd>
            <RltdPties>
              <Dbtr><Nm>${esc(SENDER.customerName)}</Nm></Dbtr>
              <DbtrAcct><Id><Othr><Id>${SENDER.account}</Id></Othr></Id></DbtrAcct>
              <Cdtr><Nm>${esc(bank.customerName)}</Nm></Cdtr>
              <CdtrAcct><Id><Othr><Id>${bank.account}</Id></Othr></Id></CdtrAcct>
            </RltdPties>
            <RltdAgts>
              <DbtrAgt><FinInstnId><BICFI>${SENDER.bic}</BICFI></FinInstnId></DbtrAgt>
              <CdtrAgt><FinInstnId><BICFI>${bank.bic}</BICFI></FinInstnId></CdtrAgt>
            </RltdAgts>
            <RmtInf>
              <Ustrd>${esc(`PAYMENT ${bank.shortName} UETR:${txn.uetr} ${bank.remittanceRef}`)}</Ustrd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="${ccy}">${cls}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>${txn.valueDate}</Dt></Dt>
      </Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

  return xml;
}

// ─── camt.029 Builder ───────────────────────────────────────────────────────

function buildCamt029(bank, variant, txn) {
  const ccy = variant.currency || bank.accountCcy;
  const amt = fmt(txn.amount);
  const msgId = `CAMT029-${txn.batchId}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.029.001.11">
  <RsltnOfInvstgtn>
    <Assgnmt>
      <Id>${msgId}</Id>
      <Assgnr>
        <Pty>
          <Nm>${esc(SENDER.shortName)}</Nm>
          <Id><OrgId><AnyBIC>${SENDER.bic}</AnyBIC></OrgId></Id>
        </Pty>
      </Assgnr>
      <Assgne>
        <Agt><FinInstnId><BICFI>${bank.bic}</BICFI></FinInstnId></Agt>
      </Assgne>
      <CreDtTm>${txn.creDtTm}</CreDtTm>
    </Assgnmt>
    <Sts>RESOLVED</Sts>
    <InvstgtnRslt>
      <Tx>
        <TxId>${txn.txId}</TxId>
        <EndToEndId>${txn.endToEndId}</EndToEndId>
        <UETR>${txn.uetr}</UETR>
        <Amt Ccy="${ccy}">${amt}</Amt>
        <CdtrAgt><FinInstnId><BICFI>${bank.bic}</BICFI></FinInstnId></CdtrAgt>
        <Cdtr>
          <Nm>${esc(bank.customerName)}</Nm>
          <Acct><Id><Othr><Id>${bank.account}</Id></Othr></Id></Acct>
        </Cdtr>
      </Tx>
      <Rsltn><Cd>COMP</Cd><Inf>Investigation completed — payment confirmed settled</Inf></Rsltn>
    </InvstgtnRslt>
  </RsltnOfInvstgtn>
</Document>`;
}

// ─── pain.001 Builder (Bulk Payment) ────────────────────────────────────────

function buildPain001(bank, variant, txn) {
  const ccy = variant.currency || bank.accountCcy;
  const amt = fmt(txn.amount);
  const ctrlSum = fmt(txn.amount * 3); // 3 transactions in batch
  const msgId = `PAIN001-${txn.batchId}`;

  // Build 3 individual credit transfer transactions
  let txs = '';
  const beneficiaries = [
    { name: bank.customerName, acct: bank.account, amt: fmt(txn.amount), e2e: txn.endToEndId },
    { name: `${bank.shortName} BENEFICIARY 2`, acct: `${bank.account}-002`, amt: fmt(txn.amount * 0.5), e2e: `${txn.endToEndId}-02` },
    { name: `${bank.shortName} BENEFICIARY 3`, acct: `${bank.account}-003`, amt: fmt(txn.amount * 1.5), e2e: `${txn.endToEndId}-03` },
  ];

  for (const [i, ben] of beneficiaries.entries()) {
    txs += `
        <CdtTrfTxInf>
          <PmtId>
            <InstrId>${txn.instructionId}-${String(i + 1).padStart(2, '0')}</InstrId>
            <EndToEndId>${ben.e2e}</EndToEndId>
            <TxId>${txn.txId}-${String(i + 1).padStart(2, '0')}</TxId>
            <UETR>${uuid()}</UETR>
          </PmtId>
          <Amt>
            <InstdAmt Ccy="${ccy}">${ben.amt}</InstdAmt>
          </Amt>
          <ChrgBr>${variant.chargeBearer}</ChrgBr>
          <CdtrAgt>
            <FinInstnId>
              <BICFI>${bank.bic}</BICFI>
              <Nm>${esc(bank.shortName)}</Nm>
            </FinInstnId>
          </CdtrAgt>
          <Cdtr>
            <Nm>${esc(ben.name)}</Nm>
            <PstlAdr>
              <Ctry>${bank.country}</Ctry>
            </PstlAdr>
          </Cdtr>
          <CdtrAcct>
            <Id><Othr><Id>${ben.acct}</Id></Othr></Id>
            <Ccy>${ccy}</Ccy>
          </CdtrAcct>
          <RmtInf>
            <Ustrd>${esc(`BULK PAYMENT ${i + 1}/3 — ${bank.shortName} — ${ben.e2e}`)}</Ustrd>
          </RmtInf>
        </CdtTrfTxInf>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.13">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${txn.creDtTm}</CreDtTm>
      <NbOfTxs>3</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${esc(SENDER.shortName)}</Nm>
        <Id><OrgId><Othr><Id>${SENDER.bic}</Id></Othr></OrgId></Id>
      </InitgPty>
      <FwdgAgt>
        <FinInstnId><BICFI>${SENDER.bic}</BICFI></FinInstnId>
      </FwdgAgt>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMTINF-${txn.batchId}-001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <ReqdExctnDt>${txn.valueDate}</ReqdExctnDt>
      <NbOfTxs>3</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>${variant.serviceLevel}</Cd></SvcLvl>
        <CtgyPurp><Cd>${bank.categoryPurpose}</Cd></CtgyPurp>
      </PmtTpInf>
      <Dbtr>
        <Nm>${esc(SENDER.shortName)}</Nm>
        <PstlAdr>
          <StrtNm>${esc(SENDER.address.street)}</StrtNm>
          <TwnNm>${esc(SENDER.address.town)}</TwnNm>
          <Ctry>${SENDER.country}</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id><Othr><Id>${SENDER.account}</Id></Othr></Id>
        <Ccy>${ccy}</Ccy>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId><BICFI>${SENDER.bic}</BICFI></FinInstnId>
      </DbtrAgt>
      <ChrgBr>${variant.chargeBearer}</ChrgBr>${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

// ─── pain.002 Builder ───────────────────────────────────────────────────────

function buildPain002(bank, variant, txn) {
  const ccy = variant.currency || bank.accountCcy;
  const msgId = `PAIN002-${txn.batchId}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.15">
  <CstmrPmtStsRpt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${txn.creDtTm}</CreDtTm>
      <InitgPty>
        <Nm>${esc(bank.shortName)}</Nm>
        <Id><OrgId><Othr><Id>${bank.bic}</Id></Othr></OrgId></Id>
      </InitgPty>
    </GrpHdr>
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>PAIN001-${txn.batchId}</OrgnlMsgId>
      <OrgnlNbOfTxs>3</OrgnlNbOfTxs>
      <OrgnlCtrlSum>${fmt(txn.amount * 3)}</OrgnlCtrlSum>
      <GrpSts>ACSC</GrpSts>
    </OrgnlGrpInfAndSts>
    <TxInfAndSts>
      <OrgnlInstrId>${txn.instructionId}-01</OrgnlInstrId>
      <OrgnlEndToEndId>${txn.endToEndId}</OrgnlEndToEndId>
      <TxSts>ACCC</TxSts>
      <StsRsnInf>
        <Rsn><Cd>G000</Cd></Rsn>
        <AddtlInf>Bulk payment transaction 1/3 accepted and settled</AddtlInf>
      </StsRsnInf>
      <OrgnlNbOfTxs>3</OrgnlNbOfTxs>
    </TxInfAndSts>
  </CstmrPmtStsRpt>
</Document>`;
}

// ─── Compliance Envelope ────────────────────────────────────────────────────

function buildCompliance(bank, variant, txn, chain) {
  const base = {
    aml_kyc: {
      status: 'PASSED',
      screening_date: txn.creDtTm,
      screening_provider: 'PrimeStack Compliance Engine',
      checks: [
        { check: 'PEP_SCREENING', result: 'CLEAR', details: 'No politically exposed person match' },
        { check: 'SANCTIONS_LIST', result: 'CLEAR', details: 'No OFAC/UN/EU sanctions match' },
        { check: 'ADVERSE_MEDIA', result: 'CLEAR', details: 'No adverse media flags' },
        { check: 'BENEFICIAL_OWNERSHIP', result: 'CLEAR', details: 'Beneficial ownership verified' },
        { check: 'TRANSACTION_MONITORING', result: 'CLEAR', details: 'No suspicious pattern detected' },
        { check: 'COUNTRY_RISK', result: 'ACCEPTED', details: `Destination ${bank.country} — ${variant.urgent ? 'enhanced due diligence passed' : 'standard risk tier'}` },
      ],
      risk_score: variant.urgent ? 18 : 12,
      risk_level: variant.urgent ? 'MEDIUM' : 'LOW',
      reviewed_by: variant.urgent ? 'MANUAL_REVIEW' : 'AUTOMATED',
    },
    fatca_crs: {
      fatca_status: 'NOT_US_PERSON',
      crs_reportable: 'NO',
      tin_provided: 'YES',
      self_certification: 'ON_FILE',
    },
    regulatory: {
      reporting_country: SENDER.country,
      destination_country: bank.country,
      reporting_basis: variant.regulatoryReporting ? 'CROSS_BORDER' : 'DOMESTIC',
      threshold_currency: variant.currency || bank.accountCcy,
      threshold_amount: variant.sepaSpecific ? 100000 : 10000,
      reporting_required: Number(txn.amount) >= 10000,
      mtr_reference: `MTR-${txn.batchId}`,
    },
    audit: {
      created_at: txn.creDtTm,
      created_by: 'PrimeStack ISO 20022 Engine v3.54.1.0.5',
      schema_validated: true,
      template_variant: variant.title,
    },
  };

  if (variant.gpiTracking) {
    base.swift_gpi = {
      gpi_enabled: true,
      tracking_ref: txn.uetr,
      confirm_bic: bank.bic,
      transparency: { fees_disclosed: true, fx_rate_disclosed: !!variant.fxConversion, delivery_time_disclosed: true },
    };
  }

  if (variant.tradeFinance) {
    base.trade_finance = {
      lc_reference: txn.lcRef || 'LC-2026-0001',
      issuing_bank_bic: SENDER.bic,
      confirming_bank_bic: 'CHASUS33',
      ucp_version: 'UCP600',
      bpo_reference: txn.bpoRef || 'BPO-2026-0001',
      documents_required: ['Commercial Invoice', 'Bill of Lading', 'Certificate of Origin', 'Packing List'],
      presentation_deadline: txn.valueDate,
    };
  }

  if (variant.fxConversion) {
    base.fx_details = {
      dealing_reference: txn.dealRef || 'FX-2026-0001',
      base_currency: variant.currency || bank.accountCcy,
      target_currency: txn.fxTargetCcy || 'EUR',
      exchange_rate: txn.fxRate || '0.92000',
      cls_settlement: txn.clsSettlement || true,
      ndf: false,
      value_date: txn.valueDate,
    };
  }

  if (variant.fedwireSpecific) {
    base.fedwire = {
      frb_district: 'NEW YORK',
      same_day_settlement: true,
      irrevocable: true,
      fed_routing_number: chain?.intrmyAgt1?.account || '021000021',
      iat_flag: true,
    };
  }

  return base;
}

// ─── Digital Signature ──────────────────────────────────────────────────────

function buildSignature(payloads, key) {
  const composite = payloads.map(p => `${p.filename}:${p.sha256_hash}`).join('|');
  return {
    algorithm: 'HMAC-SHA256',
    signed_at: nowISO(),
    signed_by: 'PrimeStack ISO 20022 Engine',
    key_id: 'PSK_ISO20022_2026',
    composite_hash: sha256(composite),
    signature: hmac(composite, key),
    verified: true,
    payloads: payloads.map(p => ({ filename: p.filename, hash: p.sha256_hash })),
  };
}

// ─── Chain Builder ──────────────────────────────────────────────────────────

function getChain(variantKey, bank) {
  const chains = {
    SWIFT_GPI_CROSSBORDER: {
      intrmyAgt1: { bic: 'CHASUS33', name: 'JPMORGAN CHASE BANK N.A.', clearing: 'USCH', account: '021000021' },
      intrmyAgt2: { bic: 'DEUTDEFF', name: 'DEUTSCHE BANK AG', clearing: 'TARGET2', account: 'DEUTDEFFXXX' },
    },
    SEPA_INSTANT: {
      intrmyAgt1: null, intrmyAgt2: null, // Direct via TIPS, no correspondents
    },
    FEDWIRE_RTGS: {
      intrmyAgt1: { bic: 'FRNYUS33', name: 'FEDERAL RESERVE BANK OF NEW YORK', clearing: 'FED', account: '0210000001' },
      intrmyAgt2: null,
    },
    CORRESPONDENT_NOSTRO: {
      intrmyAgt1: { bic: 'CHASUS33', name: 'JPMORGAN CHASE BANK N.A. (NOSTRO)', clearing: 'USCH', account: '021000021' },
      intrmyAgt2: { bic: 'DEUTDEFF', name: 'DEUTSCHE BANK AG (INTERMEDIARY)', clearing: 'TARGET2', account: 'DEUTDEFFXXX' },
    },
    TRADE_FINANCE_LC: {
      intrmyAgt1: { bic: 'CHASUS33', name: 'JPMORGAN CHASE BANK N.A. (CONFIRMING)', clearing: 'USCH', account: '021000021' },
      intrmyAgt2: { bic: 'DEUTDEFF', name: 'DEUTSCHE BANK AG (ADVISING)', clearing: 'TARGET2', account: 'DEUTDEFFXXX' },
    },
    TREASURY_FX: {
      intrmyAgt1: { bic: 'CHASUS33', name: 'JPMORGAN CHASE BANK N.A. (CLS MEMBER)', clearing: 'USCH', account: '021000021' },
      intrmyAgt2: { bic: 'CLSBUS33', name: 'CLS BANK INTERNATIONAL', clearing: 'CLS', account: 'CLS-USD-EUR' },
    },
    BULK_PAYMENT_PAIN001: {
      intrmyAgt1: null, intrmyAgt2: null,
    },
    HIGH_VALUE_URGENT: {
      intrmyAgt1: { bic: 'CHASUS33', name: 'JPMORGAN CHASE BANK N.A.', clearing: 'USCH', account: '021000021' },
      intrmyAgt2: { bic: 'DEUTDEFF', name: 'DEUTSCHE BANK AG', clearing: 'TARGET2', account: 'DEUTDEFFXXX' },
    },
  };
  return chains[variantKey] || chains.SWIFT_GPI_CROSSBORDER;
}

// ─── Main Generator ─────────────────────────────────────────────────────────

function generateVariant(variantKey, bankKey) {
  const variant = VARIANTS[variantKey];
  const bank = BANKS[bankKey];
  if (!variant || !bank) throw new Error(`Unknown variant or bank`);

  const chain = getChain(variantKey, bank);
  const txn = {
    batchId: `${Date.now()}`,
    instructionId: `INS-20261022-${bankKey.slice(0, 3)}-01`,
    endToEndId: `E2E-20261022-${bankKey.slice(0, 3)}-01`,
    txId: `LCB/CORE/${bankKey.slice(0, 6)}-TRN-001`,
    uetr: uuid(),
    amount: variant.sepaSpecific ? 50000 : 10000000, // SEPA max 100k
    valueDate: '2026-10-22',
    creDtTm: nowISO(),
  };

  // Add variant-specific txn fields
  if (variant.fxConversion) {
    txn.fxRate = '0.92000';
    txn.fxTargetCcy = 'EUR';
    txn.dealRef = 'FX-2026-0001';
    txn.clsSettlement = true;
  }
  if (variant.tradeFinance) {
    txn.lcRef = 'LC-2026-0001';
    txn.bpoRef = 'BPO-2026-0001';
  }

  // Build payloads based on variant
  const payloads = [];

  // pain.001 for bulk
  if (variant.bulkPayment) {
    const pain001Xml = buildPain001(bank, variant, txn);
    payloads.push({ filename: `pain.001.${bank.shortName}.xml`, message_type: 'pain.001.001.13', description: 'Customer-to-Bank Payment Initiation (Bulk)', xml_content: pain001Xml, sha256_hash: sha256(pain001Xml) });
    const pain002Xml = buildPain002(bank, variant, txn);
    payloads.push({ filename: `pain.002.${bank.shortName}.xml`, message_type: 'pain.002.001.15', description: 'Payment Status Report (Batch)', xml_content: pain002Xml, sha256_hash: sha256(pain002Xml) });
    const camt053Xml = buildCamt053(bank, variant, txn, chain);
    payloads.push({ filename: `camt.053.${bank.shortName}.xml`, message_type: 'camt.053.001.10', description: 'Bank-to-Customer Statement', xml_content: camt053Xml, sha256_hash: sha256(camt053Xml) });
  } else {
    // Standard payloads
    if (variant.messages.includes('pacs.008.001.10')) {
      const xml = buildPacs008(bank, variant, txn, chain);
      payloads.push({ filename: `pacs.008.${bank.shortName}.xml`, message_type: 'pacs.008.001.10', description: 'FI-to-FI Customer Credit Transfer', xml_content: xml, sha256_hash: sha256(xml) });
    }
    if (variant.messages.includes('pacs.009.001.10')) {
      const xml = buildPacs009(bank, variant, txn, chain);
      payloads.push({ filename: `pacs.009.${bank.shortName}.xml`, message_type: 'pacs.009.001.10', description: 'FI-to-FI Credit Transfer (Institution)', xml_content: xml, sha256_hash: sha256(xml) });
    }
    if (variant.messages.includes('pacs.002.001.12')) {
      const xml = buildPacs002(bank, variant, txn);
      payloads.push({ filename: `pacs.002.${bank.shortName}.xml`, message_type: 'pacs.002.001.12', description: 'Payment Status Report — ACCC', xml_content: xml, sha256_hash: sha256(xml) });
    }
    if (variant.messages.includes('camt.053.001.10')) {
      const xml = buildCamt053(bank, variant, txn, chain);
      payloads.push({ filename: `camt.053.${bank.shortName}.xml`, message_type: 'camt.053.001.10', description: 'Bank-to-Customer Statement', xml_content: xml, sha256_hash: sha256(xml) });
    }
    if (variant.messages.includes('camt.029.001.11')) {
      const xml = buildCamt029(bank, variant, txn);
      payloads.push({ filename: `camt.029.${bank.shortName}.xml`, message_type: 'camt.029.001.11', description: 'Resolution of Investigation', xml_content: xml, sha256_hash: sha256(xml) });
    }
  }

  // Verify all hashes
  for (const p of payloads) {
    const computed = sha256(p.xml_content);
    if (computed !== p.sha256_hash) throw new Error(`Hash mismatch on ${p.filename}`);
  }

  // Build container
  return {
    header: {
      file_type: 'ISO20022_MULTI_PAYLOAD_CONTAINER',
      template_variant: variantKey,
      variant_title: variant.title,
      variant_description: variant.description,
      variant_icon: variant.icon,
      version: '3.54.1.0.5',
      exported_at: txn.creDtTm,
      execution_mode: 'PRODUCTION_API_CONTAINER',
      tenant_id: 'LCB_SOUTH_SUDAN_CORE',
      target_institution: bank.label,
      target_institution_bic: bank.bic,
      target_institution_country: bank.country,
      generated_by: 'PrimeStack ISO 20022 Engine v3.54.1.0.5',
      schema_version: '2025_2026',
      message_standards: 'ISO 20022 CBPR+ SWIFT GPI',
      container_id: uuid(),
    },

    variant_config: {
      clearing_system: variant.clearingSystem,
      service_level: variant.serviceLevel,
      charge_bearer: variant.chargeBearer,
      priority: variant.priority,
      delivery_mode: variant.deliveryMode,
      correspondent_chain: variant.correspondentChain,
      regulatory_reporting: variant.regulatoryReporting,
      gpi_tracking: variant.gpiTracking,
      instant_settlement: variant.instantSettlement || false,
      sepa_specific: variant.sepaSpecific || false,
      fedwire_specific: variant.fedwireSpecific || false,
      nostro_vostro: variant.nostroVostro || false,
      trade_finance: variant.tradeFinance || false,
      fx_conversion: variant.fxConversion || false,
      bulk_payment: variant.bulkPayment || false,
      urgent: variant.urgent || false,
      max_amount: variant.maxAmount || null,
      unique_fields: variant.uniqueFields,
    },

    transaction_metadata: {
      sending_bank_trn: txn.txId,
      instruction_id: txn.instructionId,
      end_to_end_id: txn.endToEndId,
      uetr: txn.uetr,
      settlement_amount: txn.amount,
      currency: variant.currency || bank.accountCcy,
      value_date: txn.valueDate,
      electronic_sequence_number: 1,
      debtor_agent_bic: SENDER.bic,
      creditor_agent_bic: bank.bic,
      creditor_account_number: bank.account,
      creditor_account_currency: bank.accountCcy,
      creditor_name: bank.customerName,
      creditor_bank_name: bank.label,
      creditor_bank_address: `${bank.address.street}, ${bank.address.town}, ${bank.address.country}`,
      creditor_bank_head_office: bank.headOffice,
      correspondent_chain: chain.intrmyAgt1 ? {
        intermediary_1: { bic: chain.intrmyAgt1.bic, name: chain.intrmyAgt1.name, clearing_system: chain.intrmyAgt1.clearing, account: chain.intrmyAgt1.account },
      } : null,
      ...(chain.intrmyAgt2 ? { intermediary_2: { bic: chain.intrmyAgt2.bic, name: chain.intrmyAgt2.name, clearing_system: chain.intrmyAgt2.clearing, account: chain.intrmyAgt2.account } } : {}),
    },

    iso20022_payloads: payloads.map(p => ({
      message_type: p.message_type,
      description: p.description,
      filename: p.filename,
      sha256_hash: p.sha256_hash,
      xml_content: p.xml_content,
    })),

    compliance_envelope: buildCompliance(bank, variant, txn, chain),

    digital_signature: buildSignature(payloads, SIGN_KEY),

    callback_config: {
      callback_url: 'https://api.21stcenturybiotech.com/v1/schwab/ack',
      expected_response_status: 'ACCC',
      retry_policy: { max_retries: 3, retry_interval_seconds: 30, backoff_multiplier: 2 },
    },

    routing_instructions: {
      swift_network: variant.deliveryMode === 'REAL_TIME' ? 'SWIFTNet FIN (Real-Time)' : 'SWIFTNet FIN',
      delivery_mode: variant.deliveryMode,
      priority: variant.priority,
      notification_requested: 'CONFIRMATION',
      monitoring_level: variant.gpiTracking ? 'FULL_GPI' : 'STANDARD',
    },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const outDir = path.join(__dirname, 'NEW IMPLEMENTS', 'BANK_GRADE_TEMPLATES');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  PrimeStack ISO 20022 — Bank-Grade Template Variants Generator   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  let total = 0;

  for (const [variantKey, variant] of Object.entries(VARIANTS)) {
    console.log(`┌─ ${variant.icon} ${variant.title} ${'─'.repeat(Math.max(0, 50 - variant.title.length))}┐`);
    console.log(`│  Type: ${variantKey}`);
    console.log(`│  Messages: ${variant.messages.join(', ')}`);
    console.log(`│  Clearing: ${variant.clearingSystem} | Service: ${variant.serviceLevel} | Priority: ${variant.priority}`);
    console.log(`│  Charges: ${variant.chargeBearer} | Delivery: ${variant.deliveryMode}`);

    for (const [bankKey, bank] of Object.entries(BANKS)) {
      try {
        const container = generateVariant(variantKey, bankKey);
        const fileName = `${variantKey}__${bankKey}.json`;
        const filePath = path.join(outDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(container, null, 2), 'utf8');

        const hashOk = container.iso20022_payloads.every(p => sha256(p.xml_content) === p.sha256_hash);
        const sigOk = container.digital_signature.verified;

        console.log(`│  ✓ ${bankKey.padEnd(12)} → ${fileName}`);
        console.log(`│    Payloads: ${container.iso20022_payloads.length} | Hashes: ${hashOk ? 'OK' : 'FAIL'} | Sig: ${sigOk ? 'OK' : 'FAIL'} | UETR: ${container.transaction_metadata.uetr.slice(0, 8)}...`);
        total++;
      } catch (e) {
        console.log(`│  ✗ ${bankKey}: ${e.message}`);
      }
    }
    console.log(`└${'─'.repeat(67)}┘\n`);
  }

  // Generate an index file
  const index = {
    title: 'PrimeStack ISO 20022 Bank-Grade Template Library',
    generated_at: nowISO(),
    total_templates: total,
    variants: Object.entries(VARIANTS).map(([key, v]) => ({
      key,
      title: v.title,
      icon: v.icon,
      description: v.description,
      messages: v.messages,
      clearing_system: v.clearingSystem,
      service_level: v.serviceLevel,
      charge_bearer: v.chargeBearer,
      priority: v.priority,
      unique_fields: v.uniqueFields,
      banks: Object.keys(BANKS),
    })),
    available_banks: Object.entries(BANKS).map(([key, b]) => ({
      key,
      name: b.label,
      bic: b.bic,
      country: b.country,
      account: b.account,
      currency: b.accountCcy,
    })),
  };

  fs.writeFileSync(path.join(outDir, '_INDEX.json'), JSON.stringify(index, null, 2), 'utf8');
  console.log(`✅ Generated ${total} templates across ${Object.keys(VARIANTS).length} variants × ${Object.keys(BANKS).length} banks`);
  console.log(`📁 Output: ${outDir}\n`);
  console.log('Template files: VARIANT__BANK.json (e.g. SWIFT_GPI_CROSSBORDER__TECHCOMBANK.json)');
  console.log('Index file: _INDEX.json\n');
}

main();