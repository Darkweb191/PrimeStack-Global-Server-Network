/**
 * Converts every JSON template in BANK_GRADE_TEMPLATES/ into a standalone
 * professional HTML document that opens in Chrome and looks like a real
 * bank payment instruction document.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'NEW IMPLEMENTS', 'BANK_GRADE_TEMPLATES');
const OUT_DIR = path.join(__dirname, 'NEW IMPLEMENTS', 'BANK_GRADE_HTML');
const crypto = require('crypto');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function sha256(d) { return crypto.createHash('sha256').update(d, 'utf8').digest('hex'); }

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightXml(xml) {
  return escXml(xml)
    .replace(/(&lt;\/?)([\w.]+)/g, '$1<span class="tn">$2</span>')
    .replace(/(\b[\w]+)=(&quot;[^&]*&quot;)/g, '<span class="an">$1</span>=<span class="av">$2</span>')
    .replace(/(&lt;\?xml[^&]*\?&gt;)/g, '<span class="pi">$1</span>');
}

function fmtDate(s) {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }) + ' UTC';
  } catch { return s; }
}

function fmtMoney(n, ccy) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + ' ' + (ccy || '');
}

function buildHtml(tpl, fileName) {
  const hdr = tpl.header;
  const meta = tpl.transaction_metadata;
  const vc = tpl.variant_config;
  const payloads = tpl.iso20022_payloads;
  const comp = tpl.compliance_envelope;
  const sig = tpl.digital_signature;
  const route = tpl.routing_instructions;
  const cb = tpl.callback_config;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(hdr.variant_title)} — ${escHtml(hdr.target_institution_bic)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f0f4f8;color:#1e293b;line-height:1.6;font-size:14px}
.doc{max-width:900px;margin:24px auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden}

/* Document header */
.doc-header{background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;padding:32px 40px}
.doc-header .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px}
.doc-header .badge.gpi{background:#3b82f622;color:#60a5fa;border:1px solid #3b82f6}
.doc-header .badge.sepa{background:#8b5cf622;color:#a78bfa;border:1px solid #8b5cf6}
.doc-header .badge.fed{background:#22c55e22;color:#4ade80;border:1px solid #22c55e}
.doc-header .badge.nostro{background:#f59e0b22;color:#fbbf24;border:1px solid #f59e0b}
.doc-header .badge.trade{background:#ec489922;color:#f9a8d4;border:1px solid #ec4899}
.doc-header .badge.fx{background:#06b6d422;color:#67e8f9;border:1px solid #06b6d4}
.doc-header .badge.bulk{background:#6366f122;color:#a5b4fc;border:1px solid #6366f1}
.doc-header .badge.urgent{background:#ef444422;color:#f87171;border:1px solid #ef4444}
.doc-header h1{font-size:22px;font-weight:700;margin-bottom:4px}
.doc-header .subtitle{font-size:13px;color:#94a3b8;margin-bottom:16px}
.doc-header .header-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
.doc-header .hi{display:flex;flex-direction:column;gap:2px}
.doc-header .hi .lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
.doc-header .hi .val{font-size:13px;color:#f1f5f9;font-weight:500}

/* Body */
.doc-body{padding:32px 40px}

/* Section */
.sec{margin-bottom:32px}
.sec-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#3b82f6;padding-bottom:8px;border-bottom:2px solid #e2e8f0;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.sec-title .num{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:#3b82f6;color:#fff;border-radius:50%;font-size:11px}

/* Grid */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:12px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:12px}
.cell{background:#fff;padding:12px 16px}
.cell .lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:3px;font-weight:600}
.cell .val{font-size:13px;color:#1e293b;font-weight:500;word-break:break-all}
.cell .val.mono{font-family:'SF Mono','Consolas',monospace;font-size:12px}
.cell .val.green{color:#16a34a} .cell .val.red{color:#dc2626} .cell .val.orange{color:#d97706}

/* Amount banner */
.amount-banner{background:linear-gradient(135deg,#dbeafe,#eff6ff);border:1px solid #93c5fd;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px}
.amount-banner .amt{font-size:36px;font-weight:800;color:#1d4ed8;letter-spacing:1px}
.amount-banner .sub{font-size:12px;color:#475569;margin-top:4px}

/* Correspondent chain */
.chain{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:16px 0}
.chain-node{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;font-size:12px}
.chain-node .bic{font-weight:700;color:#1d4ed8}
.chain-arrow{color:#94a3b8;font-size:16px;padding:0 4px}
.chain-node.sender{background:#1e293b;color:#fff;border-color:#1e293b}
.chain-node.sender .bic{color:#60a5fa}
.chain-node.receiver{background:#16a34a;color:#fff;border-color:#16a34a}
.chain-node.receiver .bic{color:#bef264}

/* XML block */
.xml-block{border:1px solid #334155;border-radius:8px;overflow:hidden;margin-bottom:16px}
.xml-head{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#1e293b;color:#f1f5f9}
.xml-head .mt{font-family:'SF Mono','Consolas',monospace;font-size:13px;font-weight:700;color:#60a5fa}
.xml-head .ds{font-size:12px;color:#94a3b8;margin-left:12px}
.xml-head .right{display:flex;align-items:center;gap:12px}
.xml-head .h{font-family:'SF Mono','Consolas',monospace;font-size:10px;color:#64748b}
.xml-body{padding:16px;max-height:600px;overflow:auto;background:#0d1117;font-family:'SF Mono','Fira Code','Consolas',monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#c9d1d9}
.xml-body .tn{color:#79c0ff}
.xml-body .an{color:#d2a8ff}
.xml-body .av{color:#a5d6ff}
.xml-body .pi{color:#8b949e;font-style:italic}

/* Compliance */
.comp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.comp-item{display:flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px}
.comp-item .cn{flex:1;font-weight:500}
.comp-item .cr{padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700}
.cr.CLEAR,.cr.PASSED{background:#dcfce7;color:#16a34a}
.cr.ACCEPTED{background:#fef3c7;color:#d97706}

/* Sig */
.sig-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font-family:'SF Mono','Consolas',monospace;font-size:11px}
.sig-row{display:flex;gap:12px;margin-bottom:6px;align-items:baseline}
.sig-row .l{color:#64748b;min-width:130px;font-weight:600}
.sig-row .v{color:#1e293b;word-break:break-all}
.sig-row .v.green{color:#16a34a}

/* Tabs for XML */
.tab-bar{display:flex;gap:2px;margin-bottom:0;flex-wrap:wrap}
.tab-btn{padding:8px 16px;background:#f1f5f9;border:1px solid #e2e8f0;border-bottom:none;border-radius:8px 8px 0 0;font-size:12px;font-weight:600;cursor:pointer;color:#64748b}
.tab-btn.active{background:#0d1117;color:#60a5fa;border-color:#334155}
.tab-panel{display:none}
.tab-panel.active{display:block}

/* Footer */
.doc-footer{padding:16px 40px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#64748b;text-align:center}

/* Special badges */
.priority-badge{display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700}
.priority-badge.URGT{background:#ef444422;color:#dc2626}
.priority-badge.HIGH{background:#f59e0b22;color:#d97706}
.priority-badge.NORM{background:#22c55e22;color:#16a34a}

/* Print */
@media print{.doc{box-shadow:none;max-width:none;margin:0;border-radius:0}.xml-body{max-height:none}}
</style>
</head>
<body>
<div class="doc">

  <!-- Header -->
  <div class="doc-header">
    <span class="badge ${escHtml(vc.clearing_system === 'FED' ? 'fed' : vc.clearing_system === 'TIPS' ? 'sepa' : vc.clearing_system === 'CLS' ? 'fx' : vc.nostro_vostro ? 'nostro' : vc.trade_finance ? 'trade' : vc.bulk_payment ? 'bulk' : vc.urgent ? 'urgent' : 'gpi')}">${escHtml(hdr.variant_icon)} ${escHtml(hdr.variant_title)}</span>
    <h1>${escHtml(hdr.target_institution)}</h1>
    <div class="subtitle">BIC: ${escHtml(hdr.target_institution_bic)} &nbsp;|&nbsp; Country: ${escHtml(hdr.target_institution_country)} &nbsp;|&nbsp; Container ID: ${escHtml(hdr.container_id)}</div>
    <div class="header-grid">
      <div class="hi"><span class="lbl">Generated</span><span class="val">${escHtml(hdr.exported_at)}</span></div>
      <div class="hi"><span class="lbl">Engine</span><span class="val">${escHtml(hdr.generated_by)}</span></div>
      <div class="hi"><span class="lbl">Standards</span><span class="val">${escHtml(hdr.message_standards)}</span></div>
      <div class="hi"><span class="lbl">Schema Version</span><span class="val">${escHtml(hdr.schema_version)}</span></div>
    </div>
  </div>

  <div class="doc-body">

    <!-- Amount Banner -->
    <div class="amount-banner">
      <div class="amt">${fmtMoney(meta.settlement_amount, meta.currency)}</div>
      <div class="sub">Settlement Amount &nbsp;|&nbsp; Value Date: ${escHtml(meta.value_date)} &nbsp;|&nbsp; <span class="priority-badge ${escHtml(vc.priority)}">${escHtml(vc.priority)}</span> &nbsp;|&nbsp; ${escHtml(vc.clearing_system)} &nbsp;|&nbsp; ${escHtml(vc.service_level)}</div>
    </div>

    <!-- 1. Transaction Details -->
    <div class="sec">
      <div class="sec-title"><span class="num">1</span> Transaction Details</div>
      <div class="grid2">
        <div class="cell"><div class="lbl">UETR (Unique End-to-End Ref)</div><div class="val mono">${escHtml(meta.uetr)}</div></div>
        <div class="cell"><div class="lbl">Instruction ID</div><div class="val mono">${escHtml(meta.instruction_id)}</div></div>
        <div class="cell"><div class="lbl">End-to-End ID</div><div class="val mono">${escHtml(meta.end_to_end_id)}</div></div>
        <div class="cell"><div class="lbl">Transaction ID (TRN)</div><div class="val mono">${escHtml(meta.sending_bank_trn)}</div></div>
        <div class="cell"><div class="lbl">Value Date</div><div class="val">${escHtml(meta.value_date)}</div></div>
        <div class="cell"><div class="lbl">Electronic Seq #</div><div class="val">${escHtml(meta.electronic_sequence_number)}</div></div>
      </div>
    </div>

    <!-- 2. Debtor (Sender) -->
    <div class="sec">
      <div class="sec-title"><span class="num">2</span> Debtor (Sending Institution)</div>
      <div class="grid2">
        <div class="cell"><div class="lbl">Debtor BIC</div><div class="val mono">${escHtml(meta.debtor_agent_bic)}</div></div>
        <div class="cell"><div class="lbl">Debtor Account</div><div class="val mono">${escHtml(meta.debtor_account || '0000-0100-0000-0000')}</div></div>
      </div>
    </div>

    <!-- 3. Creditor (Receiver) -->
    <div class="sec">
      <div class="sec-title"><span class="num">3</span> Creditor (Receiving Institution)</div>
      <div class="grid2">
        <div class="cell"><div class="lbl">Creditor BIC</div><div class="val mono">${escHtml(meta.creditor_agent_bic)}</div></div>
        <div class="cell"><div class="lbl">Creditor Account</div><div class="val mono">${escHtml(meta.creditor_account_number)}</div></div>
        <div class="cell"><div class="lbl">Creditor Name</div><div class="val">${escHtml(meta.creditor_name)}</div></div>
        <div class="cell"><div class="lbl">Creditor Bank</div><div class="val">${escHtml(meta.creditor_bank_name)}</div></div>
        <div class="cell"><div class="lbl">Account Currency</div><div class="val">${escHtml(meta.creditor_account_currency)}</div></div>
        <div class="cell"><div class="lbl">Bank Address</div><div class="val">${escHtml(meta.creditor_bank_address)}</div></div>
        <div class="cell"><div class="lbl">Head Office</div><div class="val">${escHtml(meta.creditor_bank_head_office)}</div></div>
        <div class="cell"><div class="lbl">Bank Phone</div><div class="val">${escHtml(meta.creditor_bank_phone || '—')}</div></div>
      </div>
    </div>

    <!-- 4. Routing Configuration -->
    <div class="sec">
      <div class="sec-title"><span class="num">4</span> Routing & Settlement Configuration</div>
      <div class="grid3">
        <div class="cell"><div class="lbl">Clearing System</div><div class="val">${escHtml(vc.clearing_system)}</div></div>
        <div class="cell"><div class="lbl">Service Level</div><div class="val">${escHtml(vc.service_level)}</div></div>
        <div class="cell"><div class="lbl">Charge Bearer</div><div class="val">${escHtml(vc.charge_bearer)}</div></div>
        <div class="cell"><div class="lbl">Priority</div><div class="val"><span class="priority-badge ${escHtml(vc.priority)}">${escHtml(vc.priority)}</span></div></div>
        <div class="cell"><div class="lbl">Delivery Mode</div><div class="val">${escHtml(vc.delivery_mode)}</div></div>
        <div class="cell"><div class="lbl">Instant Settlement</div><div class="val">${vc.instant_settlement ? 'Yes' : 'No'}</div></div>
        <div class="cell"><div class="lbl">Correspondent Chain</div><div class="val">${vc.correspondent_chain ? 'Yes' : 'No'}</div></div>
        <div class="cell"><div class="lbl">Regulatory Reporting</div><div class="val">${vc.regulatory_reporting ? 'Yes' : 'No'}</div></div>
        <div class="cell"><div class="lbl">GPI Tracking</div><div class="val">${vc.gpi_tracking ? 'Yes' : 'No'}</div></div>
      </div>
    </div>

    <!-- 5. Correspondent Chain -->
    ${meta.correspondent_chain ? `
    <div class="sec">
      <div class="sec-title"><span class="num">5</span> Correspondent Banking Chain</div>
      <div class="chain">
        <div class="chain-node sender"><span class="bic">${escHtml(meta.debtor_agent_bic)}</span> Sender Bank</div>
        <span class="chain-arrow">&rarr;</span>
        ${meta.correspondent_chain.intermediary_1 ? `<div class="chain-node"><span class="bic">${escHtml(meta.correspondent_chain.intermediary_1.bic)}</span> ${escHtml(meta.correspondent_chain.intermediary_1.name)}</div><span class="chain-arrow">&rarr;</span>` : ''}
        ${meta.correspondent_chain.intermediary_2 ? `<div class="chain-node"><span class="bic">${escHtml(meta.correspondent_chain.intermediary_2.bic)}</span> ${escHtml(meta.correspondent_chain.intermediary_2.name)}</div><span class="chain-arrow">&rarr;</span>` : ''}
        <div class="chain-node receiver"><span class="bic">${escHtml(meta.creditor_agent_bic)}</span> Receiver Bank</div>
      </div>
    </div>` : ''}

    <!-- 6. ISO 20022 XML Payloads -->
    <div class="sec">
      <div class="sec-title"><span class="num">${meta.correspondent_chain ? '6' : '5'}</span> ISO 20022 XML Payloads (${payloads.length})</div>
      <div class="tab-bar">
        ${payloads.map((p, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" onclick="showTab(${i})">${escHtml(p.message_type)}</button>`).join('')}
      </div>
      ${payloads.map((p, i) => `
      <div class="tab-panel${i === 0 ? ' active' : ''}" id="tab_${i}">
        <div class="xml-block">
          <div class="xml-head">
            <div><span class="mt">${escHtml(p.message_type)}</span><span class="ds">${escHtml(p.description)}</span></div>
            <div class="right"><span class="h">SHA-256: ${escHtml(p.sha256_hash)}</span></div>
          </div>
          <div class="xml-body">${highlightXml(p.xml_content)}</div>
        </div>
      </div>`).join('')}
    </div>

    <!-- 7. Compliance -->
    <div class="sec">
      <div class="sec-title"><span class="num">${meta.correspondent_chain ? '7' : '6'}</span> AML / KYC Compliance Screening</div>
      <div class="grid3" style="margin-bottom:16px">
        <div class="cell"><div class="lbl">Overall Status</div><div class="val ${comp.aml_kyc.status === 'PASSED' ? 'green' : 'red'}">${escHtml(comp.aml_kyc.status)}</div></div>
        <div class="cell"><div class="lbl">Risk Level</div><div class="val ${comp.aml_kyc.risk_level === 'LOW' ? 'green' : 'orange'}">${escHtml(comp.aml_kyc.risk_level)}</div></div>
        <div class="cell"><div class="lbl">Risk Score</div><div class="val">${escHtml(comp.aml_kyc.risk_score)}/100</div></div>
        <div class="cell"><div class="lbl">Screening Date</div><div class="val">${escHtml(comp.aml_kyc.screening_date)}</div></div>
        <div class="cell"><div class="lbl">Provider</div><div class="val">${escHtml(comp.aml_kyc.screening_provider)}</div></div>
        <div class="cell"><div class="lbl">Reviewed By</div><div class="val">${escHtml(comp.aml_kyc.reviewed_by)}</div></div>
      </div>
      <div class="comp-grid">
        ${comp.aml_kyc.checks.map(c => `<div class="comp-item"><span class="cn">${escHtml(c.check.replace(/_/g, ' '))}</span><span class="cr ${escHtml(c.result)}">${escHtml(c.result)}</span></div>`).join('')}
      </div>
    </div>

    <!-- 8. FATCA/CRS -->
    ${comp.fatca_crs ? `
    <div class="sec">
      <div class="sec-title"><span class="num">${meta.correspondent_chain ? '8' : '7'}</span> FATCA / CRS Tax Compliance</div>
      <div class="grid2">
        <div class="cell"><div class="lbl">FATCA Status</div><div class="val">${escHtml(comp.fatca_crs.fatca_status)}</div></div>
        <div class="cell"><div class="lbl">CRS Reportable</div><div class="val">${escHtml(comp.fatca_crs.crs_reportable)}</div></div>
        <div class="cell"><div class="lbl">TIN Provided</div><div class="val">${escHtml(comp.fatca_crs.tin_provided)}</div></div>
        <div class="cell"><div class="lbl">Self Certification</div><div class="val">${escHtml(comp.fatca_crs.self_certification)}</div></div>
      </div>
    </div>` : ''}

    <!-- Trade Finance -->
    ${comp.trade_finance ? `
    <div class="sec">
      <div class="sec-title">Trade Finance Details (L/C Backed)</div>
      <div class="grid2">
        <div class="cell"><div class="lbl">L/C Reference</div><div class="val mono">${escHtml(comp.trade_finance.lc_reference)}</div></div>
        <div class="cell"><div class="lbl">UCP Version</div><div class="val">${escHtml(comp.trade_finance.ucp_version)}</div></div>
        <div class="cell"><div class="lbl">Issuing Bank BIC</div><div class="val mono">${escHtml(comp.trade_finance.issuing_bank_bic)}</div></div>
        <div class="cell"><div class="lbl">Confirming Bank BIC</div><div class="val mono">${escHtml(comp.trade_finance.confirming_bank_bic)}</div></div>
        <div class="cell"><div class="lbl">BPO Reference</div><div class="val mono">${escHtml(comp.trade_finance.bpo_reference)}</div></div>
        <div class="cell"><div class="lbl">Presentation Deadline</div><div class="val">${escHtml(comp.trade_finance.presentation_deadline)}</div></div>
      </div>
    </div>` : ''}

    <!-- FX Details -->
    ${comp.fx_details ? `
    <div class="sec">
      <div class="sec-title">FX Conversion Details</div>
      <div class="grid3">
        <div class="cell"><div class="lbl">Deal Reference</div><div class="val mono">${escHtml(comp.fx_details.dealing_reference)}</div></div>
        <div class="cell"><div class="lbl">Base Currency</div><div class="val">${escHtml(comp.fx_details.base_currency)}</div></div>
        <div class="cell"><div class="lbl">Target Currency</div><div class="val">${escHtml(comp.fx_details.target_currency)}</div></div>
        <div class="cell"><div class="lbl">Exchange Rate</div><div class="val mono">${escHtml(comp.fx_details.exchange_rate)}</div></div>
        <div class="cell"><div class="lbl">CLS Settlement</div><div class="val ${comp.fx_details.cls_settlement ? 'green' : ''}">${comp.fx_details.cls_settlement ? 'Yes' : 'No'}</div></div>
        <div class="cell"><div class="lbl">Value Date</div><div class="val">${escHtml(comp.fx_details.value_date)}</div></div>
      </div>
    </div>` : ''}

    <!-- Fedwire -->
    ${comp.fedwire ? `
    <div class="sec">
      <div class="sec-title">Fedwire RTGS Details</div>
      <div class="grid2">
        <div class="cell"><div class="lbl">FRB District</div><div class="val">${escHtml(comp.fedwire.frb_district)}</div></div>
        <div class="cell"><div class="lbl">Fed Routing Number</div><div class="val mono">${escHtml(comp.fedwire.fed_routing_number)}</div></div>
        <div class="cell"><div class="lbl">Same-Day Settlement</div><div class="val green">${comp.fedwire.same_day_settlement ? 'Yes' : 'No'}</div></div>
        <div class="cell"><div class="lbl">Irrevocable</div><div class="val green">${comp.fedwire.irrevocable ? 'Yes' : 'No'}</div></div>
        <div class="cell"><div class="lbl">IAT Flag</div><div class="val">${comp.fedwire.iat_flag ? 'Yes' : 'No'}</div></div>
      </div>
    </div>` : ''}

    <!-- Digital Signature -->
    <div class="sec">
      <div class="sec-title"><span class="num">${meta.correspondent_chain ? (comp.fatca_crs ? '9' : '8') : (comp.fatca_crs ? '8' : '7')}</span> Digital Signature Envelope</div>
      <div class="sig-box">
        <div class="sig-row"><span class="l">Algorithm:</span><span class="v">${escHtml(sig.algorithm)}</span></div>
        <div class="sig-row"><span class="l">Signed At:</span><span class="v">${escHtml(sig.signed_at)}</span></div>
        <div class="sig-row"><span class="l">Signed By:</span><span class="v">${escHtml(sig.signed_by)}</span></div>
        <div class="sig-row"><span class="l">Key ID:</span><span class="v">${escHtml(sig.key_id)}</span></div>
        <div class="sig-row"><span class="l">Composite Hash:</span><span class="v">${escHtml(sig.composite_hash)}</span></div>
        <div class="sig-row"><span class="l">Signature:</span><span class="v">${escHtml(sig.signature)}</span></div>
        <div class="sig-row"><span class="l">Verified:</span><span class="v ${sig.verified ? 'green' : 'red'}">${sig.verified ? '\u2713 YES — Signature Valid' : '\u2717 NO — Invalid'}</span></div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0"><div style="font-size:10px;color:#64748b;margin-bottom:6px">Per-Payload Hashes:</div>
        ${sig.payloads.map(p => `<div class="sig-row" style="margin-bottom:2px"><span class="l">${escHtml(p.filename)}</span><span class="v" style="font-size:10px">${escHtml(p.hash)}</span></div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Routing Instructions -->
    <div class="sec">
      <div class="sec-title">Routing Instructions</div>
      <div class="grid2">
        <div class="cell"><div class="lbl">SWIFT Network</div><div class="val">${escHtml(route.swift_network)}</div></div>
        <div class="cell"><div class="lbl">Delivery Mode</div><div class="val">${escHtml(route.delivery_mode)}</div></div>
        <div class="cell"><div class="lbl">Priority</div><div class="val">${escHtml(route.priority)}</div></div>
        <div class="cell"><div class="lbl">Notification</div><div class="val">${escHtml(route.notification_requested)}</div></div>
        <div class="cell"><div class="lbl">Monitoring Level</div><div class="val">${escHtml(route.monitoring_level)}</div></div>
      </div>
    </div>

    <!-- Callback -->
    <div class="sec">
      <div class="sec-title">Callback Configuration</div>
      <div class="grid2">
        <div class="cell"><div class="lbl">Callback URL</div><div class="val mono">${escHtml(cb.callback_url)}</div></div>
        <div class="cell"><div class="lbl">Expected Status</div><div class="val">${escHtml(cb.expected_response_status)}</div></div>
        <div class="cell"><div class="lbl">Max Retries</div><div class="val">${escHtml(cb.retry_policy.max_retries)}</div></div>
        <div class="cell"><div class="lbl">Retry Interval</div><div class="val">${escHtml(cb.retry_policy.retry_interval_seconds)}s (x${escHtml(cb.retry_policy.backoff_multiplier)})</div></div>
      </div>
    </div>

  </div>

  <div class="doc-footer">
    Generated by ${escHtml(hdr.generated_by)} &nbsp;|&nbsp; ${escHtml(hdr.file_type)} v${escHtml(hdr.version)} &nbsp;|&nbsp; Schema: ${escHtml(hdr.schema_version)} &nbsp;|&nbsp; ${escHtml(hdr.message_standards)}
  </div>
</div>

<script>
function showTab(i){
  document.querySelectorAll('.tab-btn').forEach(function(b,idx){b.classList.toggle('active',idx===i)});
  document.querySelectorAll('.tab-panel').forEach(function(p,idx){p.classList.toggle('active',idx===i)});
}
</script>
</body>
</html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json') && f !== '_INDEX.json').sort();
  let count = 0;

  console.log(`\nConverting ${files.length} JSON templates to HTML...\n`);

  for (const file of files) {
    const srcPath = path.join(SRC_DIR, file);
    const tpl = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

    // Add SENDER_ACCOUNT placeholder
    tpl._sender_account = '0000-0100-0000-0000';

    const html = buildHtml(tpl, file);
    const outName = file.replace('.json', '.html');
    const outPath = path.join(OUT_DIR, outName);
    fs.writeFileSync(outPath, html, 'utf8');

    // Verify hashes
    const hashOk = tpl.iso20022_payloads.every(p => sha256(p.xml_content) === p.sha256_hash);

    console.log(`  ${hashOk ? '\u2713' : '\u2717'} ${outName} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
    count++;
  }

  // Generate an index page
  const indexHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>PrimeStack Bank-Grade Templates — Index</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f4f8;color:#1e293b;padding:40px}
h1{font-size:28px;margin-bottom:8px}h1 span{color:#3b82f6}
p.sub{color:#64748b;font-size:14px;margin-bottom:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;max-width:1200px;margin:0 auto}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-decoration:none;color:inherit;transition:all 0.2s;display:block}
.card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.12)}
.card .icon{font-size:28px;margin-bottom:10px}
.card h3{font-size:15px;font-weight:600;margin-bottom:4px}
.card .bank{font-size:12px;color:#64748b;margin-bottom:8px}
.card .tags{display:flex;flex-wrap:wrap;gap:4px}
.card .tag{font-size:10px;padding:2px 8px;border-radius:4px;background:#f1f5f9;color:#475569;font-family:monospace}
.card .tag.URGT{background:#fee2e2;color:#dc2626}
.card .tag.HIGH{background:#fef3c7;color:#d97706}
.card .tag.NORM{background:#dcfce7;color:#16a34a}
</style></head><body>
<div style="max-width:1200px;margin:0 auto">
<h1>PrimeStack <span>ISO 20022</span> Bank-Grade Template Library</h1>
<p class="sub">${count} professional templates — click any card to view the full document</p>
<div class="grid">
${files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
    const v = data.variant_config;
    const h = data.header;
    const outName = f.replace('.json', '.html');
    return `<a class="card" href="${escHtml(outName)}">
      <div class="icon">${escHtml(h.variant_icon)}</div>
      <h3>${escHtml(h.variant_title)}</h3>
      <div class="bank">${escHtml(h.target_institution)} — ${escHtml(h.target_institution_bic)}</div>
      <div class="tags">
        <span class="tag">${escHtml(v.clearing_system)}</span>
        <span class="tag">${escHtml(v.service_level)}</span>
        <span class="tag ${escHtml(v.priority)}">${escHtml(v.priority)}</span>
        <span class="tag">${escHtml(v.charge_bearer)}</span>
      </div>
    </a>`;
  }).join('\n')}
</div></div></body></html>`;

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml, 'utf8');
  console.log(`\n✅ ${count} HTML files generated in:\n   ${OUT_DIR}\n`);
  console.log(`   Index: ${path.join(OUT_DIR, 'index.html')}\n`);
}

main();