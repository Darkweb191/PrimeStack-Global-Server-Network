import { randomUUID } from "crypto";
import type { SwiftPayoutDraftInput } from "./swift-payout.types.js";

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      "\"": "&quot;",
    };
    return entities[character] ?? character;
  });
}

function element(name: string, value: string | undefined): string {
  return value ? `<${name}>${xmlEscape(value)}</${name}>` : "";
}

function address(party: SwiftPayoutDraftInput["debtor"]): string {
  return `<PstlAdr>${element("StrtNm", party.streetName)}${element("BldgNb", party.buildingNumber)}${element("PstCd", party.postalCode)}${element("TwnNm", party.townName)}${element("Ctry", party.country)}</PstlAdr>`;
}

function agent(party: SwiftPayoutDraftInput["debtor"]): string {
  return `<FinInstnId>${element("BICFI", party.agentBic)}${element("Nm", party.agentName)}</FinInstnId>`;
}

function account(party: SwiftPayoutDraftInput["debtor"]): string {
  return `<Id><IBAN>${xmlEscape(party.iban)}</IBAN></Id>`;
}

export type GeneratedSwiftPayoutDraft = {
  status: "DRAFT_NOT_SENT";
  messageId: string;
  endToEndId: string;
  uetr: string;
  format: "pacs.008.001.08";
  xml: string;
};

export function generateSwiftPayoutDraft(input: SwiftPayoutDraftInput): GeneratedSwiftPayoutDraft {
  const messageId = `PAG${randomUUID().replaceAll("-", "").toUpperCase()}`;
  const endToEndId = input.endToEndId || messageId;
  const uetr = randomUUID();
  const createdAt = new Date().toISOString();
  const instructedAmount = input.instructedAmount ?? input.settlementAmount;
  const instructedCurrency = input.instructedCurrency ?? input.settlementCurrency;
  const paymentType = `${input.localInstrument ? `<LclInstrm>${element("Prtry", input.localInstrument)}</LclInstrm>` : ""}${input.categoryPurpose ? `<CtgyPurp>${element("Prtry", input.categoryPurpose)}</CtgyPurp>` : ""}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${messageId}</MsgId>
      <CreDtTm>${createdAt}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf><SttlmMtd>${input.settlementMethod}</SttlmMtd></SttlmInf>
      <InstgAgt>${agent(input.debtor)}</InstgAgt>
      <InstdAgt>${agent(input.creditor)}</InstdAgt>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${messageId}</InstrId>
        <EndToEndId>${xmlEscape(endToEndId)}</EndToEndId>
        <UETR>${uetr}</UETR>
      </PmtId>
      ${paymentType ? `<PmtTpInf>${paymentType}</PmtTpInf>` : ""}
      <IntrBkSttlmAmt Ccy="${input.settlementCurrency}">${input.settlementAmount}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${input.settlementDate}</IntrBkSttlmDt>
      <InstdAmt Ccy="${instructedCurrency}">${instructedAmount}</InstdAmt>
      <ChrgBr>${input.chargeBearer}</ChrgBr>
      <Dbtr><Nm>${xmlEscape(input.debtor.name)}</Nm>${address(input.debtor)}</Dbtr>
      <DbtrAcct>${account(input.debtor)}</DbtrAcct>
      <DbtrAgt>${agent(input.debtor)}</DbtrAgt>
      <CdtrAgt>${agent(input.creditor)}</CdtrAgt>
      <Cdtr><Nm>${xmlEscape(input.creditor.name)}</Nm>${address(input.creditor)}</Cdtr>
      <CdtrAcct>${account(input.creditor)}</CdtrAcct>
      ${input.remittanceInformation ? `<RmtInf><Ustrd>${xmlEscape(input.remittanceInformation)}</Ustrd></RmtInf>` : ""}
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

  return {
    status: "DRAFT_NOT_SENT",
    messageId,
    endToEndId,
    uetr,
    format: "pacs.008.001.08",
    xml,
  };
}
