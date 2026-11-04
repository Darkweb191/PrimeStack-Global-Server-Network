export const commandCenterHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>PrimeStack | Command Center</title>
  <style>
    :root{color-scheme:dark;--bg:#0B1020;--panel:#121A2B;--panel-raised:#151f33;--border:#1F2B44;--accent:#00D4FF;--success:#00C853;--warning:#FFB300;--risk:#FF5252;--text:#FFFFFF;--muted:#AEB6C4;--sidebar:280px}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    button,input,select{font:inherit}
    button,a{-webkit-tap-highlight-color:transparent}
    a{color:inherit;text-decoration:none}
    .shell{min-height:100vh}
    .sidebar{position:fixed;z-index:5;inset:0 auto 0 0;width:var(--sidebar);display:flex;flex-direction:column;background:#0d1424;border-right:1px solid var(--border);transition:transform .22s ease}
    .brand{height:76px;display:flex;align-items:center;gap:12px;padding:0 24px;border-bottom:1px solid var(--border);font-size:16px;font-weight:750;letter-spacing:.02em}
    .brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;color:#04131a;background:linear-gradient(140deg,#00D4FF,#6cecff);font-size:18px;font-weight:900}
    .brand span{color:var(--accent)}
    .nav-label{padding:22px 24px 8px;color:#77849a;font-size:12px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
    .nav{overflow:auto;padding:0 12px 18px}
    .nav a{display:flex;align-items:center;gap:12px;min-height:42px;padding:9px 12px;margin:3px 0;border:1px solid transparent;border-radius:8px;color:#aeb9cb;font-size:13px;transition:background .15s,color .15s}
    .nav a:hover{background:#151f33;color:#fff}
    .nav a.active{color:#dffaff;background:#102d3a;border-color:#164456}
    .nav-icon{width:20px;text-align:center;color:#8290a8;font-size:15px}
    .nav a.active .nav-icon{color:var(--accent)}
    .nav a .arrow{margin-left:auto;color:#AEB6C4;font-size:11px}
    .nav-group{margin:3px 0;border:1px solid transparent;border-radius:8px}
    .nav-group summary{display:flex;align-items:center;gap:12px;min-height:42px;padding:9px 12px;border-radius:8px;color:#aeb9cb;font-size:13px;cursor:pointer;list-style:none}
    .nav-group summary::-webkit-details-marker{display:none}
    .nav-group summary:hover,.nav-group[open] summary{background:#151f33;color:#fff}
    .nav-group summary:after{content:"⌄";margin-left:auto;color:#AEB6C4;font-size:12px}
    .nav-group[open] summary:after{content:"⌃"}
    .nav-children{padding:0 0 6px 14px}
    .nav-children a{min-height:38px!important;padding:8px 10px!important;font-size:12px!important}
    .nav-children .nav-icon{font-size:15px}
    .nav-group[hidden]{display:none}
    .sidebar-foot{margin-top:auto;padding:16px 20px;border-top:1px solid var(--border);color:#8190a5;font-size:11px}
    .sidebar-foot strong{display:block;color:#dbe4f1;font-size:12px;font-weight:600}
    .workspace{min-height:100vh;margin-left:var(--sidebar)}
    .topbar{position:sticky;top:0;z-index:4;height:76px;display:flex;align-items:center;gap:18px;padding:0 32px;background:rgba(11,16,32,.91);border-bottom:1px solid var(--border);backdrop-filter:blur(16px)}
    .menu-toggle{display:none}
    .search{position:relative;flex:1;max-width:520px}
    .search input{width:100%;height:48px;padding:0 14px 0 38px;border:1px solid var(--border);border-radius:8px;outline:none;background:#0e1728;color:var(--text)}
    .search input:focus{border-color:#167e96}
    .search-icon{position:absolute;left:13px;top:9px;color:#8290a8}
    .top-actions{display:flex;align-items:center;gap:12px;margin-left:auto}
    .top-status{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;white-space:nowrap}
    .status-dot{width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 12px #00c85377}
    .icon-button,.user-button{height:38px;border:1px solid var(--border);border-radius:8px;background:#111a2b;color:#dce5f2;cursor:pointer}
    .icon-button{width:38px;font-size:16px}
    .user-button{display:flex;align-items:center;gap:9px;padding:0 11px}
    .avatar{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:#14384a;color:var(--accent);font-size:11px;font-weight:700}
    main{max-width:1560px;margin:0 auto;padding:28px 32px 44px}
    .page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}
    .eyebrow{color:var(--accent);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    h1{margin:5px 0 3px;font-size:32px;line-height:1.25;letter-spacing:-.025em}
    .subtitle{color:var(--muted);font-size:12px}
    .heading-actions{display:flex;align-items:center;gap:9px}
    select,.button{height:36px;padding:0 11px;border:1px solid var(--border);border-radius:7px;background:#111a2b;color:#e6edf7}
    .button{display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}
    .button:hover,.icon-button:hover,.user-button:hover{border-color:#3c5577}
    .button.primary{border-color:#08677d;background:#083747;color:#dffaff}
    .period{font-size:12px}
    .notice{display:none;margin:0 0 16px;padding:10px 13px;border:1px solid #73484b;border-radius:8px;background:#2b1b24;color:#ffc5c5;font-size:12px}
    .notice.visible{display:block}
    .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:17px}
    .card{min-width:0;border:1px solid var(--border);border-radius:11px;background:linear-gradient(145deg,#121A2B,#101727);box-shadow:0 8px 28px #00000012}
    .kpi{position:relative;overflow:hidden;padding:17px 18px}
    .kpi:after{position:absolute;right:-25px;top:-34px;width:94px;height:94px;border:1px solid #ffffff09;border-radius:50%;content:""}
    .kpi-top{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:12px}
    .kpi-icon{display:grid;place-items:center;width:29px;height:29px;border:1px solid var(--border);border-radius:8px;background:#16243a;color:var(--accent)}
    .kpi-value{margin-top:11px;font-size:26px;font-weight:700;letter-spacing:-.03em}
    .kpi-foot{margin-top:2px;color:#8592a6;font-size:10px}
    .accent{color:var(--accent)}.green{color:var(--success)}.amber{color:var(--warning)}.red{color:var(--risk)}
    .content-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,1fr);gap:15px}
    .column{display:grid;align-content:start;gap:15px;min-width:0}
    .panel{padding:17px 18px}
    .network-banner{display:grid;grid-template-columns:minmax(185px,.65fr) minmax(0,2fr);align-items:center;gap:14px;margin-bottom:14px;padding:14px 18px}
    .network-banner .panel-head{margin:0}
    .network-banner .status-list{display:flex;flex-wrap:wrap;gap:8px}
    .network-banner .panel-note .status-dot{display:inline-block;vertical-align:middle}
    .network-banner .status-item{min-width:140px;flex:1;padding:8px 9px}
    .panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:15px}
    h2{margin:0;font-size:16px;font-weight:650;letter-spacing:.005em}
    .panel-note{margin-top:3px;color:#8491a5;font-size:10px}
    .text-link{color:var(--accent);font-size:11px;white-space:nowrap}
    .text-link:hover{text-decoration:underline}
    .volume-list{display:grid;gap:14px}
    .volume-row{display:grid;grid-template-columns:54px minmax(0,1fr) auto;align-items:center;gap:12px}
    .currency{color:#d6e2f2;font-size:11px;font-weight:700}
    .volume-main{min-width:0}
    .volume-value{font-size:12px;font-weight:650;font-variant-numeric:tabular-nums}
    .volume-count{margin-top:2px;color:#8b98ab;font-size:10px}
    .bar-track{height:4px;margin-top:7px;overflow:hidden;border-radius:99px;background:#1c2a40}
    .bar-fill{height:100%;min-width:3px;border-radius:99px;background:linear-gradient(90deg,#087c9a,var(--accent))}
    .status-list{display:grid;gap:10px}
    .status-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #1d2a40;border-radius:8px;background:#10192a}
    .status-name{display:flex;align-items:center;gap:9px;color:#d4deec;font-size:11px}
    .status-count{color:#fff;font-size:12px;font-weight:650;font-variant-numeric:tabular-nums}
    .pill{padding:3px 7px;border:1px solid #235a40;border-radius:99px;background:#10281f;color:#73e5a2;font-size:9px}
    .pill.warn{border-color:#765d2c;background:#2b2417;color:#ffd378}
    .pill.bad{border-color:#743b43;background:#2c1c24;color:#ff9da5}
    .bank-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));align-items:end;gap:12px;margin:0 0 16px}
    .bank-form label{display:grid;gap:5px;color:#b6c1d1;font-size:11px}
    .bank-form input,.bank-form select{width:100%;height:40px;padding:0 10px;border:1px solid var(--border);border-radius:7px;background:#0b1220;color:var(--text)}
    .bank-form .button{width:100%}
    .bank-account-form{margin-top:14px}
    .bank-profile-management{margin-top:24px;padding-top:20px;border-top:1px solid var(--border)}
    .bank-profile-management h3{margin:0 0 6px;font-size:14px}
    .bank-profile-actions{display:flex;gap:8px;align-items:center}
    .bank-action.danger{border-color:#73484b;color:#ffb4ba}
    .bank-note{margin:-4px 0 14px;color:#8b98ab;font-size:11px}
    .bank-feedback{min-height:20px;margin:0 0 8px;color:#73e5a2;font-size:11px}
    .bank-feedback.bad{color:#ff9da5}
    .bank-action{min-height:36px;padding:0 10px;border:1px solid #235a40;border-radius:7px;background:#10281f;color:#b3f2cc;font-size:11px;cursor:pointer}
    .bank-action:disabled{opacity:.55;cursor:wait}
    .table-wrap{overflow:auto}
    table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}
    th{padding:9px 8px;border-bottom:1px solid var(--border);color:#8795aa;font-size:9px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
    td{padding:11px 8px;border-bottom:1px solid #1a2538;color:#d5deeb;font-size:10px}
    tbody tr:last-child td{border-bottom:0}
    .empty{padding:17px 8px;color:#8b98ab;font-size:11px;text-align:center}
    .merchant-name{max-width:220px;overflow:hidden;text-overflow:ellipsis}
    .event-list{display:grid;gap:0}
    .event{display:grid;grid-template-columns:9px minmax(0,1fr) auto;align-items:start;gap:10px;padding:10px 0;border-bottom:1px solid #1a2538}
    .event:last-child{border-bottom:0}
    .event-mark{width:7px;height:7px;margin-top:5px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px #00d4ff66}
    .event-title{overflow:hidden;color:#dce5f2;font-size:10px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
    .event-source{margin-top:2px;color:#8896aa;font-size:9px}
    .event-time{color:#8390a4;font-size:9px;white-space:nowrap}
    .shortcuts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .data-split{grid-template-columns:repeat(2,minmax(0,1fr))}
    .shortcut{display:flex;align-items:center;gap:10px;min-height:55px;padding:10px;border:1px solid var(--border);border-radius:8px;background:#10192a;transition:border-color .15s,transform .15s}
    .shortcut:hover{transform:translateY(-1px);border-color:#167e96}
    .shortcut-icon{display:grid;place-items:center;width:30px;height:30px;flex:0 0 auto;border-radius:8px;background:#142b3c;color:var(--accent)}
    .shortcut strong{display:block;font-size:12px;font-weight:600}
    .shortcut small{display:block;margin-top:2px;color:#8b98ab;font-size:12px}
    .footnote{margin-top:14px;color:#758298;font-size:9px}
    .login-wrap{display:none;position:fixed;z-index:20;inset:0;place-items:center;padding:20px;background:#080d19}
    .login-wrap.visible{display:grid}
    .login-card{width:min(100%,390px);padding:25px;border:1px solid var(--border);border-radius:13px;background:#111a2b;box-shadow:0 20px 80px #0008}
    .login-card h2{margin:0 0 5px;font-size:18px}
    .login-card p{margin:0 0 18px;color:var(--muted);font-size:12px}
    .login-card label{display:grid;gap:6px;margin:12px 0;color:#b6c1d1;font-size:12px}
    .login-card input{height:48px;padding:0 11px;border:1px solid var(--border);border-radius:7px;outline:0;background:#0b1220;color:white}
    .login-card input:focus{border-color:#167e96}
    .login-card .button{width:100%;height:39px;margin-top:8px}
    .login-error{min-height:16px;margin-top:9px;color:#ff9da5;font-size:12px}
    .backdrop{display:none}
    .mobile-nav{display:none}
    .skip-link{position:fixed;z-index:30;left:12px;top:12px;transform:translateY(-160%);padding:12px 16px;border:2px solid var(--accent);border-radius:8px;background:var(--panel);color:var(--text);font-size:14px;font-weight:700}
    .skip-link:focus{transform:translateY(0)}
    :focus-visible{outline:3px solid var(--accent)!important;outline-offset:3px;box-shadow:0 0 0 5px #0B1020,0 0 0 8px #00d4ff66}
    body.keyboard-navigation :focus{outline:3px solid var(--accent)!important;outline-offset:3px;box-shadow:0 0 0 5px #0B1020,0 0 0 8px #00d4ff66}
    .sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    .accessibility-menu{position:relative}
    .accessibility-panel{position:absolute;z-index:10;right:0;top:calc(100% + 10px);width:min(320px,calc(100vw - 28px));padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--panel);box-shadow:0 14px 36px #0008}
    .accessibility-panel[hidden]{display:none}
    .accessibility-panel h2{margin:0 0 8px;font-size:16px}
    .setting{display:flex;align-items:center;gap:12px;min-height:48px;margin:4px 0;padding:7px 4px;color:var(--text);font-size:14px;cursor:pointer}
    .setting input{width:20px;height:20px;accent-color:var(--accent)}
    .table-caption{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    .mobile-nav a{min-height:64px;align-content:center;padding:4px 2px}
    .mobile-nav a span:first-child{font-size:24px}
    .mobile-nav a span:last-child{font-size:12px}
    .sidebar .nav a,.sidebar .nav-group summary{min-height:56px;padding:12px 16px;margin:4px 0;font-size:14px}
    .nav a[hidden]{display:none}
    .sidebar .nav-label{padding-top:18px;padding-bottom:8px}
    .button,.icon-button,.user-button,.menu-toggle,select{min-height:48px}
    .icon-button,.menu-toggle,.user-button{min-width:48px}
    .heading-actions{gap:12px}
    .heading-actions select{min-width:132px;padding:0 12px}
    .text-link{display:inline-flex;align-items:center;min-height:48px;padding:0 6px;font-size:12px}
    .shortcut{min-height:64px;padding:12px;gap:12px}
    .volume-list,.status-list{gap:12px}
    .status-item{min-height:48px;padding:10px 12px}
    .table-wrap{max-height:460px}
    thead th{position:sticky;top:0;z-index:1;background:#121a2b}
    th{padding:12px 10px;font-size:12px}
    td{padding:12px 10px;font-size:12px}
    .eyebrow,.subtitle,.panel-note,.kpi-foot,.volume-count,.currency,.status-name,.event-title,.event-source,.event-time,.footnote,.pill,.sidebar-foot,.nav a .arrow,.empty{font-size:12px}
    .nav-icon{font-size:18px}
    .status-dot{position:relative;flex:0 0 auto}
    .status-glyph{display:inline-grid;place-items:center;min-width:22px;height:22px;border:1px solid currentColor;border-radius:50%;font-size:13px;font-weight:800}
    .network-banner .panel-note .status-dot{width:10px;height:10px}
    .network-banner .status-indicator{display:inline-flex;align-items:center;gap:7px;color:var(--text)}
    .login-wrap{overflow-y:auto}
    .login-wrap[hidden]{display:none!important}
    .login-card{max-height:calc(100vh - 40px);overflow:auto}
    .error-summary{padding:12px 14px}
    body.high-contrast{--bg:#070a12;--panel:#101522;--panel-raised:#171e2b;--border:#fff;--muted:#fff}
    body.high-contrast .sidebar,body.high-contrast .topbar,body.high-contrast .mobile-nav{background:#070a12}
    body.high-contrast .card,body.high-contrast .panel,body.high-contrast .status-item,body.high-contrast .shortcut{background:#101522}
    body.high-contrast .panel-note,body.high-contrast .kpi-foot,body.high-contrast .volume-count,body.high-contrast .currency,body.high-contrast .status-name,body.high-contrast .event-source,body.high-contrast .event-time,body.high-contrast .footnote,body.high-contrast .sidebar-foot,body.high-contrast .nav a{color:#fff}
    body.large-text{font-size:17px}
    body.large-text .nav a,body.large-text .nav-label,body.large-text .setting,body.large-text .subtitle,body.large-text .panel-note,body.large-text .kpi-top,body.large-text .kpi-foot,body.large-text .volume-count,body.large-text .currency,body.large-text .status-name,body.large-text .event-title,body.large-text .event-source,body.large-text .event-time,body.large-text .footnote,body.large-text th,body.large-text td,body.large-text .text-link,body.large-text .eyebrow,body.large-text .pill,body.large-text .shortcut strong,body.large-text .shortcut small,body.large-text .login-card p,body.large-text .login-card label{font-size:15px}
    body.large-text .kpi-value{font-size:30px}
    body.large-text h1{font-size:36px}
    body.large-text h2{font-size:18px}
    body.large-text .button,body.large-text select,input{font-size:16px}
    body.large-text .mobile-nav a span:last-child{font-size:13px}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
    body.reduced-motion *,body.reduced-motion *::before,body.reduced-motion *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
    @media(max-width:600px){.table-wrap{max-height:none;overflow:visible}table,tbody{display:block;width:100%;white-space:normal}thead{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}thead th{position:static}tbody{display:grid;gap:10px}tbody tr{display:grid;gap:0;padding:7px 12px;border:1px solid var(--border);border-radius:9px;background:#101727}tbody td{display:grid;grid-template-columns:minmax(94px,38%) minmax(0,1fr);gap:10px;align-items:start;padding:8px 0;border-bottom:1px solid #1a2538;overflow-wrap:anywhere;white-space:normal}tbody td::before{content:attr(data-label);color:var(--muted);font-size:12px;font-weight:650}tbody td:last-child{border-bottom:0}tbody td.empty{display:block;border:0}tbody td.empty::before{content:none}.table-caption{position:static;width:auto;height:auto;padding:0;margin:0 0 8px;overflow:visible;clip:auto;white-space:normal;border:0;color:var(--muted);font-size:12px}}
    @media(max-width:1180px){:root{--sidebar:248px}.topbar{padding:0 24px}main{padding:24px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.content-grid{grid-template-columns:minmax(0,1.4fr) minmax(275px,1fr)}.shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:860px){.sidebar{transform:translateX(-100%)}.sidebar.open{transform:translateX(0)}.workspace{margin-left:0}.menu-toggle{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid var(--border);border-radius:8px;background:#111a2b;color:#fff;cursor:pointer}.backdrop.visible{position:fixed;z-index:4;inset:0;display:block;background:#0009}.content-grid{grid-template-columns:1fr}.column.secondary{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.network-banner{grid-template-columns:1fr}.secondary .shortcuts-panel{grid-column:1/-1}}
    @media(max-width:600px){.topbar{height:62px;gap:10px;padding:0 14px}.search{max-width:none}.search input{height:48px}.search-icon{top:14px}.top-status,.user-label,.icon-button{display:none}.user-button{padding:0 6px}.page-heading{display:block}.heading-actions{margin-top:14px;flex-wrap:wrap}.kpis{grid-template-columns:1fr;gap:9px}.kpi{padding:13px}.kpi-value{font-size:22px}.kpi-top{font-size:12px}.kpi-icon{width:32px;height:32px}main{padding:20px 14px 86px}h1{font-size:24px}.column.secondary{grid-template-columns:1fr}.network-banner .status-list{display:grid;grid-template-columns:1fr 1fr}.network-banner .status-item{min-width:0}.secondary .shortcuts-panel{grid-column:auto}.shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}.column>.data-split{grid-template-columns:1fr}.panel{padding:14px}.volume-row{grid-template-columns:42px minmax(0,1fr) auto;gap:8px}.mobile-nav{position:fixed;z-index:3;inset:auto 0 0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));column-gap:8px;min-height:72px;padding:4px 8px calc(4px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:#0d1424}.mobile-nav a{display:grid;min-height:64px;align-content:center;justify-items:center;gap:2px;padding:4px 2px;color:#91a0b5;font-size:12px}.mobile-nav a span:first-child{font-size:24px}.mobile-nav a.active{color:var(--accent)}}
  </style>
</head>
<body>
<a class="skip-link" href="#main-content">Skip to main content</a>
<div class="shell" id="shell">
  <aside class="sidebar" id="sidebar" aria-label="Main navigation">
    <a class="brand" href="/admin/dashboard" aria-label="PrimeStack command center"><span class="brand-mark">P</span><span>PRIME<span>STACK</span></span></a>
    <div class="nav-label">Operations</div>
    <nav class="nav">
      <details class="nav-group" open>
        <summary><span class="nav-icon" aria-hidden="true">◫</span>Overview &amp; monitoring</summary>
        <div class="nav-children">
          <a class="active" aria-current="page" href="/admin/dashboard"><span class="nav-icon" aria-hidden="true">◫</span>Command Center</a>
          <a href="/admin/intelligence-dashboard"><span class="nav-icon" aria-hidden="true">⌁</span>Network &amp; analytics</a>
        </div>
      </details>
      <details class="nav-group">
        <summary><span class="nav-icon" aria-hidden="true">⇄</span>Payments &amp; finance</summary>
        <div class="nav-children">
          <a href="/docs"><span class="nav-icon" aria-hidden="true">⇄</span>Transactions <span class="arrow">API</span></a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">⟳</span>Settlement <span class="arrow">API</span></a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">▤</span>Ledger <span class="arrow">API</span></a>
          <a href="/admin/wallet-dashboard"><span class="nav-icon" aria-hidden="true">◉</span>Wallet operations</a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">◈</span>Treasury <span class="arrow">API</span></a>
          <a href="/admin/swift-payout-draft"><span class="nav-icon" aria-hidden="true">⇢</span>SWIFT payout drafts</a>
        </div>
      </details>
      <details class="nav-group">
        <summary><span class="nav-icon" aria-hidden="true">♙</span>Merchant operations</summary>
        <div class="nav-children">
          <a href="/admin/merchant-dashboard"><span class="nav-icon" aria-hidden="true">♙</span>Merchant acquiring</a>
          <a href="/admin/merchant-home"><span class="nav-icon" aria-hidden="true">⌂</span>Merchant home preview</a>
        </div>
      </details>
      <details class="nav-group">
        <summary><span class="nav-icon" aria-hidden="true">▣</span>Network &amp; risk</summary>
        <div class="nav-children">
          <a href="/docs"><span class="nav-icon" aria-hidden="true">▣</span>Terminals <span class="arrow">API</span></a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">⇢</span>Routing <span class="arrow">API</span></a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">▦</span>ISO 8583 gateway <span class="arrow">API</span></a>
          <a href="#bank-connections"><span class="nav-icon" aria-hidden="true">▤</span>Bank connections</a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">⛨</span>Fraud &amp; risk <span class="arrow">API</span></a>
          <a href="/admin/governance-dashboard"><span class="nav-icon" aria-hidden="true">⚖</span>Compliance &amp; governance</a>
        </div>
      </details>
      <details class="nav-group">
        <summary><span class="nav-icon" aria-hidden="true">⌘</span>Platform &amp; administration</summary>
        <div class="nav-children">
          <a href="/admin/developer-platform-dashboard"><span class="nav-icon" aria-hidden="true">⌘</span>Developer platform</a>
          <a href="/admin/pag-dashboard"><span class="nav-icon" aria-hidden="true">◇</span>PrimeStack Asset Gateway</a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">♙</span>Users &amp; access <span class="arrow">API</span></a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">⚙</span>Notifications &amp; settings <span class="arrow">API</span></a>
          <a href="/docs"><span class="nav-icon" aria-hidden="true">⌕</span>API reference</a>
        </div>
      </details>
    </nav>
    <div class="sidebar-foot"><strong>PrimeStack Financial OS</strong>Operations workspace · Read-only overview</div>
  </aside>
  <div class="backdrop" id="backdrop"></div>
  <div class="workspace">
    <header class="topbar">
      <button class="menu-toggle" id="menu-toggle" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">☰</button>
      <div class="search"><span class="search-icon" aria-hidden="true">⌕</span><input id="nav-search" type="search" placeholder="Find a workspace or module" aria-label="Find a workspace or module"></div>
      <div class="top-actions">
        <div class="top-status" aria-hidden="true"><span class="status-dot" id="topbar-dot" style="background:var(--muted);box-shadow:none"></span><span id="topbar-status">Awaiting data</span></div>
        <div class="accessibility-menu">
          <button class="user-button" id="accessibility-toggle" type="button" aria-controls="accessibility-panel" aria-expanded="false"><span aria-hidden="true">⚙</span> <span class="user-label">Accessibility</span></button>
          <section class="accessibility-panel" id="accessibility-panel" aria-labelledby="accessibility-title" hidden>
            <h2 id="accessibility-title">Accessibility preferences</h2>
            <label class="setting"><input type="checkbox" id="high-contrast"> High contrast</label>
            <label class="setting"><input type="checkbox" id="large-text"> Larger text</label>
            <label class="setting"><input type="checkbox" id="reduced-motion"> Reduce motion</label>
            <label class="setting"><input type="checkbox" id="pause-refresh"> Pause automatic refresh</label>
            <label class="setting"><input type="checkbox" id="screen-reader-optimized"> Screen-reader mode (pause live updates)</label>
            <label class="setting"><input type="checkbox" id="keyboard-navigation"> Keyboard navigation (always show focus)</label>
          </section>
        </div>
        <button class="icon-button" id="refresh" type="button" aria-label="Refresh dashboard now" title="Refresh dashboard">↻</button>
        <button class="user-button" id="account-button" type="button" aria-label="Sign out of PrimeStack"><span class="avatar" id="avatar" aria-hidden="true">A</span><span class="user-label" id="identity">Administrator</span><span aria-hidden="true">⌄</span></button>
      </div>
    </header>
    <main id="main-content" tabindex="-1">
      <section class="page-heading">
        <div><div class="eyebrow">Operations overview</div><h1>Command Center</h1><div class="subtitle">Your network at a glance. Activity reflects recorded platform data · Updated <time id="updated-at">—</time></div></div>
        <div class="heading-actions"><label class="subtitle" for="days">Period</label><select id="days" class="period" aria-label="Reporting period"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select><button class="button primary" id="refresh-main"><span>↻</span> Refresh</button></div>
      </section>
      <div class="notice error-summary" id="error" role="alert" aria-live="assertive"></div>
      <section class="card network-banner" aria-label="Network status">
        <div class="panel-head"><div><h2>Network status</h2><div class="panel-note">Recorded host and terminal status summary · <span class="status-indicator"><span class="status-dot" id="overall-dot" aria-hidden="true" style="background:var(--muted);box-shadow:none"></span><span id="overall-status" role="status" aria-live="polite" aria-atomic="true">Awaiting data</span></span></div></div><a class="text-link" href="/admin/intelligence-dashboard">Details ↗</a></div>
        <div class="status-list" id="network-status" role="list" aria-label="Recorded host and terminal status"><div class="empty">Sign in to load network status.</div></div>
      </section>
      <section class="card panel section" id="bank-connections" aria-labelledby="bank-title">
        <div class="panel-head"><div><h2 id="bank-title">Bank connections</h2><div class="panel-note">Manage bank host endpoints used by routing.</div></div><button class="button" id="bank-refresh" type="button">Refresh list</button></div>
        <p class="bank-note">Connection test checks only whether a TCP socket can reach the configured host and port. It does not send an ISO 8583 message, payment, or bank instruction.</p>
        <form class="bank-form" id="bank-form">
          <label>Bank / connection name<input name="name" maxlength="100" required autocomplete="organization"></label>
          <label>Host name or IP<input name="host" maxlength="253" required autocomplete="off" placeholder="switch.bank.example"></label>
          <label>Port<input name="port" type="number" min="1" max="65535" value="5000" required inputmode="numeric"></label>
          <label>Protocol<select name="protocol"><option>TCP</option><option>TLS</option><option>NAC</option><option>HTTP</option></select></label>
          <label>Timeout (ms)<input name="timeout" type="number" min="1000" max="120000" value="10000" required inputmode="numeric"></label>
          <button class="button primary" id="bank-add" type="submit">Add bank connection</button>
        </form>
        <div class="bank-feedback" id="bank-feedback" role="status" aria-live="polite"></div>
        <div class="table-wrap"><table aria-label="Bank host connections"><thead><tr><th scope="col">Name</th><th scope="col">Endpoint</th><th scope="col">Protocol</th><th scope="col">Status</th><th scope="col">Last connected</th><th scope="col">Test</th></tr></thead><tbody id="bank-connections-list"><tr><td class="empty" colspan="6">Sign in to load bank connections.</td></tr></tbody></table></div>
        <div class="bank-profile-management" id="bank-account-management" hidden>
          <div class="panel-head"><div><h3>Bank account details</h3><div class="panel-note">Sensitive fields are encrypted before storage. Full account numbers cannot be viewed again; only the last four digits are displayed.</div></div></div>
          <p class="bank-note">Encryption requires BANK_DETAILS_ENCRYPTION_KEY to be configured on the server. Keep that key in a secrets manager and back it up separately from the database.</p>
          <form class="bank-form bank-account-form" id="bank-account-form" autocomplete="off">
            <label>Bank name<input name="bankName" maxlength="100" required></label>
            <label>Bank address<input name="bankAddress" maxlength="200" required></label>
            <label>Account name<input name="accountName" maxlength="120" required></label>
            <label>Account signatory<input name="accountSignatory" maxlength="120" required></label>
            <label>Account number<input name="accountNumber" type="password" maxlength="40" inputmode="numeric" required autocomplete="new-password"></label>
            <label>Wire routing number<input name="wireRoutingNumber" type="password" maxlength="9" inputmode="numeric" required autocomplete="new-password"></label>
            <label>SWIFT (USD)<input name="swiftUsd" maxlength="11" required autocapitalize="characters"></label>
            <label>SWIFT (other currencies)<input name="swiftOtherCurrency" maxlength="11" required autocapitalize="characters"></label>
            <button class="button primary" id="bank-account-add" type="submit">Save encrypted account</button>
          </form>
          <div class="bank-feedback" id="bank-account-feedback" role="status" aria-live="polite"></div>
          <div class="table-wrap"><table aria-label="Saved bank account profiles"><thead><tr><th scope="col">Bank</th><th scope="col">Account</th><th scope="col">Saved</th><th scope="col">Actions</th></tr></thead><tbody id="bank-account-profiles-list"><tr><td class="empty" colspan="4">Sign in to load saved accounts.</td></tr></tbody></table></div>
        </div>
      </section>
      <section class="kpis" aria-label="Transaction overview">
        <article class="card kpi"><div class="kpi-top"><span>Transactions</span><span class="kpi-icon" aria-hidden="true">⇄</span></div><div class="kpi-value" id="tx-total">—</div><div class="kpi-foot" id="period-label">Recorded in selected period</div></article>
        <article class="card kpi"><div class="kpi-top"><span>Successful</span><span class="kpi-icon green" aria-hidden="true">✓</span></div><div class="kpi-value green" id="tx-successful">—</div><div class="kpi-foot">Authorized, captured, or settled</div></article>
        <article class="card kpi"><div class="kpi-top"><span>Declined</span><span class="kpi-icon red" aria-hidden="true">×</span></div><div class="kpi-value red" id="tx-declined">—</div><div class="kpi-foot">Recorded declined transactions</div></article>
        <article class="card kpi"><div class="kpi-top"><span>Success rate</span><span class="kpi-icon" aria-hidden="true">％</span></div><div class="kpi-value accent" id="tx-rate">—</div><div class="kpi-foot">Observed successful transactions / total</div></article>
      </section>
      <section class="content-grid">
        <div class="column">
          <article class="card panel">
            <div class="panel-head"><div><h2>Successful transaction volume</h2><div class="panel-note">Amounts remain separated by currency; not settled revenue</div></div><a class="text-link" href="/admin/intelligence-dashboard">Analytics ↗</a></div>
            <div class="volume-list" id="volume-list" role="list" aria-label="Successful transaction volume by currency"><div class="empty">Sign in to load observed volume.</div></div>
          </article>
          <article class="card panel">
            <div class="panel-head"><div><h2>Recent transaction activity</h2><div class="panel-note">Latest recorded transactions · refreshes every 15 seconds</div></div><a class="text-link" href="/docs">Transaction APIs ↗</a></div>
            <div class="table-wrap"><table role="table"><caption class="table-caption">Latest recorded transactions, refreshed every 15 seconds while automatic refresh is enabled.</caption><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Time</th><th scope="col" role="columnheader">Reference</th><th scope="col" role="columnheader">Merchant</th><th scope="col" role="columnheader">Terminal</th><th scope="col" role="columnheader">Amount</th><th scope="col" role="columnheader">Route</th><th scope="col" role="columnheader">Status</th></tr></thead><tbody id="transactions" role="rowgroup"><tr role="row"><td class="empty" role="cell" colspan="7">Sign in to load recent transactions.</td></tr></tbody></table></div>
          </article>
          <div class="shortcuts data-split">
            <article class="card panel">
              <div class="panel-head"><div><h2>Active liquidity pool snapshots</h2><div class="panel-note">Configured pool values; not independently verified cash positions</div></div><a class="text-link" href="/docs">Treasury APIs ↗</a></div>
              <div class="status-list" id="liquidity" role="list" aria-label="Active liquidity pool snapshots"><div class="empty">Sign in to load pool snapshots.</div></div>
            </article>
            <article class="card panel">
              <div class="panel-head"><div><h2>Settlement batches</h2><div class="panel-note">Current recorded batch statuses</div></div><a class="text-link" href="/docs">Settlement APIs ↗</a></div>
              <div class="status-list" id="settlements" role="list" aria-label="Settlement batch counts by status"><div class="empty">Sign in to load settlement statuses.</div></div>
            </article>
          </div>
          <article class="card panel">
            <div class="panel-head"><div><h2>Top merchant activity</h2><div class="panel-note">By successful transaction count in the selected period</div></div><a class="text-link" href="/admin/merchant-home">Merchant home ↗</a></div>
            <div class="table-wrap"><table role="table"><caption class="table-caption">Top merchant activity by successful transaction count in the selected period.</caption><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Merchant</th><th scope="col" role="columnheader">Currency</th><th scope="col" role="columnheader">Successful volume</th><th scope="col" role="columnheader">Transactions</th></tr></thead><tbody id="merchants" role="rowgroup"><tr role="row"><td class="empty" role="cell" colspan="4">Sign in to load merchant activity.</td></tr></tbody></table></div>
          </article>
        </div>
        <div class="column secondary">
          <article class="card panel">
            <div class="panel-head"><div><h2>Intelligence activity</h2><div class="panel-note">Recent analyst/system observations</div></div><a class="text-link" href="/admin/intelligence-dashboard">View all ↗</a></div>
            <div class="event-list" id="events" role="list" aria-label="Recent intelligence activity"><div class="empty">Sign in to load recent activity.</div></div>
          </article>
          <article class="card panel">
            <div class="panel-head"><div><h2>Risk evaluations</h2><div class="panel-note">Recorded evaluation levels in the selected period; not open case counts</div></div><a class="text-link" href="/docs">Risk APIs ↗</a></div>
            <div class="status-list" id="risk-levels" role="list" aria-label="Recorded risk evaluation levels"><div class="empty">Sign in to load risk evaluation counts.</div></div>
          </article>
          <article class="card panel shortcuts-panel">
            <div class="panel-head"><div><h2>Workspaces</h2><div class="panel-note">Open an available operations interface</div></div></div>
            <div class="shortcuts">
              <a class="shortcut" href="/admin/wallet-dashboard"><span class="shortcut-icon" aria-hidden="true">◉</span><span><strong>Wallets</strong><small>Accounts &amp; balances</small></span></a>
              <a class="shortcut" href="/admin/merchant-home"><span class="shortcut-icon" aria-hidden="true">♙</span><span><strong>Merchant home</strong><small>Admin preview of selected merchant</small></span></a>
              <a class="shortcut" href="/admin/governance-dashboard"><span class="shortcut-icon" aria-hidden="true">⚖</span><span><strong>Governance</strong><small>Risk &amp; controls</small></span></a>
              <a class="shortcut" href="/admin/developer-platform-dashboard"><span class="shortcut-icon" aria-hidden="true">⌘</span><span><strong>API platform</strong><small>Partners &amp; credentials</small></span></a>
              <a class="shortcut" href="/admin/pag-dashboard"><span class="shortcut-icon" aria-hidden="true">◇</span><span><strong>Asset gateway</strong><small>Digital asset operations</small></span></a>
              <a class="shortcut" href="/admin/intelligence-dashboard"><span class="shortcut-icon" aria-hidden="true">▥</span><span><strong>Intelligence</strong><small>Read-only analytics</small></span></a>
              <a class="shortcut" href="/admin/swift-payout-draft"><span class="shortcut-icon" aria-hidden="true">⇢</span><span><strong>Payment drafts</strong><small>SWIFT message builder</small></span></a>
              <a class="shortcut" href="/docs"><span class="shortcut-icon" aria-hidden="true">⌘</span><span><strong>API reference</strong><small>Routes &amp; contracts</small></span></a>
            </div>
          </article>
        </div>
      </section>
      <div class="footnote">Read-only overview · Transaction amounts are not revenue or profit. Liquidity values are configured pool snapshots. Operational actions are not executed from this dashboard. The transaction feed refreshes every 15 seconds.</div>
    </main>
  </div>
  <nav class="mobile-nav" aria-label="Quick navigation"><a class="active" aria-current="page" href="/admin/dashboard"><span aria-hidden="true">◫</span><span>Dashboard</span></a><a href="/docs"><span aria-hidden="true">⇄</span><span>Transactions</span></a><a href="/admin/intelligence-dashboard"><span aria-hidden="true">⌁</span><span>Network</span></a><a href="/docs"><span aria-hidden="true">◈</span><span>Treasury</span></a><a href="/admin/governance-dashboard"><span aria-hidden="true">⚖</span><span>Risk</span></a></nav>
</div>
<section class="login-wrap" id="login" aria-modal="true" role="dialog" aria-labelledby="login-title" aria-describedby="login-description" hidden>
  <form class="login-card" id="login-form">
    <span class="brand-mark" aria-hidden="true">P</span><h2 id="login-title">Welcome back</h2><p id="login-description">Sign in with your PrimeStack administrator account.</p>
    <label>Email address<input id="login-email" name="email" type="email" autocomplete="username" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="button primary" type="submit">Sign in to Command Center</button>
    <div class="login-error" id="login-error" role="alert"></div>
  </form>
</section>
<script>
(()=> {
  const tokenKey="commandCenterToken",roleKey="commandCenterRole",emailKey="commandCenterEmail";
  const allowed=["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"];
  const $=id=>document.getElementById(id);
  const number=value=>Number(value||0).toLocaleString();
  const safeText=(node,value)=>{node.textContent=value==null?"—":String(value);};
  let refreshInProgress=false;
  let preferenceStorageWarningShown=false;
  function reportPreferenceStorageError(error){if(preferenceStorageWarningShown)return;preferenceStorageWarningShown=true;console.warn("Unable to access saved dashboard accessibility preferences.",error);}
  function signOut(){sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(roleKey);sessionStorage.removeItem(emailKey);$("shell").inert=true;$("login").hidden=false;$("login").classList.add("visible");$("login-email").focus();}
  function setPreference(key,enabled){document.body.classList.toggle(key,enabled);try{localStorage.setItem("commandCenter:"+key,String(enabled));}catch(error){reportPreferenceStorageError(error);}}
  function loadPreference(key,control,defaultValue=false){let stored=null;try{stored=localStorage.getItem("commandCenter:"+key);}catch(error){reportPreferenceStorageError(error);}const enabled=stored===null?defaultValue:stored==="true";$(control).checked=enabled;document.body.classList.toggle(key,enabled);return enabled;}
  function showError(error){const message=error instanceof Error?error.message:String(error);if($("shell").inert){safeText($("login-error"),message);return;}safeText($("error"),message);$("error").classList.add("visible");}
  async function parsePayload(response){const body=await response.text();if(!body)return{};try{return JSON.parse(body);}catch{throw Error("Server returned a non-JSON response (HTTP "+response.status+"). Confirm the PrimeStack application API is running.");}}
  async function api(path,options={}){const response=await fetch(path,{...options,headers:{"Authorization":"Bearer "+sessionStorage.getItem(tokenKey),"Content-Type":"application/json",...(options.headers||{})},cache:"no-store"});const payload=await parsePayload(response);if(response.status===401){signOut();throw Error("Your session expired. Please sign in again.");}if(!response.ok||!payload.success)throw Error(payload.error?.message||"Dashboard request failed (HTTP "+response.status+")");return payload.data;}
  function appendCell(row,value,label,className){const cell=document.createElement("td");cell.setAttribute("role","cell");cell.textContent=value==null?"—":String(value);cell.dataset.label=label;if(className)cell.className=className;row.appendChild(cell);}
  function appendEmpty(body,message,columnCount){const row=document.createElement("tr");row.setAttribute("role","row");const cell=document.createElement("td");cell.setAttribute("role","cell");cell.colSpan=columnCount;cell.className="empty";cell.textContent=message;row.appendChild(cell);body.replaceChildren(row);}
  function fillVolumes(rows){const list=$("volume-list");list.replaceChildren();if(!rows.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No successful transaction volume recorded for this period.";list.appendChild(empty);return;}const maxCount=Math.max(...rows.map(row=>Number(row.count||0)),1);for(const item of rows){const row=document.createElement("div");row.className="volume-row";row.setAttribute("role","listitem");const currency=document.createElement("div");currency.className="currency";currency.textContent=item.currency;const main=document.createElement("div");main.className="volume-main";const amount=document.createElement("div");amount.className="volume-value";amount.textContent=item.amount;const count=document.createElement("div");count.className="volume-count";count.textContent=number(item.count)+" successful transactions";const track=document.createElement("div");track.className="bar-track";track.setAttribute("aria-hidden","true");const fill=document.createElement("div");fill.className="bar-fill";fill.style.width=Math.max(2,Number(item.count||0)/maxCount*100)+"%";track.appendChild(fill);main.append(amount,count,track);row.append(currency,main);list.appendChild(row);}}
  function fillMerchants(rows){const body=$("merchants");body.replaceChildren();if(!rows.length){appendEmpty(body,"No merchant activity recorded for this period.",4);return;}for(const merchant of rows.slice(0,6)){const row=document.createElement("tr");row.setAttribute("role","row");appendCell(row,merchant.merchantCode+" · "+merchant.merchantName,"Merchant");appendCell(row,merchant.currency,"Currency");appendCell(row,merchant.successfulAmount,"Successful volume");appendCell(row,number(merchant.successfulTransactions),"Transactions");body.appendChild(row);}}
  function fillStatuses(data){
    const list=$("network-status");
    list.replaceChildren();
    const groups=[["Hosts",data.operations.hostStatuses],["Terminals",data.operations.terminalStatuses]];
    const healthyStatuses=["ONLINE","HEALTHY","ACTIVE","UP","CONNECTED"];
    let total=0,issues=0,critical=0;
    for(const [label,rows] of groups){
      for(const item of rows){
        const count=Number(item.count);
        const isCritical=["ERROR","CRITICAL"].includes(item.status);
        const isHealthy=healthyStatuses.includes(item.status);
        const hasIssue=!isHealthy;
        total+=count;
        if(hasIssue)issues+=count;
        if(isCritical)critical+=count;
        const row=document.createElement("div");
        row.className="status-item";
        row.setAttribute("role","listitem");
        const name=document.createElement("span");
        name.className="status-name";
        const dot=document.createElement("span");
        dot.className="status-dot";
        dot.setAttribute("aria-hidden","true");
        if(isCritical)dot.style.background="var(--risk)";
        else if(hasIssue)dot.style.background="var(--warning)";
        const glyph=document.createElement("span");
        glyph.className="status-glyph";
        glyph.setAttribute("aria-hidden","true");
        glyph.textContent=isCritical?"✖":isHealthy?"✓":"⚠";
        const text=document.createElement("span");
        text.textContent=label+" · "+item.status.replace(/_/g," ");
        name.append(dot,glyph,text);
        const value=document.createElement("span");
        value.className="status-count";
        value.textContent=number(count);
        row.append(name,value);
        list.appendChild(row);
      }
    }
    if(!total){
      const empty=document.createElement("div");
      empty.className="empty";
      empty.textContent="No host or terminal status records available.";
      list.appendChild(empty);
    }
    const summary=critical?"Critical: "+critical+" critical status"+(critical===1?"":"es")+" reported":issues?"Warning: "+issues+" warning or unknown status"+(issues===1?"":"es")+" reported":total?"Operational: no recorded status issues":"Status unavailable";
    $("overall-status").textContent=summary;
    $("topbar-status").textContent=summary;
    const color=critical?"var(--risk)":issues?"var(--warning)":total?"var(--success)":"var(--muted)";
    $("overall-dot").style.background=color;
    $("topbar-dot").style.background=color;
  }
  function fillTransactions(rows){const body=$("transactions");body.replaceChildren();if(!rows.length){appendEmpty(body,"No recent transactions recorded.",7);return;}for(const item of rows){const row=document.createElement("tr");row.setAttribute("role","row");appendCell(row,new Date(item.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}),"Time");appendCell(row,item.reference,"Reference");appendCell(row,item.merchant,"Merchant","merchant-name");appendCell(row,item.terminal||"—","Terminal");appendCell(row,item.amount+" "+item.currency,"Amount");appendCell(row,item.route||"—","Route");const status=document.createElement("td");status.setAttribute("role","cell");status.dataset.label="Status";const badge=document.createElement("span");const failed=["DECLINED","FAILED","EXPIRED"].includes(item.status);const successful=["APPROVED","AUTHORIZED","CAPTURED","SETTLED","COMPLETED","SUCCESS","SUCCEEDED"].includes(item.status);badge.className="pill"+(failed?" bad":successful?"":" warn");badge.textContent=(failed?"✖ ":successful?"✓ ":"⚠ ")+item.status.replace(/_/g," ");status.appendChild(badge);row.appendChild(status);body.appendChild(row);}}
  function fillLiquidity(rows){const list=$("liquidity");list.replaceChildren();if(!rows.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No active liquidity pools recorded.";list.appendChild(empty);return;}for(const item of rows){const row=document.createElement("div");row.className="status-item";row.setAttribute("role","listitem");const name=document.createElement("span");name.className="status-name";name.textContent=item.currency+" · Available "+item.available;const value=document.createElement("span");value.className="status-count";value.textContent="Reserved "+item.reserved;row.append(name,value);list.appendChild(row);}}
  function fillCounts(id,rows,label){
    const list=$(id);
    list.replaceChildren();
    if(!rows.length){
      const empty=document.createElement("div");
      empty.className="empty";
      empty.textContent="No "+label+" recorded.";
      list.appendChild(empty);
      return;
    }
    for(const item of rows){
      const status=item.status||item.level;
      const row=document.createElement("div");
      row.className="status-item";
      row.setAttribute("role","listitem");
      const name=document.createElement("span");
      name.className="status-name";
      const glyph=document.createElement("span");
      glyph.className="status-glyph";
      glyph.setAttribute("aria-hidden","true");
      const isCritical=["HIGH","CRITICAL","FAILED","ERROR"].includes(status);
      const isPositive=["COMPLETED","SETTLED","LOW","STANDARD","AUTHORIZED"].includes(status);
      glyph.classList.add(isCritical?"red":isPositive?"green":"amber");
      glyph.textContent=isCritical?"✖":isPositive?"✓":"⚠";
      name.append(glyph,document.createTextNode(status.replace(/_/g," ")));
      const value=document.createElement("span");
      value.className="status-count";
      value.textContent=number(item.count);
      row.append(name,value);
      list.appendChild(row);
    }
  }
  function fillEvents(rows){const list=$("events");list.replaceChildren();if(!rows.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No intelligence observations recorded.";list.appendChild(empty);return;}for(const item of rows.slice(0,5)){const row=document.createElement("div");row.className="event";row.setAttribute("role","listitem");const mark=document.createElement("span");mark.className="event-mark";mark.setAttribute("aria-hidden","true");const content=document.createElement("div");const title=document.createElement("div");title.className="event-title";title.textContent=item.eventType.replace(/_/g," ");const source=document.createElement("div");source.className="event-source";source.textContent=item.sourceSystem+" · "+item.summary;content.append(title,source);const time=document.createElement("time");time.className="event-time";time.dateTime=item.createdAt;time.textContent=new Date(item.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});row.append(mark,content,time);list.appendChild(row);}}
  function canManageBankConnections(){return ["SUPER_ADMIN","ADMIN","OPERATOR"].includes(sessionStorage.getItem(roleKey));}
  function canManageBankProfiles(){return ["SUPER_ADMIN","ADMIN"].includes(sessionStorage.getItem(roleKey));}
  function bankFeedback(message,bad=false){safeText($("bank-feedback"),message);$("bank-feedback").classList.toggle("bad",bad);}
  function bankAccountFeedback(message,bad=false){safeText($("bank-account-feedback"),message);$("bank-account-feedback").classList.toggle("bad",bad);}
  async function loadBankConnections(){
    const body=$("bank-connections-list");
    $("bank-form").hidden=!canManageBankConnections();
    try{
      const connections=await api("/admin/bank-connections");
      body.replaceChildren();
      if(!connections.length){appendEmpty(body,"No bank connections configured.",6);return;}
      for(const connection of connections){
        const row=document.createElement("tr");
        appendCell(row,connection.name,"Name");
        appendCell(row,connection.host+":"+connection.port,"Endpoint");
        appendCell(row,connection.protocol,"Protocol");
        const statusCell=document.createElement("td");
        statusCell.dataset.label="Status";
        const status=document.createElement("span");
        status.className="pill "+(connection.status==="CONNECTED"?"":"warn");
        status.textContent=connection.status;
        statusCell.appendChild(status);
        row.appendChild(statusCell);
        appendCell(row,connection.lastConnectedAt?new Date(connection.lastConnectedAt).toLocaleString():"Never","Last connected");
        const actionCell=document.createElement("td");
        actionCell.dataset.label="Test";
        const testButton=document.createElement("button");
        testButton.type="button";
        testButton.className="bank-action";
        testButton.textContent="Test TCP";
        testButton.disabled=!canManageBankConnections();
        testButton.setAttribute("aria-label","Test TCP reachability for "+connection.name);
        testButton.addEventListener("click",async()=>{
          testButton.disabled=true;
          testButton.textContent="Testing…";
          bankFeedback("Testing TCP reachability to "+connection.host+":"+connection.port+"…");
          try{
            const result=await api("/admin/bank-connections/"+encodeURIComponent(connection.id)+"/test",{method:"POST"});
            bankFeedback(result.message+" ("+result.latencyMs+" ms)",!result.reachable);
            await loadBankConnections();
          }catch(error){
            bankFeedback(error instanceof Error?error.message:String(error),true);
          }finally{
            testButton.disabled=false;
          }
        });
        actionCell.appendChild(testButton);
        row.appendChild(actionCell);
        body.appendChild(row);
      }
    }catch(error){
      appendEmpty(body,"Unable to load bank connections.",6);
      bankFeedback(error instanceof Error?error.message:String(error),true);
    }
  }
  async function loadBankAccountProfiles(){
    const section=$("bank-account-management");
    section.hidden=!canManageBankProfiles();
    if(section.hidden)return;
    const body=$("bank-account-profiles-list");
    try{
      const profiles=await api("/admin/bank-account-profiles");
      body.replaceChildren();
      if(!profiles.length){appendEmpty(body,"No bank account profiles saved.",4);return;}
      for(const profile of profiles){
        const row=document.createElement("tr");
        appendCell(row,profile.bankName,"Bank");
        appendCell(row,"•••• "+profile.accountLast4,"Account");
        appendCell(row,new Date(profile.createdAt).toLocaleString(),"Saved");
        const actionCell=document.createElement("td");
        actionCell.dataset.label="Actions";
        const remove=document.createElement("button");
        remove.type="button";
        remove.className="bank-action danger";
        remove.textContent="Delete";
        remove.setAttribute("aria-label","Delete "+profile.bankName+" account ending in "+profile.accountLast4);
        remove.addEventListener("click",async()=>{
          if(!window.confirm("Delete the encrypted account profile ending in "+profile.accountLast4+"?"))return;
          remove.disabled=true;
          try{
            await api("/admin/bank-account-profiles/"+encodeURIComponent(profile.id),{method:"DELETE"});
            bankAccountFeedback("Encrypted bank account profile deleted.");
            await loadBankAccountProfiles();
          }catch(error){
            bankAccountFeedback(error instanceof Error?error.message:String(error),true);
          }finally{
            remove.disabled=false;
          }
        });
        actionCell.appendChild(remove);
        row.appendChild(actionCell);
        body.appendChild(row);
      }
    }catch(error){
      appendEmpty(body,"Unable to load saved bank account profiles.",4);
      bankAccountFeedback(error instanceof Error?error.message:String(error),true);
    }
  }
  $("bank-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!canManageBankConnections()){bankFeedback("Your role cannot add bank connections.",true);return;}
    const submit=$("bank-add");
    submit.disabled=true;
    bankFeedback("Adding bank connection…");
    try{
      const values=Object.fromEntries(new FormData(event.currentTarget));
      const payload={...values,port:Number(values.port),timeout:Number(values.timeout),retries:3,keepAlive:true};
      await api("/admin/bank-connections",{method:"POST",body:JSON.stringify(payload)});
      event.currentTarget.reset();
      bankFeedback("Bank connection added. Run Test TCP to verify host reachability.");
      await loadBankConnections();
    }catch(error){
      bankFeedback(error instanceof Error?error.message:String(error),true);
    }finally{
      submit.disabled=false;
    }
  });
  $("bank-refresh").addEventListener("click",loadBankConnections);
  $("bank-account-form").addEventListener("submit",async event=>{
    event.preventDefault();
    if(!canManageBankProfiles()){bankAccountFeedback("Only administrators can manage bank account profiles.",true);return;}
    const submit=$("bank-account-add");
    submit.disabled=true;
    bankAccountFeedback("Encrypting and saving bank account details…");
    try{
      const values=Object.fromEntries(new FormData(event.currentTarget));
      await api("/admin/bank-account-profiles",{method:"POST",body:JSON.stringify(values)});
      event.currentTarget.reset();
      bankAccountFeedback("Account details saved encrypted. The full account number is not returned or displayed.");
      await loadBankAccountProfiles();
    }catch(error){
      bankAccountFeedback(error instanceof Error?error.message:String(error),true);
    }finally{
      submit.disabled=false;
    }
  });
  async function refresh(){if(refreshInProgress)return;refreshInProgress=true;try{const data=await api("/admin/intelligence/dashboard?days="+$("days").value);$("error").classList.remove("visible");$("tx-total").textContent=number(data.transactions.currentTotal);$("tx-successful").textContent=number(data.transactions.currentSuccessful);$("tx-declined").textContent=number(data.transactions.currentDeclined);$("tx-rate").textContent=data.transactions.successRatePercent===null?"—":data.transactions.successRatePercent+"%";$("period-label").textContent="Recorded in the last "+$("days").value+" days";fillVolumes(data.transactions.successfulVolumeByCurrency);fillTransactions(data.recentTransactions);fillLiquidity(data.liquidityPoolsByCurrency);fillCounts("settlements",data.settlements.statuses,"settlement batches");fillCounts("risk-levels",data.riskLevels,"risk evaluations");fillMerchants(data.topMerchants);fillStatuses(data);fillEvents(data.events);await loadBankConnections();await loadBankAccountProfiles();const now=new Date();const lastRefresh=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"});$("updated-at").dateTime=now.toISOString();$("updated-at").textContent=lastRefresh;$("refresh").title="Last updated "+lastRefresh;}catch(error){showError(error);}finally{refreshInProgress=false;}}
  $("login-form").addEventListener("submit",async event=>{event.preventDefault();$("login-error").textContent="";const form=event.currentTarget;try{const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form))),cache:"no-store"});const payload=await parsePayload(response);if(!response.ok||!payload.success)throw Error(payload.error?.message||"Sign-in failed (HTTP "+response.status+")");if(!allowed.includes(payload.data.user.role))throw Error("Your administrator role cannot access this workspace.");sessionStorage.setItem(tokenKey,payload.data.token);sessionStorage.setItem(roleKey,payload.data.user.role);sessionStorage.setItem(emailKey,payload.data.user.email);$("login").classList.remove("visible");$("login").hidden=true;$("shell").inert=false;$("identity").textContent=payload.data.user.email;$("avatar").textContent=payload.data.user.email.slice(0,1).toUpperCase();$("main-content").focus();await refresh();}catch(error){$("login-error").textContent=error instanceof Error?error.message:String(error);}});
  $("refresh").addEventListener("click",refresh);$("refresh-main").addEventListener("click",refresh);$("days").addEventListener("change",refresh);
  window.setInterval(()=>{if(sessionStorage.getItem(tokenKey)&&document.visibilityState==="visible"&&!$("pause-refresh").checked&&!$("screen-reader-optimized").checked&&!document.activeElement.closest("input,select,textarea,[contenteditable=true]")&&!$("transactions").contains(document.activeElement))refresh();},15000);
  $("accessibility-toggle").addEventListener("click",()=>{const panel=$("accessibility-panel");const expanded=$("accessibility-toggle").getAttribute("aria-expanded")==="true";panel.hidden=expanded;$("accessibility-toggle").setAttribute("aria-expanded",String(!expanded));if(!expanded)panel.querySelector("input").focus();});
  $("accessibility-panel").addEventListener("keydown",event=>{if(event.key==="Escape"){$("accessibility-panel").hidden=true;$("accessibility-toggle").setAttribute("aria-expanded","false");$("accessibility-toggle").focus();}});
  $("high-contrast").addEventListener("change",event=>setPreference("high-contrast",event.currentTarget.checked));
  $("large-text").addEventListener("change",event=>setPreference("large-text",event.currentTarget.checked));
  $("reduced-motion").addEventListener("change",event=>setPreference("reduced-motion",event.currentTarget.checked));
  loadPreference("high-contrast","high-contrast");loadPreference("large-text","large-text");loadPreference("reduced-motion","reduced-motion",window.matchMedia("(prefers-reduced-motion: reduce)").matches);loadPreference("pause-refresh","pause-refresh");loadPreference("screen-reader-optimized","screen-reader-optimized");loadPreference("keyboard-navigation","keyboard-navigation");
  $("pause-refresh").addEventListener("change",event=>setPreference("pause-refresh",event.currentTarget.checked));
  $("screen-reader-optimized").addEventListener("change",event=>setPreference("screen-reader-optimized",event.currentTarget.checked));
  $("keyboard-navigation").addEventListener("change",event=>setPreference("keyboard-navigation",event.currentTarget.checked));
  $("account-button").addEventListener("click",()=>{if(sessionStorage.getItem(tokenKey)&&window.confirm("Sign out of PrimeStack?"))signOut();});
  $("nav-search").addEventListener("input",event=>{const query=event.currentTarget.value.trim().toLowerCase();document.querySelectorAll(".nav-group").forEach(group=>{const links=[...group.querySelectorAll(".nav-children a")];const groupMatches=!!query&&group.querySelector("summary").textContent.toLowerCase().includes(query);for(const link of links)link.hidden=!!query&&!groupMatches&&!link.textContent.toLowerCase().includes(query);const visible=links.some(link=>!link.hidden);group.hidden=!!query&&!visible;if(query&&visible)group.open=true;});});
  const mobileQuery=window.matchMedia("(max-width: 860px)");
  function setSidebarOpen(open){const isMobile=mobileQuery.matches;const isModalDrawer=open&&isMobile;$("sidebar").classList.toggle("open",open);$("backdrop").classList.toggle("visible",isModalDrawer);$("menu-toggle").setAttribute("aria-expanded",String(open));$("menu-toggle").setAttribute("aria-label",open?"Close navigation":"Open navigation");$("sidebar").setAttribute("aria-hidden",String(isMobile&&!open));$("sidebar").inert=isMobile&&!open;if(isModalDrawer){$("sidebar").setAttribute("role","dialog");$("sidebar").setAttribute("aria-modal","true");}else{$("sidebar").removeAttribute("role");$("sidebar").removeAttribute("aria-modal");}if(isModalDrawer)$("sidebar").querySelector(".nav a:not([hidden])")?.focus();}
  $("menu-toggle").addEventListener("click",()=>setSidebarOpen(!$("sidebar").classList.contains("open")));
  $("backdrop").addEventListener("click",()=>{setSidebarOpen(false);$("menu-toggle").focus();});
  $("sidebar").addEventListener("keydown",event=>{const links=[...$("sidebar").querySelectorAll(".nav a:not([hidden])")];if(event.key==="Escape"){setSidebarOpen(false);$("menu-toggle").focus();return;}if(event.key==="Tab"&&mobileQuery.matches&&links.length){if(event.shiftKey&&document.activeElement===links[0]){event.preventDefault();links[links.length-1].focus();}else if(!event.shiftKey&&document.activeElement===links[links.length-1]){event.preventDefault();links[0].focus();}return;}if(!["ArrowDown","ArrowUp"].includes(event.key)||!links.length)return;const index=links.indexOf(document.activeElement);if(index<0)return;event.preventDefault();links[(index+(event.key==="ArrowDown"?1:-1)+links.length)%links.length].focus();});
  $("login").addEventListener("keydown",event=>{if(event.key!=="Tab")return;const focusable=[...$("login").querySelectorAll("input:not([disabled]),button:not([disabled])")];const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
  mobileQuery.addEventListener("change",()=>{if(mobileQuery.matches&&$("sidebar").contains(document.activeElement))$("menu-toggle").focus();setSidebarOpen(false);});
  setSidebarOpen(false);
  const role=sessionStorage.getItem(roleKey);if(sessionStorage.getItem(tokenKey)&&allowed.includes(role)){$("shell").inert=false;$("login").hidden=true;const email=sessionStorage.getItem(emailKey)||"Administrator";$("identity").textContent=email;$("avatar").textContent=email.slice(0,1).toUpperCase();refresh();}else signOut();
})();
</script>
</body>
</html>`;
