/**
 * PrimeStack Global Payment Network
 * Bank Document Generator  v3 (monochrome, unbreakable)
 *
 * Design rules enforced:
 *   1. Strictly monochrome  #000, #111, #333, #555, #888, #eee, #f5f5f5, #fff only
 *   2. Zero emoji anywhere
 *   3. Zero external fonts or CDN calls  system fonts only
 *   4. One fixed-width page layout  nothing wraps or collapses
 *   5. All URLs in plain text, word-break forced, no hyperlink blue
 *   6. Section labels: Arial uppercase, 9px, letter-spacing
 *   7. Reference field values: Courier New
 *   8. Prose: Arial or Georgia  never mixed on the same line
 *   9. QR and barcode are CSS-only, no JS libraries
 *  10. Print stylesheet included
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, 'NEW IMPLEMENTS', 'BANK_GRADE_TEMPLATES');
const OUT = path.join(__dirname, 'NEW IMPLEMENTS', 'BANK_DOCUMENTS');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// --- Helpers -----------------------------------------------------------------
const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt  = (n,c) => new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0)) + ' ' + (c||'');
const today = () => new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'2-digit'});
const md5short = s => crypto.createHash('md5').update(String(s)).digest('hex').slice(0,8).toUpperCase();

// CSS-only QR  11x11 dot matrix, black and white only
function qrDots(seed) {
  const h = crypto.createHash('sha256').update(seed).digest('hex');
  let cells = '';
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 11; c++) {
      const corner = (r<3&&c<3)||(r<3&&c>7)||(r>7&&c<3);
      const edge   = corner && (r===0||r===2||r===10||c===0||c===2||c===10);
      const inner  = (r===1&&c===1)||(r===1&&c===9)||(r===9&&c===1);
      let dark;
      if (corner) dark = edge || inner;
      else { const idx=(r*11+c)%64; dark=parseInt(h[idx],16)>7; }
      cells += `<div style="width:6px;height:6px;background:${dark?'#000':'#fff'};float:left"></div>`;
    }
  }
  return `<div style="display:inline-block;padding:5px;background:#fff;border:1px solid #ccc;line-height:0">${cells}<div style="clear:both"></div></div>`;
}

// CSS-only barcode  vertical bars only, no js
function barcodeBars(seed) {
  const h = crypto.createHash('md5').update(seed).digest('hex');
  let bars = '';
  for (let i = 0; i < 40; i++) {
    const v = parseInt(h[i % h.length], 16);
    const w = (v % 3) + 1;
    bars += `<span style="display:inline-block;width:${w}px;height:40px;background:${i%2===0?'#000':'#fff'};vertical-align:top"></span>`;
  }
  return `<div style="display:inline-block;line-height:0;border:1px solid #ccc;padding:4px 6px;background:#fff">${bars}</div>`;
}

// --- Shared CSS  monochrome only ---------------------------------------------
const PAGE_CSS = `
/* Reset */
*{margin:0;padding:0;box-sizing:border-box}
/* Base */
body{
  font-family:Arial,Helvetica,sans-serif;
  background:#e8e8e8;
  color:#111;
  font-size:13px;
  line-height:1.55;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}
/* Outer wrapper  centres the page */
.outer{
  width:860px;
  margin:28px auto;
  background:#fff;
  border:1px solid #999;
  box-shadow:0 2px 12px rgba(0,0,0,.12);
}
/* Diagonal watermark */
.wm{
  position:absolute;top:50%;left:50%;
  transform:translate(-50%,-50%) rotate(-26deg);
  font-family:Arial,sans-serif;font-size:72px;font-weight:900;
  color:rgba(0,0,0,.035);pointer-events:none;white-space:nowrap;z-index:0;
  letter-spacing:6px;user-select:none;
}
.rel{position:relative;z-index:1}

/* -- Letterhead -- */
.lh{
  padding:22px 36px 18px;
  border-bottom:3px solid #000;
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
}
.lh-brand .bn{
  font-family:Arial,Helvetica,sans-serif;
  font-size:17px;
  font-weight:800;
  letter-spacing:2px;
  text-transform:uppercase;
  color:#000;
}
.lh-brand .bs{
  font-size:9px;
  color:#555;
  letter-spacing:3px;
  text-transform:uppercase;
  margin-top:3px;
}
.lh-brand .bd{
  display:inline-block;
  border:2px solid #000;
  padding:4px 12px;
  font-size:9px;
  font-weight:700;
  letter-spacing:2px;
  text-transform:uppercase;
  margin-top:10px;
  font-family:Arial,sans-serif;
}
.lh-meta{
  text-align:right;
  font-family:Arial,sans-serif;
  font-size:11px;
  color:#333;
  line-height:1.9;
}
.lh-meta .lm-title{
  font-size:13px;
  font-weight:700;
  color:#000;
  margin-bottom:4px;
  letter-spacing:.5px;
}
.lh-meta .lm-ref{
  font-family:'Courier New',Courier,monospace;
  font-size:11px;
  color:#333;
}

/* -- Body -- */
.body{padding:26px 36px 32px}

/* -- Amount block -- */
.amt{
  border:2px solid #000;
  padding:18px 24px;
  text-align:center;
  margin-bottom:22px;
}
.amt-lbl{
  font-family:Arial,sans-serif;
  font-size:9px;
  text-transform:uppercase;
  letter-spacing:2px;
  color:#555;
  margin-bottom:7px;
}
.amt-val{
  font-family:Arial,Helvetica,sans-serif;
  font-size:38px;
  font-weight:900;
  color:#000;
  letter-spacing:2px;
  word-break:break-word;
}
.amt-sub{
  font-family:'Courier New',Courier,monospace;
  font-size:11px;
  color:#444;
  margin-top:8px;
  letter-spacing:.3px;
}

/* -- Section title -- */
.st{
  font-family:Arial,Helvetica,sans-serif;
  font-size:9px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:2px;
  color:#000;
  border-bottom:2px solid #000;
  padding-bottom:4px;
  margin:22px 0 10px;
}

/* -- Data table -- */
table.dt{
  width:100%;
  border-collapse:collapse;
  table-layout:fixed;
}
table.dt tr td{
  padding:7px 10px;
  border-bottom:1px solid #e8e8e8;
  vertical-align:top;
}
table.dt tr:last-child td{border-bottom:none}
table.dt tr td:first-child{
  font-family:Arial,Helvetica,sans-serif;
  font-size:10px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:.5px;
  color:#444;
  width:36%;
  background:#f9f9f9;
}
table.dt tr td:last-child{
  font-family:'Courier New',Courier,monospace;
  font-size:12px;
  color:#111;
  word-break:break-all;
}
table.dt tr td.prose{
  font-family:Arial,Helvetica,sans-serif;
  font-size:12px;
  font-family:Arial,sans-serif;
  word-break:normal;
}

/* -- Two column -- */
.two{
  display:table;
  width:100%;
  border-collapse:collapse;
  margin-bottom:4px;
}
.two-col{
  display:table-cell;
  width:50%;
  vertical-align:top;
  border:1px solid #ddd;
}
.two-col+.two-col{border-left:none}
.col-hd{
  background:#111;
  color:#fff;
  padding:7px 12px;
  font-family:Arial,sans-serif;
  font-size:9px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:1.5px;
}
.col-body table{width:100%;border-collapse:collapse}
.col-body table td{
  padding:7px 12px;
  border-bottom:1px solid #f0f0f0;
  font-size:12px;
  vertical-align:top;
}
.col-body table tr:last-child td{border-bottom:none}
.col-body table td:first-child{
  font-family:Arial,sans-serif;
  font-weight:700;
  font-size:10px;
  color:#555;
  width:40%;
  text-transform:uppercase;
  letter-spacing:.3px;
}
.col-body table td:last-child{
  font-family:'Courier New',Courier,monospace;
  font-size:12px;
  color:#111;
  word-break:break-all;
}
.col-body table td.prose{
  font-family:Arial,sans-serif;
  font-size:12px;
  word-break:normal;
}

/* -- Correspondent chain -- */
.chain{
  display:table;
  width:100%;
  border-collapse:collapse;
  margin:8px 0 16px;
  table-layout:fixed;
}
.chain-cell{
  display:table-cell;
  text-align:center;
  vertical-align:middle;
  padding:10px 8px;
  font-family:'Courier New',Courier,monospace;
  font-size:11px;
  font-weight:700;
  border:1px solid #000;
  background:#fff;
  color:#000;
  word-break:break-all;
}
.chain-cell.dark{background:#000;color:#fff}
.chain-cell.arr{
  font-family:Arial,sans-serif;
  font-size:18px;
  font-weight:400;
  border:none;
  background:transparent;
  color:#000;
  width:24px;
  padding:0;
}

/* -- GPI tracker -- */
.gpi{
  border:1px solid #999;
  padding:12px 16px;
  margin:14px 0;
  background:#f9f9f9;
}
.gpi-lbl{
  font-family:Arial,sans-serif;
  font-size:9px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:2px;
  color:#000;
  margin-bottom:7px;
}
.gpi-uetr{
  font-family:'Courier New',Courier,monospace;
  font-size:14px;
  font-weight:700;
  color:#000;
  letter-spacing:1px;
  word-break:break-all;
}
.gpi-url{
  font-family:'Courier New',Courier,monospace;
  font-size:10px;
  color:#333;
  margin-top:6px;
  word-break:break-all;
  text-decoration:none;
  display:block;
}

/* -- Verify strip -- */
.verify{
  display:table;
  width:100%;
  border-collapse:collapse;
  border-top:1px solid #ccc;
  margin-top:20px;
  padding-top:18px;
}
.verify-qr{
  display:table-cell;
  vertical-align:top;
  width:90px;
  padding-right:16px;
}
.verify-bc{
  display:table-cell;
  vertical-align:top;
  width:220px;
  padding-right:16px;
}
.verify-bc .bc-ref{
  font-family:'Courier New',Courier,monospace;
  font-size:8px;
  color:#555;
  margin-top:4px;
  word-break:break-all;
}
.verify-txt{
  display:table-cell;
  vertical-align:top;
}
.verify-txt .vt-hd{
  font-family:Arial,sans-serif;
  font-size:9px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:1px;
  color:#000;
  margin-bottom:6px;
}
.verify-txt .vt-body{
  font-family:Arial,sans-serif;
  font-size:11px;
  color:#444;
  line-height:1.7;
}
.verify-txt .vt-url{
  font-family:'Courier New',Courier,monospace;
  font-size:10px;
  color:#111;
  word-break:break-all;
  display:block;
  margin-top:4px;
  text-decoration:none;
}

/* -- Footnote -- */
.fn{
  border-top:1px solid #ddd;
  margin-top:14px;
  padding-top:8px;
  font-family:Arial,sans-serif;
  font-size:9px;
  color:#888;
  line-height:1.7;
}

/* -- Footer -- */
.foot{
  border-top:2px solid #000;
  padding:9px 36px;
  display:flex;
  justify-content:space-between;
  font-family:Arial,sans-serif;
  font-size:9px;
  color:#555;
  text-transform:uppercase;
  letter-spacing:.5px;
  background:#fff;
}

/* -- Print -- */
@media print{
  body{background:#fff}
  .outer{margin:0;border:none;box-shadow:none}
}
`;

// --- Variant meta -------------------------------------------------------------
const VARIANT_META = {
  SWIFT_GPI_CROSSBORDER:  { docLabel:'Confirmation of Credit Transfer',      docType:'MT103 EQUIVALENT',         gpi:true,  chain:true  },
  SEPA_INSTANT:           { docLabel:'SEPA Instant Payment Receipt',          docType:'SCT INST SCHEME',          gpi:false, chain:false },
  FEDWIRE_RTGS:           { docLabel:'Federal Wire Transfer Confirmation',     docType:'FEDWIRE RTGS',             gpi:false, chain:true  },
  CORRESPONDENT_NOSTRO:   { docLabel:'Inter-Bank Settlement Advice',          docType:'MT202 EQUIVALENT',         gpi:true,  chain:true  },
  TRADE_FINANCE_LC:       { docLabel:'Documentary Credit Advice',             docType:'UCP 600 / ISO 20022',      gpi:false, chain:true  },
  TREASURY_FX:            { docLabel:'FX Dealing Confirmation',               docType:'INTERBANK FX',             gpi:false, chain:true  },
  BULK_PAYMENT_PAIN001:   { docLabel:'Batch Payment Acknowledgement',         docType:'PAIN.001.001.13',          gpi:false, chain:false },
  HIGH_VALUE_URGENT:      { docLabel:'Priority Payment Notice',               docType:'URGP PRIORITY',            gpi:false, chain:true  },
};

// --- Single universal document builder ---------------------------------------
function buildDoc(tpl, variantKey, bankKey) {
  const hdr   = tpl.header;
  const meta  = tpl.transaction_metadata;
  const vc    = tpl.variant_config;
  const comp  = tpl.compliance_envelope;
  const chain = meta.correspondent_chain;
  const tf    = comp?.trade_finance;
  const fx    = comp?.fx_details;
  const fed   = comp?.fedwire;
  const vm    = VARIANT_META[variantKey] || { docLabel: hdr.variant_title, docType: variantKey, gpi:false, chain:false };
  const uetr  = meta.uetr || '';
  const verUrl = `https://verify.primestack.io/doc/${uetr.replace(/-/g,'').slice(0,8).toLowerCase()}`;

  // Compliance footnote  one line, no boxes
  const amlNote = comp?.aml_kyc
    ? `AML/Sanctions screening: ${comp.aml_kyc.status} | Risk: ${comp.aml_kyc.risk_level} | FATCA: ${comp.fatca_crs?.fatca_status||'N/A'} | MTR Ref: ${comp.regulatory?.mtr_reference||''}`
    : '';

  // Correspondent chain cells (table-based, never flex)
  let chainRow = '';
  if (vm.chain && chain) {
    const nodes = [];
    nodes.push({ bic: meta.debtor_agent_bic,   role: 'SENDER',   dark: true  });
    if (chain.intermediary_1) nodes.push({ bic: chain.intermediary_1.bic, role: chain.intermediary_1.name.split(' ').slice(0,2).join(' '), dark: false });
    if (chain.intermediary_2) nodes.push({ bic: chain.intermediary_2.bic, role: chain.intermediary_2.name.split(' ').slice(0,2).join(' '), dark: false });
    nodes.push({ bic: meta.creditor_agent_bic, role: 'RECEIVER', dark: true  });

    const cells = nodes.map((n,i) => {
      const cell = `<td class="chain-cell${n.dark?' dark':''}">${esc(n.bic)}<br><span style="font-size:9px;font-weight:400;font-family:Arial,sans-serif;letter-spacing:.5px">${esc(n.role)}</span></td>`;
      if (i < nodes.length - 1) return cell + `<td class="chain-cell arr">&#8250;</td>`;
      return cell;
    }).join('');
    chainRow = `<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>${cells}</tr></table>`;
  }

  // Optional extra sections
  let extraSection = '';
  if (tf) {
    extraSection += `
    <div class="st">Letter of Credit</div>
    <table class="dt">
      <tr><td>L/C Reference</td><td>${esc(tf.lc_reference||'')}</td></tr>
      <tr><td>UCP Version</td><td class="prose">${esc(tf.ucp_version||'UCP 600')}</td></tr>
      <tr><td>Issuing Bank BIC</td><td>${esc(tf.issuing_bank_bic||meta.debtor_agent_bic)}</td></tr>
      <tr><td>Confirming Bank BIC</td><td>${esc(tf.confirming_bank_bic||chain?.intermediary_1?.bic||'')}</td></tr>
      <tr><td>BPO Reference</td><td>${esc(tf.bpo_reference||'')}</td></tr>
      <tr><td>Presentation Deadline</td><td class="prose">${esc(tf.presentation_deadline||meta.value_date)}</td></tr>
    </table>`;
  }
  if (fx) {
    extraSection += `
    <div class="st">FX Conversion</div>
    <table class="dt">
      <tr><td>Deal Reference</td><td>${esc(fx.dealing_reference||'')}</td></tr>
      <tr><td>Exchange Rate</td><td>${esc(fx.exchange_rate||'')}</td></tr>
      <tr><td>Base Currency</td><td class="prose">${esc(fx.base_currency||meta.currency)}</td></tr>
      <tr><td>Target Currency</td><td class="prose">${esc(fx.target_currency||meta.currency)}</td></tr>
      <tr><td>CLS Settlement</td><td class="prose">${fx.cls_settlement ? 'Yes  CLS Bank International' : 'No'}</td></tr>
    </table>`;
  }
  if (fed) {
    extraSection += `
    <div class="st">Fedwire Details</div>
    <table class="dt">
      <tr><td>FRB District</td><td class="prose">${esc(fed.frb_district||'NEW YORK')}</td></tr>
      <tr><td>Fed Routing Number</td><td>${esc(fed.fed_routing_number||'')}</td></tr>
      <tr><td>IMAD</td><td>${esc(uetr.replace(/-/g,'').slice(0,16).toUpperCase())}</td></tr>
      <tr><td>OMAD</td><td>${esc(uetr.replace(/-/g,'').slice(16,32).toUpperCase())}</td></tr>
      <tr><td>Same-Day Settlement</td><td class="prose">${fed.same_day_settlement ? 'Yes' : 'No'}</td></tr>
      <tr><td>Irrevocable</td><td class="prose">${fed.irrevocable ? 'Yes' : 'No'}</td></tr>
    </table>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(vm.docLabel)}  ${esc(meta.creditor_agent_bic)}  PrimeStack Global Payment Network</title>
<style>${PAGE_CSS}</style>
</head>
<body>

<div class="outer">
<div style="position:relative;overflow:hidden">
  <div class="wm">PRIMESTACK</div>

  <!-- Letterhead -->
  <div class="lh rel">
    <div class="lh-brand">
      <div class="bn">PrimeStack Global Payment Network</div>
      <div class="bs">International Settlement &amp; Clearing Services</div>
      <div class="bd">${esc(vm.docType)}</div>
    </div>
    <div class="lh-meta">
      <div class="lm-title">${esc(vm.docLabel)}</div>
      <div class="lm-ref">Ref: ${esc(meta.instruction_id)}</div>
      <div class="lm-ref">Date: ${today()}</div>
      <div class="lm-ref">Standard: ${esc(hdr.message_standards||'ISO 20022')}</div>
      <div class="lm-ref">Container: ${esc(hdr.container_id||'')}</div>
    </div>
  </div>

  <!-- Body -->
  <div class="body rel">

    <!-- Amount -->
    <div class="amt">
      <div class="amt-lbl">${meta.settlement_amount >= 1000000 ? 'High-Value Settlement Amount' : 'Transfer Amount'}</div>
      <div class="amt-val">${esc(fmt(meta.settlement_amount, meta.currency))}</div>
      <div class="amt-sub">Value Date: ${esc(meta.value_date)} &nbsp;&nbsp;|&nbsp;&nbsp; Clearing: ${esc(vc.clearing_system)} &nbsp;&nbsp;|&nbsp;&nbsp; Service Level: ${esc(vc.service_level)} &nbsp;&nbsp;|&nbsp;&nbsp; Charge Bearer: ${esc(vc.charge_bearer)}</div>
    </div>

    <!-- Payment Identification -->
    <div class="st">Payment Identification</div>
    <table class="dt">
      <tr><td>UETR</td><td>${esc(uetr)}</td></tr>
      <tr><td>Instruction ID</td><td>${esc(meta.instruction_id)}</td></tr>
      <tr><td>End-to-End ID</td><td>${esc(meta.end_to_end_id)}</td></tr>
      <tr><td>Transaction Ref</td><td>${esc(meta.sending_bank_trn)}</td></tr>
      <tr><td>Value Date</td><td class="prose">${esc(meta.value_date)}</td></tr>
      <tr><td>Priority</td><td class="prose">${esc(vc.priority)}</td></tr>
      <tr><td>Delivery Mode</td><td class="prose">${esc(vc.delivery_mode)}</td></tr>
    </table>

    <!-- Parties  two column, table-cell -->
    <div class="st">Debtor &amp; Creditor</div>
    <div class="two">
      <div class="two-col">
        <div class="col-hd">Debtor (Sending)</div>
        <div class="col-body"><table>
          <tr><td>BIC</td><td>${esc(meta.debtor_agent_bic)}</td></tr>
          <tr><td>Account</td><td>${esc(meta.debtor_account||'0000-0100-0000-0000')}</td></tr>
        </table></div>
      </div>
      <div class="two-col">
        <div class="col-hd">Creditor (Receiving)</div>
        <div class="col-body"><table>
          <tr><td>Name</td><td class="prose">${esc(meta.creditor_name)}</td></tr>
          <tr><td>BIC</td><td>${esc(meta.creditor_agent_bic)}</td></tr>
          <tr><td>Account</td><td>${esc(meta.creditor_account_number)}</td></tr>
          <tr><td>Currency</td><td class="prose">${esc(meta.creditor_account_currency)}</td></tr>
          <tr><td>Bank</td><td class="prose">${esc(meta.creditor_bank_name)}</td></tr>
          <tr><td>Address</td><td class="prose">${esc(meta.creditor_bank_address||'')}</td></tr>
          <tr><td>Country</td><td class="prose">${esc(hdr.target_institution_country)}</td></tr>
        </table></div>
      </div>
    </div>

    <!-- Correspondent chain -->
    ${(vm.chain && chain) ? `<div class="st">Correspondent Banking Chain</div>${chainRow}` : ''}

    <!-- GPI Tracker -->
    ${vm.gpi && uetr ? `
    <div class="gpi">
      <div class="gpi-lbl">SWIFT gpi  Live Payment Tracking</div>
      <div class="gpi-uetr">${esc(uetr)}</div>
      <span class="gpi-url">https://gpi.swift.com/gpi/tracker/${esc(uetr)}</span>
    </div>` : ''}

    <!-- Extra sections (L/C, FX, Fedwire) -->
    ${extraSection}

    <!-- Verification strip -->
    <div class="verify">
      <div class="verify-qr">${qrDots(uetr||meta.instruction_id)}</div>
      <div class="verify-bc">
        ${barcodeBars(meta.instruction_id)}
        <div class="bc-ref">${esc(meta.instruction_id)}</div>
      </div>
      <div class="verify-txt">
        <div class="vt-hd">Document Verification</div>
        <div class="vt-body">
          Scan the QR code or visit the URL below to verify<br>
          the authenticity of this document.<br><br>
          Verification URL:<br>
          <span class="vt-url">${esc(verUrl)}</span><br><br>
          Issued ${today()} by PrimeStack Global Payment Network.<br>
          Document ref: ${esc(md5short(meta.instruction_id + uetr))}
        </div>
      </div>
    </div>

    <!-- Footnote -->
    <div class="fn">${amlNote ? esc(amlNote) + '<br>' : ''}This document is generated by PrimeStack Global Payment Network ISO 20022 Engine v3.54. Settlement is subject to the policies of the receiving institution. This confirmation does not constitute a final receipt of cleared funds at the beneficiary account. &copy; ${new Date().getFullYear()} PrimeStack Global Payment Network. All rights reserved.</div>

  </div><!-- /body -->

  <!-- Footer -->
  <div class="foot rel">
    <span>PrimeStack Global Payment Network &mdash; ISO 20022 Certified</span>
    <span>${esc(meta.instruction_id)} &mdash; ${today()}</span>
  </div>
</div>
</div>

</body>
</html>`;
}

// --- Main ---------------------------------------------------------------------
function main() {
  const files = fs.readdirSync(SRC)
    .filter(f => f.endsWith('.json') && f !== '_INDEX.json')
    .sort();

  console.log(`\nPrimeStack Global Payment Network`);
  console.log(`Bank Document Generator  monochrome strict\n`);
  console.log(`Generating ${files.length} documents...\n`);

  let done = 0;
  for (const file of files) {
    const tpl = JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
    const [variantKey, bankKey] = file.replace('.json','').split('__');
    const html = buildDoc(tpl, variantKey, bankKey);
    const outFile = file.replace('.json', '.html');
    fs.writeFileSync(path.join(OUT, outFile), html, 'utf8');
    console.log(`  OK  ${outFile}  (${(html.length/1024).toFixed(1)} KB)`);
    done++;
  }

  // Index
  const indexHtml = buildIndex(files);
  fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml, 'utf8');
  console.log(`\n  OK  index.html`);
  console.log(`\nDone  ${done} documents\n`);
  console.log(`  ${OUT}\n`);
}

function buildIndex(files) {
  const rows = files.map(f => {
    const tpl = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
    const [vk, bk] = f.replace('.json','').split('__');
    const vm = VARIANT_META[vk] || { docLabel: vk };
    const m  = tpl.transaction_metadata;
    return `
    <tr>
      <td><a href="${esc(f.replace('.json','.html'))}" target="_blank" style="color:#000;font-weight:700;text-decoration:none;font-family:'Courier New',monospace;font-size:11px">${esc(f.replace('.json',''))}</a></td>
      <td>${esc(vm.docLabel)}</td>
      <td style="font-family:'Courier New',monospace">${esc(m.creditor_agent_bic)}</td>
      <td>${esc(tpl.header.target_institution_country)}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;font-weight:700">${esc(fmt(m.settlement_amount, m.currency))}</td>
      <td><a href="${esc(f.replace('.json','.html'))}" target="_blank" style="color:#000;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border:1px solid #000;padding:3px 8px;text-decoration:none;font-family:Arial,sans-serif">VIEW</a></td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bank Document Library  PrimeStack Global Payment Network</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#e8e8e8;color:#111;font-size:13px}
.outer{max-width:1000px;margin:28px auto;background:#fff;border:1px solid #999}
.lh{padding:22px 36px 18px;border-bottom:3px solid #000;display:flex;justify-content:space-between;align-items:flex-end}
.lh .bn{font-size:17px;font-weight:800;letter-spacing:2px;text-transform:uppercase}
.lh .bs{font-size:9px;color:#555;letter-spacing:3px;text-transform:uppercase;margin-top:3px}
.lh .bd{display:inline-block;border:2px solid #000;padding:4px 12px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:10px}
.lh-r{text-align:right;font-size:11px;color:#333;line-height:1.9}
.body{padding:26px 36px}
.stats{display:table;width:100%;border-collapse:collapse;border:2px solid #000;margin-bottom:24px}
.stat{display:table-cell;text-align:center;padding:16px;border-right:1px solid #ccc}
.stat:last-child{border-right:none}
.stat .sl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#555;margin-bottom:6px;font-weight:700}
.stat .sv{font-size:26px;font-weight:900;color:#000}
.st{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;border-bottom:2px solid #000;padding-bottom:4px;margin:0 0 14px}
table.mt{width:100%;border-collapse:collapse}
table.mt thead tr{background:#000;color:#fff}
table.mt thead td{padding:9px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}
table.mt tbody td{padding:9px 12px;border-bottom:1px solid #e8e8e8;font-size:12px}
table.mt tbody tr:hover td{background:#f5f5f5}
.foot{border-top:2px solid #000;padding:9px 36px;font-size:9px;color:#555;display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:.5px}
</style>
</head>
<body>
<div class="outer">
  <div class="lh">
    <div><div class="bn">PrimeStack Global Payment Network</div><div class="bs">ISO 20022 Bank Document Library</div><div class="bd">Master Index</div></div>
    <div class="lh-r"><div>Documents: ${files.length}</div><div>Printed: ${today()}</div></div>
  </div>
  <div class="body">
    <div class="stats">
      <div class="stat"><div class="sl">Total Documents</div><div class="sv">${files.length}</div></div>
      <div class="stat"><div class="sl">Template Types</div><div class="sv">8</div></div>
      <div class="stat"><div class="sl">Receiver Banks</div><div class="sv">5</div></div>
      <div class="stat"><div class="sl">Design</div><div class="sv" style="font-size:13px;font-weight:700">Monochrome</div></div>
    </div>
    <div class="st">All Documents</div>
    <table class="mt">
      <thead><tr>
        <td>File</td><td>Document Type</td><td>BIC</td><td>Country</td><td style="text-align:right">Amount</td><td>Open</td>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="foot">
    <span>PrimeStack Global Payment Network &mdash; ISO 20022 Engine v3.54</span>
    <span>Bank Document Library &mdash; ${today()}</span>
  </div>
</div>
</body>
</html>`;
}

main();

