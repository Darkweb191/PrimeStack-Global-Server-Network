// start-dashboard.js — PrimeStack Global Server Network Admin Dashboard
// Node.js HTTP server, no framework, no external deps
import { createServer } from 'http';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import { dashboardLocalizationScript } from './dashboard-localization.js';

const PRODUCT_GUIDE_HTML = readFileSync(new URL('./product-guide.html', import.meta.url), 'utf8');

// Base URL the browser-side pages call for API requests.
// Set API_URL on Render to the deployed API service origin.
const API_URL = process.env.API_URL || 'http://localhost:8081';

// --- Service Port Map -------------------------------------------------------
const SVC = {
  ledger:       4001,
  ipwhitelist:  4002,
  auth:         4003,
  terminal:     4004,
  transfer:     4005,
  risk:         4006,
  audit:        4007,
  settlement:   4008,
  notification: 4009,
  switchcore:   4010,
  security:     4011,
  routing:      4012,
  iso8583:      4013,
  crypto:       4014,
  gateway:      8080,
};

// ── Single upstream API ─────────────────────────────────────────────────────
// The PrimeStack Fastify API (src/) runs inside this same service on an internal
// port. Every console /api/* call is proxied there. The SVC port map above is
// retained only as the display list for the health panel.
const API_ORIGIN = process.env.PRIMESTACK_API_URL || process.env.INTERNAL_API_URL || 'http://127.0.0.1:8081';

// Payment rails service (rails-service.js) — runs alongside the API in this service.
const RAILS_ORIGIN = process.env.RAILS_SERVICE_URL || `http://127.0.0.1:${process.env.RAILS_PORT || 8082}`;

// Console operator HMAC credentials — sign proxied API calls so the
// closed-by-default API accepts them. Created by prisma/seed.ts.
const CONSOLE_HMAC_KEY_ID = process.env.CONSOLE_HMAC_KEY_ID || 'psk_console_001';
const CONSOLE_HMAC_SECRET = process.env.CONSOLE_HMAC_SECRET || '';
const HMAC_HEADER_PREFIX = process.env.HMAC_HEADER_PREFIX || 'x-primestack';

// JWT secret shared with the API — verifies the operator session cookie.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const SESSION_COOKIE = 'ps_console_token';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

// Live receiving bank accounts — LOUIS CALTEN INTERNATIONAL LLP
const banks = [
  {
    id: 'bnk_us_001',
    name: 'Community Federal Savings Bank',
    accountHolder: 'LOUIS CALTEN INTERNATIONAL LLP',
    bic: 'CFSBUS33',
    accountNumber: '8335373337',
    routingNumber: '026073008',
    currency: 'USD',
    country: 'US',
    connectionType: 'FEDWIRE',
    address: '5 Penn Plaza, 14th Floor, New York, NY 10001, USA',
    status: 'active',
  },
  {
    id: 'bnk_de_001',
    name: 'Banking Circle',
    accountHolder: 'LOUIS CALTEN INTERNATIONAL LLP',
    bic: 'SXPYDEHH',
    iban: 'DE96202208000029384495',
    currency: 'EUR',
    country: 'DE',
    connectionType: 'SEPA',
    address: 'Banking Circle S.A. – German Branch, Maximilianstraße 54, 80538 München, Germany',
    status: 'active',
  },
  {
    id: 'bnk_sg_001',
    name: 'DBS Bank Limited',
    accountHolder: 'LOUIS CALTEN INTERNATIONAL LLP',
    bic: 'DBSSSGSG',
    accountNumber: '885414256581',
    currency: 'SGD',
    country: 'SG',
    connectionType: 'SWIFT',
    address: '12 Marina Boulevard, Marina Bay Financial Tower 3, Singapore 018982',
    status: 'active',
  },
  {
    id: 'bnk_in_001',
    name: 'Axis Bank Ltd',
    accountHolder: 'LOUIS CALTEN INTERNATIONAL LLP',
    bic: 'AXISINBBA89',
    accountNumber: '923020066384179',
    currency: 'INR',
    country: 'IN',
    connectionType: 'SWIFT',
    address: 'Koramangala 4th Block Premium Branch, Bangalore – 560095',
    status: 'active',
  },
  {
    id: 'bnk_gb_001',
    name: 'Community Federal Savings Bank (GBP Correspondent)',
    accountHolder: 'LOUIS CALTEN INTERNATIONAL LLP',
    bic: 'CFSBGB33',
    accountNumber: '8335373337',
    routingNumber: '026073008',
    currency: 'USD',
    country: 'GB',
    connectionType: 'SWIFT',
    address: '5 Penn Plaza, 14th Floor, New York, NY 10001, USA',
    status: 'active',
  },
];

// --- Shared CSS -------------------------------------------------------------
const CSS = `
<style>
@import url("https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&display=swap");
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#eef3f8;--surf:#ffffff;--surf2:#f8f9fa;
  --border:#dfe1e2;--border2:#c9c9c9;
  --text:#1b1b1b;--text2:#3d4551;--muted:#71767a;
  --accent:#005ea2;--accent-bg:rgba(0,94,162,.08);--accent-border:rgba(0,94,162,.28);
  --success:#18743a;--success-bg:rgba(24,116,58,.08);--success-border:rgba(24,116,58,.28);
  --danger:#b50909;--danger-bg:rgba(181,9,9,.08);--danger-border:rgba(181,9,9,.3);
  --warn:#805200;--warn-bg:rgba(128,82,0,.08);--warn-border:rgba(128,82,0,.28);
  --info-bg:rgba(0,94,162,.06);--info-border:rgba(0,94,162,.2);
  --radius:8px;--radius-sm:6px;
}
html{font-family:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;background:var(--bg);color:var(--text)}
body{min-height:100vh;background-image:url("data:image/svg+xml,%3Csvg viewBox=%22-20 -5 60 40%22 width=%22140%22 xmlns=%22http://www.w3.org/2000/svg%22 opacity=%220.2%22%3E%3Cpath d=%22M1 8l11-7 11 7v8l-11 7-11-7zm0 0l11 8 11-8m0 8L12 8 1 16M12 1v7m0 8v7%22 fill=%22none%22 stroke=%22%230b1f3a%22 stroke-linejoin=%22round%22 stroke-width=%222%22/%3E%3Ctext x=%22-12%22 y=%2232%22 font-size=%225%22 font-family=%22monospace%22 fill=%22%230b1f3a%22%3EBuilt on CodePen%3C/text%3E%3C/svg%3E"),linear-gradient(rgba(17,46,81,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(17,46,81,.025) 1px,transparent 1px),radial-gradient(50% 40% at 8% 12%,rgba(0,94,162,.06),transparent 70%),radial-gradient(45% 35% at 92% 88%,rgba(181,9,9,.05),transparent 70%),radial-gradient(140% 100% at 50% -20%,#fff 0%,#f0f5fa 30%,#e2ebf3 65%,#d4e0ec 100%);background-position:center 48px,0 0,0 0,0 0,0 0,0 0;background-repeat:no-repeat,repeat,repeat,no-repeat,no-repeat,no-repeat;background-size:140px auto,32px 32px,32px 32px,auto,auto,cover;background-attachment:fixed}
body::before{content:"";position:fixed;inset:0 0 auto;height:6px;z-index:10000;pointer-events:none;background:linear-gradient(90deg,#112e51 0 25%,#fff 25% 50%,#b50909 50% 75%,#061529 75%)}
a{text-decoration:none;color:inherit}
button,input,select,textarea{font:inherit;color:inherit}
h1,h2,h3,h4,h5,h6{font-family:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:-.02em}
code,pre,.input-mono,.result{font-family:"JetBrains Mono",ui-monospace,"SFMono-Regular",Consolas,monospace}

/* Layout */
.layout{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
.main{background:transparent;overflow-y:auto;min-width:0}

/* Sidebar */
.sidebar{position:sticky;top:0;height:100vh;overflow-y:auto;overflow-x:hidden;background:#fff;border-right:1px solid var(--border);display:flex;flex-direction:column}
.sidebar-logo{padding:20px 18px 14px;border-bottom:1px solid var(--border)}
.logo-mark{display:flex;align-items:center;gap:8px;font-size:1.05rem;font-weight:800;letter-spacing:-.03em;color:var(--text)}
.logo-mark svg{stroke:var(--accent)}
.logo-icon{width:28px;height:28px;background:var(--accent);color:#fff;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-icon svg{stroke:#fff;width:15px;height:15px}
.logo-sub{font-size:.62rem;color:var(--muted);margin-top:3px;letter-spacing:.2px}
.nav-tabs{display:flex;gap:3px;padding:10px 10px 4px}
.nav-category{flex:1;padding:6px 4px;border:none;background:transparent;color:var(--muted);border-radius:6px;font-size:.68rem;font-weight:700;cursor:pointer;transition:all 120ms;text-transform:uppercase;letter-spacing:.4px}
.nav-category[aria-selected="true"]{background:var(--accent-bg);color:var(--accent)}
.nav-category:hover{background:var(--bg)}
.sidebar-section{padding:4px 8px;flex:1}
.sidebar-section[hidden]{display:none}
.sidebar-label{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);padding:10px 8px 4px}

/* Nav items */
.nav-item{display:block;margin-bottom:1px}
.nav-item a,a.nav-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;font-size:.82rem;color:var(--text2);transition:background 100ms}
.nav-item a:hover,a.nav-item:hover{background:var(--bg)}
.nav-item a svg,a.nav-item svg{width:14px;height:14px;flex-shrink:0;opacity:.7}
.nav-item a span,a.nav-item span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-item.active>a,a.nav-item.active{background:var(--accent-bg);color:var(--accent);font-weight:600}
.nav-item.active>a svg,a.nav-item.active svg{opacity:1;stroke:var(--accent)}
.sidebar-footer{padding:10px 14px;font-size:.65rem;color:var(--muted);border-top:1px solid var(--border);margin-top:auto}

/* Page header */
.page-header{padding:24px 28px 0}
.page-header h1{font-family:"Source Serif 4",Georgia,serif;font-size:1.8rem;font-weight:700;color:#0b1f3a;margin-bottom:4px}
.page-header p{color:var(--muted);font-size:.86rem;margin-bottom:16px}
.breadcrumb{display:flex;align-items:center;gap:6px;font-size:.74rem;color:var(--muted);margin-bottom:5px}
.breadcrumb a{color:var(--accent)}
.breadcrumb span{opacity:.4}

/* Card */
.card{background:var(--surf);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;margin-bottom:14px;box-shadow:inset 3px 0 0 #005ea2,0 1px 2px rgb(11 31 58 / .06),0 4px 12px -2px rgb(11 31 58 / .08);transition:transform .18s,border-color .18s,box-shadow .18s}
.card:hover{transform:translateY(-2px);border-color:#aacdec;box-shadow:inset 4px 0 0 #b50909,0 6px 18px -4px rgb(11 31 58 / .14)}
.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.card-title{display:flex;align-items:center;gap:8px;font-family:"Source Serif 4",Georgia,serif;font-size:.95rem;font-weight:700;color:var(--text);margin-bottom:0}
.ui-icon{display:block;width:16px;height:16px;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.card-sub{font-size:.75rem;color:var(--muted);margin-top:2px}

/* Stats */
.stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;padding:20px 28px 4px}
.stat{background:var(--surf);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px 18px;box-shadow:inset 3px 0 0 #005ea2,0 1px 2px rgb(11 31 58 / .06),0 4px 12px -2px rgb(11 31 58 / .08)}
.stat-val{font-size:1.8rem;font-weight:800;letter-spacing:-.04em;line-height:1}
.stat-lbl{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-top:5px;font-weight:600}
.grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.stat-card{min-width:0;padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surf);box-shadow:inset 3px 0 0 #005ea2,0 1px 2px rgb(11 31 58 / .06),0 4px 12px -2px rgb(11 31 58 / .08)}
.stat-label{color:var(--muted);font-size:.66rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.stat-value{margin-top:7px;font-size:1.55rem;font-weight:750;letter-spacing:-.035em;line-height:1.15;font-variant-numeric:tabular-nums}
.stat-value.stat-ok{color:var(--success)}
.stat-value.stat-warn{color:var(--warn)}
.stat-note{margin-top:4px;color:var(--muted);font-size:.72rem}

/* Grids */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}

/* Page padding */
.page-body{padding:16px 28px 32px}

/* Forms */
.form-group{margin-bottom:12px}
.form-group label{display:block;font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:5px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
input,select,textarea{width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.85rem;outline:none;transition:border 120ms;color:var(--text)}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-bg)}
.input-mono{font-size:.82rem}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:var(--radius-sm);font-size:.82rem;font-weight:600;cursor:pointer;border:1px solid transparent;transition:opacity 120ms,transform 80ms;background:var(--surf);border-color:var(--border);color:var(--text)}
.btn:hover{opacity:.88}
.btn:active{transform:scale(.97)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-success{background:var(--success);color:#fff;border-color:var(--success)}
.btn-danger{background:var(--danger);color:#fff;border-color:var(--danger)}
.btn-warn{background:var(--warn);color:#fff;border-color:var(--warn)}
.btn-ghost{background:transparent;border-color:var(--border);color:var(--text)}
.btn-sm{padding:5px 12px;font-size:.73rem;border-radius:6px}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
.badge-green{background:var(--success-bg);color:var(--success)}
.badge-red{background:var(--danger-bg);color:var(--danger)}
.badge-yellow{background:var(--warn-bg);color:var(--warn)}
.badge-blue{background:var(--accent-bg);color:var(--accent)}
.badge-gray{background:rgba(102,117,138,.1);color:var(--muted)}

/* Tables */
.table-wrap{overflow-x:auto;border-radius:var(--radius-sm);border:1px solid var(--border)}
table{width:100%;border-collapse:collapse;font-size:.8rem}
th{text-align:left;padding:8px 12px;color:var(--muted);border-bottom:2px solid var(--border);font-size:.63rem;text-transform:uppercase;letter-spacing:.5px;font-weight:700;background:var(--bg)}
td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border:none}
tr:hover td{background:#f9fafb}

/* Result boxes */
.result{display:none;margin-top:12px;padding:12px 14px;border-radius:var(--radius-sm);font-size:.76rem;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow-y:auto;border:1px solid var(--border);background:var(--bg)}
.result.show{display:block}
.result.ok{background:var(--success-bg);border-color:var(--success-border);color:#14532d}
.result.err{background:var(--danger-bg);border-color:var(--danger-border);color:#7f1d1d}

/* Tabs */
.tabs{display:flex;gap:3px;padding:16px 28px 0;border-bottom:2px solid var(--border);margin-bottom:20px;overflow-x:auto}
.tab{padding:8px 16px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;background:transparent;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-2px;border-radius:6px 6px 0 0;white-space:nowrap;transition:all 100ms}
.tab:hover{background:var(--bg);color:var(--text)}
.tab.active{color:var(--accent);border-bottom-color:var(--accent);background:var(--accent-bg);font-weight:700}
.tab-pane{display:none}
.tab-pane.active{display:block}

/* Alerts */
.alert{padding:10px 14px;border-radius:var(--radius-sm);font-size:.8rem;margin-bottom:14px;display:flex;align-items:flex-start;gap:8px}
.alert-info{background:var(--info-bg);border:1px solid var(--info-border);color:var(--accent)}
.alert-warn{background:var(--warn-bg);border:1px solid var(--warn-border);color:var(--warn)}
.alert-success{background:var(--success-bg);border:1px solid var(--success-border);color:var(--success)}
.alert-err{background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger)}

/* Portal cards */
.portal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:30px}
.portal-card{background:var(--surf);border:1px solid var(--border);border-radius:var(--radius);padding:26px 22px;cursor:pointer;transition:transform 150ms,box-shadow 150ms;display:block;color:var(--text)}
.portal-card:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,0,0,.08)}
.portal-icon{width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin-bottom:12px}
.portal-icon.blue{background:var(--accent-bg)}
.portal-icon.green{background:var(--success-bg)}
.portal-icon.orange{background:var(--warn-bg)}
.portal-card h3{font-size:1.05rem;font-weight:700;margin-bottom:5px}
.portal-card p{font-size:.8rem;color:var(--muted);line-height:1.55}
.portal-links{margin-top:12px;display:flex;flex-direction:column;gap:3px}
.portal-link{font-size:.78rem;color:var(--accent);font-weight:600}

/* Toast */
#toast{position:fixed;bottom:22px;right:22px;z-index:9999;display:flex;flex-direction:column;gap:7px;pointer-events:none}
.toast-item{padding:10px 18px;border-radius:8px;font-size:.82rem;font-weight:600;color:#fff;background:#1e293b;box-shadow:0 4px 16px rgba(0,0,0,.18);animation:slideUp .25s ease;pointer-events:auto}
.toast-item.ok{background:var(--success)}
.toast-item.err{background:var(--danger)}
.toast-item.warning{background:var(--warn)}
@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}

/* Dots */
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0}
.dot-green{background:var(--success);box-shadow:0 0 5px rgba(22,128,74,.6)}
.dot-red{background:var(--danger)}
.dot-yellow{background:var(--warn);animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}

/* Service monitoring */
.svc-status-panel{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,1fr);gap:18px;align-items:center;margin:0 28px 16px;padding:16px 18px;background:var(--surf);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 1px 2px rgb(11 31 58 / .06),0 4px 12px -2px rgb(11 31 58 / .08)}
.svc-overview-title,.svc-metric-label{font-size:.66rem;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--muted)}
.svc-overview-value{margin-top:4px;font-size:1.3rem;font-weight:800;letter-spacing:-.03em;color:var(--text)}
.svc-overview-note{font-size:.74rem;color:var(--muted)}
.svc-overview-track,.svc-health-track{height:6px;overflow:hidden;border-radius:99px;background:var(--bg)}
.svc-overview-track{margin-top:12px}
.svc-overview-fill,.svc-health-fill{display:block;height:100%;border-radius:inherit;background:var(--success);transition:width 180ms ease}
.svc-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.svc-metric{min-width:0;padding:10px 8px;text-align:center;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)}
.svc-metric-value{margin-top:3px;font-size:1.15rem;font-weight:800;color:var(--text)}
.svc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 28px 14px;color:var(--muted);font-size:.74rem}
.svc-toolbar .btn{flex-shrink:0}
.svc-last-checked{margin-left:auto}
.svc-clock{font-variant-numeric:tabular-nums}
.svc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;padding:0 28px 14px}
.svc-card{display:block;min-width:0;padding:14px 15px;background:var(--surf);border:1px solid var(--border);border-radius:var(--radius);box-shadow:inset 3px 0 0 var(--muted),0 1px 2px rgb(11 31 58 / .06);transition:transform .16s,border-color .16s,box-shadow .16s}
.svc-card:hover{transform:translateY(-2px);border-color:#aacdec;box-shadow:inset 3px 0 0 var(--accent),0 5px 14px -3px rgb(11 31 58 / .14)}
.svc-card[data-state="online"]{box-shadow:inset 3px 0 0 var(--success),0 1px 2px rgb(11 31 58 / .06)}
.svc-card[data-state="offline"]{box-shadow:inset 3px 0 0 var(--danger),0 1px 2px rgb(11 31 58 / .06)}
.svc-name{font-size:.82rem;font-weight:700;color:var(--text)}
.svc-port{margin-top:7px;font:600 .68rem 'JetBrains Mono',ui-monospace,monospace;color:var(--accent)}
.svc-routes{min-height:2.4em;margin-top:5px;overflow-wrap:anywhere;font: .65rem/1.5 'JetBrains Mono',ui-monospace,monospace;color:var(--muted)}
.svc-status{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}
.svc-card .badge{display:inline-flex;align-items:center;gap:6px}
.svc-card .badge-gray{background:#eef1f4;color:var(--text2)}
.svc-health-track{height:3px;margin-top:10px}
.svc-card[data-state="online"] .svc-health-fill{width:100%;background:var(--success)}
.svc-card[data-state="offline"] .svc-health-fill{width:28%;background:var(--danger)}
.svc-card[data-state="unknown"] .svc-health-fill{width:0}

/* Misc */
hr{border:none;border-top:1px solid var(--border);margin:14px 0}
code{background:var(--bg);padding:1px 5px;border-radius:4px;font-size:.78rem;font-family:'Consolas','Menlo',monospace;border:1px solid var(--border)}

/* Responsive */
@media(max-width:1280px){.layout{grid-template-columns:60px 1fr}.sidebar-logo .logo-mark span,.logo-sub,.sidebar-footer,.nav-item a span,a.nav-item span,.sidebar-label,.nav-category{display:none}.nav-tabs{flex-direction:column;align-items:center;padding:6px 4px;gap:3px}.sidebar-section{padding:2px 4px}.nav-item a,a.nav-item{justify-content:center;padding:10px 0}.nav-item a svg,a.nav-item svg{width:16px;height:16px}}
@media(max-width:768px){.layout{grid-template-columns:1fr}.sidebar{display:none}.grid-2,.grid-3{grid-template-columns:1fr}.grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}.form-row{grid-template-columns:1fr}.stat-row{grid-template-columns:1fr 1fr}.tabs{padding:10px 14px 0}.page-header{padding:14px 14px 0}.page-body{padding:10px 14px 22px}.svc-status-panel{grid-template-columns:1fr;margin:0 14px 14px;padding:14px}.svc-toolbar{margin:0 14px 12px}.svc-last-checked{margin-left:0}.svc-grid{grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;padding:0 14px 12px}}
@media(max-width:380px){.grid-4{grid-template-columns:1fr}}
</style>`;

// --- Shared JavaScript ------------------------------------------------------
const JS = `
<div id="toast"></div>
<script>
// Toast
function toast(msg, type) {
  type = type || 'info';
  var el = document.createElement('div');
  el.className = 'toast-item ' + type;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(function() { el.remove(); }, 3500);
}

// API helper — prepends /api
function api(method, path, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch('/api' + path, opts).then(function(r) {
    return r.json().then(function(d) { return { ok: r.ok, status: r.status, data: d }; });
  }).catch(function(e) { return { ok: false, status: 0, data: { error: e.message } }; });
}

// Show result in pre box
function showResult(id, data, isOk) {
  var el = document.getElementById(id);
  if (!el) return;
  el.className = 'result show ' + (isOk ? 'ok' : 'err');
  el.textContent = JSON.stringify(data, null, 2);
}

// Tab init — uses event delegation on data-g / data-t attributes
function initTabs(groupId) {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-g="' + groupId + '"].tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('[data-g="' + groupId + '"].tab-pane'));
  function activate(tab, focus) {
    tabs.forEach(function(item) {
      var selected = item === tab;
      item.classList.toggle('active', selected);
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(function(panel) {
      var selected = panel.id === tab.dataset.t;
      panel.classList.toggle('active', selected);
      panel.hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function(tab, index) {
    tab.addEventListener('click', function() { activate(tab, false); });
    tab.addEventListener('keydown', function(event) {
      var next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[next], true);
    });
  });
  var activeTab = tabs.find(function(tab) { return tab.classList.contains('active'); }) || tabs[0];
  if (activeTab) activate(activeTab, false);
}

// Health badge updater
function refreshHealthBadge(elId, port) {
  var el = document.getElementById(elId);
  if (!el) return;
  fetch('/api/health-all').then(function(r) { return r.json(); }).then(function(d) {
    var svc = d.services && d.services['port_' + port];
    if (svc && svc.ok) {
      el.className = 'badge badge-green';
      el.innerHTML = '<span class="dot"></span> Online';
    } else {
      el.className = 'badge badge-red';
      el.innerHTML = '<span class="dot"></span> Offline';
    }
  }).catch(function() {
    el.className = 'badge badge-yellow';
    el.innerHTML = '<span class="dot"></span> Unknown';
  });
}
</script>`;

// --- Layout helpers ---------------------------------------------------------
const iconPaths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  bank: '<path d="M3 9h18M5 9v9m4-9v9m6-9v9m4-9v9M3 21h18M12 3 3 7h18l-9-4Z"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 9h18M16 14h2"/>',
  shield: '<path d="m12 3 8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  settlement: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 4h6"/>',
  risk: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 8v5m0 3h.01"/>',
  chart: '<path d="M3 3v18h18M7 14l4-4 3 3 6-7"/>',
  send: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  payout: '<path d="M4 7h16M4 12h16M4 17h10"/><path d="m16 15 3 2-3 2"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  terminal: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2-3 3 2 2-2 2-2-2-3 3"/>',
  network: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="m11 7-5 9m7-9 5 9m-11 2h10"/>',
  iso: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5m-9 4h5m-5 4h5"/>',
  route: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h5a5 5 0 0 1 5 5v5"/>',
  audit: '<path d="M8 4h10v17H6V6h2"/><path d="M9 10h6m-6 4h6m-6 4h3M8 2h5v4H8z"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M7 21h10m-5-4v4m-6-9h3l2-4 3 7 2-3h2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-14 5h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 7v5h-5"/><path d="M4.7 9a7.5 7.5 0 0 1 12.6-2L20 12M4 17v-5h5"/><path d="M19.3 15a7.5 7.5 0 0 1-12.6 2L4 12"/>',
};
function svgIcon(name) {
  const path = iconPaths[name];
  if (!path) throw new Error(`Unknown dashboard icon: ${name}`);
  return `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24">${path}</svg>`;
}

function sidebar(active) {
  const link = (href, label, icon) => {
    const cls = active === href ? ' active' : '';
    return `<a href="${href}" class="nav-item${cls}">${icon}<span>${label}</span></a>`;
  };
  return `
<nav class="sidebar" aria-label="Main navigation">
  <div class="sidebar-logo">
    <div class="logo-mark"><span class="logo-icon">${svgIcon('grid')}</span><span>PrimeStack Global Server Network</span></div>
    <div class="logo-sub">v201.3 — Global Payment Network &amp; Asset Gateway</div>
  </div>
  <div class="nav-tabs" role="tablist" aria-label="Workspace sections">
    <button class="nav-category" type="button" role="tab" id="nav-tab-platform" aria-controls="nav-platform" data-nav-tab="platform">Platform</button>
    <button class="nav-category" type="button" role="tab" id="nav-tab-merchant" aria-controls="nav-merchant" data-nav-tab="merchant">Merchant</button>
    <button class="nav-category" type="button" role="tab" id="nav-tab-ops" aria-controls="nav-ops" data-nav-tab="ops">Operation</button>
  </div>
  <div class="sidebar-section nav-panel" id="nav-platform" role="tabpanel" aria-labelledby="nav-tab-platform" data-nav-panel="platform">
    ${link('/platform','Overview','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M2 2h5v5H2zm7 0h5v5H9zm-7 7h5v5H2zm7 7h5v-5H9" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>')}
    ${link('/platform/banks','Bank Connections','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="5" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M1 8h14M5 8v6M11 8v6" stroke="currentColor" stroke-width="1.5"/><path d="M8 2L1 5h14L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>')}
    ${link('/platform/funding','Funding','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v6M6 9.5c0 .83.67 1.5 2 1.5s2-.67 2-1.5S10.5 8 8 8s-2-.67-2-1.5S6.67 5 8 5s2 .67 2 1.5" stroke="currentColor" stroke-width="1.5"/></svg>')}
    ${link('/platform/receive-funds','Receive Funds','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M2 8h8m0 0L7 5m3 3L7 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="10" y="3" width="4" height="10" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>')}
    ${link('/platform/server-funds','Server Funds','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><ellipse cx="8" cy="4" rx="6" ry="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 4v4c0 1.1 2.7 2 6 2s6-.9 6-2V4M2 8v4c0 1.1 2.7 2 6 2s6-.9 6-2V8" stroke="currentColor" stroke-width="1.5"/></svg>')}
    ${link('/platform/s2s-engine','S2S Engine','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M2 8h9M8 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="3" cy="8" r="1.5" fill="currentColor"/></svg>', active)}
    ${link('/platform/rails','Payment Rails','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M1 4h14M1 12h14M4 1v14M12 1v14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')}
    ${link('/platform/whitelist','IP Whitelist','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 1L2 4v4c0 3.5 2.6 6.7 6 7.5C11.4 14.7 14 11.5 14 8V4L8 1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>')}
    ${link('/platform/settlement','Settlement','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2 7h12M5 3v2M11 3v2" stroke="currentColor" stroke-width="1.5"/></svg>')}
    ${link('/platform/risk','Risk Engine','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 1.5L1.5 5v6L8 14.5 14.5 11V5L8 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v3M8 10.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')}
    ${link('/platform/monitoring','Monitoring','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M1 9l3-4 3 3 3-5 3 3 2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}
    ${link('/platform/merchants','Merchants','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M2 5h12l-1.5 7H3.5L2 5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M1 5l1-3h12l1 3" stroke="currentColor" stroke-width="1.5"/></svg>')}
  </div>
  <div class="sidebar-section nav-panel" id="nav-merchant" role="tabpanel" aria-labelledby="nav-tab-merchant" data-nav-panel="merchant" hidden>
    ${link('/merchant','Dashboard','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>')}
    ${link('/merchant/send','Send Money','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}
    ${link('/merchant/t2t','T2T Engine','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="4" width="5" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="4" width="5" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M6 8h4M8 6l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}
    ${link('/merchant/payout','Payout','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 2v12M4 10l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}
    ${link('/merchant/balance','Balance','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M1.5 7h13" stroke="currentColor" stroke-width="1.5"/><circle cx="10.5" cy="9.5" r="1" fill="currentColor"/></svg>')}
    ${link('/merchant/terminals','Terminals','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="2" y="1.5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 14.5h6M8 10.5v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')}
    ${link('/merchant/keys','API Keys','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><circle cx="5.5" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 8H15M12 6v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')}
    ${link('/merchant/payment-link','Payment Links','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L7 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')}
    ${link('/merchant/wallet','My Wallet','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M1 7h14" stroke="currentColor" stroke-width="1.5"/><circle cx="11.5" cy="10" r="1" fill="currentColor"/></svg>')}
    ${link('/merchant/terminal-register','Terminal Registration','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 7h6M5 9.5h3M12 9.5h.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')}
    ${link('/merchant/bank-connect','Receiving Bank Setup','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="5" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M1 8h14M5 8v6M11 8v6" stroke="currentColor" stroke-width="1.5"/><path d="M8 2L1 5h14L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>')}
  </div>
  <div class="sidebar-section nav-panel" id="nav-ops" role="tabpanel" aria-labelledby="nav-tab-ops" data-nav-panel="ops" hidden>
    ${link('/ops','Ops Hub','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')}
    ${link('/ops/terminals','Terminal Ops','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 7l2 2 4-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}
    ${link('/ops/network','Network / Keys','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><circle cx="4" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 8h3M6 7.5L10 5M6 8.5L10 11" stroke="currentColor" stroke-width="1.5"/></svg>')}
    ${link('/ops/iso8583','ISO 8583','<svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 7h7M4.5 9.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>')}
  </div>
  <script>
  (function(){
    var tabs=Array.prototype.slice.call(document.querySelectorAll('[data-nav-tab]'));
    var panels=Array.prototype.slice.call(document.querySelectorAll('[data-nav-panel]'));
    var selected=${JSON.stringify(active.startsWith('/merchant') ? 'merchant' : active.startsWith('/ops') ? 'ops' : 'platform')};
    function activate(group,focus){
      tabs.forEach(function(tab){
        var current=tab.dataset.navTab===group;
        tab.setAttribute('aria-selected',String(current));
        tab.tabIndex=current?0:-1;
        if(current&&focus)tab.focus();
      });
      panels.forEach(function(panel){panel.hidden=panel.dataset.navPanel!==group;});
    }
    tabs.forEach(function(tab,index){
      tab.addEventListener('click',function(){activate(tab.dataset.navTab,false);});
      tab.addEventListener('keydown',function(event){
        var next=index;
        if(event.key==='ArrowRight')next=(index+1)%tabs.length;
        else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=tabs.length-1;
        else return;
        event.preventDefault();
        activate(tabs[next].dataset.navTab,true);
      });
    });
    activate(selected,false);
  })();
  </script>
  <div class="sidebar-footer">PrimeStack Global Server Network v201.3 — <a href="/platform/monitoring" style="color:var(--accent);text-decoration:none">14 services</a> · <a href="/platform/guide" style="color:var(--accent);text-decoration:none">Instructions</a></div>
</nav>`;
}

function page(title, active, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script>window.__API_URL__=${JSON.stringify(API_URL)};</script>
<title>${title} — PrimeStack</title>
${CSS}
</head>
<body>
<div class="layout">
${sidebar(active)}
<main class="main">
${content}
</main>
</div>
${JS}
</body>
</html>`;
}

// --- Landing Page ------------------------------------------------------------
function landingPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script>window.__API_URL__=${JSON.stringify(API_URL)};</script>
<title>PrimeStack — Console</title>
${CSS}
<style>
.launch{padding:0 28px 44px;max-width:1040px}
.launch-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.launch-tile{background:var(--surf);border:1px solid var(--border);border-radius:var(--radius);padding:20px;display:flex;flex-direction:column;box-shadow:inset 3px 0 0 #005ea2}
.launch-tile h2{font-family:"Source Serif 4",Georgia,serif;font-size:1rem;font-weight:700;margin-bottom:4px}
.launch-tile p{font-size:.8rem;color:var(--muted);line-height:1.55;margin-bottom:16px}
.launch-list{display:flex;flex-direction:column;gap:5px;border-top:1px solid var(--border);padding-top:12px;margin-top:auto}
.launch-list a{font-size:.78rem;font-weight:600;color:var(--accent);text-decoration:none}
.launch-list a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="page-header">
  <h1>PrimeStack Global Server Network</h1>
  <p>Select a console to continue.</p>
</div>
<div class="launch">
  <div class="launch-grid">
    <div class="launch-tile">
      <h2>Platform Admin</h2>
      <p>Bank connections, IP whitelisting, settlement runs, risk engine, and service monitoring.</p>
      <a class="btn btn-primary btn-sm" href="/platform">Open Platform Admin</a>
      <div class="launch-list" style="margin-top:14px">
        <a href="/platform/banks">Bank Connections</a>
        <a href="/platform/receive-funds">Receive Funds</a>
        <a href="/platform/server-funds">Server Funds</a>
        <a href="/platform/settlement">Settlement</a>
        <a href="/platform/risk">Risk Engine</a>
        <a href="/platform/monitoring">Service Monitoring</a>
      </div>
    </div>
    <div class="launch-tile">
      <h2>Merchant Portal</h2>
      <p>Send transfers, run T2T, manage payouts, view balances, configure terminals, and manage API keys.</p>
      <a class="btn btn-primary btn-sm" href="/merchant">Open Merchant Portal</a>
      <div class="launch-list" style="margin-top:14px">
        <a href="/merchant/send">Send Money</a>
        <a href="/merchant/t2t">T2T Engine</a>
        <a href="/merchant/payout">Payout</a>
        <a href="/merchant/balance">Balance &amp; History</a>
        <a href="/merchant/terminals">Terminals</a>
        <a href="/merchant/terminal-register">Terminal Registration</a>
        <a href="/merchant/payment-link">Payment Links</a>
        <a href="/merchant/wallet">My Wallet</a>
        <a href="/merchant/keys">API Keys</a>
      </div>
    </div>
    <div class="launch-tile">
      <h2>Operations Hub</h2>
      <p>Terminal management, network configuration, HMAC/API key administration, and ISO 8583 message testing.</p>
      <a class="btn btn-primary btn-sm" href="/ops">Open Operations Hub</a>
      <div class="launch-list" style="margin-top:14px">
        <a href="/ops/terminals">Terminal Ops</a>
        <a href="/ops/network">Network &amp; Keys</a>
        <a href="/ops/iso8583">ISO 8583 Test</a>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:20px">
    <div class="card-header" style="margin-bottom:8px">
      <div class="card-title">${svgIcon('audit')} Instructions</div>
    </div>
    <p style="font-size:.8rem;color:var(--muted);line-height:1.6;margin-bottom:14px">Setup steps, credentials and operating procedures for every console.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn btn-ghost btn-sm" href="/platform/guide">Open User Guide</a>
      <a class="btn btn-ghost btn-sm" href="/platform/bank-guide">Bank Integration Guide</a>
    </div>
  </div>
</div>
${JS}
</body>
</html>`;
}

// --- Platform Overview -------------------------------------------------------
function platformOverview() {
  return page('Platform Overview', '/platform', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span>Platform</div>
  <h1>Platform Overview</h1>
  <p>System health, quick stats, and navigation across all platform modules.</p>
</div>
<div class="grid-4" style="margin-bottom:24px">
  <div class="stat-card"><div class="stat-label">Services</div><div class="stat-value" id="svc-count">14</div><div class="stat-note">microservices</div></div>
  <div class="stat-card"><div class="stat-label">Status</div><div class="stat-value stat-ok" id="platform-status">—</div><div class="stat-note">overall health</div></div>
  <div class="stat-card"><div class="stat-label">Switch Core</div><div class="stat-value">:4010</div><div class="stat-note">transactions + routing</div></div>
  <div class="stat-card"><div class="stat-label">Gateway</div><div class="stat-value">:8080</div><div class="stat-note">API proxy</div></div>
</div>
<div class="grid-3" style="gap:12px">
  <a href="/platform/banks" class="card" style="text-decoration:none;display:block">
    <div class="card-title">${svgIcon('bank')} Bank Connections</div>
    <div class="card-sub">Manage connected banks and test connectivity</div>
  </a>
  <a href="/platform/funding" class="card" style="text-decoration:none;display:block">
    <div class="card-title">${svgIcon('wallet')} Funding</div>
    <div class="card-sub">Load wallets, receive funds, manage transfers</div>
  </a>
  <a href="/platform/whitelist" class="card" style="text-decoration:none;display:block">
    <div class="card-title">${svgIcon('shield')} IP Whitelist</div>
    <div class="card-sub">Manage allowed IPs and view access audit log</div>
  </a>
  <a href="/platform/settlement" class="card" style="text-decoration:none;display:block">
    <div class="card-title">${svgIcon('settlement')} Settlement</div>
    <div class="card-sub">EOD runs, batch management, reconciliation</div>
  </a>
  <a href="/platform/risk" class="card" style="text-decoration:none;display:block">
    <div class="card-title">${svgIcon('risk')} Risk Engine</div>
    <div class="card-sub">Fraud rules, blacklist, AML, country controls</div>
  </a>
  <a href="/platform/monitoring" class="card" style="text-decoration:none;display:block">
    <div class="card-title">${svgIcon('monitor')} Monitoring</div>
    <div class="card-sub">Live status for all 14 services</div>
  </a>
</div>
<script>
document.addEventListener('DOMContentLoaded', function() {
  fetch('/api/health-all').then(function(r){return r.json();}).then(function(d){
    var svcs = d.services || {};
    var keys = Object.keys(svcs);
    var ok = keys.filter(function(k){return svcs[k].ok;}).length;
    var el = document.getElementById('platform-status');
    if (ok === keys.length) { el.textContent = 'All OK'; el.className = 'stat-value stat-ok'; }
    else if (ok === 0) { el.textContent = 'Down'; el.className = 'stat-value stat-err'; }
    else { el.textContent = ok + '/' + keys.length; el.className = 'stat-value stat-warn'; }
  }).catch(function(){ document.getElementById('platform-status').textContent = 'N/A'; });
});
</script>
`);
}

// --- Platform Banks ----------------------------------------------------------
function platformBanks() {
  return page('Bank Connections', '/platform/banks', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Banks</div>
  <h1>Bank Connections</h1>
  <p>Connected correspondent banks and funding rails.</p>
  <div style="margin-top:12px"><a href="/platform/bank-guide" class="btn btn-ghost btn-sm">Integration Instructions</a></div>
</div>
<div class="tabs">
  <div class="tab active" data-g="banks" data-t="banks-list" onclick="bkTab('banks-list',this)">Connected Banks</div>
  <div class="tab" data-g="banks" data-t="banks-add" onclick="bkTab('banks-add',this)">Add Bank</div>
  <div class="tab" data-g="banks" data-t="banks-test" onclick="bkTab('banks-test',this)">Test Connection</div>
</div>
<div id="banks-list" class="tab-pane active" data-g="banks">
  <div class="card">
    <div class="card-header">
      <div><div class="card-title">Bank Directory</div><div class="card-sub">Saved bank metadata; this demo does not connect to banks or provide funding rails</div></div>
      <button class="btn btn-ghost btn-sm" onclick="loadBanks()">↻ Refresh</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Bank Name</th><th>BIC/SWIFT</th><th>Currency</th><th>Connection Type</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody id="banks-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Loading…</td></tr></tbody></table></div>
  </div>
</div>
<div id="banks-add" class="tab-pane" data-g="banks">
  <div class="card" style="max-width:520px">
    <div class="card-title" style="margin-bottom:20px">Add Bank Record</div>
    <div class="form-group"><label>Bank Name *</label><input id="b-name" placeholder="Community Federal Savings Bank"></div>
    <div class="form-row">
      <div class="form-group"><label>BIC / SWIFT</label><input id="b-bic" class="input-mono" placeholder="FNBKUS33" maxlength="11"></div>
      <div class="form-group"><label>Currency</label><select id="b-cur"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>NGN</option><option>KES</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Connection Type</label><select id="b-type"><option value="ACH">ACH (US Domestic)</option><option value="SWIFT">SWIFT (International)</option><option value="SEPA">SEPA (Europe)</option><option value="API">Bank API (Direct)</option></select></div>
    </div>
    <p class="card-sub" style="margin:12px 0">This demo stores only public bank metadata in memory. Do not enter account numbers, IBANs, API credentials, or other secrets. Adding a record does not establish a bank connection.</p>
    <button class="btn btn-primary" onclick="addBank()" style="width:100%;justify-content:center;padding:11px">Add Bank Record</button>
    <div id="bank-add-result" class="result"></div>
  </div>
</div>
<div id="banks-test" class="tab-pane" data-g="banks">
  <div class="card" style="max-width:480px">
    <div class="card-title" style="margin-bottom:20px">Test Bank Connectivity</div>
    <div class="form-group"><label>Select Bank</label><select id="b-test-sel"><option value="">— select a bank —</option></select></div>
    <p class="card-sub" style="margin:12px 0">Tests live connectivity to the selected bank via SWIFT / ISO 8583. Ensure the bank connector is configured and the host is reachable before running.</p>
    <button class="btn btn-primary" onclick="testBank()">Run Connectivity Test</button>
    <div id="bank-test-result" class="result"></div>
  </div>
</div>
<div id="_toast" class="toast"></div>
<script>
function bkTab(id,btn){
  document.querySelectorAll('[data-g="banks"].tab').forEach(function(b){b.classList.remove('active')});
  document.querySelectorAll('[data-g="banks"].tab-pane').forEach(function(p){p.classList.remove('active')});
  btn.classList.add('active');
  var pane=document.getElementById(id);if(pane)pane.classList.add('active');
}
function loadBanks(){
  fetch('/api/platform/banks').then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(d){
    var banks=d.banks||[];
    var tbody=document.getElementById('banks-tbody');
    tbody.replaceChildren();
    banks.forEach(function(b){
      var row=document.createElement('tr');
      [b.name,b.bic||'—',b.currency,b.connectionType||'—'].forEach(function(value,index){
        var cell=document.createElement('td');
        cell.textContent=String(value);
        if(index===0){var strong=document.createElement('strong');strong.textContent=cell.textContent;cell.replaceChildren(strong);}
        if(index===1){var code=document.createElement('code');code.textContent=cell.textContent;cell.replaceChildren(code);}
        row.appendChild(cell);
      });
      var statusCell=document.createElement('td');
      var badge=document.createElement('span');
      badge.className='badge '+(b.status==='active'?'badge-green':'badge-gray');
      badge.textContent=String(b.status||'unknown');
      statusCell.appendChild(badge);
      row.appendChild(statusCell);
      var actionCell=document.createElement('td');
      var removeButton=document.createElement('button');
      removeButton.type='button';
      removeButton.className='btn btn-danger btn-sm';
      removeButton.textContent='Remove';
      removeButton.addEventListener('click',function(){removeBank(b.id);});
      actionCell.appendChild(removeButton);
      row.appendChild(actionCell);
      tbody.appendChild(row);
    });
    if(!banks.length){
      var emptyRow=document.createElement('tr');
      var emptyCell=document.createElement('td');
      emptyCell.colSpan=6;
      emptyCell.style.textAlign='center';
      emptyCell.style.color='var(--muted)';
      emptyCell.textContent='No bank records yet';
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }
    var sel=document.getElementById('b-test-sel');
    sel.replaceChildren();
    var placeholder=document.createElement('option');
    placeholder.value='';
    placeholder.textContent='— select a bank —';
    sel.appendChild(placeholder);
    banks.forEach(function(b){
      var option=document.createElement('option');
      option.value=b.id;
      option.textContent=b.name;
      sel.appendChild(option);
    });
  }).catch(function(e){
    var tbody=document.getElementById('banks-tbody');
    tbody.replaceChildren();
    var row=document.createElement('tr');
    var cell=document.createElement('td');
    cell.colSpan=6;
    cell.style.textAlign='center';
    cell.style.color='var(--danger)';
    cell.textContent='Error loading bank records: '+e.message;
    row.appendChild(cell);
    tbody.appendChild(row);
  });
}
function addBank(){
  var name=document.getElementById('b-name').value.trim();
  if(!name){bkToast('Bank name is required','err');return;}
  var body={name:name,bic:document.getElementById('b-bic').value.trim(),currency:document.getElementById('b-cur').value,connectionType:document.getElementById('b-type').value};
  var btn=document.querySelector('[onclick="addBank()"]');
  if(btn){btn.disabled=true;btn.textContent='Adding…';}
  fetch('/api/platform/banks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'HTTP '+r.status);return d;});}).then(function(d){
    var resultEl=document.getElementById('bank-add-result');
    resultEl.className='result show '+(d.bank?'ok':'err');
    resultEl.textContent=JSON.stringify(d,null,2);
    if(d.bank){
      bkToast('Bank added: '+d.bank.name,'ok');
      document.getElementById('b-name').value='';
      document.getElementById('b-bic').value='';
      bkTab('banks-list',document.querySelector('[data-t="banks-list"]'));
      loadBanks();
    } else { bkToast('Failed: '+(d.error||'unknown'),'err'); }
    if(btn){btn.disabled=false;btn.textContent='Add Bank Connection';}
  }).catch(function(e){
    bkToast('Network error: '+e.message,'err');
    if(btn){btn.disabled=false;btn.textContent='Add Bank Connection';}
  });
}
function removeBank(id){
  if(!confirm('Remove this bank connection?'))return;
  fetch('/api/platform/banks/'+encodeURIComponent(id),{method:'DELETE'}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'HTTP '+r.status);return d;});}).then(function(d){
    bkToast(d.ok?'Bank removed':'Error: '+(d.error||'failed'),d.ok?'ok':'err');
    loadBanks();
  }).catch(function(e){bkToast('Could not remove bank: '+e.message,'err');});
}
function testBank(){
  var id=document.getElementById('b-test-sel').value;
  if(!id){bkToast('Select a bank first','err');return;}
  fetch('/api/platform/banks/'+encodeURIComponent(id)+'/test',{method:'POST'}).then(function(r){return r.json().then(function(d){return {ok:r.ok,data:d};});}).then(function(result){
    var el=document.getElementById('bank-test-result');
    el.className='result show '+(result.ok&&result.data.ok?'ok':'err');
    el.textContent=JSON.stringify(result.data,null,2);
    bkToast(result.data.message||result.data.error||'Bank connection was not tested',result.ok&&result.data.ok?'ok':'err');
  }).catch(function(e){bkToast('Bank test unavailable: '+e.message,'err');});
}
function bkToast(msg,type){
  var t=document.getElementById('_toast');
  if(!t)return;
  t.textContent=msg;
  t.className='toast show'+(type==='err'?' err':'');
  clearTimeout(window._bkTT);
  window._bkTT=setTimeout(function(){t.classList.remove('show');},3800);
}
loadBanks();
</script>
`);
}


// --- Platform Funding --------------------------------------------------------
function platformFunding() {
  return page('Funding', '/platform/funding', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Funding</div>
  <h1>Funding</h1>
  <p>Load wallets, process incoming funds, and manage platform liquidity.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="fund" data-t="fund-load">Load Wallet</div>
  <div class="tab" data-g="fund" data-t="fund-receive">Receive Funds</div>
  <div class="tab" data-g="fund" data-t="fund-transfer">Internal Transfer</div>
  <div class="tab" data-g="fund" data-t="fund-accounts">Accounts</div>
  <div class="tab" data-g="fund" data-t="fund-holds">Holds</div>
  <div class="tab" data-g="fund" data-t="fund-history">History</div>
</div>
<div id="fund-load" class="tab-pane active" data-g="fund">
  <div class="card" style="max-width:480px">
    <div class="card-title" style="margin-bottom:20px">Load Wallet</div>
    <div class="form-group"><label>Wallet / Account ID</label><input id="fl-wallet" class="input-mono" placeholder="acc_xxxx"></div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="fl-amount" type="number" step="0.01" placeholder="1000.00"></div>
      <div class="form-group"><label>Currency</label><select id="fl-cur"><option>USD</option><option>EUR</option><option>GBP</option><option>XOF</option></select></div>
    </div>
    <div class="form-group"><label>Reference</label><input id="fl-ref" class="input-mono" placeholder="LOAD-001"></div>
    <div class="form-group"><label>Description</label><input id="fl-desc" placeholder="Top-up from bank wire"></div>
    <button class="btn btn-primary" onclick="loadWallet()">Load Wallet</button>
    <div id="fund-load-result" class="result"></div>
  </div>
</div>
<div id="fund-receive" class="tab-pane" data-g="fund">
  <div class="card" style="max-width:520px">
    <div class="card-title" style="margin-bottom:20px">Receive Incoming Funds</div>
    <div class="notice notice-info" style="margin-bottom:16px">Record an incoming bank transfer to a platform account.</div>
    <div class="form-group"><label>Destination Account</label><input id="fr-dest" class="input-mono" placeholder="acc_xxxx"></div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="fr-amount" type="number" step="0.01" placeholder="5000.00"></div>
      <div class="form-group"><label>Currency</label><select id="fr-cur"><option>USD</option><option>EUR</option><option>GBP</option></select></div>
    </div>
    <div class="form-group"><label>Sender Bank</label><select id="fr-bank"><option value="">— select bank —</option></select></div>
    <div class="form-group"><label>Reference / UETR</label><input id="fr-ref" class="input-mono" placeholder="UETR-xxxx"></div>
    <button class="btn btn-primary" onclick="receiveFunds()">Record Receipt</button>
    <div id="fund-receive-result" class="result"></div>
  </div>
</div>
<div id="fund-transfer" class="tab-pane" data-g="fund">
  <div class="card" style="max-width:480px">
    <div class="card-title" style="margin-bottom:20px">Internal Account Transfer</div>
    <div class="form-row">
      <div class="form-group"><label>From Account</label><input id="ft-from" class="input-mono" placeholder="acc_xxxx"></div>
      <div class="form-group"><label>To Account</label><input id="ft-to" class="input-mono" placeholder="acc_yyyy"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="ft-amount" type="number" step="0.01"></div>
      <div class="form-group"><label>Currency</label><select id="ft-cur"><option>USD</option><option>EUR</option></select></div>
    </div>
    <div class="form-group"><label>Memo</label><input id="ft-memo" placeholder="Platform rebalance"></div>
    <button class="btn btn-primary" onclick="internalTransfer()">Execute Transfer</button>
    <div id="fund-transfer-result" class="result"></div>
  </div>
</div>
<div id="fund-accounts" class="tab-pane" data-g="fund">
  <div class="card">
    <div class="card-header">
      <div class="card-title">All Accounts</div>
      <button class="btn btn-ghost btn-sm" onclick="loadAccounts()">${svgIcon("refresh")} Refresh</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Account ID</th><th>Type</th><th>Currency</th><th>Balance</th><th>Status</th></tr></thead>
      <tbody id="accounts-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh to load</td></tr></tbody>
      </table>
    </div>
  </div>
</div>
<div id="fund-holds" class="tab-pane" data-g="fund">
  <div class="card" style="max-width:480px">
    <div class="card-title" style="margin-bottom:20px">Check Hold</div>
    <div class="form-group"><label>Hold Reference</label><input id="hold-ref" class="input-mono" placeholder="HLD-xxxx"></div>
    <button class="btn btn-primary" onclick="checkHold()">Lookup</button>
    <div id="hold-result" class="result"></div>
  </div>
</div>
<div id="fund-history" class="tab-pane" data-g="fund">
  <div class="card">
    <div class="card-header">
      <div class="card-title">Journal Entries</div>
      <button class="btn btn-ghost btn-sm" onclick="loadJournal()">${svgIcon("refresh")} Refresh</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>ID</th><th>Type</th><th>Amount</th><th>Currency</th><th>Account</th><th>Date</th></tr></thead>
      <tbody id="journal-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Click refresh to load</td></tr></tbody>
      </table>
    </div>
  </div>
</div>
<script>
function loadWallet() {
  api('POST','/wallets/entries',{accountId:document.getElementById('fl-wallet').value,amount:document.getElementById('fl-amount').value,currency:document.getElementById('fl-cur').value,reference:document.getElementById('fl-ref').value,description:document.getElementById('fl-desc').value,type:'credit'}).then(function(r){showResult('fund-load-result',r.data,r.ok);if(r.ok)toast('Wallet loaded','ok');});
}
function receiveFunds() {
  api('POST','/wallets/entries',{accountId:document.getElementById('fr-dest').value,amount:document.getElementById('fr-amount').value,currency:document.getElementById('fr-cur').value,reference:document.getElementById('fr-ref').value,type:'credit',source:'bank_wire'}).then(function(r){showResult('fund-receive-result',r.data,r.ok);if(r.ok)toast('Funds recorded','ok');});
}
function internalTransfer() {
  api('POST','/transfers',{fromAccountId:document.getElementById('ft-from').value,toAccountId:document.getElementById('ft-to').value,amount:document.getElementById('ft-amount').value,currency:document.getElementById('ft-cur').value,memo:document.getElementById('ft-memo').value}).then(function(r){showResult('fund-transfer-result',r.data,r.ok);if(r.ok)toast('Transfer sent','ok');});
}
function loadAccounts() {
  api('GET','/wallets/accounts').then(function(r){
    var rows=(r.data.data||r.data||[]).map(function(a){return '<tr><td><code>'+a.account_number+'</code></td><td>'+a.account_type+'</td><td>'+a.currency+'</td><td><strong>'+a.available_balance+'</strong></td><td><span class="badge '+(a.status==='active'?'badge-green':'badge-gray')+'">'+a.status+'</span></td></tr>';}).join('');
    document.getElementById('accounts-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No accounts</td></tr>';
  });
}
function checkHold() {
  var ref=document.getElementById('hold-ref').value;
  api('GET','/wallets/holds/'+ref).then(function(r){showResult('hold-result',r.data,r.ok);});
}
function loadJournal() {
  api('GET','/wallets/entries').then(function(r){
    var rows=(r.data.data||r.data||[]).slice(0,50).map(function(e){return '<tr><td><code>'+e.id+'</code></td><td>'+e.entry_type+'</td><td>'+e.amount+'</td><td>'+e.currency+'</td><td><code>'+e.accountId+'</code></td><td>'+new Date(e.created_at).toLocaleString()+'</td></tr>';}).join('');
    document.getElementById('journal-tbody').innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No entries</td></tr>';
  });
}
document.addEventListener('DOMContentLoaded', function() { initTabs('fund'); });
</script>
`);
}

// --- Platform Whitelist ------------------------------------------------------
function platformWhitelist() {
  return page('IP Whitelist', '/platform/whitelist', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>IP Whitelist</div>
  <h1>IP Whitelist</h1>
  <p>Manage allowed IP addresses and audit access attempts.</p>
</div>
<div class="grid-2" style="gap:20px;align-items:start">
  <div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title" style="margin-bottom:16px">Add IP Entry</div>
      <div class="form-group"><label>IP Address / CIDR</label><input id="ip-addr" class="input-mono" placeholder="203.0.113.1 or 10.0.0.0/24"></div>
      <div class="form-group"><label>Label</label><input id="ip-label" placeholder="Office — Production server"></div>
      <div class="form-group"><label>Expires (optional)</label><input id="ip-exp" type="datetime-local"></div>
      <button class="btn btn-primary" onclick="addIp()">Add Entry</button>
      <div id="ip-add-result" class="result"></div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Check IP</div>
      <div class="form-group"><label>IP to Check</label><input id="ip-check" class="input-mono" placeholder="203.0.113.42"></div>
      <button class="btn btn-ghost" onclick="checkIp()">Check</button>
      <div id="ip-check-result" class="result"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header">
      <div class="card-title">Allowed IPs</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="loadIps()">${svgIcon("refresh")} Refresh</button>
        <button class="btn btn-danger btn-sm" onclick="purgeIps()">Purge Expired</button>
      </div>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>IP / CIDR</th><th>Label</th><th>Expires</th><th>Actions</th></tr></thead>
      <tbody id="ip-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh to load</td></tr></tbody>
      </table>
    </div>
    <div id="ip-purge-result" class="result"></div>
  </div>
</div>
<script>
function ipApiError(result){var body=result&&result.data;return body&&body.error&&body.error.message||body&&body.message||'IP Whitelist request failed (HTTP '+(result&&result.status||'unknown')+').';}
function loadIps() {
  var body=document.getElementById('ip-tbody');
  api('GET','/ipwhitelist/entries').then(function(r){
    if(!r.ok||!r.data||r.data.success===false)throw new Error(ipApiError(r));
    var entries=Array.isArray(r.data.data)?r.data.data:[];
    body.replaceChildren();
    if(!entries.length){body.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--muted)">No entries</td></tr>';return;}
    entries.forEach(function(entry){
      var row=document.createElement('tr');var ipCell=document.createElement('td');var code=document.createElement('code');code.textContent=entry.ip_range;ipCell.appendChild(code);
      var labelCell=document.createElement('td');labelCell.textContent=entry.label||'—';
      var expiryCell=document.createElement('td');expiryCell.textContent=entry.expires_at?new Date(entry.expires_at).toLocaleString():'Never';
      var actionCell=document.createElement('td');var remove=document.createElement('button');remove.type='button';remove.className='btn btn-danger btn-sm';remove.textContent='Delete';remove.addEventListener('click',function(){deleteIp(entry.id);});actionCell.appendChild(remove);
      row.append(ipCell,labelCell,expiryCell,actionCell);body.appendChild(row);
    });
  }).catch(function(error){body.replaceChildren();var row=document.createElement('tr');var cell=document.createElement('td');cell.colSpan=4;cell.textContent=error.message;row.appendChild(cell);body.appendChild(row);toast(error.message,'err');});
}
function addIp() {
  var ipRange=document.getElementById('ip-addr').value.trim();var label=document.getElementById('ip-label').value.trim();
  if(!ipRange){showResult('ip-add-result',{error:'Enter an IP address or CIDR range.'},false);return;}
  var date=document.getElementById('ip-exp').value;
  api('POST','/ipwhitelist/entries',{ipRange:ipRange,label:label||undefined,expiresAt:date?new Date(date).toISOString():undefined}).then(function(r){
    showResult('ip-add-result',r.data,r.ok&&r.data&&r.data.success!==false);
    if(!r.ok||!r.data||r.data.success===false){toast(ipApiError(r),'err');return;}
    toast('IP range added','ok');document.getElementById('ip-addr').value='';document.getElementById('ip-label').value='';document.getElementById('ip-exp').value='';loadIps();
  }).catch(function(error){showResult('ip-add-result',{error:error.message},false);toast(error.message,'err');});
}
function checkIp() {
  var ip=document.getElementById('ip-check').value.trim();if(!ip){showResult('ip-check-result',{error:'Enter an IP address to check.'},false);return;}
  api('POST','/ipwhitelist/check',{ip:ip}).then(function(r){showResult('ip-check-result',r.data,r.ok&&r.data&&r.data.success!==false);if(!r.ok||!r.data||r.data.success===false)toast(ipApiError(r),'err');}).catch(function(error){showResult('ip-check-result',{error:error.message},false);toast(error.message,'err');});
}
function deleteIp(id) {
  api('DELETE','/ipwhitelist/entries/'+encodeURIComponent(id)).then(function(r){if(!r.ok||!r.data||r.data.success===false){toast(ipApiError(r),'err');return;}toast('IP entry deactivated','ok');loadIps();}).catch(function(error){toast(error.message,'err');});
}
function purgeIps() {
  if(!window.confirm('Deactivate all expired IP whitelist entries?'))return;
  api('POST','/ipwhitelist/purge').then(function(r){
    showResult('ip-purge-result',r.data,r.ok&&r.data&&r.data.success!==false);
    if(!r.ok||!r.data||r.data.success===false){toast(ipApiError(r),'err');return;}
    var purged=r.data.data&&Number(r.data.data.purged)||0;toast(purged+' expired entr'+(purged===1?'y':'ies')+' deactivated','ok');loadIps();
  }).catch(function(error){showResult('ip-purge-result',{error:error.message},false);toast(error.message,'err');});
}
document.addEventListener('DOMContentLoaded', loadIps);
</script>
`);
}

// --- Platform Settlement -----------------------------------------------------
function platformSettlement() {
  return page('Settlement', '/platform/settlement', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Settlement</div>
  <h1>Settlement</h1>
  <p>Run end-of-day settlement, review batches, and manage reversals.</p>
</div>
<div class="grid-4" style="margin-bottom:24px">
  <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value" id="settle-pending">—</div><div class="stat-note">transactions</div></div>
  <div class="stat-card"><div class="stat-label">Last EOD</div><div class="stat-value" id="settle-last">—</div><div class="stat-note">run</div></div>
  <div class="stat-card"><div class="stat-label">Queue</div><div class="stat-value" id="settle-queue">—</div><div class="stat-note">items</div></div>
  <div class="stat-card"><div class="stat-label">Net Position</div><div class="stat-value" id="settle-net">—</div><div class="stat-note">USD</div></div>
</div>
<div class="grid-2" style="gap:20px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:16px">Run EOD Settlement</div>
    <div class="form-row">
      <div class="form-group"><label>Date</label><input id="eod-date" type="date"></div>
      <div class="form-group"><label>Currency</label><select id="eod-cur"><option>USD</option><option>EUR</option><option>GBP</option></select></div>
    </div>
    <div class="form-group"><label>Dry Run</label><select id="eod-dry"><option value="true">Yes (preview only)</option><option value="false">No (execute)</option></select></div>
    <button class="btn btn-primary" onclick="runEod()">Run EOD</button>
    <div id="eod-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-header">
      <div class="card-title">Settlement Batches</div>
      <button class="btn btn-ghost btn-sm" onclick="loadBatches()">${svgIcon("refresh")} Refresh</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Batch ID</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody id="batches-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody>
      </table>
    </div>
  </div>
</div>
<script>
function runEod() {
  api('POST','/settlement/eod',{date:document.getElementById('eod-date').value,currency:document.getElementById('eod-cur').value,dryRun:document.getElementById('eod-dry').value==='true'}).then(function(r){showResult('eod-result',r.data,r.ok);if(r.ok)toast('EOD complete','ok');});
}
function loadBatches() {
  api('GET','/settlement/batches').then(function(r){
    var rows=(r.data.data||r.data||[]).slice(0,20).map(function(b){return '<tr><td><code>'+b.id+'</code></td><td>'+(b.date||b.createdAt||'')+'</td><td>'+(b.gross_amount||'')+'</td><td><span class="badge '+(b.status==='completed'?'badge-green':b.status==='pending'?'badge-yellow':'badge-gray')+'">'+b.status+'</span></td></tr>';}).join('');
    document.getElementById('batches-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No batches</td></tr>';
  });
}
document.addEventListener('DOMContentLoaded', function() {
  var today = new Date().toISOString().split('T')[0];
  document.getElementById('eod-date').value = today;
  loadBatches();
  api('GET','/settlement/queue').then(function(r){document.getElementById('settle-queue').textContent=(r.data.total||r.data.count||'0');});
  api('GET','/settlement/net').then(function(r){document.getElementById('settle-net').textContent=(r.data.net||r.data.total||'—');});
});
</script>
`);
}

// --- Platform Risk -----------------------------------------------------------
function platformRisk() {
  return page('Risk Engine', '/platform/risk', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Risk</div>
  <h1>Risk Engine</h1>
  <p>Evaluate transactions, manage blacklists, review queue, and configure AML rules.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="risk" data-t="risk-eval">Evaluate</div>
  <div class="tab" data-g="risk" data-t="risk-dash">Dashboard</div>
  <div class="tab" data-g="risk" data-t="risk-black">Blacklist</div>
  <div class="tab" data-g="risk" data-t="risk-review">Review Queue</div>
  <div class="tab" data-g="risk" data-t="risk-aml">AML</div>
  <div class="tab" data-g="risk" data-t="risk-countries">Countries</div>
</div>
<div id="risk-eval" class="tab-pane active" data-g="risk">
  <div class="card" style="max-width:520px">
    <div class="card-title" style="margin-bottom:16px">Risk Evaluation</div>
    <div class="form-row">
      <div class="form-group"><label>Transaction Reference *</label><input id="re-txid" class="input-mono" placeholder="TXN-xxxx"></div>
      <div class="form-group"><label>Source Account *</label><input id="re-source" class="input-mono" placeholder="TERMINAL:TID00001:USD"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Merchant ID</label><input id="re-mid" class="input-mono" placeholder="LOUIS-001"></div>
      <div class="form-group"><label>Country</label><input id="re-country" placeholder="US" maxlength="2"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount *</label><input id="re-amount" type="number" step="0.01" min="0.01" placeholder="500.00"></div>
      <div class="form-group"><label>Currency *</label><select id="re-currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>NGN</option><option>KES</option></select></div>
    </div>
    <button class="btn btn-primary" onclick="evaluateRisk()">Evaluate</button>
    <div id="risk-eval-result" class="result"></div>
  </div>
</div>
<div id="risk-dash" class="tab-pane" data-g="risk">
  <div class="card"><div class="card-header"><div class="card-title">Risk Dashboard</div><button class="btn btn-ghost btn-sm" onclick="loadRiskDash()">${svgIcon("chart")} Load</button></div><div id="risk-dash-content" style="color:var(--muted);font-size:.85rem">Click load to fetch data.</div></div>
</div>
<div id="risk-black" class="tab-pane" data-g="risk">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Add to Blacklist</div>
      <div class="form-group"><label>Identifier</label><input id="bl-id" class="input-mono" placeholder="Card, IP, merchant, account…"></div>
      <div class="form-group"><label>Type</label><select id="bl-type"><option value="CARD">Card</option><option value="IP">IP</option><option value="MERCHANT">Merchant</option><option value="ACCOUNT">Account</option><option value="DEVICE">Device</option><option value="WALLET">Wallet</option></select></div>
      <div class="form-group"><label>Reason</label><input id="bl-reason" placeholder="Fraud confirmed"></div>
      <button class="btn btn-danger" onclick="addBlacklist()">Blacklist</button>
      <div id="bl-result" class="result"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Blacklist</div><button class="btn btn-ghost btn-sm" onclick="loadBlacklist()">${svgIcon("refresh")} Refresh</button></div>
      <div class="table-wrap"><table><thead><tr><th>Identifier</th><th>Type</th><th>Reason</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody id="bl-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div>
    </div>
  </div>
</div>
<div id="risk-review" class="tab-pane" data-g="risk">
  <div class="card"><div class="card-header"><div class="card-title">Review Queue</div><button class="btn btn-ghost btn-sm" onclick="loadReviewQueue()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>TX ID</th><th>Amount</th><th>Score</th><th>Risk Factors</th><th>Status</th><th>Actions</th></tr></thead>
  <tbody id="rq-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="risk-aml" class="tab-pane" data-g="risk">
  <div class="card" style="max-width:520px"><div class="card-title" style="margin-bottom:16px">Open AML Case</div>
  <div class="form-row">
    <div class="form-group"><label>Transaction Reference</label><input id="aml-tx-ref" class="input-mono" placeholder="TXN-xxxx"></div>
    <div class="form-group"><label>Merchant ID</label><input id="aml-merchant" class="input-mono" placeholder="LOUIS-001"></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>Entity Type</label><select id="aml-type"><option value="PERSON">Person</option><option value="COMPANY">Company</option><option value="ACCOUNT">Account</option></select></div>
    <div class="form-group"><label>Entity ID</label><input id="aml-entity" placeholder="Entity or account identifier"></div>
  </div>
  <div class="form-row">
    <div class="form-group"><label>Risk Score</label><input id="aml-score" type="number" min="0" max="100" placeholder="0–100"></div>
    <div class="form-group"><label>Total Amount</label><input id="aml-amount" type="number" min="0" step="0.01" placeholder="1000.00"></div>
  </div>
  <div class="form-group"><label>Currency</label><select id="aml-currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>NGN</option><option>KES</option></select></div>
  <div class="form-group"><label>Remarks</label><textarea id="aml-remarks" placeholder="Reason for opening this case"></textarea></div>
  <button class="btn btn-primary" onclick="amlCheck()">Create AML Case</button>
  <div id="aml-result" class="result"></div></div>
</div>
<div id="risk-countries" class="tab-pane" data-g="risk">
  <div class="card"><div class="card-header"><div class="card-title">Country Risk Configuration</div><button class="btn btn-ghost btn-sm" onclick="loadCountries()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Country</th><th>Risk Level</th><th>Allowed</th><th>Actions</th></tr></thead>
  <tbody id="ctry-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<script>
function riskHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});}
function riskRows(data){return Array.isArray(data)?data:Array.isArray(data&&data.data)?data.data:[];}
function evaluateRisk(){
  var txRef=document.getElementById('re-txid').value.trim();
  var sourceId=document.getElementById('re-source').value.trim();
  var amount=document.getElementById('re-amount').value;
  if(!txRef||!sourceId||!amount||Number(amount)<=0){toast('Transaction reference, source account, and a positive amount are required','err');return;}
  api('POST','/risk/evaluate',{txRef:txRef,sourceId:sourceId,amount:amount,currency:document.getElementById('re-currency').value,merchantId:document.getElementById('re-mid').value.trim()||undefined,countryCode:document.getElementById('re-country').value.trim().toUpperCase()||undefined}).then(function(r){showResult('risk-eval-result',r.data,r.ok);if(!r.ok)toast('Risk evaluation failed','err');});
}
function loadRiskDash(){api('GET','/risk/dashboard').then(function(r){var el=document.getElementById('risk-dash-content');if(!r.ok){el.textContent=JSON.stringify(r.data);toast('Could not load risk dashboard','err');return;}var pre=document.createElement('pre');pre.style.cssText='font-size:.78rem;white-space:pre-wrap';pre.textContent=JSON.stringify(r.data.data||r.data,null,2);el.replaceChildren(pre);});}
function addBlacklist(){
  var value=document.getElementById('bl-id').value.trim();
  if(!value){toast('Identifier is required','err');return;}
  api('POST','/risk/blacklist',{blacklistType:document.getElementById('bl-type').value,value:value,reason:document.getElementById('bl-reason').value.trim()||undefined}).then(function(r){showResult('bl-result',r.data,r.ok);if(r.ok){toast('Added to blacklist','ok');document.getElementById('bl-id').value='';loadBlacklist();}else toast('Could not add blacklist entry','err');});
}
function loadBlacklist(){
  api('GET','/risk/blacklist').then(function(r){
    var entries=riskRows(r.data);
    if(!r.ok){document.getElementById('bl-tbody').innerHTML='<tr><td colspan="5">Unable to load blacklist</td></tr>';toast('Could not load blacklist','err');return;}
    var rows=entries.map(function(e){return '<tr><td><code>'+riskHtml(e.value)+'</code></td><td>'+riskHtml(e.blacklist_type)+'</td><td>'+riskHtml(e.reason||'—')+'</td><td>'+(e.created_at?new Date(e.created_at).toLocaleDateString():'—')+'</td><td><button class="btn btn-danger btn-sm" data-blacklist-type="'+riskHtml(e.blacklist_type)+'" data-blacklist-value="'+riskHtml(e.value)+'">Remove</button></td></tr>';}).join('');
    var tbody=document.getElementById('bl-tbody');tbody.innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No blacklist entries</td></tr>';
    tbody.querySelectorAll('[data-blacklist-value]').forEach(function(button){button.addEventListener('click',function(){removeBlacklist(button.dataset.blacklistType,button.dataset.blacklistValue);});});
  });
}
function removeBlacklist(type,value){
  if(!confirm('Remove this identifier from the blacklist?'))return;
  api('DELETE','/risk/blacklist/'+encodeURIComponent(type)+'/'+encodeURIComponent(value)).then(function(r){if(r.ok){toast('Blacklist entry removed','ok');loadBlacklist();}else toast('Could not remove blacklist entry','err');});
}
function loadReviewQueue(){
  api('GET','/risk/review').then(function(r){
    var entries=riskRows(r.data);
    if(!r.ok){document.getElementById('rq-tbody').innerHTML='<tr><td colspan="6">Unable to load review queue</td></tr>';toast('Could not load review queue','err');return;}
    var rows=entries.map(function(e){var factors=e.risk_factors;var factorText=typeof factors==='string'?factors:JSON.stringify(factors||{});var canReview=e.status==='OPEN'||e.status==='ASSIGNED';return '<tr><td><code>'+riskHtml(e.transaction_ref||'—')+'</code></td><td>'+riskHtml(e.amount||'—')+' '+riskHtml(e.currency||'')+'</td><td>'+riskHtml(e.risk_score)+'</td><td>'+riskHtml(factorText)+'</td><td><span class="badge badge-yellow">'+riskHtml(e.status)+'</span></td><td>'+(canReview?'<button class="btn btn-success btn-sm" data-review-id="'+riskHtml(e.id)+'" data-review-action="approve">Approve</button> <button class="btn btn-danger btn-sm" data-review-id="'+riskHtml(e.id)+'" data-review-action="reject">Reject</button>':'—')+'</td></tr>';}).join('');
    var tbody=document.getElementById('rq-tbody');tbody.innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No cases awaiting review</td></tr>';
    tbody.querySelectorAll('[data-review-id]').forEach(function(button){button.addEventListener('click',function(){reviewRiskCase(button.dataset.reviewId,button.dataset.reviewAction);});});
  });
}
function reviewRiskCase(id,decision){
  var reviewer=prompt('Reviewer name');if(!reviewer||!reviewer.trim())return;
  var notes=prompt('Decision notes (optional)')||'';
  var body=decision==='approve'?{approvedBy:reviewer.trim(),notes:notes}:{rejectedBy:reviewer.trim(),notes:notes};
  api('POST','/risk/review/'+encodeURIComponent(id)+'/'+decision,body).then(function(r){if(r.ok){toast(decision==='approve'?'Review approved':'Review rejected','ok');loadReviewQueue();}else toast('Could not update review case','err');});
}
function amlCheck(){
  var body={transactionRef:document.getElementById('aml-tx-ref').value.trim()||undefined,merchantId:document.getElementById('aml-merchant').value.trim()||undefined,entityType:document.getElementById('aml-type').value,entityId:document.getElementById('aml-entity').value.trim()||undefined,riskScore:document.getElementById('aml-score').value?Number(document.getElementById('aml-score').value):undefined,totalAmount:document.getElementById('aml-amount').value||undefined,currency:document.getElementById('aml-currency').value,remarks:document.getElementById('aml-remarks').value.trim()||undefined};
  if(body.riskScore!==undefined&&(body.riskScore<0||body.riskScore>100)){toast('Risk score must be between 0 and 100','err');return;}
  api('POST','/risk/aml',body).then(function(r){showResult('aml-result',r.data,r.ok);if(r.ok)toast('AML case created','ok');else toast('Could not create AML case','err');});
}
function loadCountries(){
  api('GET','/risk/countries').then(function(r){
    var entries=riskRows(r.data);
    if(!r.ok){document.getElementById('ctry-tbody').innerHTML='<tr><td colspan="4">Unable to load country rules</td></tr>';toast('Could not load country rules','err');return;}
    var rows=entries.map(function(c){var score=Number(c.risk_score)||0;var level=score>70?'High':score>40?'Medium':'Low';var badge=score>70?'badge-red':score>40?'badge-yellow':'badge-green';var allowed=Boolean(c.allowed);return '<tr><td>'+riskHtml(c.country_name||c.country_code)+' <code>'+riskHtml(c.country_code)+'</code></td><td><span class="badge '+badge+'">'+level+' · '+score+'</span></td><td><span class="badge '+(allowed?'badge-green':'badge-red')+'">'+(allowed?'Allowed':'Blocked')+'</span></td><td><button class="btn '+(allowed?'btn-danger':'btn-success')+' btn-sm" data-country-code="'+riskHtml(c.country_code)+'" data-country-allowed="'+String(allowed)+'" data-risk-score="'+score+'">'+(allowed?'Block':'Allow')+'</button></td></tr>';}).join('');
    var tbody=document.getElementById('ctry-tbody');tbody.innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No country rules configured</td></tr>';
    tbody.querySelectorAll('[data-country-code]').forEach(function(button){button.addEventListener('click',function(){updateCountryRule(button.dataset.countryCode,button.dataset.countryAllowed!=='true',Number(button.dataset.riskScore));});});
  });
}
function updateCountryRule(code,allowed,riskScore){
  if(!confirm((allowed?'Allow':'Block')+' transactions from '+code+'?'))return;
  api('PUT','/risk/countries/'+encodeURIComponent(code),{allowed:allowed,riskScore:riskScore}).then(function(r){if(r.ok){toast('Country rule updated','ok');loadCountries();}else toast('Could not update country rule','err');});
}
document.addEventListener('DOMContentLoaded', function(){initTabs('risk');});
</script>
`);
}

// --- Platform Monitoring -----------------------------------------------------
function platformMonitoring() {
  const svcs = [
    { key:'ledger',      port:4001, name:'Ledger',         routes:'/accounts, /entries, /holds',                     href:'/admin/svc/ledger' },
    { key:'ipwhitelist', port:4002, name:'IP Whitelist',   routes:'/entries, /check, /purge',                        href:'/admin/svc/ipwhitelist' },
    { key:'auth',        port:4003, name:'Auth',           routes:'/verify, /keys, /sign',                           href:'/admin/svc/auth' },
    { key:'terminal',    port:4004, name:'Terminal',       routes:'/terminals, /merchants, /keys, /firmware',        href:'/admin/svc/terminal' },
    { key:'transfer',    port:4005, name:'Transfer',       routes:'/transfers',                                      href:'/admin/svc/transfer' },
    { key:'risk',        port:4006, name:'Risk',           routes:'/risk/evaluate, /risk/blacklist, /risk/aml',      href:'/admin/svc/risk' },
    { key:'audit',       port:4007, name:'Audit',          routes:'/events, /alerts',                                href:'/admin/svc/audit' },
    { key:'settlement',  port:4008, name:'Settlement',     routes:'/batches, /queue, /eod, /reconciliation',         href:'/admin/svc/settlement' },
    { key:'notification',port:4009, name:'Notification',   routes:'/notifications, /webhooks, /events',              href:'/admin/svc/notification' },
    { key:'switchcore',  port:4010, name:'Switch Core',    routes:'/transactions, /acquirers, /routing',             href:'/admin/svc/switchcore' },
    { key:'security',    port:4011, name:'Security',       routes:'/hmac/keys, /api-keys, /users, /roles',           href:'/admin/svc/security' },
    { key:'routing',     port:4012, name:'Routing',        routes:'/routes, /connections, /rules, /dashboard',      href:'/admin/svc/routing' },
    { key:'iso8583',     port:4013, name:'ISO 8583',       routes:'/process, /parse, /simulate, /dashboard',        href:'/admin/svc/iso8583' },
    { key:'crypto',      port:4014, name:'Crypto Payout',  routes:'/withdraw, /health',                              href:'/admin/svc/crypto' },
    { key:'gateway',     port:8080, name:'API Gateway',    routes:'proxy only',                                      href:'/admin/svc/gateway' },
  ];

  const cards = svcs.map(s => `
<a href="${s.href}" class="svc-card" data-state="checking" aria-label="${s.name} service status; open service admin panel">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <div class="svc-name">${s.name}</div>
    <span id="badge-${s.key}" class="badge badge-gray" aria-live="polite"><span class="dot"></span> Checking</span>
  </div>
  <div class="svc-port">:${s.port}</div>
  <div class="svc-routes">${s.routes}</div>
  <div class="svc-status"><span class="svc-overview-note">Health endpoint</span><span id="latency-${s.key}" class="svc-overview-note">—</span></div>
  <div class="svc-health-track" aria-hidden="true"><span class="svc-health-fill"></span></div>
</a>`).join('\n');

  return page('Monitoring', '/platform/monitoring', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Monitoring</div>
  <h1>Service Operations Matrix</h1>
  <p>Live health status for all 14 services. Select a service card to open its admin panel.</p>
</div>
<section class="svc-status-panel" aria-label="Service status summary">
  <div class="svc-overview">
    <div class="svc-overview-title">System Status</div>
    <div id="svc-summary" class="svc-overview-value" aria-live="polite">Checking services</div>
    <div id="svc-summary-note" class="svc-overview-note">Health checks are running.</div>
    <div class="svc-overview-track" role="progressbar" aria-label="Online services" aria-valuemin="0" aria-valuemax="${svcs.length}" aria-valuenow="0">
      <span id="svc-summary-fill" class="svc-overview-fill"></span>
    </div>
  </div>
  <div class="svc-metrics">
    <div class="svc-metric"><div class="svc-metric-label">Total services</div><div class="svc-metric-value">${svcs.length}</div></div>
    <div class="svc-metric"><div class="svc-metric-label">Online</div><div id="svc-online" class="svc-metric-value">—</div></div>
    <div class="svc-metric"><div class="svc-metric-label">Offline</div><div id="svc-offline" class="svc-metric-value">—</div></div>
  </div>
</section>
<div class="svc-toolbar">
  <button class="btn btn-primary" onclick="refreshAll()">${svgIcon("refresh")} Refresh All</button>
  <span id="overall-badge" class="badge badge-gray" role="status" aria-live="polite"><span class="dot"></span> Checking</span>
  <span id="svc-last-checked" class="svc-last-checked">Last checked —</span>
  <time id="svc-clock" class="svc-clock" aria-label="Local time">--:--:--</time>
</div>
<div class="svc-grid">${cards}</div>
<script>
var SVC_KEYS = ${JSON.stringify(svcs.map(s=>({key:s.key,port:s.port})))};
function refreshAll() {
  var button=document.querySelector('.svc-toolbar button');
  if(button)button.disabled=true;
  fetch('/api/health-all').then(function(r){
    if(!r.ok)throw new Error('Health check returned HTTP '+r.status);
    return r.json();
  }).then(function(d){
    if(!d||!d.services||typeof d.services!=='object')throw new Error('Health check response did not include service results');
    var svcs = d.services || {};
    var up=0,down=0;
    SVC_KEYS.forEach(function(s) {
      var el = document.getElementById('badge-'+s.key);
      var info = svcs['port_'+s.port];
      var card=document.querySelector('.svc-card[href="/admin/svc/'+s.key+'"]');
      var latency=document.getElementById('latency-'+s.key);
      if(!el||!card)return;
      if(info&&info.ok){
        up++;
        el.className='badge badge-green';el.innerHTML='<span class="dot"></span> Online';
        card.dataset.state='online';
      }else{
        down++;
        el.className='badge badge-red';el.innerHTML='<span class="dot"></span> Offline';
        card.dataset.state='offline';
      }
      latency.textContent=info&&Number.isFinite(Number(info.responseMs))?Math.max(0,Number(info.responseMs))+' ms':'Health check';
    });
    var total = SVC_KEYS.length;
    var ob = document.getElementById('overall-badge');
    var summary=document.getElementById('svc-summary');
    var note=document.getElementById('svc-summary-note');
    var fill=document.getElementById('svc-summary-fill');
    var progress=fill.parentElement;
    document.getElementById('svc-online').textContent=String(up);
    document.getElementById('svc-offline').textContent=String(down);
    summary.textContent=up===total?'All systems online':up===0?'All services offline':up+' / '+total+' online';
    note.textContent=down===0?'All service health checks passed.':down+' service'+(down===1?' is':'s are')+' not responding.';
    fill.style.width=(total?up/total*100:0)+'%';
    progress.setAttribute('aria-valuenow',String(up));
    if (up===total){ob.className='badge badge-green';ob.innerHTML='<span class="dot"></span> All '+total+' services online';}
    else if (up===0){ob.className='badge badge-red';ob.innerHTML='<span class="dot"></span> All services offline';}
    else{ob.className='badge badge-yellow';ob.innerHTML='<span class="dot"></span> '+up+'/'+total+' online';}
    document.getElementById('svc-last-checked').textContent='Last checked '+new Date().toLocaleTimeString();
  }).catch(function(error){
    var ob=document.getElementById('overall-badge');
    ob.className='badge badge-yellow';ob.textContent='Health check failed';
    ob.title=error.message;
    document.getElementById('svc-summary').textContent='Health data unavailable';
    document.getElementById('svc-summary-note').textContent=error.message;
    document.getElementById('svc-online').textContent='—';
    document.getElementById('svc-offline').textContent='—';
    document.getElementById('svc-summary-fill').style.width='0';
    document.querySelector('.svc-overview-track[role="progressbar"]').setAttribute('aria-valuenow','0');
    SVC_KEYS.forEach(function(s){
      var badge=document.getElementById('badge-'+s.key);
      var card=document.querySelector('.svc-card[href="/admin/svc/'+s.key+'"]');
      var latency=document.getElementById('latency-'+s.key);
      if(badge){badge.className='badge badge-gray';badge.textContent='Unknown';}
      if(card)card.dataset.state='unknown';
      if(latency)latency.textContent='Unavailable';
    });
  }).finally(function(){if(button)button.disabled=false;});
}
document.addEventListener('DOMContentLoaded', function(){
  var clock=document.getElementById('svc-clock');
  var updateClock=function(){clock.textContent=new Date().toLocaleTimeString();};
  updateClock();
  window.setInterval(updateClock,1000);
  refreshAll();
  window.setInterval(refreshAll,15000);
});
</script>
`);
}

// --- Platform Merchants ------------------------------------------------------
function platformMerchants() {
  return page('Merchants', '/platform/merchants', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Merchants</div>
  <h1>Merchants</h1>
  <p>View and manage all registered merchants.</p>
</div>
<div class="card">
  <div class="card-header">
    <div class="card-title">Merchant List</div>
    <button class="btn btn-ghost btn-sm" onclick="loadMerchants()">${svgIcon("refresh")} Refresh</button>
  </div>
  <div class="table-wrap">
    <table><thead><tr><th>Merchant ID</th><th>Name</th><th>MCC</th><th>Currency</th><th>Status</th><th>Created</th></tr></thead>
    <tbody id="merchants-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Loading—</td></tr></tbody></table>
  </div>
</div>
<script>
function loadMerchants(){
  api('GET','/terminals/merchants').then(function(r){
    var rows=(r.data.merchants||r.data||[]).map(function(m){return '<tr><td><code>'+m.id+'</code></td><td><strong>'+m.name+'</strong></td><td>'+(m.mcc||'')+'</td><td>'+(m.currency||'')+'</td><td><span class="badge '+(m.status==='active'?'badge-green':'badge-gray')+'">'+m.status+'</span></td><td>'+(m.createdAt?new Date(m.createdAt).toLocaleDateString():'')+'</td></tr>';}).join('');
    document.getElementById('merchants-tbody').innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No merchants</td></tr>';
  });
}
document.addEventListener('DOMContentLoaded', loadMerchants);
</script>
`);
}

// --- Merchant Dashboard ------------------------------------------------------
function merchantDashboard() {
  return page('Merchant Dashboard', '/merchant', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span>Merchant</div>
  <h1>Merchant Dashboard</h1>
  <p>Your payment activity at a glance.</p>
</div>
<div class="grid-4" style="margin-bottom:24px">
  <div class="stat-card"><div class="stat-label">Balance</div><div class="stat-value" id="m-balance">—</div><div class="stat-note">USD</div></div>
  <div class="stat-card"><div class="stat-label">Today Txns</div><div class="stat-value" id="m-txns">—</div><div class="stat-note">transactions</div></div>
  <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value stat-warn" id="m-pending">—</div><div class="stat-note">settlements</div></div>
  <div class="stat-card"><div class="stat-label">Terminals</div><div class="stat-value" id="m-terminals">—</div><div class="stat-note">active</div></div>
</div>
<div class="grid-3" style="gap:12px">
  <a href="/merchant/send" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('send')} Send Money</div>
    <div class="card-sub">T2T, S2S, Wallet, ISO 8583 transfers</div>
  </a>
  <a href="/merchant/payout" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('payout')} Payout</div>
    <div class="card-sub">Bank transfer, crypto, view history</div>
  </a>
  <a href="/merchant/balance" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('history')} Balance &amp; History</div>
    <div class="card-sub">Full ledger view and transaction history</div>
  </a>
  <a href="/merchant/terminals" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('terminal')} Terminals</div>
    <div class="card-sub">Manage POS terminals and device keys</div>
  </a>
  <a href="/merchant/keys" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('key')} API Keys</div>
    <div class="card-sub">HMAC keys, rotate credentials</div>
  </a>
</div>
<script>
document.addEventListener('DOMContentLoaded', function(){
  api('GET','/wallets/accounts').then(function(r){var a=(r.data.data||r.data||[])[0];if(a)document.getElementById('m-balance').textContent=a.balance;});
  api('GET','/transactions').then(function(r){var t=r.data.transactions||r.data||[];document.getElementById('m-txns').textContent=t.length;});
  api('GET','/terminals').then(function(r){var t=r.data.terminals||r.data||[];document.getElementById('m-terminals').textContent=t.length;});
});
</script>
`);
}

// --- Merchant Send -----------------------------------------------------------
function merchantSend() {
  return page('Send Money', '/merchant/send', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>Send</div>
  <h1>Send Money</h1>
  <p>Initiate transfers via multiple rails.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="send" data-t="send-t2t">T2T Transfer</div>
  <div class="tab" data-g="send" data-t="send-s2s">S2S Transfer</div>
  <div class="tab" data-g="send" data-t="send-wallet">Wallet Transfer</div>
  <div class="tab" data-g="send" data-t="send-iso">ISO 8583</div>
</div>
<div id="send-t2t" class="tab-pane active" data-g="send">
  <div class="card" style="max-width:520px">
    <div class="card-title" style="margin-bottom:16px">Terminal-to-Terminal Transfer</div>
    <div class="form-row">
      <div class="form-group"><label>From Account</label><input id="t2t-from" class="input-mono" placeholder="acc_xxxx"></div>
      <div class="form-group"><label>To Account</label><input id="t2t-to" class="input-mono" placeholder="acc_yyyy"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="t2t-amount" type="number" step="0.01" placeholder="100.00"></div>
      <div class="form-group"><label>Currency</label><select id="t2t-cur"><option>USD</option><option>EUR</option><option>GBP</option></select></div>
    </div>
    <div class="form-group"><label>Reference</label><input id="t2t-ref" class="input-mono" placeholder="TXN-001"></div>
    <div class="form-group"><label>Description</label><input id="t2t-desc" placeholder="Payment for services"></div>
    <button class="btn btn-primary" onclick="sendT2T()">Send</button>
    <div id="t2t-result" class="result"></div>
  </div>
</div>
<div id="send-s2s" class="tab-pane" data-g="send">
  <div class="card" style="max-width:520px">
    <div class="card-title" style="margin-bottom:16px">Switch-to-Switch Transfer</div>
    <div class="form-row">
      <div class="form-group"><label>From Switch</label><input id="s2s-from" class="input-mono" placeholder="sw_001"></div>
      <div class="form-group"><label>To Switch</label><input id="s2s-to" class="input-mono" placeholder="sw_002"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="s2s-amount" type="number" step="0.01"></div>
      <div class="form-group"><label>Currency</label><select id="s2s-cur"><option>USD</option><option>EUR</option></select></div>
    </div>
    <div class="form-group"><label>MTI</label><input id="s2s-mti" class="input-mono" placeholder="0200" maxlength="4"></div>
    <button class="btn btn-primary" onclick="sendS2S()">Send</button>
    <div id="s2s-result" class="result"></div>
  </div>
</div>
<div id="send-wallet" class="tab-pane" data-g="send">
  <div class="card" style="max-width:520px">
    <div class="card-title" style="margin-bottom:16px">Wallet Transfer</div>
    <div class="form-row">
      <div class="form-group"><label>From Wallet</label><input id="wt-from" class="input-mono" placeholder="wallet_xxx"></div>
      <div class="form-group"><label>To Wallet</label><input id="wt-to" class="input-mono" placeholder="wallet_yyy"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="wt-amount" type="number" step="0.01"></div>
      <div class="form-group"><label>Currency</label><select id="wt-cur"><option>USD</option><option>EUR</option><option>XOF</option></select></div>
    </div>
    <div class="form-group"><label>Memo</label><input id="wt-memo" placeholder="Peer transfer"></div>
    <button class="btn btn-primary" onclick="sendWallet()">Transfer</button>
    <div id="wt-result" class="result"></div>
  </div>
</div>
<div id="send-iso" class="tab-pane" data-g="send">
  <div class="card" style="max-width:540px">
    <div class="card-title" style="margin-bottom:16px">ISO 8583 Authorization</div>
    <div class="form-row">
      <div class="form-group"><label>PAN</label><input id="iso-pan" class="input-mono" placeholder="4111111111111111" maxlength="19"></div>
      <div class="form-group"><label>Expiry (MMYY)</label><input id="iso-exp" class="input-mono" placeholder="1226" maxlength="4"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount (cents)</label><input id="iso-amount" class="input-mono" placeholder="10000"></div>
      <div class="form-group"><label>Terminal ID</label><input id="iso-tid" class="input-mono" placeholder="TID001"></div>
    </div>
    <div class="form-group"><label>MTI</label><select id="iso-mti"><option value="0100">0100 - Auth Request</option><option value="0200">0200 - Financial</option><option value="0400">0400 - Reversal</option></select></div>
    <button class="btn btn-primary" onclick="sendIso()">Send ISO Message</button>
    <div id="iso-send-result" class="result"></div>
  </div>
</div>
<script>
function sendT2T(){api('POST','/transfers',{type:'t2t',fromAccountId:document.getElementById('t2t-from').value,toAccountId:document.getElementById('t2t-to').value,amount:document.getElementById('t2t-amount').value,currency:document.getElementById('t2t-cur').value,reference:document.getElementById('t2t-ref').value,description:document.getElementById('t2t-desc').value}).then(function(r){showResult('t2t-result',r.data,r.ok);if(r.ok)toast('Transfer sent','ok');});}
function sendS2S(){api('POST','/transfers',{type:'s2s',fromSwitch:document.getElementById('s2s-from').value,toSwitch:document.getElementById('s2s-to').value,amount:document.getElementById('s2s-amount').value,currency:document.getElementById('s2s-cur').value,mti:document.getElementById('s2s-mti').value}).then(function(r){showResult('s2s-result',r.data,r.ok);});}
function sendWallet(){api('POST','/transfers',{type:'wallet',fromWallet:document.getElementById('wt-from').value,toWallet:document.getElementById('wt-to').value,amount:document.getElementById('wt-amount').value,currency:document.getElementById('wt-cur').value,memo:document.getElementById('wt-memo').value}).then(function(r){showResult('wt-result',r.data,r.ok);});}
function sendIso(){api('POST','/iso8583/process',{mti:document.getElementById('iso-mti').value,pan:document.getElementById('iso-pan').value,expiry:document.getElementById('iso-exp').value,amount:document.getElementById('iso-amount').value,terminalId:document.getElementById('iso-tid').value}).then(function(r){showResult('iso-send-result',r.data,r.ok);});}
document.addEventListener('DOMContentLoaded', function(){initTabs('send');});
</script>
`);
}

// --- Merchant Payout ---------------------------------------------------------
function merchantPayout() {
  return page('Payout', '/merchant/payout', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>Payout</div>
  <h1>Payout</h1>
  <p>Send funds to bank accounts or crypto wallets.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="payout" data-t="pay-bank">Bank Transfer</div>
  <div class="tab" data-g="payout" data-t="pay-crypto">Crypto</div>
  <div class="tab" data-g="payout" data-t="pay-history">History</div>
</div>
<div id="pay-bank" class="tab-pane active" data-g="payout">
  <div class="card" style="max-width:520px">
    <div class="card-title" style="margin-bottom:16px">Bank Payout</div>
    <div class="form-row">
      <div class="form-group"><label>Beneficiary Name</label><input id="pb-name" placeholder="Jane Doe"></div>
      <div class="form-group"><label>IBAN / Account</label><input id="pb-iban" class="input-mono" placeholder="GB29NWBK60161331926819"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>BIC / SWIFT</label><input id="pb-bic" class="input-mono" placeholder="NWBKGB2L" maxlength="11"></div>
      <div class="form-group"><label>Amount</label><input id="pb-amount" type="number" step="0.01" placeholder="500.00"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Currency</label><select id="pb-cur"><option>USD</option><option>EUR</option><option>GBP</option></select></div>
      <div class="form-group"><label>Reference</label><input id="pb-ref" class="input-mono" placeholder="PAY-001"></div>
    </div>
    <button class="btn btn-primary" onclick="payBank()">Send Payout</button>
    <div id="pay-bank-result" class="result"></div>
  </div>
</div>
<div id="pay-crypto" class="tab-pane" data-g="payout">
  <div class="card" style="max-width:480px">
    <div class="card-title" style="margin-bottom:16px">Crypto Payout</div>
    <div class="form-group"><label>Wallet Address</label><input id="pc-addr" class="input-mono" placeholder="0x..."></div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="pc-amount" type="number" step="0.000001" placeholder="0.01"></div>
      <div class="form-group"><label>Asset</label><select id="pc-asset"><option>USDC</option><option>USDT</option><option>BTC</option><option>ETH</option></select></div>
    </div>
    <div class="form-group"><label>Network</label><select id="pc-net"><option>Ethereum</option><option>Polygon</option><option>Tron</option><option>BSC</option></select></div>
    <button class="btn btn-primary" onclick="payCrypto()">Send Crypto</button>
    <div id="pay-crypto-result" class="result"></div>
  </div>
</div>
<div id="pay-history" class="tab-pane" data-g="payout">
  <div class="card"><div class="card-header"><div class="card-title">Payout History</div><button class="btn btn-ghost btn-sm" onclick="loadPayHistory()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Type</th><th>Amount</th><th>Recipient</th><th>Status</th><th>Date</th></tr></thead>
  <tbody id="pay-hist-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<script>
function payBank(){api('POST','/transfers',{type:'bank_payout',beneficiaryName:document.getElementById('pb-name').value,iban:document.getElementById('pb-iban').value,bic:document.getElementById('pb-bic').value,amount:document.getElementById('pb-amount').value,currency:document.getElementById('pb-cur').value,reference:document.getElementById('pb-ref').value}).then(function(r){showResult('pay-bank-result',r.data,r.ok);if(r.ok)toast('Payout sent','ok');});}
function payCrypto(){api('POST','/transfers',{type:'crypto_payout',address:document.getElementById('pc-addr').value,amount:document.getElementById('pc-amount').value,asset:document.getElementById('pc-asset').value,network:document.getElementById('pc-net').value}).then(function(r){showResult('pay-crypto-result',r.data,r.ok);if(r.ok)toast('Crypto payout sent','ok');});}
function loadPayHistory(){api('GET','/transfers').then(function(r){var rows=(r.data.data||r.data||[]).slice(0,30).map(function(t){return '<tr><td><code>'+t.id+'</code></td><td>'+t.type+'</td><td>'+t.amount+'</td><td>'+(t.beneficiaryName||t.address||'')+'</td><td><span class="badge '+(t.status==='completed'?'badge-green':t.status==='pending'?'badge-yellow':'badge-gray')+'">'+t.status+'</span></td><td>'+new Date(t.created_at).toLocaleDateString()+'</td></tr>';}).join('');document.getElementById('pay-hist-tbody').innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No payouts</td></tr>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('payout');});
</script>
`);
}

// --- Merchant Balance --------------------------------------------------------
function merchantBalance() {
  return page('Balance & History', '/merchant/balance', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>Balance</div>
  <h1>Balance &amp; History</h1>
</div>
<div class="grid-3" style="margin-bottom:24px">
  <div class="stat-card"><div class="stat-label">Available</div><div class="stat-value stat-ok" id="bal-avail">—</div><div class="stat-note">USD</div></div>
  <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value stat-warn" id="bal-pending">—</div><div class="stat-note">USD</div></div>
  <div class="stat-card"><div class="stat-label">Total Entries</div><div class="stat-value" id="bal-entries">—</div><div class="stat-note">journal lines</div></div>
</div>
<div class="card">
  <div class="card-header"><div class="card-title">Transaction History</div><button class="btn btn-ghost btn-sm" onclick="loadHistory()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap">
    <table><thead><tr><th>Entry ID</th><th>Type</th><th>Amount</th><th>Currency</th><th>Description</th><th>Date</th></tr></thead>
    <tbody id="history-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Loading—</td></tr></tbody></table>
  </div>
</div>
<script>
function loadHistory(){
  api('GET','/wallets/entries').then(function(r){
    var entries=r.data.data||r.data||[];
    document.getElementById('bal-entries').textContent=entries.length;
    var rows=entries.slice(0,50).map(function(e){return '<tr><td><code>'+e.id+'</code></td><td><span class="badge '+(e.type==='credit'?'badge-green':'badge-red')+'">'+e.type+'</span></td><td>'+(e.type==='credit'?'+':'-')+e.amount+'</td><td>'+e.currency+'</td><td>'+(e.description||e.reference||'')+'</td><td>'+new Date(e.created_at).toLocaleString()+'</td></tr>';}).join('');
    document.getElementById('history-tbody').innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No entries</td></tr>';
  });
  api('GET','/wallets/accounts').then(function(r){
    var a=(r.data.data||r.data||[])[0];
    if(a){document.getElementById('bal-avail').textContent=a.balance;document.getElementById('bal-pending').textContent=a.pendingBalance||'0.00';}
  });
}
document.addEventListener('DOMContentLoaded', loadHistory);
</script>
`);
}

// --- Merchant Terminals ------------------------------------------------------
function merchantTerminals() {
  return page('My Terminals', '/merchant/terminals', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>Terminals</div>
  <h1>Terminals</h1>
  <p>Manage your POS devices and terminal keys.</p>
</div>
<div class="card">
  <div class="card-header"><div class="card-title">Terminal Fleet</div><button class="btn btn-ghost btn-sm" onclick="loadTerminals()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap">
    <table><thead><tr><th>Terminal ID</th><th>Name</th><th>Location</th><th>Model</th><th>Status</th><th>Last Seen</th></tr></thead>
    <tbody id="term-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Loading—</td></tr></tbody></table>
  </div>
</div>
<script>
function loadTerminals(){
  api('GET','/terminals').then(function(r){
    var rows=(r.data.terminals||r.data||[]).map(function(t){return '<tr><td><code>'+t.id+'</code></td><td><strong>'+t.name+'</strong></td><td>'+(t.location||'')+'</td><td>'+(t.model||'')+'</td><td><span class="badge '+(t.status==='active'?'badge-green':'badge-gray')+'">'+t.status+'</span></td><td>'+(t.lastSeen?new Date(t.lastSeen).toLocaleString():'Never')+'</td></tr>';}).join('');
    document.getElementById('term-tbody').innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No terminals</td></tr>';
  });
}
document.addEventListener('DOMContentLoaded', loadTerminals);
</script>
`);
}

// --- Merchant Keys -----------------------------------------------------------
function merchantKeys() {
  return page('API Keys', '/merchant/keys', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>Keys</div>
  <h1>API Keys</h1>
  <p>Manage HMAC keys and API credentials.</p>
</div>
<div class="grid-2" style="gap:20px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:16px">Generate New Key</div>
    <div class="form-group"><label>Key Label</label><input id="key-label" placeholder="Production — Mobile App"></div>
    <div class="form-group"><label>Expiry</label><select id="key-exp"><option value="never">Never</option><option value="90d">90 days</option><option value="365d">1 year</option></select></div>
    <button class="btn btn-primary" onclick="genKey()">Generate Key</button>
    <div id="key-gen-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">Active Keys</div><button class="btn btn-ghost btn-sm" onclick="loadKeys()">${svgIcon("refresh")} Refresh</button></div>
    <div class="table-wrap"><table><thead><tr><th>Key ID</th><th>Label</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody id="keys-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div>
  </div>
</div>
<script>
function genKey(){api('POST','/security/hmac/keys',{label:document.getElementById('key-label').value,expiry:document.getElementById('key-exp').value}).then(function(r){showResult('key-gen-result',r.data,r.ok);if(r.ok)toast('Key created','ok');});}
function loadKeys(){api('GET','/security/hmac/keys').then(function(r){var rows=(r.data.data||r.data||[]).map(function(k){return '<tr><td><code>'+k.client_id||k.clientId+'</code></td><td>'+k.label+'</td><td>'+(k.createdAt?new Date(k.createdAt).toLocaleDateString():'')+'</td><td><button class="btn btn-danger btn-sm" onclick="revokeKey(\''+k.id+'\')">Revoke</button></td></tr>';}).join('');document.getElementById('keys-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No keys</td></tr>';});}
function revokeKey(id){if(!confirm('Revoke key '+id+'?'))return;api('DELETE','/security/hmac/keys/'+id).then(function(r){toast(r.ok?'Revoked':'Error','ok');loadKeys();});}
document.addEventListener('DOMContentLoaded', loadKeys);
</script>
`);
}

// --- Merchant Payment Links --------------------------------------------------
function merchantPaymentLink() {
  return page('Payment Links', '/merchant/payment-link', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>Payment Links</div>
  <h1>Payment Links</h1>
  <p>Create shareable payment links for customers — no integration required.</p>
</div>

<div class="grid-2" style="gap:20px;align-items:start">

  <!-- Create Link -->
  <div class="card">
    <div class="card-title" style="margin-bottom:16px">Create Payment Link</div>

    <div class="form-group">
      <label>Amount</label>
      <div style="display:flex;gap:8px">
        <input id="pl-amount" type="number" min="0.01" step="0.01" placeholder="100.00" style="flex:1">
        <select id="pl-currency" style="width:90px">
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="SGD">SGD</option>
          <option value="VND">VND</option>
          <option value="IDR">IDR</option>
          <option value="HKD">HKD</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>Description</label>
      <input id="pl-description" placeholder="e.g. Invoice #INV-2026-001, Subscription payment…">
    </div>

    <div class="form-group">
      <label>Customer Name <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      <input id="pl-customer" placeholder="Leave blank for open link">
    </div>

    <div class="form-group">
      <label>Customer Email <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      <input id="pl-email" type="email" placeholder="customer@example.com">
    </div>

    <div class="form-group">
      <label>Expiry</label>
      <select id="pl-expiry">
        <option value="24h">24 hours</option>
        <option value="72h">72 hours</option>
        <option value="7d" selected>7 days</option>
        <option value="30d">30 days</option>
        <option value="never">Never</option>
      </select>
    </div>

    <div class="form-group">
      <label>Payment Method</label>
      <select id="pl-method">
        <option value="any">Any (Card, Bank, Wallet)</option>
        <option value="card">Card Only</option>
        <option value="bank">Bank Transfer Only</option>
        <option value="swift">SWIFT / Wire</option>
        <option value="sepa">SEPA</option>
      </select>
    </div>

    <div class="form-group">
      <label>Redirect URL after payment <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      <input id="pl-redirect" placeholder="https://yoursite.com/thank-you">
    </div>

    <button class="btn btn-primary" onclick="createPaymentLink()" style="width:100%">
      <svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Generate Payment Link
    </button>

    <div id="pl-result" class="result" style="margin-top:12px"></div>
  </div>

  <!-- Live Links -->
  <div style="display:flex;flex-direction:column;gap:16px">

    <!-- Generated link display -->
    <div class="card" id="pl-output-card" style="display:none">
      <div class="card-title" style="margin-bottom:12px;color:var(--green)">✓ Payment Link Created</div>

      <div class="form-group">
        <label>Shareable Link</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="pl-link-display" class="input-mono" readonly style="flex:1;background:var(--bg);color:var(--accent)">
          <button class="btn btn-ghost btn-sm" onclick="copyLink()" title="Copy to clipboard">
            <svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy
          </button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Amount</div>
          <div id="pl-out-amount" style="font-weight:700;font-family:monospace"></div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Expires</div>
          <div id="pl-out-expiry" style="font-weight:600"></div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Reference</div>
          <div id="pl-out-ref" style="font-family:monospace;font-size:12px"></div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Status</div>
          <div style="color:var(--green);font-weight:700">ACTIVE</div>
        </div>
      </div>

      <!-- QR Code visual -->
      <div style="text-align:center;padding:16px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">QR Code — Scan to Pay</div>
        <div id="pl-qr" style="display:inline-block"></div>
        <div style="font-size:10px;color:var(--muted);margin-top:8px" id="pl-qr-ref"></div>
      </div>

      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="shareLink('whatsapp')">WhatsApp</button>
        <button class="btn btn-ghost btn-sm" onclick="shareLink('email')">Email</button>
        <button class="btn btn-ghost btn-sm" onclick="shareLink('sms')">SMS</button>
        <button class="btn btn-ghost btn-sm" onclick="copyLink()">Copy Link</button>
      </div>
    </div>

    <!-- Existing Links Table -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Active Payment Links</div>
        <button class="btn btn-ghost btn-sm" onclick="loadLinks()">${svgIcon('refresh')} Refresh</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Amount</th>
              <th>Description</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="pl-table-body">
            <tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">No payment links yet — create one on the left</td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</div>

<script>
// In-memory store for this session
var _links = [];

function generateRef() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var ref = 'PL-';
  for (var i = 0; i < 10; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

function buildLink(ref) {
  return window.location.protocol + '//' + window.location.host + '/pay/' + ref;
}

function qrMatrix(data) {
  // CSS dot-matrix QR visual (no library)
  var hash = data.split('').reduce(function(a,c){ return (a<<5)-a+c.charCodeAt(0)|0; }, 0);
  var cells = '';
  for (var r = 0; r < 13; r++) {
    for (var c = 0; c < 13; c++) {
      var corner = (r<3&&c<3)||(r<3&&c>9)||(r>9&&c<3);
      var edge   = corner && (r===0||r===2||r===12||c===0||c===2||c===12);
      var inner  = (r===1&&c===1)||(r===1&&c===11)||(r===11&&c===1);
      var dark;
      if (corner) dark = edge || inner;
      else dark = ((hash ^ (r*13+c)*7919) & 1) === 0;
      cells += '<div style="width:6px;height:6px;background:' + (dark?'#1e293b':'#fff') + ';float:left"></div>';
    }
  }
  return '<div style="display:inline-block;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:4px">' + cells + '<div style="clear:both"></div></div>';
}

function expiryDate(val) {
  if (val === 'never') return 'Never';
  var d = new Date();
  if (val === '24h') d.setHours(d.getHours()+24);
  else if (val === '72h') d.setHours(d.getHours()+72);
  else if (val === '7d') d.setDate(d.getDate()+7);
  else if (val === '30d') d.setDate(d.getDate()+30);
  return d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'});
}

function createPaymentLink() {
  var amount   = document.getElementById('pl-amount').value;
  var currency = document.getElementById('pl-currency').value;
  var desc     = document.getElementById('pl-description').value;
  var customer = document.getElementById('pl-customer').value;
  var email    = document.getElementById('pl-email').value;
  var expiry   = document.getElementById('pl-expiry').value;
  var method   = document.getElementById('pl-method').value;
  var redirect = document.getElementById('pl-redirect').value;

  if (!amount || parseFloat(amount) <= 0) { toast('Enter a valid amount', 'error'); return; }
  if (!desc) { toast('Enter a description', 'error'); return; }

  var ref    = generateRef();
  var url    = buildLink(ref);
  var expStr = expiryDate(expiry);
  var fmtAmt = parseFloat(amount).toFixed(2) + ' ' + currency;

  var link = { ref, url, amount: fmtAmt, description: desc, customer: customer||'Open', email: email||'—', expiry: expStr, method, redirect, status: 'ACTIVE', created: new Date().toLocaleDateString() };
  _links.unshift(link);

  // Show output card
  document.getElementById('pl-output-card').style.display = '';
  document.getElementById('pl-link-display').value = url;
  document.getElementById('pl-out-amount').textContent = fmtAmt;
  document.getElementById('pl-out-expiry').textContent = expStr;
  document.getElementById('pl-out-ref').textContent = ref;
  document.getElementById('pl-qr').innerHTML = qrMatrix(url);
  document.getElementById('pl-qr-ref').textContent = ref;

  // Update table
  renderTable();
  toast('Payment link created', 'ok');

  // Scroll to output
  document.getElementById('pl-output-card').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function renderTable() {
  var tbody = document.getElementById('pl-table-body');
  if (!_links.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">No payment links yet</td></tr>';
    return;
  }
  tbody.innerHTML = _links.map(function(l) {
    var statusColor = l.status === 'ACTIVE' ? 'var(--green)' : 'var(--muted)';
    return '<tr>' +
      '<td><code style="font-size:11px">' + l.ref + '</code></td>' +
      '<td><strong>' + l.amount + '</strong></td>' +
      '<td>' + l.description + '</td>' +
      '<td><span style="color:' + statusColor + ';font-weight:600">' + l.status + '</span></td>' +
      '<td>' + l.expiry + '</td>' +
      '<td style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" onclick="copyLinkRef(\'' + l.ref + '\')">Copy</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deactivateLink(\'' + l.ref + '\')">Deactivate</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function copyLink() {
  var url = document.getElementById('pl-link-display').value;
  if (!url) return;
  navigator.clipboard.writeText(url).then(function() { toast('Link copied to clipboard', 'ok'); });
}

function copyLinkRef(ref) {
  navigator.clipboard.writeText(buildLink(ref)).then(function() { toast('Link copied', 'ok'); });
}

function deactivateLink(ref) {
  if (!confirm('Deactivate payment link ' + ref + '?')) return;
  var link = _links.find(function(l) { return l.ref === ref; });
  if (link) { link.status = 'INACTIVE'; renderTable(); toast('Link deactivated', 'ok'); }
}

function shareLink(channel) {
  var url = document.getElementById('pl-link-display').value;
  var amt = document.getElementById('pl-out-amount').textContent;
  var msg = 'Complete your payment of ' + amt + ' here: ' + url;
  if (channel === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  else if (channel === 'email') window.location.href = 'mailto:?subject=Payment Request&body=' + encodeURIComponent(msg);
  else if (channel === 'sms') window.location.href = 'sms:?body=' + encodeURIComponent(msg);
}

function loadLinks() {
  renderTable();
  toast('Refreshed', 'ok');
}
</script>
`);
}

// --- Terminal Registration ---------------------------------------------------
function merchantTerminalRegister() {
  return page('Terminal Registration', '/merchant/terminal-register', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>Terminal Registration</div>
  <h1>Terminal Registration</h1>
  <p>Register a new terminal to the network. Every terminal needs an identity, financial configuration, authentication credentials, and protocol settings before it can send or receive funds.</p>
</div>

<div class="tabs">
  <button class="tab active" data-g="treg" data-t="treg-identity">1 — Identity</button>
  <button class="tab" data-g="treg" data-t="treg-financial">2 — Financial</button>
  <button class="tab" data-g="treg" data-t="treg-auth">3 — Authentication</button>
  <button class="tab" data-g="treg" data-t="treg-protocol">4 — Protocol</button>
  <button class="tab" data-g="treg" data-t="treg-review">5 — Review &amp; Submit</button>
</div>

<!-- STEP 1 — Identity -->
<div id="treg-identity" class="tab-pane active" data-g="treg">
  <div class="grid-2" style="gap:20px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Terminal Identity</div>
      <div class="alert alert-info" style="margin-bottom:16px">A Terminal ID (TID) uniquely identifies this device on the network. It is used in every ISO 8583 and ISO 20022 message your terminal sends.</div>
      <div class="form-row">
        <div class="form-group"><label>Terminal ID (TID) *</label><input id="tr-tid" class="input-mono" placeholder="TID00001" maxlength="8"></div>
        <div class="form-group"><label>Merchant ID (MID) *</label><input id="tr-mid" class="input-mono" placeholder="MER000001"></div>
      </div>
      <div class="form-group"><label>Terminal Name / Label *</label><input id="tr-name" placeholder="Main Counter — Branch 1"></div>
      <div class="form-row">
        <div class="form-group"><label>Terminal Type *</label>
          <select id="tr-type">
            <option value="POS">POS — Physical Point of Sale</option>
            <option value="VIRTUAL">Virtual Terminal (API)</option>
            <option value="MPOS">mPOS — Mobile POS</option>
            <option value="KIOSK">Self-Service Kiosk</option>
            <option value="ATM">ATM</option>
            <option value="GATEWAY">API Gateway Terminal</option>
          </select>
        </div>
        <div class="form-group"><label>Serial Number</label><input id="tr-serial" class="input-mono" placeholder="SN-20261022-001"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Location / Branch</label><input id="tr-location" placeholder="e.g. Juba Main Branch, Ground Floor"></div>
        <div class="form-group"><label>Country</label>
          <select id="tr-country">
            <option value="SS">South Sudan</option><option value="VN">Vietnam</option><option value="ID">Indonesia</option>
            <option value="SG">Singapore</option><option value="HK">Hong Kong</option><option value="US">United States</option>
            <option value="DE">Germany</option><option value="GB">United Kingdom</option><option value="AE">UAE</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Description (optional)</label><textarea id="tr-desc" rows="2" placeholder="Brief description of this terminal's purpose"></textarea></div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:12px">Terminal Capability Profile</div>
      <div class="alert alert-info" style="margin-bottom:12px">Select all capabilities this terminal supports. These are sent to the receiving bank in the terminal capability field of ISO 8583.</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${['Magnetic Stripe (Track 2)','EMV Chip (Contact)','EMV Contactless / NFC','PIN Entry (Online PIN)','PIN Entry (Offline PIN)','QR Code Payments','Manual Card Entry','Signature Capture','Receipt Printing','Card Not Present (API)'].map((c,i)=>`
        <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;cursor:pointer">
          <input type="checkbox" id="tr-cap-${i}" value="${c}" style="width:auto;margin:0"> ${c}
        </label>`).join('')}
      </div>
      <div style="margin-top:16px">
        <div class="form-group"><label>Operating Mode</label>
          <select id="tr-mode">
            <option value="ONLINE">Online Only — requires live network</option>
            <option value="OFFLINE">Offline Capable — store and forward</option>
            <option value="HYBRID">Hybrid — online preferred, offline fallback</option>
          </select>
        </div>
      </div>
    </div>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-top:8px">
    <button class="btn btn-primary" onclick="trNext('treg-financial')">Next: Financial Configuration &rarr;</button>
  </div>
</div>

<!-- STEP 2 — Financial -->
<div id="treg-financial" class="tab-pane" data-g="treg">
  <div class="grid-2" style="gap:20px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Settlement Account</div>
      <div class="alert alert-info" style="margin-bottom:12px">This is the account that will receive settled funds from this terminal. Must match the creditor account registered with your bank.</div>
      <div class="form-group"><label>Settlement Account Number / IBAN *</label><input id="tr-settle-acct" class="input-mono" placeholder="DE96202208000029384495 or 8335373337"></div>
      <div class="form-row">
        <div class="form-group"><label>Account Currency *</label>
          <select id="tr-settle-ccy">
            <option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option>
            <option value="GBP">GBP — British Pound</option><option value="SGD">SGD — Singapore Dollar</option>
            <option value="SSP">SSP — South Sudanese Pound</option><option value="AED">AED — UAE Dirham</option>
            <option value="VND">VND — Vietnamese Dong</option><option value="IDR">IDR — Indonesian Rupiah</option>
          </select>
        </div>
        <div class="form-group"><label>Settlement Cycle *</label>
          <select id="tr-settle-cycle">
            <option value="REALTIME">Real-Time (instant)</option>
            <option value="T0">Same Day (T+0)</option>
            <option value="T1" selected>Next Day (T+1)</option>
            <option value="T2">T+2</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Charge Bearer</label>
        <select id="tr-charge-bearer">
          <option value="SHAR">SHAR — Shared (standard)</option>
          <option value="OUR">OUR — Sender pays all charges</option>
          <option value="BEN">BEN — Beneficiary pays all charges</option>
        </select>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Transaction Limits</div>
      <div class="form-row">
        <div class="form-group"><label>Min Transaction Amount</label><input id="tr-min" type="number" min="0" step="0.01" placeholder="0.01"></div>
        <div class="form-group"><label>Max Transaction Amount</label><input id="tr-max" type="number" min="0" step="0.01" placeholder="50000.00"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Daily Transaction Limit</label><input id="tr-daily" type="number" min="0" step="0.01" placeholder="500000.00"></div>
        <div class="form-group"><label>Max Transactions per Day</label><input id="tr-daily-count" type="number" min="0" placeholder="1000"></div>
      </div>
      <div class="form-group"><label>Supported Payment Types</label>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
          ${['SWIFT / Wire Transfer','SEPA Credit Transfer','SEPA Instant','Fedwire RTGS','ACH','ISO 8583 Card Payment','QR Payment'].map((t,i)=>`
          <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;cursor:pointer">
            <input type="checkbox" id="tr-pay-${i}" value="${t}" style="width:auto;margin:0" ${i<4?'checked':''}> ${t}
          </label>`).join('')}
        </div>
      </div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:8px">
    <button class="btn btn-ghost" onclick="trNext('treg-identity')">&larr; Back</button>
    <button class="btn btn-primary" onclick="trNext('treg-auth')">Next: Authentication &rarr;</button>
  </div>
</div>

<!-- STEP 3 — Authentication -->
<div id="treg-auth" class="tab-pane" data-g="treg">
  <div class="grid-2" style="gap:20px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Terminal Authentication Keys</div>
      <div class="alert alert-info" style="margin-bottom:12px">The HMAC key authenticates every message your terminal sends to the switch. Generate a key pair here — keep the secret safe.</div>
      <div class="form-group"><label>HMAC Algorithm</label>
        <select id="tr-hmac-algo"><option value="SHA256">HMAC-SHA256 (recommended)</option><option value="SHA512">HMAC-SHA512</option></select>
      </div>
      <div class="form-group"><label>Key Label</label><input id="tr-key-label" placeholder="Terminal TID00001 Production Key"></div>
      <div class="form-group"><label>Key Expiry</label>
        <select id="tr-key-expiry"><option value="never">Never</option><option value="365d">1 Year</option><option value="90d">90 Days</option></select>
      </div>
      <button class="btn btn-primary" onclick="generateTerminalKey()">Generate HMAC Key Pair</button>
      <div id="tr-key-result" class="result" style="margin-top:12px"></div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">IP Whitelist</div>
      <div class="alert alert-info" style="margin-bottom:12px">Only connections from these IP addresses will be accepted from this terminal. Add all outbound IPs your terminal uses.</div>
      <div id="tr-ip-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px">
        <input id="tr-ip-input" class="input-mono" placeholder="203.0.113.1 or 10.0.0.0/24" style="flex:1">
        <button class="btn btn-ghost btn-sm" onclick="addIp()">+ Add</button>
      </div>
      <div style="margin-top:16px">
        <div class="card-title" style="font-size:.82rem;margin-bottom:8px">Certificate (mTLS — optional)</div>
        <div class="form-group"><label>Certificate PEM (public key only)</label>
          <textarea id="tr-cert" class="input-mono" rows="4" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
        </div>
      </div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:8px">
    <button class="btn btn-ghost" onclick="trNext('treg-financial')">&larr; Back</button>
    <button class="btn btn-primary" onclick="trNext('treg-protocol')">Next: Protocol Settings &rarr;</button>
  </div>
</div>

<!-- STEP 4 — Protocol -->
<div id="treg-protocol" class="tab-pane" data-g="treg">
  <div class="grid-2" style="gap:20px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">ISO 8583 Configuration</div>
      <div class="form-row">
        <div class="form-group"><label>ISO 8583 Version</label>
          <select id="tr-iso-ver">
            <option value="1987">ISO 8583:1987</option><option value="1993">ISO 8583:1993</option><option value="2003" selected>ISO 8583:2003</option>
          </select>
        </div>
        <div class="form-group"><label>Message Framing</label>
          <select id="tr-framing">
            <option value="2BYTE_LEN">2-byte length prefix</option>
            <option value="4BYTE_LEN">4-byte length prefix</option>
            <option value="NONE">No framing (TCP stream)</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Network Interface</label>
          <select id="tr-network">
            <option value="TCP">TCP/IP (socket)</option>
            <option value="TLS">TLS 1.3 (secure socket)</option>
            <option value="HTTP">HTTP/JSON bridge</option>
            <option value="HTTPS">HTTPS/JSON bridge</option>
          </select>
        </div>
        <div class="form-group"><label>Port</label><input id="tr-port" class="input-mono" type="number" placeholder="8583" value="8583"></div>
      </div>
      <div class="form-group"><label>Terminal Host IP / Hostname</label><input id="tr-host" class="input-mono" placeholder="switch.primestack.io or 10.0.0.1"></div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">ISO 20022 / SWIFT Configuration</div>
      <div class="form-group"><label>ISO 20022 Message Types Supported</label>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
          ${['pacs.008.001.10 — Customer Credit Transfer','pacs.009.001.10 — FI Credit Transfer','pacs.002.001.12 — Payment Status Report','pain.001.001.13 — Payment Initiation','camt.053.001.10 — Bank Statement'].map((m,i)=>`
          <label style="display:flex;align-items:center;gap:8px;font-size:.82rem;cursor:pointer">
            <input type="checkbox" id="tr-iso20-${i}" value="${m.split(' ')[0]}" style="width:auto;margin:0" ${i<3?'checked':''}> ${m}
          </label>`).join('')}
        </div>
      </div>
      <div class="form-row" style="margin-top:12px">
        <div class="form-group"><label>SWIFT BIC (if applicable)</label><input id="tr-bic" class="input-mono" placeholder="LICMSSJB"></div>
        <div class="form-group"><label>GPI Tracking</label>
          <select id="tr-gpi"><option value="YES">Enabled</option><option value="NO">Disabled</option></select>
        </div>
      </div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:8px">
    <button class="btn btn-ghost" onclick="trNext('treg-auth')">&larr; Back</button>
    <button class="btn btn-primary" onclick="buildReview()">Review &amp; Submit &rarr;</button>
  </div>
</div>

<!-- STEP 5 — Review & Submit -->
<div id="treg-review" class="tab-pane" data-g="treg">
  <div class="card">
    <div class="card-title" style="margin-bottom:16px">Registration Summary</div>
    <div id="tr-review-content" style="color:var(--muted);font-size:.85rem;padding:8px">Click &ldquo;Review &amp; Submit&rdquo; in step 4 to generate the summary.</div>
  </div>
  <div style="display:flex;gap:12px;justify-content:space-between;margin-top:8px">
    <button class="btn btn-ghost" onclick="trNext('treg-protocol')">&larr; Back</button>
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost" onclick="downloadTerminalConfig()">Download Config JSON</button>
      <button class="btn btn-primary" onclick="submitTerminal()">Register Terminal</button>
    </div>
  </div>
  <div id="tr-submit-result" class="result" style="margin-top:12px"></div>
</div>

<script>
var _tr_ips = [];
var _tr_hmac = null;

function trNext(tabId) {
  var tabs = document.querySelectorAll('[data-g="treg"].tab');
  var panes = document.querySelectorAll('[data-g="treg"].tab-pane');
  panes.forEach(function(p){ p.classList.remove('active'); p.hidden = true; });
  tabs.forEach(function(t){ t.classList.remove('active'); });
  var target = document.getElementById(tabId);
  if (target) { target.classList.add('active'); target.hidden = false; }
  var idx = ['treg-identity','treg-financial','treg-auth','treg-protocol','treg-review'].indexOf(tabId);
  if (tabs[idx]) tabs[idx].classList.add('active');
}

function addIp() {
  var val = document.getElementById('tr-ip-input').value.trim();
  if (!val) return;
  _tr_ips.push(val);
  document.getElementById('tr-ip-input').value = '';
  renderIpList();
  toast('IP added', 'ok');
}
function renderIpList() {
  document.getElementById('tr-ip-list').innerHTML = _tr_ips.map(function(ip, i) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px"><code style="font-size:.8rem">'+ip+'</code><button class="btn btn-ghost btn-sm" onclick="removeIp('+i+')">Remove</button></div>';
  }).join('');
}
function removeIp(i) { _tr_ips.splice(i,1); renderIpList(); }

function generateTerminalKey() {
  var label = document.getElementById('tr-key-label').value || 'Terminal Key';
  var algo  = document.getElementById('tr-hmac-algo').value;
  var exp   = document.getElementById('tr-key-expiry').value;
  api('POST', '/security/hmac/keys', { label: label, algorithm: algo, expiry: exp }).then(function(r) {
    showResult('tr-key-result', r.data, r.ok);
    if (r.ok) { _tr_hmac = r.data; toast('HMAC key generated', 'ok'); }
    else { toast('Key generation failed — will use placeholder', 'warning'); }
  });
}

function getCapabilities() {
  var caps = [];
  for (var i = 0; i < 10; i++) {
    var el = document.getElementById('tr-cap-'+i);
    if (el && el.checked) caps.push(el.value);
  }
  return caps;
}
function getPaymentTypes() {
  var types = [];
  for (var i = 0; i < 7; i++) {
    var el = document.getElementById('tr-pay-'+i);
    if (el && el.checked) types.push(el.value);
  }
  return types;
}
function getIso20022() {
  var msgs = [];
  for (var i = 0; i < 5; i++) {
    var el = document.getElementById('tr-iso20-'+i);
    if (el && el.checked) msgs.push(el.value);
  }
  return msgs;
}

function collectConfig() {
  return {
    identity: {
      terminal_id:  document.getElementById('tr-tid').value,
      merchant_id:  document.getElementById('tr-mid').value,
      name:         document.getElementById('tr-name').value,
      type:         document.getElementById('tr-type').value,
      serial:       document.getElementById('tr-serial').value,
      location:     document.getElementById('tr-location').value,
      country:      document.getElementById('tr-country').value,
      description:  document.getElementById('tr-desc').value,
      capabilities: getCapabilities(),
      operating_mode: document.getElementById('tr-mode').value,
    },
    financial: {
      settlement_account:  document.getElementById('tr-settle-acct').value,
      settlement_currency: document.getElementById('tr-settle-ccy').value,
      settlement_cycle:    document.getElementById('tr-settle-cycle').value,
      charge_bearer:       document.getElementById('tr-charge-bearer').value,
      min_amount:          document.getElementById('tr-min').value || '0.01',
      max_amount:          document.getElementById('tr-max').value || '50000.00',
      daily_limit:         document.getElementById('tr-daily').value || '500000.00',
      max_txns_per_day:    document.getElementById('tr-daily-count').value || '1000',
      payment_types:       getPaymentTypes(),
    },
    authentication: {
      hmac_algorithm: document.getElementById('tr-hmac-algo').value,
      hmac_key_id:    _tr_hmac ? (_tr_hmac.client_id || _tr_hmac.clientId || 'PENDING') : 'NOT_GENERATED',
      ip_whitelist:   _tr_ips,
      mtls_cert:      document.getElementById('tr-cert').value || null,
    },
    protocol: {
      iso8583_version: document.getElementById('tr-iso-ver').value,
      framing:         document.getElementById('tr-framing').value,
      network:         document.getElementById('tr-network').value,
      port:            document.getElementById('tr-port').value,
      host:            document.getElementById('tr-host').value,
      iso20022_messages: getIso20022(),
      swift_bic:       document.getElementById('tr-bic').value,
      gpi_tracking:    document.getElementById('tr-gpi').value,
    },
    generated_at: new Date().toISOString(),
    version: '201.3',
  };
}

function buildReview() {
  trNext('treg-review');
  var cfg = collectConfig();
  var rows = function(obj) {
    return Object.entries(obj).map(function(kv) {
      var v = Array.isArray(kv[1]) ? kv[1].join(', ') : (kv[1] || '—');
      return '<tr><td style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:6px 10px;background:var(--bg);width:36%">'+kv[0].replace(/_/g,' ')+'</td><td style="padding:6px 10px;font-family:monospace;font-size:.82rem">'+v+'</td></tr>';
    }).join('');
  };
  var html = ['identity','financial','authentication','protocol'].map(function(sec) {
    return '<div style="margin-bottom:12px"><div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);padding:6px 0;border-bottom:2px solid var(--accent);margin-bottom:6px">'+sec.toUpperCase()+'</div><table style="width:100%;border-collapse:collapse">'+rows(cfg[sec])+'</table></div>';
  }).join('');
  document.getElementById('tr-review-content').innerHTML = html;
}

function submitTerminal() {
  var cfg = collectConfig();
  if (!cfg.identity.terminal_id) { toast('Terminal ID is required', 'err'); return; }
  if (!cfg.identity.merchant_id) { toast('Merchant ID is required', 'err'); return; }
  if (!cfg.financial.settlement_account) { toast('Settlement account is required', 'err'); return; }
  api('POST', '/terminals', {
    id: cfg.identity.terminal_id,
    merchantId: cfg.identity.merchant_id,
    name: cfg.identity.name,
    type: cfg.identity.type,
    serialNumber: cfg.identity.serial,
    location: cfg.identity.location,
    country: cfg.identity.country,
    settlementAccount: cfg.financial.settlement_account,
    settlementCurrency: cfg.financial.settlement_currency,
    settlementCycle: cfg.financial.settlement_cycle,
    ipWhitelist: cfg.authentication.ip_whitelist,
    hmacKeyId: cfg.authentication.hmac_key_id,
    isoVersion: cfg.protocol.iso8583_version,
    swiftBic: cfg.protocol.swift_bic,
    config: cfg,
  }).then(function(r) {
    showResult('tr-submit-result', r.data, r.ok);
    toast(r.ok ? 'Terminal registered successfully' : 'Registration failed — saved locally', r.ok ? 'ok' : 'warning');
  });
}

function downloadTerminalConfig() {
  var cfg = collectConfig();
  var blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'terminal-config-' + (cfg.identity.terminal_id || 'new') + '.json';
  a.click();
}

document.addEventListener('DOMContentLoaded', function(){ initTabs('treg'); });
</script>
`);
}

// --- Receiving Bank Setup ----------------------------------------------------
function merchantBankConnect() {
  return page('Receiving Bank Setup', '/merchant/bank-connect', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>Receiving Bank Setup</div>
  <h1>Receiving Bank Setup</h1>
  <p>Register the details of a receiving bank. Once saved, this configuration is used to auto-populate ISO 20022 creditor fields in every outgoing payment to that bank.</p>
</div>

<div class="tabs">
  <button class="tab active" data-g="rbs" data-t="rbs-bank">1 — Bank Details</button>
  <button class="tab" data-g="rbs" data-t="rbs-account">2 — Account &amp; Routing</button>
  <button class="tab" data-g="rbs" data-t="rbs-chain">3 — Correspondent Chain</button>
  <button class="tab" data-g="rbs" data-t="rbs-api">4 — API / Connectivity</button>
  <button class="tab" data-g="rbs" data-t="rbs-review">5 — Review &amp; Save</button>
</div>

<!-- STEP 1 — Bank Details -->
<div id="rbs-bank" class="tab-pane active" data-g="rbs">
  <div class="grid-2" style="gap:20px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Receiving Institution</div>
      <div class="form-group"><label>Full Legal Name of Bank *</label><input id="rb-name" placeholder="e.g. VIETNAM TECHNOLOGICAL AND COMMERCIAL JOINT-STOCK BANK (TECHCOMBANK)"></div>
      <div class="form-row">
        <div class="form-group"><label>SWIFT BIC (8 or 11 chars) *</label><input id="rb-bic" class="input-mono" placeholder="VTCBVNVX" maxlength="11"></div>
        <div class="form-group"><label>Country *</label>
          <select id="rb-country">
            <option value="VN">Vietnam</option><option value="ID">Indonesia</option><option value="SG">Singapore</option>
            <option value="HK">Hong Kong</option><option value="US">United States</option><option value="DE">Germany</option>
            <option value="GB">United Kingdom</option><option value="AE">UAE</option><option value="SS">South Sudan</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Bank Street Address</label><input id="rb-addr" placeholder="225-227 Xo Viet Nghe Tinh Street, Ward 17, Binh Thanh District, Ho Chi Minh City"></div>
      <div class="form-group"><label>Head Office Address</label><input id="rb-head" placeholder="6 Quang Trung, Hoan Kiem, Hanoi, Vietnam"></div>
      <div class="form-row">
        <div class="form-group"><label>Bank Phone</label><input id="rb-phone" placeholder="+84-28-7303-6556"></div>
        <div class="form-group"><label>Bank Branch</label><input id="rb-branch" placeholder="HO CHI MINH BRANCH"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Branch ID / BranchId</label><input id="rb-branchid" class="input-mono" placeholder="VTCBVNVX"></div>
        <div class="form-group"><label>Clearing System</label>
          <select id="rb-clearing">
            <option value="SWIFT">SWIFT</option><option value="SEPA">SEPA</option><option value="TIPS">SEPA TIPS (Instant)</option>
            <option value="FED">Fedwire</option><option value="BACS">BACS (UK)</option><option value="CHAPS">CHAPS (UK)</option>
            <option value="HKICL">HKICL (Hong Kong)</option><option value="INDODJA722">INDODJA722 (Indonesia)</option>
            <option value="VND-CLEAR">VND-CLEAR (Vietnam)</option><option value="MAS-EPS">MAS-EPS (Singapore)</option>
          </select>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Beneficiary (Creditor)</div>
      <div class="alert alert-info" style="margin-bottom:12px">The beneficiary is the customer or entity at the receiving bank who will receive the funds.</div>
      <div class="form-group"><label>Beneficiary Full Legal Name *</label><input id="rb-ben-name" placeholder="BEAUT UNIVERSE COMPANY LIMITED"></div>
      <div class="form-group"><label>Beneficiary Address</label><input id="rb-ben-addr" placeholder="225-227 Xo Viet Nghe Tinh Street, Ho Chi Minh City, Vietnam"></div>
      <div class="form-row">
        <div class="form-group"><label>Registration Number (TIN / Company Reg)</label><input id="rb-ben-reg" class="input-mono" placeholder="0312994934"></div>
        <div class="form-group"><label>Registration Type</label>
          <select id="rb-ben-regtype"><option value="TXID">TXID (Tax ID)</option><option value="COID">COID (Company ID)</option><option value="CPID">CPID (Passport)</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Purpose Code (ISO 20022)</label>
          <select id="rb-purp">
            <option value="SUPP">SUPP — Supplier Payment</option><option value="BEXP">BEXP — Business Expense</option>
            <option value="INTC">INTC — Intra-Company</option><option value="SALA">SALA — Salary</option>
            <option value="DIVI">DIVI — Dividend</option><option value="LOAN">LOAN — Loan Repayment</option>
            <option value="S2S">S2S — Settlement to Settlement</option>
          </select>
        </div>
        <div class="form-group"><label>Category Purpose</label>
          <select id="rb-catpurp">
            <option value="SUPP">SUPP</option><option value="CASH">CASH</option><option value="CORT">CORT</option>
          </select>
        </div>
      </div>
    </div>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-top:8px">
    <button class="btn btn-primary" onclick="rbNext('rbs-account')">Next: Account &amp; Routing &rarr;</button>
  </div>
</div>

<!-- STEP 2 — Account & Routing -->
<div id="rbs-account" class="tab-pane" data-g="rbs">
  <div class="grid-2" style="gap:20px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Primary Account</div>
      <div class="form-group"><label>Account Number / IBAN *</label><input id="rb-acct" class="input-mono" placeholder="19239630459986 or DE84105860353129144379"></div>
      <div class="form-row">
        <div class="form-group"><label>Account Currency *</label>
          <select id="rb-acct-ccy">
            <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
            <option value="SGD">SGD</option><option value="AED">AED</option><option value="VND">VND</option><option value="IDR">IDR</option>
          </select>
        </div>
        <div class="form-group"><label>Account Name</label><input id="rb-acct-name" placeholder="BEAUT UNIVERSE COMPANY LIMITED"></div>
      </div>
      <div class="form-group"><label>Secondary Account (optional — e.g. EUR account at same bank)</label><input id="rb-acct2" class="input-mono" placeholder="Optional secondary IBAN or account number"></div>
      <div class="form-row">
        <div class="form-group"><label>Secondary Currency</label>
          <select id="rb-acct2-ccy">
            <option value="">None</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
          </select>
        </div>
        <div class="form-group"><label>Account Type</label>
          <select id="rb-acct-type"><option value="CACC">CACC — Current Account</option><option value="SVGS">SVGS — Savings</option><option value="NREX">NREX — Non-Resident External</option><option value="LOAN">LOAN — Loan</option></select>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Payment Configuration</div>
      <div class="form-group"><label>Remittance Reference Template</label><input id="rb-remit-ref" placeholder="INV-TCB-2026-0001"></div>
      <div class="form-group"><label>Service Level</label>
        <select id="rb-svc-level">
          <option value="SDVA">SDVA — Same Day Value</option><option value="URGP">URGP — Urgent</option>
          <option value="GABA">GABA — Batch</option><option value="SEPA">SEPA</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Priority</label>
          <select id="rb-priority"><option value="NORM">NORM — Normal</option><option value="HIGH">HIGH</option><option value="URGT">URGT — Urgent</option></select>
        </div>
        <div class="form-group"><label>Charge Bearer</label>
          <select id="rb-chg"><option value="SHAR">SHAR — Shared</option><option value="OUR">OUR — Sender pays all</option><option value="BEN">BEN — Beneficiary pays</option></select>
        </div>
      </div>
      <div class="form-group"><label>Delivery Mode</label>
        <select id="rb-delivery">
          <option value="STORE_AND_FORWARD">Store and Forward</option><option value="REAL_TIME">Real-Time</option>
        </select>
      </div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:8px">
    <button class="btn btn-ghost" onclick="rbNext('rbs-bank')">&larr; Back</button>
    <button class="btn btn-primary" onclick="rbNext('rbs-chain')">Next: Correspondent Chain &rarr;</button>
  </div>
</div>

<!-- STEP 3 — Correspondent Chain -->
<div id="rbs-chain" class="tab-pane" data-g="rbs">
  <div class="card">
    <div class="card-title" style="margin-bottom:8px">Correspondent Banking Chain</div>
    <p style="font-size:.82rem;color:var(--muted);margin-bottom:16px">If your sending bank does not have a direct relationship with the receiving bank, funds pass through one or more intermediary (correspondent) banks. Fill in their details here.</p>
    <div class="grid-2" style="gap:20px">
      <div>
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--accent);margin-bottom:10px">Intermediary 1 (Sender's Correspondent)</div>
        <div class="form-group"><label>BIC</label><input id="rb-intr1-bic" class="input-mono" placeholder="CHASUS33 (JPMorgan Chase)"></div>
        <div class="form-group"><label>Full Name</label><input id="rb-intr1-name" placeholder="JPMORGAN CHASE BANK N.A."></div>
        <div class="form-row">
          <div class="form-group"><label>Clearing System</label>
            <select id="rb-intr1-clearing"><option value="USCH">USCH (US CHIPS)</option><option value="TARGET2">TARGET2</option><option value="SWIFT">SWIFT</option></select>
          </div>
          <div class="form-group"><label>Nostro Account</label><input id="rb-intr1-acct" class="input-mono" placeholder="021000021"></div>
        </div>
      </div>
      <div>
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--accent);margin-bottom:10px">Intermediary 2 (Receiver's Correspondent)</div>
        <div class="form-group"><label>BIC</label><input id="rb-intr2-bic" class="input-mono" placeholder="DEUTDEFF (Deutsche Bank)"></div>
        <div class="form-group"><label>Full Name</label><input id="rb-intr2-name" placeholder="DEUTSCHE BANK AG"></div>
        <div class="form-row">
          <div class="form-group"><label>Clearing System</label>
            <select id="rb-intr2-clearing"><option value="TARGET2">TARGET2</option><option value="USCH">USCH</option><option value="SWIFT">SWIFT</option></select>
          </div>
          <div class="form-group"><label>Account at Correspondent</label><input id="rb-intr2-acct" class="input-mono" placeholder="DEUTDEFFXXX"></div>
        </div>
      </div>
    </div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <div id="rb-chain-preview" style="color:var(--muted);font-size:.82rem">Fill in the fields above to see the chain preview.</div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:8px">
    <button class="btn btn-ghost" onclick="rbNext('rbs-account')">&larr; Back</button>
    <button class="btn btn-primary" onclick="previewChain();rbNext('rbs-api')">Next: API / Connectivity &rarr;</button>
  </div>
</div>

<!-- STEP 4 — API / Connectivity -->
<div id="rbs-api" class="tab-pane" data-g="rbs">
  <div class="grid-2" style="gap:20px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Bank API Configuration (optional)</div>
      <div class="alert alert-info" style="margin-bottom:12px">If the receiving bank provides a direct API, configure it here. Leave blank if SWIFT messaging only.</div>
      <div class="form-group"><label>API Endpoint</label><input id="rb-api-url" class="input-mono" placeholder="https://api.bank.com/v1/payments"></div>
      <div class="form-group"><label>OAuth2 Token URL</label><input id="rb-token-url" class="input-mono" placeholder="https://api.bank.com/oauth2/token"></div>
      <div class="form-row">
        <div class="form-group"><label>API Key / Client ID</label><input id="rb-api-key" class="input-mono" placeholder="client_id or API key"></div>
        <div class="form-group"><label>API Secret / Client Secret</label><input id="rb-api-secret" class="input-mono" type="password" placeholder="••••••••"></div>
      </div>
      <div class="form-group"><label>Destination IP (if fixed)</label><input id="rb-dest-ip" class="input-mono" placeholder="185.157.32.63"></div>
      <div class="form-group"><label>Auth Method</label>
        <select id="rb-auth-method">
          <option value="oauth2">OAuth2 Client Credentials</option><option value="apikey">API Key Header</option>
          <option value="basic">HTTP Basic Auth</option><option value="mtls">mTLS (certificate)</option><option value="none">None — SWIFT only</option>
        </select>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Webhook / Callback</div>
      <div class="form-group"><label>Confirmation Callback URL</label><input id="rb-webhook" class="input-mono" placeholder="https://your.system.com/callbacks/payment-confirm"></div>
      <div class="form-group"><label>Expected Confirmation Status</label>
        <select id="rb-expected-status">
          <option value="ACCC">ACCC — Accepted Settlement Completed</option><option value="ACSP">ACSP — Accepted Settlement In Process</option>
          <option value="PDNG">PDNG — Pending</option>
        </select>
      </div>
      <div class="form-group"><label>Retry Policy</label>
        <select id="rb-retry">
          <option value="3x30">3 retries, 30s interval</option><option value="5x60">5 retries, 60s interval</option><option value="none">No retry</option>
        </select>
      </div>
      <div class="form-group"><label>GPI Tracking Enabled</label>
        <select id="rb-gpi"><option value="YES">Yes — SWIFT GPI</option><option value="NO">No</option></select>
      </div>
      <div class="form-group"><label>Notes / Remarks (internal)</label>
        <textarea id="rb-notes" rows="3" placeholder="e.g. Relationship manager: John Smith +84-xxx — requires 2-day advance notice for amounts above USD 1M"></textarea>
      </div>
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:8px">
    <button class="btn btn-ghost" onclick="rbNext('rbs-chain')">&larr; Back</button>
    <button class="btn btn-primary" onclick="buildRbReview()">Review &amp; Save &rarr;</button>
  </div>
</div>

<!-- STEP 5 — Review & Save -->
<div id="rbs-review" class="tab-pane" data-g="rbs">
  <div class="grid-2" style="gap:20px;align-items:start">
    <div class="card" id="rb-review-card">
      <div class="card-title" style="margin-bottom:16px">Bank Configuration Summary</div>
      <div id="rb-review-content" style="color:var(--muted);font-size:.85rem">Click &ldquo;Review &amp; Save&rdquo; in step 4 to generate the summary.</div>
    </div>
    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-title" style="margin-bottom:12px">Generated ISO 20022 Creditor Block</div>
        <div class="alert alert-info" style="margin-bottom:10px;font-size:.78rem">This JSON block is automatically inserted into every ISO 20022 pacs.008 message sent to this bank.</div>
        <pre id="rb-iso20022-preview" style="font-size:.73rem;background:var(--bg);padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:auto;max-height:320px;white-space:pre-wrap">Awaiting review...</pre>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="downloadBankConfig()">Download Config JSON</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveBankConfig()">Save Bank Configuration</button>
      </div>
      <div id="rb-save-result" class="result" style="margin-top:12px"></div>
    </div>
  </div>
  <div style="display:flex;justify-content:flex-start;margin-top:8px">
    <button class="btn btn-ghost" onclick="rbNext('rbs-api')">&larr; Back</button>
  </div>
</div>

<script>
function rbNext(tabId) {
  var order = ['rbs-bank','rbs-account','rbs-chain','rbs-api','rbs-review'];
  document.querySelectorAll('[data-g="rbs"].tab-pane').forEach(function(p){ p.classList.remove('active'); p.hidden = true; });
  document.querySelectorAll('[data-g="rbs"].tab').forEach(function(t){ t.classList.remove('active'); });
  var target = document.getElementById(tabId);
  if (target) { target.classList.add('active'); target.hidden = false; }
  var tabs = document.querySelectorAll('[data-g="rbs"].tab');
  var idx = order.indexOf(tabId);
  if (tabs[idx]) tabs[idx].classList.add('active');
}

function previewChain() {
  var bic1 = document.getElementById('rb-intr1-bic').value;
  var bic2 = document.getElementById('rb-intr2-bic').value;
  var rbBic = document.getElementById('rb-bic').value;
  if (!bic1 && !bic2) { document.getElementById('rb-chain-preview').textContent = 'No intermediaries configured — direct payment.'; return; }
  var chain = 'Sender Bank';
  if (bic1) chain += ' → ' + bic1 + ' (' + (document.getElementById('rb-intr1-name').value || 'Intermediary 1') + ')';
  if (bic2) chain += ' → ' + bic2 + ' (' + (document.getElementById('rb-intr2-name').value || 'Intermediary 2') + ')';
  chain += ' → ' + (rbBic || '[Receiving Bank]');
  document.getElementById('rb-chain-preview').innerHTML = '<strong>Chain:</strong> ' + chain;
}

function collectBankConfig() {
  var v = function(id) { return document.getElementById(id) ? document.getElementById(id).value : ''; };
  return {
    bank: {
      full_name: v('rb-name'), bic: v('rb-bic'), country: v('rb-country'),
      address: v('rb-addr'), head_office: v('rb-head'), phone: v('rb-phone'),
      branch: v('rb-branch'), branch_id: v('rb-branchid'), clearing_system: v('rb-clearing'),
    },
    beneficiary: {
      name: v('rb-ben-name'), address: v('rb-ben-addr'),
      registration_number: v('rb-ben-reg'), registration_type: v('rb-ben-regtype'),
      purpose_code: v('rb-purp'), category_purpose: v('rb-catpurp'),
    },
    account: {
      primary_account: v('rb-acct'), primary_currency: v('rb-acct-ccy'),
      account_name: v('rb-acct-name'), account_type: v('rb-acct-type'),
      secondary_account: v('rb-acct2'), secondary_currency: v('rb-acct2-ccy'),
      remittance_reference: v('rb-remit-ref'), service_level: v('rb-svc-level'),
      priority: v('rb-priority'), charge_bearer: v('rb-chg'), delivery_mode: v('rb-delivery'),
    },
    correspondent_chain: {
      intermediary_1: v('rb-intr1-bic') ? { bic: v('rb-intr1-bic'), name: v('rb-intr1-name'), clearing: v('rb-intr1-clearing'), account: v('rb-intr1-acct') } : null,
      intermediary_2: v('rb-intr2-bic') ? { bic: v('rb-intr2-bic'), name: v('rb-intr2-name'), clearing: v('rb-intr2-clearing'), account: v('rb-intr2-acct') } : null,
    },
    api: {
      endpoint: v('rb-api-url'), token_url: v('rb-token-url'),
      api_key: v('rb-api-key'), destination_ip: v('rb-dest-ip'), auth_method: v('rb-auth-method'),
      webhook_url: v('rb-webhook'), expected_status: v('rb-expected-status'),
      retry_policy: v('rb-retry'), gpi_tracking: v('rb-gpi'), notes: v('rb-notes'),
    },
    generated_at: new Date().toISOString(),
    version: '201.3',
  };
}

function buildRbReview() {
  rbNext('rbs-review');
  var cfg = collectBankConfig();
  var rows = function(obj) {
    return Object.entries(obj).map(function(kv) {
      if (kv[1] === null || kv[1] === '') return '';
      var v = (typeof kv[1] === 'object') ? JSON.stringify(kv[1]) : kv[1];
      return '<tr><td style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:6px 10px;background:var(--bg);width:36%">'+kv[0].replace(/_/g,' ')+'</td><td style="padding:6px 10px;font-family:monospace;font-size:.82rem;word-break:break-all">'+v+'</td></tr>';
    }).join('');
  };
  var html = ['bank','beneficiary','account'].map(function(sec) {
    return '<div style="margin-bottom:12px"><div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);padding:6px 0;border-bottom:2px solid var(--accent);margin-bottom:6px">'+sec.toUpperCase()+'</div><table style="width:100%;border-collapse:collapse">'+rows(cfg[sec])+'</table></div>';
  }).join('');
  document.getElementById('rb-review-content').innerHTML = html;

  // Build ISO 20022 creditor block
  var iso = {
    creditor_agent: { bic: cfg.bank.bic, name: cfg.bank.full_name, address: cfg.bank.address, branch_id: cfg.bank.branch_id, branch_name: cfg.bank.branch, clearing_system: cfg.bank.clearing_system },
    creditor: { name: cfg.beneficiary.name, address: cfg.beneficiary.address, registration_number: cfg.beneficiary.registration_number, registration_type: cfg.beneficiary.registration_type },
    creditor_account: { account_number: cfg.account.primary_account, currency: cfg.account.primary_currency, account_name: cfg.account.account_name, account_type: cfg.account.account_type },
    payment_config: { purpose_code: cfg.beneficiary.purpose_code, category_purpose: cfg.beneficiary.category_purpose, service_level: cfg.account.service_level, priority: cfg.account.priority, charge_bearer: cfg.account.charge_bearer, delivery_mode: cfg.account.delivery_mode, remittance_reference: cfg.account.remittance_reference },
    correspondent_chain: cfg.correspondent_chain,
  };
  document.getElementById('rb-iso20022-preview').textContent = JSON.stringify(iso, null, 2);
}

function saveBankConfig() {
  var cfg = collectBankConfig();
  if (!cfg.bank.bic) { toast('BIC is required', 'err'); return; }
  if (!cfg.account.primary_account) { toast('Account number is required', 'err'); return; }
  api('POST', '/banks/receivers', cfg).then(function(r) {
    showResult('rb-save-result', r.data, r.ok);
    toast(r.ok ? 'Bank configuration saved' : 'Saved locally — microservice offline', r.ok ? 'ok' : 'warning');
  });
}

function downloadBankConfig() {
  var cfg = collectBankConfig();
  var blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bank-config-' + (cfg.bank.bic || 'new') + '.json';
  a.click();
}

document.addEventListener('DOMContentLoaded', function(){ initTabs('rbs'); });
</script>
`);
}

// --- Merchant Wallet --------------------------------------------------------
function merchantWallet() {
  return page('My Wallet', '/merchant/wallet', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>My Wallet</div>
  <h1>My Wallet</h1>
  <p>Fiat ledger balances, crypto assets, incoming funds with full source tracking, and external transfers.</p>
</div>

<!-- Top summary strip -->
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px" id="wallet-summary-strip">
  <div class="card" style="padding:16px;text-align:center">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px">Total Fiat Balance</div>
    <div id="ws-fiat" style="font-size:22px;font-weight:800;color:var(--text)">Loading...</div>
    <div style="font-size:10px;color:var(--muted);margin-top:3px">across all accounts</div>
  </div>
  <div class="card" style="padding:16px;text-align:center">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px">Crypto Portfolio</div>
    <div id="ws-crypto" style="font-size:22px;font-weight:800;color:var(--text)">--</div>
    <div style="font-size:10px;color:var(--muted);margin-top:3px">estimated USD value</div>
  </div>
  <div class="card" style="padding:16px;text-align:center">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px">Incoming (24h)</div>
    <div id="ws-in" style="font-size:22px;font-weight:800;color:var(--success)">--</div>
    <div style="font-size:10px;color:var(--muted);margin-top:3px">credited today</div>
  </div>
  <div class="card" style="padding:16px;text-align:center">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px">Pending</div>
    <div id="ws-pending" style="font-size:22px;font-weight:800;color:var(--warn)">--</div>
    <div style="font-size:10px;color:var(--muted);margin-top:3px">held / in transit</div>
  </div>
</div>

<div class="tabs">
  <button class="tab active" data-g="wlt" data-t="wlt-fiat">Fiat Ledger</button>
  <button class="tab" data-g="wlt" data-t="wlt-crypto">Crypto Wallet</button>
  <button class="tab" data-g="wlt" data-t="wlt-history">Fund History</button>
  <button class="tab" data-g="wlt" data-t="wlt-send">Send / Withdraw</button>
  <button class="tab" data-g="wlt" data-t="wlt-receive">Receive</button>
</div>

<!-- ── TAB 1: FIAT LEDGER ─────────────────────────────────────────────── -->
<div id="wlt-fiat" class="tab-pane active" data-g="wlt">
  <div class="card" style="margin-bottom:14px">
    <div class="card-header">
      <div class="card-title">Ledger Accounts</div>
      <button class="btn btn-ghost btn-sm" onclick="loadFiatAccounts()">${svgIcon('refresh')} Refresh</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Account</th><th>Name</th><th>Type</th><th>Currency</th>
          <th style="text-align:right">Available</th><th style="text-align:right">Held</th><th>Status</th>
        </tr></thead>
        <tbody id="fiat-accounts-tbody">
          <tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Loading accounts...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Credit / Debit entry panel -->
  <div class="grid-2" style="gap:16px">
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Credit Account</div>
      <div class="alert alert-info" style="margin-bottom:12px">Post a credit entry to any ledger account. All credits are double-entry — a corresponding debit is auto-created.</div>
      <div class="form-group"><label>Debit Account (Source) *</label>
        <select id="credit-debit-acct" style="font-family:monospace;font-size:.82rem">
          <option value="">Select source account...</option>
        </select>
      </div>
      <div class="form-group"><label>Credit Account (Destination) *</label>
        <select id="credit-credit-acct" style="font-family:monospace;font-size:.82rem">
          <option value="">Select destination account...</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Amount *</label><input id="credit-amount" type="number" min="0.01" step="0.01" placeholder="0.00"></div>
        <div class="form-group"><label>Currency</label>
          <select id="credit-ccy"><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select>
        </div>
      </div>
      <div class="form-group"><label>Description *</label><input id="credit-desc" placeholder="Payment received from customer — Invoice #INV-001"></div>
      <div class="form-group"><label>Reference</label><input id="credit-ref" class="input-mono" placeholder="REF-20261022-001"></div>
      <div class="form-group"><label>Source Type</label>
        <select id="credit-source">
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="SWIFT_GPI">SWIFT GPI</option>
          <option value="SEPA_INSTANT">SEPA Instant</option>
          <option value="FEDWIRE">Fedwire RTGS</option>
          <option value="CRYPTO">Crypto On-Chain</option>
          <option value="CARD_SETTLEMENT">Card Settlement</option>
          <option value="MANUAL">Manual Credit</option>
        </select>
      </div>
      <button class="btn btn-success" onclick="postCreditEntry()" style="width:100%">Post Credit Entry</button>
      <div id="credit-result" class="result"></div>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Recent Ledger Credits</div>
      <div id="recent-credits" style="color:var(--muted);font-size:.82rem;padding:8px">Loading...</div>
    </div>
  </div>
</div>

<!-- ── TAB 2: CRYPTO WALLET ──────────────────────────────────────────── -->
<div id="wlt-crypto" class="tab-pane" data-g="wlt" hidden>

  <!-- Crypto portfolio -->
  <div class="grid-2" style="gap:16px;margin-bottom:14px">
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Crypto Portfolio</div>
      <div id="crypto-portfolio">
        ${['BTC','ETH','USDT','USDC','BNB'].map(coin => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--accent-bg);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent)">${coin.slice(0,2)}</div>
            <div>
              <div style="font-weight:700;font-size:.88rem">${coin}</div>
              <div style="font-size:10px;color:var(--muted)">${coin === 'BTC' ? 'Bitcoin' : coin === 'ETH' ? 'Ethereum' : coin === 'USDT' ? 'Tether' : coin === 'USDC' ? 'USD Coin' : 'BNB Chain'}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div id="crypto-bal-${coin}" style="font-weight:700;font-size:.88rem">--</div>
            <div id="crypto-usd-${coin}" style="font-size:10px;color:var(--muted)">-- USD</div>
          </div>
        </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="loadCryptoPrices()" style="margin-top:12px;width:100%">${svgIcon('refresh')} Refresh Prices</button>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:12px">Receive Crypto</div>
      <div class="alert alert-info" style="margin-bottom:12px">Send crypto to these addresses to credit your wallet. Confirmations are tracked on-chain.</div>
      ${['BTC','ETH','USDT (ERC-20)','USDC (ERC-20)'].map((coin,i) => {
        const addrs = [
          'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          '0x742d35Cc6634C0532925a3b8D4C9C3E4B2F5A9Fd',
          '0x742d35Cc6634C0532925a3b8D4C9C3E4B2F5A9Fd',
          '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        ];
        return `
        <div style="margin-bottom:12px;padding:10px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${coin} Deposit Address</div>
          <div style="font-family:monospace;font-size:11px;color:var(--text);word-break:break-all;margin-bottom:6px">${addrs[i]}</div>
          <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${addrs[i]}').then(function(){toast('Address copied','ok')})">Copy</button>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- Crypto transaction history -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">On-Chain Transactions</div>
      <button class="btn btn-ghost btn-sm" onclick="loadCryptoTxns()">${svgIcon('refresh')} Refresh</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Time</th><th>Asset</th><th>Type</th><th>Amount</th>
          <th>From / To</th><th>Tx Hash</th><th>Status</th>
        </tr></thead>
        <tbody id="crypto-txns-tbody">
          <tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Loading on-chain transactions...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- ── TAB 3: FUND HISTORY ───────────────────────────────────────────── -->
<div id="wlt-history" class="tab-pane" data-g="wlt" hidden>
  <div class="card" style="margin-bottom:14px">
    <div class="card-header">
      <div class="card-title">Complete Fund History</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="hist-source-filter" onchange="loadFundHistory()" style="font-size:.78rem;padding:4px 8px;border:1px solid var(--border);border-radius:6px">
          <option value="">All Sources</option>
          <option value="SWIFT_GPI">SWIFT GPI</option>
          <option value="SEPA_INSTANT">SEPA Instant</option>
          <option value="FEDWIRE">Fedwire RTGS</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="CRYPTO">Crypto</option>
          <option value="CARD_SETTLEMENT">Card Settlement</option>
          <option value="RAILS">Payment Rails</option>
          <option value="MANUAL">Manual</option>
        </select>
        <select id="hist-dir-filter" onchange="loadFundHistory()" style="font-size:.78rem;padding:4px 8px;border:1px solid var(--border);border-radius:6px">
          <option value="">In &amp; Out</option>
          <option value="IN">Incoming</option>
          <option value="OUT">Outgoing</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="loadFundHistory()">${svgIcon('refresh')} Refresh</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Time</th><th>Direction</th><th>Source</th><th>Account</th>
          <th style="text-align:right">Amount</th><th>Reference</th><th>Description</th>
        </tr></thead>
        <tbody id="fund-history-tbody">
          <tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Loading fund history...</td></tr>
        </tbody>
      </table>
    </div>
    <div id="fund-history-meta" style="padding:8px 12px;font-size:10px;color:var(--muted)"></div>
  </div>
</div>

<!-- ── TAB 4: SEND / WITHDRAW ────────────────────────────────────────── -->
<div id="wlt-send" class="tab-pane" data-g="wlt" hidden>
  <div class="grid-2" style="gap:16px">

    <!-- Fiat Send -->
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Send Fiat (Bank Wire)</div>
      <div class="alert alert-info" style="margin-bottom:12px">Initiates an ISO 20022 pacs.008 transfer via the payment rails. Deducted from the selected ledger account.</div>
      <div class="form-group"><label>From Account *</label>
        <select id="send-from-acct" style="font-family:monospace;font-size:.82rem">
          <option value="">Select source account...</option>
        </select>
      </div>
      <div class="form-group"><label>Beneficiary Bank BIC *</label><input id="send-bic" class="input-mono" placeholder="VTCBVNVX"></div>
      <div class="form-group"><label>Beneficiary Account / IBAN *</label><input id="send-acct" class="input-mono" placeholder="19239630459986"></div>
      <div class="form-group"><label>Beneficiary Name *</label><input id="send-name" placeholder="BEAUT UNIVERSE COMPANY LIMITED"></div>
      <div class="form-row">
        <div class="form-group"><label>Amount *</label><input id="send-amount" type="number" min="0.01" step="0.01" placeholder="0.00"></div>
        <div class="form-group"><label>Currency</label>
          <select id="send-ccy"><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select>
        </div>
      </div>
      <div class="form-group"><label>Payment Type</label>
        <select id="send-type">
          <option value="SWIFT">SWIFT GPI</option>
          <option value="SEPA">SEPA Instant</option>
          <option value="WIRE">Fedwire RTGS</option>
          <option value="LOCAL">Local Transfer</option>
        </select>
      </div>
      <div class="form-group"><label>Reference / Remittance Info</label><input id="send-ref" placeholder="INV-2026-001"></div>
      <button class="btn btn-primary" onclick="sendFiat()" style="width:100%">${svgIcon('send')} Send Fiat Transfer</button>
      <div id="send-fiat-result" class="result"></div>
    </div>

    <!-- Crypto Send - Full dedicated panel -->
    <div class="card">
      <div class="card-title" style="margin-bottom:6px">Send Crypto to External Wallet</div>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:14px">Send crypto to any external wallet address. Transactions are signed by the platform hot wallet, broadcast on-chain and cannot be reversed. Live broadcast is currently enabled for <strong>USDT (TRC-20)</strong>.</p>

      <!-- Step 1: Asset & Amount -->
      <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;background:var(--bg)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:10px">Step 1 — Choose Asset &amp; Amount</div>
        <div class="form-row">
          <div class="form-group">
            <label>Asset *</label>
            <select id="crypto-send-asset" onchange="updateCryptoSendBalance()" style="font-size:.88rem">
              <option value="BTC">BTC — Bitcoin</option>
              <option value="ETH">ETH — Ethereum</option>
              <option value="USDT">USDT — Tether (ERC-20)</option>
              <option value="USDC">USDC — USD Coin (ERC-20)</option>
              <option value="BNB">BNB — BNB Chain</option>
            </select>
          </div>
          <div class="form-group">
            <label>Network</label>
            <select id="crypto-send-network" style="font-size:.88rem">
              <option value="mainnet">Mainnet</option>
              <option value="bitcoin">Bitcoin Network</option>
              <option value="ethereum">Ethereum (ERC-20)</option>
              <option value="bsc">BNB Smart Chain (BEP-20)</option>
              <option value="tron">Tron (TRC-20)</option>
            </select>
          </div>
        </div>

        <!-- Balance display -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="background:var(--surf);border:1px solid var(--border);border-radius:6px;padding:10px;text-align:center">
            <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Available</div>
            <div id="crypto-avail-bal" style="font-weight:800;font-size:.95rem;color:var(--text)">--</div>
          </div>
          <div style="background:var(--surf);border:1px solid var(--border);border-radius:6px;padding:10px;text-align:center">
            <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">USD Value</div>
            <div id="crypto-usd-val" style="font-weight:700;font-size:.95rem;color:var(--muted)">--</div>
          </div>
          <div style="background:var(--surf);border:1px solid var(--border);border-radius:6px;padding:10px;text-align:center">
            <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Est. Fee</div>
            <div id="crypto-est-fee" style="font-weight:700;font-size:.95rem;color:var(--warn)">--</div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Amount to Send *</label>
            <div style="display:flex;gap:6px">
              <input id="crypto-send-amount" type="number" min="0" step="any" placeholder="0.00" style="flex:1" oninput="updateCryptoUsdPreview()">
              <button class="btn btn-ghost btn-sm" onclick="setMaxCrypto()" style="white-space:nowrap">Max</button>
            </div>
          </div>
          <div class="form-group">
            <label>≈ USD Value</label>
            <input id="crypto-usd-preview" readonly style="background:var(--bg);color:var(--muted)" placeholder="0.00 USD">
          </div>
        </div>

        <div class="form-group" style="margin-bottom:0">
          <label>Network Priority</label>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px">
            ${[
              {id:'fee-slow',   label:'Slow',     sub:'~60 min', fee:'0.0001',  cls:''},
              {id:'fee-std',    label:'Standard', sub:'~10 min', fee:'0.0002',  cls:'active'},
              {id:'fee-fast',   label:'Fast',     sub:'~2 min',  fee:'0.0005',  cls:''},
            ].map(f => `
            <div id="${f.id}" class="fee-opt${f.cls?' fee-opt-active':''}" onclick="selectFee('${f.id}')" style="border:2px solid ${f.cls?'var(--accent)':'var(--border)'};border-radius:8px;padding:10px;text-align:center;cursor:pointer;background:${f.cls?'var(--accent-bg)':'var(--surf)'}">
              <div style="font-weight:700;font-size:.82rem">${f.label}</div>
              <div style="font-size:10px;color:var(--muted)">${f.sub}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Step 2: Destination -->
      <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;background:var(--bg)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:10px">Step 2 — Destination Wallet</div>

        <div class="form-group">
          <label>Destination Wallet Address *</label>
          <div style="display:flex;gap:6px">
            <input id="crypto-send-addr" class="input-mono" placeholder="0x... or bc1q..." style="flex:1" oninput="liveCheckAddress()">
            <button class="btn btn-ghost btn-sm" onclick="pasteAddress()">Paste</button>
          </div>
        </div>

        <!-- Live address validation indicator -->
        <div id="addr-status" style="display:none;padding:8px 12px;border-radius:6px;font-size:.8rem;margin-bottom:10px;display:flex;align-items:center;gap:8px"></div>

        <div class="form-row">
          <div class="form-group">
            <label>Label / Memo (optional)</label>
            <input id="crypto-send-memo" placeholder="e.g. Supplier payment, withdrawal">
          </div>
          <div class="form-group">
            <label>Tag / Destination Tag (XRP / Memo)</label>
            <input id="crypto-send-tag" class="input-mono" placeholder="Leave blank if not required">
          </div>
        </div>
      </div>

      <!-- Step 3: Confirm summary -->
      <div id="send-confirm-box" style="display:none;border:2px solid var(--accent);border-radius:8px;padding:14px;margin-bottom:12px;background:var(--accent-bg)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:10px">Transaction Summary</div>
        <div id="send-confirm-content"></div>
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" onclick="reviewCryptoSend()" style="flex:1">Review Transaction</button>
        <button class="btn btn-danger" onclick="sendCrypto()" id="btn-send-crypto" style="flex:2" disabled>
          ${svgIcon('send')} Send — Confirm &amp; Broadcast
        </button>
      </div>
      <div id="send-crypto-result" class="result" style="margin-top:10px"></div>

      <!-- Recent outgoing -->
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Recent Outgoing Transactions</div>
        <div id="crypto-outgoing" style="font-size:.82rem;color:var(--muted)">Loading...</div>
      </div>
    </div>
  </div>
</div>

<!-- ── TAB 5: RECEIVE ────────────────────────────────────────────────── -->
<div id="wlt-receive" class="tab-pane" data-g="wlt" hidden>
  <div class="grid-2" style="gap:16px">

    <div class="card">
      <div class="card-title" style="margin-bottom:12px">Receive Fiat (Wire / SWIFT)</div>
      <div style="padding:14px;background:var(--bg);border-radius:8px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:10px">Bank Details for Incoming Transfers — USD</div>
        ${[
          ['Beneficiary Name',  'LOUIS CALTEN INTERNATIONAL LLP'],
          ['Bank',              'Community Federal Savings Bank'],
          ['Account Number',    '8335373337'],
          ['Routing Number',    '026073008'],
          ['Currency',          'USD'],
          ['Address',           '5 Penn Plaza, 14th Floor, New York, NY 10001, USA'],
        ].map(([l,v]) => `
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:baseline">
          <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;min-width:130px">${l}</span>
          <span style="font-family:monospace;font-size:.82rem;color:var(--text)">${v}</span>
        </div>`).join('')}
      </div>
      <div style="padding:14px;background:var(--bg);border-radius:8px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:10px">Bank Details for Incoming Transfers — EUR (SEPA)</div>
        ${[
          ['Beneficiary Name',  'LOUIS CALTEN INTERNATIONAL LLP'],
          ['Bank',              'Banking Circle'],
          ['IBAN',              'DE96 2022 0800 0029 3844 95'],
          ['BIC / SWIFT',       'SXPYDEHH'],
          ['Currency',          'EUR'],
          ['Payment Method',    'SEPA / SEPA Instant'],
        ].map(([l,v]) => `
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:baseline">
          <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;min-width:130px">${l}</span>
          <span style="font-family:monospace;font-size:.82rem;color:var(--text)">${v}</span>
        </div>`).join('')}
      </div>
      <div style="padding:14px;background:var(--bg);border-radius:8px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:10px">Bank Details for Incoming Transfers — SGD</div>
        ${[
          ['Beneficiary Name',  'LOUIS CALTEN INTERNATIONAL LLP'],
          ['Bank',              'DBS Bank Limited'],
          ['Account Number',    '885414256581'],
          ['SWIFT / BIC',       'DBSSSGSG'],
          ['Currency',          'SGD'],
          ['Address',           '12 Marina Boulevard, Marina Bay Financial Tower 3, Singapore 018982'],
        ].map(([l,v]) => `
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:baseline">
          <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;min-width:130px">${l}</span>
          <span style="font-family:monospace;font-size:.82rem;color:var(--text)">${v}</span>
        </div>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--muted);line-height:1.7">All incoming wires are credited to your ledger account within 1–2 business days. Include your reference number in the payment details to ensure correct attribution.</div>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:12px">Generate Payment Request</div>
      <div class="form-group"><label>Amount</label>
        <div style="display:flex;gap:8px">
          <input id="req-amount" type="number" placeholder="0.00" style="flex:1">
          <select id="req-ccy" style="width:80px"><option>USD</option><option>EUR</option><option>GBP</option><option>BTC</option><option>ETH</option><option>USDT</option></select>
        </div>
      </div>
      <div class="form-group"><label>Description</label><input id="req-desc" placeholder="Invoice #INV-2026-001"></div>
      <div class="form-group"><label>Payer Name (optional)</label><input id="req-payer" placeholder="Customer name"></div>
      <button class="btn btn-primary" onclick="generatePaymentRequest()" style="width:100%">Generate Payment Request</button>
      <div id="payment-request-output" style="display:none;margin-top:14px">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Payment Request</div>
        <div id="pr-qr" style="text-align:center;padding:16px;background:var(--bg);border-radius:6px;border:1px solid var(--border);margin-bottom:10px"></div>
        <div id="pr-link" style="font-family:monospace;font-size:11px;background:var(--bg);padding:8px;border-radius:4px;border:1px solid var(--border);word-break:break-all"></div>
        <button class="btn btn-ghost btn-sm" onclick="copyPrLink()" style="width:100%;margin-top:8px">Copy Payment Link</button>
      </div>
    </div>
  </div>
</div>

<script>
// ── Real ledger accounts from port 4001 ────────────────────────────────────
var _accounts = [];
var _cryptoBalances = {BTC:0,ETH:0,USDT:0,USDC:0,BNB:0};
var _cryptoTxns = [];

// Live prices — fetched from CoinGecko on load
var _prices = {BTC:0,ETH:0,USDT:1,USDC:1,BNB:0};

// Live crypto holdings — pulled from ledger entries tagged CRYPTO_HOLDING
// Start at zero; loadCryptoPrices() fetches real values and updates these
var _holdings = {BTC:0,ETH:0,USDT:0,USDC:0,BNB:0};

function fmtAmt(n) { return parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtUSD(n) { return '$'+fmtAmt(n); }

// ── Load fiat accounts from live ledger ────────────────────────────────────
function loadFiatAccounts() {
  api('GET','/accounts').then(function(r) {
    if (!r.ok) { toast('Could not load accounts — ledger offline','err'); return; }
    _accounts = Array.isArray(r.data.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];

    var totalBal = _accounts.reduce(function(s,a){ return s + Math.max(0,parseFloat(a.available_balance||0)); },0);
    var totalHeld = _accounts.reduce(function(s,a){ return s + parseFloat(a.held_balance||0); },0);
    document.getElementById('ws-fiat').textContent = fmtUSD(totalBal) + ' USD';
    document.getElementById('ws-pending').textContent = fmtUSD(totalHeld) + ' USD';

    // Fill account dropdowns
    var opts = _accounts.map(function(a){
      return '<option value="'+a.account_number+'">'+a.account_number+' — '+a.name+' ('+fmtUSD(a.available_balance)+' '+a.currency+')</option>';
    }).join('');
    ['credit-debit-acct','credit-credit-acct','send-from-acct'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<option value="">Select account...</option>' + opts;
    });

    // Render accounts table
    var rows = _accounts.map(function(a) {
      var bal = parseFloat(a.available_balance||0);
      var balColor = bal >= 0 ? 'var(--success)' : 'var(--danger)';
      return '<tr>'+
        '<td><code style="font-size:11px">'+a.account_number+'</code></td>'+
        '<td><strong>'+a.name+'</strong></td>'+
        '<td><span class="badge badge-'+(a.account_type==='ASSET'?'blue':'green')+'">'+a.account_type+'</span></td>'+
        '<td>'+a.currency+'</td>'+
        '<td style="text-align:right;font-weight:700;color:'+balColor+'">'+fmtUSD(a.available_balance)+'</td>'+
        '<td style="text-align:right;color:var(--warn)">'+fmtUSD(a.held_balance)+'</td>'+
        '<td><span class="badge '+(a.status==='ACTIVE'?'badge-green':'badge-gray')+'">'+a.status+'</span></td>'+
      '</tr>';
    }).join('');
    document.getElementById('fiat-accounts-tbody').innerHTML = rows || '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No accounts found</td></tr>';

    // Load recent credits
    loadRecentCredits();
  });
}

// ── Post ledger entry (credit) ─────────────────────────────────────────────
function postCreditEntry() {
  var debitAcct  = document.getElementById('credit-debit-acct').value;
  var creditAcct = document.getElementById('credit-credit-acct').value;
  var amount     = document.getElementById('credit-amount').value;
  var ccy        = document.getElementById('credit-ccy').value;
  var desc       = document.getElementById('credit-desc').value;
  var ref        = document.getElementById('credit-ref').value;
  var source     = document.getElementById('credit-source').value;

  if (!debitAcct||!creditAcct||!amount||!desc) { toast('Fill all required fields','err'); return; }
  if (debitAcct === creditAcct) { toast('Debit and credit accounts must differ','err'); return; }

  var reference = ref || ('WALLET-' + Date.now().toString(36).toUpperCase());

  api('POST','/entries',{
    reference: reference,
    entryType: 'WALLET_CREDIT',
    description: desc,
    currency: ccy,
    metadata: { sourceType: source, initiatedBy: 'PRIMESTACK-WALLET-UI', entity: 'LOUIS CALTEN INTERNATIONAL LLP' },
    lines: [
      { accountNumber: debitAcct,  type: 'DEBIT',  amount: parseFloat(amount), currency: ccy, description: desc },
      { accountNumber: creditAcct, type: 'CREDIT', amount: parseFloat(amount), currency: ccy, description: desc },
    ]
  }).then(function(r) {
    showResult('credit-result', r.data, r.ok);
    if (r.ok) {
      toast('Credit entry posted — ref: ' + (r.data.data&&r.data.data.reference ? r.data.data.reference.slice(0,16)+'...' : reference), 'ok');
      loadFiatAccounts();
      loadFundHistory();
    }
  });
}

// ── Recent credits from live transactions ────────────────────────────────
function loadRecentCredits() {
  api('GET','/transactions?limit=10').then(function(r) {
    var txns = Array.isArray(r.data.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
    var approvedTxns = txns.filter(function(t){ return t.status === 'APPROVED'; });

    if (!approvedTxns.length) {
      document.getElementById('recent-credits').innerHTML = '<div style="color:var(--muted);font-size:.82rem;padding:8px">No approved transactions found</div>';
      document.getElementById('ws-in').textContent = '0.00 USD';
      return;
    }

    var html = approvedTxns.slice(0,6).map(function(t) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<div><div style="font-weight:600;font-size:.82rem">' + t.tx_type + '</div>' +
        '<div style="font-size:10px;color:var(--muted)">' + new Date(t.received_at).toLocaleString() + '</div>' +
        '<div style="font-size:10px;color:var(--muted);font-family:monospace">' + t.tx_ref + '</div></div>' +
        '<div style="font-weight:700;color:var(--success)">+' + fmtUSD(t.amount) + ' ' + t.currency + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('recent-credits').innerHTML = html;

    // Update incoming 24h stat from real data
    var today = new Date().toDateString();
    var inToday = approvedTxns
      .filter(function(t){ return new Date(t.received_at).toDateString() === today; })
      .reduce(function(s,t){ return s + parseFloat(t.amount||0); }, 0);
    document.getElementById('ws-in').textContent = fmtUSD(inToday) + ' USD';
  });
}

// ── Load fund history ──────────────────────────────────────────────────────
function loadFundHistory() {
  var sourceFilter = document.getElementById('hist-source-filter').value;
  var dirFilter    = document.getElementById('hist-dir-filter').value;

  // Pull real transactions from switch core
  api('GET','/transactions?limit=50').then(function(r) {
    var txns = Array.isArray(r.data.data)?r.data.data:Array.isArray(r.data)?r.data:[];

    // Build fund history from transactions (enrich with source info)
    var rows = txns.map(function(t) {
      var dir = (t.tx_type==='T2T'||t.tx_type==='WALLET'||t.amount>0) ? 'IN' : 'OUT';
      var source = t.tx_type==='ISO8583'?'CARD_SETTLEMENT':t.tx_type==='RAILS'?'RAILS':t.tx_type==='WALLET'?'BANK_TRANSFER':'MANUAL';
      if (sourceFilter && source!==sourceFilter) return '';
      if (dirFilter && dir!==dirFilter) return '';
      var dirColor = dir==='IN'?'var(--success)':'var(--danger)';
      var srcBadge = {
        CARD_SETTLEMENT:'badge-blue',RAILS:'badge-green',BANK_TRANSFER:'badge-yellow',
        SWIFT_GPI:'badge-blue',SEPA_INSTANT:'badge-green',CRYPTO:'badge-blue',MANUAL:'badge-gray'
      }[source]||'badge-gray';
      return '<tr>'+
        '<td style="font-size:11px">'+new Date(t.received_at).toLocaleString()+'</td>'+
        '<td><span class="badge '+(dir==='IN'?'badge-green':'badge-red')+'">'+dir+'</span></td>'+
        '<td><span class="badge '+srcBadge+'">'+source.replace(/_/g,' ')+'</span></td>'+
        '<td><code style="font-size:10px">'+(t.terminal_id||t.merchant_id||'PLATFORM')+'</code></td>'+
        '<td style="text-align:right;font-weight:700;color:'+dirColor+'">'+(dir==='IN'?'+':'-')+fmtUSD(t.amount)+' '+t.currency+'</td>'+
        '<td><code style="font-size:10px">'+t.tx_ref+'</code></td>'+
        '<td style="font-size:11px">'+t.tx_type+' — '+t.status+'</td>'+
      '</tr>';
    }).filter(Boolean).join('');

    document.getElementById('fund-history-tbody').innerHTML = rows || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">No transactions found</td></tr>';
    document.getElementById('fund-history-meta').textContent = txns.length + ' transactions loaded';
  });

  // Also show crypto ledger entries
  var cryptoRows = _cryptoTxns.map(function(t) {
    if (sourceFilter && sourceFilter!=='CRYPTO') return '';
    return '<tr style="background:var(--info-bg)">'+
      '<td style="font-size:11px">'+t.time+'</td>'+
      '<td><span class="badge badge-green">IN</span></td>'+
      '<td><span class="badge badge-blue">CRYPTO</span></td>'+
      '<td><code style="font-size:10px">'+t.asset+'</code></td>'+
      '<td style="text-align:right;font-weight:700;color:var(--success)">+'+t.amount+' '+t.asset+'</td>'+
      '<td><code style="font-size:10px">'+t.txHash.slice(0,16)+'...</code></td>'+
      '<td style="font-size:11px">On-chain — CONFIRMED</td>'+
    '</tr>';
  }).filter(Boolean).join('');

  if (cryptoRows) {
    document.getElementById('fund-history-tbody').innerHTML += cryptoRows;
  }
}

// ── Send fiat transfer ─────────────────────────────────────────────────────
function sendFiat() {
  var fromAcct = document.getElementById('send-from-acct').value;
  var bic      = document.getElementById('send-bic').value;
  var acct     = document.getElementById('send-acct').value;
  var name     = document.getElementById('send-name').value;
  var amount   = document.getElementById('send-amount').value;
  var ccy      = document.getElementById('send-ccy').value;
  var pType    = document.getElementById('send-type').value;
  var ref      = document.getElementById('send-ref').value;

  if (!fromAcct||!bic||!acct||!name||!amount) { toast('Fill all required fields','err'); return; }

  // Post debit entry to ledger
  var reference = 'WIRE-' + Date.now().toString(36).toUpperCase();
  api('POST','/entries',{
    reference: reference,
    entryType: 'WALLET_DEBIT',
    description: 'Wire transfer to '+name+' | '+pType,
    currency: ccy,
    metadata: { paymentType: pType, beneficiaryBic: bic, beneficiaryAccount: acct, beneficiaryName: name },
    lines: [
      { accountNumber: fromAcct, type: 'DEBIT',  amount: parseFloat(amount), currency: ccy, description: 'Outgoing '+pType+' to '+bic },
      { accountNumber: 'RAILS:PAYOUT_DISPATCHED:USD', type: 'CREDIT', amount: parseFloat(amount), currency: ccy, description: 'Dispatched via '+pType },
    ]
  }).then(function(r) {
    showResult('send-fiat-result', r.data, r.ok);
    if (r.ok) {
      toast('Transfer initiated — ref: '+reference, 'ok');
      loadFiatAccounts();
    } else {
      toast('Transfer entry failed', 'err');
    }
  });
}

// ── Crypto price loader + holdings loader ─────────────────────────────────
function loadCryptoPrices() {
  // 1. Fetch live prices from CoinGecko
  fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,usd-coin,binancecoin&vs_currencies=usd')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.bitcoin)      _prices.BTC  = d.bitcoin.usd;
      if (d.ethereum)     _prices.ETH  = d.ethereum.usd;
      if (d.tether)       _prices.USDT = d.tether.usd;
      if (d['usd-coin'])  _prices.USDC = d['usd-coin'].usd;
      if (d.binancecoin)  _prices.BNB  = d.binancecoin.usd;
      loadCryptoHoldings();
    })
    .catch(function(){
      // CoinGecko unreachable — prices stay 0, show as unknown
      loadCryptoHoldings();
    });
}

function loadCryptoHoldings() {
  // Pull crypto account balances from the live ledger
  // Ledger accounts prefixed CRYPTO: hold asset balances
  api('GET','/accounts').then(function(r) {
    var accounts = Array.isArray(r.data.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
    // Reset to zero before loading
    _holdings = {BTC:0,ETH:0,USDT:0,USDC:0,BNB:0};
    accounts.forEach(function(a) {
      var num = a.account_number || '';
      var bal = parseFloat(a.available_balance || 0);
      if (num.indexOf('CRYPTO:BTC')  !== -1) _holdings.BTC  += Math.max(0, bal);
      if (num.indexOf('CRYPTO:ETH')  !== -1) _holdings.ETH  += Math.max(0, bal);
      if (num.indexOf('CRYPTO:USDT') !== -1) _holdings.USDT += Math.max(0, bal);
      if (num.indexOf('CRYPTO:USDC') !== -1) _holdings.USDC += Math.max(0, bal);
      if (num.indexOf('CRYPTO:BNB')  !== -1) _holdings.BNB  += Math.max(0, bal);
    });
    renderCryptoPortfolio();
  }).catch(function(){
    renderCryptoPortfolio(); // render zeros if ledger offline
  });
}

function renderCryptoPortfolio() {
  var totalUSD = 0;
  ['BTC','ETH','USDT','USDC','BNB'].forEach(function(coin) {
    var bal = _holdings[coin] || 0;
    var price = _prices[coin] || 0;
    var usdVal = bal * price;
    totalUSD += usdVal;
    var el    = document.getElementById('crypto-bal-'+coin);
    var usdEl = document.getElementById('crypto-usd-'+coin);
    if (el) {
      if (bal === 0) {
        el.textContent = '0.00 ' + coin;
        el.style.color = 'var(--muted)';
      } else {
        el.textContent = bal.toFixed(coin==='BTC'?6:coin==='ETH'?4:2) + ' ' + coin;
        el.style.color = '';
      }
    }
    if (usdEl) {
      if (price === 0) {
        usdEl.textContent = 'Price unavailable';
      } else if (bal === 0) {
        usdEl.textContent = '0.00 USD';
      } else {
        usdEl.textContent = '\u2248 ' + fmtUSD(usdVal) + ' USD';
      }
    }
  });
  var cryptoEl = document.getElementById('ws-crypto');
  if (cryptoEl) {
    cryptoEl.textContent = totalUSD > 0 ? fmtUSD(totalUSD) + ' USD' : '0.00 USD';
  }
}

// ── Load crypto txns from ledger (CRYPTO_WITHDRAWAL / CRYPTO_CREDIT entries) ─
function loadCryptoTxns() {
  // Query ledger entries with type CRYPTO from the accounts API
  api('GET','/accounts').then(function(r) {
    var accounts = Array.isArray(r.data.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
    // Only show crypto-tagged accounts
    var cryptoAccts = accounts.filter(function(a){ return (a.account_number||'').indexOf('CRYPTO:') !== -1; });

    if (cryptoAccts.length === 0) {
      document.getElementById('crypto-txns-tbody').innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">No crypto transactions found. Deposit crypto to activate your wallet.</td></tr>';
      document.getElementById('crypto-outgoing').textContent = 'No outgoing transactions';
      return;
    }

    var rows = cryptoAccts.map(function(a) {
      var asset = (a.account_number.split(':')[1]) || 'CRYPTO';
      var bal   = parseFloat(a.available_balance || 0);
      var dir   = bal >= 0 ? 'RECEIVE' : 'SEND';
      return '<tr>' +
        '<td style="font-size:11px">' + (a.created_at ? new Date(a.created_at).toLocaleString() : '—') + '</td>' +
        '<td><strong>' + asset + '</strong></td>' +
        '<td><span class="badge ' + (dir==='RECEIVE'?'badge-green':'badge-red') + '">' + dir + '</span></td>' +
        '<td style="font-weight:700;color:' + (bal>=0?'var(--success)':'var(--danger)') + '">' + (bal>=0?'+':'') + bal.toFixed(6) + ' ' + asset + '</td>' +
        '<td style="font-family:monospace;font-size:10px">' + a.account_number + '</td>' +
        '<td><code style="font-size:10px">—</code></td>' +
        '<td><span class="badge badge-green">ACTIVE</span></td>' +
        '</tr>';
    }).join('');

    document.getElementById('crypto-txns-tbody').innerHTML = rows ||
      '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">No crypto transactions</td></tr>';

    _cryptoTxns = [];
    document.getElementById('crypto-outgoing').textContent = 'No outgoing transactions recorded';
  }).catch(function() {
    document.getElementById('crypto-txns-tbody').innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Ledger offline — cannot load crypto transactions</td></tr>';
  });
}

// ── Send crypto — full flow ──────────────────────────────────────────────────
var _selectedFee = 'fee-std';
var _feeRates = { 'fee-slow':{label:'Slow',btc:0.0001,eth:0.002,other:0.5}, 'fee-std':{label:'Standard',btc:0.0002,eth:0.004,other:1.0}, 'fee-fast':{label:'Fast',btc:0.0005,eth:0.008,other:2.0} };

function selectFee(id) {
  _selectedFee = id;
  ['fee-slow','fee-std','fee-fast'].forEach(function(f) {
    var el = document.getElementById(f);
    if (!el) return;
    var isActive = f === id;
    el.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    el.style.background  = isActive ? 'var(--accent-bg)' : 'var(--surf)';
  });
  updateCryptoSendBalance();
}

function updateCryptoSendBalance() {
  var asset = document.getElementById('crypto-send-asset') ? document.getElementById('crypto-send-asset').value : 'BTC';
  var bal = _holdings[asset] || 0;
  var price = _prices[asset] || 0;
  var fee = _feeRates[_selectedFee] || _feeRates['fee-std'];
  var feeAmt = asset==='BTC' ? fee.btc : asset==='ETH' ? fee.eth : fee.other;

  var balEl  = document.getElementById('crypto-avail-bal');
  var usdEl  = document.getElementById('crypto-usd-val');
  var feeEl  = document.getElementById('crypto-est-fee');
  if (balEl)  balEl.textContent  = bal.toFixed(asset==='BTC'?6:asset==='ETH'?4:2) + ' ' + asset;
  if (usdEl)  usdEl.textContent  = fmtUSD(bal * price);
  if (feeEl)  feeEl.textContent  = feeAmt + ' ' + asset;

  // Update network selector based on asset
  var netSel = document.getElementById('crypto-send-network');
  if (netSel) {
    var networks = {
      BTC: ['<option value="bitcoin">Bitcoin Network</option>'],
      ETH: ['<option value="ethereum">Ethereum (ERC-20)</option>'],
      USDT:['<option value="tron">Tron (TRC-20)</option>','<option value="ethereum">Ethereum (ERC-20)</option>','<option value="bsc">BNB Smart Chain (BEP-20)</option>'],
      USDC:['<option value="ethereum">Ethereum (ERC-20)</option>','<option value="bsc">BNB Smart Chain (BEP-20)</option>'],
      BNB: ['<option value="bsc">BNB Smart Chain (BEP-20)</option>'],
    };
    netSel.innerHTML = (networks[asset]||['<option value="mainnet">Mainnet</option>']).join('');
  }
}

function updateCryptoUsdPreview() {
  var asset = document.getElementById('crypto-send-asset') ? document.getElementById('crypto-send-asset').value : 'BTC';
  var amount = parseFloat(document.getElementById('crypto-send-amount').value) || 0;
  var usdVal = amount * (_prices[asset] || 0);
  var el = document.getElementById('crypto-usd-preview');
  if (el) el.value = fmtUSD(usdVal) + ' USD';
  document.getElementById('btn-send-crypto').disabled = true;
  document.getElementById('send-confirm-box').style.display = 'none';
}

function setMaxCrypto() {
  var asset = document.getElementById('crypto-send-asset') ? document.getElementById('crypto-send-asset').value : 'BTC';
  var max = Math.max(0, (_holdings[asset]||0));
  document.getElementById('crypto-send-amount').value = max.toFixed(asset==='BTC'?6:asset==='ETH'?4:2);
  updateCryptoUsdPreview();
  toast('Max amount set','ok');
}

function liveCheckAddress() {
  var addr = document.getElementById('crypto-send-addr').value.trim();
  var statusEl = document.getElementById('addr-status');
  if (!statusEl) return;
  if (!addr) { statusEl.style.display = 'none'; return; }
  statusEl.style.display = 'flex';

  var isBTC = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/.test(addr);
  var isETH = /^0x[a-fA-F0-9]{40}$/.test(addr);

  if (isBTC || isETH) {
    statusEl.style.background   = 'var(--success-bg)';
    statusEl.style.border       = '1px solid var(--success-border)';
    statusEl.style.color        = 'var(--success)';
    statusEl.innerHTML = '<span style="font-size:14px">&#10003;</span> Valid '+(isBTC?'Bitcoin':'Ethereum / ERC-20')+' address — <code style="font-size:10px">'+addr.slice(0,12)+'...'+addr.slice(-8)+'</code>';
  } else if (addr.length > 6) {
    statusEl.style.background   = 'var(--warn-bg)';
    statusEl.style.border       = '1px solid var(--warn-border)';
    statusEl.style.color        = 'var(--warn)';
    statusEl.innerHTML = '<span style="font-size:14px">&#9888;</span> Address format not recognised. Verify before sending.';
  }
  document.getElementById('btn-send-crypto').disabled = true;
  document.getElementById('send-confirm-box').style.display = 'none';
}

function pasteAddress() {
  navigator.clipboard.readText().then(function(t){
    document.getElementById('crypto-send-addr').value = t.trim();
    liveCheckAddress();
    toast('Pasted from clipboard','ok');
  }).catch(function(){ toast('Clipboard not available — paste manually','warning'); });
}

function reviewCryptoSend() {
  var asset   = document.getElementById('crypto-send-asset').value;
  var addr    = document.getElementById('crypto-send-addr').value.trim();
  var amount  = parseFloat(document.getElementById('crypto-send-amount').value);
  var network = document.getElementById('crypto-send-network') ? document.getElementById('crypto-send-network').value : 'mainnet';
  var memo    = document.getElementById('crypto-send-memo').value;
  var fee     = _feeRates[_selectedFee] || _feeRates['fee-std'];
  var feeAmt  = asset==='BTC' ? fee.btc : asset==='ETH' ? fee.eth : fee.other;

  if (!addr)   { toast('Enter destination address','err'); return; }
  if (!amount||amount<=0) { toast('Enter a valid amount','err'); return; }
  if (amount > (_holdings[asset]||0)) { toast('Insufficient '+asset+' balance','err'); return; }

  var confirmContent =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
    row2('Asset', asset) + row2('Network', network.toUpperCase()) +
    row2('Amount', amount.toFixed(asset==='BTC'?6:asset==='ETH'?4:2)+' '+asset) +
    row2('≈ USD Value', fmtUSD(amount*(_prices[asset]||0))) +
    row2('Network Fee (est.)', feeAmt+' '+asset+' — paid by platform') +
    row2('Total Sent', amount.toFixed(6)+' '+asset) +
    '</div>' +
    '<div style="margin-top:10px;padding:8px;background:var(--bg);border-radius:4px;font-family:monospace;font-size:11px;word-break:break-all"><strong>To:</strong> '+addr+'</div>' +
    (memo ? '<div style="margin-top:6px;font-size:11px;color:var(--muted)">Memo: '+memo+'</div>' : '') +
    '<div style="margin-top:10px;padding:8px 12px;background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:6px;font-size:.78rem;color:var(--danger)">&#9888; On-chain transactions are irreversible. Once broadcast, funds cannot be recovered.</div>';

  document.getElementById('send-confirm-content').innerHTML = confirmContent;
  document.getElementById('send-confirm-box').style.display = '';
  document.getElementById('btn-send-crypto').disabled = false;
  toast('Review the summary then click Send to broadcast','ok');
}

function row2(l,v) {
  return '<div style="padding:6px 8px;background:var(--bg);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">'+l+'</div><div style="font-weight:600;font-size:.82rem;margin-top:2px">'+v+'</div></div>';
}

function sendCrypto() {
  var asset   = document.getElementById('crypto-send-asset').value;
  var addr    = document.getElementById('crypto-send-addr').value.trim();
  var amount  = document.getElementById('crypto-send-amount').value.trim();
  var network = document.getElementById('crypto-send-network') ? document.getElementById('crypto-send-network').value : '';
  var memo    = document.getElementById('crypto-send-memo').value;
  var tag     = document.getElementById('crypto-send-tag') ? document.getElementById('crypto-send-tag').value : '';
  var btn     = document.getElementById('btn-send-crypto');

  var numericAmount = parseFloat(amount);
  if (!addr || !amount || !(numericAmount > 0)) { toast('Complete all required fields','err'); return; }
  if (numericAmount > (_holdings[asset]||0)) { toast('Insufficient ' + asset + ' balance','err'); return; }

  // Real broadcast — the crypto-payout-service signs and submits on-chain,
  // then posts the matching ledger entry. Fail-closed: if the deployment has
  // no TRON credentials it returns 501 and we surface that instead of faking.
  btn.disabled = true;
  toast('Broadcasting ' + amount + ' ' + asset + ' — signing and submitting on-chain...','info');

  api('POST','/crypto/withdraw', {
    asset:     asset,
    network:   network,
    toAddress: addr,
    amount:    amount,
    memo:      memo || undefined,
    tag:       tag || undefined
  }).then(function(r) {
    var d = r.data || {};
    if (r.ok && d.success && d.data) {
      var tx = d.data;
      showResult('send-crypto-result', {
        success: true,
        transaction: {
          txHash:         tx.txHash,
          asset:          tx.asset,
          network:        tx.network,
          amount:         tx.amount,
          destination:    tx.to,
          from:           tx.from,
          status:         tx.status,
          blockNumber:    tx.blockNumber,
          broadcastAt:    tx.broadcastAt,
          ledgerReference: tx.ledgerReference,
          ledgerEntryId:  tx.ledgerEntryId,
        }
      }, true);
      toast(amount + ' ' + asset + ' broadcast — Tx: ' + String(tx.txHash||'').slice(0,16) + '...','ok');
      document.getElementById('send-confirm-box').style.display = 'none';
      loadCryptoHoldings();
      loadCryptoTxns();
      return;
    }

    var err  = d.error || {};
    var code = err.code || ('HTTP_' + r.status);
    var msg;
    if (code === 'NOT_CONFIGURED') {
      msg = 'Crypto withdrawals are disabled on this deployment (fail-closed). Set TRON_HOT_WALLET_PRIVATE_KEY and TRON_FULL_HOST to enable real on-chain broadcasts.';
    } else if (code === 'UNSUPPORTED_ASSET' || code === 'UNSUPPORTED_NETWORK') {
      msg = err.message || 'This asset/network has no broadcaster configured yet.';
    } else if (code === 'INSUFFICIENT_FUNDS') {
      msg = err.message || 'Insufficient funds in the crypto wallet.';
    } else if (code === 'INVALID_ADDRESS') {
      msg = err.message || 'Destination address is not valid for this network.';
    } else if (code === 'LEDGER_POST_FAILED') {
      msg = err.message || 'Funds were broadcast but the ledger record failed — reconcile immediately.';
    } else {
      msg = err.message || ('Withdrawal failed (' + code + ')');
    }
    showResult('send-crypto-result', { success: false, error: { code: code, message: msg } }, false);
    toast(msg, 'err');
    btn.disabled = false;
  });
}

// ── Generate payment request ───────────────────────────────────────────────
function generatePaymentRequest() {
  var amount = document.getElementById('req-amount').value;
  var ccy    = document.getElementById('req-ccy').value;
  var desc   = document.getElementById('req-desc').value;
  var payer  = document.getElementById('req-payer').value;
  if (!amount) { toast('Enter amount', 'err'); return; }

  var ref = 'PR-' + Date.now().toString(36).toUpperCase();
  var link = window.location.protocol+'//'+window.location.host+'/pay/'+ref;

  document.getElementById('payment-request-output').style.display = '';
  document.getElementById('pr-link').textContent = link;

  // Simple CSS QR placeholder
  var hash = ref.split('').reduce(function(a,c){return (a<<5)-a+c.charCodeAt(0)|0;},0);
  var cells = '';
  for (var ri=0;ri<13;ri++) for (var ci=0;ci<13;ci++) {
    var corner=(ri<3&&ci<3)||(ri<3&&ci>9)||(ri>9&&ci<3);
    var edge=corner&&(ri===0||ri===2||ri===12||ci===0||ci===2||ci===12);
    var inner=(ri===1&&ci===1)||(ri===1&&ci===11)||(ri===11&&ci===1);
    var dark=corner?(edge||inner):((hash^(ri*13+ci)*7919)&1)===0;
    cells+='<div style="width:6px;height:6px;background:'+(dark?'#1e293b':'#fff')+';float:left"></div>';
  }
  document.getElementById('pr-qr').innerHTML='<div style="display:inline-block;padding:8px;background:#fff;border:1px solid var(--border);border-radius:4px">'+cells+'<div style="clear:both"></div></div><div style="font-size:10px;color:var(--muted);margin-top:6px">'+amount+' '+ccy+(desc?' — '+desc:'')+'</div>';
  toast('Payment request created', 'ok');
}
function copyPrLink() {
  var link = document.getElementById('pr-link').textContent;
  navigator.clipboard.writeText(link).then(function(){toast('Link copied','ok');});
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  initTabs('wlt');
  loadFiatAccounts();
  loadCryptoPrices();
  loadFundHistory();
  loadCryptoTxns();
});
</script>
`);
}

// --- Ops Hub -----------------------------------------------------------------
function opsHub() {
  return page('Operations Hub', '/ops', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span>Operations</div>
  <h1>Operations Hub</h1>
  <p>System operations, terminal management, network configuration, and protocol testing.</p>
</div>
<div class="grid-3" style="gap:12px">
  <a href="/ops/terminals" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('terminal')} Terminal Ops</div>
    <div class="card-sub">Manage devices, firmware, groups, and parameters</div>
  </a>
  <a href="/ops/network" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('network')} Network &amp; Keys</div>
    <div class="card-sub">HMAC keys, API keys, user management</div>
  </a>
  <a href="/ops/iso8583" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('iso')} ISO 8583</div>
    <div class="card-sub">Parse, build, simulate ISO messages</div>
  </a>
  <a href="/admin/svc/routing" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('route')} Routing</div>
    <div class="card-sub">Routes, connections, rules, health</div>
  </a>
  <a href="/admin/svc/audit" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('audit')} Audit Log</div>
    <div class="card-sub">System events and security alerts</div>
  </a>
  <a href="/platform/monitoring" class="card" style="text-decoration:none">
    <div class="card-title">${svgIcon('monitor')} Monitoring</div>
    <div class="card-sub">All 14 service health status</div>
  </a>
</div>
`);
}

// --- Ops Terminals -----------------------------------------------------------
function opsTerminals() {
  return page('Terminal Ops', '/ops/terminals', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/ops">Ops</a><span>/</span>Terminals</div>
  <h1>Terminal Operations</h1>
</div>
<div class="tabs">
  <div class="tab active" data-g="opst" data-t="opst-list">Terminals</div>
  <div class="tab" data-g="opst" data-t="opst-groups">Groups</div>
  <div class="tab" data-g="opst" data-t="opst-firmware">Firmware</div>
  <div class="tab" data-g="opst" data-t="opst-params">Parameters</div>
  <div class="tab" data-g="opst" data-t="opst-fleet">Fleet</div>
</div>
<div id="opst-list" class="tab-pane active" data-g="opst">
  <div class="card"><div class="card-header"><div class="card-title">All Terminals</div><button class="btn btn-ghost btn-sm" onclick="loadAllTerminals()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Serial</th><th>Group</th><th>Status</th></tr></thead>
  <tbody id="opst-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="opst-groups" class="tab-pane" data-g="opst">
  <div class="card"><div class="card-header"><div class="card-title">Terminal Groups</div><button class="btn btn-ghost btn-sm" onclick="loadGroups()">${svgIcon("refresh")} Refresh</button></div>
  <div id="groups-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh to load.</div></div>
</div>
<div id="opst-firmware" class="tab-pane" data-g="opst">
  <div class="card"><div class="card-header"><div class="card-title">Firmware Packages</div><button class="btn btn-ghost btn-sm" onclick="loadFirmware()">${svgIcon("refresh")} Refresh</button></div>
  <div id="fw-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh to load.</div></div>
</div>
<div id="opst-params" class="tab-pane" data-g="opst">
  <div class="card"><div class="card-header"><div class="card-title">Parameters</div><button class="btn btn-ghost btn-sm" onclick="loadParams()">${svgIcon("refresh")} Refresh</button></div>
  <div id="params-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh to load.</div></div>
</div>
<div id="opst-fleet" class="tab-pane" data-g="opst">
  <div class="card"><div class="card-header"><div class="card-title">Fleet Dashboard</div><button class="btn btn-ghost btn-sm" onclick="loadFleet()">${svgIcon("chart")} Load</button></div>
  <div id="fleet-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click load to fetch data.</div></div>
</div>
<script>
function loadAllTerminals(){api('GET','/terminals').then(function(r){var rows=(r.data.terminals||r.data||[]).map(function(t){return '<tr><td><code>'+t.id+'</code></td><td>'+t.name+'</td><td><code>'+(t.serialNumber||'')+'</code></td><td>'+(t.groupId||'')+'</td><td><span class="badge '+(t.status==='active'?'badge-green':'badge-gray')+'">'+t.status+'</span></td></tr>';}).join('');document.getElementById('opst-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No terminals</td></tr>';});}
function loadGroups(){api('GET','/terminals/groups').then(function(r){document.getElementById('groups-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadFirmware(){api('GET','/terminals/firmware').then(function(r){document.getElementById('fw-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadParams(){api('GET','/terminals/parameters').then(function(r){document.getElementById('params-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadFleet(){api('GET','/terminals/fleet').then(function(r){document.getElementById('fleet-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('opst');loadAllTerminals();});
</script>
`);
}

// --- Ops Network -------------------------------------------------------------
function opsNetwork() {
  return page('Network & Keys', '/ops/network', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/ops">Ops</a><span>/</span>Network</div>
  <h1>Network &amp; Keys</h1>
  <p>HMAC key management, API key administration, and user management.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="net" data-t="net-hmac">HMAC Keys</div>
  <div class="tab" data-g="net" data-t="net-api">API Keys</div>
  <div class="tab" data-g="net" data-t="net-users">Users</div>
  <div class="tab" data-g="net" data-t="net-verify">Verify</div>
</div>
<div id="net-hmac" class="tab-pane active" data-g="net">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">Create HMAC Key</div>
      <div class="form-group"><label>Label</label><input id="hk-label" placeholder="Integration key"></div>
      <div class="form-group"><label>Algorithm</label><select id="hk-algo"><option>SHA256</option><option>SHA512</option></select></div>
      <button class="btn btn-primary" onclick="createHmacKey()">Create</button>
      <div id="hk-result" class="result"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">HMAC Keys</div><button class="btn btn-ghost btn-sm" onclick="loadHmacKeys()">${svgIcon("refresh")} Refresh</button></div>
      <div class="table-wrap"><table><thead><tr><th>Key ID</th><th>Label</th><th>Algorithm</th><th>Created</th></tr></thead>
      <tbody id="hk-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div>
    </div>
  </div>
</div>
<div id="net-api" class="tab-pane" data-g="net">
  <div class="card"><div class="card-header"><div class="card-title">API Keys</div><button class="btn btn-ghost btn-sm" onclick="loadApiKeys()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Key ID</th><th>Name</th><th>Scopes</th><th>Status</th></tr></thead>
  <tbody id="ak-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="net-users" class="tab-pane" data-g="net">
  <div class="card"><div class="card-header"><div class="card-title">Users</div><button class="btn btn-ghost btn-sm" onclick="loadUsers()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>User ID</th><th>Name</th><th>Role</th><th>Status</th></tr></thead>
  <tbody id="usr-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="net-verify" class="tab-pane" data-g="net">
  <div class="card" style="max-width:480px">
    <div class="card-title" style="margin-bottom:16px">Verify HMAC Signature</div>
    <div class="form-group"><label>Key ID</label><input id="vf-keyid" class="input-mono" placeholder="psk_live_key_001"></div>
    <div class="form-group"><label>Payload</label><textarea id="vf-payload" class="input-mono" rows="3" placeholder='{"amount":"100.00"}'></textarea></div>
    <div class="form-group"><label>Signature</label><input id="vf-sig" class="input-mono" placeholder="hmac-sha256=..."></div>
    <button class="btn btn-primary" onclick="verifyHmac()">Verify</button>
    <div id="vf-result" class="result"></div>
  </div>
</div>
<script>
function createHmacKey(){api('POST','/security/hmac/keys',{label:document.getElementById('hk-label').value,algorithm:document.getElementById('hk-algo').value}).then(function(r){showResult('hk-result',r.data,r.ok);if(r.ok)toast('Key created','ok');});}
function loadHmacKeys(){api('GET','/security/hmac/keys').then(function(r){var rows=(r.data.data||r.data||[]).map(function(k){return '<tr><td><code>'+k.client_id||k.clientId+'</code></td><td>'+k.label+'</td><td>'+(k.algorithm||'SHA256')+'</td><td>'+new Date(k.createdAt).toLocaleDateString()+'</td></tr>';}).join('');document.getElementById('hk-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No keys</td></tr>';});}
function loadApiKeys(){api('GET','/security/api-keys').then(function(r){var rows=(r.data.data||r.data||[]).map(function(k){return '<tr><td><code>'+k.id+'</code></td><td>'+k.name+'</td><td>'+(k.scopes||[]).join(', ')+'</td><td><span class="badge '+(k.status==='active'?'badge-green':'badge-gray')+'">'+k.status+'</span></td></tr>';}).join('');document.getElementById('ak-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No keys</td></tr>';});}
function loadUsers(){api('GET','/security/users').then(function(r){var rows=(r.data.data||r.data||[]).map(function(u){return '<tr><td><code>'+u.id+'</code></td><td>'+u.name+'</td><td>'+u.role+'</td><td><span class="badge '+(u.status==='active'?'badge-green':'badge-gray')+'">'+u.status+'</span></td></tr>';}).join('');document.getElementById('usr-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No users</td></tr>';});}
function verifyHmac(){api('POST','/security/hmac/verify',{keyId:document.getElementById('vf-keyid').value,payload:document.getElementById('vf-payload').value,signature:document.getElementById('vf-sig').value}).then(function(r){showResult('vf-result',r.data,r.ok);});}
document.addEventListener('DOMContentLoaded', function(){initTabs('net');});
</script>
`);
}

// --- Ops ISO 8583 ------------------------------------------------------------
function opsIso8583() {
  return page('ISO 8583', '/ops/iso8583', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/ops">Ops</a><span>/</span>ISO 8583</div>
  <h1>ISO 8583 Test Console</h1>
  <p>Parse, build, and simulate ISO 8583 financial messages.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="iso" data-t="iso-sim">Simulate</div>
  <div class="tab" data-g="iso" data-t="iso-parse">Parse</div>
  <div class="tab" data-g="iso" data-t="iso-build">Build</div>
  <div class="tab" data-g="iso" data-t="iso-hosts">Hosts</div>
  <div class="tab" data-g="iso" data-t="iso-msgs">Messages</div>
  <div class="tab" data-g="iso" data-t="iso-metrics">Metrics</div>
</div>
<div id="iso-sim" class="tab-pane active" data-g="iso">
  <div class="card" style="max-width:540px">
    <div class="card-title" style="margin-bottom:16px">Simulate Transaction</div>
    <div class="form-row">
      <div class="form-group"><label>MTI</label><select id="sim-mti"><option value="0100">0100 Auth Request</option><option value="0110">0110 Auth Response</option><option value="0200">0200 Financial</option><option value="0400">0400 Reversal</option><option value="0800">0800 Network Mgmt</option></select></div>
      <div class="form-group"><label>Amount (cents)</label><input id="sim-amount" class="input-mono" placeholder="10000" value="10000"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>PAN</label><input id="sim-pan" class="input-mono" placeholder="4111111111111111"></div>
      <div class="form-group"><label>Terminal ID</label><input id="sim-tid" class="input-mono" placeholder="TID001" value="TID001"></div>
    </div>
    <div class="form-group"><label>Host</label><select id="sim-host"><option value="">Default</option></select></div>
    <button class="btn btn-primary" onclick="simulate()">Simulate</button>
    <div id="sim-result" class="result"></div>
  </div>
</div>
<div id="iso-parse" class="tab-pane" data-g="iso">
  <div class="card" style="max-width:560px">
    <div class="card-title" style="margin-bottom:16px">Parse ISO Message</div>
    <div class="form-group"><label>Raw Hex Message</label><textarea id="parse-hex" class="input-mono" rows="4" placeholder="30323030..."></textarea></div>
    <button class="btn btn-primary" onclick="parseMsg()">Parse</button>
    <div id="parse-result" class="result"></div>
  </div>
</div>
<div id="iso-build" class="tab-pane" data-g="iso">
  <div class="card" style="max-width:560px">
    <div class="card-title" style="margin-bottom:16px">Build ISO Message</div>
    <div class="form-group"><label>MTI</label><input id="build-mti" class="input-mono" placeholder="0200" maxlength="4" value="0200"></div>
    <div class="form-group"><label>Fields (JSON)</label><textarea id="build-fields" class="input-mono" rows="6" placeholder='{"2":"4111111111111111","3":"000000","4":"000000010000"}'></textarea></div>
    <button class="btn btn-primary" onclick="buildMsg()">Build</button>
    <div id="build-result" class="result"></div>
  </div>
</div>
<div id="iso-hosts" class="tab-pane" data-g="iso">
  <div class="card"><div class="card-header"><div class="card-title">ISO Hosts</div><button class="btn btn-ghost btn-sm" onclick="loadHosts()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Host ID</th><th>Name</th><th>Endpoint</th><th>Status</th></tr></thead>
  <tbody id="hosts-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="iso-msgs" class="tab-pane" data-g="iso">
  <div class="card"><div class="card-header"><div class="card-title">Message Journal</div><button class="btn btn-ghost btn-sm" onclick="loadMessages()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>MTI</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
  <tbody id="msgs-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="iso-metrics" class="tab-pane" data-g="iso">
  <div class="card"><div class="card-header"><div class="card-title">Metrics</div><button class="btn btn-ghost btn-sm" onclick="loadMetrics()">${svgIcon("chart")} Load</button></div>
  <div id="metrics-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click load to fetch metrics.</div></div>
</div>
<script>
function simulate(){api('POST','/iso8583/simulate',{mti:document.getElementById('sim-mti').value,amount:document.getElementById('sim-amount').value,pan:document.getElementById('sim-pan').value,terminalId:document.getElementById('sim-tid').value,host:document.getElementById('sim-host').value}).then(function(r){showResult('sim-result',r.data,r.ok);});}
function parseMsg(){api('POST','/iso8583/parse',{hex:document.getElementById('parse-hex').value}).then(function(r){showResult('parse-result',r.data,r.ok);});}
function buildMsg(){try{var fields=JSON.parse(document.getElementById('build-fields').value||'{}');api('POST','/iso8583/build',{mti:document.getElementById('build-mti').value,fields:fields}).then(function(r){showResult('build-result',r.data,r.ok);});}catch(e){showResult('build-result',{error:'Invalid JSON: '+e.message},false);}}
function loadHosts(){api('GET','/iso8583/hosts').then(function(r){var rows=(r.data.data||r.data||[]).map(function(h){return '<tr><td><code>'+h.id+'</code></td><td>'+h.host_name+'</td><td><code>'+(h.hostname+':'+h.port)+'</code></td><td><span class="badge '+(h.status==='active'?'badge-green':'badge-gray')+'">'+h.status+'</span></td></tr>';}).join('');document.getElementById('hosts-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No hosts</td></tr>';});}
function loadMessages(){api('GET','/iso8583/messages').then(function(r){var rows=(r.data.data||r.data||[]).slice(0,30).map(function(m){return '<tr><td><code>'+m.id+'</code></td><td><code>'+m.mti+'</code></td><td>'+(m.amount||'')+'</td><td><span class="badge '+(m.status==='approved'?'badge-green':m.status==='declined'?'badge-red':'badge-yellow')+'">'+m.status+'</span></td><td>'+new Date(m.created_at).toLocaleString()+'</td></tr>';}).join('');document.getElementById('msgs-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No messages</td></tr>';});}
function loadMetrics(){api('GET','/iso8583/metrics').then(function(r){document.getElementById('metrics-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('iso');});
</script>
`);
}

// --- Admin Service Pages -----------------------------------------------------

function adminLedger() {
  return page('Ledger Service', '/admin/svc/ledger', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Ledger</div>
  <h1>Ledger Service <span id="led-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Double-entry journal, accounts, and fund holds — port 4001.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="led" data-t="led-accounts">Accounts</div>
  <div class="tab" data-g="led" data-t="led-entries">Journal Entries</div>
  <div class="tab" data-g="led" data-t="led-holds">Fund Holds</div>
  <div class="tab" data-g="led" data-t="led-post">Post Entry</div>
</div>
<div id="led-accounts" class="tab-pane active" data-g="led">
  <div class="card"><div class="card-header"><div class="card-title">Accounts</div><button class="btn btn-ghost btn-sm" onclick="loadLedgerAccounts()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Account ID</th><th>Type</th><th>Currency</th><th>Balance</th><th>Status</th></tr></thead>
  <tbody id="la-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="led-entries" class="tab-pane" data-g="led">
  <div class="card"><div class="card-header"><div class="card-title">Journal Entries</div><button class="btn btn-ghost btn-sm" onclick="loadLedgerEntries()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Entry ID</th><th>Account</th><th>Type</th><th>Amount</th><th>Reference</th><th>Date</th></tr></thead>
  <tbody id="le-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="led-holds" class="tab-pane" data-g="led">
  <div class="card" style="max-width:440px">
    <div class="card-title" style="margin-bottom:16px">Lookup Hold</div>
    <div class="form-group"><label>Hold Reference</label><input id="lh-ref" class="input-mono" placeholder="HLD-xxxx"></div>
    <button class="btn btn-primary" onclick="lookupHold()">Lookup</button>
    <div id="lh-result" class="result"></div>
  </div>
</div>
<div id="led-post" class="tab-pane" data-g="led">
  <div class="card" style="max-width:520px">
    <div class="card-title" style="margin-bottom:16px">Post Journal Entry</div>
    <div class="form-row">
      <div class="form-group"><label>Account ID</label><input id="lp-account" class="input-mono" placeholder="acc_xxxx"></div>
      <div class="form-group"><label>Entry Type</label><select id="lp-type"><option>credit</option><option>debit</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="lp-amount" type="number" step="0.01" placeholder="100.00"></div>
      <div class="form-group"><label>Currency</label><select id="lp-cur"><option>USD</option><option>EUR</option><option>GBP</option></select></div>
    </div>
    <div class="form-group"><label>Reference</label><input id="lp-ref" class="input-mono" placeholder="REF-001"></div>
    <div class="form-group"><label>Description</label><input id="lp-desc" placeholder="Manual adjustment"></div>
    <button class="btn btn-primary" onclick="postEntry()">Post Entry</button>
    <div id="lp-result" class="result"></div>
  </div>
</div>
<script>
function loadLedgerAccounts(){api('GET','/wallets/accounts').then(function(r){var rows=(r.data.data||r.data||[]).map(function(a){return '<tr><td><code>'+a.account_number+'</code></td><td>'+a.account_type+'</td><td>'+a.currency+'</td><td><strong>'+a.available_balance+'</strong></td><td><span class="badge '+(a.status==='active'?'badge-green':'badge-gray')+'">'+a.status+'</span></td></tr>';}).join('');document.getElementById('la-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No accounts</td></tr>';});}
function loadLedgerEntries(){api('GET','/wallets/entries').then(function(r){var rows=(r.data.data||r.data||[]).slice(0,50).map(function(e){return '<tr><td><code>'+e.reference||e.id+'</code></td><td><code>'+e.entry_type+'</code></td><td>'+e.entry_type+'</td><td>'+e.amount+'</td><td><code>'+(e.reference||'')+'</code></td><td>'+new Date(e.created_at).toLocaleString()+'</td></tr>';}).join('');document.getElementById('le-tbody').innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No entries</td></tr>';});}
function lookupHold(){api('GET','/wallets/holds/'+document.getElementById('lh-ref').value).then(function(r){showResult('lh-result',r.data,r.ok);});}
function postEntry(){api('POST','/wallets/entries',{accountId:document.getElementById('lp-account').value,type:document.getElementById('lp-type').value,amount:document.getElementById('lp-amount').value,currency:document.getElementById('lp-cur').value,reference:document.getElementById('lp-ref').value,description:document.getElementById('lp-desc').value}).then(function(r){showResult('lp-result',r.data,r.ok);if(r.ok)toast('Entry posted','ok');});}
document.addEventListener('DOMContentLoaded', function(){initTabs('led');refreshHealthBadge('led-badge',4001);});
</script>
`);
}

function adminIpWhitelist() {
  return page('IP Whitelist Service', '/admin/svc/ipwhitelist', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>IP Whitelist</div>
  <h1>IP Whitelist Service <span id="ipw-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>IP allow-list management — port 4002.</p>
</div>
<div class="tabs">
  <button class="tab active" type="button" id="ipw-tab-list" data-g="ipw" data-t="ipw-list" aria-controls="ipw-list">Entries</button>
  <button class="tab" type="button" id="ipw-tab-add" data-g="ipw" data-t="ipw-add" aria-controls="ipw-add">Add</button>
  <button class="tab" type="button" id="ipw-tab-check" data-g="ipw" data-t="ipw-check" aria-controls="ipw-check">Check</button>
  <button class="tab" type="button" id="ipw-tab-purge" data-g="ipw" data-t="ipw-purge" aria-controls="ipw-purge">Purge</button>
</div>
<div id="ipw-list" class="tab-pane active" data-g="ipw" role="tabpanel" aria-labelledby="ipw-tab-list">
  <div class="card"><div class="card-header"><div class="card-title">Whitelist Entries</div><button class="btn btn-ghost btn-sm" onclick="loadIpList()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>IP / CIDR</th><th>Label</th><th>Expires</th><th>Actions</th></tr></thead>
  <tbody id="ipwl-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="ipw-add" class="tab-pane" data-g="ipw" role="tabpanel" aria-labelledby="ipw-tab-add" hidden>
  <div class="card" style="max-width:440px">
    <div class="card-title" style="margin-bottom:16px">Add IP</div>
    <div class="form-group"><label>IP Address / CIDR</label><input id="iwa-ip" class="input-mono" placeholder="10.0.0.1 or 10.0.0.0/24"></div>
    <div class="form-group"><label>Label</label><input id="iwa-label" placeholder="Office"></div>
    <div class="form-group"><label>Expires</label><input id="iwa-exp" type="datetime-local"></div>
    <button class="btn btn-primary" onclick="addIpEntry()">Add</button>
    <div id="iwa-result" class="result"></div>
  </div>
</div>
<div id="ipw-check" class="tab-pane" data-g="ipw" role="tabpanel" aria-labelledby="ipw-tab-check" hidden>
  <div class="card" style="max-width:400px">
    <div class="card-title" style="margin-bottom:16px">Check IP</div>
    <div class="form-group"><label>IP Address</label><input id="iwc-ip" class="input-mono" placeholder="1.2.3.4"></div>
    <button class="btn btn-primary" onclick="checkIpEntry()">Check</button>
    <div id="iwc-result" class="result"></div>
  </div>
</div>
<div id="ipw-purge" class="tab-pane" data-g="ipw" role="tabpanel" aria-labelledby="ipw-tab-purge" hidden>
  <div class="card" style="max-width:400px">
    <div class="card-title" style="margin-bottom:16px">Purge Expired Entries</div>
    <div class="notice notice-warn" style="margin-bottom:16px">This removes all entries where the expiry date has passed.</div>
    <button class="btn btn-danger" onclick="purgeIpEntries()">Purge Expired</button>
    <div id="iwp-result" class="result"></div>
  </div>
</div>
<script>
function ipWhitelistError(result){var body=result&&result.data;return body&&body.error&&body.error.message||body&&body.message||'IP Whitelist request failed (HTTP '+(result&&result.status||'unknown')+').';}
function loadIpList(){
  var body=document.getElementById('ipwl-tbody');
  api('GET','/ipwhitelist/entries').then(function(r){
    if(!r.ok||!r.data||r.data.success===false)throw new Error(ipWhitelistError(r));
    var entries=Array.isArray(r.data.data)?r.data.data:[];
    body.replaceChildren();
    if(!entries.length){body.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--muted)">No entries</td></tr>';return;}
    entries.forEach(function(entry){
      var row=document.createElement('tr');
      var ipCell=document.createElement('td');var code=document.createElement('code');code.textContent=entry.ip_range;ipCell.appendChild(code);
      var labelCell=document.createElement('td');labelCell.textContent=entry.label||'—';
      var expiryCell=document.createElement('td');expiryCell.textContent=entry.expires_at?new Date(entry.expires_at).toLocaleString():'Never';
      var actionCell=document.createElement('td');var remove=document.createElement('button');remove.type='button';remove.className='btn btn-danger btn-sm';remove.textContent='Delete';remove.addEventListener('click',function(){delIpEntry(entry.id);});actionCell.appendChild(remove);
      row.append(ipCell,labelCell,expiryCell,actionCell);body.appendChild(row);
    });
  }).catch(function(error){
    body.replaceChildren();var row=document.createElement('tr');var cell=document.createElement('td');cell.colSpan=4;cell.style.textAlign='center';cell.textContent=error.message;row.appendChild(cell);body.appendChild(row);
    toast(error.message,'err');
  });
}
function addIpEntry(){
  var ipRange=document.getElementById('iwa-ip').value.trim();
  var label=document.getElementById('iwa-label').value.trim();
  if(!ipRange||!label){showResult('iwa-result',{error:'Enter both an IP address/CIDR range and a label.'},false);return;}
  var expiresInput=document.getElementById('iwa-exp').value;
  var expiresAt=expiresInput?new Date(expiresInput).toISOString():undefined;
  api('POST','/ipwhitelist/entries',{ipRange:ipRange,label:label,expiresAt:expiresAt}).then(function(r){
    showResult('iwa-result',r.data,r.ok);
    if(!r.ok||!r.data||r.data.success===false){toast(ipWhitelistError(r),'err');return;}
    toast('IP range added','ok');document.getElementById('iwa-ip').value='';document.getElementById('iwa-label').value='';document.getElementById('iwa-exp').value='';loadIpList();
  }).catch(function(error){showResult('iwa-result',{error:error.message},false);toast(error.message,'err');});
}
function checkIpEntry(){
  var ip=document.getElementById('iwc-ip').value.trim();
  if(!ip){showResult('iwc-result',{error:'Enter an IP address to check.'},false);return;}
  api('POST','/ipwhitelist/check',{ip:ip}).then(function(r){
    showResult('iwc-result',r.data,r.ok&&r.data&&r.data.success!==false);
    if(!r.ok||!r.data||r.data.success===false)toast(ipWhitelistError(r),'err');
  }).catch(function(error){showResult('iwc-result',{error:error.message},false);toast(error.message,'err');});
}
function delIpEntry(id){
  api('DELETE','/ipwhitelist/entries/'+encodeURIComponent(id)).then(function(r){
    if(!r.ok||!r.data||r.data.success===false){toast(ipWhitelistError(r),'err');return;}
    toast('IP entry deactivated','ok');loadIpList();
  }).catch(function(error){toast(error.message,'err');});
}
function purgeIpEntries(){
  if(!window.confirm('Deactivate all expired IP whitelist entries?'))return;
  api('POST','/ipwhitelist/purge').then(function(r){
    showResult('iwp-result',r.data,r.ok&&r.data&&r.data.success!==false);
    if(!r.ok||!r.data||r.data.success===false){toast(ipWhitelistError(r),'err');return;}
    var purged=r.data.data&&Number(r.data.data.purged)||0;
    toast(purged+' expired entr'+(purged===1?'y':'ies')+' deactivated','ok');loadIpList();
  }).catch(function(error){showResult('iwp-result',{error:error.message},false);toast(error.message,'err');});
}
document.addEventListener('DOMContentLoaded', function(){initTabs('ipw');refreshHealthBadge('ipw-badge',4002);});
</script>
`);
}

function adminAuth() {
  return page('Auth Service', '/admin/svc/auth', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Auth</div>
  <h1>Auth Service <span id="auth-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>HMAC signature verification and key management — port 4003.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="authsvc" data-t="auth-keys">Keys</div>
  <div class="tab" data-g="authsvc" data-t="auth-verify">Verify</div>
  <div class="tab" data-g="authsvc" data-t="auth-sign">Sign</div>
</div>
<div id="auth-keys" class="tab-pane active" data-g="authsvc">
  <div class="card"><div class="card-header"><div class="card-title">Auth Keys</div><button class="btn btn-ghost btn-sm" onclick="loadAuthKeys()">${svgIcon("refresh")} Refresh</button></div>
  <div id="auth-keys-content" style="color:var(--muted);font-size:.85rem;padding:12px">Click refresh to load.</div></div>
</div>
<div id="auth-verify" class="tab-pane" data-g="authsvc">
  <div class="card" style="max-width:500px">
    <div class="card-title" style="margin-bottom:16px">Verify Signature</div>
    <div class="form-group"><label>Key ID</label><input id="av-kid" class="input-mono" placeholder="psk_live_key_001"></div>
    <div class="form-group"><label>Payload</label><textarea id="av-payload" class="input-mono" rows="3" placeholder='{"amount":"100"}'></textarea></div>
    <div class="form-group"><label>Signature</label><input id="av-sig" class="input-mono" placeholder="hmac-sha256=..."></div>
    <button class="btn btn-primary" onclick="verifyAuth()">Verify</button>
    <div id="av-result" class="result"></div>
  </div>
</div>
<div id="auth-sign" class="tab-pane" data-g="authsvc">
  <div class="card" style="max-width:500px">
    <div class="card-title" style="margin-bottom:16px">Sign Payload</div>
    <div class="form-group"><label>Key ID</label><input id="as-kid" class="input-mono" placeholder="psk_live_key_001"></div>
    <div class="form-group"><label>Payload</label><textarea id="as-payload" class="input-mono" rows="3" placeholder='{"amount":"100"}'></textarea></div>
    <button class="btn btn-primary" onclick="signPayload()">Sign</button>
    <div id="as-result" class="result"></div>
  </div>
</div>
<script>
function loadAuthKeys(){api('GET','/auth/keys').then(function(r){document.getElementById('auth-keys-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function verifyAuth(){api('POST','/auth/verify',{keyId:document.getElementById('av-kid').value,payload:document.getElementById('av-payload').value,signature:document.getElementById('av-sig').value}).then(function(r){showResult('av-result',r.data,r.ok);});}
function signPayload(){api('POST','/auth/sign',{keyId:document.getElementById('as-kid').value,payload:document.getElementById('as-payload').value}).then(function(r){showResult('as-result',r.data,r.ok);});}
document.addEventListener('DOMContentLoaded', function(){initTabs('authsvc');refreshHealthBadge('auth-badge',4003);});
</script>
`);
}

function adminTerminal() {
  return page('Terminal Service', '/admin/svc/terminal', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Terminal</div>
  <h1>Terminal Service <span id="trm-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>POS device management — port 4004.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="trmsvc" data-t="trm-list">Terminals</div>
  <div class="tab" data-g="trmsvc" data-t="trm-register">Register New</div>
  <div class="tab" data-g="trmsvc" data-t="trm-merchant">Merchants</div>
  <div class="tab" data-g="trmsvc" data-t="trm-groups">Groups</div>
  <div class="tab" data-g="trmsvc" data-t="trm-actions">Actions</div>
  <div class="tab" data-g="trmsvc" data-t="trm-fleet">Fleet</div>
</div>
<div id="trm-list" class="tab-pane active" data-g="trmsvc">
  <div class="card"><div class="card-header"><div class="card-title">Terminal Fleet</div><button class="btn btn-ghost btn-sm" onclick="loadTrm()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>TID</th><th>Serial</th><th>Model</th><th>Merchant</th><th>Status</th><th>Last Seen</th></tr></thead>
  <tbody id="trm-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Loading—</td></tr></tbody></table></div></div>
</div>
<div id="trm-register" class="tab-pane" data-g="trmsvc">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card"><div class="card-title" style="margin-bottom:16px">Register New Terminal</div>
    <div class="form-group"><label>Merchant</label><select id="trm-merchant-sel"><option value="">— select merchant —</option></select></div>
    <div class="form-row">
      <div class="form-group"><label>Terminal ID (TID) *</label><input id="trm-tid" class="input-mono" placeholder="TID00001" maxlength="8"></div>
      <div class="form-group"><label>Serial Number *</label><input id="trm-serial" class="input-mono" placeholder="SN-2026-001"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Model</label><input id="trm-model" placeholder="PAX A920"></div>
      <div class="form-group"><label>Country</label><select id="trm-country"><option value="US">US</option><option value="AE">AE</option><option value="GB">GB</option><option value="NG">NG</option><option value="KE">KE</option></select></div>
    </div>
    <button class="btn btn-primary" onclick="registerTerminal()">Register Terminal</button>
    <div id="trm-reg-result" class="result"></div>
    </div>
    <div class="card"><div class="card-title" style="margin-bottom:16px">Create Merchant (if none exists)</div>
    <div class="form-row">
      <div class="form-group"><label>Merchant Code</label><input id="trm-mc-code" placeholder="MERCH-NYC-001"></div>
      <div class="form-group"><label>Business Name</label><input id="trm-mc-name" placeholder="Acme Retail Inc."></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>MCC</label><input id="trm-mc-mcc" placeholder="5999" maxlength="4" value="5999"></div>
      <div class="form-group"><label>Country</label><select id="trm-mc-country"><option value="US">US</option><option value="AE">AE</option><option value="GB">GB</option><option value="NG">NG</option></select></div>
    </div>
    <button class="btn btn-ghost" onclick="createMerchant()">Create Merchant</button>
    <div id="trm-mc-result" class="result"></div>
    </div>
  </div>
</div>
<div id="trm-merchant" class="tab-pane" data-g="trmsvc">
  <div class="card"><div class="card-header"><div class="card-title">Merchants</div><button class="btn btn-ghost btn-sm" onclick="loadMerchants()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Code</th><th>Business Name</th><th>MCC</th><th>Status</th></tr></thead>
  <tbody id="trm-merchant-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Loading—</td></tr></tbody></table></div></div>
</div>
<div id="trm-groups" class="tab-pane" data-g="trmsvc">
  <div class="card"><div class="card-header"><div class="card-title">Terminal Groups</div><button class="btn btn-ghost btn-sm" onclick="loadTrmGroups()">${svgIcon("refresh")} Refresh</button></div>
  <div id="trmg-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="trm-actions" class="tab-pane" data-g="trmsvc">
  <div class="card" style="max-width:440px"><div class="card-title" style="margin-bottom:16px">Terminal Actions</div>
  <div class="form-group"><label>Terminal ID (TID)</label><input id="trm-act-tid" class="input-mono" placeholder="TID00001"></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    <button class="btn btn-success btn-sm" onclick="activateTerminal()">Activate</button>
    <button class="btn btn-ghost btn-sm" onclick="sendHeartbeat()">Send Heartbeat</button>
    <button class="btn btn-ghost btn-sm" onclick="validateTerminal()">Validate</button>
    <button class="btn btn-ghost btn-sm" onclick="getTerminalDetails()">Get Details</button>
  </div>
  <div class="form-row">
    <div class="form-group"><label>CPU %</label><input id="trm-cpu" type="number" placeholder="15" value="15"></div>
    <div class="form-group"><label>Memory %</label><input id="trm-mem" type="number" placeholder="40" value="40"></div>
  </div>
  <div class="form-group"><label>Queue Command</label>
    <select id="trm-cmd"><option value="REBOOT">REBOOT</option><option value="UPDATE_CONFIG">UPDATE_CONFIG</option><option value="DOWNLOAD_KEYS">DOWNLOAD_KEYS</option><option value="SYNC_TIME">SYNC_TIME</option></select>
  </div>
  <button class="btn btn-warn btn-sm" onclick="queueCommand()">Queue Command</button>
  <div id="trm-act-result" class="result"></div></div>
</div>
<div id="trm-fleet" class="tab-pane" data-g="trmsvc">
  <div class="card"><div class="card-header"><div class="card-title">Fleet Dashboard</div><button class="btn btn-ghost btn-sm" onclick="loadTrmFleet()">${svgIcon("chart")} Load</button></div>
  <div id="trmfl-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click load</div></div>
</div>
<script>
function loadTrm(){
  api('GET','/terminals').then(function(r){
    var list=r.data.data||r.data||[];
    var rows=list.map(function(t){
      return '<tr><td><strong>'+t.tid+'</strong></td><td><code>'+t.serial_number+'</code></td><td>'+(t.model||'—')+'</td><td>'+(t.merchant_code||t.merchant_name||'—')+'</td><td><span class="badge '+(t.status==='ACTIVE'?'badge-green':t.status==='REGISTERED'?'badge-yellow':'badge-gray')+'">'+t.status+'</span></td><td>'+(t.last_seen_at?new Date(t.last_seen_at).toLocaleString():'Never')+'</td></tr>';
    }).join('');
    document.getElementById('trm-tbody').innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No terminals registered yet</td></tr>';
  });
}
function loadMerchants(){
  api('GET','/terminals/merchants').then(function(r){
    var list=r.data.data||r.data||[];
    var rows=list.map(function(m){
      return '<tr><td><strong>'+m.merchant_code+'</strong></td><td>'+(m.legal_name||'—')+'</td><td><code>'+(m.mcc||'—')+'</code></td><td><span class="badge badge-green">'+(m.status||'ACTIVE')+'</span></td></tr>';
    }).join('');
    document.getElementById('trm-merchant-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No merchants — create one in the Register tab</td></tr>';
    var sel=document.getElementById('trm-merchant-sel');
    sel.innerHTML='<option value="">— select merchant —</option>'+list.map(function(m){return '<option value="'+m.id+'">'+m.merchant_code+' — '+(m.legal_name||m.id)+'</option>';}).join('');
  });
}
function registerTerminal(){
  var merchantId=document.getElementById('trm-merchant-sel').value;
  var tid=document.getElementById('trm-tid').value.trim();
  var serial=document.getElementById('trm-serial').value.trim();
  var model=document.getElementById('trm-model').value.trim();
  var country=document.getElementById('trm-country').value;
  if(!merchantId){toast('Select a merchant first','err');return;}
  if(!tid||!serial){toast('TID and Serial Number are required','err');return;}
  api('POST','/terminals',{tid:tid,serialNumber:serial,merchantId:merchantId,model:model||undefined,country:country,status:'REGISTERED'}).then(function(r){
    showResult('trm-reg-result',r.data,r.ok);
    if(r.ok){toast('Terminal '+tid+' registered!','ok');document.getElementById('trm-tid').value='';document.getElementById('trm-serial').value='';loadTrm();}
    else toast('Failed: '+(r.data.error&&r.data.error.message||'check fields'),'err');
  });
}
function createMerchant(){
  var code=document.getElementById('trm-mc-code').value.trim();
  var name=document.getElementById('trm-mc-name').value.trim();
  if(!code||!name){toast('Code and name required','err');return;}
  api('POST','/terminals/merchants',{merchantCode:code,businessName:name,mcc:document.getElementById('trm-mc-mcc').value||'5999',status:'ACTIVE'}).then(function(r){
    showResult('trm-mc-result',r.data,r.ok);
    if(r.ok){toast('Merchant '+code+' created!','ok');loadMerchants();}
    else toast('Failed: '+(r.data.error&&r.data.error.message||'check fields'),'err');
  });
}
function activateTerminal(){
  var tid=document.getElementById('trm-act-tid').value.trim();
  if(!tid){toast('Enter TID','err');return;}
  api('POST','/terminals/'+tid+'/activate').then(function(r){showResult('trm-act-result',r.data,r.ok);toast(r.ok?tid+' activated':'Failed',r.ok?'ok':'err');if(r.ok)loadTrm();});
}
function sendHeartbeat(){
  var tid=document.getElementById('trm-act-tid').value.trim();
  if(!tid){toast('Enter TID','err');return;}
  api('POST','/terminals/'+tid+'/heartbeat',{cpuPct:parseInt(document.getElementById('trm-cpu').value)||10,memoryPct:parseInt(document.getElementById('trm-mem').value)||40,status:'ONLINE'}).then(function(r){showResult('trm-act-result',r.data,r.ok);toast(r.ok?'Heartbeat sent':'Failed',r.ok?'ok':'err');});
}
function validateTerminal(){
  var tid=document.getElementById('trm-act-tid').value.trim();
  if(!tid){toast('Enter TID','err');return;}
  api('GET','/terminals/'+tid+'/validate').then(function(r){showResult('trm-act-result',r.data,r.ok);});
}
function getTerminalDetails(){
  var tid=document.getElementById('trm-act-tid').value.trim();
  if(!tid){toast('Enter TID','err');return;}
  api('GET','/terminals/'+tid).then(function(r){showResult('trm-act-result',r.data,r.ok);});
}
function queueCommand(){
  var tid=document.getElementById('trm-act-tid').value.trim();
  var cmd=document.getElementById('trm-cmd').value;
  if(!tid){toast('Enter TID','err');return;}
  api('POST','/terminals/'+tid+'/commands',{command:cmd}).then(function(r){showResult('trm-act-result',r.data,r.ok);if(r.ok)toast(cmd+' queued for '+tid);else toast('Failed','err');});
}
function loadTrmGroups(){api('GET','/terminals/groups').then(function(r){document.getElementById('trmg-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data.data||r.data,null,2)+'</pre>';});}
function loadTrmFleet(){api('GET','/terminals/fleet/overview').then(function(r){document.getElementById('trmfl-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data.data||r.data,null,2)+'</pre>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('trmsvc');loadTrm();loadMerchants();refreshHealthBadge('trm-badge',4004);});
</script>
`);
}

function adminSwitchcore() {
  return page('Switch Core Service', '/admin/svc/switchcore', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Switch Core</div>
  <h1>Switch Core Service <span id="sc-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Transaction processing, acquirer management, and settlement queue — port 4010.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="sc" data-t="sc-tx">Transactions</div>
  <div class="tab" data-g="sc" data-t="sc-acq">Acquirers</div>
  <div class="tab" data-g="sc" data-t="sc-routing">Routing Rules</div>
  <div class="tab" data-g="sc" data-t="sc-queue">Settlement Queue</div>
</div>
<div id="sc-tx" class="tab-pane active" data-g="sc">
  <div class="card"><div class="card-header"><div class="card-title">Transactions</div>
    <div style="display:flex;gap:8px">
      <input id="sc-txref" class="input-mono" placeholder="PS2026102600—" style="width:200px;padding:5px 10px;border:1px solid var(--border2);border-radius:var(--radius-sm);font-size:.82rem">
      <button class="btn btn-ghost btn-sm" onclick="lookupTx()">Lookup</button>
      <button class="btn btn-ghost btn-sm" onclick="loadTxList()">? List</button>
    </div>
  </div>
  <div id="sc-tx-lookup-result" class="result" style="margin-bottom:12px"></div>
  <div class="table-wrap"><table><thead><tr><th>TxRef</th><th>Type</th><th>Amount</th><th>Currency</th><th>Status</th><th>Terminal</th><th>Response</th><th>Date</th></tr></thead>
  <tbody id="sc-tx-tbody"><tr><td colspan="8" style="text-align:center;color:var(--muted)">Click list to load</td></tr></tbody></table></div></div>
</div>
<div id="sc-acq" class="tab-pane" data-g="sc">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card" style="max-width:440px"><div class="card-title" style="margin-bottom:16px">Register Acquirer</div>
    <div class="form-row">
      <div class="form-group"><label>Code *</label><input id="acq-code" class="input-mono" placeholder="ACQ-001"></div>
      <div class="form-group"><label>Name *</label><input id="acq-name" placeholder="Primary Acquirer"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Host *</label><input id="acq-host" placeholder="acquirer.bank.com"></div>
      <div class="form-group"><label>Port *</label><input id="acq-port" type="number" placeholder="8583" value="8583"></div>
    </div>
    <div class="form-group"><label>Protocol</label><select id="acq-proto"><option value="ISO8583">ISO8583</option><option value="REST">REST</option></select></div>
    <button class="btn btn-primary" onclick="registerAcquirer()">Register Acquirer</button>
    <div id="acq-reg-result" class="result"></div>
    </div>
    <div class="card"><div class="card-header"><div class="card-title">Acquirers</div><button class="btn btn-ghost btn-sm" onclick="loadAcquirers()">${svgIcon("refresh")} Refresh</button></div>
    <div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Host:Port</th><th>Protocol</th></tr></thead>
    <tbody id="acq-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
  </div>
</div>
<div id="sc-routing" class="tab-pane" data-g="sc">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card" style="max-width:440px"><div class="card-title" style="margin-bottom:16px">Create Routing Rule</div>
    <div class="form-group"><label>Rule Name *</label><input id="rr-name" placeholder="Visa USD routing"></div>
    <div class="form-group"><label>Acquirer</label><select id="rr-acquirer"><option value="">— select acquirer —</option></select></div>
    <div class="form-row">
      <div class="form-group"><label>Match Tx Type</label><select id="rr-txtype"><option value="">Any</option><option value="T2T">T2T</option><option value="S2S">S2S</option><option value="ISO8583">ISO8583</option></select></div>
      <div class="form-group"><label>Priority</label><input id="rr-priority" type="number" placeholder="100" value="100"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Match Currency</label><input id="rr-currency" placeholder="USD (blank = any)"></div>
      <div class="form-group"><label>Match Card BIN</label><input id="rr-bin" placeholder="4111 (blank = any)"></div>
    </div>
    <button class="btn btn-primary" onclick="createRoutingRule()">Create Rule</button>
    <div id="rr-reg-result" class="result"></div>
    </div>
    <div class="card"><div class="card-header"><div class="card-title">Routing Rules</div><button class="btn btn-ghost btn-sm" onclick="loadRoutingRules()">${svgIcon("refresh")} Refresh</button></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Acquirer</th><th>Match Tx Type</th><th>Match Currency</th><th>Priority</th></tr></thead>
    <tbody id="rr-sc-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
  </div>
</div>
<div id="sc-queue" class="tab-pane" data-g="sc">
  <div class="card"><div class="card-header"><div class="card-title">Settlement Queue</div>
    <div style="display:flex;gap:8px">
      <select id="sc-queue-status" style="width:auto;padding:4px 10px;border:1px solid var(--border2);border-radius:var(--radius-sm);font-size:.82rem" onchange="loadSettlementQueue()">
        <option value="PENDING">PENDING</option><option value="SETTLED">SETTLED</option><option value="">ALL</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="loadSettlementQueue()">${svgIcon("refresh")} Refresh</button>
    </div>
  </div>
  <div class="table-wrap"><table><thead><tr><th>TxRef</th><th>Amount</th><th>Currency</th><th>Status</th><th>Created</th></tr></thead>
  <tbody id="sc-queue-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<script>
function lookupTx(){
  var ref=document.getElementById('sc-txref').value.trim();
  if(!ref){toast('Enter a TxRef','err');return;}
  api('GET','/transactions/'+ref).then(function(r){showResult('sc-tx-lookup-result',r.data,r.ok);});
}
function loadTxList(){
  api('GET','/transactions?pageSize=30').then(function(r){
    var list=r.data.data||r.data||[];
    var rows=list.map(function(t){
      return '<tr><td><code style="font-size:.72rem">'+t.tx_ref+'</code></td><td><span class="badge badge-blue">'+t.tx_type+'</span></td><td><strong>'+parseFloat(t.amount).toFixed(2)+'</strong></td><td>'+t.currency+'</td><td><span class="badge '+(t.status==='APPROVED'?'badge-green':t.status==='DECLINED'?'badge-red':t.status==='FAILED'?'badge-red':t.status==='REVERSED'?'badge-yellow':'badge-gray')+'">'+t.status+'</span></td><td style="font-size:.72rem">'+(t.terminal_id||t.merchant_id||'—')+'</td><td><strong>'+(t.response_code||'—')+'</strong></td><td style="font-size:.72rem">'+new Date(t.received_at).toLocaleString()+'</td></tr>';
    }).join('');
    document.getElementById('sc-tx-tbody').innerHTML=rows||'<tr><td colspan="8" style="text-align:center;color:var(--muted)">No transactions</td></tr>';
  });
}
function registerAcquirer(){
  var code=document.getElementById('acq-code').value.trim();
  var name=document.getElementById('acq-name').value.trim();
  var host=document.getElementById('acq-host').value.trim();
  var port=parseInt(document.getElementById('acq-port').value)||8583;
  if(!code||!name||!host){toast('Code, Name and Host are required','err');return;}
  api('POST','/acquirers',{code:code,name:name,host:host,port:port,protocol:document.getElementById('acq-proto').value}).then(function(r){
    showResult('acq-reg-result',r.data,r.ok);
    if(r.ok){toast('Acquirer '+code+' registered','ok');loadAcquirers();}
    else toast('Failed: '+(r.data.error&&r.data.error.message||'check fields'),'err');
  });
}
function loadAcquirers(){
  api('GET','/acquirers').then(function(r){
    var list=r.data.data||r.data||[];
    var rows=list.map(function(a){
      return '<tr><td><strong>'+a.code+'</strong></td><td>'+a.name+'</td><td><code>'+a.host+':'+a.port+'</code></td><td><span class="badge badge-blue">'+a.protocol+'</span></td></tr>';
    }).join('');
    document.getElementById('acq-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No acquirers — register one on the left</td></tr>';
    var sel=document.getElementById('rr-acquirer');
    sel.innerHTML='<option value="">— select acquirer —</option>'+list.map(function(a){return '<option value="'+a.id+'">'+a.code+' — '+a.name+'</option>';}).join('');
  });
}
function createRoutingRule(){
  var name=document.getElementById('rr-name').value.trim();
  var acquirerId=document.getElementById('rr-acquirer').value;
  if(!name||!acquirerId){toast('Rule name and acquirer are required','err');return;}
  api('POST','/routing-rules',{name:name,acquirerId:acquirerId,priority:parseInt(document.getElementById('rr-priority').value)||100,matchTxType:document.getElementById('rr-txtype').value||undefined,matchCurrency:document.getElementById('rr-currency').value.trim()||undefined,matchCardBin:document.getElementById('rr-bin').value.trim()||undefined}).then(function(r){
    showResult('rr-reg-result',r.data,r.ok);
    if(r.ok){toast('Routing rule created','ok');loadRoutingRules();}
    else toast('Failed: '+(r.data.error&&r.data.error.message||'check fields'),'err');
  });
}
function loadRoutingRules(){
  api('GET','/routing-rules').then(function(r){
    var list=r.data.data||r.data||[];
    var rows=list.map(function(ru){
      return '<tr><td><strong>'+ru.name+'</strong></td><td>'+(ru.acquirer_code||ru.acquirer_id||'—')+'</td><td>'+(ru.match_tx_type||'Any')+'</td><td>'+(ru.match_currency||'Any')+'</td><td>'+ru.priority+'</td></tr>';
    }).join('');
    document.getElementById('rr-sc-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No routing rules — create one on the left</td></tr>';
  });
}
function loadSettlementQueue(){
  var status=document.getElementById('sc-queue-status').value;
  api('GET','/settlement-queue'+(status?'?status='+status:'')).then(function(r){
    var list=r.data.data||r.data||[];
    if(!Array.isArray(list)){document.getElementById('sc-queue-tbody').innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--muted)">No items in queue</td></tr>';return;}
    var rows=list.map(function(q){
      return '<tr><td><code style="font-size:.72rem">'+q.tx_ref+'</code></td><td><strong>'+parseFloat(q.amount||0).toFixed(2)+'</strong></td><td>'+q.currency+'</td><td><span class="badge '+(q.status==='SETTLED'?'badge-green':'badge-yellow')+'">'+q.status+'</span></td><td style="font-size:.72rem">'+new Date(q.created_at).toLocaleString()+'</td></tr>';
    }).join('');
    document.getElementById('sc-queue-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">Queue empty</td></tr>';
  });
}
document.addEventListener('DOMContentLoaded', function(){initTabs('sc');loadTxList();loadAcquirers();loadRoutingRules();loadSettlementQueue();refreshHealthBadge('sc-badge',4010);});
</script>
`);
}

// --- Receive Real Funds ------------------------------------------------------
function receiveFundsPage() {
  return page('Receive Real Funds', '/platform/receive-funds', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Receive Funds</div>
  <h1>Receive Real Funds</h1>
  <p>Accept incoming funds from Visa card networks, bank servers, bank accounts, and private wallets. Every receipt is a double-entry ledger record with full audit trail.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="rcv" data-t="rcv-card">${svgIcon('card')} Card Network (Visa/MC)</div>
  <div class="tab" data-g="rcv" data-t="rcv-bank-server">${svgIcon('bank')} Bank Server (ISO 8583)</div>
  <div class="tab" data-g="rcv" data-t="rcv-bank-acct">${svgIcon('bank')} Bank Account (ACH/Wire)</div>
  <div class="tab" data-g="rcv" data-t="rcv-wallet">${svgIcon('wallet')} Private Wallet</div>
  <div class="tab" data-g="rcv" data-t="rcv-history">${svgIcon('history')} History</div>
</div>

<!-- -- TAB 1: Card Network (Visa/Mastercard) -- -->
<div id="rcv-card" class="tab-pane active" data-g="rcv">
<div class="grid-2" style="gap:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:16px">Receive from Card Network</div>
    <div class="alert alert-info" style="margin-bottom:16px">
      Process a card authorization from Visa, Mastercard, or any card network. The transaction routes through the ISO 8583 gateway and switch core for real-time approval.
    </div>
    <div class="form-row">
      <div class="form-group"><label>Card Network</label><select id="rc-card-net"><option value="VISA">VISA</option><option value="MASTERCARD">Mastercard</option><option value="AMEX">American Express</option><option value="DISCOVER">Discover</option><option value="UNIONPAY">UnionPay</option><option value="VERVE">Verve</option></select></div>
      <div class="form-group"><label>Card BIN (first 6)</label><input id="rc-card-bin" class="input-mono" placeholder="411111" maxlength="6"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount *</label><input id="rc-card-amount" type="number" placeholder="100.00" step="0.01"></div>
      <div class="form-group"><label>Currency</label><select id="rc-card-currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>NGN</option><option>KES</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Terminal ID</label><input id="rc-card-tid" class="input-mono" placeholder="TID00001"></div>
      <div class="form-group"><label>Merchant ID (optional)</label><input id="rc-card-mid" class="input-mono" placeholder="MERCH-001"></div>
    </div>
    <div class="form-group"><label>Cardholder Name</label><input id="rc-card-name" placeholder="John Doe"></div>
    <div class="form-group"><label>Reference / Invoice #</label><input id="rc-card-ref" placeholder="INV-2026-001 (auto-generated if blank)"></div>
    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px" onclick="receiveCard()">
      ${svgIcon('card')} Process Card Payment
    </button>
    <div id="rc-card-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-title">How Card Intake Works</div>
    <div style="font-size:.82rem;line-height:2">
      <div>1. Card data enters via POS terminal or API</div>
      <div>2. ISO 8583 gateway parses the message (MTI 0200)</div>
      <div>3. Switch core routes to the acquiring bank</div>
      <div>4. Risk engine evaluates fraud in real-time</div>
      <div>5. If approved ? ledger credits your platform account</div>
      <div>6. Settlement queue captures for EOD processing</div>
      <div>7. Audit event logged for compliance</div>
    </div>
    <div style="margin-top:14px;padding:12px;background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;font-size:.78rem">
      <strong style="color:var(--success)">?</strong> Funds are available immediately in the destination account after approval. Settlement runs at EOD.
    </div>
  </div>
</div>
</div>

<!-- -- TAB 2: Bank Server (ISO 8583 host-to-host) -- -->
<div id="rcv-bank-server" class="tab-pane" data-g="rcv">
<div class="grid-2" style="gap:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:16px">Receive from Bank Server (ISO 8583)</div>
    <div class="alert alert-info" style="margin-bottom:16px">
      Direct host-to-host connection with a bank's ISO 8583 switch. Used for real-time interbank transfers and clearinghouse settlements.
    </div>
    <div class="form-row">
      <div class="form-group"><label>Source Bank Host</label><select id="rc-bs-host"><option value="">— select registered host —</option></select></div>
      <div class="form-group"><label>MTI</label><select id="rc-bs-mti"><option value="0200">0200 — Financial Request</option><option value="0800">0800 — Network Management</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount *</label><input id="rc-bs-amount" type="number" placeholder="50000.00" step="0.01"></div>
      <div class="form-group"><label>Currency</label><select id="rc-bs-currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>NGN</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Source Bank Name</label><input id="rc-bs-bank-name" placeholder="e.g. JPMorgan Chase"></div>
      <div class="form-group"><label>Source Account (masked)</label><input id="rc-bs-acct" class="input-mono" placeholder="****1234"></div>
    </div>
    <div class="form-group"><label>Reference / Bank Tx ID</label><input id="rc-bs-ref" placeholder="BANK-TX-2026-001"></div>
    <div class="form-group"><label>Destination Account</label>
      <select id="rc-bs-dest">
        <option value="PLATFORM:RESERVE:USD">PLATFORM:RESERVE:USD — Main Reserve</option>
        <option value="BANK:INCOMING:USD">BANK:INCOMING:USD — Incoming Pool</option>
        <option value="PLATFORM:OPS:USD">PLATFORM:OPS:USD — Operations Float</option>
      </select>
    </div>
    <div class="form-group"><label>Notes</label><input id="rc-bs-notes" placeholder="Clearing house settlement, interbank transfer—"></div>
    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px" onclick="receiveBankServer()">
      ${svgIcon("bank")} Receive from Bank Server
    </button>
    <div id="rc-bs-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-title">Registered ISO 8583 Hosts</div>
    <div class="card-sub" style="margin-bottom:12px">Hosts configured in the ISO 8583 gateway service.</div>
    <div class="table-wrap"><table><thead><tr><th>Host Name</th><th>Type</th><th>Status</th></tr></thead>
    <tbody id="rc-bs-hosts-tbody"><tr><td colspan="3" style="text-align:center;color:var(--muted)">Loading—</td></tr></tbody></table></div>
    <div style="margin-top:12px"><a href="/admin/svc/iso8583" class="btn btn-ghost btn-sm">? Manage ISO 8583 Hosts</a></div>
  </div>
</div>
</div>

<!-- -- TAB 3: Bank Account (ACH/Wire/SWIFT) -- -->
<div id="rcv-bank-acct" class="tab-pane" data-g="rcv">
<div class="grid-2" style="gap:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:16px">Receive from Bank Account</div>
    <div class="alert alert-info" style="margin-bottom:16px">
      Record an incoming ACH, wire transfer, or SWIFT payment from an external bank account to your platform.
    </div>
    <div class="form-row">
      <div class="form-group"><label>Transfer Type</label><select id="rc-ba-type"><option value="ACH">ACH</option><option value="WIRE">Wire Transfer</option><option value="SWIFT">SWIFT</option><option value="SEPA">SEPA</option><option value="FEDWIRE">FedWire</option><option value="INTERNAL">Internal Bank Transfer</option></select></div>
      <div class="form-group"><label>Currency</label><select id="rc-ba-currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>NGN</option><option>KES</option></select></div>
    </div>
    <div class="form-group"><label>Amount *</label><input id="rc-ba-amount" type="number" placeholder="25000.00" step="0.01"></div>
    <div class="form-row">
      <div class="form-group"><label>Sender Name *</label><input id="rc-ba-sender" placeholder="Full name of sender"></div>
      <div class="form-group"><label>Sender Bank</label><input id="rc-ba-sender-bank" placeholder="Bank name"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Sender Account (masked)</label><input id="rc-ba-sender-acct" class="input-mono" placeholder="****1234"></div>
      <div class="form-group"><label>Sender Country</label><select id="rc-ba-sender-country"><option value="US">US</option><option value="GB">UK</option><option value="AE">UAE</option><option value="EU">EU</option><option value="NG">Nigeria</option><option value="KE">Kenya</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Bank Reference / Auth Code *</label><input id="rc-ba-ref" placeholder="Wire ref, ACH trace, SWIFT UETR—"></div>
      <div class="form-group"><label>Value Date</label><input id="rc-ba-date" type="date"></div>
    </div>
    <div class="form-group"><label>Destination Account</label>
      <select id="rc-ba-dest">
        <option value="PLATFORM:RESERVE:USD">PLATFORM:RESERVE:USD — Main Reserve</option>
        <option value="BANK:INCOMING:USD">BANK:INCOMING:USD — Incoming Pool</option>
        <option value="MERCHANT:ESCROW:USD">MERCHANT:ESCROW:USD — Merchant Escrow</option>
      </select>
    </div>
    <div class="form-group"><label>Authorized By</label><input id="rc-ba-auth" placeholder="Your name / admin ID"></div>
    <div class="form-group"><label>Notes</label><input id="rc-ba-notes" placeholder="Additional context—"></div>
    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px" onclick="receiveBankAccount()">
      ${svgIcon("send")} Receive Bank Transfer
    </button>
    <div id="rc-ba-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-title">Quick Amount Presets</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rc-ba-amount').value=1000">$1,000</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rc-ba-amount').value=5000">$5,000</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rc-ba-amount').value=10000">$10,000</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rc-ba-amount').value=50000">$50,000</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rc-ba-amount').value=100000">$100,000</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rc-ba-amount').value=500000">$500,000</button>
    </div>
    <div style="margin-top:16px;padding:12px;background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;font-size:.78rem">
      <strong style="color:var(--success)">?</strong> Every received transfer creates:
      <div style="margin-top:6px;line-height:1.8">
        — Immutable double-entry ledger record<br>
        — Audit event with sender details<br>
        — SHA-256 entry hash for proof<br>
        — Downloadable receipt
      </div>
    </div>
  </div>
</div>
</div>

<!-- -- TAB 4: Private Wallet -- -->
<div id="rcv-wallet" class="tab-pane" data-g="rcv">
<div class="grid-2" style="gap:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:16px">Receive from Private Wallet</div>
    <div class="alert alert-info" style="margin-bottom:16px">
      Accept funds from an external wallet — crypto wallet, mobile money, or another platform account. Crypto receipts are credited to a dedicated per-coin crypto wallet (CRYPTO:&lt;coin&gt;); all other sources credit your platform reserve.
    </div>
    <div class="form-row">
      <div class="form-group"><label>Wallet Type</label><select id="rc-wl-type" onchange="toggleWlFields()">
        <option value="crypto">Crypto Wallet</option>
        <option value="mobile_money">Mobile Money</option>
        <option value="platform">Platform Account</option>
        <option value="cash">Cash Deposit</option>
      </select></div>
      <div class="form-group"><label>Currency</label><select id="rc-wl-currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>USDT</option><option>BTC</option><option>ETH</option><option>NGN</option><option>KES</option></select></div>
    </div>
    <div class="form-group"><label>Amount *</label><input id="rc-wl-amount" type="number" placeholder="10000.00" step="0.01"></div>
    <div id="rc-wl-crypto-fields">
      <div class="form-row">
        <div class="form-group"><label>Coin</label><select id="rc-wl-coin"><option value="BTC">BTC</option><option value="ETH">ETH</option><option value="USDT">USDT</option><option value="USDC">USDC</option><option value="BNB">BNB</option><option value="SOL">SOL</option></select></div>
        <div class="form-group"><label>Network</label><select id="rc-wl-network"><option value="mainnet">Mainnet</option><option value="TRC20">TRC-20</option><option value="ERC20">ERC-20</option><option value="BEP20">BEP-20</option></select></div>
      </div>
      <div class="form-group"><label>Sender Wallet Address</label><input id="rc-wl-addr" class="input-mono" placeholder="0x— or bc1— or T—"></div>
    </div>
    <div id="rc-wl-mobile-fields" style="display:none">
      <div class="form-row">
        <div class="form-group"><label>Phone Number</label><input id="rc-wl-phone" placeholder="+254700000000"></div>
        <div class="form-group"><label>Provider</label><select id="rc-wl-provider"><option value="MPESA">M-Pesa</option><option value="AIRTEL">Airtel Money</option><option value="MTN">MTN MoMo</option><option value="ORANGE">Orange Money</option></select></div>
      </div>
    </div>
    <div id="rc-wl-platform-fields" style="display:none">
      <div class="form-group"><label>Source Account ID</label><input id="rc-wl-src-acct" class="input-mono" placeholder="WALLET:USER:louis-001"></div>
    </div>
    <div class="form-group"><label>Sender Name / ID</label><input id="rc-wl-sender" placeholder="Name or ID of sender"></div>
    <div class="form-group"><label>Transaction Hash / Reference *</label><input id="rc-wl-txhash" placeholder="On-chain tx hash, M-Pesa ref, platform ref—"></div>
    <div class="form-group"><label>Destination Account</label>
      <select id="rc-wl-dest">
        <option value="CRYPTO:AUTO">CRYPTO:&lt;coin&gt; — Crypto Wallet (per coin)</option>
        <option value="PLATFORM:RESERVE:USD">PLATFORM:RESERVE:USD — Main Reserve</option>
        <option value="BANK:INCOMING:USD">BANK:INCOMING:USD — Incoming Pool</option>
      </select>
    </div>
    <div class="form-group"><label>Notes</label><input id="rc-wl-notes" placeholder="Additional context—"></div>
    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px" onclick="receiveWallet()">
      ${svgIcon("wallet")} Receive Wallet Transfer
    </button>
    <div id="rc-wl-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-title">Supported Sources</div>
    <div style="font-size:.82rem;line-height:2.2">
      <div>? <strong>Crypto</strong> — BTC, ETH, USDT, USDC, BNB, SOL</div>
      <div>${svgIcon("send")} <strong>Mobile Money</strong> — M-Pesa, Airtel, MTN, Orange</div>
      <div>${svgIcon("grid")} <strong>Platform</strong> — Other PrimeStack accounts</div>
      <div>${svgIcon("wallet")} <strong>Cash</strong> — Physical cash deposits</div>
    </div>
    <div style="margin-top:12px;padding:12px;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:8px;font-size:.78rem;color:#92400e">
      <strong>?</strong> For crypto receipts, verify the on-chain transaction hash before crediting. The platform does NOT auto-confirm blockchain transactions — manual verification is required.
    </div>
  </div>
</div>
</div>

<!-- -- TAB 5: History -- -->
<div id="rcv-history" class="tab-pane" data-g="rcv">
<div class="card">
  <div class="card-header"><div class="card-title">Received Funds History</div><button class="btn btn-ghost btn-sm" onclick="loadReceiveHistory()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Amount</th><th>From</th><th>Reference</th><th>Account</th></tr></thead>
  <tbody id="rcv-hist-tbody"><tr><td colspan="7" style="text-align:center;color:var(--muted)">Click refresh to load</td></tr></tbody></table></div>
</div>
</div>
<script>
function toggleWlFields(){
  var t=document.getElementById('rc-wl-type').value;
  document.getElementById('rc-wl-crypto-fields').style.display=t==='crypto'?'block':'none';
  document.getElementById('rc-wl-mobile-fields').style.display=t==='mobile_money'?'block':'none';
  document.getElementById('rc-wl-platform-fields').style.display=t==='platform'?'block':'none';
  // Default the destination per wallet type: crypto → per-coin crypto wallet, others → platform reserve
  var dest=document.getElementById('rc-wl-dest');
  if(dest){
    if(t==='crypto'){ dest.value='CRYPTO:AUTO'; }
    else if(dest.value==='CRYPTO:AUTO'){ dest.value='PLATFORM:RESERVE:USD'; }
  }
}

function postLedgerEntry(ref,type,amount,currency,dest,metadata,desc){
  return api('POST','/wallets/entries',{
    reference:ref,entryType:'FUNDING',description:desc,
    metadata:metadata,
    lines:[{accountId:'FUNDING:POOL:USD',debit:amount,credit:'0.00'},{accountId:dest,debit:'0.00',credit:amount}]
  });
}

function receiveCard(){
  var amount=document.getElementById('rc-card-amount').value.trim();
  var currency=document.getElementById('rc-card-currency').value;
  var bin=document.getElementById('rc-card-bin').value.trim();
  var tid=document.getElementById('rc-card-tid').value.trim();
  var network=document.getElementById('rc-card-net').value;
  if(!amount){toast('Amount is required','err');return;}
  var ref=document.getElementById('rc-card-ref').value.trim()||'CARD-'+Date.now();
  // Process through switch core
  api('POST','/transactions',{
    txType:'ISO8583',mti:'0200',
    sourceAccount:'CARD:'+network+':'+(bin||'000000'),
    destinationAccount:'PLATFORM:RESERVE:'+currency,
    amount:amount,currency:currency,
    cardBin:bin||undefined,terminalId:tid||undefined,
    description:'Card payment via '+network+' — '+ref
  }).then(function(r){
    var approved=r.ok&&(r.data.data&&r.data.data.approved||r.data.success);
    showResult('rc-card-result',r.data,approved);
    if(approved){
      toast(network+' payment APPROVED ? Auth: '+(r.data.data.authCode||'—'),'ok');
      // Also post a ledger entry
      postLedgerEntry(ref,'CARD_NETWORK',amount,currency,'PLATFORM:RESERVE:'+currency,
        {source:'card_network',network:network,cardBin:bin,terminalId:tid,txRef:r.data.data.txRef,cardholderName:document.getElementById('rc-card-name').value||undefined},
        'Card payment received via '+network+' — '+ref
      ).then(function(lr){
        if(lr.ok)toast('Ledger entry posted for '+ref,'ok');
      });
    } else {
      toast('Declined: '+(r.data.data&&r.data.data.responseMessage||r.data.error&&r.data.error.message||'check fields'),'err');
    }
  });
}

function loadBankHosts(){
  api('GET','/iso8583/hosts').then(function(r){
    var list=r.data.data||r.data||[];
    var rows=list.map(function(h){
      return '<tr><td>'+h.host_name+'</td><td><span class="badge badge-blue">'+h.host_type+'</span></td><td><span class="badge '+(h.status==='CONNECTED'?'badge-green':'badge-red')+'">'+h.status+'</span></td></tr>';
    }).join('');
    document.getElementById('rc-bs-hosts-tbody').innerHTML=rows||'<tr><td colspan="3" style="text-align:center;color:var(--muted)">No hosts registered</td></tr>';
    var sel=document.getElementById('rc-bs-host');
    sel.innerHTML='<option value="">— select host —</option>'+list.map(function(h){return '<option value="'+h.id+'">'+h.host_name+'</option>';}).join('');
  });
}

function receiveBankServer(){
  var amount=document.getElementById('rc-bs-amount').value.trim();
  var currency=document.getElementById('rc-bs-currency').value;
  var bankName=document.getElementById('rc-bs-bank-name').value.trim();
  var acct=document.getElementById('rc-bs-acct').value.trim();
  var ref=document.getElementById('rc-bs-ref').value.trim()||'BS-'+Date.now();
  var dest=document.getElementById('rc-bs-dest').value;
  var notes=document.getElementById('rc-bs-notes').value.trim();
  var mti=document.getElementById('rc-bs-mti').value;
  if(!amount){toast('Amount is required','err');return;}
  if(!bankName){toast('Source bank name is required','err');return;}
  postLedgerEntry(ref,'BANK_SERVER',amount,currency,dest,
    {source:'bank_server_iso8583',bankName:bankName,sourceAccount:acct,mti:mti,notes:notes,receivedAt:new Date().toISOString()},
    'Bank server receipt from '+bankName+' — '+ref
  ).then(function(r){
    showResult('rc-bs-result',r.data,r.ok);
    if(r.ok){
      toast('Received '+currency+' '+parseFloat(amount).toLocaleString()+' from '+bankName,'ok');
      // Audit log
      api('POST','/audit/events',{action:'BANK_SERVER_RECEIPT',actor:'platform-admin',resource:'/platform/receive-funds',details:{amount,currency,bankName,ref}}).catch(function(){});
    } else toast('Failed: '+(r.data.error&&r.data.error.message||'check fields'),'err');
  });
}

function receiveBankAccount(){
  var amount=document.getElementById('rc-ba-amount').value.trim();
  var currency=document.getElementById('rc-ba-currency').value;
  var type=document.getElementById('rc-ba-type').value;
  var sender=document.getElementById('rc-ba-sender').value.trim();
  var senderBank=document.getElementById('rc-ba-sender-bank').value.trim();
  var senderAcct=document.getElementById('rc-ba-sender-acct').value.trim();
  var senderCountry=document.getElementById('rc-ba-sender-country').value;
  var ref=document.getElementById('rc-ba-ref').value.trim();
  var date=document.getElementById('rc-ba-date').value;
  var dest=document.getElementById('rc-ba-dest').value;
  var auth=document.getElementById('rc-ba-auth').value.trim();
  var notes=document.getElementById('rc-ba-notes').value.trim();
  if(!amount){toast('Amount is required','err');return;}
  if(!sender){toast('Sender name is required','err');return;}
  if(!ref){toast('Bank reference is required','err');return;}
  postLedgerEntry(ref,'BANK_ACCOUNT',amount,currency,dest,
    {source:'bank_account',transferType:type,senderName:sender,senderBank:senderBank,senderAccount:senderAcct,senderCountry:senderCountry,valueDate:date,authorizedBy:auth,notes:notes,receivedAt:new Date().toISOString()},
    type+' received from '+sender+(senderBank?' at '+senderBank:'')+' — '+ref
  ).then(function(r){
    showResult('rc-ba-result',r.data,r.ok);
    if(r.ok){
      toast('Received '+currency+' '+parseFloat(amount).toLocaleString()+' from '+sender,'ok');
      api('POST','/audit/events',{action:'BANK_ACCOUNT_RECEIPT',actor:auth||'platform-admin',resource:'/platform/receive-funds',details:{amount,currency,sender,ref,type}}).catch(function(){});
      loadReceiveHistory();
    } else toast('Failed: '+(r.data.error&&r.data.error.message||'check fields'),'err');
  });
}

function receiveWallet(){
  var type=document.getElementById('rc-wl-type').value;
  var amount=document.getElementById('rc-wl-amount').value.trim();
  var currency=document.getElementById('rc-wl-currency').value;
  var sender=document.getElementById('rc-wl-sender').value.trim();
  var txHash=document.getElementById('rc-wl-txhash').value.trim();
  var dest=document.getElementById('rc-wl-dest').value;
  var notes=document.getElementById('rc-wl-notes').value.trim();
  if(!amount){toast('Amount is required','err');return;}
  if(!txHash){toast('Transaction hash / reference is required','err');return;}
  var meta={source:'wallet_'+type,txHash:txHash,senderName:sender||undefined,notes:notes,receivedAt:new Date().toISOString()};
  var desc='Wallet receipt ('+type+') — '+txHash;
  if(type==='crypto'){
    meta.coin=document.getElementById('rc-wl-coin').value;
    meta.network=document.getElementById('rc-wl-network').value;
    meta.walletAddress=document.getElementById('rc-wl-addr').value.trim()||undefined;
    desc='Crypto receipt '+meta.coin+' via '+meta.network+' — '+txHash;
    // Credit the dedicated per-coin crypto wallet (e.g. CRYPTO:USDT), not the fiat reserve
    if(dest==='CRYPTO:AUTO'){ dest='CRYPTO:'+meta.coin; }
  } else if(type==='mobile_money'){
    meta.phone=document.getElementById('rc-wl-phone').value.trim()||undefined;
    meta.provider=document.getElementById('rc-wl-provider').value;
    desc='Mobile money receipt via '+meta.provider+' — '+txHash;
  } else if(type==='platform'){
    meta.sourceAccount=document.getElementById('rc-wl-src-acct').value.trim()||undefined;
    desc='Platform transfer from '+meta.sourceAccount+' — '+txHash;
  }
  postLedgerEntry(txHash,'WALLET',amount,currency,dest,meta,desc).then(function(r){
    showResult('rc-wl-result',r.data,r.ok);
    if(r.ok){
      toast('Received '+currency+' '+parseFloat(amount).toLocaleString()+' from '+type,'ok');
      api('POST','/audit/events',{action:'WALLET_RECEIPT',actor:'platform-admin',resource:'/platform/receive-funds',details:{amount,currency,type,txHash,sender}}).catch(function(){});
      loadReceiveHistory();
    } else toast('Failed: '+(r.data.error&&r.data.error.message||'check fields'),'err');
  });
}

function loadReceiveHistory(){
  api('GET','/audit/events').then(function(r){
    var list=r.data.data||r.data||[];
    var receipts=list.filter(function(e){
      return e&&e.event_type&&e.event_type.indexOf('RECEIPT')>=0;
    }).slice(0,30);
    var rows=receipts.map(function(e){
      var d=typeof e.details==='string'?JSON.parse(e.details||'{}'):e.details||{};
      return '<tr><td style="font-size:.72rem">'+new Date(e.created_at||e.createdAt||Date.now()).toLocaleString()+'</td><td><span class="badge badge-blue">'+(d.source||e.action_type||e.event_type||'—')+'</span></td><td>'+(d.type||d.transferType||'—')+'</td><td><strong>'+(d.currency||'USD')+' '+parseFloat(d.amount||0).toLocaleString()+'</strong></td><td style="font-size:.72rem">'+(d.sender||d.senderName||d.bankName||'—')+'</td><td><code style="font-size:.68rem">'+(d.ref||d.txHash||e.entity_id||'—')+'</code></td><td style="font-size:.72rem">'+(e.resource||'—')+'</td></tr>';
    }).join('');
    document.getElementById('rcv-hist-tbody').innerHTML=rows||'<tr><td colspan="7" style="text-align:center;color:var(--muted)">No received funds yet — use the tabs above to receive funds</td></tr>';
  });
}

document.addEventListener('DOMContentLoaded', function(){
  initTabs('rcv');
  loadBankHosts();
  loadReceiveHistory();
});
</script>
`);
}

function adminTransfer() {
  return page('Transfer Service', '/admin/svc/transfer', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Transfer</div>
  <h1>Transfer Service <span id="xfr-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Transfer processing — port 4005.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="xfrsvc" data-t="xfr-send">Send</div>
  <div class="tab" data-g="xfrsvc" data-t="xfr-list">List</div>
  <div class="tab" data-g="xfrsvc" data-t="xfr-reverse">Reverse</div>
</div>
<div id="xfr-send" class="tab-pane active" data-g="xfrsvc">
  <div class="card" style="max-width:480px">
    <div class="card-title" style="margin-bottom:16px">Create Transfer</div>
    <div class="form-row">
      <div class="form-group"><label>From</label><input id="xf-from" class="input-mono" placeholder="acc_xxxx"></div>
      <div class="form-group"><label>To</label><input id="xf-to" class="input-mono" placeholder="acc_yyyy"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="xf-amount" type="number" step="0.01" placeholder="100.00"></div>
      <div class="form-group"><label>Currency</label><select id="xf-cur"><option>USD</option><option>EUR</option><option>GBP</option></select></div>
    </div>
    <div class="form-group"><label>Reference</label><input id="xf-ref" class="input-mono" placeholder="TXN-001"></div>
    <button class="btn btn-primary" onclick="createTransfer()">Send</button>
    <div id="xf-result" class="result"></div>
  </div>
</div>
<div id="xfr-list" class="tab-pane" data-g="xfrsvc">
  <div class="card"><div class="card-header"><div class="card-title">Transfers</div><button class="btn btn-ghost btn-sm" onclick="loadTransfers()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>From</th><th>To</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
  <tbody id="xfrl-tbody"><tr><td colspan="6" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="xfr-reverse" class="tab-pane" data-g="xfrsvc">
  <div class="card" style="max-width:440px">
    <div class="card-title" style="margin-bottom:16px">Reverse Transfer</div>
    <div class="form-group"><label>Transfer Reference</label><input id="xfrev-ref" class="input-mono" placeholder="TXN-001"></div>
    <div class="form-group"><label>Reason</label><input id="xfrev-reason" placeholder="Customer request"></div>
    <button class="btn btn-danger" onclick="reverseTransfer()">Reverse</button>
    <div id="xfrev-result" class="result"></div>
  </div>
</div>
<script>
function createTransfer(){api('POST','/transfers',{transferRef:document.getElementById('xf-ref').value||'TRF-'+Date.now(),type:document.getElementById('xf-type').value||'WALLET_TO_WALLET',sourceType:document.getElementById('xf-src-type').value||'WALLET',sourceId:document.getElementById('xf-from').value,destType:document.getElementById('xf-dst-type').value||'WALLET',destId:document.getElementById('xf-to').value,amount:document.getElementById('xf-amount').value,currency:document.getElementById('xf-cur').value}).then(function(r){showResult('xf-result',r.data,r.ok);if(r.ok)toast('Transfer sent','ok');});}
function loadTransfers(){api('GET','/transfers').then(function(r){var rows=(r.data.data||r.data||[]).slice(0,30).map(function(t){return '<tr><td><code>'+t.transfer_ref+'</code></td><td><code>'+t.source_id+'</code></td><td><code>'+t.dest_id+'</code></td><td>'+t.amount+'</td><td><span class="badge '+(t.status==='completed'?'badge-green':t.status==='pending'?'badge-yellow':'badge-red')+'">'+t.status+'</span></td><td>'+new Date(t.created_at).toLocaleDateString()+'</td></tr>';}).join('');document.getElementById('xfrl-tbody').innerHTML=rows||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">No transfers</td></tr>';});}
function reverseTransfer(){api('POST','/transfers/'+document.getElementById('xfrev-ref').value+'/reverse',{reason:document.getElementById('xfrev-reason').value}).then(function(r){showResult('xfrev-result',r.data,r.ok);if(r.ok)toast('Reversed','ok');});}
document.addEventListener('DOMContentLoaded', function(){initTabs('xfrsvc');refreshHealthBadge('xfr-badge',4005);});
</script>
`);
}

function adminRisk() {
  return page('Risk Service', '/admin/svc/risk', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Risk</div>
  <h1>Risk Service <span id="rsk-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Fraud detection, AML, and risk scoring — port 4006.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="rsksvc" data-t="rsk-eval">Evaluate</div>
  <div class="tab" data-g="rsksvc" data-t="rsk-black">Blacklist</div>
  <div class="tab" data-g="rsksvc" data-t="rsk-review">Review Queue</div>
  <div class="tab" data-g="rsksvc" data-t="rsk-aml">AML</div>
  <div class="tab" data-g="rsksvc" data-t="rsk-ctry">Countries</div>
  <div class="tab" data-g="rsksvc" data-t="rsk-dec">Decisions</div>
</div>
<div id="rsk-eval" class="tab-pane active" data-g="rsksvc">
  <div class="card" style="max-width:500px"><div class="card-title" style="margin-bottom:16px">Risk Evaluate</div>
  <div class="form-row"><div class="form-group"><label>TX ID</label><input id="rsk-txid" class="input-mono" placeholder="TXN-xxxx"></div><div class="form-group"><label>Amount</label><input id="rsk-amt" type="number" step="0.01" placeholder="500.00"></div></div>
  <div class="form-row"><div class="form-group"><label>Merchant</label><input id="rsk-mid" class="input-mono" placeholder="LOUIS-001"></div><div class="form-group"><label>Country</label><input id="rsk-ctry" placeholder="US" maxlength="2"></div></div>
  <button class="btn btn-primary" onclick="evalRsk()">Evaluate</button>
  <div id="rsk-eval-result" class="result"></div></div>
</div>
<div id="rsk-black" class="tab-pane" data-g="rsksvc">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card"><div class="card-title" style="margin-bottom:16px">Add Blacklist</div>
    <div class="form-group"><label>Identifier</label><input id="rb-id" class="input-mono" placeholder="card_xxx"></div>
    <div class="form-group"><label>Type</label><select id="rb-type"><option>card</option><option>ip</option><option>merchant</option><option>account</option></select></div>
    <div class="form-group"><label>Reason</label><input id="rb-reason" placeholder="Fraud confirmed"></div>
    <button class="btn btn-danger" onclick="addRskBlacklist()">Blacklist</button><div id="rb-result" class="result"></div></div>
    <div class="card"><div class="card-header"><div class="card-title">Blacklist</div><button class="btn btn-ghost btn-sm" onclick="loadRskBlacklist()">?</button></div>
    <div class="table-wrap"><table><thead><tr><th>Identifier</th><th>Type</th><th>Reason</th></tr></thead><tbody id="rb-tbody"><tr><td colspan="3" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
  </div>
</div>
<div id="rsk-review" class="tab-pane" data-g="rsksvc">
  <div class="card"><div class="card-header"><div class="card-title">Review Queue</div><button class="btn btn-ghost btn-sm" onclick="loadRskReview()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>TX ID</th><th>Amount</th><th>Score</th><th>Reason</th><th>Status</th></tr></thead><tbody id="rr-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="rsk-aml" class="tab-pane" data-g="rsksvc">
  <div class="card" style="max-width:460px"><div class="card-title" style="margin-bottom:16px">AML Screen</div>
  <div class="form-group"><label>Entity Name</label><input id="aml-n" placeholder="Jane Doe"></div>
  <div class="form-row"><div class="form-group"><label>Type</label><select id="aml-t"><option>person</option><option>company</option></select></div><div class="form-group"><label>Country</label><input id="aml-c" placeholder="US" maxlength="2"></div></div>
  <button class="btn btn-primary" onclick="doAml()">Screen</button><div id="aml-result" class="result"></div></div>
</div>
<div id="rsk-ctry" class="tab-pane" data-g="rsksvc">
  <div class="card"><div class="card-header"><div class="card-title">Country Config</div><button class="btn btn-ghost btn-sm" onclick="loadRskCtry()">?</button></div>
  <div class="table-wrap"><table><thead><tr><th>Country</th><th>Risk Level</th><th>Restricted</th></tr></thead><tbody id="rc-tbody"><tr><td colspan="3" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="rsk-dec" class="tab-pane" data-g="rsksvc">
  <div class="card"><div class="card-header"><div class="card-title">Decisions</div><button class="btn btn-ghost btn-sm" onclick="loadRskDec()">?</button></div>
  <div id="rsk-dec-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<script>
function evalRsk(){api('POST','/risk/evaluate',{transactionId:document.getElementById('rsk-txid').value,amount:parseFloat(document.getElementById('rsk-amt').value),merchantId:document.getElementById('rsk-mid').value,country:document.getElementById('rsk-ctry').value}).then(function(r){showResult('rsk-eval-result',r.data,r.ok);});}
function addRskBlacklist(){api('POST','/risk/blacklist',{identifier:document.getElementById('rb-id').value,type:document.getElementById('rb-type').value,reason:document.getElementById('rb-reason').value}).then(function(r){showResult('rb-result',r.data,r.ok);if(r.ok)toast('Blacklisted','ok');});}
function loadRskBlacklist(){api('GET','/risk/blacklist').then(function(r){var rows=(r.data.data||r.data||[]).map(function(e){return '<tr><td><code>'+e.value+'</code></td><td>'+e.blacklist_type+'</td><td>'+e.reason+'</td></tr>';}).join('');document.getElementById('rb-tbody').innerHTML=rows||'<tr><td colspan="3" style="text-align:center;color:var(--muted)">Empty</td></tr>';});}
function loadRskReview(){api('GET','/risk/review').then(function(r){var rows=(r.data.data||r.data||[]).map(function(e){return '<tr><td><code>'+e.tx_ref+'</code></td><td>'+e.amount+'</td><td>'+e.risk_score+'</td><td>'+e.reason+'</td><td><span class="badge badge-yellow">'+e.status+'</span></td></tr>';}).join('');document.getElementById('rr-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">Empty</td></tr>';});}
function doAml(){api('POST','/risk/aml',{name:document.getElementById('aml-n').value,type:document.getElementById('aml-t').value,country:document.getElementById('aml-c').value}).then(function(r){showResult('aml-result',r.data,r.ok);});}
function loadRskCtry(){api('GET','/risk/countries').then(function(r){var rows=(r.data.data||r.data||[]).map(function(c){return '<tr><td>'+c.country_code+'</td><td><span class='badge '+(c.risk_score>70?'badge-red':c.risk_score>40?'badge-yellow':'badge-green')+'">'+c.risk_score>70?'high':c.risk_score>40?'medium':'low'+'</span></td><td>'+(c.restricted?'Yes':'No')+'</td></tr>';}).join('');document.getElementById('rc-tbody').innerHTML=rows||'<tr><td colspan="3" style="text-align:center;color:var(--muted)">No data</td></tr>';});}
function loadRskDec(){api('GET','/risk/decisions').then(function(r){document.getElementById('rsk-dec-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('rsksvc');refreshHealthBadge('rsk-badge',4006);});
</script>
`);
}

function adminAudit() {
  return page('Audit Service', '/admin/svc/audit', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Audit</div>
  <h1>Audit Service <span id="aud-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>System events and security alerts — port 4007.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="audsvc" data-t="aud-events">Events</div>
  <div class="tab" data-g="audsvc" data-t="aud-alerts">Alerts</div>
  <div class="tab" data-g="audsvc" data-t="aud-log">Log Event</div>
</div>
<div id="aud-events" class="tab-pane active" data-g="audsvc">
  <div class="card"><div class="card-header"><div class="card-title">Audit Events</div><button class="btn btn-ghost btn-sm" onclick="loadAudEvents()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Action</th><th>Actor</th><th>Resource</th><th>Time</th></tr></thead>
  <tbody id="ae-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="aud-alerts" class="tab-pane" data-g="audsvc">
  <div class="card"><div class="card-header"><div class="card-title">Alerts</div><button class="btn btn-ghost btn-sm" onclick="loadAudAlerts()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Severity</th><th>Message</th><th>Status</th><th>Time</th></tr></thead>
  <tbody id="aa-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="aud-log" class="tab-pane" data-g="audsvc">
  <div class="card" style="max-width:500px"><div class="card-title" style="margin-bottom:16px">Log Audit Event</div>
  <div class="form-row"><div class="form-group"><label>Action</label><input id="al-action" placeholder="user.login"></div><div class="form-group"><label>Actor</label><input id="al-actor" placeholder="admin@primestack.io"></div></div>
  <div class="form-group"><label>Resource</label><input id="al-resource" placeholder="/admin/users"></div>
  <div class="form-group"><label>Details (JSON)</label><textarea id="al-details" class="input-mono" rows="3" placeholder='{"ip":"10.0.0.1"}'></textarea></div>
  <button class="btn btn-primary" onclick="logAudEvent()">Log</button><div id="al-result" class="result"></div></div>
</div>
<script>
function loadAudEvents(){api('GET','/audit/events').then(function(r){var rows=(r.data.data||r.data||[]).slice(0,30).map(function(e){return '<tr><td><code>'+e.id+'</code></td><td>'+e.event_type+'</td><td>'+(e.actor_id||e.performed_by||'')+'</td><td>'+(e.resource_type||'')+'</td><td>'+new Date(e.created_at).toLocaleString()+'</td></tr>';}).join('');document.getElementById('ae-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No events</td></tr>';});}
function loadAudAlerts(){api('GET','/audit/alerts').then(function(r){var rows=(r.data.data||r.data||[]).map(function(a){return '<tr><td><code>'+a.id+'</code></td><td><span class="badge '+(a.severity==='critical'?'badge-red':a.severity==='high'?'badge-yellow':'badge-gray')+'">'+a.severity+'</span></td><td>'+(a.description||a.message||'')+'</td><td>'+a.status+'</td><td>'+new Date(a.created_at).toLocaleString()+'</td></tr>';}).join('');document.getElementById('aa-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No alerts</td></tr>';});}
function logAudEvent(){try{var det=JSON.parse(document.getElementById('al-details').value||'{}');api('POST','/audit/events',{actorType:'ADMIN',eventType:document.getElementById('al-action').value,description:document.getElementById('al-action').value,actorId:document.getElementById('al-actor').value,resourceType:document.getElementById('al-resource').value,metadata:det}).then(function(r){showResult('al-result',r.data,r.ok);if(r.ok)toast('Event logged','ok');});}catch(e){showResult('al-result',{error:'JSON: '+e.message},false);}}
document.addEventListener('DOMContentLoaded', function(){initTabs('audsvc');refreshHealthBadge('aud-badge',4007);});
</script>
`);
}

function adminSettlement() {
  return page('Settlement Service', '/admin/svc/settlement', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Settlement</div>
  <h1>Settlement Service <span id="stl-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Batch settlement, reconciliation, and treasury — port 4008.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="stlsvc" data-t="stl-eod">EOD &amp; Net</div>
  <div class="tab" data-g="stlsvc" data-t="stl-batches">Batches</div>
  <div class="tab" data-g="stlsvc" data-t="stl-rev">Reversals</div>
  <div class="tab" data-g="stlsvc" data-t="stl-cb">Chargebacks</div>
  <div class="tab" data-g="stlsvc" data-t="stl-recon">Reconciliation</div>
  <div class="tab" data-g="stlsvc" data-t="stl-treas">Treasury</div>
</div>
<div id="stl-eod" class="tab-pane active" data-g="stlsvc">
  <div class="card" style="max-width:480px"><div class="card-title" style="margin-bottom:16px">EOD Settlement Run</div>
  <div class="form-row"><div class="form-group"><label>Date</label><input id="stl-date" type="date"></div><div class="form-group"><label>Currency</label><select id="stl-cur"><option>USD</option><option>EUR</option><option>GBP</option></select></div></div>
  <div class="form-group"><label>Dry Run</label><select id="stl-dry"><option value="true">Preview only</option><option value="false">Execute</option></select></div>
  <button class="btn btn-primary" onclick="runStlEod()">Run EOD</button><div id="stl-eod-result" class="result"></div></div>
</div>
<div id="stl-batches" class="tab-pane" data-g="stlsvc">
  <div class="card"><div class="card-header"><div class="card-title">Batches</div><button class="btn btn-ghost btn-sm" onclick="loadStlBatches()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Amount</th><th>Count</th><th>Status</th></tr></thead><tbody id="stlb-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="stl-rev" class="tab-pane" data-g="stlsvc">
  <div class="card"><div class="card-header"><div class="card-title">Reversals</div><button class="btn btn-ghost btn-sm" onclick="loadStlReversals()">?</button></div>
  <div id="stl-rev-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="stl-cb" class="tab-pane" data-g="stlsvc">
  <div class="card"><div class="card-header"><div class="card-title">Chargebacks</div><button class="btn btn-ghost btn-sm" onclick="loadStlCb()">?</button></div>
  <div id="stl-cb-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="stl-recon" class="tab-pane" data-g="stlsvc">
  <div class="card"><div class="card-header"><div class="card-title">Reconciliation</div><button class="btn btn-ghost btn-sm" onclick="loadStlRecon()">?</button></div>
  <div id="stl-recon-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="stl-treas" class="tab-pane" data-g="stlsvc">
  <div class="card"><div class="card-header"><div class="card-title">Treasury Positions</div><button class="btn btn-ghost btn-sm" onclick="loadStlTreasury()">?</button></div>
  <div id="stl-treas-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<script>
function runStlEod(){api('POST','/settlement/eod',{date:document.getElementById('stl-date').value,currency:document.getElementById('stl-cur').value,dryRun:document.getElementById('stl-dry').value==='true'}).then(function(r){showResult('stl-eod-result',r.data,r.ok);if(r.ok)toast('EOD complete','ok');});}
function loadStlBatches(){api('GET','/settlement/batches').then(function(r){var rows=(r.data.data||r.data||[]).slice(0,20).map(function(b){return '<tr><td><code>'+b.id+'</code></td><td>'+(b.date||b.createdAt||'')+'</td><td>'+(b.gross_amount||'')+'</td><td>'+(b.item_count||'')+'</td><td><span class="badge '+(b.status==='completed'?'badge-green':b.status==='pending'?'badge-yellow':'badge-gray')+'">'+b.status+'</span></td></tr>';}).join('');document.getElementById('stlb-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No batches</td></tr>';});}
function loadStlReversals(){api('GET','/settlement/reversals').then(function(r){document.getElementById('stl-rev-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadStlCb(){api('GET','/settlement/chargebacks').then(function(r){document.getElementById('stl-cb-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadStlRecon(){api('GET','/settlement/reconciliation').then(function(r){document.getElementById('stl-recon-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadStlTreasury(){api('GET','/settlement/treasury').then(function(r){document.getElementById('stl-treas-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('stlsvc');document.getElementById('stl-date').value=new Date().toISOString().split('T')[0];refreshHealthBadge('stl-badge',4008);});
</script>
`);
}

function adminNotification() {
  return page('Notification Service', '/admin/svc/notification', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Notification</div>
  <h1>Notification Service <span id="notif-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Send notifications, manage webhooks — port 4009.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="notifsvc" data-t="notif-send">Send</div>
  <div class="tab" data-g="notifsvc" data-t="notif-hooks">Webhooks</div>
  <div class="tab" data-g="notifsvc" data-t="notif-hist">History</div>
</div>
<div id="notif-send" class="tab-pane active" data-g="notifsvc">
  <div class="card" style="max-width:500px"><div class="card-title" style="margin-bottom:16px">Send Notification</div>
  <div class="form-row"><div class="form-group"><label>Recipient</label><input id="ns-to" placeholder="user@example.com or +12125551234"></div><div class="form-group"><label>Channel</label><select id="ns-ch"><option>email</option><option>sms</option><option>push</option><option>webhook</option></select></div></div>
  <div class="form-group"><label>Subject / Title</label><input id="ns-subj" placeholder="Payment confirmed"></div>
  <div class="form-group"><label>Message</label><textarea id="ns-msg" rows="3" placeholder="Your payment of $100 has been processed."></textarea></div>
  <button class="btn btn-primary" onclick="sendNotif()">Send</button><div id="ns-result" class="result"></div></div>
</div>
<div id="notif-hooks" class="tab-pane" data-g="notifsvc">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card"><div class="card-title" style="margin-bottom:16px">Register Webhook</div>
    <div class="form-group"><label>URL</label><input id="wh-url" class="input-mono" placeholder="https://your.endpoint.com/hook"></div>
    <div class="form-group"><label>Events</label><input id="wh-events" placeholder="payment.success,payment.failed"></div>
    <div class="form-group"><label>Secret</label><input id="wh-secret" type="password" placeholder="————————"></div>
    <button class="btn btn-primary" onclick="regWebhook()">Register</button><div id="wh-result" class="result"></div></div>
    <div class="card"><div class="card-header"><div class="card-title">Webhooks</div><button class="btn btn-ghost btn-sm" onclick="loadWebhooks()">?</button></div>
    <div id="wh-list-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
  </div>
</div>
<div id="notif-hist" class="tab-pane" data-g="notifsvc">
  <div class="card"><div class="card-header"><div class="card-title">Notification History</div><button class="btn btn-ghost btn-sm" onclick="loadNotifHist()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Channel</th><th>Recipient</th><th>Status</th><th>Time</th></tr></thead>
  <tbody id="nh-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<script>
function sendNotif(){api('POST','/notification/notifications',{to:document.getElementById('ns-to').value,channel:document.getElementById('ns-ch').value,subject:document.getElementById('ns-subj').value,message:document.getElementById('ns-msg').value}).then(function(r){showResult('ns-result',r.data,r.ok);if(r.ok)toast('Sent','ok');});}
function regWebhook(){api('POST','/notification/webhooks',{url:document.getElementById('wh-url').value,events:document.getElementById('wh-events').value.split(','),secret:document.getElementById('wh-secret').value}).then(function(r){showResult('wh-result',r.data,r.ok);if(r.ok)toast('Webhook registered','ok');});}
function loadWebhooks(){api('GET','/notification/webhooks').then(function(r){document.getElementById('wh-list-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadNotifHist(){api('GET','/notification/notifications').then(function(r){var rows=(r.data.data||r.data||[]).slice(0,30).map(function(n){return '<tr><td><code>'+n.id+'</code></td><td>'+n.channel+'</td><td>'+n.recipient+'</td><td><span class="badge '+(n.status==='sent'?'badge-green':n.status==='failed'?'badge-red':'badge-yellow')+'">'+n.status+'</span></td><td>'+new Date(n.created_at).toLocaleString()+'</td></tr>';}).join('');document.getElementById('nh-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No notifications</td></tr>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('notifsvc');refreshHealthBadge('notif-badge',4009);});
</script>
`);
}


function adminSecurity() {
  return page('Security Service', '/admin/svc/security', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Security</div>
  <h1>Security Service <span id="sec-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>HMAC keys, API keys, users, roles, and certificates — port 4011.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="secsvc" data-t="sec-hmac">HMAC Keys</div>
  <div class="tab" data-g="secsvc" data-t="sec-apikeys">API Keys</div>
  <div class="tab" data-g="secsvc" data-t="sec-users">Users</div>
  <div class="tab" data-g="secsvc" data-t="sec-events">Events</div>
  <div class="tab" data-g="secsvc" data-t="sec-certs">Certificates</div>
</div>
<div id="sec-hmac" class="tab-pane active" data-g="secsvc">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card"><div class="card-title" style="margin-bottom:16px">New HMAC Key</div>
    <div class="form-group"><label>Label</label><input id="sh-label" placeholder="Integration key"></div>
    <div class="form-group"><label>Algorithm</label><select id="sh-algo"><option>SHA256</option><option>SHA512</option></select></div>
    <button class="btn btn-primary" onclick="createSecHmac()">Create</button><div id="sh-result" class="result"></div></div>
    <div class="card"><div class="card-header"><div class="card-title">HMAC Keys</div><button class="btn btn-ghost btn-sm" onclick="loadSecHmac()">?</button></div>
    <div class="table-wrap"><table><thead><tr><th>Key ID</th><th>Label</th><th>Algorithm</th><th>Created</th></tr></thead>
    <tbody id="sh-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
  </div>
</div>
<div id="sec-apikeys" class="tab-pane" data-g="secsvc">
  <div class="card"><div class="card-header"><div class="card-title">API Keys</div><button class="btn btn-ghost btn-sm" onclick="loadSecApiKeys()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Key ID</th><th>Name</th><th>Scopes</th><th>Status</th><th>Created</th></tr></thead>
  <tbody id="sak-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="sec-users" class="tab-pane" data-g="secsvc">
  <div class="card"><div class="card-header"><div class="card-title">Users</div><button class="btn btn-ghost btn-sm" onclick="loadSecUsers()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
  <tbody id="su-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="sec-events" class="tab-pane" data-g="secsvc">
  <div class="card"><div class="card-header"><div class="card-title">Security Events</div><button class="btn btn-ghost btn-sm" onclick="loadSecEvents()">${svgIcon("refresh")} Refresh</button></div>
  <div id="se-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="sec-certs" class="tab-pane" data-g="secsvc">
  <div class="card"><div class="card-header"><div class="card-title">Certificates</div><button class="btn btn-ghost btn-sm" onclick="loadSecCerts()">${svgIcon("refresh")} Refresh</button></div>
  <div id="sc-certs-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<script>
function createSecHmac(){api('POST','/security/hmac/keys',{label:document.getElementById('sh-label').value,algorithm:document.getElementById('sh-algo').value}).then(function(r){showResult('sh-result',r.data,r.ok);if(r.ok)toast('Key created','ok');loadSecHmac();});}
function loadSecHmac(){api('GET','/security/hmac/keys').then(function(r){var rows=(r.data.data||r.data||[]).map(function(k){return '<tr><td><code>'+k.client_id||k.clientId+'</code></td><td>'+k.label+'</td><td>'+(k.algorithm||'SHA256')+'</td><td>'+(k.createdAt?new Date(k.createdAt).toLocaleDateString():'')+'</td></tr>';}).join('');document.getElementById('sh-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No keys</td></tr>';});}
function loadSecApiKeys(){api('GET','/security/api-keys').then(function(r){var rows=(r.data.data||r.data||[]).map(function(k){return '<tr><td><code>'+k.id+'</code></td><td>'+k.name+'</td><td>'+(k.scopes||[]).join(', ')+'</td><td><span class="badge '+(k.status==='active'?'badge-green':'badge-gray')+'">'+k.status+'</span></td><td>'+(k.createdAt?new Date(k.createdAt).toLocaleDateString():'')+'</td></tr>';}).join('');document.getElementById('sak-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No API keys</td></tr>';});}
function loadSecUsers(){api('GET','/security/users').then(function(r){var rows=(r.data.data||r.data||[]).map(function(u){return '<tr><td><code>'+u.id+'</code></td><td>'+u.name+'</td><td>'+u.email+'</td><td>'+u.role+'</td><td><span class="badge '+(u.status==='active'?'badge-green':'badge-gray')+'">'+u.status+'</span></td></tr>';}).join('');document.getElementById('su-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No users</td></tr>';});}
function loadSecEvents(){api('GET','/security/events').then(function(r){document.getElementById('se-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadSecCerts(){api('GET','/security/certificates').then(function(r){document.getElementById('sc-certs-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('secsvc');refreshHealthBadge('sec-badge',4011);});
</script>
`);
}

function adminRouting() {
  return page('Routing Service', '/admin/svc/routing', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Routing</div>
  <h1>Routing Service <span id="rt-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Route configuration, connections, rules, and traffic monitoring — port 4012.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="rtsvc" data-t="rt-routes">Routes</div>
  <div class="tab" data-g="rtsvc" data-t="rt-conn">Connections</div>
  <div class="tab" data-g="rtsvc" data-t="rt-rules">Rules</div>
  <div class="tab" data-g="rtsvc" data-t="rt-health">Health</div>
  <div class="tab" data-g="rtsvc" data-t="rt-traffic">Traffic</div>
  <div class="tab" data-g="rtsvc" data-t="rt-log">Log</div>
</div>
<div id="rt-routes" class="tab-pane active" data-g="rtsvc">
  <div class="card"><div class="card-header"><div class="card-title">Routes</div><button class="btn btn-ghost btn-sm" onclick="loadRoutes()">${svgIcon("refresh")} Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>Route ID</th><th>Name</th><th>Target</th><th>Type</th><th>Status</th></tr></thead>
  <tbody id="rt-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="rt-conn" class="tab-pane" data-g="rtsvc">
  <div class="card"><div class="card-header"><div class="card-title">Connections</div><button class="btn btn-ghost btn-sm" onclick="loadConnections()">?</button></div>
  <div id="rt-conn-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="rt-rules" class="tab-pane" data-g="rtsvc">
  <div class="card"><div class="card-header"><div class="card-title">Routing Rules</div><button class="btn btn-ghost btn-sm" onclick="loadRtRules()">?</button></div>
  <div id="rt-rules-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="rt-health" class="tab-pane" data-g="rtsvc">
  <div class="card"><div class="card-header"><div class="card-title">Health Summary</div><button class="btn btn-ghost btn-sm" onclick="loadRtHealth()">?</button></div>
  <div id="rt-health-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="rt-traffic" class="tab-pane" data-g="rtsvc">
  <div class="card"><div class="card-header"><div class="card-title">Traffic</div><button class="btn btn-ghost btn-sm" onclick="loadRtTraffic()">?</button></div>
  <div id="rt-traffic-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="rt-log" class="tab-pane" data-g="rtsvc">
  <div class="card"><div class="card-header"><div class="card-title">Route Log</div><button class="btn btn-ghost btn-sm" onclick="loadRtLog()">?</button></div>
  <div id="rt-log-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<script>
function loadRoutes(){api('GET','/routing/routes').then(function(r){var rows=(r.data.data||r.data||[]).map(function(rt){return '<tr><td><code>'+rt.route_name+'</td><td>'+rt.route_name+'</td><td>'+(rt.destination||'')+'</td><td>'+(rt.type||'')+'</td><td><span class="badge '+(rt.status==='active'?'badge-green':'badge-gray')+'">'+rt.status+'</span></td></tr>';}).join('');document.getElementById('rt-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No routes</td></tr>';});}
function loadConnections(){api('GET','/routing/connections').then(function(r){document.getElementById('rt-conn-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadRtRules(){api('GET','/routing/rules').then(function(r){document.getElementById('rt-rules-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadRtHealth(){api('GET','/routing/health-summary').then(function(r){document.getElementById('rt-health-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadRtTraffic(){api('GET','/routing/traffic').then(function(r){document.getElementById('rt-traffic-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadRtLog(){api('GET','/routing/log').then(function(r){document.getElementById('rt-log-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('rtsvc');refreshHealthBadge('rt-badge',4012);});
</script>
`);
}

function adminIso8583() {
  return page('ISO 8583 Service', '/admin/svc/iso8583', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>ISO 8583</div>
  <h1>ISO 8583 Service <span id="iso-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Parse, build, simulate, and monitor ISO 8583 financial messages — port 4013.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="isosvc" data-t="isosvc-sim">Simulate</div>
  <div class="tab" data-g="isosvc" data-t="isosvc-parse">Parse/Build</div>
  <div class="tab" data-g="isosvc" data-t="isosvc-hosts">Hosts</div>
  <div class="tab" data-g="isosvc" data-t="isosvc-fail">Failover</div>
  <div class="tab" data-g="isosvc" data-t="isosvc-msgs">Messages</div>
  <div class="tab" data-g="isosvc" data-t="isosvc-metrics">Metrics</div>
</div>
<div id="isosvc-sim" class="tab-pane active" data-g="isosvc">
  <div class="card" style="max-width:520px"><div class="card-title" style="margin-bottom:16px">Simulate</div>
  <div class="form-row"><div class="form-group"><label>MTI</label><select id="isos-mti"><option value="0100">0100</option><option value="0200">0200</option><option value="0400">0400</option><option value="0800">0800</option></select></div><div class="form-group"><label>Amount</label><input id="isos-amount" class="input-mono" placeholder="10000"></div></div>
  <div class="form-row"><div class="form-group"><label>PAN</label><input id="isos-pan" class="input-mono" placeholder="4111111111111111"></div><div class="form-group"><label>Terminal</label><input id="isos-tid" class="input-mono" placeholder="TID001"></div></div>
  <button class="btn btn-primary" onclick="isoSimulate()">Simulate</button><div id="isos-result" class="result"></div></div>
</div>
<div id="isosvc-parse" class="tab-pane" data-g="isosvc">
  <div class="grid-2" style="gap:16px;align-items:start">
    <div class="card"><div class="card-title" style="margin-bottom:16px">Parse Message</div>
    <div class="form-group"><label>Hex Input</label><textarea id="isop-hex" class="input-mono" rows="4" placeholder="30323030..."></textarea></div>
    <button class="btn btn-primary" onclick="isoParse()">Parse</button><div id="isop-result" class="result"></div></div>
    <div class="card"><div class="card-title" style="margin-bottom:16px">Build Message</div>
    <div class="form-group"><label>MTI</label><input id="isob-mti" class="input-mono" placeholder="0200" value="0200" maxlength="4"></div>
    <div class="form-group"><label>Fields (JSON)</label><textarea id="isob-fields" class="input-mono" rows="4" placeholder='{"2":"4111111111111111","4":"000000010000"}'></textarea></div>
    <button class="btn btn-primary" onclick="isoBuild()">Build</button><div id="isob-result" class="result"></div></div>
  </div>
</div>
<div id="isosvc-hosts" class="tab-pane" data-g="isosvc">
  <div class="card"><div class="card-header"><div class="card-title">ISO Hosts</div><button class="btn btn-ghost btn-sm" onclick="loadIsoHosts()">?</button></div>
  <div class="table-wrap"><table><thead><tr><th>Host ID</th><th>Name</th><th>Endpoint</th><th>Status</th></tr></thead>
  <tbody id="isoh-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="isosvc-fail" class="tab-pane" data-g="isosvc">
  <div class="card"><div class="card-header"><div class="card-title">Failover Config</div><button class="btn btn-ghost btn-sm" onclick="loadIsoFailover()">?</button></div>
  <div id="isof-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<div id="isosvc-msgs" class="tab-pane" data-g="isosvc">
  <div class="card"><div class="card-header"><div class="card-title">Message Journal</div><button class="btn btn-ghost btn-sm" onclick="loadIsoMsgs()">?</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>MTI</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
  <tbody id="isom-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Click refresh</td></tr></tbody></table></div></div>
</div>
<div id="isosvc-metrics" class="tab-pane" data-g="isosvc">
  <div class="card"><div class="card-header"><div class="card-title">Metrics</div><button class="btn btn-ghost btn-sm" onclick="loadIsoMetrics()">?</button></div>
  <div id="isomet-content" style="color:var(--muted);padding:12px;font-size:.85rem">Click refresh</div></div>
</div>
<script>
function isoSimulate(){api('POST','/iso8583/simulate',{mti:document.getElementById('isos-mti').value,amount:document.getElementById('isos-amount').value,pan:document.getElementById('isos-pan').value,terminalId:document.getElementById('isos-tid').value}).then(function(r){showResult('isos-result',r.data,r.ok);});}
function isoParse(){api('POST','/iso8583/parse',{hex:document.getElementById('isop-hex').value}).then(function(r){showResult('isop-result',r.data,r.ok);});}
function isoBuild(){try{var f=JSON.parse(document.getElementById('isob-fields').value||'{}');api('POST','/iso8583/build',{mti:document.getElementById('isob-mti').value,fields:f}).then(function(r){showResult('isob-result',r.data,r.ok);});}catch(e){showResult('isob-result',{error:'JSON: '+e.message},false);}}
function loadIsoHosts(){api('GET','/iso8583/hosts').then(function(r){var rows=(r.data.data||r.data||[]).map(function(h){return '<tr><td><code>'+h.id+'</code></td><td>'+h.host_name+'</td><td><code>'+(h.hostname+':'+h.port)+'</code></td><td><span class="badge '+(h.status==='active'?'badge-green':'badge-gray')+'">'+h.status+'</span></td></tr>';}).join('');document.getElementById('isoh-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No hosts</td></tr>';});}
function loadIsoFailover(){api('GET','/iso8583/failover').then(function(r){document.getElementById('isof-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
function loadIsoMsgs(){api('GET','/iso8583/messages').then(function(r){var rows=(r.data.data||r.data||[]).slice(0,30).map(function(m){return '<tr><td><code>'+m.id+'</code></td><td><code>'+m.mti+'</code></td><td>'+(m.amount||'')+'</td><td><span class="badge '+(m.status==='approved'?'badge-green':m.status==='declined'?'badge-red':'badge-yellow')+'">'+m.status+'</span></td><td>'+new Date(m.created_at).toLocaleString()+'</td></tr>';}).join('');document.getElementById('isom-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No messages</td></tr>';});}
function loadIsoMetrics(){api('GET','/iso8583/metrics').then(function(r){document.getElementById('isomet-content').innerHTML='<pre style="font-size:.78rem;white-space:pre-wrap">'+JSON.stringify(r.data,null,2)+'</pre>';});}
document.addEventListener('DOMContentLoaded', function(){initTabs('isosvc');refreshHealthBadge('iso-badge',4013);});
</script>
`);
}

function adminGateway() {
  return page('API Gateway', '/admin/svc/gateway', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Gateway</div>
  <h1>API Gateway <span id="gw-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Reverse proxy routing table — port 8080.</p>
</div>
<div class="card" style="margin-bottom:20px">
  <div class="card-title" style="margin-bottom:16px">Proxy Route Table</div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Dashboard Path</th><th>?</th><th>Service</th><th>Port</th><th>Upstream Path</th></tr></thead>
      <tbody>
        <tr><td><code>/api/transactions/*</code></td><td>→</td><td>Switch Core</td><td>4010</td><td><code>/transactions/*</code></td></tr>
        <tr><td><code>/api/acquirers/*</code></td><td>→</td><td>Switch Core</td><td>4010</td><td><code>/acquirers/*</code></td></tr>
        <tr><td><code>/api/routing-rules/*</code></td><td>→</td><td>Switch Core</td><td>4010</td><td><code>/routing/*</code></td></tr>
        <tr><td><code>/api/settlement-queue/*</code></td><td>→</td><td>Switch Core</td><td>4010</td><td><code>/settlement-queue/*</code></td></tr>
        <tr><td><code>/api/wallets/entries</code></td><td>→</td><td>Ledger</td><td>4001</td><td><code>/entries</code></td></tr>
        <tr><td><code>/api/wallets/accounts</code></td><td>→</td><td>Ledger</td><td>4001</td><td><code>/accounts</code></td></tr>
        <tr><td><code>/api/wallets/holds/*</code></td><td>→</td><td>Ledger</td><td>4001</td><td><code>/holds/*</code></td></tr>
        <tr><td><code>/api/transfers/*</code></td><td>→</td><td>Transfer</td><td>4005</td><td><code>/transfers/*</code></td></tr>
        <tr><td><code>/api/crypto/withdraw</code></td><td>→</td><td>Crypto Payout</td><td>4014</td><td><code>/withdraw</code></td></tr>
        <tr><td><code>/api/terminals/*</code></td><td>→</td><td>Terminal</td><td>4004</td><td>strips /terminals prefix for sub-resources</td></tr>
        <tr><td><code>/api/ipwhitelist/*</code></td><td>→</td><td>IP Whitelist</td><td>4002</td><td>strips /ipwhitelist</td></tr>
        <tr><td><code>/api/risk/*</code></td><td>→</td><td>Risk</td><td>4006</td><td>keeps /risk/ prefix</td></tr>
        <tr><td><code>/api/settlement/*</code></td><td>→</td><td>Settlement</td><td>4008</td><td>strips /settlement</td></tr>
        <tr><td><code>/api/security/*</code></td><td>→</td><td>Security</td><td>4011</td><td>strips /security</td></tr>
        <tr><td><code>/api/routing/*</code></td><td>→</td><td>Routing</td><td>4012</td><td>strips /routing</td></tr>
        <tr><td><code>/api/iso8583/*</code></td><td>→</td><td>ISO 8583</td><td>4013</td><td>strips /iso8583</td></tr>
        <tr><td><code>/api/audit/*</code></td><td>→</td><td>Audit</td><td>4007</td><td>strips /audit</td></tr>
        <tr><td><code>/api/notification/*</code></td><td>→</td><td>Notification</td><td>4009</td><td>strips /notification</td></tr>
        <tr><td><code>/api/auth/*</code></td><td>→</td><td>Auth</td><td>4003</td><td>strips /auth</td></tr>
        <tr><td><code>/api/platform/banks/*</code></td><td>→</td><td>Dashboard</td><td>${PORT}</td><td>in-memory bank store</td></tr>
        <tr><td><code>/api/health-all</code></td><td>→</td><td>Dashboard</td><td>${PORT}</td><td>internal health check</td></tr>
      </tbody>
    </table>
  </div>
</div>
<div class="notice notice-info">
  The dashboard server runs on port <strong>${PORT}</strong>. The API Gateway service (port 8080) is a separate upstream proxy. The dashboard proxies all <code>/api/*</code> calls directly to the appropriate microservice, bypassing port 8080.
</div>
<script>
document.addEventListener('DOMContentLoaded', function(){refreshHealthBadge('gw-badge',8080);});
</script>
`);
}

function adminCrypto() {
  return page('Crypto Payout', '/admin/svc/crypto', `
<div class="page-header">
  <div class="breadcrumb"><a href="/platform/monitoring">Monitoring</a><span>/</span>Crypto Payout</div>
  <h1>Crypto Payout <span id="crypto-badge" class="badge badge-gray" style="vertical-align:middle;margin-left:8px"><span class="dot"></span> —</span></h1>
  <p>Signs and broadcasts on-chain TRC-20 transfers, then posts the matching ledger entry — port 4014.</p>
</div>
<div class="card" style="margin-bottom:20px">
  <div class="card-title" style="margin-bottom:12px">Supported Assets</div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Asset</th><th>Networks</th><th>Ledger Account</th></tr></thead>
      <tbody>
        <tr><td><strong>USDT</strong> — Tether USD</td><td><code>TRC20</code></td><td><code>CRYPTO:USDT</code> → <code>CRYPTO:PAYOUT:USDT</code></td></tr>
      </tbody>
    </table>
  </div>
</div>
<div class="card" style="margin-bottom:20px">
  <div class="card-title" style="margin-bottom:12px">Configuration (fail-closed)</div>
  <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">If the signer or provider endpoint is not set, every <code>/withdraw</code> call is rejected with <code>501 NOT_CONFIGURED</code>. There is no simulated fallback.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Variable</th><th>Required</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>TRON_HOT_WALLET_PRIVATE_KEY</code></td><td>Yes</td><td>Signs outgoing TRC-20 transfers</td></tr>
        <tr><td><code>TRON_FULL_HOST</code></td><td>Yes</td><td>TRON node / provider endpoint (e.g. <code>https://api.trongrid.io</code>)</td></tr>
        <tr><td><code>TRON_API_KEY</code></td><td>No</td><td>Provider key, sent as <code>TRON-PRO-API-KEY</code></td></tr>
        <tr><td><code>TRON_USDT_CONTRACT</code></td><td>No</td><td>Override the USDT contract address</td></tr>
        <tr><td><code>LEDGER_SERVICE_URL</code></td><td>No</td><td>Ledger base URL (default <code>http://localhost:4001</code>)</td></tr>
      </tbody>
    </table>
  </div>
</div>
<div class="notice notice-info">
  Withdrawals are external-first: the transfer is broadcast on-chain first, and the ledger debit is only posted after the network returns a transaction hash.
</div>
<script>
document.addEventListener('DOMContentLoaded', function(){refreshHealthBadge('crypto-badge',4014);});
</script>
`);
}

// --- Proxy Logic -------------------------------------------------------------
// Console pages were written against the legacy microservice topology, whose
// paths differ from the single Fastify API we now run. mapApiPath() translates
// the common ones; the default rule strips the /api prefix so genuine API paths
// (e.g. /api/ledger/entries, /api/wallets, /api/s2s/connections) pass through.
const API_ALIASES = {
  '/wallets/entries':     '/ledger/entries',
  '/wallets/accounts':    '/ledger/accounts',
  '/wallets/list':        '/wallets',
  '/accounts':            '/ledger/accounts',
  '/entries':             '/ledger/entries',
  '/holds':               '/wallet-holds',
  '/routing-rules':       '/routes',
  '/routing':             '/routes',
  '/auth/keys':           '/network/api-keys',
  '/security/hmac/keys':  '/network/hmac-keys',
  '/security/api-keys':   '/network/api-keys',
  '/security/users':      '/admin/users',
  '/ipwhitelist/entries': '/network/ip-whitelist',
  '/ipwhitelist':         '/network/ip-whitelist',
  '/audit/events':        '/admin/audit-logs',
  '/audit':               '/admin/audit-logs',
  '/risk/evaluate':       '/fraud/evaluate',
  '/risk/blacklist':      '/fraud/blacklist',
  '/risk/rules':          '/fraud/rules',
  '/risk/dashboard':      '/fraud/risk-scores',
  '/risk/review':         '/fraud/risk-scores',
  '/risk/countries':      '/fraud/rules',
  '/banks/receivers':     '/ledger/accounts',
};

function mapApiPath(reqPath) {
  const p = reqPath.split('?')[0];
  const qs = reqPath.includes('?') ? '?' + reqPath.split('?').slice(1).join('?') : '';
  const rest = p.startsWith('/api') ? (p.slice(4) || '/') : p;

  if (API_ALIASES[rest]) return API_ALIASES[rest] + qs;

  if (rest.startsWith('/wallets/holds/')) {
    return '/wallet-holds/' + rest.slice('/wallets/holds/'.length) + qs;
  }
  const bal = rest.match(/^\/wallets\/([^/]+)\/balance$/);
  if (bal) return '/ledger/accounts/' + bal[1] + '/balance' + qs;
  if (rest.startsWith('/wallets/')) {
    const sub = rest.slice('/wallets'.length);
    if (sub === '/entries' || sub.startsWith('/entries/')) {
      return '/ledger/entries' + sub.slice('/entries'.length) + qs;
    }
    if (sub === '/accounts' || sub.startsWith('/accounts/')) {
      return '/ledger/accounts' + sub.slice('/accounts'.length) + qs;
    }
    return sub + qs; // /wallets, /wallets/:address, ...
  }
  if (rest.startsWith('/risk/'))         return '/fraud/' + rest.slice('/risk/'.length) + qs;
  if (rest.startsWith('/ipwhitelist/'))  return '/network/ip-whitelist/' + rest.slice('/ipwhitelist/'.length) + qs;
  if (rest.startsWith('/security/'))     return '/network/' + rest.slice('/security/'.length) + qs;
  if (rest.startsWith('/auth/'))         return '/network/' + rest.slice('/auth/'.length) + qs;
  if (rest.startsWith('/notification/')) return '/notifications/' + rest.slice('/notification/'.length) + qs;
  if (rest.startsWith('/audit/'))        return '/admin/audit-logs' + qs;
  if (rest.startsWith('/banks/'))        return '/ledger/accounts' + qs;
  if (rest.startsWith('/terminals/merchants')) return '/merchants/overview' + qs;

  return rest + qs;
}

// Resolve an /api/* request to { origin, path } on the upstream API.
function resolveProxy(reqPath) {
  return { origin: API_ORIGIN, path: mapApiPath(reqPath) };
}

// --- Operator Session --------------------------------------------------------
// The console hosts a sign-in gate that reuses the API's /admin/login. The JWT it
// returns is stored in an HttpOnly cookie and replayed to the API as a bearer
// token, so /admin/* routes (which skip HMAC) authenticate as the operator.
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function base64UrlToBuffer(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64');
}

// Minimal HS256 verification — the session only ever holds a token we issued.
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest();
  const actual = base64UrlToBuffer(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let claims;
  try { claims = JSON.parse(base64UrlToBuffer(payload).toString('utf8')); } catch { return null; }
  if (claims.exp && Date.now() >= claims.exp * 1000) return null;
  return claims;
}

function readSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const claims = verifySessionToken(token);
  return claims ? { token, claims } : null;
}

function sessionCookie(token) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function signRequest(keyId, timestamp, rawBody) {
  return createHmac('sha256', CONSOLE_HMAC_SECRET).update(`${keyId}${timestamp}${rawBody}`).digest('hex');
}

// Proxy a console request to the upstream API, signing it so the closed-by-default
// API accepts it, and forwarding the operator session for /admin/* routes.
function proxyRequest(req, res, targetOrigin, targetPath) {
  const base = new URL(targetOrigin);
  const useTls = base.protocol === 'https:';

  const headers = { ...req.headers };
  delete headers['content-length']; // recomputed from the normalised body below
  delete headers['cookie'];         // console-internal cookie is not for the API
  headers.host = base.host;

  const session = readSession(req);
  if (session) headers.authorization = `Bearer ${session.token}`;

  const body = [];
  req.on('data', c => body.push(c));
  req.on('end', () => {
    let payload = Buffer.concat(body);

    // Re-serialise JSON so our signature matches the API's own JSON.stringify(body).
    if (payload.length > 0 && /application\/json/i.test(headers['content-type'] || '')) {
      try { payload = Buffer.from(JSON.stringify(JSON.parse(payload.toString('utf8'))), 'utf8'); } catch { /* not JSON */ }
    }

    // The API contract is a millisecond epoch (see src/plugins/auth.ts).
    const timestamp = String(Date.now());
    headers[`${HMAC_HEADER_PREFIX}-key-id`] = CONSOLE_HMAC_KEY_ID;
    headers[`${HMAC_HEADER_PREFIX}-timestamp`] = timestamp;
    headers[`${HMAC_HEADER_PREFIX}-signature`] =
      signRequest(CONSOLE_HMAC_KEY_ID, timestamp, payload.length > 0 ? payload.toString('utf8') : '');
    if (payload.length > 0) headers['content-length'] = payload.length;

    const options = {
      hostname: base.hostname,
      port: base.port || (useTls ? 443 : 80),
      path: targetPath,
      method: req.method,
      headers,
    };

    const proxy = (useTls ? httpsRequest : httpRequest)(options, (upstream) => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    });

    proxy.on('error', (err) => {
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service unavailable', origin: targetOrigin, detail: err.message }));
    });

    if (payload.length > 0) proxy.write(payload);
    proxy.end();
  });
}

// --- Health Check All Services -----------------------------------------------
// All console service panels now share a single upstream API, so probe it once
// and report the same status under every legacy service port.
function checkAllHealth() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const responseMs = () => Date.now() - startedAt;
    const base = new URL(API_ORIGIN);
    const useTls = base.protocol === 'https:';
    const finish = (ok) => {
      const services = {};
      Object.entries(SVC).forEach(([name, port]) => {
        services[`port_${port}`] = { name, ok, responseMs: responseMs() };
      });
      resolve({ ok, services });
    };
    const req = (useTls ? httpsRequest : httpRequest)(
      {
        hostname: base.hostname,
        port: base.port || (useTls ? 443 : 80),
        path: '/health',
        method: 'GET',
        headers: { host: base.host },
      },
      (r) => { finish(r.statusCode < 400); r.resume(); }
    );
    req.setTimeout(5000, () => { req.destroy(); finish(false); });
    req.on('error', () => finish(false));
    req.end();
  });
}

// --- In-memory bank CRUD -----------------------------------------------------
function handleBankApi(req, res) {
  const p = req.url.split('?')[0];
  const parts = p.split('/').filter(Boolean); // ['api','platform','banks', ...]
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };

  if (req.method === 'GET' && parts.length === 3) {
    // GET /api/platform/banks
    json(200, { banks: banks.map(({ id, name, bic, currency, connectionType, status }) => ({ id, name, bic, currency, connectionType, status })) });
    return;
  }
  if (req.method === 'POST' && parts.length === 3) {
    // POST /api/platform/banks
    const body = [];
    let bodyLength = 0;
    let tooLarge = false;
    req.on('end', () => {
      if (tooLarge) {
        json(413, { error: 'Bank record is too large' });
        return;
      }
      try {
        const data = JSON.parse(Buffer.concat(body).toString('utf8') || '{}');
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          json(400, { error: 'Bank record must be a JSON object' });
          return;
        }
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        const bic = typeof data.bic === 'string' ? data.bic.trim().toUpperCase() : '';
        const currency = typeof data.currency === 'string' ? data.currency.trim().toUpperCase() : '';
        const connectionType = data.connectionType;
        if (!name || name.length > 100) {
          json(400, { error: 'Bank name is required and must be at most 100 characters' });
          return;
        }
        if (bic && !/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/.test(bic)) {
          json(400, { error: 'BIC/SWIFT must be 8 or 11 letters and digits' });
          return;
        }
        if (!/^[A-Z]{3}$/.test(currency)) {
          json(400, { error: 'Currency must be a 3-letter code' });
          return;
        }
        if (!['ACH', 'SWIFT', 'SEPA', 'API'].includes(connectionType)) {
          json(400, { error: 'Unsupported bank connection type' });
          return;
        }
        if (bic && banks.some(bank => bank.bic === bic)) {
          json(409, { error: 'A bank record with this BIC/SWIFT already exists' });
          return;
        }
        const bank = { id: 'bnk_' + randomUUID(), name, bic, currency, connectionType, status: 'active' };
        banks.push(bank);
        json(201, { bank });
      } catch {
        json(400, { error: 'Invalid bank record JSON' });
      }
    });
    req.on('data', c => {
      if (bodyLength + c.length > 16384) {
        tooLarge = true;
      } else if (!tooLarge) {
        body.push(c);
        bodyLength += c.length;
      }
    });
    return;
  }
  if (req.method === 'DELETE' && parts.length === 4) {
    // DELETE /api/platform/banks/:id
    const id = parts[3];
    const idx = banks.findIndex(b => b.id === id);
    if (idx === -1) {
      json(404, { error: 'Bank record not found' });
    } else {
      banks.splice(idx, 1);
      json(200, { ok: true });
    }
    return;
  }
  if (req.method === 'POST' && parts.length === 5 && parts[4] === 'test') {
    const id = parts[3];
    const bank = banks.find(b => b.id === id);
    if (!bank) {
      json(404, { error: 'Bank record not found' });
    } else {
      json(200, {
        ok: false,
        testPerformed: false,
        bank: bank.name,
        message: 'Live connectivity test initiated. Verify the bank host, port, and credentials in Bank Connections settings.',
      });
    }
    return;
  }
  json(404, { error: 'Bank API route not found' });
}

// --- Server Funds Page -------------------------------------------------------
﻿function s2sEnginePage() {
  return page('S2S Engine', '/platform/s2s-engine', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>S2S Engine</div>
  <h1>S2S Engine</h1>
  <p>Server-to-Server Payments — Receive live funds, manage connections, withdraw to bank accounts.</p>
</div>
<div class="tabs">
  <div class="tab active" data-g="s2e" data-t="s2e-conns">Connections</div>
  <div class="tab" data-g="s2e" data-t="s2e-pays">Payments</div>
  <div class="tab" data-g="s2e" data-t="s2e-wds">Withdrawals</div>
  <div class="tab" data-g="s2e" data-t="s2e-tpls">Templates</div>
  <div class="tab" data-g="s2e" data-t="s2e-new">+ New Connection</div>
</div>
<div id="s2e-conns" class="tab-pane active" data-g="s2e">
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
    <div class="stat-card"><div class="stat-label">Connections</div><div class="stat-value" id="s2e-n-conn">-</div></div>
    <div class="stat-card"><div class="stat-label">Payments</div><div class="stat-value" id="s2e-n-pay">-</div></div>
    <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value" id="s2e-n-done">-</div></div>
    <div class="stat-card"><div class="stat-label">Withdrawals</div><div class="stat-value" id="s2e-n-wd">-</div></div>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div class="card-title">Active Connections</div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="s2e-status" style="font-size:.75rem;color:var(--muted)">Not loaded</span>
        <button class="btn btn-primary btn-sm" onclick="s2eLoad()">Refresh</button>
      </div>
    </div>
    <div style="overflow-x:auto" id="s2e-conn-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:.78rem">
        <thead><tr style="background:var(--surf2)">
          <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Name</th>
          <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Endpoint</th>
          <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Status</th>
          <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Currencies</th>
          <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Daily Limit</th>
          <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Actions</th>
        </tr></thead>
        <tbody id="s2e-conn-body"><tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">Click Refresh to load</td></tr></tbody>
      </table>
    </div>
  </div>
</div>
<div id="s2e-pays" class="tab-pane" data-g="s2e">
  <div class="card"><div class="card-title" style="margin-bottom:12px">Incoming Payments</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead><tr style="background:var(--surf2)">
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Reference</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Amount</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Currency</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Sender Ref</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Wallet</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Status</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Journal</th>
      </tr></thead>
      <tbody id="s2e-pay-body"><tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">Click Refresh on Connections tab</td></tr></tbody>
    </table></div>
  </div>
</div>
<div id="s2e-wds" class="tab-pane" data-g="s2e">
  <div class="card" style="margin-bottom:16px"><div class="card-title" style="margin-bottom:12px">Bank Withdrawals</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead><tr style="background:var(--surf2)">
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Reference</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Amount</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Currency</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Bank</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Account Holder</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Status</th>
        <th style="padding:8px;text-align:left;color:var(--muted);font-size:.65rem;text-transform:uppercase;border-bottom:1px solid var(--border)">Action</th>
      </tr></thead>
      <tbody id="s2e-wd-body"><tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">Click Refresh on Connections tab</td></tr></tbody>
    </table></div>
  </div>
  <div class="card"><div class="card-title" style="margin-bottom:16px">Submit New Withdrawal</div>
    <div class="form-row">
      <div class="form-group"><label>Connection ID</label><input id="s2e-wd-conn" class="input-mono" placeholder="Connection UUID"></div>
      <div class="form-group"><label>Wallet Address</label><input id="s2e-wd-wallet" class="input-mono" placeholder="WALLET-MERCHANT-001-INR"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount</label><input id="s2e-wd-amount" type="number" step="0.01" placeholder="5000.00"></div>
      <div class="form-group"><label>Currency</label><select id="s2e-wd-cur"><option>INR</option><option>USD</option><option>EUR</option><option>SGD</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Bank Name</label><input id="s2e-wd-bank" placeholder="ICICI Bank"></div>
      <div class="form-group"><label>Country</label><input id="s2e-wd-country" placeholder="IN" maxlength="2"></div>
    </div>
    <div class="form-group"><label>Account Holder</label><input id="s2e-wd-holder" placeholder="M/S.UNITED SOLAR AND WIND POWER TECHNOLOGIES"></div>
    <div class="form-row">
      <div class="form-group"><label>Account Number</label><input id="s2e-wd-acct" class="input-mono" placeholder="029905003783"></div>
      <div class="form-group"><label>SWIFT / BIC</label><input id="s2e-wd-swift" class="input-mono" placeholder="ICICINBBCTS"></div>
    </div>
    <button class="btn btn-primary" onclick="s2eSubmitWd()">Submit Withdrawal</button>
    <div id="s2e-wd-result" class="result"></div>
  </div>
</div>
<div id="s2e-tpls" class="tab-pane" data-g="s2e">
  <div class="card"><div class="card-title" style="margin-bottom:12px">Receipt Templates</div>
    <div id="s2e-tpl-body" style="color:var(--muted);padding:16px">Click Refresh on Connections tab to load.</div>
  </div>
</div>
<div id="s2e-new" class="tab-pane" data-g="s2e">
  <div class="card" style="max-width:580px">
    <div class="card-title" style="margin-bottom:8px">Register New S2S Connection</div>
    <p style="font-size:.82rem;color:var(--muted);margin-bottom:16px">API secret is AES-256-GCM encrypted before storage.</p>
    <div class="form-group"><label>Name</label><input id="s2e-nc-name" placeholder="ICICI EazyPay Incoming"></div>
    <div class="form-group"><label>Endpoint URL (HTTPS)</label><input id="s2e-nc-url" class="input-mono" placeholder="https://payments.server.com/api"></div>
    <div class="form-group"><label>Shared API Secret (min 16 chars)</label><input id="s2e-nc-secret" type="password"></div>
    <div class="form-row">
      <div class="form-group"><label>Currencies</label><input id="s2e-nc-currs" value="INR"></div>
      <div class="form-group"><label>Allowed IPs</label><input id="s2e-nc-ips" placeholder="203.0.113.10"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Daily Limit</label><input id="s2e-nc-daily" type="number" placeholder="50000"></div>
      <div class="form-group"><label>Single-Tx Limit</label><input id="s2e-nc-single" type="number" placeholder="10000"></div>
    </div>
    <button class="btn btn-success" onclick="s2eCreate()">Create Connection</button>
    <div id="s2e-nc-result" class="result"></div>
  </div>
</div>
<script>
// Calls go through the console's /api proxy, which signs each request with the
// operator's console HMAC key — the browser never holds an API secret.
const _S2E={BASE:'/api'};
async function _s2eGet(p){const r=await fetch(_S2E.BASE+p,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error(r.status);return r.json();}
async function _s2ePost(p,d){const b=JSON.stringify(d),r=await fetch(_S2E.BASE+p,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:b,signal:AbortSignal.timeout(8000)});return{ok:r.ok,data:await r.json()};}
async function _s2ePatch(p,d){const b=JSON.stringify(d),r=await fetch(_S2E.BASE+p,{method:'PATCH',headers:{'Content-Type':'application/json','Accept':'application/json'},body:b,signal:AbortSignal.timeout(8000)});return{ok:r.ok,data:await r.json()};}
function _s2eBadge(s){const m={ACTIVE:'success',COMPLETED:'success',SUBMITTED:'info',AUTHENTICATED:'info',PENDING:'warn',PROCESSING:'warn',TESTING:'warn',FAILED:'danger',CANCELLED:'danger',INACTIVE:'danger',SUSPENDED:'danger',REVERSED:'warn'};return '<span class="badge badge-'+(m[s]||'warn')+'">'+s+'</span>';}
function _s2eEmpty(n,msg){return '<tr><td colspan="'+n+'" style="text-align:center;padding:20px;color:var(--muted)">'+msg+'</td></tr>';}
async function s2eLoad(){
  const st=document.getElementById('s2e-status');st.textContent='Loading...';
  try{
    const[cR,pR,wR,tR]=await Promise.all([_s2eGet('/s2s/connections?pageSize=50').catch(()=>({data:[],meta:{total:0}})),_s2eGet('/s2s/payments?pageSize=20').catch(()=>({data:[],meta:{total:0}})),_s2eGet('/s2s/withdrawals?pageSize=20').catch(()=>({data:[],meta:{total:0}})),_s2eGet('/s2s/receipt-templates').catch(()=>({data:[]}))]);
    const[cs,ps,ws,ts2]=[cR.data||[],pR.data||[],wR.data||[],tR.data||[]];
    document.getElementById('s2e-n-conn').textContent=cR.meta?.total??cs.length;
    document.getElementById('s2e-n-pay').textContent=pR.meta?.total??ps.length;
    document.getElementById('s2e-n-done').textContent=ps.filter(p=>p.status==='COMPLETED').length;
    document.getElementById('s2e-n-wd').textContent=wR.meta?.total??ws.length;
    document.getElementById('s2e-conn-body').innerHTML=cs.length?cs.map(c=>'<tr><td style="padding:8px"><strong>'+c.name+'</strong></td><td style="padding:8px;font-size:.68rem;color:var(--muted)">'+(c.endpointUrl||'').slice(0,35)+'</td><td style="padding:8px">'+_s2eBadge(c.status)+'</td><td style="padding:8px">'+(c.supportedCurrencies||[]).join(', ')+'</td><td style="padding:8px">'+(c.dailyLimitAmount?Number(c.dailyLimitAmount).toLocaleString():'no limit')+'</td><td style="padding:8px"><button class="btn btn-ghost btn-sm" onclick="_s2ePingById(this)" data-id="'+c.id+'">Ping</button> <button class="btn btn-warn btn-sm" onclick="_s2eRotateById(this)" data-id="'+c.id+'">Rotate Key</button></td></tr>').join(''):_s2eEmpty(6,'No connections yet. Click New Connection tab.');
    document.getElementById('s2e-pay-body').innerHTML=ps.length?ps.map(p=>'<tr><td style="padding:8px;font-family:monospace;font-size:.68rem">'+p.reference+'</td><td style="padding:8px;font-weight:600">'+Number(p.amount||0).toFixed(2)+'</td><td style="padding:8px">'+p.currency+'</td><td style="padding:8px;color:var(--muted);font-size:.68rem">'+(p.senderReference||'-')+'</td><td style="padding:8px;font-size:.65rem">'+p.receiverWalletAddr+'</td><td style="padding:8px">'+_s2eBadge(p.status)+'</td><td style="padding:8px;font-family:monospace;font-size:.62rem;color:var(--muted)">'+(p.journalEntryRef||'-').slice(0,18)+'</td></tr>').join(''):_s2eEmpty(7,'No payments received yet.');
    document.getElementById('s2e-wd-body').innerHTML=ws.length?ws.map(w=>'<tr><td style="padding:8px;font-family:monospace;font-size:.68rem">'+w.reference+'</td><td style="padding:8px;font-weight:600">'+Number(w.amount||0).toFixed(2)+'</td><td style="padding:8px">'+w.currency+'</td><td style="padding:8px">'+w.bankName+'</td><td style="padding:8px;font-size:.68rem">'+w.accountHolderName+'</td><td style="padding:8px">'+_s2eBadge(w.status)+'</td><td style="padding:8px">'+(['SUBMITTED','PROCESSING'].includes(w.status)?'<button class="btn btn-success btn-sm" onclick="_s2eDoneById(this)" data-id="'+w.id+'">Mark Done</button>':'-')+'</td></tr>').join(''):_s2eEmpty(7,'No withdrawals yet.');
    document.getElementById('s2e-tpl-body').innerHTML=ts2.length?ts2.map(t=>'<div style="padding:10px;border-bottom:1px solid var(--border)"><strong>'+t.name+'</strong> '+(t.isDefault?_s2eBadge('ACTIVE'):'')+' <span style="font-size:.78rem;color:var(--muted)">'+(t.description||'-')+' - '+new Date(t.createdAt).toLocaleDateString()+'</span></div>').join(''):'<div style="padding:16px;color:var(--muted)">No templates.</div>';
    st.textContent='Updated '+new Date().toLocaleTimeString();toast('S2S data loaded','ok');
  }catch(e){st.textContent='Error: '+e.message;toast('Could not reach the API: '+e.message,'err');}
}
async function _s2ePingById(btn){const id=btn.dataset.id;try{const r=await fetch(_S2E.BASE+'/s2s/connections/'+id+'/ping',{method:'POST',signal:AbortSignal.timeout(12000)});const d=(await r.json()).data||{};toast('Ping: '+(d.reachable?'ONLINE':'OFFLINE')+' '+d.latencyMs+'ms',d.reachable?'ok':'err');}catch(e){toast('Ping failed','err');}}
async function _s2eRotateById(btn){const id=btn.dataset.id,s=prompt('New secret (min 16 chars):');if(!s||s.length<16)return;const r=await _s2ePost('/s2s/connections/'+id+'/rotate-secret',{newSecret:s});if(r.ok)toast('Secret rotated. Update sender now.','ok');else toast('Error','err');}
async function _s2eDoneById(btn){const id=btn.dataset.id;if(!confirm('Mark COMPLETED?'))return;const r=await _s2ePatch('/s2s/withdrawals/'+id+'/status',{status:'COMPLETED'});if(r.ok){toast('Marked COMPLETED','ok');s2eLoad();}else toast('Error','err');}
async function s2eSubmitWd(){const p={connectionId:document.getElementById('s2e-wd-conn').value,walletAddress:document.getElementById('s2e-wd-wallet').value,amount:document.getElementById('s2e-wd-amount').value,currency:document.getElementById('s2e-wd-cur').value,bankName:document.getElementById('s2e-wd-bank').value,bankCountry:document.getElementById('s2e-wd-country').value.toUpperCase(),accountHolderName:document.getElementById('s2e-wd-holder').value,accountNumber:document.getElementById('s2e-wd-acct').value,swiftBic:document.getElementById('s2e-wd-swift').value||undefined};const r=await _s2ePost('/s2s/withdrawals',p);showResult('s2e-wd-result',r.data,r.ok);if(r.ok){toast('Withdrawal: '+r.data.data?.reference,'ok');s2eLoad();}}
async function s2eCreate(){const sec=document.getElementById('s2e-nc-secret').value;if(!sec||sec.length<16){toast('Secret must be 16+ chars','err');return;}const url=document.getElementById('s2e-nc-url').value;if(!url.startsWith('https://')){toast('URL must use HTTPS','err');return;}const p={name:document.getElementById('s2e-nc-name').value,endpointUrl:url,apiSecret:sec,apiKeyHeader:'x-api-key',supportedCurrencies:document.getElementById('s2e-nc-currs').value.split(',').map(c=>c.trim().toUpperCase()).filter(Boolean),allowedIps:document.getElementById('s2e-nc-ips').value?document.getElementById('s2e-nc-ips').value.split(',').map(s=>s.trim()).filter(Boolean):[],dailyLimitAmount:document.getElementById('s2e-nc-daily').value||undefined,singleTxLimitAmount:document.getElementById('s2e-nc-single').value||undefined};const r=await _s2ePost('/s2s/connections',p);showResult('s2e-nc-result',r.data,r.ok);if(r.ok){toast('Created: '+r.data.data?.id,'ok');s2eLoad();}}
document.addEventListener('DOMContentLoaded',function(){initTabs('s2e');s2eLoad();});
</script>
`);
}

function serverFundsPage() {
  return page('Server Funds', '/platform/server-funds', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Server Funds</div>
  <h1>Server Funds</h1>
  <p>Load real funds from global networks, Visa, and M1 servers directly into the platform ledger. Every transaction creates an immutable double-entry record with full audit trail.</p>
</div>

<!-- Live balances -->
<div class="stat-row" style="margin-bottom:20px">
  <div class="stat" style="border-color:var(--accent-border);background:var(--accent-bg)">
    <div class="stat-val" id="sf-bal-reserve" style="color:var(--accent)">…</div>
    <div class="stat-lbl">Platform Reserve</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="sf-bal-incoming" style="color:var(--success)">…</div>
    <div class="stat-lbl">Incoming Pool</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="sf-bal-global" style="color:#7c3aed">…</div>
    <div class="stat-lbl">Global Server</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="sf-bal-visa" style="color:#1d4ed8">…</div>
    <div class="stat-lbl">Visa Clearing</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="sf-bal-m1" style="color:#0891b2">…</div>
    <div class="stat-lbl">M1 Server</div>
  </div>
  <div style="display:flex;align-items:center">
    <button class="btn btn-ghost btn-sm" onclick="sfRefreshAll()">↻ Refresh All</button>
  </div>
</div>

<!-- Server fund source tabs -->
<div class="tabs">
  <div class="tab active"   data-g="sf" data-t="sf-global">🌐 Global Server</div>
  <div class="tab"          data-g="sf" data-t="sf-visa">💳 Visa Server Funds</div>
  <div class="tab"          data-g="sf" data-t="sf-m1">🏦 M1 Server</div>
  <div class="tab"          data-g="sf" data-t="sf-m1funds">💰 M1 Funds</div>
  <div class="tab"          data-g="sf" data-t="sf-globalbal">📊 Global Server Balance</div>
  <div class="tab"          data-g="sf" data-t="sf-history">📋 History</div>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗
     ║  TAB 1 — GLOBAL SERVER                                  ║
     ╚══════════════════════════════════════════════════════════╝ -->
<div id="sf-global" class="tab-pane active" data-g="sf">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:4px">🌐 Global Server Fund Load</div>
    <div class="card-sub" style="margin-bottom:16px">Load funds from the global settlement server into your platform reserve. Requires Global Server credentials.</div>

    <div class="form-row">
      <div class="form-group"><label>Amount *</label><input id="gs-amount" type="number" placeholder="500000.00" step="0.01"></div>
      <div class="form-group"><label>Currency *</label>
        <select id="gs-currency">
          <option value="USD">USD — US Dollar</option>
          <option value="EUR">EUR — Euro</option>
          <option value="GBP">GBP — British Pound</option>
          <option value="AED">AED — UAE Dirham</option>
          <option value="NGN">NGN — Nigerian Naira</option>
          <option value="KES">KES — Kenyan Shilling</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Global Server Host *</label><input id="gs-host" class="input-mono" placeholder="global.switch.primestack.io" value="global.switch.primestack.io"></div>
      <div class="form-group"><label>Server Port</label><input id="gs-port" type="number" placeholder="9443" value="9443"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Server ID / Node ID *</label><input id="gs-node" class="input-mono" placeholder="GSN-001"></div>
      <div class="form-group"><label>Auth Token / API Key *</label><input id="gs-token" type="password" placeholder="gsk_live_…"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Source Account (Global)</label><input id="gs-src-acct" class="input-mono" placeholder="GLOBAL:RESERVE:USD"></div>
      <div class="form-group"><label>Destination (Platform)</label>
        <select id="gs-dest">
          <option value="PLATFORM:RESERVE:USD">PLATFORM:RESERVE:USD — Main Reserve</option>
          <option value="BANK:INCOMING:USD">BANK:INCOMING:USD — Incoming Pool</option>
          <option value="PLATFORM:OPS:USD">PLATFORM:OPS:USD — Ops Float</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Global Reference / Tx ID *</label><input id="gs-ref" class="input-mono" placeholder="GS-TXN-2026-001"></div>
      <div class="form-group"><label>Settlement Date</label><input id="gs-date" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>

    <div class="form-group"><label>Authorized By *</label><input id="gs-auth" placeholder="Name of authorizing officer"></div>
    <div class="form-group"><label>Memo / Notes</label><input id="gs-notes" placeholder="Monthly settlement top-up, clearing funds…"></div>

    <div id="gs-preview" style="display:none;margin:12px 0;padding:12px;background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;font-size:.78rem">
      <strong style="color:var(--success)">Ledger Preview</strong>
      <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>DEBIT: <code id="gs-prev-debit">GLOBAL:SERVER:INCOMING</code></div>
        <div>CREDIT: <code id="gs-prev-credit">PLATFORM:RESERVE:USD</code></div>
      </div>
    </div>

    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px" onclick="sfGlobalLoad()">
      🌐 Load from Global Server
    </button>
    <div id="gs-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-title">How Global Server Loading Works</div>
    <div style="font-size:.82rem;line-height:2.2;margin-bottom:16px">
      <div>1. Enter Global Server credentials and amount</div>
      <div>2. Platform creates a DEBIT on <code>GLOBAL:SERVER:INCOMING</code></div>
      <div>3. Platform creates a CREDIT on <code>PLATFORM:RESERVE:USD</code></div>
      <div>4. Immutable ledger entry posted with reference</div>
      <div>5. Audit event logged with officer name</div>
      <div>6. Balance visible immediately in platform reserve</div>
      <div>7. Funds available for merchant payouts and settlements</div>
    </div>
    <div style="padding:12px;background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:8px;font-size:.78rem;color:var(--accent)">
      <strong>Network:</strong> PrimeStack Global Settlement Network (PGSN)<br>
      <strong>Protocol:</strong> TLS 1.3 over port 9443<br>
      <strong>Settlement:</strong> Real-time gross settlement (RTGS)<br>
      <strong>Auth:</strong> API key + IP whitelist
    </div>
    <div style="margin-top:12px">
      <div class="card-sub" style="margin-bottom:8px">Quick Amounts</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${[50000,100000,250000,500000,1000000,5000000].map(n => `<button class="btn btn-ghost btn-sm" onclick="document.getElementById('gs-amount').value=${n};sfPreview('gs')">${n>=1000000?'$'+(n/1000000)+'M':'$'+n.toLocaleString()}</button>`).join('')}
      </div>
    </div>
  </div>
</div>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗
     ║  TAB 2 — VISA SERVER FUNDS                              ║
     ╚══════════════════════════════════════════════════════════╝ -->
<div id="sf-visa" class="tab-pane" data-g="sf">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:4px">💳 Visa Server Fund Load</div>
    <div class="card-sub" style="margin-bottom:16px">Receive clearing and settlement funds from the Visa network. Requires Visa Settlement Service (VSS) credentials.</div>

    <div class="form-row">
      <div class="form-group"><label>Amount *</label><input id="vs-amount" type="number" placeholder="250000.00" step="0.01" oninput="sfPreview('vs')"></div>
      <div class="form-group"><label>Currency *</label>
        <select id="vs-currency">
          <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AED">AED</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Visa Settlement Type *</label>
        <select id="vs-type">
          <option value="CLEARING">Clearing Settlement</option>
          <option value="INTERCHANGE">Interchange Fee Settlement</option>
          <option value="CHARGEBACK">Chargeback Settlement</option>
          <option value="REVERSAL">Reversal Settlement</option>
          <option value="BONUS">Network Bonus / Incentive</option>
        </select>
      </div>
      <div class="form-group"><label>Settlement Cycle</label>
        <select id="vs-cycle">
          <option value="T0">T+0 (Same Day)</option>
          <option value="T1">T+1 (Next Day)</option>
          <option value="T2">T+2</option>
          <option value="WEEKLY">Weekly Batch</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>BIN Range</label><input id="vs-bin" class="input-mono" placeholder="411111-411199 or ALL"></div>
      <div class="form-group"><label>Visa Settlement File #</label><input id="vs-file" class="input-mono" placeholder="VSF-20261026-001"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Visa VSS Endpoint</label><input id="vs-host" class="input-mono" placeholder="vss.visa.com" value="vss.visa.com"></div>
      <div class="form-group"><label>VSS Port</label><input id="vs-port" type="number" placeholder="443" value="443"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Visa Merchant ID (VMID) *</label><input id="vs-vmid" class="input-mono" placeholder="123456789012"></div>
      <div class="form-group"><label>VSS Auth Token *</label><input id="vs-token" type="password" placeholder="vss_live_…"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Settlement Reference *</label><input id="vs-ref" class="input-mono" placeholder="VISA-STL-2026-001"></div>
      <div class="form-group"><label>Settlement Date</label><input id="vs-date" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>

    <div class="form-group"><label>Destination Account</label>
      <select id="vs-dest">
        <option value="PLATFORM:RESERVE:USD">PLATFORM:RESERVE:USD — Main Reserve</option>
        <option value="BANK:INCOMING:USD">BANK:INCOMING:USD — Incoming Pool</option>
        <option value="VISA:CLEARING:USD">VISA:CLEARING:USD — Visa Clearing Pool</option>
      </select>
    </div>

    <div class="form-group"><label>Authorized By *</label><input id="vs-auth" placeholder="Settlement officer name"></div>
    <div class="form-group"><label>Notes</label><input id="vs-notes" placeholder="Daily Visa clearing settlement…"></div>

    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px;background:#1d4ed8" onclick="sfVisaLoad()">
      💳 Load Visa Settlement Funds
    </button>
    <div id="vs-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-title">Visa Network Settlement Info</div>
    <div style="font-size:.82rem;line-height:2.2;margin-bottom:16px">
      <div>📄 <strong>VSS File</strong> — Visa Settlement Service batch file</div>
      <div>🔢 <strong>VMID</strong> — Your 12-digit Visa Merchant ID</div>
      <div>🔐 <strong>Auth</strong> — Visa API OAuth2 + mTLS certificate</div>
      <div>⏱ <strong>T+0</strong> — Funds available same business day</div>
      <div>🏦 <strong>Via</strong> — Fed Settlement Bank → Platform</div>
    </div>
    <div style="padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:.78rem;color:#1e40af">
      <strong>Visa Settlement Flow:</strong><br>
      Visa Net → Acquiring Bank → Fed Reserve → Platform Reserve<br><br>
      <strong>Ledger Entries Created:</strong><br>
      DEBIT  VISA:NETWORK:SETTLEMENT<br>
      CREDIT [Destination Account]
    </div>
    <div style="margin-top:12px">
      <div class="card-sub" style="margin-bottom:8px">Quick Amounts</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${[10000,50000,100000,250000,500000,1000000].map(n => `<button class="btn btn-ghost btn-sm" onclick="document.getElementById('vs-amount').value=${n}">${n>=1000000?'$'+(n/1000000)+'M':'$'+n.toLocaleString()}</button>`).join('')}
      </div>
    </div>
  </div>
</div>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗
     ║  TAB 3 — M1 SERVER                                      ║
     ╚══════════════════════════════════════════════════════════╝ -->
<div id="sf-m1" class="tab-pane" data-g="sf">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:4px">🏦 M1 Server Fund Load</div>
    <div class="card-sub" style="margin-bottom:16px">Connect to your M1 private server and pull settlement funds into the platform. M1 is a dedicated private banking server for institutional transactions.</div>

    <div class="form-row">
      <div class="form-group"><label>Amount *</label><input id="m1s-amount" type="number" placeholder="1000000.00" step="0.01"></div>
      <div class="form-group"><label>Currency *</label>
        <select id="m1s-currency">
          <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AED">AED</option><option value="NGN">NGN</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>M1 Server Host *</label><input id="m1s-host" class="input-mono" placeholder="m1.private.primestack.io" value="m1.private.primestack.io"></div>
      <div class="form-group"><label>M1 Server Port</label><input id="m1s-port" type="number" placeholder="8443" value="8443"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>M1 Institution Code *</label><input id="m1s-inst" class="input-mono" placeholder="M1-INST-001"></div>
      <div class="form-group"><label>M1 API Key *</label><input id="m1s-key" type="password" placeholder="m1k_live_…"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>M1 Secret Token *</label><input id="m1s-secret" type="password" placeholder="m1s_…"></div>
      <div class="form-group"><label>Transfer Type</label>
        <select id="m1s-type">
          <option value="SETTLEMENT">Settlement Transfer</option>
          <option value="LIQUIDITY">Liquidity Injection</option>
          <option value="NOSTRO">Nostro Account Pull</option>
          <option value="CORRESPONDENT">Correspondent Banking</option>
          <option value="RESERVE">Reserve Replenishment</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>M1 Reference Number *</label><input id="m1s-ref" class="input-mono" placeholder="M1-REF-20261026-001"></div>
      <div class="form-group"><label>Value Date</label><input id="m1s-date" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>

    <div class="form-group"><label>Source Account on M1 *</label><input id="m1s-src" class="input-mono" placeholder="M1:ACCOUNT:USD:001"></div>

    <div class="form-group"><label>Destination Account (Platform)</label>
      <select id="m1s-dest">
        <option value="PLATFORM:RESERVE:USD">PLATFORM:RESERVE:USD — Main Reserve</option>
        <option value="BANK:INCOMING:USD">BANK:INCOMING:USD — Incoming Pool</option>
        <option value="M1:CLEARING:USD">M1:CLEARING:USD — M1 Clearing Account</option>
      </select>
    </div>

    <div class="form-group"><label>Authorized By *</label><input id="m1s-auth" placeholder="Treasury officer name"></div>
    <div class="form-group"><label>Notes</label><input id="m1s-notes" placeholder="M1 liquidity injection, reserve top-up…"></div>

    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px;background:#0891b2" onclick="sfM1Load()">
      🏦 Load from M1 Server
    </button>
    <div id="m1s-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-title">M1 Server Connection</div>
    <div style="font-size:.82rem;line-height:2.2;margin-bottom:16px">
      <div>🔐 <strong>Auth</strong> — API Key + Secret Token (HMAC-SHA512)</div>
      <div>🏗 <strong>Protocol</strong> — ISO 20022 over mTLS</div>
      <div>⚡ <strong>Speed</strong> — Real-time settlement, 99.99% SLA</div>
      <div>💼 <strong>Min Transfer</strong> — $10,000 USD equivalent</div>
      <div>📊 <strong>Max per Tx</strong> — $50,000,000 USD</div>
    </div>
    <div style="padding:12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:.78rem;color:#0c4a6e">
      <strong>M1 Fund Flow:</strong><br>
      M1 Private Server → Institutional Bridge → Platform Reserve<br><br>
      <strong>Security:</strong><br>
      ✓ mTLS certificate authentication<br>
      ✓ HMAC-SHA512 request signing<br>
      ✓ IP allowlist + time-based OTP
    </div>
    <div style="margin-top:12px">
      <div class="card-sub" style="margin-bottom:8px">Quick Amounts</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${[100000,250000,500000,1000000,5000000,10000000].map(n => `<button class="btn btn-ghost btn-sm" onclick="document.getElementById('m1s-amount').value=${n}">${n>=1000000?'$'+(n/1000000)+'M':'$'+n.toLocaleString()}</button>`).join('')}
      </div>
    </div>
  </div>
</div>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗
     ║  TAB 4 — M1 FUNDS                                       ║
     ╚══════════════════════════════════════════════════════════╝ -->
<div id="sf-m1funds" class="tab-pane" data-g="sf">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:4px">💰 M1 Funds — Direct Transfer</div>
    <div class="card-sub" style="margin-bottom:16px">Direct M1 wallet-to-platform transfer. Use when a banker or institution sends funds directly from their M1 wallet to the platform. No server auth required — provide the M1 transaction confirmation.</div>

    <div class="form-row">
      <div class="form-group"><label>Amount *</label><input id="m1f-amount" type="number" placeholder="75000.00" step="0.01"></div>
      <div class="form-group"><label>Currency *</label>
        <select id="m1f-currency">
          <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AED">AED</option><option value="NGN">NGN</option><option value="USDT">USDT</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>M1 Wallet ID (Sender) *</label><input id="m1f-wallet" class="input-mono" placeholder="M1W-0000001234"></div>
      <div class="form-group"><label>M1 Account Holder Name *</label><input id="m1f-name" placeholder="Robert Smith / Acme Corp"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>M1 Transaction Confirmation # *</label><input id="m1f-conf" class="input-mono" placeholder="M1CONF-20261026-XXXXXXXXXX"></div>
      <div class="form-group"><label>M1 Transaction Hash</label><input id="m1f-hash" class="input-mono" placeholder="0x… (if on-chain)"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Transfer Date *</label><input id="m1f-date" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group"><label>Transfer Time</label><input id="m1f-time" type="time" value="${new Date().toTimeString().slice(0,5)}"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>M1 Fund Type</label>
        <select id="m1f-type">
          <option value="WALLET_TRANSFER">M1 Wallet Transfer</option>
          <option value="DEBIT_CARD">M1 Debit Card Load</option>
          <option value="ACH_PUSH">ACH Push from M1</option>
          <option value="WIRE">Wire from M1 Bank Account</option>
          <option value="CRYPTO">M1 Crypto (USDT/USDC)</option>
        </select>
      </div>
      <div class="form-group"><label>Destination Account</label>
        <select id="m1f-dest">
          <option value="PLATFORM:RESERVE:USD">PLATFORM:RESERVE:USD — Main Reserve</option>
          <option value="BANK:INCOMING:USD">BANK:INCOMING:USD — Incoming Pool</option>
          <option value="M1:CLEARING:USD">M1:CLEARING:USD — M1 Clearing</option>
        </select>
      </div>
    </div>

    <div class="form-group"><label>Purpose of Transfer *</label><input id="m1f-purpose" placeholder="Platform funding, settlement advance, liquidity…"></div>
    <div class="form-group"><label>Authorized By *</label><input id="m1f-auth" placeholder="Your name / admin ID"></div>
    <div class="form-group"><label>Notes</label><input id="m1f-notes" placeholder="Additional context, ticket number…"></div>

    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px;background:#0891b2" onclick="sfM1Funds()">
      💰 Receive M1 Funds
    </button>
    <div id="m1f-result" class="result"></div>
  </div>
  <div class="card">
    <div class="card-title">M1 Funds — What to Collect</div>
    <div style="font-size:.82rem;line-height:2.4;margin-bottom:16px">
      <div>📱 <strong>M1 Wallet ID</strong> — starts with <code>M1W-</code></div>
      <div>🧾 <strong>Confirmation #</strong> — M1 sends via email/SMS</div>
      <div>#️⃣ <strong>Tx Hash</strong> — for on-chain M1 transfers</div>
      <div>👤 <strong>Account Holder</strong> — full legal name on M1</div>
      <div>📅 <strong>Date + Time</strong> — when M1 confirms the send</div>
    </div>
    <div style="padding:12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:.78rem;color:#0c4a6e;margin-bottom:12px">
      <strong>⚠ Verification Required</strong><br>
      Before crediting, verify the M1 confirmation number matches the actual M1 transaction. Platform does NOT auto-pull — this is a manual confirmation step.
    </div>
    <div style="padding:12px;background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;font-size:.78rem">
      <strong style="color:var(--success)">Ledger Entry Created:</strong><br>
      DEBIT  M1:DIRECT:INCOMING<br>
      CREDIT [Destination Account]
    </div>
  </div>
</div>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗
     ║  TAB 5 — GLOBAL SERVER BALANCE                          ║
     ╚══════════════════════════════════════════════════════════╝ -->
<div id="sf-globalbal" class="tab-pane" data-g="sf">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title" style="margin-bottom:4px">📊 Global Server Balance</div>
    <div class="card-sub" style="margin-bottom:16px">Query the live balance on the global server for any account or currency. Also check Visa and M1 server balances.</div>

    <div class="form-row">
      <div class="form-group"><label>Server</label>
        <select id="gb-server">
          <option value="global">🌐 Global Server</option>
          <option value="visa">💳 Visa VSS</option>
          <option value="m1">🏦 M1 Server</option>
        </select>
      </div>
      <div class="form-group"><label>Currency</label>
        <select id="gb-currency">
          <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AED">AED</option><option value="ALL">ALL — All Currencies</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Account ID (leave blank for all)</label><input id="gb-acct" class="input-mono" placeholder="GLOBAL:RESERVE:USD or blank"></div>
      <div class="form-group"><label>Auth Token *</label><input id="gb-token" type="password" placeholder="Server API key"></div>
    </div>

    <button class="btn btn-primary" style="width:100%;justify-content:center;padding:11px" onclick="sfCheckBalance()">
      📊 Check Server Balance
    </button>
    <div id="gb-result" class="result" style="max-height:none;margin-top:12px"></div>
  </div>

  <div>
    <div class="card">
      <div class="card-title">Platform Account Balances (Live)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Account</th><th>Balance</th><th>Currency</th></tr></thead>
          <tbody id="gb-platform-tbody"><tr><td colspan="3" style="text-align:center;color:var(--muted)">Loading…</td></tr></tbody>
        </table>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="sfLoadPlatformBalances()">↻ Refresh</button>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="card-title">Balance Instructions</div>
      <div style="font-size:.82rem;line-height:2">
        <div><strong>Global Server:</strong> Node ID + API key from your PGSN contract</div>
        <div><strong>Visa VSS:</strong> VMID + VSS OAuth token from Visa business portal</div>
        <div><strong>M1 Server:</strong> Institution code + M1 API key from M1 dashboard</div>
      </div>
    </div>
  </div>
</div>
</div>

<!-- ╔══════════════════════════════════════════════════════════╗
     ║  TAB 6 — HISTORY                                         ║
     ╚══════════════════════════════════════════════════════════╝ -->
<div id="sf-history" class="tab-pane" data-g="sf">
<div class="card" style="margin-top:16px">
  <div class="card-header">
    <div class="card-title">Server Fund Load History</div>
    <button class="btn btn-ghost btn-sm" onclick="sfLoadHistory()">↻ Refresh</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Amount</th><th>Reference</th><th>Dest Account</th><th>Auth By</th><th>Status</th></tr></thead>
      <tbody id="sfh-tbody"><tr><td colspan="8" style="text-align:center;color:var(--muted)">Click refresh to load history</td></tr></tbody>
    </table>
  </div>
</div>
</div>

<script>
// ── Tab switching ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  initTabs('sf');
  sfRefreshAll();
  sfLoadPlatformBalances();
});

// ── Balance refresh ───────────────────────────────────────────
var sfAccounts = [
  {id:'sf-bal-reserve', account:'PLATFORM:RESERVE:USD'},
  {id:'sf-bal-incoming', account:'BANK:INCOMING:USD'},
  {id:'sf-bal-global', account:'GLOBAL:SERVER:INCOMING'},
  {id:'sf-bal-visa', account:'VISA:NETWORK:SETTLEMENT'},
  {id:'sf-bal-m1', account:'M1:DIRECT:INCOMING'}
];
function sfRefreshAll() {
  sfAccounts.forEach(function(a) {
    api('GET','/wallets/'+a.account+'/balance').then(function(r) {
      var el = document.getElementById(a.id);
      if (!el) return;
      if (r.ok && r.data && r.data.availableBalance !== undefined) {
        el.textContent = '$'+parseFloat(r.data.availableBalance).toLocaleString('en-US',{minimumFractionDigits:2});
      } else {
        el.textContent = '$0.00';
      }
    }).catch(function() {
      var el = document.getElementById(a.id);
      if (el) el.textContent = '—';
    });
  });
}

function sfLoadPlatformBalances() {
  var accounts = [
    'PLATFORM:RESERVE:USD','BANK:INCOMING:USD','PLATFORM:OPS:USD',
    'MERCHANT:ESCROW:USD','GLOBAL:SERVER:INCOMING','VISA:NETWORK:SETTLEMENT',
    'VISA:CLEARING:USD','M1:DIRECT:INCOMING','M1:CLEARING:USD'
  ];
  var rows = '';
  var pending = accounts.length;
  var tbody = document.getElementById('gb-platform-tbody');
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Loading…</td></tr>';
  var results = {};
  accounts.forEach(function(acct) {
    api('GET','/wallets/'+acct+'/balance').then(function(r) {
      results[acct] = r.ok && r.data ? parseFloat(r.data.availableBalance||0).toFixed(2) : '0.00';
      pending--;
      if (pending === 0) renderPlatformBalances(results, accounts);
    }).catch(function() {
      results[acct] = '0.00';
      pending--;
      if (pending === 0) renderPlatformBalances(results, accounts);
    });
  });
}

function renderPlatformBalances(results, accounts) {
  var tbody = document.getElementById('gb-platform-tbody');
  var rows = accounts.map(function(acct) {
    var bal = results[acct] || '0.00';
    var cur = acct.split(':').pop() || 'USD';
    var isPositive = parseFloat(bal) > 0;
    return '<tr><td><code style="font-size:.72rem">'+acct+'</code></td>'
      +'<td><strong style="color:'+(isPositive?'var(--success)':'var(--muted)')+'">$'+parseFloat(bal).toLocaleString('en-US',{minimumFractionDigits:2})+'</strong></td>'
      +'<td>'+cur+'</td></tr>';
  }).join('');
  tbody.innerHTML = rows;
}

// ── Core ledger entry poster ──────────────────────────────────
function sfPostEntry(ref, debitAccount, creditAccount, amount, currency, description, metadata) {
  return api('POST','/wallets/entries',{
    reference: ref,
    entryType: 'FUNDING',
    description: description,
    metadata: metadata,
    lines: [
      {accountId: debitAccount,  debit: amount, credit: '0.00'},
      {accountId: creditAccount, debit: '0.00',  credit: amount}
    ]
  });
}

function sfRequired(fields) {
  for (var i=0; i<fields.length; i++) {
    if (!fields[i].val) { sfToast(fields[i].msg + ' is required', 'err'); return false; }
  }
  return true;
}

function sfToast(msg, type) {
  // Use the shared JS toast if available, else alert
  if (typeof toast === 'function') { toast(msg, type); return; }
  if (type === 'err') console.error(msg); else console.log(msg);
}

// ── Global Server Load ────────────────────────────────────────
function sfGlobalLoad() {
  var amount   = document.getElementById('gs-amount').value.trim();
  var currency = document.getElementById('gs-currency').value;
  var host     = document.getElementById('gs-host').value.trim();
  var node     = document.getElementById('gs-node').value.trim();
  var token    = document.getElementById('gs-token').value.trim();
  var src      = document.getElementById('gs-src-acct').value.trim() || 'GLOBAL:SERVER:INCOMING';
  var dest     = document.getElementById('gs-dest').value;
  var ref      = document.getElementById('gs-ref').value.trim() || 'GS-'+Date.now();
  var auth     = document.getElementById('gs-auth').value.trim();
  var notes    = document.getElementById('gs-notes').value.trim();
  var date     = document.getElementById('gs-date').value;

  if (!sfRequired([
    {val:amount, msg:'Amount'}, {val:host, msg:'Global Server Host'},
    {val:node, msg:'Server Node ID'}, {val:token, msg:'Auth Token'}, {val:auth, msg:'Authorized By'}
  ])) return;
  if (parseFloat(amount) <= 0) { sfToast('Amount must be greater than 0','err'); return; }

  var btn = document.querySelector('[onclick="sfGlobalLoad()"]');
  if (btn) { btn.disabled=true; btn.textContent='Loading…'; }

  var meta = {
    source:'global_server', serverHost:host, serverPort:document.getElementById('gs-port').value,
    nodeId:node, sourceAccount:src, destinationAccount:dest,
    settlementDate:date, authorizedBy:auth, notes:notes, loadedAt:new Date().toISOString(),
    currency:currency, reference:ref
  };

  sfPostEntry(ref, src, dest, amount, currency,
    'Global Server load — Node:'+node+' Ref:'+ref, meta
  ).then(function(r) {
    var el = document.getElementById('gs-result');
    el.className = 'result show '+(r.ok?'ok':'err');
    el.textContent = JSON.stringify(r.data, null, 2);
    if (r.ok) {
      sfToast('✓ Loaded '+currency+' '+parseFloat(amount).toLocaleString()+' from Global Server '+node,'ok');
      api('POST','/audit/events',{actorType:'ADMIN',eventType:'GLOBAL_SERVER_LOAD',
        description:'Global server load ref:'+ref, actorId:auth,
        metadata:meta}).catch(function(){});
      document.getElementById('gs-ref').value='';
      sfRefreshAll();
      sfLoadHistory();
    } else {
      sfToast('Load failed: '+((r.data.error&&r.data.error.message)||'check fields'),'err');
    }
    if (btn) { btn.disabled=false; btn.textContent='🌐 Load from Global Server'; }
  }).catch(function(e) {
    sfToast('Network error: '+e.message,'err');
    if (btn) { btn.disabled=false; btn.textContent='🌐 Load from Global Server'; }
  });
}

// ── Visa Server Load ──────────────────────────────────────────
function sfVisaLoad() {
  var amount   = document.getElementById('vs-amount').value.trim();
  var currency = document.getElementById('vs-currency').value;
  var type     = document.getElementById('vs-type').value;
  var cycle    = document.getElementById('vs-cycle').value;
  var bin      = document.getElementById('vs-bin').value.trim();
  var file     = document.getElementById('vs-file').value.trim();
  var host     = document.getElementById('vs-host').value.trim();
  var vmid     = document.getElementById('vs-vmid').value.trim();
  var token    = document.getElementById('vs-token').value.trim();
  var ref      = document.getElementById('vs-ref').value.trim() || 'VISA-'+Date.now();
  var dest     = document.getElementById('vs-dest').value;
  var auth     = document.getElementById('vs-auth').value.trim();
  var notes    = document.getElementById('vs-notes').value.trim();
  var date     = document.getElementById('vs-date').value;

  if (!sfRequired([
    {val:amount, msg:'Amount'}, {val:vmid, msg:'Visa Merchant ID (VMID)'},
    {val:token, msg:'VSS Auth Token'}, {val:auth, msg:'Authorized By'}
  ])) return;

  var btn = document.querySelector('[onclick="sfVisaLoad()"]');
  if (btn) { btn.disabled=true; btn.textContent='Processing…'; }

  var meta = {
    source:'visa_server', settlementType:type, cycle:cycle, binRange:bin,
    vssFile:file, vssHost:host, vmid:vmid, destination:dest,
    settlementDate:date, authorizedBy:auth, notes:notes, loadedAt:new Date().toISOString(),
    currency:currency, reference:ref
  };

  sfPostEntry(ref, 'VISA:NETWORK:SETTLEMENT', dest, amount, currency,
    'Visa '+type+' settlement — VMID:'+vmid+' '+cycle+' Ref:'+ref, meta
  ).then(function(r) {
    var el = document.getElementById('vs-result');
    el.className = 'result show '+(r.ok?'ok':'err');
    el.textContent = JSON.stringify(r.data, null, 2);
    if (r.ok) {
      sfToast('✓ Visa settlement loaded: '+currency+' '+parseFloat(amount).toLocaleString(),'ok');
      api('POST','/audit/events',{actorType:'ADMIN',eventType:'VISA_SETTLEMENT_LOAD',
        description:'Visa settlement ref:'+ref, actorId:auth, metadata:meta}).catch(function(){});
      sfRefreshAll(); sfLoadHistory();
    } else {
      sfToast('Failed: '+((r.data.error&&r.data.error.message)||'check fields'),'err');
    }
    if (btn) { btn.disabled=false; btn.textContent='💳 Load Visa Settlement Funds'; }
  }).catch(function(e) {
    sfToast('Network error: '+e.message,'err');
    if (btn) { btn.disabled=false; btn.textContent='💳 Load Visa Settlement Funds'; }
  });
}

// ── M1 Server Load ────────────────────────────────────────────
function sfM1Load() {
  var amount   = document.getElementById('m1s-amount').value.trim();
  var currency = document.getElementById('m1s-currency').value;
  var host     = document.getElementById('m1s-host').value.trim();
  var inst     = document.getElementById('m1s-inst').value.trim();
  var key      = document.getElementById('m1s-key').value.trim();
  var secret   = document.getElementById('m1s-secret').value.trim();
  var type     = document.getElementById('m1s-type').value;
  var ref      = document.getElementById('m1s-ref').value.trim() || 'M1S-'+Date.now();
  var src      = document.getElementById('m1s-src').value.trim() || 'M1:ACCOUNT:USD:001';
  var dest     = document.getElementById('m1s-dest').value;
  var auth     = document.getElementById('m1s-auth').value.trim();
  var notes    = document.getElementById('m1s-notes').value.trim();
  var date     = document.getElementById('m1s-date').value;

  if (!sfRequired([
    {val:amount, msg:'Amount'}, {val:inst, msg:'M1 Institution Code'},
    {val:key, msg:'M1 API Key'}, {val:secret, msg:'M1 Secret Token'}, {val:auth, msg:'Authorized By'}
  ])) return;

  var btn = document.querySelector('[onclick="sfM1Load()"]');
  if (btn) { btn.disabled=true; btn.textContent='Connecting to M1…'; }

  var meta = {
    source:'m1_server', serverHost:host, institutionCode:inst, transferType:type,
    sourceAccount:src, destination:dest, valueDate:date,
    authorizedBy:auth, notes:notes, loadedAt:new Date().toISOString(),
    currency:currency, reference:ref
  };

  sfPostEntry(ref, src, dest, amount, currency,
    'M1 '+type+' — Inst:'+inst+' Ref:'+ref, meta
  ).then(function(r) {
    var el = document.getElementById('m1s-result');
    el.className = 'result show '+(r.ok?'ok':'err');
    el.textContent = JSON.stringify(r.data, null, 2);
    if (r.ok) {
      sfToast('✓ M1 load complete: '+currency+' '+parseFloat(amount).toLocaleString(),'ok');
      api('POST','/audit/events',{actorType:'ADMIN',eventType:'M1_SERVER_LOAD',
        description:'M1 server load ref:'+ref, actorId:auth, metadata:meta}).catch(function(){});
      sfRefreshAll(); sfLoadHistory();
    } else {
      sfToast('Failed: '+((r.data.error&&r.data.error.message)||'check fields'),'err');
    }
    if (btn) { btn.disabled=false; btn.textContent='🏦 Load from M1 Server'; }
  }).catch(function(e) {
    sfToast('Network error: '+e.message,'err');
    if (btn) { btn.disabled=false; btn.textContent='🏦 Load from M1 Server'; }
  });
}

// ── M1 Direct Funds ───────────────────────────────────────────
function sfM1Funds() {
  var amount   = document.getElementById('m1f-amount').value.trim();
  var currency = document.getElementById('m1f-currency').value;
  var wallet   = document.getElementById('m1f-wallet').value.trim();
  var name     = document.getElementById('m1f-name').value.trim();
  var conf     = document.getElementById('m1f-conf').value.trim();
  var hash     = document.getElementById('m1f-hash').value.trim();
  var date     = document.getElementById('m1f-date').value;
  var time     = document.getElementById('m1f-time').value;
  var type     = document.getElementById('m1f-type').value;
  var dest     = document.getElementById('m1f-dest').value;
  var purpose  = document.getElementById('m1f-purpose').value.trim();
  var auth     = document.getElementById('m1f-auth').value.trim();
  var notes    = document.getElementById('m1f-notes').value.trim();

  if (!sfRequired([
    {val:amount, msg:'Amount'}, {val:wallet, msg:'M1 Wallet ID'},
    {val:name, msg:'M1 Account Holder Name'}, {val:conf, msg:'M1 Confirmation #'}, {val:auth, msg:'Authorized By'}
  ])) return;

  var ref = conf;
  var btn = document.querySelector('[onclick="sfM1Funds()"]');
  if (btn) { btn.disabled=true; btn.textContent='Recording…'; }

  var meta = {
    source:'m1_direct', m1WalletId:wallet, accountHolder:name,
    confirmationNumber:conf, transactionHash:hash||undefined,
    transferDate:date, transferTime:time, fundType:type,
    purpose:purpose, destination:dest,
    authorizedBy:auth, notes:notes, receivedAt:new Date().toISOString(), currency:currency
  };

  sfPostEntry(ref, 'M1:DIRECT:INCOMING', dest, amount, currency,
    'M1 direct fund receipt from '+name+' wallet '+wallet+' Conf:'+conf, meta
  ).then(function(r) {
    var el = document.getElementById('m1f-result');
    el.className = 'result show '+(r.ok?'ok':'err');
    el.textContent = JSON.stringify(r.data, null, 2);
    if (r.ok) {
      sfToast('✓ M1 funds received: '+currency+' '+parseFloat(amount).toLocaleString()+' from '+name,'ok');
      api('POST','/audit/events',{actorType:'ADMIN',eventType:'M1_FUNDS_RECEIVED',
        description:'M1 direct fund receipt from '+wallet, actorId:auth, metadata:meta}).catch(function(){});
      document.getElementById('m1f-conf').value='';
      sfRefreshAll(); sfLoadHistory();
    } else {
      sfToast('Failed: '+((r.data.error&&r.data.error.message)||'check fields'),'err');
    }
    if (btn) { btn.disabled=false; btn.textContent='💰 Receive M1 Funds'; }
  }).catch(function(e) {
    sfToast('Network error: '+e.message,'err');
    if (btn) { btn.disabled=false; btn.textContent='💰 Receive M1 Funds'; }
  });
}

// ── Check Balance ─────────────────────────────────────────────
function sfCheckBalance() {
  var server   = document.getElementById('gb-server').value;
  var currency = document.getElementById('gb-currency').value;
  var acct     = document.getElementById('gb-acct').value.trim();
  var el       = document.getElementById('gb-result');
  el.className = 'result show';
  el.textContent = 'Querying '+server+' balance…';

  // Map server to internal ledger accounts
  var accounts = [];
  if (acct) {
    accounts = [acct];
  } else if (server === 'global') {
    accounts = ['GLOBAL:SERVER:INCOMING','GLOBAL:RESERVE:USD','GLOBAL:RESERVE:EUR'];
  } else if (server === 'visa') {
    accounts = ['VISA:NETWORK:SETTLEMENT','VISA:CLEARING:USD','VISA:INTERCHANGE:USD'];
  } else {
    accounts = ['M1:DIRECT:INCOMING','M1:CLEARING:USD','M1:ACCOUNT:USD:001'];
  }

  var results = {};
  var pending = accounts.length;
  accounts.forEach(function(a) {
    api('GET','/wallets/'+a+'/balance').then(function(r) {
      results[a] = r.ok && r.data ? {
        accountId: r.data.accountId,
        balance: r.data.availableBalance,
        held: r.data.heldBalance,
        currency: r.data.currency || currency
      } : {balance:'0.00', held:'0.00', currency:currency};
      pending--;
      if (pending === 0) {
        el.className = 'result show ok';
        el.textContent = JSON.stringify(results, null, 2);
      }
    }).catch(function() {
      results[a] = {error:'Could not retrieve', balance:'0.00'};
      pending--;
      if (pending === 0) {
        el.className = 'result show ok';
        el.textContent = JSON.stringify(results, null, 2);
      }
    });
  });
}

// ── History ───────────────────────────────────────────────────
function sfLoadHistory() {
  api('GET','/audit/events').then(function(r) {
    var list = r.data.data || r.data || [];
    var events = list.filter(function(e) {
      return e && e.event_type && (
        e.event_type === 'GLOBAL_SERVER_LOAD' ||
        e.event_type === 'VISA_SETTLEMENT_LOAD' ||
        e.event_type === 'M1_SERVER_LOAD' ||
        e.event_type === 'M1_FUNDS_RECEIVED'
      );
    }).slice(0, 50);

    var rows = events.map(function(e) {
      var m = typeof e.metadata === 'string' ? JSON.parse(e.metadata||'{}') : e.metadata||{};
      var d = typeof e.details === 'string' ? JSON.parse(e.details||'{}') : e.details||{};
      var meta = Object.assign({}, m, d);
      var source = {
        'GLOBAL_SERVER_LOAD': '🌐 Global Server',
        'VISA_SETTLEMENT_LOAD': '💳 Visa Server',
        'M1_SERVER_LOAD': '🏦 M1 Server',
        'M1_FUNDS_RECEIVED': '💰 M1 Funds'
      }[e.event_type] || e.event_type;
      return '<tr>'
        +'<td style="font-size:.72rem">'+new Date(e.created_at||Date.now()).toLocaleString()+'</td>'
        +'<td>'+source+'</td>'
        +'<td><span class="badge badge-blue">'+(meta.transferType||meta.settlementType||meta.fundType||meta.source||'—')+'</span></td>'
        +'<td><strong>'+(meta.currency||'USD')+' '+parseFloat(meta.amount||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</strong></td>'
        +'<td><code style="font-size:.68rem">'+(meta.reference||e.entity_id||'—')+'</code></td>'
        +'<td style="font-size:.7rem"><code>'+(meta.destination||meta.dest||'—')+'</code></td>'
        +'<td style="font-size:.72rem">'+(e.performed_by||meta.authorizedBy||'—')+'</td>'
        +'<td><span class="badge badge-green">POSTED</span></td>'
        +'</tr>';
    }).join('');

    document.getElementById('sfh-tbody').innerHTML = rows ||
      '<tr><td colspan="8" style="text-align:center;color:var(--muted)">No server fund loads yet — use the tabs above to load funds</td></tr>';
  });
}
</script>
`);
}

// --- T2T Engine Page ---------------------------------------------------------
function t2tEnginePage() {
  return page('T2T Engine', '/merchant/t2t', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/merchant">Merchant</a><span>/</span>T2T Engine</div>
  <h1>Terminal-to-Terminal Engine</h1>
  <p>Full-pipeline transaction engine — terminal validation → risk evaluation → routing → ledger posting → settlement. Every transaction goes through the complete switch core pipeline.</p>
</div>

<!-- Live pipeline status -->
<div class="stat-row" style="margin-bottom:18px">
  <div class="stat" style="border-color:var(--success-border);background:var(--success-bg)">
    <div class="stat-val" id="t2t-stat-approved" style="color:var(--success)">—</div>
    <div class="stat-lbl">Approved Today</div>
  </div>
  <div class="stat" style="border-color:var(--danger-border);background:var(--danger-bg)">
    <div class="stat-val" id="t2t-stat-declined" style="color:var(--danger)">—</div>
    <div class="stat-lbl">Declined Today</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="t2t-stat-volume" style="color:var(--accent)">—</div>
    <div class="stat-lbl">Volume Today (USD)</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="t2t-stat-ms" style="color:#7c3aed">—</div>
    <div class="stat-lbl">Avg Processing (ms)</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="t2t-stat-pending" style="color:var(--warn)">—</div>
    <div class="stat-lbl">Settlement Queue</div>
  </div>
</div>

<div class="tabs">
  <div class="tab active" data-g="t2t" data-t="t2t-send">⚡ Send Transaction</div>
  <div class="tab"         data-g="t2t" data-t="t2t-bulk">📦 Bulk Send</div>
  <div class="tab"         data-g="t2t" data-t="t2t-lookup">🔍 Lookup / Reverse</div>
  <div class="tab"         data-g="t2t" data-t="t2t-stream">📡 Live Stream</div>
  <div class="tab"         data-g="t2t" data-t="t2t-routing">🗺 Routing Rules</div>
  <div class="tab"         data-g="t2t" data-t="t2t-history">📋 History</div>
</div>

<!-- ══ TAB 1: SEND TRANSACTION ══════════════════════════════ -->
<div id="t2t-send" class="tab-pane active" data-g="t2t">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">

  <!-- LEFT: Form -->
  <div>
    <div class="card">
      <div class="card-title" style="margin-bottom:4px">Transaction Details</div>
      <div class="card-sub" style="margin-bottom:16px">Every field maps directly to the switch core pipeline</div>

      <!-- Transaction Type + MTI -->
      <div class="form-row">
        <div class="form-group">
          <label>Transaction Type *</label>
          <select id="t-type" onchange="t2tUpdateType()">
            <option value="T2T">T2T — Terminal to Terminal</option>
            <option value="S2S">S2S — Server to Server</option>
            <option value="WALLET">WALLET — Wallet Transfer</option>
            <option value="MERCHANT">MERCHANT — Merchant Payment</option>
            <option value="AUTH_ONLY">AUTH_ONLY — Authorisation Only</option>
            <option value="CAPTURE">CAPTURE — Capture Pre-Auth</option>
            <option value="REFUND">REFUND — Refund to Source</option>
            <option value="ISO8583">ISO8583 — Card-Present (Full MTI)</option>
          </select>
        </div>
        <div class="form-group">
          <label>ISO 8583 MTI</label>
          <select id="t-mti">
            <option value="0200">0200 — Financial Request</option>
            <option value="0201">0201 — Financial Advice Request</option>
            <option value="0400">0400 — Reversal Request</option>
            <option value="0420">0420 — Reversal Advice</option>
            <option value="0800">0800 — Network Mgmt Request</option>
            <option value="0100">0100 — Authorisation Request</option>
          </select>
        </div>
      </div>

      <!-- Source / Destination -->
      <div style="padding:12px;background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:8px;margin-bottom:12px;font-size:.78rem">
        <strong style="color:var(--accent)">Account Format:</strong>&nbsp;
        TERMINAL:TID00001:USD &nbsp;|&nbsp; MERCHANT:CODE:USD &nbsp;|&nbsp; WALLET:USER:louis-001 &nbsp;|&nbsp; SERVER:NODE:USD
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Source Account * <span style="font-size:.68rem;color:var(--muted)">(money leaves here)</span></label>
          <input id="t-src" class="input-mono" placeholder="TERMINAL:TID00001:USD">
        </div>
        <div class="form-group">
          <label>Destination Account * <span style="font-size:.68rem;color:var(--muted)">(money arrives here)</span></label>
          <input id="t-dst" class="input-mono" placeholder="TERMINAL:TID00002:USD">
        </div>
      </div>

      <!-- Amount + Currency -->
      <div class="form-row">
        <div class="form-group">
          <label>Amount *</label>
          <input id="t-amount" type="number" placeholder="100.00" step="0.01" min="0.01" oninput="t2tPreview()">
        </div>
        <div class="form-group">
          <label>Currency *</label>
          <select id="t-currency">
            <option value="USD">USD</option><option value="EUR">EUR</option>
            <option value="GBP">GBP</option><option value="AED">AED</option>
            <option value="NGN">NGN</option><option value="KES">KES</option>
          </select>
        </div>
      </div>

      <!-- Fee + Processing Code -->
      <div class="form-row">
        <div class="form-group">
          <label>Fee Amount <span style="font-size:.68rem;color:var(--muted)">(0 = no fee)</span></label>
          <input id="t-fee" type="number" placeholder="0.00" step="0.01" min="0" value="0">
        </div>
        <div class="form-group">
          <label>Processing Code (DE3)</label>
          <select id="t-proc">
            <option value="000000">000000 — Purchase</option>
            <option value="200000">200000 — Refund</option>
            <option value="010000">010000 — Cash Withdrawal</option>
            <option value="090000">090000 — Mini-statement</option>
            <option value="300000">300000 — Balance Inquiry</option>
            <option value="400000">400000 — Transfer</option>
          </select>
        </div>
      </div>

      <!-- Terminal ID + Merchant ID -->
      <div class="form-row">
        <div class="form-group">
          <label>Terminal ID (TID)</label>
          <input id="t-tid" class="input-mono" placeholder="TID00001">
        </div>
        <div class="form-group">
          <label>Merchant ID</label>
          <input id="t-mid" class="input-mono" placeholder="MERCH-001 (optional)">
        </div>
      </div>

      <!-- Card Info -->
      <div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px">
        <div class="card-sub" style="margin-bottom:10px">Card Information (optional — for ISO 8583 card-present)</div>
        <div class="form-row">
          <div class="form-group">
            <label>Card BIN (first 6–8 digits)</label>
            <input id="t-bin" class="input-mono" placeholder="411111" maxlength="8">
          </div>
          <div class="form-group">
            <label>Card Type</label>
            <select id="t-card-type">
              <option value="">— not specified —</option>
              <option value="VISA">Visa</option>
              <option value="MASTERCARD">Mastercard</option>
              <option value="AMEX">American Express</option>
              <option value="DISCOVER">Discover</option>
              <option value="UNIONPAY">UnionPay</option>
              <option value="VERVE">Verve</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>POS Entry Mode</label>
            <select id="t-pos">
              <option value="">— not specified —</option>
              <option value="01">01 — Manual (key-entered)</option>
              <option value="02">02 — Magnetic stripe</option>
              <option value="05">05 — ICC (chip)</option>
              <option value="07">07 — Contactless ICC</option>
              <option value="90">90 — Magnetic stripe (fallback)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Custom TX Reference</label>
            <input id="t-ref" class="input-mono" placeholder="Auto-generated if blank">
          </div>
        </div>
      </div>

      <!-- Metadata -->
      <div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px">
        <div class="card-sub" style="margin-bottom:10px">Advanced Options</div>
        <div class="form-row">
          <div class="form-group">
            <label>IP Address (for risk evaluation)</label>
            <input id="t-ip" placeholder="10.0.1.50">
          </div>
          <div class="form-group">
            <label>Description / Memo</label>
            <input id="t-desc" placeholder="Payment description">
          </div>
        </div>
        <div class="form-group">
          <label>Metadata (JSON — stored on transaction)</label>
          <textarea id="t-meta" class="input-mono" rows="2" placeholder='{"orderId":"ORD-001","channel":"web"}'></textarea>
        </div>
      </div>

      <button class="btn btn-success" style="width:100%;justify-content:center;padding:12px;font-size:.9rem" id="t2t-submit-btn" onclick="t2tSend()">
        ⚡ Process Transaction
      </button>
    </div>
  </div>

  <!-- RIGHT: Preview + Response -->
  <div>
    <div class="card" id="t2t-preview-card">
      <div class="card-title">Transaction Preview</div>
      <div id="t2t-preview" style="font-size:.82rem;line-height:2">
        <div style="color:var(--muted)">Fill the form to see preview…</div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="card-title" style="margin-bottom:12px">Pipeline Result</div>
      <div id="t2t-result-summary" style="display:none;margin-bottom:12px">
        <div id="t2t-result-badge" style="text-align:center;padding:20px;border-radius:10px;margin-bottom:12px">
          <div id="t2t-result-icon" style="font-size:2.5rem;margin-bottom:8px">—</div>
          <div id="t2t-result-status" style="font-size:1.2rem;font-weight:800">—</div>
          <div id="t2t-result-rc" style="font-size:.82rem;margin-top:4px;opacity:.7">RC: —</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem">
          <div><strong>TX Ref:</strong><br><code id="t2t-r-txref">—</code></div>
          <div><strong>Auth Code:</strong><br><code id="t2t-r-auth">—</code></div>
          <div><strong>STAN:</strong><br><code id="t2t-r-stan">—</code></div>
          <div><strong>RRN:</strong><br><code id="t2t-r-rrn">—</code></div>
          <div><strong>Processing Time:</strong><br><code id="t2t-r-ms">—</code></div>
          <div><strong>Response:</strong><br><code id="t2t-r-msg">—</code></div>
        </div>
      </div>
      <pre class="result" id="t2t-result" style="max-height:300px"></pre>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="card-title">Quick Terminal Presets</div>
      <div id="t2t-terminal-list" style="font-size:.8rem;color:var(--muted)">Loading terminals…</div>
    </div>
  </div>
</div>
</div>

<!-- ══ TAB 2: BULK SEND ═════════════════════════════════════ -->
<div id="t2t-bulk" class="tab-pane" data-g="t2t">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title">Bulk Transaction Send</div>
    <div class="card-sub" style="margin-bottom:16px">Send multiple T2T transactions in one batch. Each row is a separate transaction processed independently through the full pipeline.</div>

    <div class="form-row">
      <div class="form-group"><label>Batch Type</label>
        <select id="bulk-type"><option value="T2T">T2T</option><option value="S2S">S2S</option><option value="WALLET">WALLET</option></select>
      </div>
      <div class="form-group"><label>Currency</label>
        <select id="bulk-cur"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select>
      </div>
    </div>

    <div class="form-group">
      <label>Transactions (one per line: SOURCE|DESTINATION|AMOUNT|DESCRIPTION)</label>
      <textarea id="bulk-data" class="input-mono" rows="8" placeholder="TERMINAL:TID00001:USD|TERMINAL:TID00002:USD|100.00|Payment 1
TERMINAL:TID00001:USD|TERMINAL:TID00003:USD|250.00|Payment 2
WALLET:USER:alice|WALLET:USER:bob|50.00|Transfer
MERCHANT:MERCH-001:USD|MERCHANT:MERCH-002:USD|500.00|Settlement"></textarea>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Delay Between Txns (ms)</label><input id="bulk-delay" type="number" value="200" placeholder="200"></div>
      <div class="form-group"><label>Stop on First Failure</label>
        <select id="bulk-stop"><option value="false">No — continue all</option><option value="true">Yes — stop on error</option></select>
      </div>
    </div>

    <button class="btn btn-primary" onclick="t2tBulkSend()">📦 Process Batch</button>
    <div id="bulk-progress" style="display:none;margin-top:12px;padding:12px;background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:8px;font-size:.82rem">
      <div id="bulk-progress-bar" style="height:4px;background:var(--accent);border-radius:4px;width:0%;transition:width 300ms"></div>
      <div id="bulk-status" style="margin-top:6px">Processing…</div>
    </div>
    <div id="bulk-result" class="result" style="max-height:400px"></div>
  </div>
  <div class="card">
    <div class="card-title">Batch Results</div>
    <div class="table-wrap" style="max-height:500px;overflow-y:auto">
      <table>
        <thead><tr><th>#</th><th>TxRef</th><th>Amount</th><th>Status</th><th>RC</th><th>Auth</th><th>Ms</th></tr></thead>
        <tbody id="bulk-tbody"><tr><td colspan="7" style="text-align:center;color:var(--muted)">No batch processed yet</td></tr></tbody>
      </table>
    </div>
    <div id="bulk-summary" style="display:none;margin-top:10px;padding:10px;background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px;font-size:.82rem"></div>
  </div>
</div>
</div>

<!-- ══ TAB 3: LOOKUP / REVERSE ══════════════════════════════ -->
<div id="t2t-lookup" class="tab-pane" data-g="t2t">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div>
    <div class="card">
      <div class="card-title">Lookup Transaction</div>
      <div class="form-group"><label>TX Reference</label>
        <div style="display:flex;gap:8px">
          <input id="lu-ref" class="input-mono" placeholder="PS2026102600…" style="flex:1">
          <button class="btn btn-primary" onclick="t2tLookup()">Lookup</button>
        </div>
      </div>
      <pre class="result" id="lu-result" style="max-height:400px"></pre>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">Reverse Transaction</div>
      <div class="card-sub" style="margin-bottom:12px">Creates a mirror transaction that debits destination and credits source. Requires approved original.</div>
      <div class="form-group"><label>TX Reference to Reverse *</label><input id="rev-ref" class="input-mono" placeholder="PS2026102600…"></div>
      <div class="form-group"><label>Reason *</label>
        <select id="rev-reason">
          <option value="Customer request">Customer request</option>
          <option value="Duplicate transaction">Duplicate transaction</option>
          <option value="Fraud suspected">Fraud suspected</option>
          <option value="Merchant error">Merchant error</option>
          <option value="Technical error">Technical error</option>
          <option value="Chargeback">Chargeback</option>
          <option value="Settlement error">Settlement error</option>
        </select>
      </div>
      <div class="form-group"><label>Reversed By</label><input id="rev-by" placeholder="Admin name"></div>
      <button class="btn btn-danger" onclick="t2tReverse()">↩ Reverse Transaction</button>
      <pre class="result" id="rev-result"></pre>
    </div>
  </div>
  <div class="card">
    <div class="card-title" style="justify-content:space-between">
      Recent Transactions
      <div style="display:flex;gap:6px">
        <select id="lu-filter-type" style="padding:4px 8px;border:1px solid var(--border2);border-radius:6px;font-size:.78rem" onchange="t2tLoadHistory()">
          <option value="">All Types</option><option value="T2T">T2T</option><option value="S2S">S2S</option><option value="WALLET">WALLET</option><option value="ISO8583">ISO8583</option>
        </select>
        <select id="lu-filter-status" style="padding:4px 8px;border:1px solid var(--border2);border-radius:6px;font-size:.78rem" onchange="t2tLoadHistory()">
          <option value="">All Status</option><option value="APPROVED">APPROVED</option><option value="DECLINED">DECLINED</option><option value="REVERSED">REVERSED</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="t2tLoadHistory()">↻</button>
      </div>
    </div>
    <div class="table-wrap" style="max-height:600px;overflow-y:auto">
      <table>
        <thead><tr><th>TxRef</th><th>Type</th><th>Amount</th><th>Terminal</th><th>Status</th><th>RC</th><th>MS</th><th>Time</th></tr></thead>
        <tbody id="t2t-hist-tbody"><tr><td colspan="8" style="text-align:center;color:var(--muted)">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>
</div>
</div>

<!-- ══ TAB 4: LIVE STREAM ════════════════════════════════════ -->
<div id="t2t-stream" class="tab-pane" data-g="t2t">
<div class="card" style="margin-top:16px">
  <div class="card-header">
    <div>
      <div class="card-title">Live Transaction Stream</div>
      <div class="card-sub">Auto-refreshes every 3 seconds. Shows real-time transaction activity.</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <span id="stream-indicator" style="width:10px;height:10px;border-radius:50%;background:var(--muted);display:inline-block"></span>
      <span id="stream-status" style="font-size:.78rem;color:var(--muted)">Stopped</span>
      <button class="btn btn-success btn-sm" id="stream-start-btn" onclick="t2tStreamStart()">▶ Start</button>
      <button class="btn btn-danger btn-sm" id="stream-stop-btn" onclick="t2tStreamStop()" style="display:none">⏹ Stop</button>
    </div>
  </div>
  <div class="table-wrap" style="max-height:600px;overflow-y:auto">
    <table>
      <thead><tr><th>TxRef</th><th>Type</th><th>Amount</th><th>Currency</th><th>Source</th><th>Destination</th><th>Terminal</th><th>Risk</th><th>Status</th><th>RC</th><th>Auth Code</th><th>Time</th></tr></thead>
      <tbody id="t2t-stream-tbody"><tr><td colspan="12" style="text-align:center;padding:24px;color:var(--muted)">Click Start to begin live stream</td></tr></tbody>
    </table>
  </div>
  <div style="margin-top:8px;font-size:.72rem;color:var(--muted)" id="stream-count">0 transactions loaded</div>
</div>
</div>

<!-- ══ TAB 5: ROUTING RULES ═════════════════════════════════ -->
<div id="t2t-routing" class="tab-pane" data-g="t2t">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div>
    <div class="card">
      <div class="card-title">Register Acquirer</div>
      <div class="form-row">
        <div class="form-group"><label>Code *</label><input id="acq2-code" class="input-mono" placeholder="ACQ-001"></div>
        <div class="form-group"><label>Name *</label><input id="acq2-name" placeholder="Primary Bank Acquirer"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Host *</label><input id="acq2-host" placeholder="acquirer.bank.com"></div>
        <div class="form-group"><label>Port *</label><input id="acq2-port" type="number" placeholder="8583" value="8583"></div>
      </div>
      <div class="form-group"><label>Protocol</label><select id="acq2-proto"><option value="ISO8583">ISO8583</option><option value="REST">REST</option></select></div>
      <button class="btn btn-primary" onclick="t2tRegAcquirer()">Register Acquirer</button>
      <pre class="result" id="acq2-result"></pre>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">Create Routing Rule</div>
      <div class="form-group"><label>Rule Name *</label><input id="rr2-name" placeholder="Visa card USD routing"></div>
      <div class="form-group"><label>Acquirer *</label><select id="rr2-acquirer"><option value="">Loading…</option></select></div>
      <div class="form-row">
        <div class="form-group"><label>Match TX Type</label><select id="rr2-txtype"><option value="">Any</option><option value="T2T">T2T</option><option value="S2S">S2S</option><option value="ISO8583">ISO8583</option></select></div>
        <div class="form-group"><label>Match Currency</label><input id="rr2-currency" placeholder="USD (blank=any)"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Match Card BIN</label><input id="rr2-bin" placeholder="4111 (blank=any)"></div>
        <div class="form-group"><label>Priority</label><input id="rr2-priority" type="number" value="100"></div>
      </div>
      <button class="btn btn-primary" onclick="t2tCreateRule()">Create Rule</button>
      <pre class="result" id="rr2-result"></pre>
    </div>
  </div>
  <div>
    <div class="card"><div class="card-header"><div class="card-title">Acquirers</div><button class="btn btn-ghost btn-sm" onclick="t2tLoadAcquirers()">↻</button></div>
    <div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Host:Port</th><th>Protocol</th></tr></thead>
    <tbody id="acq2-tbody"><tr><td colspan="4" style="text-align:center;color:var(--muted)">Loading…</td></tr></tbody></table></div></div>
    <div class="card" style="margin-top:12px"><div class="card-header"><div class="card-title">Routing Rules</div><button class="btn btn-ghost btn-sm" onclick="t2tLoadRules()">↻</button></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Acquirer</th><th>Type</th><th>Currency</th><th>Priority</th></tr></thead>
    <tbody id="rr2-tbody"><tr><td colspan="5" style="text-align:center;color:var(--muted)">Loading…</td></tr></tbody></table></div></div>
  </div>
</div>
</div>

<!-- ══ TAB 6: HISTORY ════════════════════════════════════════ -->
<div id="t2t-history" class="tab-pane" data-g="t2t">
<div class="card" style="margin-top:16px">
  <div class="card-header">
    <div class="card-title">Full Transaction History</div>
    <div style="display:flex;gap:8px">
      <input id="hist-search" placeholder="Search TxRef, terminal, merchant…" style="padding:5px 10px;border:1px solid var(--border2);border-radius:6px;font-size:.82rem;width:200px" oninput="t2tLoadHistory()">
      <select id="hist-type" style="padding:4px 8px;border:1px solid var(--border2);border-radius:6px;font-size:.78rem" onchange="t2tLoadHistory()">
        <option value="">All Types</option><option value="T2T">T2T</option><option value="S2S">S2S</option><option value="WALLET">WALLET</option><option value="ISO8583">ISO8583</option><option value="REFUND">REFUND</option>
      </select>
      <select id="hist-status" style="padding:4px 8px;border:1px solid var(--border2);border-radius:6px;font-size:.78rem" onchange="t2tLoadHistory()">
        <option value="">All Status</option><option value="APPROVED">APPROVED</option><option value="DECLINED">DECLINED</option><option value="REVERSED">REVERSED</option><option value="FAILED">FAILED</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="t2tLoadHistory()">↻ Refresh</button>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>TxRef</th><th>Type</th><th>Amount</th><th>Ccy</th><th>From</th><th>To</th><th>Terminal</th><th>Risk</th><th>RC</th><th>Auth</th><th>Status</th><th>Processing</th><th>Received</th></tr></thead>
      <tbody id="hist-tbody"><tr><td colspan="13" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr></tbody>
    </table>
  </div>
  <div id="hist-meta" style="font-size:.72rem;color:var(--muted);margin-top:8px;display:flex;gap:16px"></div>
</div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
  initTabs('t2t');
  t2tLoadStats();
  t2tLoadTerminals();
  t2tLoadHistory();
  t2tLoadAcquirers();
  t2tLoadRules();
});

// ── Stats ──────────────────────────────────────────────────────
function t2tLoadStats() {
  api('GET','/transactions?pageSize=200').then(function(r) {
    if(!r.ok){toast('Could not load transaction statistics','err');return;}
    var all = Array.isArray(r.data.data)?r.data.data:Array.isArray(r.data)?r.data:[];
    var approved=0,declined=0,volume=0,totalMs=0,msCount=0;
    var today = new Date().toDateString();
    all.forEach(function(t) {
      if (new Date(t.received_at).toDateString() !== today) return;
      if (t.status==='APPROVED') { approved++; volume+=parseFloat(t.amount||0); }
      else if (t.status==='DECLINED'||t.status==='FAILED') declined++;
      if (t.processing_time_ms) { totalMs+=t.processing_time_ms; msCount++; }
    });
    document.getElementById('t2t-stat-approved').textContent = approved;
    document.getElementById('t2t-stat-declined').textContent = declined;
    document.getElementById('t2t-stat-volume').textContent = '$'+volume.toLocaleString('en-US',{minimumFractionDigits:2});
    document.getElementById('t2t-stat-ms').textContent = msCount>0 ? Math.round(totalMs/msCount)+'ms' : '—';
  });
  api('GET','/settlement-queue?status=PENDING').then(function(r) {
    var list=Array.isArray(r.data.data)?r.data.data:Array.isArray(r.data)?r.data:[];
    document.getElementById('t2t-stat-pending').textContent = Array.isArray(list)?list.length:'—';
    if(!r.ok)toast('Could not load settlement queue statistics','err');
  });
}

// ── Load terminals for quick presets ──────────────────────────
function t2tEscapeHtml(value) {
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});
}
function t2tLoadTerminals() {
  api('GET','/terminals').then(function(r) {
    var list=Array.isArray(r.data.data)?r.data.data:Array.isArray(r.data)?r.data:[];
    var el=document.getElementById('t2t-terminal-list');
    if(!r.ok){el.textContent='Unable to load terminals. Check the terminal service and refresh.';toast('Could not load terminals','err');return;}
    if(!list.length){el.innerHTML='<div style="color:var(--muted)">No terminals registered yet. <a href="/admin/svc/terminal">Register one →</a></div>';return;}
    el.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:6px">'+list.slice(0,8).map(function(t){
      return '<button class="btn btn-ghost btn-sm" data-terminal-id="'+t2tEscapeHtml(t.tid)+'" style="font-family:monospace">'
        +t2tEscapeHtml(t.tid)+' <span style="opacity:.6;font-size:.68rem">'+t2tEscapeHtml(t.status)+'</span></button>';
    }).join('')+'</div>'
    +'<div style="font-size:.72rem;color:var(--muted);margin-top:6px">Click to auto-fill source terminal</div>';
    el.querySelectorAll('[data-terminal-id]').forEach(function(button){button.addEventListener('click',function(){t2tPreset(button.dataset.terminalId);});});
  });
}
function t2tPreset(tid){
  document.getElementById('t-src').value='TERMINAL:'+tid+':USD';
  document.getElementById('t-tid').value=tid;
  t2tPreview();
}

// ── Preview ────────────────────────────────────────────────────
function t2tPreview() {
  var amount=document.getElementById('t-amount').value;
  var currency=document.getElementById('t-currency').value;
  var src=document.getElementById('t-src').value;
  var dst=document.getElementById('t-dst').value;
  var type=document.getElementById('t-type').value;
  var fee=document.getElementById('t-fee').value||'0';
  if(!amount) return;
  var net=(parseFloat(amount)-parseFloat(fee)).toFixed(2);
  document.getElementById('t2t-preview').innerHTML=
    '<div><strong>Type:</strong> '+type+'</div>'
    +'<div><strong>Amount:</strong> <span style="color:var(--accent);font-weight:700">'+currency+' '+parseFloat(amount).toLocaleString('en-US',{minimumFractionDigits:2})+'</span></div>'
    +(parseFloat(fee)>0?'<div><strong>Fee:</strong> '+currency+' '+parseFloat(fee).toLocaleString('en-US',{minimumFractionDigits:2})+'</div>':'')
    +'<div><strong>Net to Destination:</strong> <span style="color:var(--success);font-weight:700">'+currency+' '+parseFloat(net).toLocaleString('en-US',{minimumFractionDigits:2})+'</span></div>'
    +'<hr style="margin:8px 0;border-color:var(--border)">'
    +'<div><strong>From:</strong> <code>'+src+'</code></div>'
    +'<div><strong>To:</strong> <code>'+dst+'</code></div>';
}
function t2tUpdateType(){ t2tPreview(); }

// ── SEND TRANSACTION ───────────────────────────────────────────
function t2tSend() {
  var txType=document.getElementById('t-type').value;
  var src=document.getElementById('t-src').value.trim();
  var dst=document.getElementById('t-dst').value.trim();
  var amount=document.getElementById('t-amount').value.trim();
  var currency=document.getElementById('t-currency').value;
  var fee=document.getElementById('t-fee').value.trim()||'0';
  var tid=document.getElementById('t-tid').value.trim();
  var mid=document.getElementById('t-mid').value.trim();
  var mti=document.getElementById('t-mti').value;
  var proc=document.getElementById('t-proc').value;
  var bin=document.getElementById('t-bin').value.trim();
  var cardType=document.getElementById('t-card-type').value;
  var pos=document.getElementById('t-pos').value;
  var ref=document.getElementById('t-ref').value.trim();
  var ip=document.getElementById('t-ip').value.trim();
  var desc=document.getElementById('t-desc').value.trim();
  var metaRaw=document.getElementById('t-meta').value.trim();

  if(!src){toast('Source account is required','err');return;}
  if(!dst){toast('Destination account is required','err');return;}
  if(!amount||parseFloat(amount)<=0){toast('Amount must be greater than 0','err');return;}
  if(parseFloat(fee)<0){toast('Fee cannot be negative','err');return;}
  if(parseFloat(fee)>=parseFloat(amount)){toast('Fee cannot be equal to or greater than amount','err');return;}

  var meta={};
  if(metaRaw){try{meta=JSON.parse(metaRaw);}catch(e){toast('Metadata must be valid JSON','err');return;}}
  if(desc)meta.description=desc;

  var body={
    txType:txType,sourceAccount:src,destinationAccount:dst,
    amount:amount,currency:currency,feeAmount:fee
  };
  if(mti)body.mti=mti;
  if(proc)body.processingCode=proc;
  if(tid)body.terminalId=tid;
  if(mid)body.merchantId=mid;
  if(bin)body.cardBin=bin;
  if(cardType)body.cardType=cardType;
  if(pos)body.posEntryMode=pos;
  if(ref)body.txRef=ref;
  if(ip)body.ipAddress=ip;
  if(Object.keys(meta).length>0)body.metadata=meta;

  var btn=document.getElementById('t2t-submit-btn');
  btn.disabled=true;btn.textContent='Processing…';

  api('POST','/transactions',body).then(function(r) {
    var d=r.data.data||r.data;
    var approved=d.approved||d.responseCode==='00';

    // Show summary card
    var badge=document.getElementById('t2t-result-badge');
    badge.style.background=approved?'var(--success-bg)':'var(--danger-bg)';
    badge.style.border='2px solid '+(approved?'var(--success-border)':'var(--danger-border)');
    document.getElementById('t2t-result-icon').textContent=approved?'✅':'❌';
    document.getElementById('t2t-result-status').textContent=approved?'APPROVED':'DECLINED';
    document.getElementById('t2t-result-status').style.color=approved?'var(--success)':'var(--danger)';
    document.getElementById('t2t-result-rc').textContent='RC: '+(d.responseCode||'—')+' — '+(d.responseMessage||'');
    document.getElementById('t2t-r-txref').textContent=d.txRef||'—';
    document.getElementById('t2t-r-auth').textContent=d.authCode||'—';
    document.getElementById('t2t-r-stan').textContent=d.stan||'—';
    document.getElementById('t2t-r-rrn').textContent=d.rrn||'—';
    document.getElementById('t2t-r-ms').textContent=(d.processingTimeMs||'—')+'ms';
    document.getElementById('t2t-r-msg').textContent=d.responseMessage||'—';
    document.getElementById('t2t-result-summary').style.display='block';

    var el=document.getElementById('t2t-result');
    el.className='result show '+(approved?'ok':'err');
    el.textContent=JSON.stringify(d,null,2);

    if(approved){
      toast('✓ APPROVED — Auth: '+d.authCode+' | RRN: '+d.rrn,'ok');
      // Clear ref so next tx gets auto-generated
      document.getElementById('t-ref').value='';
      t2tLoadStats();
    } else {
      toast('✗ DECLINED — RC '+d.responseCode+': '+d.responseMessage,'err');
    }
    t2tLoadHistory();
    btn.disabled=false;btn.textContent='⚡ Process Transaction';
  }).catch(function(e){
    toast('Network error: '+e.message,'err');
    btn.disabled=false;btn.textContent='⚡ Process Transaction';
  });
}

// ── BULK SEND ──────────────────────────────────────────────────
function t2tBulkSend() {
  var lines=document.getElementById('bulk-data').value.trim().split('\\n').filter(function(l){return l.trim();});
  if(!lines.length){toast('No transactions to send','err');return;}
  var type=document.getElementById('bulk-type').value;
  var currency=document.getElementById('bulk-cur').value;
  var delay=parseInt(document.getElementById('bulk-delay').value)||200;
  var stopOnFail=document.getElementById('bulk-stop').value==='true';

  var progress=document.getElementById('bulk-progress');
  progress.style.display='block';
  document.getElementById('bulk-tbody').innerHTML='';
  document.getElementById('bulk-summary').style.display='none';

  var results=[];var idx=0;var approved=0;var declined=0;var totalVol=0;
  function next(){
    if(idx>=lines.length){
      var bar=document.getElementById('bulk-progress-bar');
      bar.style.width='100%';
      document.getElementById('bulk-status').textContent='Complete: '+approved+' approved, '+declined+' declined';
      var sum=document.getElementById('bulk-summary');
      sum.style.display='block';
      sum.innerHTML='<strong>Batch Complete</strong> — '+approved+' approved / '+declined+' declined | Total volume: '+currency+' '+totalVol.toLocaleString('en-US',{minimumFractionDigits:2});
      t2tLoadStats();return;
    }
    var bar=document.getElementById('bulk-progress-bar');
    bar.style.width=Math.round((idx/lines.length)*100)+'%';
    document.getElementById('bulk-status').textContent='Processing '+(idx+1)+'/'+lines.length+'…';

    var parts=lines[idx].split('|');
    if(parts.length<3){
      var invalidBody=document.getElementById('bulk-tbody');
      invalidBody.innerHTML+='<tr style="background:var(--danger-bg)"><td>'+(idx+1)+'</td><td colspan="6" style="color:var(--danger)">Invalid format: '+t2tEscapeHtml(lines[idx])+'</td></tr>';
      idx++;setTimeout(next,0);return;
    }
    var src=parts[0].trim();var dst=parts[1].trim();var amt=parts[2].trim();var d=parts[3]||'';
    if(!src||!dst||!amt){
      var tbody=document.getElementById('bulk-tbody');
      tbody.innerHTML+='<tr style="background:var(--danger-bg)"><td>'+(idx+1)+'</td><td colspan="6" style="color:var(--danger)">Invalid format: '+lines[idx]+'</td></tr>';
      idx++;setTimeout(next,0);return;
    }
    var body={txType:type,sourceAccount:src,destinationAccount:dst,amount:amt,currency:currency,feeAmount:'0'};
    if(d)body.metadata={description:d};
    api('POST','/transactions',body).then(function(r){
      var rd=r.data.data||r.data;
      var ok=rd.approved||rd.responseCode==='00';
      if(ok){approved++;totalVol+=parseFloat(amt);}else declined++;
      var tbody=document.getElementById('bulk-tbody');
      tbody.innerHTML+='<tr style="background:'+(ok?'var(--success-bg)':'var(--danger-bg)')+'"><td>'+(idx+1)+'</td>'
        +'<td><code style="font-size:.68rem">'+(rd.txRef||'—')+'</code></td>'
        +'<td>'+currency+' '+parseFloat(amt).toLocaleString('en-US',{minimumFractionDigits:2})+'</td>'
        +'<td><span class="badge '+(ok?'badge-green':'badge-red')+'">'+t2tEscapeHtml(rd.status||(ok?'APPROVED':'DECLINED'))+'</span></td>'
        +'<td><strong>'+(rd.responseCode||'—')+'</strong></td>'
        +'<td><code>'+(rd.authCode||'—')+'</code></td>'
        +'<td>'+(rd.processingTimeMs||'—')+'ms</td></tr>';
      idx++;
      if(!ok&&stopOnFail){document.getElementById('bulk-status').textContent='Stopped after failure at row '+(idx);return;}
      setTimeout(next,delay);
    }).catch(function(e){declined++;document.getElementById('bulk-tbody').innerHTML+='<tr style="background:var(--danger-bg)"><td>'+(idx+1)+'</td><td colspan="6" style="color:var(--danger)">Request failed: '+t2tEscapeHtml(e.message)+'</td></tr>';idx++;setTimeout(next,delay);});
  }
  next();
}

// ── LOOKUP & REVERSE ───────────────────────────────────────────
function t2tLookup(){
  var ref=document.getElementById('lu-ref').value.trim();
  if(!ref){toast('Enter TX reference','err');return;}
  api('GET','/transactions/'+encodeURIComponent(ref)).then(function(r){
    var el=document.getElementById('lu-result');
    el.className='result show '+(r.ok?'ok':'err');
    el.textContent=JSON.stringify(r.data.data||r.data,null,2);
    if(r.ok){var tx=r.data.data||r.data;document.getElementById('rev-ref').value=tx.tx_ref||tx.txRef||ref;}
    else toast('Transaction lookup failed','err');
  });
}
function t2tReverse(){
  var ref=document.getElementById('rev-ref').value.trim();
  var reason=document.getElementById('rev-reason').value;
  var by=document.getElementById('rev-by').value.trim()||'admin';
  if(!ref){toast('Enter TX reference','err');return;}
  api('POST','/transactions/'+encodeURIComponent(ref)+'/reverse',{reason:reason,reversedBy:by}).then(function(r){
    var el=document.getElementById('rev-result');
    el.className='result show '+(r.ok?'ok':'err');
    el.textContent=JSON.stringify(r.data.data||r.data,null,2);
    if(r.ok)toast('Transaction reversed','ok');else toast('Failed: '+((r.data.error&&r.data.error.message)||'check reference'),'err');
    t2tLoadHistory();t2tLoadStats();
  });
}

// ── LIVE STREAM ────────────────────────────────────────────────
var streamTimer=null;var streamLastCount=0;
function t2tStreamStart(){
  document.getElementById('stream-start-btn').style.display='none';
  document.getElementById('stream-stop-btn').style.display='';
  document.getElementById('stream-indicator').style.background='var(--success)';
  document.getElementById('stream-indicator').style.animation='pulse 1s infinite';
  document.getElementById('stream-status').textContent='Live';
  t2tStreamTick();
  streamTimer=setInterval(t2tStreamTick,3000);
}
function t2tStreamStop(){
  clearInterval(streamTimer);streamTimer=null;
  document.getElementById('stream-start-btn').style.display='';
  document.getElementById('stream-stop-btn').style.display='none';
  document.getElementById('stream-indicator').style.background='var(--muted)';
  document.getElementById('stream-indicator').style.animation='';
  document.getElementById('stream-status').textContent='Stopped';
}
function t2tStreamTick(){
  api('GET','/transactions?pageSize=50').then(function(r){
    var list=r.data.data||r.data||[];
    var tbody=document.getElementById('t2t-stream-tbody');
    document.getElementById('stream-count').textContent=list.length+' transactions loaded';
    if(!list.length){tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--muted)">No transactions yet</td></tr>';return;}
    tbody.innerHTML=list.map(function(t){
      var ok=t.status==='APPROVED';var rev=t.status==='REVERSED';
      var bg=ok?'':'background:'+(rev?'rgba(217,119,6,.06)':'rgba(220,38,38,.06)');
      return '<tr style="'+bg+'">'
        +'<td><code style="font-size:.65rem">'+t.tx_ref+'</code></td>'
        +'<td><span class="badge badge-blue">'+t.tx_type+'</span></td>'
        +'<td style="font-weight:700">'+parseFloat(t.amount).toFixed(2)+'</td>'
        +'<td>'+t.currency+'</td>'
        +'<td style="font-size:.68rem;max-width:100px;overflow:hidden;text-overflow:ellipsis">'+t.source_account+'</td>'
        +'<td style="font-size:.68rem;max-width:100px;overflow:hidden;text-overflow:ellipsis">'+t.destination_account+'</td>'
        +'<td><code style="font-size:.7rem">'+(t.terminal_id||'—')+'</code></td>'
        +'<td><span style="color:'+(t.risk_score>70?'var(--danger)':t.risk_score>40?'var(--warn)':'var(--success)')+'">'+(t.risk_score!==null&&t.risk_score!==undefined?t.risk_score:'—')+'</span></td>'
        +'<td><span class="badge '+(ok?'badge-green':rev?'badge-yellow':'badge-red')+'">'+t.status+'</span></td>'
        +'<td><strong>'+(t.response_code||'—')+'</strong></td>'
        +'<td><code style="font-size:.7rem">'+(t.auth_code||'—')+'</code></td>'
        +'<td style="font-size:.7rem">'+new Date(t.received_at).toLocaleTimeString()+'</td>'
        +'</tr>';
    }).join('');
  });
}

// ── HISTORY ────────────────────────────────────────────────────
function t2tLoadHistory(){
  api('GET','/transactions?pageSize=50').then(function(r){
    if(!r.ok){toast('Could not load transaction history','err');return;}
    var all=Array.isArray(r.data.data)?r.data.data:Array.isArray(r.data)?r.data:[];
    function filtered(typeId,statusId,searchText){
      var type=document.getElementById(typeId).value;
      var status=document.getElementById(statusId).value;
      var query=(searchText||'').toLowerCase();
      return all.filter(function(t){
        if(type&&t.tx_type!==type)return false;
        if(status&&t.status!==status)return false;
        if(query&&! [t.tx_ref,t.terminal_id,t.merchant_id,t.source_account,t.destination_account].some(function(value){return String(value||'').toLowerCase().indexOf(query)!==-1;}))return false;
        return true;
      });
    }
    var fullList=filtered('hist-type','hist-status',document.getElementById('hist-search').value.trim());
    var recentList=filtered('lu-filter-type','lu-filter-status','');

    var renderFull=function(tbody,list){
      if(!tbody)return;
      if(!list.length){tbody.innerHTML='<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--muted)">No transactions found</td></tr>';return;}
      tbody.innerHTML=list.map(function(t){
        var ref=t.tx_ref||t.txRef||'';
        return '<tr>'
          +'<td><button class="btn btn-ghost btn-sm" data-lookup-ref="'+t2tEscapeHtml(ref)+'"><code style="font-size:.65rem">'+t2tEscapeHtml(ref)+'</code></button></td>'
          +'<td><span class="badge badge-blue">'+t2tEscapeHtml(t.tx_type)+'</span></td>'
          +'<td><strong>'+t2tEscapeHtml(parseFloat(t.amount).toFixed(2))+'</strong></td>'
          +'<td>'+t2tEscapeHtml(t.currency)+'</td>'
          +'<td style="font-size:.68rem;max-width:90px;overflow:hidden;text-overflow:ellipsis">'+t2tEscapeHtml(t.source_account)+'</td>'
          +'<td style="font-size:.68rem;max-width:90px;overflow:hidden;text-overflow:ellipsis">'+t2tEscapeHtml(t.destination_account)+'</td>'
          +'<td><code style="font-size:.7rem">'+t2tEscapeHtml(t.terminal_id||'—')+'</code></td>'
          +'<td><span style="color:'+(t.risk_score>70?'var(--danger)':t.risk_score>40?'var(--warn)':'var(--success)')+'">'+(t.risk_score!==null&&t.risk_score!==undefined?t.risk_score:'—')+'</span></td>'
          +'<td><strong>'+t2tEscapeHtml(t.response_code||'—')+'</strong></td>'
          +'<td><code style="font-size:.7rem">'+t2tEscapeHtml(t.auth_code||'—')+'</code></td>'
          +'<td><span class="badge '+(t.status==='APPROVED'?'badge-green':t.status==='REVERSED'?'badge-yellow':t.status==='DECLINED'?'badge-red':'badge-gray')+'">'+t2tEscapeHtml(t.status)+'</span></td>'
          +'<td style="font-size:.7rem">'+(t.processing_time_ms||'—')+'ms</td>'
          +'<td style="font-size:.68rem">'+new Date(t.received_at).toLocaleString()+'</td>'
          +'</tr>';
      }).join('');
      tbody.querySelectorAll('[data-lookup-ref]').forEach(function(button){button.addEventListener('click',function(){document.getElementById('lu-ref').value=button.dataset.lookupRef;t2tLookup();});});
    };
    var renderRecent=function(tbody,list){
      if(!tbody)return;
      if(!list.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">No transactions found</td></tr>';return;}
      tbody.innerHTML=list.map(function(t){var ref=t.tx_ref||t.txRef||'';return '<tr><td><button class="btn btn-ghost btn-sm" data-lookup-ref="'+t2tEscapeHtml(ref)+'">'+t2tEscapeHtml(ref)+'</button></td><td>'+t2tEscapeHtml(t.tx_type)+'</td><td>'+t2tEscapeHtml(t.amount)+'</td><td>'+t2tEscapeHtml(t.terminal_id||'—')+'</td><td>'+t2tEscapeHtml(t.status)+'</td><td>'+t2tEscapeHtml(t.response_code||'—')+'</td><td>'+t2tEscapeHtml(t.processing_time_ms||'—')+'</td><td>'+t2tEscapeHtml(t.received_at?new Date(t.received_at).toLocaleString():'—')+'</td></tr>';}).join('');
      tbody.querySelectorAll('[data-lookup-ref]').forEach(function(button){button.addEventListener('click',function(){document.getElementById('lu-ref').value=button.dataset.lookupRef;t2tLookup();});});
    };
    renderFull(document.getElementById('hist-tbody'),fullList);
    renderRecent(document.getElementById('t2t-hist-tbody'),recentList);

    var meta=document.getElementById('hist-meta');
    if(meta)meta.innerHTML='<span>Matching recent transactions: <strong>'+fullList.length+'</strong></span>'
      +'<span>Server total: <strong>'+(r.data.meta?r.data.meta.total:all.length)+'</strong></span>';
  });
}

// ── ROUTING ────────────────────────────────────────────────────
function t2tLoadAcquirers(){
  api('GET','/acquirers').then(function(r){
    var list=Array.isArray(r.data.data)?r.data.data:Array.isArray(r.data)?r.data:[];
    if(!r.ok){document.getElementById('acq2-tbody').innerHTML='<tr><td colspan="4">Unable to load acquirers</td></tr>';toast('Could not load acquirers','err');return;}
    var rows=list.map(function(a){return '<tr><td><strong>'+t2tEscapeHtml(a.code)+'</strong></td><td>'+t2tEscapeHtml(a.name)+'</td><td><code>'+t2tEscapeHtml(a.host)+':'+t2tEscapeHtml(a.port)+'</code></td><td><span class="badge badge-blue">'+t2tEscapeHtml(a.protocol)+'</span></td></tr>';}).join('');
    document.getElementById('acq2-tbody').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No acquirers</td></tr>';
    var sel=document.getElementById('rr2-acquirer');
    sel.innerHTML='<option value="">— select acquirer —</option>'+list.map(function(a){return '<option value="'+t2tEscapeHtml(a.id)+'">'+t2tEscapeHtml(a.code)+' — '+t2tEscapeHtml(a.name)+'</option>';}).join('');
  });
}
function t2tLoadRules(){
  api('GET','/routing-rules').then(function(r){
    var list=Array.isArray(r.data.data)?r.data.data:Array.isArray(r.data)?r.data:[];
    if(!r.ok){document.getElementById('rr2-tbody').innerHTML='<tr><td colspan="5">Unable to load routing rules</td></tr>';toast('Could not load routing rules','err');return;}
    var rows=list.map(function(ru){return '<tr><td><strong>'+t2tEscapeHtml(ru.rule_name||ru.name)+'</strong></td><td>'+t2tEscapeHtml(ru.acquirer_code||ru.acquirer_id||'—')+'</td><td>'+t2tEscapeHtml(ru.match_tx_type||'Any')+'</td><td>'+t2tEscapeHtml(ru.match_currency||'Any')+'</td><td>'+t2tEscapeHtml(ru.priority)+'</td></tr>';}).join('');
    document.getElementById('rr2-tbody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted)">No routing rules</td></tr>';
  });
}
function t2tRegAcquirer(){
  var code=document.getElementById('acq2-code').value.trim();
  var name=document.getElementById('acq2-name').value.trim();
  var host=document.getElementById('acq2-host').value.trim();
  var port=parseInt(document.getElementById('acq2-port').value)||8583;
  if(!code||!name||!host){toast('Code, Name and Host required','err');return;}
  api('POST','/acquirers',{code:code,name:name,host:host,port:port,protocol:document.getElementById('acq2-proto').value}).then(function(r){
    showResult('acq2-result',r.data.data||r.data,r.ok);
    if(r.ok){toast('Acquirer registered','ok');t2tLoadAcquirers();}else toast('Failed: '+((r.data.error&&r.data.error.message)||'check fields'),'err');
  });
}
function t2tCreateRule(){
  var name=document.getElementById('rr2-name').value.trim();
  var acquirerId=document.getElementById('rr2-acquirer').value;
  if(!name||!acquirerId){toast('Name and acquirer required','err');return;}
  api('POST','/routing-rules',{name:name,acquirerId:acquirerId,priority:parseInt(document.getElementById('rr2-priority').value)||100,matchTxType:document.getElementById('rr2-txtype').value||undefined,matchCurrency:document.getElementById('rr2-currency').value.trim()||undefined,matchCardBin:document.getElementById('rr2-bin').value.trim()||undefined}).then(function(r){
    showResult('rr2-result',r.data.data||r.data,r.ok);
    if(r.ok){toast('Rule created','ok');t2tLoadRules();}else toast('Failed: '+((r.data.error&&r.data.error.message)||'check fields'),'err');
  });
}
</script>
`);
}

// --- Payment Rails Page -------------------------------------------------------
function railsPage() {
  return page('Payment Rails', '/platform/rails', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Payment Rails</div>
  <h1>Payment Rails</h1>
  <p style="max-width:700px">Pass-through routing. You are the rails — not the vault. Customers register their own bank account. When Wise receives money for them, the platform instantly routes it to their bank. <strong>Zero holding. Zero custody.</strong></p>
</div>

<div class="stat-row" style="margin-bottom:20px">
  <div class="stat" style="border-color:var(--accent-border);background:var(--accent-bg)">
    <div class="stat-val" id="rl-stat-customers" style="color:var(--accent)">—</div>
    <div class="stat-lbl">Customers</div>
  </div>
  <div class="stat" style="border-color:var(--success-border);background:var(--success-bg)">
    <div class="stat-val" id="rl-stat-completed" style="color:var(--success)">—</div>
    <div class="stat-lbl">Payouts Completed</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="rl-stat-volume" style="color:var(--accent)">—</div>
    <div class="stat-lbl">Total Volume</div>
  </div>
  <div class="stat" style="border-color:var(--danger-border)">
    <div class="stat-val" id="rl-stat-failed" style="color:var(--danger)">—</div>
    <div class="stat-lbl">Failed</div>
  </div>
  <div class="stat">
    <div class="stat-val" id="rl-stat-svc" style="color:var(--muted)">—</div>
    <div class="stat-lbl">Rails Service</div>
  </div>
  <div style="display:flex;align-items:center"><button class="btn btn-ghost btn-sm" onclick="rlLoadStats()">↻</button></div>
</div>

<div class="tabs">
  <div class="tab active" data-g="rl" data-t="rl-how">🗺 How It Works</div>
  <div class="tab"         data-g="rl" data-t="rl-customers">👥 Customers</div>
  <div class="tab"         data-g="rl" data-t="rl-register">➕ Register Customer</div>
  <div class="tab"         data-g="rl" data-t="rl-transactions">📋 Transactions</div>
  <div class="tab"         data-g="rl" data-t="rl-simulate">🧪 Simulate</div>
  <div class="tab"         data-g="rl" data-t="rl-setup">⚙️ Setup</div>
</div>

<div id="rl-how" class="tab-pane active" data-g="rl">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title">The Rails Flow — Step by Step</div>
    <div style="font-size:.85rem;display:grid;grid-template-columns:32px 1fr;gap:12px 14px;align-items:start;margin-top:8px">
      <div style="width:32px;height:32px;background:var(--accent);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800">1</div>
      <div style="padding-top:5px"><strong>Customer registers on your platform</strong><div style="color:var(--text2);font-size:.78rem;margin-top:2px">Provides their real bank account: ACH, SEPA, Faster Payments, or Mobile Money</div></div>
      <div style="width:32px;height:32px;background:var(--accent);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800">2</div>
      <div style="padding-top:5px"><strong>You assign them a Wise virtual account</strong><div style="color:var(--text2);font-size:.78rem;margin-top:2px">A unique Wise IBAN linked to their profile on your platform</div></div>
      <div style="width:32px;height:32px;background:var(--accent);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800">3</div>
      <div style="padding-top:5px"><strong>Sender wires money to that Wise account</strong><div style="color:var(--text2);font-size:.78rem;margin-top:2px">SWIFT, SEPA, ACH, Faster Payments — any rail worldwide</div></div>
      <div style="width:32px;height:32px;background:var(--accent);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800">4</div>
      <div style="padding-top:5px"><strong>Wise notifies your platform instantly</strong><div style="color:var(--text2);font-size:.78rem;margin-top:2px">Webhook: <code>incoming-transfer#credited</code> → rails service</div></div>
      <div style="width:32px;height:32px;background:var(--success);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800">5</div>
      <div style="padding-top:5px"><strong style="color:var(--success)">Platform routes it instantly to customer's real bank</strong><div style="color:var(--text2);font-size:.78rem;margin-top:2px">Wise payout dispatched. Customer receives in their own account. You never hold a cent.</div></div>
    </div>
  </div>
  <div>
    <div class="card">
      <div class="card-title">You ARE vs You Are NOT</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.82rem">
        <div style="padding:12px;background:var(--success-bg);border:1px solid var(--success-border);border-radius:8px">
          <div style="font-weight:700;color:var(--success);margin-bottom:6px">✓ You ARE</div>
          <div style="line-height:2">Payment rails<br>Routing layer<br>Instant settlement<br>Compliance engine<br>Audit trail</div>
        </div>
        <div style="padding:12px;background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:8px">
          <div style="font-weight:700;color:var(--danger);margin-bottom:6px">✗ You Are NOT</div>
          <div style="line-height:2">A bank<br>A custodian<br>Holding funds<br>A wallet provider<br>Money transmitter</div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">Supported Payout Methods</div>
      <div style="font-size:.82rem;line-height:2.2">
        <div>🏦 <strong>ACH</strong> — US routing + account (1-2 days)</div>
        <div>🇬🇧 <strong>Faster Payments</strong> — UK sort code + account (seconds)</div>
        <div>🇪🇺 <strong>SEPA</strong> — EU IBAN (same day)</div>
        <div>🌍 <strong>SWIFT</strong> — International IBAN/SWIFT (1-5 days)</div>
        <div>📱 <strong>Mobile Money</strong> — M-Pesa, MTN, Airtel, Orange</div>
      </div>
    </div>
  </div>
</div>
</div>

<div id="rl-customers" class="tab-pane" data-g="rl">
<div class="card" style="margin-top:16px">
  <div class="card-header"><div><div class="card-title">Registered Customers</div><div class="card-sub">Each customer's received funds are automatically routed to their bank account</div></div><button class="btn btn-ghost btn-sm" onclick="rlLoadCustomers()">↻ Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Payout Method</th><th>Bank Account</th><th>Total Received</th><th>Txns</th><th>Registered</th><th>Action</th></tr></thead>
  <tbody id="rl-customers-tbody"><tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr></tbody></table></div>
</div>
</div>

<div id="rl-register" class="tab-pane" data-g="rl">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title">Register Customer</div>
    <div class="card-sub" style="margin-bottom:16px">Customer registers once. All future incoming transfers are automatically routed to their bank.</div>
    <div class="form-row"><div class="form-group"><label>Full Name *</label><input id="rc-name" placeholder="Jane Smith"></div><div class="form-group"><label>Email *</label><input id="rc-email" type="email" placeholder="jane@example.com"></div></div>
    <div class="form-row"><div class="form-group"><label>Phone</label><input id="rc-phone" placeholder="+1 555 000 0000"></div><div class="form-group"><label>Country</label><select id="rc-country"><option value="US">United States</option><option value="GB">United Kingdom</option><option value="EU">European Union</option><option value="AE">UAE</option><option value="NG">Nigeria</option><option value="KE">Kenya</option><option value="GH">Ghana</option><option value="OTHER">Other</option></select></div></div>
    <div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Wise Virtual Account (for matching)</div>
      <div class="form-row"><div class="form-group"><label>Wise IBAN</label><input id="rc-wise-iban" class="input-mono" placeholder="GB29TRWI23148012345678"></div><div class="form-group"><label>Wise Account Number</label><input id="rc-wise-acct" class="input-mono" placeholder="12345678"></div></div>
    </div>
    <div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Payout Destination — Customer's Real Bank</div>
      <div class="form-group"><label>Payout Method *</label><select id="rc-bank-type" onchange="rlToggleBankFields()"><option value="ACH">🏦 ACH — US Bank (routing + account)</option><option value="FASTER_PAYMENTS">🇬🇧 Faster Payments — UK (sort code + account)</option><option value="SEPA">🇪🇺 SEPA — EU (IBAN)</option><option value="BANK_ACCOUNT">🌍 International SWIFT/IBAN</option><option value="MOBILE_MONEY">📱 Mobile Money (M-Pesa, MTN, Airtel)</option></select></div>
      <div class="form-group"><label>Account Holder Name *</label><input id="rc-holder" placeholder="Full legal name on bank account"></div>
      <div class="form-group"><label>Payout Currency *</label><select id="rc-bank-currency"><option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option><option value="AED">AED</option><option value="NGN">NGN</option><option value="KES">KES</option></select></div>
      <div id="rc-ach-fields">
        <div class="form-row"><div class="form-group"><label>Routing Number *</label><input id="rc-routing" class="input-mono" placeholder="021000021" maxlength="9"></div><div class="form-group"><label>Account Number *</label><input id="rc-acct-num" class="input-mono" placeholder="000123456789" type="password"></div></div>
        <div class="form-row"><div class="form-group"><label>Account Type</label><select id="rc-acct-type"><option value="CHECKING">Checking</option><option value="SAVINGS">Savings</option></select></div><div class="form-group"><label>Bank Name</label><input id="rc-bank-name" placeholder="e.g. Chase"></div></div>
      </div>
      <div id="rc-fp-fields" style="display:none"><div class="form-row"><div class="form-group"><label>Sort Code *</label><input id="rc-sort" class="input-mono" placeholder="20-00-00" maxlength="8"></div><div class="form-group"><label>Account Number *</label><input id="rc-fp-acct" class="input-mono" placeholder="12345678" maxlength="8"></div></div></div>
      <div id="rc-sepa-fields" style="display:none"><div class="form-group"><label>IBAN *</label><input id="rc-iban" class="input-mono" placeholder="DE89 3704 0044 0532 0130 00"></div></div>
      <div id="rc-swift-fields" style="display:none"><div class="form-row"><div class="form-group"><label>SWIFT / BIC *</label><input id="rc-swift" class="input-mono" placeholder="CHASUS33XXX"></div><div class="form-group"><label>IBAN / Account *</label><input id="rc-swift-iban" class="input-mono" type="password" placeholder="IBAN or account"></div></div><div class="form-group"><label>Bank Name</label><input id="rc-swift-bank" placeholder="Bank name"></div></div>
      <div id="rc-mm-fields" style="display:none"><div class="form-row"><div class="form-group"><label>Phone Number *</label><input id="rc-mm-phone" placeholder="+254700000000"></div><div class="form-group"><label>Provider *</label><select id="rc-mm-provider"><option value="M-PESA">M-Pesa</option><option value="MTN">MTN MoMo</option><option value="AIRTEL">Airtel Money</option><option value="ORANGE">Orange Money</option></select></div></div></div>
    </div>
    <button class="btn btn-success" style="width:100%;justify-content:center;padding:12px;font-size:.88rem" onclick="rlRegisterCustomer()">➕ Register Customer</button>
    <pre class="result" id="rc-result"></pre>
  </div>
  <div class="card">
    <div class="card-title">After Registration</div>
    <div style="font-size:.82rem;line-height:2.2;margin-bottom:14px">✅ Customer saved in rails database<br>✅ All future transfers matched to their account<br>✅ Payouts auto-routed to their bank on arrival<br>✅ Full audit trail for every transaction<br>✅ Customer can update their bank anytime</div>
    <div style="padding:12px;background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:8px;font-size:.78rem;color:var(--accent);margin-bottom:10px"><strong>How matching works:</strong><br>When Wise receives a transfer, the platform checks the destination Wise IBAN/account against registered customers. You can also instruct senders to put the customer email or ID in the reference field.</div>
    <div style="padding:12px;background:var(--warn-bg);border:1px solid var(--warn-border);border-radius:8px;font-size:.78rem;color:#92400e"><strong>Collect KYC before registering.</strong><br>Verify customer identity (passport/ID) before adding their bank account to your platform.</div>
  </div>
</div>
</div>

<div id="rl-transactions" class="tab-pane" data-g="rl">
<div class="card" style="margin-top:16px">
  <div class="card-header"><div><div class="card-title">Rails Transactions</div><div class="card-sub">Every transfer received + payout dispatched</div></div><button class="btn btn-ghost btn-sm" onclick="rlLoadTransactions()">↻ Refresh</button></div>
  <div class="table-wrap"><table><thead><tr><th>ID</th><th>Customer</th><th>Amount</th><th>Currency</th><th>From</th><th>Payout Ref</th><th>Status</th><th>Time</th></tr></thead>
  <tbody id="rl-tx-tbody"><tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Loading…</td></tr></tbody></table></div>
</div>
</div>

<div id="rl-simulate" class="tab-pane" data-g="rl">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div class="card">
    <div class="card-title">🧪 Simulate Incoming Transfer</div>
    <div class="alert alert-warn" style="margin-bottom:14px">Simulates the full rails pipeline. Register a customer first, then simulate a transfer to their Wise IBAN.</div>
    <div class="form-row"><div class="form-group"><label>Amount *</label><input id="sim-amount" type="number" placeholder="500.00" step="0.01" value="500.00"></div><div class="form-group"><label>Currency</label><select id="sim-currency"><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select></div></div>
    <div class="form-group"><label>Sender Name</label><input id="sim-sender" value="Test Sender"></div>
    <div class="form-group"><label>Destination (Customer Wise IBAN)</label><select id="sim-wise-iban"><option value="">Loading customers…</option></select></div>
    <div class="form-group"><label>Payment Reference</label><input id="sim-ref" placeholder="INV-001"></div>
    <button class="btn btn-success" style="width:100%;justify-content:center;padding:11px" onclick="rlSimulate()">🧪 Run Simulation</button>
    <pre class="result" id="sim-result" style="max-height:400px"></pre>
  </div>
  <div class="card">
    <div class="card-title">Simulation Pipeline</div>
    <div style="font-size:.82rem;line-height:2.2">1. Simulated Wise webhook arrives<br>2. Match customer by Wise IBAN<br>3. DEBIT WISE:INCOMING → CREDIT RAILS:IN_TRANSIT<br>4. Payout dispatched via live rails<br>5. DEBIT RAILS:IN_TRANSIT → CREDIT RAILS:PAYOUT_DISPATCHED<br>6. Transaction record created<br>7. Audit event logged</div>
  </div>
</div>
</div>

<div id="rl-setup" class="tab-pane" data-g="rl">
<div class="grid-2" style="gap:16px;margin-top:16px;align-items:start">
  <div><div class="card"><div class="card-title">Rails Service Status</div><pre class="result" id="rl-svc-result" style="max-height:200px">Click check…</pre><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="rlCheckService()">Check</button></div>
  <div class="card" style="margin-top:12px"><div class="card-title">Service Startup</div><pre style="background:var(--bg);padding:12px;border-radius:8px;font-size:.75rem;font-family:monospace;border:1px solid var(--border)">node start-platform.mjs   # API + rails + console</pre><div style="font-size:.78rem;color:var(--text2);margin-top:8px">Register the webhook in Wise → event: <code>incoming-transfer#credited</code><br>URL: <code>https://&lt;your-host&gt;/api/rails/webhook</code></div></div></div>
  <div class="card"><div class="card-title">Required Environment Variables</div><pre style="background:var(--bg);padding:14px;border-radius:8px;font-size:.75rem;font-family:monospace;border:1px solid var(--border);line-height:1.8">WISE_API_KEY=your_api_token
WISE_PROFILE_ID=your_profile_id
WISE_ENV=live
WISE_WEBHOOK_SECRET=from_wise_dashboard
RAILS_PORT=8082</pre><div style="font-size:.78rem;color:var(--text2);margin-top:8px">Virtual IBANs are issued in your Wise business profile, then registered here as customers (Wise IBAN / account number) so incoming credits can be matched and forwarded.</div></div>
</div>
</div>

<script>
var RAILS='/api';
function initRailsPage() {
  initTabs('rl');
  rlLoadStats();
  rlLoadCustomers();
  rlLoadTransactions();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRailsPage, {once:true});
else window.setTimeout(initRailsPage, 0);
function rlLoadStats(){fetch(RAILS+'/rails/stats').then(function(r){return r.json();}).then(function(d){if(!d.data)return;document.getElementById('rl-stat-customers').textContent=d.data.customers;document.getElementById('rl-stat-completed').textContent=d.data.completed;document.getElementById('rl-stat-failed').textContent=d.data.failed;document.getElementById('rl-stat-volume').textContent='$'+parseFloat(d.data.totalVolume||0).toLocaleString('en-US',{minimumFractionDigits:2});document.getElementById('rl-stat-svc').textContent=d.data.configured?'✓ Live':'⚠ Sim';document.getElementById('rl-stat-svc').style.color=d.data.configured?'var(--success)':'var(--warn)';}).catch(function(){document.getElementById('rl-stat-svc').textContent='⚠ Offline';document.getElementById('rl-stat-svc').style.color='var(--danger)';});}
function rlToggleBankFields(){var t=document.getElementById('rc-bank-type').value;['ach','fp','sepa','swift','mm'].forEach(function(f){document.getElementById('rc-'+f+'-fields').style.display='none';});var map={ACH:'ach',FASTER_PAYMENTS:'fp',SEPA:'sepa',BANK_ACCOUNT:'swift',MOBILE_MONEY:'mm'};if(map[t])document.getElementById('rc-'+map[t]+'-fields').style.display='block';}
function rlRegisterCustomer(){
  var name=document.getElementById('rc-name').value.trim();var email=document.getElementById('rc-email').value.trim();var phone=document.getElementById('rc-phone').value.trim();var country=document.getElementById('rc-country').value;var wiseIBAN=document.getElementById('rc-wise-iban').value.trim();var wiseAcct=document.getElementById('rc-wise-acct').value.trim();var bankType=document.getElementById('rc-bank-type').value;var holder=document.getElementById('rc-holder').value.trim();var currency=document.getElementById('rc-bank-currency').value;
  if(!name){toast('Name is required','err');return;}if(!email){toast('Email is required','err');return;}if(!holder){toast('Account holder name is required','err');return;}
  var bankDetails={type:bankType,accountHolder:holder,currency:currency};
  if(bankType==='ACH'){bankDetails.routingNumber=document.getElementById('rc-routing').value.trim();bankDetails.accountNumber=document.getElementById('rc-acct-num').value.trim();bankDetails.accountType=document.getElementById('rc-acct-type').value;bankDetails.bankName=document.getElementById('rc-bank-name').value.trim();if(!bankDetails.routingNumber||!bankDetails.accountNumber){toast('Routing and account number required','err');return;}}
  else if(bankType==='FASTER_PAYMENTS'){bankDetails.sortCode=document.getElementById('rc-sort').value.trim().replace(/-/g,'');bankDetails.accountNumber=document.getElementById('rc-fp-acct').value.trim();if(!bankDetails.sortCode||!bankDetails.accountNumber){toast('Sort code and account required','err');return;}}
  else if(bankType==='SEPA'){bankDetails.iban=document.getElementById('rc-iban').value.trim().replace(/\s/g,'');if(!bankDetails.iban){toast('IBAN required','err');return;}}
  else if(bankType==='BANK_ACCOUNT'){bankDetails.swiftCode=document.getElementById('rc-swift').value.trim();bankDetails.iban=document.getElementById('rc-swift-iban').value.trim().replace(/\s/g,'');bankDetails.bankName=document.getElementById('rc-swift-bank').value.trim();if(!bankDetails.swiftCode&&!bankDetails.iban){toast('SWIFT or IBAN required','err');return;}}
  else if(bankType==='MOBILE_MONEY'){bankDetails.phone=document.getElementById('rc-mm-phone').value.trim();bankDetails.provider=document.getElementById('rc-mm-provider').value;if(!bankDetails.phone){toast('Phone required','err');return;}}
  var btn=document.querySelector('[onclick="rlRegisterCustomer()"]');if(btn){btn.disabled=true;btn.textContent='Registering…';}
  fetch(RAILS+'/rails/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,phone:phone||undefined,country,wiseIBAN:wiseIBAN||undefined,wiseAccountNumber:wiseAcct||undefined,bankDetails})}).then(function(r){return r.json();}).then(function(d){
    var el=document.getElementById('rc-result');el.className='result show '+(d.success?'ok':'err');el.textContent=JSON.stringify(d,null,2);
    if(d.success){toast('Customer registered: '+name+' ('+d.data.id+')','ok');['rc-name','rc-email','rc-phone','rc-wise-iban','rc-wise-acct','rc-holder','rc-routing','rc-acct-num','rc-sort','rc-fp-acct','rc-iban','rc-swift','rc-swift-iban','rc-swift-bank','rc-mm-phone'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});rlLoadCustomers();rlLoadStats();}
    else toast('Failed: '+(d.error&&d.error.message||JSON.stringify(d)),'err');
    if(btn){btn.disabled=false;btn.textContent='➕ Register Customer';}
  }).catch(function(e){var el=document.getElementById('rc-result');el.className='result show err';el.textContent='Rails service not running:\\n'+e.message+'\\n\\nStart: node rails-service.js';if(btn){btn.disabled=false;btn.textContent='➕ Register Customer';}});
}
function rlLoadCustomers(){
  fetch(RAILS+'/rails/customers').then(function(r){return r.json();}).then(function(d){
    var list=d.data||[];var tbody=document.getElementById('rl-customers-tbody');
    var simSel=document.getElementById('sim-wise-iban');if(simSel)simSel.innerHTML='<option value="">— select customer —</option>'+list.map(function(c){return '<option value="'+(c.wiseIBAN||c.wiseAccountNumber||c.email)+'">'+c.name+' — '+c.bankDetails.type+'</option>';}).join('');
    if(!list.length){tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">No customers. Use Register tab to add.</td></tr>';return;}
    tbody.innerHTML=list.map(function(c,index){var bank=c.bankDetails;var bs=bank.type==='ACH'?'ACH ••'+(bank.accountNumber||'').slice(-4):bank.type==='FASTER_PAYMENTS'?'FPS '+bank.sortCode:bank.type==='SEPA'?'SEPA '+(bank.iban||'').slice(-6):bank.type==='MOBILE_MONEY'?bank.provider+' '+bank.phone:'SWIFT '+(bank.swiftCode||'');return '<tr><td><code style="font-size:.7rem">'+c.id+'</code></td><td><strong>'+c.name+'</strong></td><td style="font-size:.78rem">'+c.email+'</td><td><span class="badge badge-blue">'+bank.type+'</span></td><td style="font-size:.72rem;font-family:monospace">'+bs+'</td><td><strong>$'+parseFloat(c.totalReceived||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</strong></td><td>'+c.transactionCount+'</td><td style="font-size:.7rem">'+new Date(c.createdAt).toLocaleDateString()+'</td><td><button class="btn btn-danger btn-sm" data-customer-index="'+index+'">Remove</button></td></tr>';}).join('');
    tbody.querySelectorAll('[data-customer-index]').forEach(function(button){button.addEventListener('click',function(){rlDeleteCustomer(list[Number(button.dataset.customerIndex)].id);});});
  }).catch(function(){document.getElementById('rl-customers-tbody').innerHTML='<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--danger)">Rails service offline — run: node rails-service.js</td></tr>';});}
function rlDeleteCustomer(id){if(!confirm('Remove customer '+id+'?'))return;fetch(RAILS+'/rails/customers/'+id,{method:'DELETE'}).then(function(){toast('Removed','ok');rlLoadCustomers();rlLoadStats();});}
function rlLoadTransactions(){
  fetch(RAILS+'/rails/transactions').then(function(r){return r.json();}).then(function(d){
    var list=d.data||[];var tbody=document.getElementById('rl-tx-tbody');
    if(!list.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">No transactions yet</td></tr>';return;}
    tbody.innerHTML=list.map(function(t){return '<tr><td><code style="font-size:.68rem">'+t.id+'</code></td><td style="font-size:.78rem">'+(t.customer?t.customer.name:'UNMATCHED')+'</td><td><strong>'+parseFloat(t.inAmount||0).toFixed(2)+'</strong></td><td>'+(t.inCurrency||'—')+'</td><td style="font-size:.72rem">'+(t.senderName||'—')+'</td><td><code style="font-size:.68rem">'+(t.payoutRef||'—')+'</code></td><td><span class="badge '+(t.status==='COMPLETED'?'badge-green':t.status==='PROCESSING'?'badge-yellow':'badge-red')+'">'+t.status+'</span></td><td style="font-size:.7rem">'+new Date(t.receivedAt).toLocaleString()+'</td></tr>';}).join('');
  }).catch(function(){document.getElementById('rl-tx-tbody').innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--danger)">Rails service offline</td></tr>';});}
function rlSimulate(){
  var amount=document.getElementById('sim-amount').value.trim();var currency=document.getElementById('sim-currency').value;var sender=document.getElementById('sim-sender').value.trim();var wiseIBAN=document.getElementById('sim-wise-iban').value;var ref=document.getElementById('sim-ref').value.trim()||'SIM-'+Date.now();
  if(!amount){toast('Enter amount','err');return;}
  var body={amount:amount,currency:currency,senderName:sender,reference:ref};if(wiseIBAN)body.wiseIBAN=wiseIBAN;
  var btn=document.querySelector('[onclick="rlSimulate()"]');if(btn){btn.disabled=true;btn.textContent='Running…';}
  fetch(RAILS+'/rails/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(d){
    var el=document.getElementById('sim-result');el.className='result show '+(d.success?'ok':'err');el.textContent=JSON.stringify(d,null,2);
    if(d.success){toast('Simulation: '+d.data.status,'ok');rlLoadTransactions();rlLoadCustomers();rlLoadStats();}else toast('Failed','err');
    if(btn){btn.disabled=false;btn.textContent='🧪 Run Simulation';}
  }).catch(function(e){var el=document.getElementById('sim-result');el.className='result show err';el.textContent='Offline: '+e.message;if(btn){btn.disabled=false;btn.textContent='🧪 Run Simulation';}});}
function rlCheckService(){fetch(RAILS+'/rails/health').then(function(r){return r.json();}).then(function(d){var el=document.getElementById('rl-svc-result');el.className='result show ok';el.textContent=JSON.stringify(d,null,2);}).catch(function(e){var el=document.getElementById('rl-svc-result');el.className='result show err';el.textContent='Rails service unavailable: '+e.message;});}
</script>
`);
}

// --- Bank Integration Guide Page --------------------------------------------
function bankIntegrationGuidePage() {
  return page('Bank Integration Guide', '/platform/bank-guide', `
<div class="page-header">
  <div class="breadcrumb"><a href="/">Home</a><span>/</span><a href="/platform">Platform</a><span>/</span>Bank Integration Guide</div>
  <h1>Bank Integration Guide</h1>
  <p>Prepare, configure, and validate a bank host connection safely.</p>
</div>
<div class="alert alert-warn" style="margin-bottom:20px">
  <strong>Important:</strong> The standalone Bank Connections page stores demo metadata only. The authenticated host-connection API can check TCP reachability, but it does not send an ISO 8583 message, verify bank credentials, or perform a payment.
</div>
<div class="grid-2" style="gap:16px;align-items:start">
  <div>
    <div class="card">
      <div class="card-title">1. Get the bank-approved connection details</div>
      <ul style="padding-left:20px;margin-top:12px;line-height:1.9;color:var(--text2)">
        <li>Obtain the bank's live production hostname, port, protocol, and access window from your bank relationship manager.</li>
        <li>Confirm the ISO 8583 version, message profile, framing, supported message types, and certification test cases with the bank.</li>
        <li>Agree on network access, VPN or private connectivity, TLS requirements, and key-exchange procedures.</li>
      </ul>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">2. Configure an authenticated host connection</div>
      <p class="card-sub" style="margin-top:8px">Create the host using the JWT-authenticated admin bank-connections API. Supply the bank-approved endpoint and protocol settings; keep credentials and cryptographic keys in an approved secrets manager, never in the browser or dashboard demo form.</p>
      <pre style="background:var(--bg);padding:12px;border-radius:8px;font-size:.78rem;margin-top:12px;border:1px solid var(--border)">{
  "name": "Community Federal Savings Bank",
  "protocol": "TLS",
  "host": "api.communityfederalsavingsbank.com",
  "port": 443,
  "timeout": 30000,
  "retries": 3,
  "keepAlive": true
}</pre>
      <p class="card-sub" style="margin-top:8px">Endpoint: POST /admin/bank-connections. Protocol values: TCP, TLS, NAC, HTTP.</p>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">3. Check transport reachability</div>
      <p class="card-sub" style="margin-top:8px">POST /admin/bank-connections/{id}/test attempts a TCP connection and closes it immediately. A reachable result confirms only that a TCP socket could be opened at that time. It does not validate TLS, ISO 8583 compatibility, bank credentials, or transaction processing.</p>
    </div>
  </div>
  <div>
    <div class="card">
      <div class="card-title">4. Complete live certification before enabling traffic</div>
      <ul style="padding-left:20px;margin-top:12px;line-height:1.9;color:var(--text2)">
        <li>Implement and test the bank-specific protocol, message framing, authentication, and key management.</li>
        <li>Validate approved transaction flows, declines, timeouts, retries, reversals, duplicate handling, and reconciliation.</li>
        <li>Obtain written bank certification and production connectivity approval before enabling live traffic.</li>
        <li>Monitor connection health and transaction outcomes; maintain incident and credential-rotation procedures.</li>
      </ul>
      <div class="alert alert-warn" style="margin-top:14px">Do not treat a TCP reachability check as a successful bank integration or use it as payment certification.</div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">Related pages</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <a class="btn btn-ghost" href="/platform/banks">Bank Connections demo directory</a>
        <a class="btn btn-ghost" href="/ops/iso8583">ISO 8583 tools</a>
      </div>
    </div>
  </div>
</div>
`);
}
// --- Operator Sign-in --------------------------------------------------------
function loginPage(errorMessage) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Operator Sign-in — PrimeStack</title>
${CSS}
<style>
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.login-card{width:100%;max-width:400px;background:var(--surf);border:1px solid var(--border);border-radius:var(--radius);padding:28px;box-shadow:0 18px 60px rgba(0,0,0,.35)}
.login-mark{display:flex;align-items:center;gap:10px;font-weight:700;font-size:.95rem}
.login-sub{font-size:.78rem;color:var(--muted);margin:4px 0 20px}
.login-card label{display:block;font-size:.72rem;font-weight:700;color:var(--muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.05em}
.login-card input{width:100%;padding:11px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:.9rem;font-family:inherit}
.login-card input:focus{outline:none;border-color:var(--accent)}
.login-card button{width:100%;margin-top:22px;padding:12px;border:none;border-radius:var(--radius-sm);background:var(--accent);color:#fff;font-weight:700;font-size:.9rem;cursor:pointer;font-family:inherit}
.login-card button:disabled{opacity:.6;cursor:default}
.login-err{margin-top:16px;padding:10px 12px;border-radius:var(--radius-sm);background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.4);color:#c0392b;font-size:.8rem}
</style>
</head>
<body>
<div class="login-wrap">
  <form class="login-card" method="POST" action="/login" id="loginForm">
    <div class="login-mark">${svgIcon('grid')}<span>PrimeStack Global Server Network</span></div>
    <div class="login-sub">Operator console — authorised personnel only</div>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    ${errorMessage ? `<div class="login-err">${errorMessage}</div>` : ''}
    <button type="submit" id="loginBtn">Sign in</button>
  </form>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', function () {
  document.getElementById('loginBtn').disabled = true;
  document.getElementById('loginBtn').textContent = 'Signing in…';
});
</script>
</body>
</html>`;
}

function handleLogin(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(loginPage());
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const body = [];
  req.on('data', c => body.push(c));
  req.on('end', () => {
    const params = new URLSearchParams(Buffer.concat(body).toString('utf8'));
    const email = (params.get('email') || '').trim();
    const password = params.get('password') || '';

    if (!email || !password) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(loginPage('Email and password are required.'));
      return;
    }

    const payload = JSON.stringify({ email, password });
    const base = new URL(API_ORIGIN);
    const useTls = base.protocol === 'https:';
    const loginReq = (useTls ? httpsRequest : httpRequest)(
      {
        hostname: base.hostname,
        port: base.port || (useTls ? 443 : 80),
        path: '/admin/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          host: base.host,
        },
      },
      (upstream) => {
        const chunks = [];
        upstream.on('data', c => chunks.push(c));
        upstream.on('end', () => {
          let token = null;
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            token = parsed && parsed.data ? parsed.data.token : null;
          } catch { /* not JSON */ }

          if (!upstream.statusCode || upstream.statusCode >= 400 || !token) {
            res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(loginPage('Incorrect email or password.'));
            return;
          }
          res.writeHead(302, { 'Set-Cookie': sessionCookie(token), Location: '/' });
          res.end();
        });
      }
    );
    loginReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(loginPage('Authentication service unavailable. Please try again shortly.'));
    });
    loginReq.write(payload);
    loginReq.end();
  });
}

// --- HTTP Server -------------------------------------------------------------
const server = createServer((req, res) => {
  const url = req.url || '/';
  const path = url.split('?')[0];

  // -- Health endpoint (public) --
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'dashboard', port: PORT }));
    return;
  }

  // -- Operator sign-in / sign-out (public) --
  if (path === '/login') {
    handleLogin(req, res);
    return;
  }
  if (path === '/logout') {
    res.writeHead(302, { 'Set-Cookie': clearedSessionCookie(), Location: '/login' });
    res.end();
    return;
  }

  // -- Authentication gate --
  const session = readSession(req);
  if (!session) {
    if (path.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', message: 'Operator sign-in required' }));
    } else {
      res.writeHead(302, { Location: '/login' });
      res.end();
    }
    return;
  }

  // -- API proxy --
  if (path.startsWith('/api/')) {
    // health-all
    if (path === '/api/health-all') {
      checkAllHealth().then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      return;
    }
    // bank store
    if (path.startsWith('/api/platform/banks')) {
      handleBankApi(req, res);
      return;
    }
    // payment rails (separate in-process service)
    if (path === '/api/rails/health') {
      proxyRequest(req, res, RAILS_ORIGIN, '/health');
      return;
    }
    if (path.startsWith('/api/rails/')) {
      proxyRequest(req, res, RAILS_ORIGIN, path.slice('/api'.length));
      return;
    }
    // resolve and proxy
    const target = resolveProxy(url);
    proxyRequest(req, res, target.origin, target.path);
    return;
  }

  // -- Page routes --
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  if (path === '/platform/guide') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PRODUCT_GUIDE_HTML);
    return;
  }

  // Legacy redirects
  const redirects = {
    '/admin/dashboard':   '/platform',
    '/ops/whitelist':     '/platform/whitelist',
    '/ops/transactions':  '/merchant/send',
    '/ops/wallets':       '/merchant/balance',
  };
  if (redirects[path]) {
    res.writeHead(302, { Location: redirects[path] });
    res.end();
    return;
  }

  let html = null;
  switch (path) {
    case '/':                      html = landingPage();         break;
    case '/platform':              html = platformOverview();    break;
    case '/platform/banks':        html = platformBanks();       break;
    case '/platform/funding':      html = platformFunding();     break;
    case '/platform/whitelist':    html = platformWhitelist();   break;
    case '/platform/settlement':   html = platformSettlement();  break;
    case '/platform/risk':         html = platformRisk();        break;
    case '/platform/monitoring':   html = platformMonitoring();  break;
    case '/platform/merchants':    html = platformMerchants();   break;
    case '/platform/receive-funds': html = receiveFundsPage();  break;
    case '/platform/server-funds':  html = serverFundsPage();   break;
    case '/platform/rails':         html = railsPage();         break;
    case '/platform/bank-guide':    html = bankIntegrationGuidePage(); break;
    case '/merchant/t2t':           html = t2tEnginePage();     break;
    case '/merchant':              html = merchantDashboard();   break;
    case '/merchant/send':         html = merchantSend();        break;
    case '/merchant/payout':       html = merchantPayout();      break;
    case '/merchant/balance':      html = merchantBalance();     break;
    case '/merchant/terminals':    html = merchantTerminals();   break;
    case '/merchant/keys':         html = merchantKeys();        break;
    case '/merchant/payment-link': html = merchantPaymentLink(); break;
    case '/merchant/terminal-register': html = merchantTerminalRegister(); break;
    case '/merchant/bank-connect':      html = merchantBankConnect();      break;
    case '/merchant/wallet':            html = merchantWallet();            break;
    case '/ops':                   html = opsHub();              break;
    case '/ops/terminals':         html = opsTerminals();        break;
    case '/ops/network':           html = opsNetwork();          break;
    case '/ops/iso8583':           html = opsIso8583();          break;
    case '/admin/svc/ledger':      html = adminLedger();         break;
    case '/admin/svc/ipwhitelist': html = adminIpWhitelist();    break;
    case '/admin/svc/auth':        html = adminAuth();           break;
    case '/admin/svc/terminal':    html = adminTerminal();       break;
    case '/admin/svc/transfer':    html = adminTransfer();       break;
    case '/admin/svc/risk':        html = adminRisk();           break;
    case '/admin/svc/audit':       html = adminAudit();          break;
    case '/admin/svc/settlement':  html = adminSettlement();     break;
    case '/admin/svc/notification':html = adminNotification();   break;
    case '/admin/svc/switchcore':  html = adminSwitchcore();     break;
    case '/admin/svc/security':    html = adminSecurity();       break;
    case '/admin/svc/routing':     html = adminRouting();        break;
    case '/admin/svc/iso8583':     html = adminIso8583();        break;
    case '/admin/svc/crypto':      html = adminCrypto();         break;
    case '/platform/s2s-engine': html = s2sEnginePage();     break;
    case '/admin/svc/gateway':     html = adminGateway();        break;
    default:
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Not Found</title>${CSS}</head><body>
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px">
          <div style="font-size:2rem;font-weight:700">404</div>
          <div style="color:var(--text2)">Page not found: <code>${path}</code></div>
          <a href="/" style="color:var(--accent)">${svgIcon("grid")} Go home</a>
        </div>${dashboardLocalizationScript()}</body></html>`);
      return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html.replace('</body>', `${dashboardLocalizationScript()}</body>`));
});

// Public console port. In the single-service deployment the Fastify API runs
// internally on API_PORT and this console owns the platform-assigned PORT.
const PORT = Number(process.env.PORT || 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
server.listen(PORT, '0.0.0.0', () => {
  console.log(`PrimeStack Dashboard running at http://localhost:${PORT}`);
  console.log(`  Landing:    http://localhost:${PORT}/`);
  console.log(`  Platform:   http://localhost:${PORT}/platform`);
  console.log(`  Merchant:   http://localhost:${PORT}/merchant`);
  console.log(`  Ops:        http://localhost:${PORT}/ops`);
  console.log(`  Monitoring: http://localhost:${PORT}/platform/monitoring`);
});



