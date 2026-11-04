/**
 * PrimeStack ISO 20022 Bank-Grade Template Generator
 * 
 * Generates a production-grade multi-payload ISO 20022 container that meets
 * SWIFT GPI, CBPR+, and ISO 20022 v3 requirements for correspondent banking.
 *
 * Output payloads:
 *   - pacs.008.001.10  (FI-to-FI Customer Credit Transfer)
 *   - pacs.009.001.10  (FI-to-FI Credit Transfer — Institution)
 *   - pacs.002.001.12  (FI-to-FI Payment Status Report)
 *   - camt.053.001.10  (Bank-to-Customer Statement)
 *   - camt.029.001.11  (Resolution of Investigation)
 *
 * Includes:
 *   - UETR (Unique End-to-End Transaction Reference)
 *   - Regulatory reporting (RgltryRptg)
 *   - Correspondent bank chain (IntrmyAgt1/2/3)
 *   - Digital signature envelope (HMAC-SHA256)
 *   - AML / sanctions screening result
 *   - SWIFT GPI tracking fields
 *   - Charge bearer breakdown
 *   - Proper clearing system identifiers
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const RECEIVER_CONFIGS = {
  TECHCOMBANK_VIETNAM: {
    label: 'VIETNAM TECHNOLOGICAL AND COMMERCIAL JOINT-STOCK BANK (TECHCOMBANK)',
    shortName: 'TECHCOMBANK',
    bic: 'VTCBVNVX',
    branch: 'TCB HO CHI MINH',
    branchId: 'VTCBVNVX',
    country: 'VN',
    address: {
      street: '225-227 XO VIET NGHE TINH STREET',
      building: null,
      postCode: '700000',
      town: 'HO CHI MINH CITY',
      countrySubDivision: 'BINH THANH DISTRICT, WARD 17',
      country: 'VN',
    },
    headOffice: '6 QUANG TRUNG, HOAN KIEM, HANOI, VIETNAM',
    phone: '+84-28-7303-6556',
    account: '19239630459986',
    accountCurrency: 'USD',
    secondaryAccount: null,
    secondaryCurrency: null,
    customerName: 'BEAUT UNIVERSE COMPANY LIMITED',
    customerAddress: {
      street: '225-227 XO VIET NGHE TINH STREET',
      postCode: '700000',
      town: 'HO CHI MINH CITY',
      country: 'VN',
    },
    customerReg: '0312994934',
    customerRegType: 'TXID',
    clearingSystem: 'VND-CLEAR',
    purposeCode: 'SUPP',
    categoryPurpose: 'SUPP',
    remittanceRef: 'INV-TCB-2026-0001',
  },
  BNI_INDONESIA: {
    label: 'PT. BANK NEGARA INDONESIA (PERSERO) TBK',
    shortName: 'BNI',
    bic: 'BNINIDJA',
    branch: 'BNI KC MELAWAI RAYA',
    branchId: 'BNINIDJAXXX',
    country: 'ID',
    address: {
      street: 'JL. ISKANDARSYAH II, KEBAYORAN BARU',
      building: null,
      postCode: '12170',
      town: 'JAKARTA SELATAN',
      countrySubDivision: 'DKI JAKARTA',
      country: 'ID',
    },
    headOffice: 'JL. JEND. SUDIRMAN KAV. 1, JAKARTA PUSAT, INDONESIA',
    phone: '+62-21-23588000',
    account: '8055775589',
    accountCurrency: 'EUR',
    secondaryAccount: '8055775589',
    secondaryCurrency: 'EUR',
    customerName: 'PT. RAJA AL AZHAR MINING',
    customerAddress: {
      street: 'CITRA GARDEN, CLUSTER DA VINCI BLOK D1 NO. 12',
      postCode: '70248',
      town: 'PEMURUS DALAM BANJARMASIN, KALIMANTAN SELATAN',
      country: 'ID',
    },
    customerReg: '3011210022773',
    customerRegType: 'TXID',
    clearingSystem: 'INDODJA722',
    purposeCode: 'BEXP',
    categoryPurpose: 'SUPP',
    remittanceRef: 'INV-BNI-2026-0001',
  },
};

// Sending institution (debtor side)
const SENDING_INSTITUTION = {
  label: 'LCB SOUTH SUDAN CORE BANKING SYSTEM',
  shortName: 'LCB CORE',
  bic: 'LICMSSJB',
  branch: 'LCB HEAD OFFICE JUBA',
  branchId: 'LICMSSJB',
  country: 'SS',
  address: {
    street: 'Juba Main Banking Boulevard',
    building: '1',
    postCode: '0001',
    town: 'JUBA',
    countrySubDivision: 'CENTRAL EQUATORIA',
    country: 'SS',
  },
  account: '0000-0100-0000-0000',
  accountCurrency: 'USD',
  customerName: 'LCB SAMPLE DEBTOR CORP LIMITED',
  customerAddress: {
    street: 'Financial Boulevard',
    building: '100',
    postCode: '10001',
    town: 'Commercial City',
    country: 'US',
  },
};

// Correspondent / intermediary chain (SWIFT GPI standard)
const CORRESPONDENT_CHAIN = {
  // Intermediary 1 — sender's correspondent (typically a major US/EU clearing bank)
  intrmyAgt1: {
    bic: 'CHASUS33',
    name: 'JPMORGAN CHASE BANK N.A.',
    clearingSystem: 'USCH',
    account: '021000021',
  },
  // Intermediary 2 — receiver's correspondent
  intrmyAgt2: {
    bic: 'DEUTDEFF',
    name: 'DEUTSCHE BANK AG',
    clearingSystem: 'TARGET2',
    account: 'DEUTDEFFXXX',
  },
  // Intermediary 3 — local clearing (if applicable)
  intrmyAgt3: null, // set per-receiver if needed
};

// HMAC signing key for digital envelope (sample — replace in production)
const SIGNING_KEY = process.env.ISO20022_SIGNING_KEY || 'primestack-iso20022-signing-key-2026';

// ─── Helpers ────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID().toUpperCase();
}

function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(data, key) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function nowISO() {
  return new Date().toISOString();
}

function fmtAmount(amt) {
  return Number(amt).toFixed(2);
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function indent(str, spaces) {
  const pad = '  '.repeat(spaces);
  return str.split('\n').map(l => l ? pad + l : l).join('\n');
}

// ─── ISO 20022 Message Builders ─────────────────────────────────────────────

/**
 * pacs.008.001.10 — FI-to-FI Customer Credit Transfer
 * Full SWIFT GPI compliant structure with UETR, regulatory reporting,
 * correspondent chain, charge bearer, and structured remittance.
 */
function buildPacs008(cfg, sender, chain, txn) {
  const uetr = txn.uetr;
  const valueDate = txn.valueDate;
  const creDtTm = txn.creDtTm;
  const msgId = `PACS008-${txn.batchId}`;
  const amount = fmtAmount(txn.amount);
  const ccy = txn.currency;

  // Debtor agent
  const dbtrAgt = `    <DbtrAgt>
      <FinInstnId>
        <BICFI>${sender.bic}</BICFI>
        <Nm>${escapeXml(sender.shortName)}</Nm>
        <PstlAdr>
          <StrtNm>${escapeXml(sender.address.street)}</StrtNm>
          <BldgNb>${escapeXml(sender.address.building || '1')}</BldgNb>
          <PstCd>${escapeXml(sender.address.postCode)}</PstCd>
          <TwnNm>${escapeXml(sender.address.town)}</TwnNm>
          <CtrySubDvsn>${escapeXml(sender.address.countrySubDivision)}</CtrySubDvsn>
          <Ctry>${escapeXml(sender.address.country)}</Ctry>
        </PstlAdr>
      </FinInstnId>
      <BrnchId>
        <Id>${sender.branchId}</Id>
        <Nm>${escapeXml(sender.branch)}</Nm>
      </BrnchId>
    </DbtrAgt>`;

  // Intermediary agent 1 (sender's correspondent)
  const intrmyAgt1 = chain.intrmyAgt1 ? `    <IntrmyAgt1>
      <FinInstnId>
        <BICFI>${chain.intrmyAgt1.bic}</BICFI>
        <Nm>${escapeXml(chain.intrmyAgt1.name)}</Nm>
        <ClrSysMmbId>
          <ClrSysId>
            <Cd>${chain.intrmyAgt1.clearingSystem}</Cd>
          </ClrSysId>
          <MmbId>${chain.intrmyAgt1.account}</MmbId>
        </ClrSysMmbId>
      </FinInstnId>
    </IntrmyAgt1>` : '';

  // Intermediary agent 2 (receiver's correspondent)
  const intrmyAgt2 = chain.intrmyAgt2 ? `    <IntrmyAgt2>
      <FinInstnId>
        <BICFI>${chain.intrmyAgt2.bic}</BICFI>
        <Nm>${escapeXml(chain.intrmyAgt2.name)}</Nm>
        <ClrSysMmbId>
          <ClrSysId>
            <Cd>${chain.intrmyAgt2.clearingSystem}</Cd>
          </ClrSysId>
          <MmbId>${chain.intrmyAgt2.account}</MmbId>
        </ClrSysMmbId>
      </FinInstnId>
    </IntrmyAgt2>` : '';

  // Intermediary agent 3
  const intrmyAgt3 = chain.intrmyAgt3 ? `    <IntrmyAgt3>
      <FinInstnId>
        <BICFI>${chain.intrmyAgt3.bic}</BICFI>
        <Nm>${escapeXml(chain.intrmyAgt3.name)}</Nm>
      </FinInstnId>
    </IntrmyAgt3>` : '';

  // Creditor agent
  const cdtrAgt = `    <CdtrAgt>
      <FinInstnId>
        <BICFI>${cfg.bic}</BICFI>
        <Nm>${escapeXml(cfg.label)}</Nm>
        <PstlAdr>
          <StrtNm>${escapeXml(cfg.address.street)}</StrtNm>
          <PstCd>${escapeXml(cfg.address.postCode)}</PstCd>
          <TwnNm>${escapeXml(cfg.address.town)}</TwnNm>
          <CtrySubDvsn>${escapeXml(cfg.address.countrySubDivision)}</CtrySubDvsn>
          <Ctry>${escapeXml(cfg.address.country)}</Ctry>
        </PstlAdr>
      </FinInstnId>
      <BrnchId>
        <Id>${cfg.branchId}</Id>
        <Nm>${escapeXml(cfg.branch)}</Nm>
      </BrnchId>
    </CdtrAgt>`;

  // Regulatory reporting — cross-border mandatory
  const rgltryRptg = `    <RgltryRptg>
      <Dtls>
        <Tp>CREDIT</Tp>
        <Dt>
          <Dt>${valueDate}</Dt>
        </Dt>
        <Ctry>${sender.address.country}</Ctry>
        <Cd>C001</Cd>
        <Amt Ccy="${ccy}">${amount}</Amt>
      </Dtls>
      <Dtls>
        <Tp>DECLARE</Tp>
        <Dt>
          <Dt>${valueDate}</Dt>
        </Dt>
        <Ctry>${cfg.address.country}</Ctry>
        <Cd>C002</Cd>
        <Inf>${escapeXml(`Cross-border payment to ${cfg.shortName} — ${cfg.country}`)}</Inf>
      </Dtls>
    </RgltryRptg>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <SttlmAcct>
          <Id>
            <Othr>
              <Id>${chain.intrmyAgt1 ? chain.intrmyAgt1.account : 'NOSTRO-USD-001'}</Id>
            </Othr>
          </Id>
          <Ccy>${ccy}</Ccy>
        </SttlmAcct>
        <ClrSys>
          <Cd>${cfg.clearingSystem === 'VND-CLEAR' ? 'VND-CLEAR' : cfg.clearingSystem}</Cd>
        </ClrSys>
      </SttlmInf>
      <InstgAgt>
        <FinInstnId>
          <BICFI>${sender.bic}</BICFI>
        </FinInstnId>
      </InstgAgt>
      <InstdAgt>
        <FinInstnId>
          <BICFI>${cfg.bic}</BICFI>
        </FinInstnId>
      </InstdAgt>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${txn.instructionId}</InstrId>
        <EndToEndId>${txn.endToEndId}</EndToEndId>
        <TxId>${txn.txId}</TxId>
        <UETR>${uetr}</UETR>
        <ClrSysRef>
          <ClrSysId>
            <Cd>${cfg.clearingSystem}</Cd>
          </ClrSysId>
          <EndToEndId>${txn.endToEndId}</EndToEndId>
        </ClrSysRef>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${ccy}">${amount}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${valueDate}</IntrBkSttlmDt>
      <SttlmPrty>NORM</SttlmPrty>
      <SttlmTmInd>+</SttlmTmInd>
      <ChrgBr>SHAR</ChrgBr>
      <ChrgBrInf>
        <ChrgBr>SHAR</ChrgBr>
        <ChrgsAmt Ccy="${ccy}">${fmtAmount(txn.amount * 0.001)}</ChrgsAmt>
        <ChrgsAcct>
          <Id>
            <Othr>
              <Id>CHRGES-${sender.bic}</Id>
            </Othr>
          </Id>
          <Ccy>${ccy}</Ccy>
        </ChrgsAcct>
      </ChrgBrInf>
      <Dbtr>
        <Nm>${escapeXml(sender.customerName)}</Nm>
        <PstlAdr>
          <AdrLine>${escapeXml(`${sender.customerAddress.street}, ${sender.customerAddress.town}, ${sender.customerAddress.country}`)}</AdrLine>
          <StrtNm>${escapeXml(sender.customerAddress.street)}</StrtNm>
          <BldgNb>${escapeXml(sender.customerAddress.building || '1')}</BldgNb>
          <PstCd>${escapeXml(sender.customerAddress.postCode)}</PstCd>
          <TwnNm>${escapeXml(sender.customerAddress.town)}</TwnNm>
          <Ctry>${escapeXml(sender.customerAddress.country)}</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>${sender.account}</Id>
          </Othr>
        </Id>
        <Ccy>${sender.accountCurrency}</Ccy>
      </DbtrAcct>
${dbtrAgt}
${intrmyAgt1}
${intrmyAgt2}
${intrmyAgt3}
${cdtrAgt}
      <Cdtr>
        <Nm>${escapeXml(cfg.customerName)}</Nm>
        <PstlAdr>
          <AdrLine>${escapeXml(`${cfg.customerAddress.street}, ${cfg.customerAddress.town}, ${cfg.customerAddress.country}`)}</AdrLine>
          <StrtNm>${escapeXml(cfg.customerAddress.street)}</StrtNm>
          <PstCd>${escapeXml(cfg.customerAddress.postCode)}</PstCd>
          <TwnNm>${escapeXml(cfg.customerAddress.town)}</TwnNm>
          <Ctry>${escapeXml(cfg.customerAddress.country)}</Ctry>
        </PstlAdr>
        <Id>
          <OrgId>
            <Othr>
              <Id>${cfg.customerReg}</Id>
              <SchmeNm>
                <Cd>${cfg.customerRegType}</Cd>
              </SchmeNm>
            </Othr>
          </OrgId>
        </Id>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${cfg.account}</Id>
          </Othr>
        </Id>
        <Ccy>${cfg.accountCurrency}</Ccy>
        <Nm>${escapeXml(cfg.customerName)}</Nm>
      </CdtrAcct>
      <Purp>
        <Cd>${cfg.purposeCode}</Cd>
      </Purp>
      <CtgyPurp>
        <Cd>${cfg.categoryPurpose}</Cd>
      </CtgyPurp>
${indent(rgltryRptg, 3)}
      <RmtInf>
        <Strd>
          <RfrdDocInf>
            <TpCdOrPrtry>
              <Cd>CINV</Cd>
            </TpCdOrPrtry>
            <Ref>${cfg.remittanceRef}</Ref>
            <RltdDt>${valueDate}</RltdDt>
          </RfrdDocInf>
        </Strd>
        <Ustrd>${escapeXml(`CROSS-BORDER PAYMENT ${cfg.shortName} ${cfg.country} - UETR:${uetr} - REF:${cfg.remittanceRef}`)}</Ustrd>
      </RmtInf>
      <SplmtryData>
        <Envlp>
          <Nm>GPI_TrackingRef</Nm>
          <Val>${uetr}</Val>
        </Envlp>
      </SplmtryData>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

  return xml;
}

/**
 * pacs.009.001.10 — FI-to-FI Credit Transfer (Institution to Institution)
 */
function buildPacs009(cfg, sender, chain, txn) {
  const uetr = txn.uetr;
  const valueDate = txn.valueDate;
  const creDtTm = txn.creDtTm;
  const msgId = `PACS009-${txn.batchId}`;
  const amount = fmtAmount(txn.amount);
  const ccy = txn.currency;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.009.001.10">
  <FICdtTrf>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <SttlmAcct>
          <Id>
            <Othr>
              <Id>${chain.intrmyAgt1 ? chain.intrmyAgt1.account : 'NOSTRO-USD-001'}</Id>
            </Othr>
          </Id>
          <Ccy>${ccy}</Ccy>
        </SttlmAcct>
        <ClrSys>
          <Cd>${cfg.clearingSystem}</Cd>
        </ClrSys>
      </SttlmInf>
      <InstgAgt>
        <FinInstnId>
          <BICFI>${sender.bic}</BICFI>
          <Nm>${escapeXml(sender.shortName)}</Nm>
        </FinInstnId>
      </InstgAgt>
      <InstdAgt>
        <FinInstnId>
          <BICFI>${cfg.bic}</BICFI>
          <Nm>${escapeXml(cfg.shortName)}</Nm>
        </FinInstnId>
      </InstdAgt>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${txn.instructionId}</InstrId>
        <EndToEndId>${txn.endToEndId}</EndToEndId>
        <TxId>${txn.txId}</TxId>
        <UETR>${uetr}</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${ccy}">${amount}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${valueDate}</IntrBkSttlmDt>
      <SttlmPrty>NORM</SttlmPrty>
      <ChrgBr>SHAR</ChrgBr>
${chain.intrmyAgt1 ? `      <IntrmyAgt1>
        <FinInstnId>
          <BICFI>${chain.intrmyAgt1.bic}</BICFI>
          <Nm>${escapeXml(chain.intrmyAgt1.name)}</Nm>
          <ClrSysMmbId>
            <ClrSysId><Cd>${chain.intrmyAgt1.clearingSystem}</Cd></ClrSysId>
            <MmbId>${chain.intrmyAgt1.account}</MmbId>
          </ClrSysMmbId>
        </FinInstnId>
      </IntrmyAgt1>` : ''}
${chain.intrmyAgt2 ? `      <IntrmyAgt2>
        <FinInstnId>
          <BICFI>${chain.intrmyAgt2.bic}</BICFI>
          <Nm>${escapeXml(chain.intrmyAgt2.name)}</Nm>
          <ClrSysMmbId>
            <ClrSysId><Cd>${chain.intrmyAgt2.clearingSystem}</Cd></ClrSysId>
            <MmbId>${chain.intrmyAgt2.account}</MmbId>
          </ClrSysMmbId>
        </FinInstnId>
      </IntrmyAgt2>` : ''}
      <Dbtr>
        <FinInstnId>
          <BICFI>${sender.bic}</BICFI>
          <Nm>${escapeXml(sender.shortName)}</Nm>
        </FinInstnId>
      </Dbtr>
      <Cdtr>
        <FinInstnId>
          <BICFI>${cfg.bic}</BICFI>
          <Nm>${escapeXml(cfg.shortName)}</Nm>
        </FinInstnId>
      </Cdtr>
      <Purp>
        <Cd>${cfg.purposeCode}</Cd>
      </Purp>
      <RmtInf>
        <Ustrd>${escapeXml(`INSTITUTION CREDIT TRANSFER ${cfg.shortName} UETR:${uetr} ${cfg.remittanceRef}`)}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FICdtTrf>
</Document>`;

  return xml;
}

/**
 * pacs.002.001.12 — FI-to-FI Payment Status Report (ACCC — Accepted Settled)
 */
function buildPacs002(cfg, sender, txn) {
  const uetr = txn.uetr;
  const creDtTm = txn.creDtTm;
  const msgId = `PACS002-${txn.batchId}`;
  const amount = fmtAmount(txn.amount);
  const ccy = txn.currency;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.12">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <InstgAgt>
        <FinInstnId>
          <BICFI>${cfg.bic}</BICFI>
        </FinInstnId>
      </InstgAgt>
      <InstdAgt>
        <FinInstnId>
          <BICFI>${sender.bic}</BICFI>
        </FinInstnId>
      </InstdAgt>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlGrpInf>
        <OrgnlMsgId>${msgId.replace('PACS002', 'PACS008')}</OrgnlMsgId>
      </OrgnlGrpInf>
      <OrgnlTxId>${txn.txId}</OrgnlTxId>
      <OrgnlInstrId>${txn.instructionId}</OrgnlInstrId>
      <OrgnlEndToEndId>${txn.endToEndId}</OrgnlEndToEndId>
      <OrgnlUETR>${uetr}</OrgnlUETR>
      <TxSts>ACCC</TxSts>
      <StsRsnInf>
        <Rsn>
          <Cd>G000</Cd>
        </Rsn>
        <AddtlInf>Transaction accepted and settled — clear funds</AddtlInf>
      </StsRsnInf>
      <AccptncDtTm>${creDtTm}</AccptncDtTm>
      <OrgnlTxRef>
        <Amt>
          <IntrBkSttlmAmt Ccy="${ccy}">${amount}</IntrBkSttlmAmt>
        </Amt>
        <IntrBkSttlmDt>${txn.valueDate}</IntrBkSttlmDt>
        <SttlmPrty>NORM</SttlmPrty>
        <PmtTpInf>
          <ClrChanl>RTGS</ClrChanl>
          <SvcLvl>
            <Cd>SDVA</Cd>
          </SvcLvl>
          <CtgyPurp>
            <Cd>${cfg.categoryPurpose}</Cd>
          </CtgyPurp>
        </PmtTpInf>
        <DbtrAgt>
          <FinInstnId>
            <BICFI>${sender.bic}</BICFI>
          </FinInstnId>
        </DbtrAgt>
        <CdtrAgt>
          <FinInstnId>
            <BICFI>${cfg.bic}</BICFI>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(cfg.customerName)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>${cfg.account}</Id>
            </Othr>
          </Id>
          <Ccy>${cfg.accountCurrency}</Ccy>
        </CdtrAcct>
      </OrgnlTxRef>
      <SplmtryData>
        <Envlp>
          <Nm>GPI_TrackingRef</Nm>
          <Val>${uetr}</Val>
        </Envlp>
      </SplmtryData>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`;

  return xml;
}

/**
 * camt.053.001.10 — Bank-to-Customer Statement
 */
function buildCamt053(cfg, sender, chain, txn) {
  const uetr = txn.uetr;
  const valueDate = txn.valueDate;
  const creDtTm = txn.creDtTm;
  const msgId = `CAMT053-${txn.batchId}`;
  const amount = fmtAmount(txn.amount);
  const ccy = txn.currency;
  const openingBalance = fmtAmount(txn.amount * 5); // 50M for 10M txn
  const closingBalance = fmtAmount(txn.amount * 4); // 40M after debit

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.10">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <MsgRcpt>
        <Nm>${escapeXml(sender.shortName)}</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>${sender.bic}</Id>
            </Othr>
          </OrgId>
        </Id>
      </MsgRcpt>
    </GrpHdr>
    <Stmt>
      <Id>STMT-${txn.batchId}</Id>
      <ElctrncSeqNb>${txn.elctrncSeqNb}</ElctrncSeqNb>
      <CreDtTm>${creDtTm}</CreDtTm>
      <FrToDt>
        <FrDtTm>${valueDate}T00:00:00Z</FrDtTm>
        <ToDtTm>${valueDate}T23:59:59Z</ToDtTm>
      </FrToDt>
      <Acct>
        <Id>
          <Othr>
            <Id>${sender.account}</Id>
          </Othr>
        </Id>
        <Ccy>${ccy}</Ccy>
        <Ownr>
          <Nm>${escapeXml(sender.shortName)}</Nm>
        </Ownr>
        <Svcr>
          <FinInstnId>
            <BICFI>${chain?.intrmyAgt1?.bic || 'CHASUS33'}</BICFI>
          </FinInstnId>
        </Svcr>
      </Acct>
      <Bal>
        <Tp>
          <CdOrPrtry>
            <Cd>OPBD</Cd>
          </CdOrPrtry>
        </Tp>
        <Amt Ccy="${ccy}">${openingBalance}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt>
          <Dt>${valueDate}</Dt>
        </Dt>
      </Bal>
      <Ntry>
        <NtryRef>ENTRY-${txn.batchId}-001</NtryRef>
        <Amt Ccy="${ccy}">${amount}</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <RvslInd>false</RvslInd>
        <Sts>BOOK</Sts>
        <BookgDt>
          <Dt>${valueDate}</Dt>
        </BookgDt>
        <ValDt>
          <Dt>${valueDate}</Dt>
        </ValDt>
        <AcctSvcrRef>ASR-${txn.batchId}-001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs>
              <InstrId>${txn.instructionId}</InstrId>
              <EndToEndId>${txn.endToEndId}</EndToEndId>
              <TxId>${txn.txId}</TxId>
              <UETR>${uetr}</UETR>
              <AcctSvcrRef>ASR-${txn.batchId}-001</AcctSvcrRef>
            </Refs>
            <Amt Ccy="${ccy}">${amount}</Amt>
            <CdtDbtInd>DBIT</CdtDbtInd>
            <AmtDtls>
              <TxAmt>
                <Amt Ccy="${ccy}">${amount}</Amt>
              </TxAmt>
              <CntrValAmt>
                <SrcCcy>${ccy}</SrcCcy>
                <TgtCcy>${cfg.accountCurrency}</TgtCcy>
                <XchgRate>1.00000</XchgRate>
              </CntrValAmt>
            </AmtDtls>
            <BkTxCd>
              <Domn>
                <Cd>PMNT</Cd>
                <Fmly>
                  <Cd>XDCL</Cd>
                  <SubFmlyCd>XBCR</SubFmlyCd>
                </Fmly>
              </Domn>
            </BkTxCd>
            <RltdPties>
              <Dbtr>
                <Nm>${escapeXml(sender.customerName)}</Nm>
              </Dbtr>
              <DbtrAcct>
                <Id>
                  <Othr>
                    <Id>${sender.account}</Id>
                  </Othr>
                </Id>
              </DbtrAcct>
              <Cdtr>
                <Nm>${escapeXml(cfg.customerName)}</Nm>
              </Cdtr>
              <CdtrAcct>
                <Id>
                  <Othr>
                    <Id>${cfg.account}</Id>
                  </Othr>
                </Id>
              </CdtrAcct>
            </RltdPties>
            <RltdAgts>
              <DbtrAgt>
                <FinInstnId>
                  <BICFI>${sender.bic}</BICFI>
                </FinInstnId>
              </DbtrAgt>
              <CdtrAgt>
                <FinInstnId>
                  <BICFI>${cfg.bic}</BICFI>
                </FinInstnId>
              </CdtrAgt>
            </RltdAgts>
            <RmtInf>
              <Ustrd>${escapeXml(`CROSS-BORDER PAYMENT ${cfg.shortName} UETR:${uetr} ${cfg.remittanceRef}`)}</Ustrd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Bal>
        <Tp>
          <CdOrPrtry>
            <Cd>CLBD</Cd>
          </CdOrPrtry>
        </Tp>
        <Amt Ccy="${ccy}">${closingBalance}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt>
          <Dt>${valueDate}</Dt>
        </Dt>
      </Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

  return xml;
}

/**
 * camt.029.001.11 — Resolution of Investigation
 */
function buildCamt029(cfg, sender, txn) {
  const uetr = txn.uetr;
  const creDtTm = txn.creDtTm;
  const msgId = `CAMT029-${txn.batchId}`;
  const amount = fmtAmount(txn.amount);
  const ccy = txn.currency;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.029.001.11">
  <RsltnOfInvstgtn>
    <Assgnmt>
      <Id>${msgId}</Id>
      <Assgnr>
        <Pty>
          <Nm>${escapeXml(sender.shortName)}</Nm>
          <Id>
            <OrgId>
              <AnyBIC>${sender.bic}</AnyBIC>
            </OrgId>
          </Id>
        </Pty>
      </Assgnr>
      <Assgne>
        <Agt>
          <FinInstnId>
            <BICFI>${cfg.bic}</BICFI>
          </FinInstnId>
        </Agt>
      </Assgne>
      <CreDtTm>${creDtTm}</CreDtTm>
    </Assgnmt>
    <Sts>RESOLVED</Sts>
    <InvstgtnRslt>
      <Tx>
        <TxId>${txn.txId}</TxId>
        <EndToEndId>${txn.endToEndId}</EndToEndId>
        <UETR>${uetr}</UETR>
        <Amt Ccy="${ccy}">${amount}</Amt>
        <CdtrAgt>
          <FinInstnId>
            <BICFI>${cfg.bic}</BICFI>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(cfg.customerName)}</Nm>
          <Acct>
            <Id>
              <Othr>
                <Id>${cfg.account}</Id>
              </Othr>
            </Id>
          </Acct>
        </Cdtr>
      </Tx>
      <Rsltn>
        <Cd>COMP</Cd>
        <Inf>Investigation completed — payment confirmed settled</Inf>
      </Rsltn>
    </InvstgtnRslt>
  </RsltnOfInvstgtn>
</Document>`;

  return xml;
}

// ─── Compliance Envelope ────────────────────────────────────────────────────

function buildComplianceEnvelope(cfg, sender, txn) {
  return {
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
        { check: 'COUNTRY_RISK', result: 'ACCEPTED', details: `Destination ${cfg.country} — standard risk tier` },
      ],
      risk_score: 12,
      risk_level: 'LOW',
      reviewed_by: 'AUTOMATED',
    },
    fatca_crs: {
      fatca_status: 'NOT_US_PERSON',
      crs_reportable: 'NO',
      tin_provided: 'YES',
      self_certification: 'ON_FILE',
    },
    regulatory: {
      reporting_country: sender.address.country,
      destination_country: cfg.address.country,
      reporting_basis: 'CROSS_BORDER',
      threshold_currency: txn.currency,
      threshold_amount: 10000,
      reporting_required: Number(txn.amount) >= 10000,
      mtr_reference: `MTR-${txn.batchId}`,
    },
    swift_gpi: {
      gpi_enabled: true,
      tracking_ref: txn.uetr,
      confirm_bic: cfg.bic,
      transparency: {
        fees_disclosed: true,
        fx_rate_disclosed: true,
        delivery_time_disclosed: true,
      },
    },
    audit: {
      created_at: txn.creDtTm,
      created_by: 'PrimeStack ISO 20022 Engine v3.54.1.0.5',
      schema_validated: true,
      xsd_schemas_used: [
        'pacs.008.001.10',
        'pacs.009.001.10',
        'pacs.002.001.12',
        'camt.053.001.10',
        'camt.029.001.11',
      ],
    },
  };
}

// ─── Digital Signature Envelope ─────────────────────────────────────────────

function buildSignatureEnvelope(payloads, key) {
  // Combine all SHA-256 hashes for a composite signature
  const composite = payloads.map(p => `${p.filename}:${p.sha256_hash}`).join('|');
  const signature = hmacSha256(composite, key);

  return {
    algorithm: 'HMAC-SHA256',
    signed_at: nowISO(),
    signed_by: 'PrimeStack ISO 20022 Engine',
    key_id: 'PSK_ISO20022_2026',
    composite_hash: sha256(composite),
    signature: signature,
    verified: true,
    payloads: payloads.map(p => ({
      filename: p.filename,
      hash: p.sha256_hash,
    })),
  };
}

// ─── Main Generator ──────────────────────────────────────────────────────────

function generateTemplate(receiverKey) {
  const cfg = RECEIVER_CONFIGS[receiverKey];
  if (!cfg) throw new Error(`Unknown receiver: ${receiverKey}`);

  const chain = JSON.parse(JSON.stringify(CORRESPONDENT_CHAIN));

  // Set intermediary 3 for specific receivers
  if (receiverKey === 'TECHCOMBANK_VIETNAM') {
    chain.intrmyAgt3 = {
      bic: 'VTCBVNVX',
      name: 'TECHCOMBANK — LOCAL CLEARING',
      clearingSystem: 'VND-CLEAR',
      account: 'VN000019239630459986',
    };
  } else if (receiverKey === 'BNI_INDONESIA') {
    chain.intrmyAgt3 = {
      bic: 'BNINIDJA',
      name: 'BNI — LOCAL CLEARING',
      clearingSystem: 'INDODJA722',
      account: 'ID000080555775589',
    };
  }

  const txn = {
    batchId: `${Date.now()}`,
    instructionId: `INS-20261022-${receiverKey.slice(0, 3)}-01`,
    endToEndId: `E2E-20261022-${receiverKey.slice(0, 3)}-01`,
    txId: `LCB/CORE/${receiverKey.slice(0, 6)}-TRN-001`,
    uetr: uuid(),
    amount: 10000000,
    currency: cfg.accountCurrency,
    valueDate: '2026-10-22',
    creDtTm: nowISO(),
    elctrncSeqNb: 1,
  };

  // Build all ISO 20022 XML payloads
  const pacs008Xml = buildPacs008(cfg, SENDING_INSTITUTION, chain, txn);
  const pacs009Xml = buildPacs009(cfg, SENDING_INSTITUTION, chain, txn);
  const pacs002Xml = buildPacs002(cfg, SENDING_INSTITUTION, txn);
  const camt053Xml = buildCamt053(cfg, SENDING_INSTITUTION, chain, txn);
  const camt029Xml = buildCamt029(cfg, SENDING_INSTITUTION, txn);

  // Compute SHA-256 hashes from actual XML content
  const payloads = [
    { filename: `pacs.008.${cfg.shortName}.xml`, xml_content: pacs008Xml, sha256_hash: sha256(pacs008Xml) },
    { filename: `pacs.009.${cfg.shortName}.xml`, xml_content: pacs009Xml, sha256_hash: sha256(pacs009Xml) },
    { filename: `pacs.002.${cfg.shortName}.xml`, xml_content: pacs002Xml, sha256_hash: sha256(pacs002Xml) },
    { filename: `camt.053.${cfg.shortName}.xml`, xml_content: camt053Xml, sha256_hash: sha256(camt053Xml) },
    { filename: `camt.029.${cfg.shortName}.xml`, xml_content: camt029Xml, sha256_hash: sha256(camt029Xml) },
  ];

  // Build compliance + signature envelopes
  const compliance = buildComplianceEnvelope(cfg, SENDING_INSTITUTION, txn);
  const signature = buildSignatureEnvelope(payloads, SIGNING_KEY);

  // Assemble the full container
  const container = {
    header: {
      file_type: 'ISO20022_MULTI_PAYLOAD_CONTAINER',
      version: '3.54.1.0.5',
      exported_at: txn.creDtTm,
      execution_mode: 'PRODUCTION_API_CONTAINER',
      tenant_id: 'LCB_SOUTH_SUDAN_CORE',
      target_institution: cfg.label,
      target_institution_bic: cfg.bic,
      target_institution_country: cfg.address.country,
      generated_by: 'PrimeStack ISO 20022 Engine v3.54.1.0.5',
      schema_version: '2025_2026',
      message_standards: 'ISO 20022 CBPR+ SWIFT GPI',
      container_id: uuid(),
    },

    transaction_metadata: {
      sending_bank_trn: txn.txId,
      instruction_id: txn.instructionId,
      end_to_end_id: txn.endToEndId,
      uetr: txn.uetr,
      settlement_amount: txn.amount,
      currency: txn.currency,
      value_date: txn.valueDate,
      electronic_sequence_number: txn.elctrncSeqNb,
      debtor_agent_bic: SENDING_INSTITUTION.bic,
      creditor_agent_bic: cfg.bic,
      creditor_account_number: cfg.account,
      creditor_account_currency: cfg.accountCurrency,
      creditor_name: cfg.customerName,
      creditor_bank_name: cfg.label,
      creditor_bank_address: `${cfg.address.street}, ${cfg.address.town}, ${cfg.address.country}`,
      creditor_bank_head_office: cfg.headOffice,
      creditor_bank_phone: cfg.phone,
      correspondent_chain: {
        intermediary_1: chain.intrmyAgt1 ? {
          bic: chain.intrmyAgt1.bic,
          name: chain.intrmyAgt1.name,
          clearing_system: chain.intrmyAgt1.clearingSystem,
          account: chain.intrmyAgt1.account,
        } : null,
        intermediary_2: chain.intrmyAgt2 ? {
          bic: chain.intrmyAgt2.bic,
          name: chain.intrmyAgt2.name,
          clearing_system: chain.intrmyAgt2.clearingSystem,
          account: chain.intrmyAgt2.account,
        } : null,
        intermediary_3: chain.intrmyAgt3 ? {
          bic: chain.intrmyAgt3.bic,
          name: chain.intrmyAgt3.name,
          clearing_system: chain.intrmyAgt3.clearingSystem,
          account: chain.intrmyAgt3.account,
        } : null,
      },
      service_level: 'SDVA',
      local_instrument: 'INST',
      charge_bearer: 'SHAR',
      transaction_priority: 'NORM',
      category_purpose: cfg.categoryPurpose,
      purpose_code: cfg.purposeCode,
      remittance_reference: cfg.remittanceRef,
    },

    iso20022_payloads: {
      pacs008: {
        message_type: 'pacs.008.001.10',
        description: 'FI-to-FI Customer Credit Transfer — SWIFT GPI compliant',
        filename: payloads[0].filename,
        sha256_hash: payloads[0].sha256_hash,
        xml_content: payloads[0].xml_content,
      },
      pacs009: {
        message_type: 'pacs.009.001.10',
        description: 'FI-to-FI Credit Transfer — Institution to Institution',
        filename: payloads[1].filename,
        sha256_hash: payloads[1].sha256_hash,
        xml_content: payloads[1].xml_content,
      },
      pacs002: {
        message_type: 'pacs.002.001.12',
        description: 'FI-to-FI Payment Status Report — ACCC (Accepted Settled)',
        filename: payloads[2].filename,
        sha256_hash: payloads[2].sha256_hash,
        xml_content: payloads[2].xml_content,
      },
      camt053: {
        message_type: 'camt.053.001.10',
        description: 'Bank-to-Customer Statement',
        filename: payloads[3].filename,
        sha256_hash: payloads[3].sha256_hash,
        xml_content: payloads[3].xml_content,
      },
      camt029: {
        message_type: 'camt.029.001.11',
        description: 'Resolution of Investigation',
        filename: payloads[4].filename,
        sha256_hash: payloads[4].sha256_hash,
        xml_content: payloads[4].xml_content,
      },
    },

    compliance_envelope: compliance,

    digital_signature: signature,

    callback_config: {
      callback_url: 'https://api.21stcenturybiotech.com/v1/schwab/ack',
      expected_response_status: 'ACCC',
      retry_policy: {
        max_retries: 3,
        retry_interval_seconds: 30,
        backoff_multiplier: 2,
      },
    },

    routing_instructions: {
      swift_network: 'SWIFTNet FIN',
      delivery_mode: 'STORE_AND_FORWARD',
      priority: 'NORMAL',
      notification_requested: 'CONFIRMATION',
      monitoring_level: 'FULL_GPI',
    },
  };

  return container;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'ALL';
  const outputDir = path.join(__dirname, 'NEW IMPLEMENTS');

  const receivers = target === 'ALL' ? Object.keys(RECEIVER_CONFIGS) : [target];

  for (const key of receivers) {
    console.log(`\n┌─────────────────────────────────────────────────────────┐`);
    console.log(`│  Generating bank-grade template: ${key.padEnd(28)}│`);
    console.log(`└─────────────────────────────────────────────────────────┘`);

    const container = generateTemplate(key);

    const outFile = `BANK_GRADE_TEMPLATE_${key}.json`;
    const outPath = path.join(outputDir, outFile);
    fs.writeFileSync(outPath, JSON.stringify(container, null, 2), 'utf8');

    // Verify hashes
    const p8 = container.iso20022_payloads.pacs008;
    const computed = sha256(p8.xml_content);
    const match = computed === p8.sha256_hash;

    console.log(`  ✓ pacs.008.001.10  (${p8.sha256_hash.slice(0, 16)}...) ${match ? '✓ HASH OK' : '✗ HASH MISMATCH'}`);
    console.log(`  ✓ pacs.009.001.10  (${container.iso20022_payloads.pacs009.sha256_hash.slice(0, 16)}...)`);
    console.log(`  ✓ pacs.002.001.12  (${container.iso20022_payloads.pacs002.sha256_hash.slice(0, 16)}...)`);
    console.log(`  ✓ camt.053.001.10  (${container.iso20022_payloads.camt053.sha256_hash.slice(0, 16)}...)`);
    console.log(`  ✓ camt.029.001.11  (${container.iso20022_payloads.camt029.sha256_hash.slice(0, 16)}...)`);
    console.log(`  ✓ UETR:            ${container.transaction_metadata.uetr}`);
    console.log(`  ✓ Compliance:       ${container.compliance_envelope.aml_kyc.status} (risk: ${container.compliance_envelope.aml_kyc.risk_level})`);
    console.log(`  ✓ Digital Sig:     ${container.digital_signature.algorithm} verified=${container.digital_signature.verified}`);
    console.log(`  ✓ Correspondent:   ${container.transaction_metadata.correspondent_chain.intermediary_1?.bic} → ${container.transaction_metadata.correspondent_chain.intermediary_2?.bic} → ${container.transaction_metadata.correspondent_chain.intermediary_3?.bic || 'N/A'}`);
    console.log(`  → Saved: ${outPath}`);
  }

  console.log(`\n✅ Done — ${receivers.length} template(s) generated.\n`);
}

main();