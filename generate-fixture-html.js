/**
 * PrimeStack â€” ISO 20022 Test Fixture HTML Generator
 *
 * Reads every fixture folder under ISO20022_TEST_FIXTURES/ and produces
 * a bank-grade, no-colour HTML document for each one, plus a master index.
 *
 * Design rules:
 *   - Monochrome: black, white, greys only â€” no brand colours
 *   - Typography: Courier New for IDs/XML, Georgia for prose, Arial for labels
 *   - Real bank document structure: letterhead â†’ fixture notice â†’ messages
 *     â†’ transaction table â†’ validation report â†’ XML viewer
 *   - Watermark diagonal across page
 *   - Print-ready
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'NEW IMPLEMENTS', 'ISO20022_TEST_FIXTURES');

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = (n,c) => new Intl.NumberFormat('en-US',{minimumFractionDigits:2}).format(Number(n||0))+'\u00a0'+(c||'');
const today = () => new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'2-digit'});
const nowTs  = () => new Date().toISOString().replace('T',' ').slice(0,19)+' UTC';

// Highlight XML â€” monochrome: bold for tag names, italic for attribute values
function hlXml(xml) {
  return esc(xml)
    .replace(/(&lt;\/?)([\w.:]+)/g, '$1<b>$2</b>')
    .replace(/(&lt;!--)([\s\S]*?)(--&gt;)/g, '<em style="color:#666">$1$2$3</em>')
    .replace(/(\b[\w]+)=(&quot;[^&]*&quot;)/g, '<span>$1</span>=<u>$2</u>');
}

// Scenario labels
const LABELS = {
  EUR_SEPA_CORE_DE_FR:       { title:'SEPA Credit Transfer',       sub:'SCT â€” Germany to France',             type:'SEPA SCT',    msg:'pacs.008.001.10 / pain.001.001.13' },
  EUR_SEPA_INSTANT_NL_ES:    { title:'SEPA Instant Credit Transfer',sub:'SCT Inst â€” Netherlands to Germany',   type:'SEPA Inst',   msg:'pacs.008.001.10 / pain.001.001.13' },
  GBP_FASTER_PAYMENT_GB_GB:  { title:'Faster Payments Transfer',    sub:'FPS â€” United Kingdom Domestic',       type:'UK FPS',      msg:'pacs.008.001.10 / pain.001.001.13' },
  AED_LOCAL_TRANSFER_AE_AE:  { title:'Local Transfer',              sub:'UAE AANI â€” Domestic AED',             type:'UAE AANI',    msg:'pacs.008.001.10 / pain.001.001.13' },
  EUR_BULK_PAYMENT_DE_NL:    { title:'Bulk Payment Initiation',     sub:'Multi-beneficiary â€” Germany',         type:'SEPA Bulk',   msg:'pain.001.001.13 / pacs.008.001.10' },
  EUR_HIGH_VALUE_DE_ES:      { title:'High-Value Credit Transfer',  sub:'HVPS â€” Germany to France',            type:'HVPS',        msg:'pacs.008.001.10 / pain.001.001.13' },
};

// â”€â”€â”€ Shared CSS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;color:#111;font-size:13px;line-height:1.55}
.page{max-width:860px;margin:28px auto;background:#fff;border:1px solid #bbb;position:relative;overflow:hidden}

/* Watermark */
.wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);
    font-family:Arial,sans-serif;font-size:68px;font-weight:900;color:rgba(0,0,0,0.04);
    white-space:nowrap;pointer-events:none;z-index:0;letter-spacing:6px;user-select:none}

/* Letterhead */
.lh{position:relative;z-index:1;padding:22px 36px 18px;border-bottom:3px double #000;display:flex;justify-content:space-between;align-items:flex-start}
.lh-left .org{font-family:Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:2px;color:#000}
.lh-left .org-sub{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:3px;margin-top:2px}
.lh-left .doc-type{display:inline-block;border:2px solid #000;padding:4px 12px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:10px}
.lh-right{text-align:right;font-family:'Courier New',monospace;font-size:11px;color:#333;line-height:1.9}
.lh-right .doc-id{font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:4px;font-family:Arial,sans-serif}

/* Notice bar */
.notice{position:relative;z-index:1;background:#f8f8f8;border-top:1px solid #ccc;border-bottom:1px solid #ccc;padding:9px 36px;font-size:11px;color:#333;font-family:Georgia,'Times New Roman',serif;font-style:italic;line-height:1.6}
.notice strong{font-style:normal;font-family:Arial,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase}

/* Body */
.body{position:relative;z-index:1;padding:26px 36px}

/* Scenario header */
.scenario-hdr{border-bottom:2px solid #000;padding-bottom:14px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-end}
.scenario-hdr h1{font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;letter-spacing:0.5px}
.scenario-hdr .sc-sub{font-family:Arial,sans-serif;font-size:11px;color:#555;margin-top:4px}
.scenario-hdr .sc-badge{font-family:Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border:1px solid #333;padding:4px 10px;color:#333}

/* Amount block â€” monochrome */
.amt-block{border:2px solid #000;padding:18px;text-align:center;margin-bottom:22px;background:#fff}
.amt-block .ab-lbl{font-family:Arial,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#555;margin-bottom:6px}
.amt-block .ab-amt{font-family:Arial,sans-serif;font-size:38px;font-weight:900;color:#000;letter-spacing:3px}
.amt-block .ab-sub{font-family:'Courier New',monospace;font-size:11px;color:#444;margin-top:6px}

/* Section */
.sec-title{font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#000;border-bottom:2px solid #000;padding-bottom:4px;margin:20px 0 10px}

/* Info table */
table.it{width:100%;border-collapse:collapse;margin-bottom:4px}
table.it tr td{padding:7px 10px;border-bottom:1px solid #e8e8e8;font-size:12px;vertical-align:top}
table.it tr td:first-child{font-family:Arial,sans-serif;font-weight:700;font-size:11px;color:#444;width:36%;background:#fafafa;text-transform:uppercase;letter-spacing:0.3px}
table.it tr td:last-child{font-family:'Courier New',monospace;font-size:12px;color:#111}
table.it tr td.prose{font-family:Georgia,serif;font-family:Georgia,serif}
table.it tr:last-child td{border-bottom:none}

/* Transaction table */
table.tx{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px}
table.tx thead tr{background:#000;color:#fff}
table.tx thead td{padding:8px 10px;font-family:Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-size:9px}
table.tx tbody td{padding:8px 10px;border-bottom:1px solid #e0e0e0;font-family:'Courier New',monospace;vertical-align:top}
table.tx tbody tr:nth-child(even) td{background:#fafafa}

/* Validation */
.val-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:4px}
.val-box{border:1px solid #ccc}
.val-box .vb-head{background:#111;color:#fff;padding:8px 12px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;display:flex;justify-content:space-between;align-items:center}
.val-box .vb-head .vb-status{font-size:11px;font-weight:900;letter-spacing:2px}
.val-box .vb-body{padding:8px 12px}
.val-box .vb-checks{list-style:none;padding:0;margin:0}
.val-box .vb-checks li{font-family:'Courier New',monospace;font-size:9px;color:#333;padding:2px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:flex-start;gap:6px}
.val-box .vb-checks li::before{content:'âœ“';font-weight:900;font-size:10px;flex-shrink:0;color:#000}
.val-box .vb-checks li.fail::before{content:'âœ—';color:#000}
.val-box .vb-total{font-family:Arial,sans-serif;font-size:9px;color:#555;margin-top:6px;text-align:right}

/* File hashes */
table.fh{width:100%;border-collapse:collapse}
table.fh tr td{padding:7px 10px;border-bottom:1px solid #e8e8e8;font-size:11px}
table.fh tr td:first-child{font-family:Arial,sans-serif;font-weight:700;font-size:10px;color:#444;width:180px;text-transform:uppercase}
table.fh tr td:last-child{font-family:'Courier New',monospace;font-size:10px;color:#333;word-break:break-all}
table.fh tr:last-child td{border-bottom:none}

/* XML tabs */
.tab-bar{display:flex;gap:0;margin-bottom:0;border-bottom:2px solid #000}
.tab-btn{padding:8px 18px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;cursor:pointer;background:#f0f0f0;border:1px solid #ccc;border-bottom:none;color:#444}
.tab-btn.active{background:#000;color:#fff;border-color:#000}
.tab-panel{display:none}
.tab-panel.active{display:block}
.xml-wrap{border:1px solid #ccc;border-top:none;background:#f8f8f8}
.xml-pre{padding:14px;font-family:'Courier New',monospace;font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-all;color:#111;max-height:600px;overflow:auto}
.xml-pre b{font-weight:700}
.xml-pre u{text-decoration:none;font-style:italic;color:#333}

/* Footer */
.doc-footer{position:relative;z-index:1;border-top:2px solid #000;padding:10px 36px;background:#fff;font-family:Arial,sans-serif;font-size:9px;color:#555;display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:0.5px}

/* Print */
@media print{
  body{background:#fff}
  .page{margin:0;border:none;box-shadow:none;max-width:none}
  .xml-pre{max-height:none}
}
`;

// â”€â”€â”€ Per-Fixture HTML Builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildFixtureHtml(scenarioId, fixture, xmlFiles) {
  const label   = LABELS[scenarioId] || { title: scenarioId, sub:'', type:'ISO 20022', msg:'pacs.008.001.10' };
  const sc      = fixture.scenario;
  const txns    = sc.transactions || [];
  const msgs    = fixture.messages || [];
  const val     = fixture.validation || {};
  const genAt   = fixture.generated_at || '';

  // Total amount (sum of all transactions)
  const totalAmt = txns.reduce((s,t) => s + parseFloat(t.amount||0), 0);
  const totalAmtFmt = fmt(totalAmt, sc.currency);

  // Transaction rows
  const txRows = txns.map((t,i) => `
    <tr>
      <td style="font-weight:700">#${i+1}</td>
      <td>${esc(t.instruction_id)}</td>
      <td>${esc(t.uetr)}</td>
      <td style="font-weight:700">${esc(fmt(t.amount, sc.currency))}</td>
      <td>${esc(t.debtor_agent_bic)}</td>
      <td>${esc(t.debtor_account_iban)}</td>
      <td>${esc(t.creditor_agent_bic)}</td>
      <td>${esc(t.creditor_account_iban)}</td>
    </tr>`).join('');

  // Validation boxes
  const valKeys = Object.keys(val);
  const valBoxes = valKeys.map(k => {
    const v    = val[k];
    const pass = v.passed || [];
    const fail = v.failed || [];
    const ok   = v.valid !== false && fail.length === 0;
    return `
    <div class="val-box">
      <div class="vb-head">
        <span>${esc(v.message || k.toUpperCase())}</span>
        <span class="vb-status">${ok ? 'âœ“ PASS' : 'âœ— FAIL'}</span>
      </div>
      <div class="vb-body">
        <ul class="vb-checks">
          ${pass.map(p => `<li>${esc(p)}</li>`).join('')}
          ${fail.map(f => `<li class="fail">${esc(f)}</li>`).join('')}
        </ul>
        <div class="vb-total">${pass.length} passed / ${fail.length} failed</div>
      </div>
    </div>`;
  }).join('');

  // File hash rows
  const hashRows = msgs.map(m => `
    <tr>
      <td>${esc(m.file)}</td>
      <td>${esc(m.sha256)}</td>
    </tr>`).join('');

  // XML tabs
  const tabBtns = Object.keys(xmlFiles).map((name,i) =>
    `<button class="tab-btn${i===0?' active':''}" onclick="showTab('${esc(scenarioId)}','${esc(name)}')">${esc(name)}</button>`
  ).join('');

  const tabPanels = Object.entries(xmlFiles).map(([name, content],i) => `
    <div class="tab-panel${i===0?' active':''}" id="tab_${esc(scenarioId)}_${esc(name.replace('.','_'))}">
      <div class="xml-wrap">
        <div class="xml-pre">${hlXml(content)}</div>
      </div>
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ISO 20022 Test Fixture â€” ${esc(scenarioId)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">

  <div class="wm">TEST FIXTURE</div>

  <!-- Letterhead -->
  <div class="lh">
    <div class="lh-left">
      <div class="org">PrimeStack Global Payment Network</div>
      <div class="org-sub">ISO 20022 Integration Test Suite â€” v201.3</div>
      <div class="doc-type">ISO 20022 Test Fixture</div>
    </div>
    <div class="lh-right">
      <div class="doc-id">Test Scenario Report</div>
      <div>Scenario: ${esc(scenarioId)}</div>
      <div>Generated: ${esc(genAt)}</div>
      <div>Printed: ${today()}</div>
      <div>LEI: ${esc(sc.synthetic_party_lei)}</div>
    </div>
  </div>

  <!-- Fixture Notice -->
  <div class="notice">
    <strong>Test Fixture Notice:</strong>&nbsp;
    ${esc(fixture.notice)}
    All institution codes use the reserved prefix <strong>TEST</strong>. All IBANs and amounts are synthetic. This document must not be used as evidence of a real financial transaction.
  </div>

  <div class="body">

    <!-- Scenario Header -->
    <div class="scenario-hdr">
      <div>
        <h1>${esc(label.title)}</h1>
        <div class="sc-sub">${esc(label.sub)} &mdash; ${esc(label.msg)}</div>
      </div>
      <div class="sc-badge">${esc(label.type)}</div>
    </div>

    <!-- Amount -->
    <div class="amt-block">
      <div class="ab-lbl">${txns.length > 1 ? 'Total Batch Amount' : 'Transfer Amount'}</div>
      <div class="ab-amt">${esc(totalAmtFmt)}</div>
      <div class="ab-sub">Currency: ${esc(sc.currency)} &nbsp;&nbsp;|&nbsp;&nbsp; Transactions: ${txns.length} &nbsp;&nbsp;|&nbsp;&nbsp; Network: ${esc(label.type)} &nbsp;&nbsp;|&nbsp;&nbsp; Synthetic Data</div>
    </div>

    <!-- Scenario Details -->
    <div class="sec-title">Scenario Details</div>
    <table class="it">
      <tr><td>Scenario ID</td><td>${esc(sc.id)}</td></tr>
      <tr><td>Payment Type</td><td class="prose">${esc(label.title)} &mdash; ${esc(label.sub)}</td></tr>
      <tr><td>Currency</td><td>${esc(sc.currency)}</td></tr>
      <tr><td>Transaction Count</td><td>${txns.length}</td></tr>
      <tr><td>Messages Included</td><td>${msgs.map(m=>esc(m.file)).join(' &nbsp;|&nbsp; ')}</td></tr>
      <tr><td>Synthetic Party LEI</td><td>${esc(sc.synthetic_party_lei)}</td></tr>
      <tr><td>Generated</td><td>${esc(genAt)}</td></tr>
      <tr><td>ISO 20022 Standard</td><td class="prose">${esc(label.msg)}</td></tr>
    </table>

    <!-- Transactions -->
    <div class="sec-title">Transaction${txns.length > 1 ? 's' : ''} (${txns.length})</div>
    <div style="overflow-x:auto">
    <table class="tx">
      <thead>
        <tr>
          <td>#</td>
          <td>Instruction ID</td>
          <td>UETR</td>
          <td>Amount</td>
          <td>Debtor BIC</td>
          <td>Debtor IBAN</td>
          <td>Creditor BIC</td>
          <td>Creditor IBAN</td>
        </tr>
      </thead>
      <tbody>${txRows}</tbody>
    </table>
    </div>

    <!-- File Hashes -->
    <div class="sec-title">Message File Integrity (SHA-256)</div>
    <table class="fh">${hashRows}</table>

    <!-- Validation Report -->
    <div class="sec-title">Validation Report</div>
    <div class="val-grid" style="grid-template-columns:repeat(${Math.min(valKeys.length,3)},1fr)">
      ${valBoxes}
    </div>

    <!-- XML Viewer -->
    <div class="sec-title">ISO 20022 XML Messages</div>
    <div class="tab-bar">${tabBtns}</div>
    ${tabPanels}

  </div><!-- /body -->

  <div class="doc-footer">
    <span>PrimeStack Global Payment Network &mdash; ISO 20022 Integration Test Suite &mdash; v201.3</span>
    <span>${esc(scenarioId)} &mdash; ${today()}</span>
  </div>

</div><!-- /page -->

<script>
function showTab(scId, name) {
  // Hide all panels for this scenario
  var prefix = 'tab_' + scId + '_';
  document.querySelectorAll('[id^="' + prefix + '"]').forEach(function(p){ p.classList.remove('active'); });
  // Deactivate all tab buttons in this section
  var allBtns = document.querySelectorAll('.tab-btn');
  allBtns.forEach(function(b){ if(b.getAttribute('onclick') && b.getAttribute('onclick').includes(scId)) b.classList.remove('active'); });
  // Activate selected
  var panelId = prefix + name.replace('.', '_');
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
  // Activate button
  allBtns.forEach(function(b){
    if(b.textContent.trim() === name && b.getAttribute('onclick') && b.getAttribute('onclick').includes(scId)) b.classList.add('active');
  });
}
</script>
</body>
</html>`;
}

// â”€â”€â”€ Index page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildIndex(scenarios) {
  const rows = scenarios.map(s => {
    const label = LABELS[s.id] || { title: s.id, sub:'', type:'ISO 20022' };
    const txns  = s.fixture.scenario.transactions || [];
    const total = txns.reduce((a,t) => a + parseFloat(t.amount||0), 0);
    const allValid = Object.values(s.fixture.validation||{}).every(v => v.valid !== false && (v.failed||[]).length === 0);
    return `
    <tr>
      <td><a href="${esc(s.id)}/index.html" style="font-weight:700;text-decoration:none;color:#000">${esc(s.id)}</a></td>
      <td class="prose">${esc(label.title)}</td>
      <td>${esc(label.sub)}</td>
      <td>${esc(s.fixture.scenario.currency)}</td>
      <td style="text-align:right;font-weight:700">${esc(fmt(total, s.fixture.scenario.currency))}</td>
      <td>${txns.length}</td>
      <td style="font-weight:700;letter-spacing:1px">${allValid ? 'âœ“ PASS' : 'âœ— FAIL'}</td>
      <td><a href="${esc(s.id)}/index.html" style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;color:#000;border:1px solid #000;padding:3px 8px">VIEW</a></td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ISO 20022 Test Fixture Library â€” PrimeStack Global Payment Network</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;color:#111;font-size:13px;line-height:1.6}
.page{max-width:1000px;margin:28px auto;background:#fff;border:1px solid #bbb}

.lh{padding:22px 36px 18px;border-bottom:3px double #000;display:flex;justify-content:space-between;align-items:flex-start}
.lh .org{font-size:19px;font-weight:800;letter-spacing:2px;color:#000}
.lh .org-sub{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:3px;margin-top:2px}
.lh .doc-type{display:inline-block;border:2px solid #000;padding:4px 12px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:10px}
.lh-right{text-align:right;font-family:'Courier New',monospace;font-size:11px;color:#333;line-height:1.9}
.lh-right .doc-id{font-size:12px;font-weight:700;letter-spacing:1px;font-family:Arial,sans-serif;margin-bottom:4px}

.notice{background:#f8f8f8;border-top:1px solid #ccc;border-bottom:1px solid #ccc;padding:9px 36px;font-size:11px;color:#333;font-family:Georgia,serif;font-style:italic}
.notice strong{font-style:normal;font-family:Arial,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase}

.body{padding:26px 36px}
.sec-title{font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#000;border-bottom:2px solid #000;padding-bottom:4px;margin:0 0 14px}

.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:2px solid #000;margin-bottom:24px}
.stat{padding:16px;border-right:1px solid #ccc;text-align:center}
.stat:last-child{border-right:none}
.stat .sl{font-size:9px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;color:#555;margin-bottom:6px;font-weight:700}
.stat .sv{font-size:26px;font-weight:900;color:#000;font-family:Arial,sans-serif}

table.mt{width:100%;border-collapse:collapse}
table.mt thead tr{background:#000;color:#fff}
table.mt thead td{padding:9px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;font-family:Arial,sans-serif}
table.mt tbody td{padding:9px 12px;border-bottom:1px solid #e8e8e8;vertical-align:middle;font-size:12px}
table.mt tbody td:first-child{font-family:'Courier New',monospace;font-size:11px}
table.mt tbody td.prose{font-family:Georgia,serif}
table.mt tbody tr:hover td{background:#f8f8f8}

.doc-footer{border-top:2px solid #000;padding:10px 36px;background:#fff;font-size:9px;color:#555;display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,sans-serif}
</style>
</head>
<body>
<div class="page">
  <div class="lh">
    <div>
      <div class="org">PrimeStack Global Payment Network</div>
      <div class="org-sub">ISO 20022 Integration Test Suite â€” v201.3</div>
      <div class="doc-type">Test Fixture Library â€” Master Index</div>
    </div>
    <div class="lh-right">
      <div class="doc-id">Fixture Library Index</div>
      <div>Total Fixtures: ${scenarios.length}</div>
      <div>Printed: ${today()}</div>
      <div>Suite: ISO 20022 v201.3</div>
    </div>
  </div>

  <div class="notice">
    <strong>Test Fixture Notice:</strong>&nbsp;
    All fixtures in this library are synthetic test data produced for ISO 20022 software integration testing only.
    No fixture represents a real payment, real institution, real account, real settlement, or real compliance decision.
    All BICs use reserved prefix <strong>TEST</strong>. All IBANs and amounts are synthetic.
  </div>

  <div class="body">
    <div class="stats">
      <div class="stat"><div class="sl">Total Fixtures</div><div class="sv">${scenarios.length}</div></div>
      <div class="stat"><div class="sl">All Valid</div><div class="sv">${scenarios.every(s=>Object.values(s.fixture.validation||{}).every(v=>v.valid!==false&&(v.failed||[]).length===0))?'âœ“ YES':'MIXED'}</div></div>
      <div class="stat"><div class="sl">Currencies</div><div class="sv">${[...new Set(scenarios.map(s=>s.fixture.scenario.currency))].join(' / ')}</div></div>
      <div class="stat"><div class="sl">Total Transactions</div><div class="sv">${scenarios.reduce((a,s)=>a+(s.fixture.scenario.transactions||[]).length,0)}</div></div>
    </div>

    <div class="sec-title">Test Scenarios</div>
    <table class="mt">
      <thead>
        <tr>
          <td>Scenario ID</td>
          <td>Payment Type</td>
          <td>Route</td>
          <td>CCY</td>
          <td>Total Amount</td>
          <td>Txns</td>
          <td>Validation</td>
          <td>Document</td>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="doc-footer">
    <span>PrimeStack Global Payment Network &mdash; ISO 20022 Integration Test Suite &mdash; v201.3</span>
    <span>Master Index &mdash; ${today()}</span>
  </div>
</div>
</body>
</html>`;
}

// â”€â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function main() {
  const dirs = fs.readdirSync(ROOT).filter(d => {
    const p = path.join(ROOT, d);
    return fs.statSync(p).isDirectory();
  }).sort();

  console.log(`\nPrimeStack ISO 20022 Fixture HTML Generator`);
  console.log(`Found ${dirs.length} fixture folders\n`);

  const scenarios = [];

  for (const dir of dirs) {
    const dirPath = path.join(ROOT, dir);
    const fixturePath = path.join(dirPath, 'fixture.json');
    if (!fs.existsSync(fixturePath)) { console.log(`  - SKIP ${dir} (no fixture.json)`); continue; }

    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    // Read all XML files
    const xmlFiles = {};
    for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.xml')).sort()) {
      xmlFiles[file] = fs.readFileSync(path.join(dirPath, file), 'utf8');
    }

    // Build HTML
    const html = buildFixtureHtml(dir, fixture, xmlFiles);
    const outPath = path.join(dirPath, 'index.html');
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`  âœ“ ${dir}/index.html  (${(html.length/1024).toFixed(1)} KB)`);

    scenarios.push({ id: dir, fixture });
  }

  // Master index
  const indexHtml = buildIndex(scenarios);
  const indexPath = path.join(ROOT, 'index.html');
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log(`\n  âœ“ index.html (master)  (${(indexHtml.length/1024).toFixed(1)} KB)`);
  console.log(`\nâœ… Done â€” ${scenarios.length} fixture documents + master index\n`);
  console.log(`   ${ROOT}\n`);
}

main();

