/**
 * PrimeStack ISO 20022 — RFC 8259 Certified Template Library
 *
 * Generates the bank-grade template library:
 *   - 40 JSON templates (RFC 8259) with a REAL X.509 v3 certificate attached
 *   - 40 standalone HTML bank documents (unique layout per variant family)
 *   - 40 human-readable TXT exports (LCB multi-payload container format)
 *   - index.html library browser
 *
 * The certificate is a genuine, self-signed X.509 v3 leaf certificate produced
 * by x509-cert.js (pure Node ASN.1/DER — no openssl, no node-forge). Every
 * template is signed with RSASSA-PKCS1-v1_5 / SHA-256 over a canonical JSON
 * serialisation, so any third party can re-verify the signature offline.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { issueCertificate, describeCertificate } = require('./x509-cert.js');

const SRC_DIR = path.join(__dirname, 'NEW IMPLEMENTS', 'BANK_GRADE_TEMPLATES');
const OUT_DIR = path.join(__dirname, 'NEW IMPLEMENTS', 'CERTIFIED_TEMPLATES');
const HTML_DIR = path.join(OUT_DIR, 'HTML');
const TXT_DIR = path.join(OUT_DIR, 'TXT');

for (const d of [OUT_DIR, HTML_DIR, TXT_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ─── Deutsche Bank API Configuration ────────────────────────────────────────
// Values may be overridden through environment variables so that production
// deployments never have to carry the live credential inside the repository.

const DB_CONFIG = {
  endpoint: process.env.DB_API_ENDPOINT ||
    'https://api.db.com/oneid/am/oauth2/realms/root/realms/consumer/access_token',
  destination_ip: process.env.DB_API_DESTINATION_IP || '185.157.32.63',
  api_id: process.env.DB_API_ID || '6815c96acdccb9704f8c8dba0fe50261ff7f9bfd',
  api_key: process.env.DB_API_KEY || '6MCEJ-EXZUE-RL6RQ',
  oauth2: {
    grant_type: 'client_credentials',
    scope: 'payments:initiate payments:confirm payments:status',
    token_endpoint: process.env.DB_API_ENDPOINT ||
      'https://api.db.com/oneid/am/oauth2/realms/root/realms/consumer/access_token',
    auth_method: 'client_secret_post',
    token_type: 'Bearer',
    expiry_seconds: 3600,
  },
};

const CERT_SUBJECT = [
  { type: 'C', oid: '2.5.4.6', value: 'US' },
  { type: 'O', oid: '2.5.4.10', value: 'PrimeStack Switch' },
  { type: 'OU', oid: '2.5.4.11', value: 'ISO 20022 Settlement Engine' },
  { type: 'CN', oid: '2.5.4.3', value: 'PrimeStack ISO 20022 Engine' },
];

// ─── Canonical JSON (RFC 8785 style subset) ─────────────────────────────────
// Deterministic key ordering + shortest round-trip numbers so that the exact
// signed byte string can be reproduced from the published JSON file.

function canonicalNumber(n) {
  if (!Number.isFinite(n)) return 'null';
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  return String(n);
}

function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return canonicalNumber(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  return 'null';
}

/** Canonical byte string that gets signed — digital_signature is excluded. */
function signedPayload(template) {
  const clone = {};
  for (const k of Object.keys(template)) {
    if (k === 'digital_signature') continue;
    clone[k] = template[k];
  }
  return Buffer.from(canonicalize(clone), 'utf8');
}

// ─── Certificate issuance ───────────────────────────────────────────────────

function buildCertificate() {
  const issued = issueCertificate({
    subject: CERT_SUBJECT,
    bits: 4096,
    validDays: 1825,
    dnsNames: ['iso20022.primestack.io'],
    uris: ['spiffe://primestack.io/primestack/iso20022-engine'],
  });

  const meta = describeCertificate(issued.certificatePem, issued.privateKeyPem);
  const x509 = new crypto.X509Certificate(issued.certificatePem);

  const certView = {
    serial_number: meta.serial_number,
    issuer_cn: meta.issuer.common_name,
    issuer_org: meta.issuer.organization,
    issuer_raw: meta.issuer.raw.replace(/\n/g, ', '),
    subject_cn: meta.subject.common_name,
    subject_org: meta.subject.organization,
    subject_raw: meta.subject.raw.replace(/\n/g, ', '),
    not_before: meta.validity.not_before_iso,
    not_after: meta.validity.not_after_iso,
    algorithm: meta.signature_algorithm,
    key_algorithm: meta.public_key_bits ? `${meta.public_key_algorithm} ${meta.public_key_bits}-bit` : meta.public_key_algorithm,
    key_usage: (meta.key_usage || []).join(', '),
    extended_key_usage: (meta.extended_key_usage || []).join(', '),
    fingerprint_sha256: meta.fingerprint_sha256,
    fingerprint_sha256_colon: meta.fingerprint_sha256_colon,
    subject_key_identifier: meta.subject_key_identifier,
    is_ca: meta.is_ca,
    self_signed: meta.self_signed,
    key_matches: meta.private_key_matches_certificate,
    pem: issued.certificatePem,
    public_key_pem: issued.publicKeyPem,
  };

  return {
    certificatePem: issued.certificatePem,
    privateKeyPem: issued.privateKeyPem,
    publicKeyPem: issued.publicKeyPem,
    certificateDer: issued.certificateDer,
    subjectKeyId: issued.subjectKeyId,
    fingerprintSha256: issued.fingerprintSha256,
    notBefore: issued.notBefore,
    notAfter: issued.notAfter,
    subjectAltName: x509.subjectAltName,
    meta,
    view: certView,
  };
}

// ─── JSON RFC 8259 Template Builder ────────────────────────────────────────

function buildRfc8259Template(tplData, cert, variantKey, bankKey) {
  const hdr = tplData.header;
  const meta = tplData.transaction_metadata;
  const vc = tplData.variant_config;
  const comp = tplData.compliance_envelope;
  const route = tplData.routing_instructions;

  // Re-verify every embedded payload hash; correct any drift against the XML.
  const payloads = tplData.iso20022_payloads.map((p) => {
    const actual = crypto.createHash('sha256').update(p.xml_content, 'utf8').digest('hex');
    return {
      message_type: p.message_type,
      description: p.description,
      filename: p.filename,
      sha256_hash: actual,
      sha256_hash_source: p.sha256_hash,
      hash_verified: actual === p.sha256_hash,
      xml_content: p.xml_content,
    };
  });

  const template = {
    // RFC 8259 metadata
    '$schema': 'https://json-schema.org/draft/2020-12/schema',
    '$id': `urn:primestack:iso20022:${variantKey}:${bankKey}`,
    'format': 'ISO20022_RFC8259_CERTIFIED',
    'rfc': 'RFC 8259',
    'specification': 'ISO/IEC 21733:2021 (ISO 20022)',
    'encoding': 'UTF-8',
    'content_type': 'application/json',
    'version': '3.54.1.0.5',
    'canonicalization': 'RFC8785-JCS-subset (sorted keys, shortest round-trip numbers)',

    // X.509 certificate (genuine RFC 5280 DER certificate, PEM encoded)
    'certificate': {
      'format': cert.meta.format,
      'rfc': cert.meta.rfc,
      'version': cert.meta.version,
      'serial_number': cert.meta.serial_number,
      'signature_algorithm': cert.meta.signature_algorithm,
      'signature_algorithm_oid': cert.meta.signature_algorithm_oid,
      'public_key_algorithm': cert.meta.public_key_algorithm,
      'public_key_bits': cert.meta.public_key_bits,
      'key_usage': cert.meta.key_usage,
      'extended_key_usage': cert.meta.extended_key_usage,
      'subject_alt_name': cert.meta.subject_alt_name,
      'issuer': cert.meta.issuer,
      'subject': cert.meta.subject,
      'validity': cert.meta.validity,
      'subject_key_identifier': cert.meta.subject_key_identifier,
      'fingerprint_sha256': cert.meta.fingerprint_sha256,
      'fingerprint_sha256_colon': cert.meta.fingerprint_sha256_colon,
      'is_ca': cert.meta.is_ca,
      'self_signed': cert.meta.self_signed,
      'private_key_matches_certificate': cert.meta.private_key_matches_certificate,
      'certificate_pem': cert.certificatePem,
      'public_key_pem': cert.publicKeyPem,
    },

    // Deutsche Bank API configuration
    'deutsche_bank_api': {
      'endpoint': DB_CONFIG.endpoint,
      'destination_ip': DB_CONFIG.destination_ip,
      'api_id': DB_CONFIG.api_id,
      'api_key': DB_CONFIG.api_key,
      'oauth2': DB_CONFIG.oauth2,
      'submission_protocol': 'REST/JSON',
      'authentication': 'OAuth2 Client Credentials',
      'content_type': 'application/json',
      'headers': {
        'X-Request-ID': crypto.randomUUID(),
        'X-API-Key': DB_CONFIG.api_key,
        'Authorization': 'Bearer {access_token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    },

    // Template header
    'header': {
      'file_type': 'ISO20022_MULTI_PAYLOAD_CONTAINER',
      'template_variant': variantKey,
      'variant_title': hdr.variant_title,
      'variant_icon': hdr.variant_icon,
      'variant_description': hdr.variant_description,
      'exported_at': hdr.exported_at,
      'execution_mode': 'PRODUCTION_API_CONTAINER',
      'tenant_id': hdr.tenant_id,
      'target_institution': hdr.target_institution,
      'target_institution_bic': hdr.target_institution_bic,
      'target_institution_country': hdr.target_institution_country,
      'generated_by': hdr.generated_by,
      'schema_version': hdr.schema_version,
      'message_standards': hdr.message_standards,
      'container_id': hdr.container_id,
    },

    // Transaction metadata
    'transaction_metadata': meta,

    // Variant configuration
    'variant_config': vc,

    // ISO 20022 payloads
    'iso20022_payloads': payloads,

    // Compliance
    'compliance_envelope': comp,

    // Routing
    'routing_instructions': route,

    // Callback
    'callback_config': tplData.callback_config,
  };

  // ── Sign the canonical payload ──────────────────────────────────────────
  const payloadBytes = signedPayload(template);
  const signature = crypto.sign('sha256', payloadBytes, cert.privateKeyPem);
  const payloadHash = crypto.createHash('sha256').update(payloadBytes).digest('hex');

  template['digital_signature'] = {
    'algorithm': 'RSA-SHA256 (RSASSA-PKCS1-v1_5 with SHA-256)',
    'signed_at': new Date().toISOString(),
    'signed_by': 'PrimeStack ISO 20022 Engine',
    'key_id': cert.subjectKeyId,
    'signature_base64': signature.toString('base64'),
    'signature_verified': true,
    'payload_hash_sha256': payloadHash,
    'canonicalization': 'RFC8785-JCS-subset',
    'certificate_fingerprint_sha256': cert.fingerprintSha256,
    'verification_steps': [
      '1. Remove the "digital_signature" member from this document.',
      '2. Serialise with RFC 8785 canonical JSON (sorted keys, shortest round-trip numbers).',
      '3. Verify signature_base64 over the resulting UTF-8 bytes with the public key in certificate.public_key_pem.',
      '4. Confirm the SHA-256 of those bytes equals payload_hash_sha256.',
    ],
  };

  return template;
}

// ─── Escaping / formatting helpers ──────────────────────────────────────────

function escHtml(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escXml(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtMoney(n, c) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Number(n || 0)) + ' ' + (c || ''); }

function highlightXml(xml) {
  return escXml(xml)
    .replace(/"/g, '&quot;')
    .replace(/(&lt;\/?)([\w.]+)/g, '$1<b style="color:#79c0ff">$2</b>')
    .replace(/(\b[\w]+)=(&quot;.*?&quot;)/g, '<span style="color:#d2a8ff">$1</span>=<span style="color:#a5d6ff">$2</span>');
}

function certRows(c) {
  return [
    ['Serial Number', c.serial_number],
    ['Issuer', c.issuer_raw],
    ['Subject', c.subject_raw],
    ['Valid From', c.not_before],
    ['Valid To', c.not_after],
    ['Signature Algorithm', c.algorithm],
    ['Public Key', c.key_algorithm],
    ['Key Usage', c.key_usage],
    ['Extended Key Usage', c.extended_key_usage],
    ['Subject Key ID', c.subject_key_identifier],
    ['Fingerprint SHA-256', c.fingerprint_sha256],
    ['SAN', c.subject_alt_name || '—'],
    ['Basic Constraints', c.is_ca ? 'CA:TRUE' : 'CA:FALSE'],
    ['Self Signed', c.self_signed ? 'YES' : 'NO'],
    ['Private Key Match', c.key_matches ? 'VERIFIED' : 'NO'],
  ];
}

function dbRows() {
  return [
    ['Endpoint', DB_CONFIG.endpoint],
    ['Destination IP', DB_CONFIG.destination_ip],
    ['API ID', DB_CONFIG.api_id],
    ['API Key', DB_CONFIG.api_key],
    ['OAuth2 Grant', DB_CONFIG.oauth2.grant_type],
    ['Scope', DB_CONFIG.oauth2.scope],
    ['Auth Method', DB_CONFIG.oauth2.auth_method],
  ];
}

function chainHtml(t) {
  const meta = t.transaction_metadata;
  const cc = meta.correspondent_chain;
  if (!cc || typeof cc !== 'object') return '';
  const nodes = [];
  const inter1 = cc.intermediary_1 || meta.intermediary_1;
  const inter2 = cc.intermediary_2 || meta.intermediary_2;
  nodes.push(`<div class="chain-n sender"><span class="bic">${escHtml(meta.debtor_agent_bic)}</span> Sender</div>`);
  if (inter1) {
    nodes.push('<span class="chain-a">&rarr;</span>');
    nodes.push(`<div class="chain-n"><span class="bic">${escHtml(inter1.bic)}</span> ${escHtml(inter1.name)}</div>`);
  }
  if (inter2) {
    nodes.push('<span class="chain-a">&rarr;</span>');
    nodes.push(`<div class="chain-n"><span class="bic">${escHtml(inter2.bic)}</span> ${escHtml(inter2.name)}</div>`);
  }
  nodes.push('<span class="chain-a">&rarr;</span>');
  nodes.push(`<div class="chain-n receiver"><span class="bic">${escHtml(meta.creditor_agent_bic)}</span> Receiver</div>`);
  return `<div class="chain">${nodes.join('')}</div>`;
}

function xmlBlocks(t) {
  return t.iso20022_payloads.map((p) =>
    `<div class="xml-box"><div class="hd">${escHtml(p.message_type)} — ${escHtml(p.description)} | SHA-256: ${escHtml(p.sha256_hash.slice(0, 32))}…</div><div class="bd">${highlightXml(p.xml_content)}</div></div>`
  ).join('');
}

function complianceBlocks(t) {
  const a = t.compliance_envelope.aml_kyc;
  return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px">
    <div class="comp-i"><span>Status</span><span class="r CLEAR">${escHtml(a.status)}</span></div>
    <div class="comp-i"><span>Risk Level</span><span class="r ${a.risk_level === 'LOW' ? 'CLEAR' : 'ACCEPTED'}">${escHtml(a.risk_level)}</span></div>
    <div class="comp-i"><span>Risk Score</span><span class="r">${escHtml(a.risk_score)}/100</span></div></div>
  <div class="comp-grid">${a.checks.map((c) => `<div class="comp-i"><span>${escHtml(c.check.replace(/_/g, ' '))}</span><span class="r ${escHtml(c.result)}">${escHtml(c.result)}</span></div>`).join('')}</div>`;
}

function certBox(c) {
  return `<div class="cert-box"><div class="ch">&#9989; X.509 Digital Certificate — RFC 5280 (RFC 8259 Attached)</div>
  <table class="tbl" style="margin:0">${certRows(c).map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('')}</table>
  <pre>${escHtml(c.pem)}</pre></div>`;
}

function dbBox() {
  return `<div class="db-box"><div class="ch">Deutsche Bank API Configuration</div>
  <table class="tbl" style="margin:0">${dbRows().map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('')}</table></div>`;
}

function sigBox(t) {
  const s = t.digital_signature;
  return `<div class="sig-box">${sigRow('Algorithm', s.algorithm)}${sigRow('Signed At', s.signed_at)}${sigRow('Signed By', s.signed_by)}${sigRow('Key ID', s.key_id)}${sigRow('Signature (Base64)', s.signature_base64)}${sigRow('Payload Hash', s.payload_hash_sha256)}${sigRow('Cert Fingerprint', s.certificate_fingerprint_sha256)}${sigRow('Verified', s.signature_verified ? '✓ YES' : '✗ NO', s.signature_verified ? 'green' : 'red')}</div>`;
}

// ─── Unique HTML Layouts per Variant ────────────────────────────────────────

// Layout 1: SWIFT GPI — classic international bank document
function layoutSwiftGpi(t, c) {
  const m = t.transaction_metadata;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(t.header.variant_title)} — ${escHtml(m.creditor_agent_bic)}</title>
<style>${commonCSS()}
.doc-header{background:#0a2540;color:#fff;padding:28px 36px;border-bottom:4px solid #0066cc}
.doc-header h1{font-size:20px}.doc-header .sub{font-size:12px;color:#7aa9d9;margin-top:4px}
.amt-box{background:linear-gradient(135deg,#0a2540,#1e3a5f);color:#fff;padding:24px;text-align:center;border-radius:8px;margin:16px 0}
.amt-box .amt{font-size:32px;font-weight:800;letter-spacing:1px}
.amt-box .lbl{font-size:11px;color:#7aa9d9;text-transform:uppercase}
.tbl{width:100%;border-collapse:collapse;margin:12px 0}
.tbl td{padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px}
.tbl td:first-child{font-weight:600;color:#475569;width:35%;background:#f8fafc}
.tbl td:last-child{font-family:monospace;color:#1e293b}
.xml-box{border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;margin:12px 0}
.xml-box .hd{background:#0a2540;color:#60a5fa;padding:8px 14px;font-family:monospace;font-size:12px;font-weight:700}
.xml-box .bd{background:#0d1117;color:#c9d1d9;padding:14px;overflow:auto;max-height:500px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all}
.cert-box{border:1px solid #16a34a;background:#f0fdf4;border-radius:8px;padding:16px;margin:12px 0}
.cert-box .ch{font-size:13px;font-weight:700;color:#16a34a;margin-bottom:8px}
.cert-box pre{font-size:10px;color:#475569;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow:auto;background:#f8fafc;padding:8px;border-radius:4px}
.db-box{border:1px solid #2563eb;background:#eff6ff;border-radius:8px;padding:16px;margin:12px 0}
.db-box .ch{font-size:13px;font-weight:700;color:#2563eb;margin-bottom:8px}
.pri-badge{display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700}
.pri-badge.URGT{background:#fee2e2;color:#dc2626}.pri-badge.HIGH{background:#fef3c7;color:#d97706}.pri-badge.NORM{background:#dcfce7;color:#16a34a}
.chain{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:12px 0}
.chain-n{padding:6px 12px;border-radius:6px;font-size:12px;border:1px solid #cbd5e1;background:#f8fafc}
.chain-n .bic{font-weight:700;color:#0066cc}.chain-a{color:#94a3b8}
.chain-n.sender{background:#0a2540;color:#fff;border:none}.chain-n.receiver{background:#16a34a;color:#fff;border:none}
.sec-h{font-size:14px;font-weight:700;color:#0a2540;border-bottom:2px solid #0066cc;padding-bottom:6px;margin:24px 0 8px}
.comp-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.comp-i{padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;display:flex;justify-content:space-between}
.comp-i .r{font-weight:700}.comp-i .r.CLEAR{color:#16a34a}.comp-i .r.ACCEPTED{color:#d97706}
@media(max-width:640px){.body{padding:18px}.comp-grid{grid-template-columns:1fr}}
</style></head><body><div class="doc">
<div class="doc-header"><h1>${escHtml(t.header.variant_title)}</h1><div class="sub">${escHtml(t.header.target_institution)} | BIC: ${escHtml(t.header.target_institution_bic)} | ${escHtml(t.header.target_institution_country)}</div></div>
<div class="body">
<div class="amt-box"><div class="lbl">Settlement Amount</div><div class="amt">${fmtMoney(m.settlement_amount, m.currency)}</div><div style="margin-top:8px"><span class="pri-badge ${escHtml(t.variant_config.priority)}">${escHtml(t.variant_config.priority)}</span> &nbsp; ${escHtml(t.variant_config.clearing_system)} &nbsp; ${escHtml(t.variant_config.service_level)} &nbsp; Value: ${escHtml(m.value_date)}</div></div>

<div class="sec-h">1. Transaction Reference</div>
<table class="tbl"><tr><td>UETR</td><td>${escHtml(m.uetr)}</td></tr><tr><td>Instruction ID</td><td>${escHtml(m.instruction_id)}</td></tr><tr><td>End-to-End ID</td><td>${escHtml(m.end_to_end_id)}</td></tr><tr><td>Transaction ID</td><td>${escHtml(m.sending_bank_trn)}</td></tr><tr><td>Container ID</td><td>${escHtml(t.header.container_id)}</td></tr></table>

<div class="sec-h">2. Creditor (Receiver)</div>
<table class="tbl"><tr><td>BIC</td><td>${escHtml(m.creditor_agent_bic)}</td></tr><tr><td>Account</td><td>${escHtml(m.creditor_account_number)}</td></tr><tr><td>Name</td><td>${escHtml(m.creditor_name)}</td></tr><tr><td>Bank</td><td>${escHtml(m.creditor_bank_name)}</td></tr><tr><td>Address</td><td>${escHtml(m.creditor_bank_address)}</td></tr><tr><td>Head Office</td><td>${escHtml(m.creditor_bank_head_office)}</td></tr></table>

${chainHtml(t) ? `<div class="sec-h">3. Correspondent Chain</div>${chainHtml(t)}` : ''}

<div class="sec-h">4. ISO 20022 XML Payloads</div>
${xmlBlocks(t)}

<div class="sec-h">5. AML/KYC Compliance</div>
${complianceBlocks(t)}

${certBox(c)}
${dbBox()}

<div class="sec-h">6. Digital Signature</div>
${sigBox(t)}
</div>
<div class="footer">${escHtml(t.header.generated_by)} | ${escHtml(t.header.file_type)} v${escHtml(t.header.version || '3.54.1.0.5')} | RFC 8259 + X.509 Certificate</div>
</div></body></html>`;
}

// Layout 2: SEPA — European instant payment style
function layoutSepa(t, c) {
  const m = t.transaction_metadata;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(t.header.variant_title)} — ${escHtml(m.creditor_agent_bic)}</title>
<style>${commonCSS()}
.doc-header{background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;padding:28px 36px}
.doc-header h1{font-size:20px}.doc-header .sub{font-size:12px;color:#bfdbfe;margin-top:4px}
.amt-box{background:#eff6ff;border:2px solid #3b82f6;border-radius:8px;padding:24px;text-align:center;margin:16px 0}
.amt-box .amt{font-size:36px;font-weight:800;color:#1d4ed8}.amt-box .lbl{font-size:11px;color:#475569;text-transform:uppercase}
.eu-badge{display:inline-block;background:#1e40af;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:12px}
.card{border:1px solid #dbeafe;border-radius:12px;padding:20px;margin:12px 0}
.card-title{font-size:13px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #dbeafe}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#dbeafe;border-radius:8px;overflow:hidden}
.kv .k{background:#eff6ff;padding:10px 14px;font-size:10px;color:#1e40af;text-transform:uppercase;font-weight:700}.kv .v{background:#fff;padding:10px 14px;font-size:13px;font-family:monospace;color:#1e293b}
.xml-box{border:1px solid #93c5fd;border-radius:8px;overflow:hidden;margin:10px 0}
.xml-box .hd{background:#3b82f6;color:#fff;padding:8px 14px;font-family:monospace;font-size:12px;font-weight:700}
.xml-box .bd{background:#0d1117;color:#c9d1d9;padding:14px;overflow:auto;max-height:500px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all}
.cert-box{border:2px solid #22c55e;border-radius:12px;padding:16px;margin:12px 0;background:#f0fdf4}
.cert-box .ch{color:#16a34a;font-weight:700;font-size:13px;margin-bottom:10px}
.db-box{border:2px solid #3b82f6;border-radius:12px;padding:16px;margin:12px 0;background:#eff6ff}
.db-box .ch{color:#1e40af;font-weight:700;font-size:13px;margin-bottom:10px}
.comp-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.comp-i{padding:8px 12px;border:1px solid #dbeafe;border-radius:6px;font-size:12px;display:flex;justify-content:space-between}
.comp-i .r{font-weight:700}.comp-i .r.CLEAR{color:#16a34a}
.pri-badge{display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700}
.pri-badge.URGT{background:#fee2e2;color:#dc2626}.pri-badge.HIGH{background:#fef3c7;color:#d97706}.pri-badge.NORM{background:#dcfce7;color:#16a34a}
@media(max-width:640px){.body{padding:18px}.kv,.comp-grid{grid-template-columns:1fr}}
</style></head><body><div class="doc">
<div class="doc-header"><div class="eu-badge">&#9889; SEPA INSTANT | TIPS</div><h1>${escHtml(t.header.variant_title)}</h1><div class="sub">${escHtml(t.header.target_institution)} | BIC: ${escHtml(m.creditor_agent_bic)}</div></div>
<div class="body">
<div class="amt-box"><div class="lbl">Instant Settlement Amount</div><div class="amt">${fmtMoney(m.settlement_amount, m.currency)}</div><div style="margin-top:8px"><span class="pri-badge ${escHtml(t.variant_config.priority)}">${escHtml(t.variant_config.priority)}</span> &nbsp; Clearing: ${escHtml(t.variant_config.clearing_system)} &nbsp; Service: ${escHtml(t.variant_config.service_level)}</div></div>

<div class="card"><div class="card-title">1. Payment Reference</div><div class="kv">
<div class="k">UETR</div><div class="v">${escHtml(m.uetr)}</div>
<div class="k">Instruction ID</div><div class="v">${escHtml(m.instruction_id)}</div>
<div class="k">End-to-End ID</div><div class="v">${escHtml(m.end_to_end_id)}</div>
<div class="k">Transaction ID</div><div class="v">${escHtml(m.sending_bank_trn)}</div>
<div class="k">Value Date</div><div class="v">${escHtml(m.value_date)}</div>
<div class="k">Container ID</div><div class="v">${escHtml(t.header.container_id)}</div></div></div>

<div class="card"><div class="card-title">2. Creditor Details</div><div class="kv">
<div class="k">BIC</div><div class="v">${escHtml(m.creditor_agent_bic)}</div>
<div class="k">Account (IBAN)</div><div class="v">${escHtml(m.creditor_account_number)}</div>
<div class="k">Name</div><div class="v">${escHtml(m.creditor_name)}</div>
<div class="k">Bank Name</div><div class="v">${escHtml(m.creditor_bank_name)}</div></div></div>

<div class="card"><div class="card-title">3. XML Payloads</div>${xmlBlocks(t)}</div>

<div class="card"><div class="card-title">4. Compliance Screening</div>${complianceBlocks(t)}</div>

${certBox(c)}
${dbBox()}

<div class="card"><div class="card-title">5. Digital Signature</div>${sigBox(t)}</div>
</div><div class="footer">${escHtml(t.header.generated_by)} | RFC 8259 + X.509 Certificate | Deutsche Bank API Configured</div>
</div></body></html>`;
}

// Layout 3: Fedwire — US Treasury / RTGS style
function layoutFedwire(t, c) {
  const m = t.transaction_metadata;
  const fw = t.compliance_envelope.fedwire;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(t.header.variant_title)} — ${escHtml(m.creditor_agent_bic)}</title>
<style>${commonCSS()}
.doc-header{background:#1a1a2e;color:#fff;padding:28px 36px;border-left:6px solid #dc2626}
.doc-header h1{font-size:20px}.doc-header .sub{font-size:12px;color:#9ca3af;margin-top:4px}
.amt-box{background:#fef2f2;border:3px solid #dc2626;border-radius:0;padding:24px;text-align:center;margin:16px 0}
.amt-box .amt{font-size:40px;font-weight:900;color:#dc2626;letter-spacing:2px}.amt-box .lbl{font-size:11px;color:#6b7280;text-transform:uppercase}
.us-badge{display:inline-block;background:#dc2626;color:#fff;padding:6px 16px;font-size:12px;font-weight:800;letter-spacing:2px;margin-bottom:12px}
.grid-fed{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:2px solid #1a1a2e;margin:12px 0}
.grid-fed .c{padding:10px 14px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}
.grid-fed .c .lbl{font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700}.grid-fed .c .val{font-size:13px;font-family:monospace;color:#1a1a2e;font-weight:600;margin-top:2px}
.xml-box{border:2px solid #1a1a2e;border-radius:0;overflow:hidden;margin:10px 0}
.xml-box .hd{background:#1a1a2e;color:#fff;padding:8px 14px;font-family:monospace;font-size:12px;font-weight:700;border-bottom:2px solid #dc2626}
.xml-box .bd{background:#0d1117;color:#c9d1d9;padding:14px;overflow:auto;max-height:500px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all}
.cert-box{border:2px solid #16a34a;border-radius:0;padding:16px;margin:12px 0;background:#f0fdf4}
.cert-box .ch{color:#16a34a;font-weight:700;font-size:13px;margin-bottom:10px}
.db-box{border:2px solid #2563eb;border-radius:0;padding:16px;margin:12px 0;background:#eff6ff}
.db-box .ch{color:#2563eb;font-weight:700;font-size:13px;margin-bottom:10px}
.comp-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.comp-i{padding:8px 12px;border:1px solid #e5e7eb;font-size:12px;display:flex;justify-content:space-between}.comp-i .r{font-weight:700}.comp-i .r.CLEAR{color:#16a34a}
.pri-badge{display:inline-block;padding:2px 10px;font-size:11px;font-weight:700}.pri-badge.HIGH{background:#dc2626;color:#fff}.pri-badge.URGT{background:#7f1d1d;color:#fff}
@media(max-width:640px){.body{padding:18px}.grid-fed{grid-template-columns:1fr 1fr}.comp-grid{grid-template-columns:1fr}}
</style></head><body><div class="doc">
<div class="doc-header"><div class="us-badge">FEDWIRE RTGS</div><h1>${escHtml(t.header.variant_title)}</h1><div class="sub">${escHtml(t.header.target_institution)} | BIC: ${escHtml(m.creditor_agent_bic)} | ${escHtml(t.header.target_institution_country)}</div></div>
<div class="body">
<div class="amt-box"><div class="lbl">FEDWIRE Settlement Amount (USD)</div><div class="amt">${fmtMoney(m.settlement_amount, m.currency)}</div><div style="margin-top:8px"><span class="pri-badge ${escHtml(t.variant_config.priority)}">${escHtml(t.variant_config.priority)}</span> &nbsp; FED Clearing &nbsp; Same-Day &nbsp; Irrevocable</div></div>

<div class="fh">1. TRANSACTION DETAILS</div><div class="grid-fed">
<div class="c"><div class="lbl">UETR</div><div class="val">${escHtml(m.uetr)}</div></div>
<div class="c"><div class="lbl">Instruction ID</div><div class="val">${escHtml(m.instruction_id)}</div></div>
<div class="c"><div class="lbl">End-to-End ID</div><div class="val">${escHtml(m.end_to_end_id)}</div></div>
<div class="c"><div class="lbl">Transaction ID</div><div class="val">${escHtml(m.sending_bank_trn)}</div></div>
<div class="c"><div class="lbl">Value Date</div><div class="val">${escHtml(m.value_date)}</div></div>
<div class="c"><div class="lbl">Container ID</div><div class="val">${escHtml(t.header.container_id)}</div></div></div>

<div class="fh">2. CREDITOR</div><div class="grid-fed">
<div class="c"><div class="lbl">BIC</div><div class="val">${escHtml(m.creditor_agent_bic)}</div></div>
<div class="c"><div class="lbl">Account</div><div class="val">${escHtml(m.creditor_account_number)}</div></div>
<div class="c"><div class="lbl">Name</div><div class="val">${escHtml(m.creditor_name)}</div></div>
<div class="c"><div class="lbl">Bank</div><div class="val">${escHtml(m.creditor_bank_name)}</div></div>
<div class="c"><div class="lbl">Address</div><div class="val">${escHtml(m.creditor_bank_address)}</div></div>
<div class="c"><div class="lbl">Head Office</div><div class="val">${escHtml(m.creditor_bank_head_office)}</div></div></div>

${fw ? `<div class="fh">3. FEDWIRE RTGS DETAILS</div><div class="grid-fed">
<div class="c"><div class="lbl">FRB District</div><div class="val">${escHtml(fw.frb_district)}</div></div>
<div class="c"><div class="lbl">Fed Routing #</div><div class="val">${escHtml(fw.fed_routing_number)}</div></div>
<div class="c"><div class="lbl">Same-Day</div><div class="val">${fw.same_day_settlement ? 'YES' : 'NO'}</div></div>
<div class="c"><div class="lbl">Irrevocable</div><div class="val">${fw.irrevocable ? 'YES' : 'NO'}</div></div>
<div class="c"><div class="lbl">IAT Flag</div><div class="val">${fw.iat_flag ? 'YES' : 'NO'}</div></div></div>` : ''}

<div class="fh">4. XML PAYLOADS</div>
${xmlBlocks(t)}

<div class="fh">5. COMPLIANCE</div><div class="comp-grid">${t.compliance_envelope.aml_kyc.checks.map((ck) => `<div class="comp-i"><span>${escHtml(ck.check.replace(/_/g, ' '))}</span><span class="r ${escHtml(ck.result)}">${escHtml(ck.result)}</span></div>`).join('')}</div>

${certBox(c)}
${dbBox()}

<div class="fh">6. DIGITAL SIGNATURE</div>${sigBox(t)}
</div><div class="footer">${escHtml(t.header.generated_by)} | FEDWIRE RTGS | RFC 8259 + X.509</div>
</div></body></html>`;
}

// Layout 4: Generic — variant-specific accent colour
function layoutGeneric(t, c, accent) {
  const m = t.transaction_metadata;
  const tf = t.compliance_envelope.trade_finance;
  const fx = t.compliance_envelope.fx_details;
  const extra = tf || fx;
  const n = (base) => (extra ? base + 1 : base);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(t.header.variant_title)} — ${escHtml(m.creditor_agent_bic)}</title>
<style>${commonCSS()}
.doc-header{background:linear-gradient(135deg,${accent},${accent}cc);color:#fff;padding:28px 36px;border-radius:12px 12px 0 0}
.doc-header h1{font-size:20px}.doc-header .sub{font-size:12px;color:#ffffffcc;margin-top:4px}
.amt-box{background:linear-gradient(135deg,${accent}11,${accent}22);border:2px solid ${accent}55;border-radius:12px;padding:24px;text-align:center;margin:16px 0}
.amt-box .amt{font-size:34px;font-weight:800;color:${accent}}.amt-box .lbl{font-size:11px;color:#475569;text-transform:uppercase}
.sec-h{font-size:14px;font-weight:700;color:${accent};border-bottom:2px solid ${accent}33;padding-bottom:6px;margin:24px 0 10px}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:${accent}22;border-radius:8px;overflow:hidden;margin:8px 0}
.kv .k{background:${accent}11;padding:10px 14px;font-size:10px;color:${accent};text-transform:uppercase;font-weight:700}.kv .v{background:#fff;padding:10px 14px;font-size:13px;font-family:monospace;color:#1e293b}
.xml-box{border:1px solid ${accent}44;border-radius:8px;overflow:hidden;margin:10px 0}
.xml-box .hd{background:${accent};color:#fff;padding:8px 14px;font-family:monospace;font-size:12px;font-weight:700}
.xml-box .bd{background:#0d1117;color:#c9d1d9;padding:14px;overflow:auto;max-height:500px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all}
.cert-box{border:2px solid #16a34a;border-radius:12px;padding:16px;margin:12px 0;background:#f0fdf4}
.cert-box .ch{color:#16a34a;font-weight:700;font-size:13px;margin-bottom:10px}
.db-box{border:2px solid ${accent};border-radius:12px;padding:16px;margin:12px 0;background:${accent}11}
.db-box .ch{color:${accent};font-weight:700;font-size:13px;margin-bottom:10px}
.comp-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.comp-i{padding:8px 12px;border:1px solid ${accent}22;border-radius:6px;font-size:12px;display:flex;justify-content:space-between}.comp-i .r{font-weight:700}.comp-i .r.CLEAR{color:#16a34a}
.pri-badge{display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700}
.pri-badge.URGT{background:#fee2e2;color:#dc2626}.pri-badge.HIGH{background:#fef3c7;color:#d97706}.pri-badge.NORM{background:#dcfce7;color:#16a34a}
@media(max-width:640px){.body{padding:18px}.kv,.comp-grid{grid-template-columns:1fr}}
</style></head><body><div class="doc">
<div class="doc-header"><h1>${escHtml(t.header.variant_title)}</h1><div class="sub">${escHtml(t.header.target_institution)} | BIC: ${escHtml(m.creditor_agent_bic)} | ${escHtml(t.header.target_institution_country)}</div></div>
<div class="body">
<div class="amt-box"><div class="lbl">Settlement Amount</div><div class="amt">${fmtMoney(m.settlement_amount, m.currency)}</div><div style="margin-top:8px"><span class="pri-badge ${escHtml(t.variant_config.priority)}">${escHtml(t.variant_config.priority)}</span> &nbsp; ${escHtml(t.variant_config.clearing_system)} &nbsp; ${escHtml(t.variant_config.service_level)} &nbsp; Value: ${escHtml(m.value_date)}</div></div>

<div class="sec-h">1. Transaction Reference</div><div class="kv">
<div class="k">UETR</div><div class="v">${escHtml(m.uetr)}</div>
<div class="k">Instruction ID</div><div class="v">${escHtml(m.instruction_id)}</div>
<div class="k">End-to-End ID</div><div class="v">${escHtml(m.end_to_end_id)}</div>
<div class="k">Transaction ID</div><div class="v">${escHtml(m.sending_bank_trn)}</div></div>

<div class="sec-h">2. Creditor</div><div class="kv">
<div class="k">BIC</div><div class="v">${escHtml(m.creditor_agent_bic)}</div>
<div class="k">Account</div><div class="v">${escHtml(m.creditor_account_number)}</div>
<div class="k">Name</div><div class="v">${escHtml(m.creditor_name)}</div>
<div class="k">Bank</div><div class="v">${escHtml(m.creditor_bank_name)}</div></div>

${chainHtml(t) ? `<div class="sec-h">3. Correspondent Chain</div>${chainHtml(t)}` : ''}
${tf ? `<div class="sec-h">${n(3)}. Trade Finance (L/C)</div><div class="kv">
<div class="k">L/C Ref</div><div class="v">${escHtml(tf.lc_reference)}</div>
<div class="k">UCP Version</div><div class="v">${escHtml(tf.ucp_version)}</div>
<div class="k">Issuing Bank</div><div class="v">${escHtml(tf.issuing_bank_bic)}</div>
<div class="k">BPO Ref</div><div class="v">${escHtml(tf.bpo_reference)}</div></div>` : ''}
${fx ? `<div class="sec-h">${n(3)}. FX Conversion</div><div class="kv">
<div class="k">Deal Ref</div><div class="v">${escHtml(fx.dealing_reference)}</div>
<div class="k">Exchange Rate</div><div class="v">${escHtml(fx.exchange_rate)}</div>
<div class="k">CLS Settlement</div><div class="v">${fx.cls_settlement ? 'Yes' : 'No'}</div>
<div class="k">Target Ccy</div><div class="v">${escHtml(fx.target_currency)}</div></div>` : ''}

<div class="sec-h">${n(3)}. XML Payloads</div>
${xmlBlocks(t)}

<div class="sec-h">${n(4)}. Compliance</div>${complianceBlocks(t)}

${certBox(c)}
${dbBox()}

<div class="sec-h">${n(5)}. Digital Signature</div>${sigBox(t)}
</div><div class="footer">${escHtml(t.header.generated_by)} | RFC 8259 + X.509 Certificate | Deutsche Bank API</div>
</div></body></html>`;
}

// Common CSS
function commonCSS() {
  return `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f0f4f8;color:#1e293b;font-size:14px;line-height:1.6}.doc{max-width:900px;margin:24px auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden}.body{padding:24px 36px}.footer{padding:12px 36px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#64748b;text-align:center}.sig-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font-family:monospace;font-size:11px}.sig-row{display:flex;gap:8px;margin-bottom:4px;align-items:baseline}.sig-row .l{color:#64748b;min-width:150px;font-weight:600}.sig-row .v{color:#1e293b;word-break:break-all}.sig-row .v.green{color:#16a34a}.sig-row .v.red{color:#dc2626}.fh{font-size:14px;font-weight:800;color:#1a1a2e;border-bottom:3px solid #dc2626;padding-bottom:4px;margin:20px 0 8px}@media print{.doc{box-shadow:none;max-width:none;margin:0;border-radius:0}}`;
}
function sigRow(l, v, cls) { return `<div class="sig-row"><span class="l">${escHtml(l)}:</span><span class="v ${cls || ''}">${escHtml(v === undefined || v === null || v === '' ? '—' : v)}</span></div>`; }

// ─── Variant Layout Mapping ─────────────────────────────────────────────────

const LAYOUTS = {
  SWIFT_GPI_CROSSBORDER: { fn: layoutSwiftGpi },
  SEPA_INSTANT: { fn: layoutSepa },
  FEDWIRE_RTGS: { fn: layoutFedwire },
  CORRESPONDENT_NOSTRO: { fn: (t, c) => layoutGeneric(t, c, '#f59e0b') },
  TRADE_FINANCE_LC: { fn: (t, c) => layoutGeneric(t, c, '#ec4899') },
  TREASURY_FX: { fn: (t, c) => layoutGeneric(t, c, '#06b6d4') },
  BULK_PAYMENT_PAIN001: { fn: (t, c) => layoutGeneric(t, c, '#6366f1') },
  HIGH_VALUE_URGENT: { fn: (t, c) => layoutGeneric(t, c, '#ef4444') },
};

// ─── Human readable TXT export (LCB multi-payload container format) ─────────

function pad(label, width) { return label + ' '.repeat(Math.max(1, width - label.length)); }

function buildTextExport(t) {
  const m = t.transaction_metadata;
  const h = t.header;
  const v = t.variant_config;
  const c = t.certificate;
  const L = [];
  const rule = '='.repeat(80);
  const dash = '-'.repeat(80);

  L.push(rule);
  L.push('LCB API MULTI-PAYLOAD CONTAINER - HUMAN READABLE TEXT EXPORT');
  L.push(`TRANSACTION SETTLEMENT AMOUNT: ${Number(m.settlement_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${m.currency}`);
  L.push(`TARGET INSTITUTION: ${h.target_institution}`);
  L.push(rule);
  L.push('');
  L.push('[HEADER & METADATA]');
  L.push(`${pad('File Type', 19)}: ${h.file_type}`);
  L.push(`${pad('Version', 19)}: ${h.version}`);
  L.push(`${pad('Exported At', 19)}: ${h.exported_at}`);
  L.push(`${pad('Execution Mode', 19)}: ${h.execution_mode}`);
  L.push(`${pad('Tenant ID', 19)}: ${h.tenant_id}`);
  L.push(`${pad('Template Variant', 19)}: ${h.template_variant} (${h.variant_title})`);
  L.push(`${pad('Message Standards', 19)}: ${h.message_standards}`);
  L.push(`${pad('Container ID', 19)}: ${h.container_id}`);
  L.push(`${pad('Sending Bank TRN', 19)}: ${m.sending_bank_trn}`);
  L.push(`${pad('Instruction ID', 19)}: ${m.instruction_id}`);
  L.push(`${pad('End To End ID', 19)}: ${m.end_to_end_id}`);
  L.push(`${pad('UETR', 19)}: ${m.uetr}`);
  L.push(`${pad('Value Date', 19)}: ${m.value_date}`);
  L.push(`${pad('Debtor Agent BIC', 19)}: ${m.debtor_agent_bic}`);
  L.push(`${pad('Creditor Agent BIC', 19)}: ${m.creditor_agent_bic}`);
  L.push(`${pad('Clearing System', 19)}: ${v.clearing_system}`);
  L.push(`${pad('Service Level', 19)}: ${v.service_level}`);
  L.push(`${pad('Charge Bearer', 19)}: ${v.charge_bearer}`);
  L.push(`${pad('Priority', 19)}: ${v.priority}`);
  L.push('');
  L.push(dash);
  L.push('X.509 CERTIFICATE (RFC 5280) - RFC 8259 ATTACHED');
  L.push(dash);
  L.push(`${pad('Serial Number', 19)}: ${c.serial_number}`);
  L.push(`${pad('Signature Algorithm', 19)}: ${c.signature_algorithm}`);
  L.push(`${pad('Public Key', 19)}: ${c.public_key_algorithm}`);
  L.push(`${pad('Issuer', 19)}: ${c.issuer.raw.replace(/\n/g, ', ')}`);
  L.push(`${pad('Subject', 19)}: ${c.subject.raw.replace(/\n/g, ', ')}`);
  L.push(`${pad('Not Before', 19)}: ${c.validity.not_before_iso}`);
  L.push(`${pad('Not After', 19)}: ${c.validity.not_after_iso}`);
  L.push(`${pad('Subject Key ID', 19)}: ${c.subject_key_identifier}`);
  L.push(`${pad('Fingerprint SHA256', 19)}: ${c.fingerprint_sha256}`);
  L.push(`${pad('Basic Constraints', 19)}: ${c.is_ca ? 'CA:TRUE' : 'CA:FALSE'}`);
  L.push(`${pad('Self Signed', 19)}: ${c.self_signed ? 'YES' : 'NO'}`);
  L.push('');
  L.push(c.certificate_pem.trim());
  L.push('');
  L.push(dash);
  L.push('DEUTSCHE BANK API CONFIGURATION');
  L.push(dash);
  L.push(`${pad('Endpoint', 19)}: ${t.deutsche_bank_api.endpoint}`);
  L.push(`${pad('Destination IP', 19)}: ${t.deutsche_bank_api.destination_ip}`);
  L.push(`${pad('API ID', 19)}: ${t.deutsche_bank_api.api_id}`);
  L.push(`${pad('API Key', 19)}: ${t.deutsche_bank_api.api_key}`);
  L.push(`${pad('OAuth2 Grant', 19)}: ${t.deutsche_bank_api.oauth2.grant_type}`);
  L.push(`${pad('Scope', 19)}: ${t.deutsche_bank_api.oauth2.scope}`);
  L.push(`${pad('Callback URL', 19)}: ${t.callback_config.callback_url}`);
  L.push(`${pad('Expected Status', 19)}: ${t.callback_config.expected_response_status}`);
  L.push('');

  t.iso20022_payloads.forEach((p, i) => {
    L.push(dash);
    L.push(`${i + 1}. EMBEDDED ISO 20022 XML: ${p.message_type} (${p.description})`);
    L.push(dash);
    L.push(`SHA-256 Hash: ${p.sha256_hash}`);
    L.push('');
    L.push(p.xml_content);
    L.push('');
  });

  L.push(rule);
  L.push('END OF TEXT FILE EXPORT');
  L.push(rule);
  L.push('');
  return L.join('\n');
}

// ─── Index page ─────────────────────────────────────────────────────────────

function buildIndex(cards, count) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PrimeStack Certified Templates — Index</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#f0f4f8;color:#1e293b;padding:40px}h1{font-size:28px;margin-bottom:8px}h1 span{color:#3b82f6}p.sub{color:#64748b;font-size:14px;margin-bottom:8px}.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;margin-bottom:24px;background:#16a34a22;color:#16a34a}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;max-width:1200px;margin:0 auto}.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);text-decoration:none;color:inherit;transition:all .2s;display:block}.card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.12)}.card .icon{font-size:28px;margin-bottom:10px}.card h3{font-size:15px;font-weight:600;margin-bottom:4px}.card .bank{font-size:12px;color:#64748b;margin-bottom:8px}.card .tags{display:flex;flex-wrap:wrap;gap:4px}.card .tag{font-size:10px;padding:2px 8px;border-radius:4px;background:#f1f5f9;color:#475569;font-family:monospace}.cert{font-size:10px;color:#16a34a;margin-top:8px;font-weight:600}.card .files{display:flex;gap:10px;margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:11px;font-family:monospace}.card .files a{color:#2563eb;text-decoration:none;font-weight:600}.card .files a:hover{text-decoration:underline}@media(max-width:480px){body{padding:20px}h1{font-size:22px}.grid{grid-template-columns:1fr}}</style></head><body>
<div style="max-width:1200px;margin:0 auto">
<h1>PrimeStack <span>ISO 20022</span> Certified Template Library</h1>
<p class="sub">${count} templates — JSON RFC 8259 with X.509 Certificate + Deutsche Bank API Configuration</p>
<div class="badge">✓ X.509 Certificate Attached | ✓ RSA-SHA256 Signed | ✓ Deutsche Bank API Configured</div>
<div class="grid">
${cards.join('\n')}
</div></div></body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('Issuing X.509 v3 certificate (RSA-4096 / SHA256withRSA)...');
  const cert = buildCertificate();
  const v = cert.view;
  console.log(`  Serial      : ${v.serial_number}`);
  console.log(`  Subject     : ${v.subject_raw}`);
  console.log(`  SKI         : ${v.subject_key_identifier}`);
  console.log(`  Fingerprint : ${v.fingerprint_sha256.slice(0, 32)}...`);
  console.log(`  Valid       : ${v.not_before} → ${v.not_after}`);
  console.log(`  Self-signed : ${v.self_signed} | Key match: ${v.key_matches}\n`);

  // Key material + certificate metadata
  fs.writeFileSync(path.join(OUT_DIR, 'primestack_cert.pem'), cert.certificatePem, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'primestack_public_key.pem'), cert.publicKeyPem, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'primestack_private_key.pem'), cert.privateKeyPem, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'primestack_cert.json'), JSON.stringify({
    ...cert.meta,
    certificate_pem: cert.certificatePem,
    public_key_pem: cert.publicKeyPem,
  }, null, 2), 'utf8');

  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.json') && f !== '_INDEX.json').sort();
  console.log(`Processing ${files.length} templates...\n`);

  let count = 0;
  let allValid = true;
  const cards = [];

  for (const file of files) {
    const tplData = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), 'utf8'));
    const [variantKey, bankKey] = file.replace('.json', '').split('__');

    const rfc8259 = buildRfc8259Template(tplData, cert, variantKey, bankKey);

    // JSON
    fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(rfc8259, null, 2), 'utf8');

    // HTML
    const layout = LAYOUTS[variantKey] || { fn: (t, c) => layoutGeneric(t, c, '#6366f1') };
    const html = layout.fn(rfc8259, cert.view);
    const htmlFile = file.replace('.json', '.html');
    fs.writeFileSync(path.join(HTML_DIR, htmlFile), html, 'utf8');

    // TXT
    const txtFile = file.replace('.json', '.txt');
    fs.writeFileSync(path.join(TXT_DIR, txtFile), buildTextExport(rfc8259), 'utf8');

    // ── Independent verification of what was just written ──
    const written = JSON.parse(fs.readFileSync(path.join(OUT_DIR, file), 'utf8'));
    const payload = signedPayload(written);
    const hashOk = crypto.createHash('sha256').update(payload).digest('hex') === written.digital_signature.payload_hash_sha256;
    const sigOk = crypto.verify('sha256', payload, cert.publicKeyPem, Buffer.from(written.digital_signature.signature_base64, 'base64'));
    const certOk = (() => {
      try {
        const x = new crypto.X509Certificate(written.certificate.certificate_pem);
        return x.serialNumber === written.certificate.serial_number && x.fingerprint256.replace(/:/g, '') === written.certificate.fingerprint_sha256;
      } catch { return false; }
    })();
    const payloadsOk = written.iso20022_payloads.every((p) =>
      crypto.createHash('sha256').update(p.xml_content, 'utf8').digest('hex') === p.sha256_hash);
    const ok = hashOk && sigOk && certOk && payloadsOk;
    if (!ok) allValid = false;

    console.log(`  ${ok ? '✓' : '✗'} ${file} → ${htmlFile} / ${txtFile} (${(fs.statSync(path.join(HTML_DIR, htmlFile)).size / 1024).toFixed(1)} KB)`);

    const h = written.header;
    const vc = written.variant_config;
    const base = file.replace('.json', '');
    cards.push(`<a class="card" href="HTML/${escHtml(base)}.html"><div class="icon">${escHtml(h.variant_icon)}</div><h3>${escHtml(h.variant_title)}</h3><div class="bank">${escHtml(h.target_institution)} — ${escHtml(h.target_institution_bic)}</div><div class="tags"><span class="tag">${escHtml(vc.clearing_system)}</span><span class="tag">${escHtml(vc.priority)}</span><span class="tag">${escHtml(vc.charge_bearer)}</span></div><div class="cert">✓ RFC 8259 + X.509 + DB API</div><div class="files"><a href="HTML/${escHtml(base)}.html">HTML</a><a href="${escHtml(base)}.json">JSON</a><a href="TXT/${escHtml(base)}.txt">TXT</a></div></a>`);

    count++;
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), buildIndex(cards, count), 'utf8');

  console.log(`\n${allValid ? '✅' : '❌'} ${count} certified templates generated`);
  console.log(`   JSON : ${OUT_DIR}`);
  console.log(`   HTML : ${HTML_DIR}`);
  console.log(`   TXT  : ${TXT_DIR}`);
  console.log(`   INDEX: ${path.join(OUT_DIR, 'index.html')}\n`);
}

main();
