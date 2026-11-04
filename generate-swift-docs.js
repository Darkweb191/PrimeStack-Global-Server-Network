/**
 * PrimeStack Global Payment Network
 * SWIFT MT799 / RWA / Wire Requirements Document Generator
 *
 * Produces 4 production-grade bank documents:
 *  A. MT799_RWA_SAMPLE.html          - Sample MT 799 wording for RWA pre-advice
 *  B. MT799_BANK_REQUEST_LETTER.html - Formal bank request letter for MT 799 RWA
 *  C. MT799_VERIFICATION_CHECKLIST.html - Authenticity checklist for received MT 799
 *  D. EUR5M_WIRE_REQUIREMENTS.html   - EUR 5M international wire documentation package
 *
 * Design: identical monochrome system to existing BANK_DOCUMENTS
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'NEW IMPLEMENTS', 'BANK_DOCUMENTS');

const today    = () => new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'2-digit'});
const yyyymmdd = () => new Date().toISOString().slice(0,10).replace(/-/g,'');
const refId    = prefix => `${prefix}-${yyyymmdd()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// ─── Shared CSS (identical to existing bank documents) ───────────────────────
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#e8e8e8;color:#111;font-size:13px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.outer{width:860px;margin:28px auto;background:#fff;border:1px solid #999;box-shadow:0 2px 12px rgba(0,0,0,.12)}
.wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-26deg);font-family:Arial,sans-serif;font-size:72px;font-weight:900;color:rgba(0,0,0,.035);pointer-events:none;white-space:nowrap;z-index:0;letter-spacing:6px;user-select:none}
.rel{position:relative;z-index:1}
/* Letterhead */
.lh{padding:22px 36px 18px;border-bottom:3px solid #000;display:flex;justify-content:space-between;align-items:flex-start}
.lh-brand .bn{font-size:17px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#000}
.lh-brand .bs{font-size:9px;color:#555;letter-spacing:3px;text-transform:uppercase;margin-top:3px}
.lh-brand .bd{display:inline-block;border:2px solid #000;padding:4px 12px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:10px}
.lh-meta{text-align:right;font-size:11px;color:#333;line-height:1.9}
.lh-meta .lm-title{font-size:13px;font-weight:700;color:#000;margin-bottom:4px;letter-spacing:.5px}
.lh-meta .lm-ref{font-family:'Courier New',Courier,monospace;font-size:11px;color:#333}
/* Body */
.body{padding:26px 36px 32px}
/* Section title */
.st{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#000;border-bottom:2px solid #000;padding-bottom:4px;margin:22px 0 10px}
/* Data table */
table.dt{width:100%;border-collapse:collapse;table-layout:fixed}
table.dt tr td{padding:7px 10px;border-bottom:1px solid #e8e8e8;vertical-align:top}
table.dt tr:last-child td{border-bottom:none}
table.dt tr td:first-child{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#444;width:32%;background:#f9f9f9}
table.dt tr td:last-child{font-family:'Courier New',Courier,monospace;font-size:12px;color:#111;word-break:break-all}
table.dt tr td.prose{font-family:Arial,sans-serif;font-size:12px;word-break:normal}
/* Two column */
.two{display:table;width:100%;border-collapse:collapse;margin-bottom:4px}
.two-col{display:table-cell;width:50%;vertical-align:top;border:1px solid #ddd}
.two-col+.two-col{border-left:none}
.col-hd{background:#111;color:#fff;padding:7px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px}
.col-body table{width:100%;border-collapse:collapse}
.col-body table td{padding:7px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;vertical-align:top}
.col-body table tr:last-child td{border-bottom:none}
.col-body table td:first-child{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#555;width:42%}
.col-body table td:last-child{font-family:'Courier New',Courier,monospace;font-size:12px;color:#111;word-break:break-all}
.col-body table td.prose{font-family:Arial,sans-serif;font-size:12px;word-break:normal}
/* Message box (Courier New block like real SWIFT) */
.msg-box{border:1px solid #999;background:#f5f5f5;padding:16px 20px;margin:8px 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.8;color:#111;white-space:pre-wrap;word-break:break-all}
.msg-box .msg-field{display:block}
.msg-box .msg-tag{font-weight:700}
.msg-box .msg-sep{display:block;border-top:1px dashed #bbb;margin:8px 0}
/* Checklist */
table.cl{width:100%;border-collapse:collapse}
table.cl thead tr{background:#000;color:#fff}
table.cl thead td{padding:9px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}
table.cl tbody td{padding:9px 12px;border-bottom:1px solid #e8e8e8;font-size:12px;vertical-align:top}
table.cl tbody tr:nth-child(even) td{background:#f9f9f9}
table.cl tbody td:first-child{font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;width:120px}
table.cl tbody td.prose{font-family:Arial,sans-serif}
.check-box{display:inline-block;width:14px;height:14px;border:2px solid #000;margin-right:6px;vertical-align:middle}
/* Notice / callout */
.notice{border-left:4px solid #000;padding:10px 16px;background:#f5f5f5;font-size:12px;color:#333;line-height:1.7;margin:12px 0}
.notice strong{font-family:Arial,sans-serif;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.5px}
/* Amount block */
.amt{border:2px solid #000;padding:18px 24px;text-align:center;margin-bottom:22px}
.amt-lbl{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#555;margin-bottom:7px}
.amt-val{font-family:Arial,Helvetica,sans-serif;font-size:38px;font-weight:900;color:#000;letter-spacing:2px}
.amt-sub{font-family:'Courier New',Courier,monospace;font-size:11px;color:#444;margin-top:8px}
/* Signature block */
.sig{display:table;width:100%;border-collapse:collapse;margin-top:28px}
.sig-col{display:table-cell;width:50%;vertical-align:bottom;padding-right:24px}
.sig-col+.sig-col{padding-right:0;padding-left:24px}
.sig-line{border-bottom:1px solid #000;height:40px;margin-bottom:6px}
.sig-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#555}
/* Footer */
.foot{border-top:2px solid #000;padding:9px 36px;display:flex;justify-content:space-between;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;background:#fff}
/* Footnote */
.fn{border-top:1px solid #ddd;margin-top:16px;padding-top:8px;font-size:9px;color:#888;line-height:1.7}
/* Page break for print */
@media print{body{background:#fff}.outer{margin:0;border:none;box-shadow:none}.pb{page-break-before:always}}
`;

function lh(docType, docLabel, refNo, extraMeta) {
  return `
  <div class="lh rel">
    <div class="lh-brand">
      <div class="bn">PrimeStack Global Payment Network</div>
      <div class="bs">International Settlement &amp; Clearing Services</div>
      <div class="bd">${docType}</div>
    </div>
    <div class="lh-meta">
      <div class="lm-title">${docLabel}</div>
      <div class="lm-ref">Ref: ${refNo}</div>
      <div class="lm-ref">Date: ${today()}</div>
      ${extraMeta||''}
    </div>
  </div>`;
}

function foot(left, right) {
  return `<div class="foot rel"><span>${left}</span><span>${right}</span></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. MT 799 RWA SAMPLE MESSAGE
// ═══════════════════════════════════════════════════════════════════════════════
function buildA() {
  const ref = refId('MT799-RWA');
  const swiftRef = `SWIFT/${yyyymmdd()}/${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MT 799 RWA Sample Message -- PrimeStack Global Payment Network</title>
<style>${CSS}</style>
</head>
<body>
<div class="outer">
<div style="position:relative;overflow:hidden">
<div class="wm">SAMPLE</div>

${lh('SWIFT MT 799 FREE FORMAT','Sample MT 799 -- RWA Pre-Advice',ref,`<div class="lm-ref">Classification: Confidential</div><div class="lm-ref">Format: SWIFT MT 799 Free Format</div>`)}

<div class="body">

  <div class="notice"><strong>Important Notice:</strong> This is a sample document only. An MT 799 is a free-format SWIFT message. It is NOT a payment, guarantee, blocked funds certificate, or proof of available funds. The wording must be agreed between the sending and receiving banks before issuance. PrimeStack Global Payment Network makes no representation as to enforceability or legal effect in any jurisdiction.</div>

  <div class="st">SWIFT Message Header</div>
  <table class="dt">
    <tr><td>Message Type</td><td>MT 799</td></tr>
    <tr><td>Message Format</td><td class="prose">Free Format -- Category 7 (Treasury Markets)</td></tr>
    <tr><td>Sender BIC</td><td>[SENDING BANK BIC8/BIC11]</td></tr>
    <tr><td>Receiver BIC</td><td>[RECEIVING BANK BIC8/BIC11]</td></tr>
    <tr><td>SWIFT Reference</td><td>${swiftRef}</td></tr>
    <tr><td>Message Priority</td><td class="prose">Normal</td></tr>
    <tr><td>Date/Time</td><td>${yyyymmdd()}/[HHMM]+[TIMEZONE]</td></tr>
  </table>

  <div class="st">MT 799 Mandatory Fields</div>
  <div class="msg-box">:20:  TRANSACTION REFERENCE NUMBER
      [Unique reference assigned by sender -- max 16 chars]
      Example: RWA-${yyyymmdd()}-001

:21:  RELATED REFERENCE
      [Reference of the related transaction or instruction]
      Example: TXN-REF-${crypto.randomBytes(3).toString('hex').toUpperCase()}

:79:  NARRATIVE TEXT (Free Format -- max 35 lines x 50 chars)
[Lines begin below]</div>

  <div class="st">Sample MT 799 RWA Narrative -- Field :79:</div>
  <div class="msg-box">:79:
WE, [FULL LEGAL NAME OF SENDING BANK],
[BANK ADDRESS],
[CITY, COUNTRY],
SWIFT BIC: [SENDING BANK BIC],

HEREBY CONFIRM TO [FULL LEGAL NAME OF RECEIVING BANK],
[RECEIVING BANK ADDRESS],
SWIFT BIC: [RECEIVING BANK BIC],

THAT OUR CLIENT:

COMPANY NAME  : [FULL LEGAL NAME OF CLIENT]
REGISTRATION  : [COMPANY REGISTRATION NUMBER]
ADDRESS       : [REGISTERED ADDRESS]

IS READY, WILLING AND ABLE TO PROCEED WITH THE
FOLLOWING PROPOSED TRANSACTION, SUBJECT TO
SATISFACTORY COMPLETION OF ALL DUE DILIGENCE,
COMPLIANCE REVIEW, AND APPLICABLE CONDITIONS:

TRANSACTION   : [BRIEF DESCRIPTION OF TRANSACTION]
AMOUNT        : [CURRENCY AND AMOUNT IN FIGURES AND WORDS]
VALUE DATE    : [DD/MM/YYYY OR AS AGREED]
PURPOSE       : [STATED PURPOSE OF FUNDS]
REFERENCE     : [APPLICABLE CONTRACT OR AGREEMENT REFERENCE]

THIS MESSAGE IS ISSUED FOR BANKING COMMUNICATION
PURPOSES ONLY. IT DOES NOT CONSTITUTE A GUARANTEE,
BLOCKED FUNDS CERTIFICATE, IRREVOCABLE UNDERTAKING,
OR CONFIRMATION OF CLEARED FUNDS. THE TRANSACTION IS
SUBJECT TO INTERNAL APPROVAL, DUE DILIGENCE, AND ALL
APPLICABLE LAWS AND REGULATIONS.

THIS MESSAGE IS AUTHENTICATED VIA SWIFT AND SUBJECT TO
THE UNIFORM RULES FOR BANK-TO-BANK REIMBURSEMENTS.

AUTHORISED SIGNATORY:   [NAME / TITLE]
AUTHORISED SIGNATORY:   [NAME / TITLE]

[BANK NAME]
[DATE]
SWIFT REF: ${swiftRef}</div>

  <div class="st">Key Field Requirements</div>
  <table class="cl">
    <thead><tr><td>Field</td><td>Tag</td><td>Format</td><td>Requirement</td></tr></thead>
    <tbody>
      <tr><td>Transaction Ref</td><td>:20:</td><td class="prose">16x alphanumeric</td><td class="prose">Mandatory. Unique sender reference.</td></tr>
      <tr><td>Related Reference</td><td>:21:</td><td class="prose">16x alphanumeric</td><td class="prose">Mandatory. Reference of related transaction.</td></tr>
      <tr><td>Narrative</td><td>:79:</td><td class="prose">Max 35 lines, 50 chars/line</td><td class="prose">Mandatory. Free text. No structured fields.</td></tr>
    </tbody>
  </table>

  <div class="st">Legal and Compliance Notes</div>
  <div class="notice"><strong>Note 1:</strong> An MT 799 is not a guarantee. It carries no payment obligation. The receiving bank should not rely on it as evidence of blocked or reserved funds without independent verification.</div>
  <div class="notice"><strong>Note 2:</strong> The narrative must be agreed between both banks prior to issuance. Unagreed or unsolicited MT 799 messages should be treated with caution.</div>
  <div class="notice"><strong>Note 3:</strong> MT 799 belongs to SWIFT MT legacy format. ISO 20022 uses separate structured message types. Participating in CBPR+ does not convert an MT 799 into an ISO 20022 message.</div>
  <div class="notice"><strong>Note 4:</strong> This sample is for reference only. Actual wording must be reviewed by qualified legal and compliance counsel in the applicable jurisdiction.</div>

  <div class="fn">Document Ref: ${ref} -- Generated ${today()} -- PrimeStack Global Payment Network ISO 20022 Engine v3.54 -- For internal reference only. This document does not constitute legal advice. &copy; ${new Date().getFullYear()} PrimeStack Global Payment Network. All rights reserved.</div>

</div>
${foot('PrimeStack Global Payment Network -- SWIFT MT 799 Sample',`${ref} -- ${today()}`)}
</div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// B. BANK REQUEST LETTER FOR MT 799 RWA
// ═══════════════════════════════════════════════════════════════════════════════
function buildB() {
  const ref = refId('REQ-MT799');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bank Request Letter -- MT 799 RWA -- PrimeStack Global Payment Network</title>
<style>${CSS}</style>
</head>
<body>
<div class="outer">
<div style="position:relative;overflow:hidden">
<div class="wm">CONFIDENTIAL</div>

${lh('FORMAL BANK REQUEST','Request for Issuance of MT 799 RWA Message',ref,`<div class="lm-ref">Classification: Strictly Confidential</div><div class="lm-ref">Delivery: Via Secure Courier / Authenticated SWIFT</div>`)}

<div class="body">

  <div class="st">Addressee</div>
  <table class="dt">
    <tr><td>To</td><td class="prose">[FULL LEGAL NAME OF ISSUING BANK]</td></tr>
    <tr><td>Department</td><td class="prose">Corporate Banking / Trade Finance / International Transfers</td></tr>
    <tr><td>Address</td><td class="prose">[BANK FULL ADDRESS]</td></tr>
    <tr><td>SWIFT BIC</td><td>[ISSUING BANK BIC8/BIC11]</td></tr>
    <tr><td>Attention</td><td class="prose">[NAME OF RELATIONSHIP MANAGER / OFFICER]</td></tr>
    <tr><td>Account Number</td><td>[CLIENT ACCOUNT NUMBER AT ISSUING BANK]</td></tr>
  </table>

  <div class="st">From</div>
  <table class="dt">
    <tr><td>Client Name</td><td class="prose">[FULL LEGAL NAME OF REQUESTING ENTITY]</td></tr>
    <tr><td>Registration</td><td>[COMPANY REGISTRATION NUMBER]</td></tr>
    <tr><td>Address</td><td class="prose">[REGISTERED ADDRESS]</td></tr>
    <tr><td>Authorised Rep.</td><td class="prose">[NAME AND TITLE OF AUTHORISED SIGNATORY]</td></tr>
    <tr><td>Contact</td><td class="prose">[EMAIL] / [TELEPHONE]</td></tr>
    <tr><td>Date</td><td class="prose">${today()}</td></tr>
    <tr><td>Our Reference</td><td>${ref}</td></tr>
  </table>

  <div class="st">Subject</div>
  <div class="notice" style="font-size:13px;font-weight:700;font-family:Arial,sans-serif;color:#000">
    Formal Request: Issuance of SWIFT MT 799 Free-Format Message for Ready, Willing and Able (RWA) Pre-Advice
  </div>

  <div class="st">Request Body</div>
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.9;color:#111">

    <p style="margin-bottom:14px">Dear [BANK OFFICER NAME / DEPARTMENT],</p>

    <p style="margin-bottom:14px">We write to formally request that [FULL LEGAL NAME OF ISSUING BANK] issue an authenticated SWIFT MT 799 free-format message on our behalf to the following receiving institution:</p>

    <table class="dt" style="margin-bottom:16px">
      <tr><td>Receiving Bank</td><td class="prose">[FULL LEGAL NAME OF RECEIVING BANK]</td></tr>
      <tr><td>Receiving BIC</td><td>[RECEIVING BANK BIC8/BIC11]</td></tr>
      <tr><td>Receiving Bank Address</td><td class="prose">[RECEIVING BANK ADDRESS]</td></tr>
      <tr><td>Attention</td><td class="prose">[RECEIVING BANK OFFICER / DEPARTMENT]</td></tr>
    </table>

    <p style="margin-bottom:14px">The purpose of the MT 799 is to provide a Ready, Willing and Able (RWA) pre-advice communication in connection with the following proposed transaction:</p>

    <table class="dt" style="margin-bottom:16px">
      <tr><td>Transaction Type</td><td class="prose">[DESCRIPTION OF TRANSACTION]</td></tr>
      <tr><td>Amount</td><td>[CURRENCY] [AMOUNT IN FIGURES]</td></tr>
      <tr><td>Amount in Words</td><td class="prose">[AMOUNT WRITTEN IN FULL]</td></tr>
      <tr><td>Proposed Value Date</td><td class="prose">[DD/MM/YYYY]</td></tr>
      <tr><td>Counterparty</td><td class="prose">[NAME OF COUNTERPARTY]</td></tr>
      <tr><td>Contract Reference</td><td>[CONTRACT / AGREEMENT REFERENCE]</td></tr>
      <tr><td>Purpose of Funds</td><td class="prose">[STATED PURPOSE]</td></tr>
    </table>

    <p style="margin-bottom:14px">We request that the MT 799 narrative include a statement confirming that we are Ready, Willing and Able to proceed with the above transaction, subject to completion of all required due diligence, compliance review, and applicable regulatory approvals. The exact wording should be agreed between both banks prior to transmission.</p>

    <p style="margin-bottom:14px">We acknowledge and confirm the following:</p>

    <table class="cl" style="margin-bottom:16px">
      <thead><tr><td>Item</td><td>Acknowledgement</td></tr></thead>
      <tbody>
        <tr><td><span class="check-box"></span>1</td><td class="prose">We understand that an MT 799 does not constitute a guarantee, blocked funds certificate, or irrevocable payment undertaking.</td></tr>
        <tr><td><span class="check-box"></span>2</td><td class="prose">We understand that the narrative wording must be agreed between the sending and receiving banks.</td></tr>
        <tr><td><span class="check-box"></span>3</td><td class="prose">We authorise [ISSUING BANK] to use its discretion in determining whether it is appropriate to issue the requested message.</td></tr>
        <tr><td><span class="check-box"></span>4</td><td class="prose">We confirm that all information provided in support of this request is true, complete and accurate.</td></tr>
        <tr><td><span class="check-box"></span>5</td><td class="prose">We consent to the bank conducting any required KYC / AML verification prior to issuance.</td></tr>
        <tr><td><span class="check-box"></span>6</td><td class="prose">We agree to indemnify [ISSUING BANK] against any claims arising from issuance of the MT 799 in reliance on our instructions.</td></tr>
      </tbody>
    </table>

    <p style="margin-bottom:14px">Please confirm receipt of this request and advise us of any additional documentation, fees, or procedures required to process the issuance.</p>

    <p style="margin-bottom:14px">We are available to discuss this request at your convenience. Please contact us at the details provided above.</p>

    <p style="margin-bottom:28px">Yours faithfully,</p>

  </div>

  <div class="sig">
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Authorised Signatory</div>
      <div style="font-size:11px;color:#555;margin-top:4px;font-family:Arial,sans-serif">[Name] / [Title]</div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Authorised Signatory (if required)</div>
      <div style="font-size:11px;color:#555;margin-top:4px;font-family:Arial,sans-serif">[Name] / [Title]</div>
    </div>
  </div>

  <div style="margin-top:22px">
  <div class="st">Documents Enclosed / To Be Provided</div>
  <table class="cl">
    <thead><tr><td>Item</td><td>Document</td><td>Status</td></tr></thead>
    <tbody>
      <tr><td><span class="check-box"></span>1</td><td class="prose">Certified copy of Certificate of Incorporation / Registration</td><td class="prose">[ ] Enclosed&nbsp;&nbsp;[ ] To Follow</td></tr>
      <tr><td><span class="check-box"></span>2</td><td class="prose">Certified copy of Memorandum and Articles of Association</td><td class="prose">[ ] Enclosed&nbsp;&nbsp;[ ] To Follow</td></tr>
      <tr><td><span class="check-box"></span>3</td><td class="prose">Board Resolution authorising this request</td><td class="prose">[ ] Enclosed&nbsp;&nbsp;[ ] To Follow</td></tr>
      <tr><td><span class="check-box"></span>4</td><td class="prose">Proof of identity of authorised signatories (passport / national ID)</td><td class="prose">[ ] Enclosed&nbsp;&nbsp;[ ] To Follow</td></tr>
      <tr><td><span class="check-box"></span>5</td><td class="prose">Copy of underlying transaction agreement / contract</td><td class="prose">[ ] Enclosed&nbsp;&nbsp;[ ] To Follow</td></tr>
      <tr><td><span class="check-box"></span>6</td><td class="prose">Source of funds documentation</td><td class="prose">[ ] Enclosed&nbsp;&nbsp;[ ] To Follow</td></tr>
      <tr><td><span class="check-box"></span>7</td><td class="prose">Completed bank MT 799 issuance request form (if required by bank)</td><td class="prose">[ ] Enclosed&nbsp;&nbsp;[ ] To Follow</td></tr>
    </tbody>
  </table>
  </div>

  <div class="fn">Document Ref: ${ref} -- Generated ${today()} -- PrimeStack Global Payment Network -- This template is for reference only. Seek qualified legal advice before submission. &copy; ${new Date().getFullYear()} PrimeStack Global Payment Network.</div>

</div>
${foot('PrimeStack Global Payment Network -- MT 799 Request Letter',`${ref} -- ${today()}`)}
</div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// C. MT 799 VERIFICATION / AUTHENTICITY CHECKLIST
// ═══════════════════════════════════════════════════════════════════════════════
function buildC() {
  const ref = refId('VERIF-MT799');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MT 799 Verification Checklist -- PrimeStack Global Payment Network</title>
<style>${CSS}</style>
</head>
<body>
<div class="outer">
<div style="position:relative;overflow:hidden">
<div class="wm">VERIFICATION</div>

${lh('COMPLIANCE DOCUMENT','MT 799 Authenticity Verification Checklist',ref,`<div class="lm-ref">Classification: Confidential</div><div class="lm-ref">Purpose: Due Diligence / Compliance Review</div>`)}

<div class="body">

  <div class="notice"><strong>Purpose:</strong> This checklist is used to assess whether a received MT 799 message is authentic, correctly structured, and appropriate for the stated purpose. It does not constitute legal advice. Findings should be reviewed by qualified compliance and legal counsel before reliance.</div>

  <div class="st">Section 1 -- Message Source Verification</div>
  <table class="cl">
    <thead><tr><td>Check</td><td>Item</td><td>Expected</td><td>Finding</td><td>Pass / Fail</td></tr></thead>
    <tbody>
      <tr><td>1.1</td><td class="prose">Sender BIC is a real, live SWIFT member</td><td class="prose">Verify at swift.com/bic-directory</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>1.2</td><td class="prose">Sender BIC matches the bank named in the narrative</td><td class="prose">BIC and bank name consistent</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>1.3</td><td class="prose">Message was received via authenticated SWIFT channel (not email or PDF)</td><td class="prose">Received via SWIFTNet only</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>1.4</td><td class="prose">Message authentication (MAC / LAK) verified by your SWIFT interface</td><td class="prose">Authentication confirmed</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>1.5</td><td class="prose">Receiver BIC matches your institution</td><td class="prose">Addressed to us</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>1.6</td><td class="prose">Sending bank contacted directly (via known SWIFT or phone) to confirm issuance</td><td class="prose">Verbal / written confirmation obtained</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
    </tbody>
  </table>

  <div class="st">Section 2 -- Message Structure Verification</div>
  <table class="cl">
    <thead><tr><td>Check</td><td>Item</td><td>Expected</td><td>Finding</td><td>Pass / Fail</td></tr></thead>
    <tbody>
      <tr><td>2.1</td><td class="prose">Field :20: (Transaction Reference) present and not blank</td><td class="prose">Max 16 chars, no special chars except / and -</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>2.2</td><td class="prose">Field :21: (Related Reference) present</td><td class="prose">Max 16 chars</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>2.3</td><td class="prose">Field :79: (Narrative) does not exceed 35 lines of 50 characters</td><td class="prose">Within SWIFT character limits</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>2.4</td><td class="prose">No structured payment fields present (MT 799 is free format only)</td><td class="prose">No :32A:, :50:, :59:, etc.</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>2.5</td><td class="prose">Message category is 7xx (Treasury / Financial Institution)</td><td class="prose">Not 1xx, 2xx, 9xx</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>2.6</td><td class="prose">Date/time stamp in message header is consistent with receipt date</td><td class="prose">Within 1-2 business days</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
    </tbody>
  </table>

  <div class="st">Section 3 -- Content Verification</div>
  <table class="cl">
    <thead><tr><td>Check</td><td>Item</td><td>Expected</td><td>Finding</td><td>Pass / Fail</td></tr></thead>
    <tbody>
      <tr><td>3.1</td><td class="prose">Full legal name of sending bank stated in narrative</td><td class="prose">Matches BIC registration</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>3.2</td><td class="prose">Full legal name of client / instructing party stated</td><td class="prose">Matches KYC-verified client name</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>3.3</td><td class="prose">Transaction amount and currency clearly stated</td><td class="prose">Figures and words consistent</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>3.4</td><td class="prose">Message does not claim to be a guarantee, payment, or blocked funds certificate</td><td class="prose">No such representations</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>3.5</td><td class="prose">Authorised signatories named and their authority confirmed with sending bank</td><td class="prose">Verified against bank signatory list</td><td class="prose">[ ]</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
      <tr><td>3.6</td><td class="prose">Purpose of transaction clearly stated and consistent with our KYC/AML records</td><td class="prose">Purpose plausible and documented</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td><td class="prose">[ ] Pass&nbsp;&nbsp;[ ] Fail</td></tr>
    </tbody>
  </table>

  <div class="st">Section 4 -- Red Flags / Fraud Indicators</div>
  <table class="cl">
    <thead><tr><td>Check</td><td>Red Flag Indicator</td><td>Present?</td><td>Action Required</td></tr></thead>
    <tbody>
      <tr><td>4.1</td><td class="prose">Message received via email, fax, or PDF only (not via SWIFT)</td><td class="prose">[ ] Yes&nbsp;&nbsp;[ ] No</td><td class="prose">REJECT. Authentic SWIFT messages are never transmitted via email.</td></tr>
      <tr><td>4.2</td><td class="prose">Message claims to constitute proof of blocked or reserved funds</td><td class="prose">[ ] Yes&nbsp;&nbsp;[ ] No</td><td class="prose">REJECT. MT 799 cannot block funds. Escalate to compliance.</td></tr>
      <tr><td>4.3</td><td class="prose">Sender BIC does not exist or is inactive in SWIFT directory</td><td class="prose">[ ] Yes&nbsp;&nbsp;[ ] No</td><td class="prose">REJECT immediately. Report to SWIFT and local regulator.</td></tr>
      <tr><td>4.4</td><td class="prose">Narrative contains requests for fees, advance payment, or "release" of funds</td><td class="prose">[ ] Yes&nbsp;&nbsp;[ ] No</td><td class="prose">REJECT. Classic advance fee fraud indicator.</td></tr>
      <tr><td>4.5</td><td class="prose">Sending bank cannot confirm issuance when contacted directly</td><td class="prose">[ ] Yes&nbsp;&nbsp;[ ] No</td><td class="prose">REJECT. Do not rely on message. Escalate.</td></tr>
      <tr><td>4.6</td><td class="prose">Message references non-existent SWIFT message types (e.g. MT 760 as "payment")</td><td class="prose">[ ] Yes&nbsp;&nbsp;[ ] No</td><td class="prose">REJECT. Seek legal and compliance review immediately.</td></tr>
      <tr><td>4.7</td><td class="prose">Unusually high-value transaction with no underlying commercial documentation</td><td class="prose">[ ] Yes&nbsp;&nbsp;[ ] No</td><td class="prose">Escalate to compliance and MLRO before proceeding.</td></tr>
    </tbody>
  </table>

  <div class="st">Section 5 -- Verification Outcome</div>
  <table class="dt">
    <tr><td>Date of Review</td><td class="prose">_______________________________</td></tr>
    <tr><td>Reviewer Name</td><td class="prose">_______________________________</td></tr>
    <tr><td>Reviewer Title</td><td class="prose">_______________________________</td></tr>
    <tr><td>Total Checks Passed</td><td class="prose">_______ / 25</td></tr>
    <tr><td>Red Flags Identified</td><td class="prose">[ ] None&nbsp;&nbsp;[ ] Yes -- see notes</td></tr>
    <tr><td>Overall Result</td><td class="prose">[ ] PASS -- Proceed with verification&nbsp;&nbsp;[ ] FAIL -- Reject and escalate</td></tr>
    <tr><td>Escalation Required</td><td class="prose">[ ] No&nbsp;&nbsp;[ ] Yes -- escalated to: _______________________________</td></tr>
    <tr><td>Notes</td><td class="prose">_______________________________</td></tr>
  </table>

  <div class="sig">
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Compliance Officer / Reviewer</div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Second Approval (if required)</div>
    </div>
  </div>

  <div class="fn">Document Ref: ${ref} -- Generated ${today()} -- PrimeStack Global Payment Network -- This checklist is a compliance aid only. It does not constitute legal advice. Always engage qualified legal counsel. &copy; ${new Date().getFullYear()} PrimeStack Global Payment Network.</div>

</div>
${foot('PrimeStack Global Payment Network -- MT 799 Verification',`${ref} -- ${today()}`)}
</div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// D. EUR 5M INTERNATIONAL WIRE TRANSFER REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════════
function buildD() {
  const ref = refId('WIRE-EUR5M');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EUR 5M Wire Transfer Requirements -- PrimeStack Global Payment Network</title>
<style>${CSS}</style>
</head>
<body>
<div class="outer">
<div style="position:relative;overflow:hidden">
<div class="wm">CONFIDENTIAL</div>

${lh('WIRE TRANSFER REQUIREMENTS','International Wire Transfer -- EUR 5,000,000.00',ref,`<div class="lm-ref">Classification: Strictly Confidential</div><div class="lm-ref">Threshold Category: High-Value Transfer</div>`)}

<div class="body">

  <div class="amt">
    <div class="amt-lbl">Transfer Amount</div>
    <div class="amt-val">EUR 5,000,000.00</div>
    <div class="amt-sub">Five Million Euro Only -- International Wire Transfer -- ISO 20022 / SWIFT CBPR+</div>
  </div>

  <div class="notice"><strong>High-Value Transfer Notice:</strong> Transfers at or above EUR 1,000,000 are subject to enhanced due diligence, regulatory reporting, and senior management approval at most financial institutions. The requirements below reflect standard correspondent banking expectations for cross-border wire transfers at this threshold.</div>

  <div class="st">Section 1 -- Mandatory Sender Information</div>
  <table class="cl">
    <thead><tr><td>Ref</td><td>Requirement</td><td>Document / Evidence</td><td>Status</td></tr></thead>
    <tbody>
      <tr><td>1.1</td><td class="prose">Full legal name of sending entity (no abbreviations)</td><td class="prose">Certificate of Incorporation / Registration</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>1.2</td><td class="prose">Registered address and principal place of business</td><td class="prose">Official registration documents</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>1.3</td><td class="prose">Legal Entity Identifier (LEI) -- mandatory for EU regulated entities</td><td class="prose">LEI certificate from accredited LOU</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>1.4</td><td class="prose">Sending bank SWIFT BIC (8 or 11 characters)</td><td class="prose">SWIFT directory confirmation</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>1.5</td><td class="prose">Sending account IBAN (SEPA) or account number with sort code / routing</td><td class="prose">Bank account statement (within 3 months)</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>1.6</td><td class="prose">Authorised signatories and board resolution authorising the transfer</td><td class="prose">Certified board resolution</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>1.7</td><td class="prose">Tax identification number (TIN) or VAT registration</td><td class="prose">Official tax registration certificate</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
    </tbody>
  </table>

  <div class="st">Section 2 -- Mandatory Beneficiary Information</div>
  <table class="cl">
    <thead><tr><td>Ref</td><td>Requirement</td><td>Document / Evidence</td><td>Status</td></tr></thead>
    <tbody>
      <tr><td>2.1</td><td class="prose">Full legal name of beneficiary (exactly as registered with their bank)</td><td class="prose">Bank-confirmed beneficiary details</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>2.2</td><td class="prose">Beneficiary IBAN or account number</td><td class="prose">Written confirmation from beneficiary bank</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>2.3</td><td class="prose">Beneficiary bank full name and address</td><td class="prose">Bank letterhead / SWIFT directory</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>2.4</td><td class="prose">Beneficiary bank SWIFT BIC (8 or 11 characters)</td><td class="prose">SWIFT directory confirmation</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>2.5</td><td class="prose">Intermediary / correspondent bank details (if applicable)</td><td class="prose">As advised by beneficiary bank</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>2.6</td><td class="prose">Beneficiary registered address (for entities)</td><td class="prose">Company registration / bank records</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>2.7</td><td class="prose">Beneficiary LEI (if EU-regulated counterparty)</td><td class="prose">LEI certificate</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
    </tbody>
  </table>

  <div class="st">Section 3 -- Source of Funds Documentation</div>
  <table class="cl">
    <thead><tr><td>Ref</td><td>Requirement</td><td>Accepted Evidence</td><td>Status</td></tr></thead>
    <tbody>
      <tr><td>3.1</td><td class="prose">Declaration of source of funds (SOF) -- signed by authorised signatory</td><td class="prose">Signed SOF declaration letter</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>3.2</td><td class="prose">Evidence supporting source of funds claim</td><td class="prose">Audited accounts, sale agreement, loan agreement, investment documents</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>3.3</td><td class="prose">Audited financial statements (most recent 2 years)</td><td class="prose">Auditor-certified statements</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>3.4</td><td class="prose">Bank statement showing availability of funds (within 30 days)</td><td class="prose">Bank-certified statement</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>3.5</td><td class="prose">Confirmation funds are not from prohibited sources (sanctions, PEP, etc.)</td><td class="prose">AML/KYC declaration</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
    </tbody>
  </table>

  <div class="st">Section 4 -- Transaction Purpose Documentation</div>
  <table class="cl">
    <thead><tr><td>Ref</td><td>Requirement</td><td>Accepted Evidence</td><td>Status</td></tr></thead>
    <tbody>
      <tr><td>4.1</td><td class="prose">Written description of purpose of transfer</td><td class="prose">Purpose letter signed by authorised representative</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>4.2</td><td class="prose">Underlying commercial or legal agreement</td><td class="prose">Signed contract, invoice, purchase agreement, loan agreement</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>4.3</td><td class="prose">Invoice(s) or payment schedule (if trade-related)</td><td class="prose">Commercial invoice on company letterhead</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>4.4</td><td class="prose">Regulatory licence or approval (if applicable sector)</td><td class="prose">Regulator-issued licence</td><td class="prose">[ ] Provided&nbsp;&nbsp;[ ] Pending</td></tr>
    </tbody>
  </table>

  <div class="st">Section 5 -- Regulatory and Compliance Requirements</div>
  <table class="cl">
    <thead><tr><td>Ref</td><td>Requirement</td><td>Applicable Regulation</td><td>Status</td></tr></thead>
    <tbody>
      <tr><td>5.1</td><td class="prose">AML screening of sender, beneficiary, and UBOs against OFAC / EU / UN sanctions lists</td><td class="prose">FATF Recommendation 16, EU 2015/849</td><td class="prose">[ ] Completed&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>5.2</td><td class="prose">Politically Exposed Person (PEP) screening</td><td class="prose">EU 4th/5th/6th AML Directive</td><td class="prose">[ ] Completed&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>5.3</td><td class="prose">Enhanced Due Diligence (EDD) -- mandatory above EUR 15,000 (threshold may vary)</td><td class="prose">FATF Recommendation 19</td><td class="prose">[ ] Completed&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>5.4</td><td class="prose">Ultimate Beneficial Owner (UBO) verification (25% threshold)</td><td class="prose">EU 5th AML Directive, local Company Law</td><td class="prose">[ ] Completed&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>5.5</td><td class="prose">FATCA / CRS self-certification (for cross-border transfers)</td><td class="prose">US FATCA, OECD CRS</td><td class="prose">[ ] Completed&nbsp;&nbsp;[ ] Pending</td></tr>
      <tr><td>5.6</td><td class="prose">SWIFT message type: pacs.008.001.10 (ISO 20022 CBPR+) for cross-border EUR</td><td class="prose">SWIFT CBPR+ mandatory migration 2025</td><td class="prose">[ ] Confirmed&nbsp;&nbsp;[ ] Check with bank</td></tr>
      <tr><td>5.7</td><td class="prose">Reporting to national financial intelligence unit (FIU) if required</td><td class="prose">Local AML law / FATF Rec. 20</td><td class="prose">[ ] N/A&nbsp;&nbsp;[ ] Filed</td></tr>
    </tbody>
  </table>

  <div class="st">Section 6 -- Payment Instruction Details</div>
  <table class="dt">
    <tr><td>Amount</td><td>EUR 5,000,000.00 (Five Million Euro)</td></tr>
    <tr><td>Currency</td><td>EUR -- Euro</td></tr>
    <tr><td>Charge Bearer</td><td class="prose">SHA (shared) -- standard for cross-border EUR&nbsp;&nbsp;|&nbsp;&nbsp;OUR (sender pays all) -- if agreed</td></tr>
    <tr><td>Value Date</td><td class="prose">[DD/MM/YYYY] -- must be a TARGET2 business day for EUR</td></tr>
    <tr><td>Payment Purpose Code</td><td class="prose">ISO 20022 purpose code -- e.g. SUPP (supplier payment), BEXP (business expense), INTC (intra-company)</td></tr>
    <tr><td>Remittance Reference</td><td class="prose">Structured (ISO 20022 structured remittance) or unstructured text, max 140 chars</td></tr>
    <tr><td>Message Standard</td><td class="prose">ISO 20022 pacs.008.001.10 (CBPR+) for cross-border&nbsp;&nbsp;|&nbsp;&nbsp;MT103 for legacy SWIFT</td></tr>
    <tr><td>UETR</td><td class="prose">Unique End-to-End Transaction Reference -- auto-assigned by SWIFT GPI</td></tr>
    <tr><td>Expected Processing</td><td class="prose">Same-day (SDVA) or next business day -- confirm with your bank</td></tr>
  </table>

  <div class="st">Section 7 -- Typical Timeline</div>
  <table class="cl">
    <thead><tr><td>Day</td><td>Action</td><td>Party Responsible</td></tr></thead>
    <tbody>
      <tr><td>D-5 to D-3</td><td class="prose">Assemble all documentation from Sections 1-5</td><td class="prose">Sender</td></tr>
      <tr><td>D-3 to D-2</td><td class="prose">Submit documentation to sending bank for compliance review</td><td class="prose">Sender + Sending Bank</td></tr>
      <tr><td>D-2 to D-1</td><td class="prose">Bank completes KYC / EDD / sanctions screening; obtains approvals</td><td class="prose">Sending Bank</td></tr>
      <tr><td>D-1</td><td class="prose">Payment instruction confirmed; UETR generated; message prepared</td><td class="prose">Sending Bank</td></tr>
      <tr><td>D (Value Date)</td><td class="prose">pacs.008 transmitted via SWIFT; funds debit from sender account</td><td class="prose">Sending Bank</td></tr>
      <tr><td>D (Same Day)</td><td class="prose">Correspondent bank(s) route; funds credit to beneficiary bank</td><td class="prose">Correspondent Banks</td></tr>
      <tr><td>D to D+1</td><td class="prose">Beneficiary bank credits account; pacs.002 status ACCC issued</td><td class="prose">Receiving Bank</td></tr>
      <tr><td>D+1</td><td class="prose">SWIFT GPI tracker updated; confirmation available</td><td class="prose">SWIFT GPI</td></tr>
    </tbody>
  </table>

  <div class="st">Section 8 -- Typical Costs (Reference Only)</div>
  <table class="cl">
    <thead><tr><td>Item</td><td>Typical Range</td><td>Notes</td></tr></thead>
    <tbody>
      <tr><td class="prose">Sending bank wire fee</td><td class="prose">EUR 25 -- EUR 150</td><td class="prose">Varies by institution and account tier</td></tr>
      <tr><td class="prose">SWIFT messaging fee</td><td class="prose">EUR 5 -- EUR 30</td><td class="prose">Included in bank fee at most institutions</td></tr>
      <tr><td class="prose">Correspondent bank charge</td><td class="prose">EUR 10 -- EUR 100</td><td class="prose">Charged if SHA or BEN; avoidable with OUR</td></tr>
      <tr><td class="prose">Receiving bank fee</td><td class="prose">EUR 0 -- EUR 50</td><td class="prose">Varies by institution</td></tr>
      <tr><td class="prose">FX conversion (if applicable)</td><td class="prose">0.1% -- 1.5% of amount</td><td class="prose">Only if currency conversion required</td></tr>
      <tr><td class="prose">Compliance / EDD fee</td><td class="prose">EUR 0 -- EUR 500</td><td class="prose">Some banks charge for high-value EDD</td></tr>
    </tbody>
  </table>

  <div class="sig">
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Prepared By</div>
      <div style="font-size:11px;color:#555;margin-top:4px;font-family:Arial,sans-serif">PrimeStack Global Payment Network</div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-lbl">Reviewed and Approved</div>
    </div>
  </div>

  <div class="fn">Document Ref: ${ref} -- Generated ${today()} -- PrimeStack Global Payment Network -- This document is a reference guide only. Actual requirements vary by sending bank, receiving country, and applicable regulations. Seek qualified legal and compliance advice before proceeding with any high-value transfer. &copy; ${new Date().getFullYear()} PrimeStack Global Payment Network. All rights reserved.</div>

</div>
${foot('PrimeStack Global Payment Network -- EUR 5M Wire Requirements',`${ref} -- ${today()}`)}
</div>
</div>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const docs = [
    { file: 'MT799_RWA_SAMPLE.html',           build: buildA, label: 'A -- MT 799 Sample Wording'          },
    { file: 'MT799_BANK_REQUEST_LETTER.html',  build: buildB, label: 'B -- Bank Request Letter'            },
    { file: 'MT799_VERIFICATION_CHECKLIST.html', build: buildC, label: 'C -- MT 799 Verification Checklist' },
    { file: 'EUR5M_WIRE_REQUIREMENTS.html',    build: buildD, label: 'D -- EUR 5M Wire Requirements'       },
  ];

  console.log('\nPrimeStack Global Payment Network');
  console.log('SWIFT / RWA / Wire Requirements Generator\n');

  for (const d of docs) {
    const html = d.build();
    const outPath = path.join(OUT, d.file);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`  OK  ${d.file}  (${(html.length/1024).toFixed(1)} KB)  --  ${d.label}`);
  }

  console.log('\nDone -- 4 documents\n');
  console.log(`  ${OUT}\n`);
}

main();
