/**
 * Generates a self-contained HTML viewer for all bank-grade templates.
 * Writes template data to a separate .js file to avoid inline JSON parsing issues.
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, 'NEW IMPLEMENTS', 'BANK_GRADE_TEMPLATES');
const OUTPUT_DIR = path.join(__dirname, 'NEW IMPLEMENTS');
const DATA_FILE = path.join(OUTPUT_DIR, 'templates-data.js');
const HTML_FILE = path.join(OUTPUT_DIR, 'bank_grade_template_viewer.html');

function main() {
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json') && f !== '_INDEX.json').sort();

  // Build compact data — strip XML content to keep it small
  const templates = [];
  const variants = {};

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8'));
    const [variantKey, bankKey] = file.replace('.json', '').split('__');
    const vc = data.variant_config;

    if (!variants[variantKey]) {
      variants[variantKey] = {
        key: variantKey,
        title: data.header.variant_title,
        icon: data.header.variant_icon,
        description: data.header.variant_description,
        clearing: vc.clearing_system,
        serviceLevel: vc.service_level,
        chargeBearer: vc.charge_bearer,
        priority: vc.priority,
        deliveryMode: vc.delivery_mode,
        messages: data.iso20022_payloads.map(p => p.message_type),
        uniqueFields: vc.unique_fields || [],
        banks: [],
      };
    }

    variants[variantKey].banks.push({
      key: bankKey,
      institution: data.header.target_institution,
      bic: data.header.target_institution_bic,
      country: data.header.target_institution_country,
    });

    // Full template data WITH xml_content
    templates.push({
      variantKey,
      bankKey,
      file,
      meta: data.transaction_metadata,
      config: data.variant_config,
      payloads: data.iso20022_payloads.map(p => ({
        message_type: p.message_type,
        description: p.description,
        filename: p.filename,
        sha256_hash: p.sha256_hash,
        xml_content: p.xml_content,
      })),
      compliance: data.compliance_envelope,
      signature: data.digital_signature,
      routing: data.routing_instructions,
    });
  }

  const variantList = Object.values(variants);

  // Write data JS file
  const dataJs = `window.__DATA__ = ${JSON.stringify({ variants: variantList, templates })};`;
  fs.writeFileSync(DATA_FILE, dataJs, 'utf8');

  // Write HTML file
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PrimeStack ISO 20022 — Bank-Grade Template Library</title>
<style>
:root {
  --bg: #0f172a; --surface: #1e293b; --surface2: #334155;
  --border: #475569; --text: #f1f5f9; --muted: #94a3b8;
  --accent: #3b82f6; --green: #22c55e; --red: #ef4444; --orange: #f59e0b;
  --mono: 'SF Mono','Fira Code','Consolas',monospace;
  --sans: system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--sans);background:var(--bg);color:var(--text);min-height:100vh;line-height:1.6}
.header{background:linear-gradient(135deg,#1e293b,#0f172a);border-bottom:1px solid var(--border);padding:32px 40px}
.header h1{font-size:28px;font-weight:700;margin-bottom:8px}
.header h1 span{color:var(--accent)}
.header p{color:var(--muted);font-size:14px}
.header .stats{display:flex;gap:24px;margin-top:16px}
.header .stat{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 20px;text-align:center}
.header .stat .num{font-size:24px;font-weight:700;color:var(--accent)}
.header .stat .lbl{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px}
.container{max-width:1400px;margin:0 auto;padding:24px 40px}
.variant-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px;margin-bottom:40px}
.variant-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden}
.variant-card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:0 8px 32px rgba(59,130,246,0.15)}
.variant-card.active{border-color:var(--accent);background:linear-gradient(135deg,var(--surface),rgba(59,130,246,0.08))}
.variant-card .icon{font-size:32px;margin-bottom:12px}
.variant-card h3{font-size:16px;font-weight:600;margin-bottom:6px}
.variant-card .desc{font-size:12px;color:var(--muted);margin-bottom:12px;min-height:48px}
.variant-card .tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{font-size:11px;padding:3px 8px;border-radius:4px;background:var(--surface2);color:var(--muted);font-family:var(--mono)}
.tag.p-URGT{background:#ef444422;color:#f87171}
.tag.p-HIGH{background:#f59e0b22;color:#fbbf24}
.tag.p-NORM{background:#22c55e22;color:#4ade80}
.detail-panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px}
.detail-header{padding:24px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,var(--surface),var(--bg))}
.detail-header h2{font-size:20px;margin-bottom:8px}
.bank-tabs{display:flex;gap:2px;padding:12px 24px;border-bottom:1px solid var(--border);overflow-x:auto}
.bank-tab{padding:10px 16px;background:transparent;border:1px solid transparent;border-radius:8px;color:var(--muted);cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;transition:all 0.15s}
.bank-tab:hover{color:var(--text);background:var(--surface2)}
.bank-tab.active{color:#fff;background:var(--accent);font-weight:600}
.bank-tab .bic{font-family:var(--mono);font-size:11px;opacity:0.8}
.detail-content{padding:24px}
.section{margin-bottom:24px}
.section-title{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--accent);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.section-title::before{content:'';width:3px;height:16px;background:var(--accent);border-radius:2px}
.info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.info-item{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 16px}
.info-item .lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:4px}
.info-item .val{font-size:14px;font-weight:500;font-family:var(--mono);word-break:break-all}
.info-item .val.green{color:var(--green)} .info-item .val.red{color:var(--red)} .info-item .val.orange{color:var(--orange)}
.xml-block{background:#0d1117;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden}
.xml-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#161b22;border-bottom:1px solid var(--border)}
.xml-header .msg-type{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--accent)}
.xml-header .desc{font-size:12px;color:var(--muted)}
.xml-header .hash{font-family:var(--mono);font-size:10px;color:var(--muted)}
.copy-btn{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;margin-left:8px}
.copy-btn:hover{background:var(--accent)}
.xml-content{padding:16px;max-height:500px;overflow:auto;font-family:var(--mono);font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#c9d1d9}
.xml-content .tn{color:#79c0ff}
.xml-content .an{color:#d2a8ff}
.xml-content .av{color:#a5d6ff}
.compliance-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.compliance-item{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:12px}
.compliance-item .check-name{flex:1}
.compliance-item .check-result{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.check-result.CLEAR,.check-result.PASSED{background:#22c55e22;color:#4ade80}
.check-result.ACCEPTED{background:#f59e0b22;color:#fbbf24}
.download-bar{display:flex;gap:8px;flex-wrap:wrap;padding:16px 24px;border-top:1px solid var(--border);background:var(--bg)}
.dl-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-weight:500;cursor:pointer;transition:all 0.15s}
.dl-btn:hover{background:var(--accent);border-color:var(--accent)}
.sig-box{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;font-family:var(--mono);font-size:11px}
.sig-box .sig-line{display:flex;gap:8px;margin-bottom:4px}
.sig-box .sig-lbl{color:var(--muted);min-width:120px}
.sig-box .sig-val{color:var(--text);word-break:break-all}
.sig-box .sig-val.green{color:var(--green)}
.chain-viz{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0}
.chain-node{display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:12px}
.chain-node .bic{font-family:var(--mono);font-weight:600;color:var(--accent)}
.chain-arrow{color:var(--muted);font-size:18px}
.hidden{display:none!important}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
</style>
</head>
<body>

<div class="header">
  <h1>PrimeStack <span>ISO 20022</span> Bank-Grade Template Library</h1>
  <p>Professional multi-payload ISO 20022 containers &mdash; SWIFT GPI, CBPR+, UETR compliant</p>
  <div class="stats">
    <div class="stat"><div class="num" id="statVariants">0</div><div class="lbl">Template Types</div></div>
    <div class="stat"><div class="num" id="statTemplates">0</div><div class="lbl">Total Templates</div></div>
    <div class="stat"><div class="num" id="statBanks">0</div><div class="lbl">Receiver Banks</div></div>
    <div class="stat"><div class="num" id="statPayloads">0</div><div class="lbl">XML Payloads</div></div>
  </div>
</div>

<div class="container">
  <div class="section-title">Choose Template Type</div>
  <div class="variant-grid" id="variantGrid"></div>
  <div id="detailPanel" class="hidden">
    <div class="detail-panel">
      <div class="detail-header">
        <h2><span id="dIcon"></span> <span id="dTitle"></span></h2>
        <p id="dDesc"></p>
      </div>
      <div class="bank-tabs" id="bankTabs"></div>
      <div class="detail-content" id="detailContent"></div>
      <div class="download-bar" id="downloadBar"></div>
    </div>
  </div>
</div>

<script src="templates-data.js"></script>
<script>
var D=null,curV=null,curB=null;

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function escXml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function infoItem(l,v,c){return '<div class="info-item"><div class="lbl">'+esc(l)+'</div><div class="val '+(c||'')+'">'+esc(v||'\u2014')+'</div></div>'}

function highlightXml(xml){
  return escXml(xml)
    .replace(/(&lt;\/?)([\w.]+)/g,'$1<span class="tn">$2</span>')
    .replace(/(\b[\w]+)=(&quot;[^&]*&quot;)/g,'<span class="an">$1</span>=<span class="av">$2</span>');
}

function selectVariant(key){
  curV=key;
  document.querySelectorAll('.variant-card').forEach(function(c){
    c.classList.toggle('active',c.getAttribute('data-variant')===key);
  });
  var v=D.variants.find(function(x){return x.key===key});
  if(!v)return;
  document.getElementById('detailPanel').classList.remove('hidden');
  document.getElementById('dIcon').textContent=v.icon+' ';
  document.getElementById('dTitle').textContent=v.title;
  document.getElementById('dDesc').textContent=v.description;
  var tabs=document.getElementById('bankTabs');
  tabs.innerHTML='';
  v.banks.forEach(function(b,i){
    var tab=document.createElement('div');
    tab.className='bank-tab'+(i===0?' active':'');
    tab.setAttribute('data-bank',b.key);
    tab.innerHTML=esc(b.key)+' <span class="bic">'+esc(b.bic)+'</span>';
    tab.onclick=function(){selectBank(key,b.key)};
    tabs.appendChild(tab);
  });
  selectBank(key,v.banks[0].key);
}

function selectBank(vk,bk){
  curB=bk;
  document.querySelectorAll('.bank-tab').forEach(function(t){
    t.classList.toggle('active',t.getAttribute('data-bank')===bk);
  });
  var tpl=D.templates.find(function(t){return t.variantKey===vk&&t.bankKey===bk});
  if(!tpl)return;
  var m=tpl.meta,c=tpl.config,comp=tpl.compliance,sig=tpl.signature,route=tpl.routing;
  var h='';

  // Transaction Metadata
  h+='<div class="section"><div class="section-title">Transaction Metadata</div><div class="info-grid">';
  h+=infoItem('UETR',m.uetr);
  h+=infoItem('Instruction ID',m.instruction_id);
  h+=infoItem('End-to-End ID',m.end_to_end_id);
  h+=infoItem('Transaction ID',m.sending_bank_trn);
  h+=infoItem('Settlement Amount',m.settlement_amount.toLocaleString());
  h+=infoItem('Currency',m.currency);
  h+=infoItem('Value Date',m.value_date);
  h+=infoItem('Debtor BIC',m.debtor_agent_bic);
  h+=infoItem('Creditor BIC',m.creditor_agent_bic);
  h+=infoItem('Creditor Account',m.creditor_account_number);
  h+=infoItem('Creditor Name',m.creditor_name);
  h+=infoItem('Creditor Bank',m.creditor_bank_name);
  h+='</div></div>';

  // Variant Config
  h+='<div class="section"><div class="section-title">Variant Configuration</div><div class="info-grid">';
  h+=infoItem('Clearing System',c.clearing_system);
  h+=infoItem('Service Level',c.service_level);
  h+=infoItem('Charge Bearer',c.charge_bearer);
  h+=infoItem('Priority',c.priority,c.priority==='URGT'?'red':c.priority==='HIGH'?'orange':'green');
  h+=infoItem('Delivery Mode',c.delivery_mode);
  h+=infoItem('Correspondent Chain',c.correspondent_chain?'Yes':'No');
  h+=infoItem('Regulatory Reporting',c.regulatory_reporting?'Yes':'No');
  h+=infoItem('GPI Tracking',c.gpi_tracking?'Yes':'No');
  h+=infoItem('Instant Settlement',c.instant_settlement?'Yes':'No');
  if(c.max_amount)h+=infoItem('Max Amount',c.max_amount.toLocaleString());
  h+='</div></div>';

  // Unique Fields
  if(c.unique_fields&&c.unique_fields.length>0){
    h+='<div class="section"><div class="section-title">Unique Fields in This Template</div><div class="info-grid">';
    c.unique_fields.forEach(function(f){h+=infoItem(f,'')});
    h+='</div></div>';
  }

  // Correspondent Chain
  if(m.correspondent_chain){
    h+='<div class="section"><div class="section-title">Correspondent Banking Chain</div><div class="chain-viz">';
    h+='<div class="chain-node"><span class="bic">'+esc(m.debtor_agent_bic)+'</span> Sender</div><span class="chain-arrow">\u2192</span>';
    if(m.correspondent_chain.intermediary_1){
      h+='<div class="chain-node"><span class="bic">'+esc(m.correspondent_chain.intermediary_1.bic)+'</span> '+esc(m.correspondent_chain.intermediary_1.name)+'</div><span class="chain-arrow">\u2192</span>';
    }
    if(m.correspondent_chain.intermediary_2){
      h+='<div class="chain-node"><span class="bic">'+esc(m.correspondent_chain.intermediary_2.bic)+'</span> '+esc(m.correspondent_chain.intermediary_2.name)+'</div><span class="chain-arrow">\u2192</span>';
    }
    h+='<div class="chain-node"><span class="bic">'+esc(m.creditor_agent_bic)+'</span> Receiver</div></div></div>';
  }

  // XML Payloads
  h+='<div class="section"><div class="section-title">ISO 20022 XML Payloads ('+tpl.payloads.length+')</div>';
  tpl.payloads.forEach(function(p,i){
    h+='<div class="xml-block"><div class="xml-header">';
    h+='<div><span class="msg-type">'+esc(p.message_type)+'</span> <span class="desc">'+esc(p.description)+'</span></div>';
    h+='<div style="display:flex;align-items:center"><span class="hash">SHA-256: '+esc(p.sha256_hash.slice(0,24))+'...</span>';
    h+='<button class="copy-btn" onclick="copyXml('+i+')">Copy XML</button>';
    h+='<button class="copy-btn" onclick="downloadXml('+i+')">Download</button></div>';
    h+='</div><div class="xml-content" id="xml_'+i+'">'+highlightXml(p.xml_content)+'</div></div>';
  });
  h+='</div>';

  // Compliance
  h+='<div class="section"><div class="section-title">AML / KYC Compliance</div>';
  h+='<div class="info-grid" style="margin-bottom:12px">';
  h+=infoItem('Status',comp.aml_kyc.status,comp.aml_kyc.status==='PASSED'?'green':'red');
  h+=infoItem('Risk Level',comp.aml_kyc.risk_level,comp.aml_kyc.risk_level==='LOW'?'green':'orange');
  h+=infoItem('Risk Score',comp.aml_kyc.risk_score,comp.aml_kyc.risk_score<=15?'green':'orange');
  h+=infoItem('Reviewed By',comp.aml_kyc.reviewed_by);
  h+='</div><div class="compliance-grid">';
  comp.aml_kyc.checks.forEach(function(c){
    h+='<div class="compliance-item"><span class="check-name">'+esc(c.check.replace(/_/g,' '))+'</span><span class="check-result '+c.result+'">'+c.result+'</span></div>';
  });
  h+='</div></div>';

  // FATCA/CRS
  if(comp.fatca_crs){
    h+='<div class="section"><div class="section-title">FATCA / CRS</div><div class="info-grid">';
    h+=infoItem('FATCA Status',comp.fatca_crs.fatca_status);
    h+=infoItem('CRS Reportable',comp.fatca_crs.crs_reportable);
    h+=infoItem('TIN Provided',comp.fatca_crs.tin_provided);
    h+=infoItem('Self Certification',comp.fatca_crs.self_certification);
    h+='</div></div>';
  }

  // Trade Finance
  if(comp.trade_finance){
    h+='<div class="section"><div class="section-title">Trade Finance Details</div><div class="info-grid">';
    h+=infoItem('L/C Reference',comp.trade_finance.lc_reference);
    h+=infoItem('Issuing Bank',comp.trade_finance.issuing_bank_bic);
    h+=infoItem('Confirming Bank',comp.trade_finance.confirming_bank_bic);
    h+=infoItem('UCP Version',comp.trade_finance.ucp_version);
    h+=infoItem('BPO Reference',comp.trade_finance.bpo_reference);
    h+=infoItem('Presentation Deadline',comp.trade_finance.presentation_deadline);
    h+='</div></div>';
  }

  // FX Details
  if(comp.fx_details){
    h+='<div class="section"><div class="section-title">FX Conversion Details</div><div class="info-grid">';
    h+=infoItem('Deal Reference',comp.fx_details.dealing_reference);
    h+=infoItem('Base Currency',comp.fx_details.base_currency);
    h+=infoItem('Target Currency',comp.fx_details.target_currency);
    h+=infoItem('Exchange Rate',comp.fx_details.exchange_rate);
    h+=infoItem('CLS Settlement',comp.fx_details.cls_settlement?'Yes':'No');
    h+=infoItem('Value Date',comp.fx_details.value_date);
    h+='</div></div>';
  }

  // Fedwire
  if(comp.fedwire){
    h+='<div class="section"><div class="section-title">Fedwire Details</div><div class="info-grid">';
    h+=infoItem('FRB District',comp.fedwire.frb_district);
    h+=infoItem('Same-Day Settlement',comp.fedwire.same_day_settlement?'Yes':'No','green');
    h+=infoItem('Irrevocable',comp.fedwire.irrevocable?'Yes':'No','green');
    h+=infoItem('Fed Routing Number',comp.fedwire.fed_routing_number);
    h+=infoItem('IAT Flag',comp.fedwire.iat_flag?'Yes':'No');
    h+='</div></div>';
  }

  // Digital Signature
  h+='<div class="section"><div class="section-title">Digital Signature Envelope</div><div class="sig-box">';
  h+='<div class="sig-line"><span class="sig-lbl">Algorithm:</span><span class="sig-val">'+esc(sig.algorithm)+'</span></div>';
  h+='<div class="sig-line"><span class="sig-lbl">Signed At:</span><span class="sig-val">'+esc(sig.signed_at)+'</span></div>';
  h+='<div class="sig-line"><span class="sig-lbl">Signed By:</span><span class="sig-val">'+esc(sig.signed_by)+'</span></div>';
  h+='<div class="sig-line"><span class="sig-lbl">Key ID:</span><span class="sig-val">'+esc(sig.key_id)+'</span></div>';
  h+='<div class="sig-line"><span class="sig-lbl">Composite Hash:</span><span class="sig-val">'+esc(sig.composite_hash)+'</span></div>';
  h+='<div class="sig-line"><span class="sig-lbl">Signature:</span><span class="sig-val">'+esc(sig.signature)+'</span></div>';
  h+='<div class="sig-line"><span class="sig-lbl">Verified:</span><span class="sig-val '+(sig.verified?'green':'red')+'">'+(sig.verified?'\u2713 YES':'\u2717 NO')+'</span></div>';
  h+='</div></div>';

  // Routing
  h+='<div class="section"><div class="section-title">Routing Instructions</div><div class="info-grid">';
  h+=infoItem('SWIFT Network',route.swift_network);
  h+=infoItem('Delivery Mode',route.delivery_mode);
  h+=infoItem('Priority',route.priority);
  h+=infoItem('Notification',route.notification_requested);
  h+=infoItem('Monitoring',route.monitoring_level);
  h+='</div></div>';

  document.getElementById('detailContent').innerHTML=h;

  // Download bar
  var dl=document.getElementById('downloadBar');
  dl.innerHTML='';
  tpl.payloads.forEach(function(p,i){
    dl.innerHTML+='<button class="dl-btn" onclick="downloadXml('+i+')">\u2B07 '+esc(p.filename)+'</button>';
  });
  dl.innerHTML+='<button class="dl-btn" onclick="downloadJson()">\u2B07 Full JSON Container</button>';

  window._tpl=tpl;
}

function copyXml(i){
  var t=window._tpl;if(!t||!t.payloads[i])return;
  navigator.clipboard.writeText(t.payloads[i].xml_content).then(function(){alert('XML copied to clipboard')});
}
function downloadXml(i){
  var t=window._tpl;if(!t||!t.payloads[i])return;
  var p=t.payloads[i];var b=new Blob([p.xml_content],{type:'application/xml'});
  var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=p.filename;a.click();
}
function downloadJson(){
  var t=window._tpl;if(!t)return;
  var b=new Blob([JSON.stringify(t,null,2)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=t.file;a.click();
}

// Init
D=window.__DATA__;
document.getElementById('statVariants').textContent=D.variants.length;
document.getElementById('statTemplates').textContent=D.templates.length;
document.getElementById('statBanks').textContent=D.variants[0].banks.length;
document.getElementById('statPayloads').textContent=D.templates.reduce(function(s,t){return s+t.payloads.length},0);

// Build variant cards
var grid=document.getElementById('variantGrid');
D.variants.forEach(function(v){
  var card=document.createElement('div');
  card.className='variant-card';
  card.setAttribute('data-variant',v.key);
  card.onclick=function(){selectVariant(v.key)};
  var tags='<span class="tag">'+esc(v.clearing)+'</span><span class="tag">'+esc(v.serviceLevel)+'</span><span class="tag p-'+esc(v.priority)+'">'+esc(v.priority)+'</span><span class="tag">'+esc(v.chargeBearer)+'</span><span class="tag">'+v.messages.length+' msgs</span>';
  card.innerHTML='<div class="icon">'+v.icon+'</div><h3>'+esc(v.title)+'</h3><div class="desc">'+esc(v.description)+'</div><div class="tags">'+tags+'</div>';
  grid.appendChild(card);
});

// Auto-select first
selectVariant(D.variants[0].key);
</script>

</body>
</html>`;

  fs.writeFileSync(HTML_FILE, html, 'utf8');
  console.log(`✅ Data file: ${DATA_FILE} (${(fs.statSync(DATA_FILE).size / 1024).toFixed(1)} KB)`);
  console.log(`✅ HTML file: ${HTML_FILE} (${(fs.statSync(HTML_FILE).size / 1024).toFixed(1)} KB)`);
  console.log(`   ${D_variants_count = variantList.length} variants, ${templates.length} templates`);
}

main();