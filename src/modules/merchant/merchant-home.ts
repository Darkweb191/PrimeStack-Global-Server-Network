export const merchantHomeHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="robots" content="noindex,nofollow">
  <title>Merchant Home | PrimeStack</title>
  <style>
    :root{color-scheme:light;--bg:#eef2f7;--panel:#ffffff;--raised:#f8fafc;--border:#d8e0ea;--accent:#2563eb;--success:#16804a;--warning:#a66a08;--risk:#c2414b;--text:#172338;--muted:#66758a;--sidebar:252px}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text);font:13px/1.5 "Segoe UI",Arial,sans-serif}
    a{color:inherit;text-decoration:none}
    button,input,select{font:inherit}
    button,a{-webkit-tap-highlight-color:transparent}
    button{min-height:40px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:#ffffff;color:var(--text);cursor:pointer}
    button:hover,a:hover{border-color:var(--accent)}
    button:disabled{cursor:not-allowed;opacity:.65}
    :focus-visible{outline:3px solid var(--accent)!important;outline-offset:3px;box-shadow:0 0 0 5px var(--bg),0 0 0 8px #155eef55}
    .skip-link{position:fixed;z-index:20;left:12px;top:12px;transform:translateY(-160%);padding:12px 16px;border:2px solid var(--accent);border-radius:8px;background:var(--panel);font-size:14px;font-weight:700}
    .skip-link:focus{transform:translateY(0)}
    .app{min-height:100vh}
    .sidebar{position:fixed;inset:0 auto 0 0;width:var(--sidebar);display:flex;flex-direction:column;border-right:1px solid var(--border);background:#f8fafc}
    .brand{height:64px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--border);font-size:15px;font-weight:750}
    .brand-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:8px;background:var(--accent);color:#ffffff;font-size:18px;font-weight:800}
    .brand-name span{color:var(--accent)}
    .nav-label{padding:16px 16px 7px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
    nav{display:grid;gap:4px;padding:0 12px}
    nav a,nav .unavailable{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 12px;border:1px solid transparent;border-radius:8px;color:#26364d}
    nav a[aria-current=page]{border-color:#c9d8f5;background:#edf3ff;color:var(--accent)}
    nav a:focus-visible{border-color:var(--accent)}
    nav .nav-icon{width:24px;text-align:center;font-size:18px}
    nav .unavailable{color:#68788c}
    nav .soon{margin-left:auto;font-size:12px}
    .sidebar-note{margin-top:auto;padding:16px 20px;border-top:1px solid var(--border);color:var(--muted);font-size:12px}
    .workspace{min-height:100vh;margin-left:var(--sidebar)}
    .topbar{position:sticky;top:0;z-index:3;min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 24px;border-bottom:1px solid var(--border);background:#ffffffed;backdrop-filter:blur(14px)}
    .preview-label{color:var(--warning);font-size:12px;font-weight:700}
    .top-actions{display:flex;align-items:center;gap:12px}
    .top-actions .identity{color:var(--muted);font-size:12px}
    .menu-toggle{display:none}
    main{max-width:1560px;margin:auto;padding:22px 24px 40px}
    .page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px}
    .eyebrow{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
    h1{margin:4px 0;font-size:28px;line-height:1.2}
    h2{margin:0;font-size:17px;line-height:1.3}
    .subtitle,.muted{color:var(--muted);font-size:12px}
    .merchant-picker{display:grid;grid-template-columns:auto minmax(210px,320px);align-items:center;gap:10px}
    select,input{min-height:40px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:#ffffff;color:var(--text)}
    .actions{display:flex;flex-wrap:wrap;gap:10px}
    .button-primary{border-color:var(--accent);background:var(--accent);color:#ffffff}
    .button-link{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 14px;border:1px solid var(--border);border-radius:8px;background:#ffffff}
    .notice{display:none;margin:0 0 16px;padding:12px 14px;border:1px solid #d99a9a;border-radius:8px;background:#fff1f0;color:#8f1d18;font-size:14px}
    .notice.visible{display:block}
    .status-banner{display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:12px 14px;border:1px solid var(--border);border-radius:9px;background:var(--panel);font-size:14px}
    .status-banner .status-icon{display:grid;place-items:center;width:24px;height:24px;border:1px solid currentColor;border-radius:50%;font-weight:800}
    .status-banner[data-state=ACTIVE] .status-icon{color:var(--success)}
    .status-banner[data-state=WARNING] .status-icon{color:var(--warning)}
    .status-banner[data-state=CRITICAL] .status-icon{color:var(--risk)}
    .status-banner .status-meta{margin-left:auto;color:var(--muted);font-size:12px}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}
    .card{min-width:0;border:1px solid var(--border);border-radius:10px;background:var(--panel);box-shadow:0 4px 14px rgba(23,35,56,.05)}
    .metric{padding:14px}
    .metric-label{color:var(--muted);font-size:11px}
    .metric-value{margin-top:6px;font-size:21px;font-weight:700;font-variant-numeric:tabular-nums}
    .metric-support{margin-top:4px;color:var(--muted);font-size:11px}
    .content-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr);align-items:start;gap:15px}
    .column{display:grid;gap:15px;min-width:0}
    .panel{padding:15px}
    .panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
    .panel-note{margin-top:4px;color:var(--muted);font-size:12px}
    .text-link{display:inline-flex;align-items:center;min-height:40px;padding:0 6px;color:var(--accent);font-size:11px}
    .table-wrap{max-height:420px;overflow:auto}
    table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}
    caption{padding:0 0 8px;color:var(--muted);font-size:12px;text-align:left}
    th,td{padding:8px 8px;border-bottom:1px solid #e2e8f0;font-size:11px}
    th{position:sticky;top:0;z-index:1;background:var(--raised);color:#344054;font-weight:650}
    td{color:#344054}
    tbody tr:last-child td{border-bottom:0}
    .empty{padding:18px 8px;color:var(--muted);font-size:14px;text-align:center}
    .table-status{display:inline-flex;align-items:center;gap:7px}
    .table-status-icon{display:inline-grid;place-items:center;width:22px;height:22px;border:1px solid currentColor;border-radius:50%;font-weight:800}
    .ok{color:var(--success)}.warn{color:var(--warning)}.bad{color:var(--risk)}
    .balance-list,.settlement-list,.terminal-list{display:grid;gap:9px}
    .balance-item,.settlement-item,.terminal-item{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;padding:10px 12px;border:1px solid #e0e7ef;border-radius:8px;background:#f8fafc}
    .item-label{font-size:14px;font-weight:600}
    .item-sub{margin-top:2px;color:var(--muted);font-size:12px}
    .item-value{text-align:right;font-size:14px;font-weight:650;font-variant-numeric:tabular-nums}
    .quick-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .quick-link{display:flex;align-items:center;gap:10px;min-height:54px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:#f8fafc}
    .quick-link-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#eff4ff;color:#1849a9;font-size:18px}
    .quick-link-label{font-size:14px;font-weight:600}
    .quick-link-note{color:var(--muted);font-size:12px}
    .login-wrap{position:fixed;z-index:10;inset:0;display:grid;place-items:center;padding:20px;background:#f3f6faee}
    .login-wrap[hidden]{display:none}
    .login-card{width:min(100%,420px);padding:24px;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
    .login-card h2{margin-bottom:6px}
    .login-card p{margin:0 0 18px;color:var(--muted);font-size:14px}
    .login-card form{display:grid;gap:12px}
    .login-card label{display:grid;gap:6px;color:var(--muted);font-size:14px}
    .login-error{min-height:20px;color:#8f1d18;font-size:14px}
    .mobile-nav{display:none}
    .hidden{display:none!important}
    body.high-contrast{--bg:#fff;--panel:#fff;--border:#111;--text:#000;--muted:#222;--accent:#00566b}
    body.large-text{font-size:17px}
    body.large-text .metric-label,body.large-text .metric-support,body.large-text .muted,body.large-text .subtitle,body.large-text .panel-note,body.large-text .item-sub,body.large-text .quick-link-note,body.large-text caption,body.large-text th,body.large-text td,body.large-text .text-link{font-size:15px}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
    @media(max-width:1120px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.content-grid{grid-template-columns:1fr}.column.secondary{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:800px){.sidebar{z-index:6;transform:translateX(-100%);transition:transform .2s ease}.sidebar.open{transform:translateX(0)}.workspace{margin-left:0}.menu-toggle{display:inline-flex;align-items:center;justify-content:center;min-width:48px}.backdrop{display:none}.backdrop.visible{position:fixed;z-index:5;inset:0;display:block;background:#17233866}.topbar{min-height:64px;padding:8px 14px}.column.secondary{grid-template-columns:1fr}.page-head{align-items:flex-start;flex-direction:column}main{padding:22px 16px 92px}}
    @media(max-width:600px){.topbar{gap:10px}.preview-label{font-size:12px}.top-actions .identity{display:none}h1{font-size:26px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.metric{padding:13px}.metric-value{font-size:20px}.merchant-picker{width:100%;grid-template-columns:1fr}.quick-links{grid-template-columns:1fr}.table-wrap{max-height:none;overflow:visible}table,tbody{display:block;width:100%;white-space:normal}thead{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}tbody{display:grid;gap:10px}tbody tr{display:grid;padding:8px 12px;border:1px solid var(--border);border-radius:9px;background:#ffffff}tbody td{display:grid;grid-template-columns:minmax(90px,38%) minmax(0,1fr);gap:10px;padding:8px 0;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere;white-space:normal}tbody td::before{content:attr(data-label);color:var(--muted);font-size:12px;font-weight:650}tbody td:last-child{border-bottom:0}tbody td.empty{display:block;border:0}tbody td.empty::before{content:none}.mobile-nav{position:fixed;z-index:4;inset:auto 0 0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));column-gap:8px;min-height:72px;padding:4px 8px calc(4px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:#ffffff}.mobile-nav a{display:grid;min-height:64px;align-content:center;justify-items:center;gap:2px;border:0;color:#26364d;font-size:12px}.mobile-nav a span:first-child{font-size:22px}}
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <div class="app" id="app">
    <aside class="sidebar" id="sidebar" aria-label="Merchant preview navigation">
      <a class="brand" href="/admin/merchant-home" aria-label="PrimeStack merchant dashboard home"><span class="brand-mark" aria-hidden="true">P</span><span class="brand-name">PRIME<span>STACK</span></span></a>
      <div class="nav-label">Merchant workspace</div>
      <nav aria-label="Merchant workspace">
        <a href="#main-content" aria-current="page"><span class="nav-icon" aria-hidden="true">⌂</span>Dashboard</a>
        <a href="#transactions"><span class="nav-icon" aria-hidden="true">⇄</span>Transactions</a>
        <a href="#wallet"><span class="nav-icon" aria-hidden="true">◉</span>Wallet</a>
        <a href="#settlements"><span class="nav-icon" aria-hidden="true">⟳</span>Settlements</a>
        <a href="#terminals"><span class="nav-icon" aria-hidden="true">▣</span>Terminals</a>
      </nav>
      <div class="nav-label">More</div>
      <nav aria-label="More merchant tools">
        <a href="/admin/merchant-dashboard"><span class="nav-icon" aria-hidden="true">⚙</span>Merchant management</a>
        <a href="/docs"><span class="nav-icon" aria-hidden="true">⌘</span>API documentation</a>
        <span class="unavailable"><span class="nav-icon" aria-hidden="true">▤</span>Reports <span class="soon">Coming soon</span></span>
        <span class="unavailable"><span class="nav-icon" aria-hidden="true">♙</span>Team &amp; permissions <span class="soon">Coming soon</span></span>
      </nav>
      <div class="sidebar-note">Authenticated administrator preview · Read-only summary</div>
    </aside>
    <div class="backdrop" id="backdrop"></div>
    <div class="workspace">
      <header class="topbar">
        <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">☰</button>
        <div class="preview-label">ADMIN PREVIEW · NOT A MERCHANT LOGIN</div>
        <div class="top-actions"><span class="identity" id="identity"></span><button id="refresh" type="button" aria-label="Refresh merchant dashboard">Refresh</button><button id="logout" type="button">Sign out</button></div>
      </header>
      <main id="main-content" tabindex="-1">
        <div class="page-head">
          <div><div class="eyebrow">Merchant home</div><h1 id="welcome">Welcome to PrimeStack</h1><div class="subtitle">Read-only activity overview. Transaction volume is not revenue; balances are ledger account snapshots. Updated <time id="last-updated">Waiting for data</time></div></div>
          <div class="merchant-picker"><label for="merchant-select">Preview merchant</label><select id="merchant-select" aria-label="Select a merchant for the admin preview"><option value="">Loading merchants…</option></select></div>
        </div>
        <div class="notice" id="error" role="alert" aria-live="assertive"></div>
        <section class="status-banner" id="merchant-status" data-state="WARNING" aria-label="Merchant account status">
          <span class="status-icon" aria-hidden="true">!</span><span id="merchant-status-text">Select a merchant to load its status.</span><span class="status-meta" id="merchant-code"></span>
        </section>
        <section class="metrics" aria-label="Merchant activity summary">
          <article class="card metric"><div class="metric-label">Today · approved volume</div><div class="metric-value" id="today-volume">—</div><div class="metric-support" id="today-count">Awaiting merchant data</div></article>
          <article class="card metric"><div class="metric-label">Month to date · approved volume</div><div class="metric-value" id="month-volume">—</div><div class="metric-support" id="month-count">Awaiting merchant data</div></article>
          <article class="card metric"><div class="metric-label">Available ledger balance</div><div class="metric-value" id="available-balance">—</div><div class="metric-support">Balance less held funds, by currency</div></article>
          <article class="card metric"><div class="metric-label">Terminals online</div><div class="metric-value" id="terminal-count">—</div><div class="metric-support" id="terminal-support">Awaiting merchant data</div></article>
        </section>
        <div class="content-grid">
          <div class="column">
            <section class="card panel" id="transactions" aria-labelledby="transactions-heading">
              <div class="panel-head"><div><h2 id="transactions-heading">Recent transactions</h2><div class="panel-note">Latest merchant transactions · statuses and amounts from recorded transactions</div></div><a class="text-link" href="/docs">Transaction API ↗</a></div>
              <div class="table-wrap"><table><caption>Recent transactions for the selected merchant.</caption><thead><tr><th scope="col">Reference</th><th scope="col">Terminal</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Time</th></tr></thead><tbody id="transaction-rows"><tr><td class="empty" colspan="6">Select a merchant to load transactions.</td></tr></tbody></table></div>
            </section>
            <section class="card panel" id="settlements" aria-labelledby="settlements-heading">
              <div class="panel-head"><div><h2 id="settlements-heading">Settlements</h2><div class="panel-note">Recorded settlement batches; this model does not assign a currency to batch amounts. <span id="settlement-summary"></span></div></div><a class="text-link" href="/docs">Settlement API ↗</a></div>
              <div class="settlement-list" id="settlement-list" role="list" aria-label="Recent settlement batches"><div class="empty">Select a merchant to load settlements.</div></div>
            </section>
          </div>
          <div class="column secondary">
            <section class="card panel" id="wallet" aria-labelledby="wallet-heading">
              <div class="panel-head"><div><h2 id="wallet-heading">Wallet &amp; ledger balances</h2><div class="panel-note">Merchant settlement accounts by currency</div></div><a class="text-link" href="/docs">Statement API ↗</a></div>
              <div class="balance-list" id="balance-list" role="list" aria-label="Merchant balances by currency"><div class="empty">Select a merchant to load balances.</div></div>
            </section>
            <section class="card panel" id="terminals" aria-labelledby="terminals-heading">
              <div class="panel-head"><div><h2 id="terminals-heading">Terminals</h2><div class="panel-note">Status from the latest recorded terminal health data</div></div><a class="text-link" href="/docs">Terminal API ↗</a></div>
              <div class="terminal-list" id="terminal-list" role="list" aria-label="Merchant terminal status"><div class="empty">Select a merchant to load terminals.</div></div>
            </section>
            <section class="card panel" aria-labelledby="tools-heading">
              <div class="panel-head"><div><h2 id="tools-heading">Quick access</h2><div class="panel-note">Available merchant workspaces</div></div></div>
              <div class="quick-links">
                <a class="quick-link" href="/admin/merchant-dashboard"><span class="quick-link-icon" aria-hidden="true">⚙</span><span><span class="quick-link-label">Merchant management</span><br><span class="quick-link-note">Registry, KYC &amp; operations</span></span></a>
                <a class="quick-link" href="/docs"><span class="quick-link-icon" aria-hidden="true">⌘</span><span><span class="quick-link-label">API documentation</span><br><span class="quick-link-note">Available APIs and contracts</span></span></a>
              </div>
            </section>
          </div>
        </div>
        <p class="muted">Admin-only merchant preview. Do not use this interface as a merchant self-service portal. This page does not create payouts, transfer funds, or modify merchant settings.</p>
      </main>
    </div>
    <nav class="mobile-nav" aria-label="Quick merchant navigation"><a href="#main-content" aria-current="page"><span aria-hidden="true">⌂</span><span>Home</span></a><a href="#transactions"><span aria-hidden="true">⇄</span><span>Transactions</span></a><a href="#wallet"><span aria-hidden="true">◉</span><span>Wallet</span></a><a href="#terminals"><span aria-hidden="true">▣</span><span>Terminals</span></a><a href="#settlements"><span aria-hidden="true">⟳</span><span>Settlements</span></a></nav>
  </div>
  <section class="login-wrap" id="login" role="dialog" aria-modal="true" aria-labelledby="login-title" aria-describedby="login-description" hidden>
    <div class="login-card"><h2 id="login-title">Admin preview sign-in</h2><p id="login-description">Sign in with a PrimeStack administrator account to preview merchant activity.</p><form id="login-form"><label>Email address<input type="email" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button class="button-primary" type="submit">Sign in</button><div class="login-error" id="login-error" role="alert"></div></form></div>
  </section>
  <script>
  (()=>{
    const keys={token:"merchantAdminToken",role:"merchantAdminRole",email:"merchantAdminEmail"};
    const allowedRoles=["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"];
    const $=id=>document.getElementById(id);
    let refreshInProgress=false;
    let merchantLoadVersion=0;
    const escapeText=value=>String(value??"—");
    const amount=(value,currency)=>{
      const raw=String(value??"0");
      const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
      if(!match)return raw+" "+currency;
      try{
        const formatter=new Intl.NumberFormat(undefined,{style:"currency",currency});
        const fractionDigits=formatter.resolvedOptions().maximumFractionDigits;
        const scale=10n**BigInt(fractionDigits);
        const decimal=match[3]||"";
        const fraction=(decimal+"0".repeat(fractionDigits+1)).slice(0,fractionDigits+1);
        let minorUnits=BigInt(match[2])*scale+BigInt(fractionDigits?fraction.slice(0,fractionDigits)||"0":"0");
        if(Number(fraction[fractionDigits]||"0")>=5)minorUnits+=1n;
        const negative=match[1]==="-"&&minorUnits>0n;
        const whole=new Intl.NumberFormat().format(minorUnits/scale);
        const digits=fractionDigits?String(minorUnits%scale).padStart(fractionDigits,"0"):"";
        return formatter.formatToParts(negative?-0:0).map(part=>part.type==="integer"?whole:part.type==="fraction"?digits:part.type==="minusSign"&&!negative?"":part.value).join("");
      }catch(error){
        if(error instanceof RangeError)return raw+" "+currency;
        throw error;
      }
    };
    const getToken=()=>sessionStorage.getItem(keys.token);
    function showLogin(message=""){
      $("app").inert=true;
      $("login").hidden=false;
      $("login-error").textContent=message;
      $("login-form").elements.email.focus();
    }
    function signOut(){
      Object.values(keys).forEach(key=>sessionStorage.removeItem(key));
      $("identity").textContent="";
      showLogin();
    }
    async function request(path,options={}){
      const response=await fetch(path,{...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),Authorization:"Bearer "+getToken(),...(options.headers||{})},cache:"no-store"});
      const payload=await response.json();
      if(response.status===401){signOut();throw new Error("Admin session expired. Sign in again.");}
      if(!response.ok||!payload.success)throw new Error(payload.error?.message||"Merchant dashboard request failed.");
      return payload.data;
    }
    function setNotice(message){
      $("error").textContent=message;
      $("error").classList.toggle("visible",Boolean(message));
    }
    function formatVolume(rows){
      if(!rows.length)return "No recorded volume";
      return rows.map(row=>amount(row.amount,row.currency)+" "+row.currency).join(" · ");
    }
    function setVolumeSummary(prefix,rows){
      $(prefix+"-volume").textContent=formatVolume(rows);
      const transactions=rows.reduce((sum,row)=>sum+Number(row.transactions||0),0);
      $(prefix+"-count").textContent=transactions.toLocaleString()+" approved/captured/settled transactions";
    }
    function clearRows(id,message,columnCount){
      const body=$(id);
      const row=document.createElement("tr");
      row.setAttribute("role","row");
      const cell=document.createElement("td");
      cell.setAttribute("role","cell");
      cell.className="empty";
      cell.colSpan=columnCount;
      cell.textContent=message;
      row.appendChild(cell);
      body.replaceChildren(row);
    }
    function clearMerchantData(message){
      const select=$("merchant-select");
      const selected=select.options[select.selectedIndex]?.textContent||"";
      $("merchant-status").dataset.state="WARNING";
      $("merchant-status").querySelector(".status-icon").textContent="⚠";
      $("merchant-status-text").textContent=message;
      $("merchant-code").textContent=selected;
      $("welcome").textContent="Merchant activity";
      $("today-volume").textContent="Unavailable";
      $("today-count").textContent=message;
      $("month-volume").textContent="Unavailable";
      $("month-count").textContent=message;
      $("available-balance").textContent="Unavailable";
      $("terminal-count").textContent="Unavailable";
      $("terminal-support").textContent=message;
      $("settlement-summary").textContent="";
      $("last-updated").textContent=message;
      clearRows("transaction-rows",message,6);
      for(const id of ["balance-list","terminal-list","settlement-list"]){
        const item=document.createElement("div");
        item.className="empty";
        item.textContent=message;
        $(id).replaceChildren(item);
      }
    }
    function statusPresentation(status){
      if(["AUTHORIZED","CAPTURED","SETTLED","COMPLETED","RECONCILED","ONLINE","ACTIVE"].includes(status))return {label:"Operational · "+status.replace(/_/g," "),className:"ok",icon:"✓"};
      if(["DECLINED","FAILED","ERROR","OFFLINE","SUSPENDED","TERMINATED"].includes(status))return {label:"Action required · "+status.replace(/_/g," "),className:"bad",icon:"✖"};
      return {label:"Review · "+status.replace(/_/g," "),className:"warn",icon:"⚠"};
    }
    function fillTransactions(rows){
      const body=$("transaction-rows");
      if(!rows.length){clearRows("transaction-rows","No transactions recorded for this merchant.",6);return;}
      body.replaceChildren();
      for(const item of rows){
        const row=document.createElement("tr");
        row.setAttribute("role","row");
        const cells=[
          ["Reference",item.reference],
          ["Terminal",item.terminal],
          ["Type",item.type.replace(/_/g," ")],
          ["Amount",amount(item.amount,item.currency)+" "+item.currency],
        ];
        for(const [label,value] of cells){
          const cell=document.createElement("td");
          cell.setAttribute("role","cell");
          cell.dataset.label=label;
          cell.textContent=escapeText(value);
          row.appendChild(cell);
        }
        const status=document.createElement("td");
        status.setAttribute("role","cell");
        status.dataset.label="Status";
        const presentation=statusPresentation(item.status);
        const badge=document.createElement("span");
        badge.className="table-status "+presentation.className;
        const icon=document.createElement("span");
        icon.className="table-status-icon";
        icon.setAttribute("aria-hidden","true");
        icon.textContent=presentation.icon;
        const label=document.createElement("span");
        label.textContent=presentation.label;
        badge.append(icon,label);
        status.appendChild(badge);
        row.appendChild(status);
        const time=document.createElement("td");
        time.setAttribute("role","cell");
        time.dataset.label="Time";
        time.textContent=new Date(item.createdAt).toLocaleString();
        row.appendChild(time);
        body.appendChild(row);
      }
    }
    function fillBalances(rows){
      const list=$("balance-list");
      list.replaceChildren();
      if(!rows.length){list.innerHTML='<div class="empty">No merchant ledger accounts are recorded.</div>';$("available-balance").textContent="Unavailable";return;}
      $("available-balance").textContent=rows.map(row=>amount(row.available,row.currency)+" "+row.currency).join(" · ");
      for(const balance of rows){
        const item=document.createElement("div");
        item.className="balance-item";
        item.setAttribute("role","listitem");
        const details=document.createElement("span");
        const name=document.createElement("span");
        name.className="item-label";
        name.textContent=balance.currency+" available";
        const note=document.createElement("span");
        note.className="item-sub";
        note.textContent="Ledger balance "+amount(balance.balance,balance.currency)+" · Held "+amount(balance.held,balance.currency);
        details.append(name,document.createElement("br"),note);
        const value=document.createElement("span");
        value.className="item-value";
        value.textContent=amount(balance.available,balance.currency)+" "+balance.currency;
        item.append(details,value);
        list.appendChild(item);
      }
    }
    function fillTerminals(data){
      $("terminal-count").textContent=data.total?data.online.toLocaleString()+" / "+data.total.toLocaleString():"No terminals";
      $("terminal-support").textContent=data.total?Math.max(0,data.total-data.online).toLocaleString()+" not currently online":"No terminal records";
      const list=$("terminal-list");
      list.replaceChildren();
      if(!data.items.length){list.innerHTML='<div class="empty">No terminals are assigned to this merchant.</div>';return;}
      for(const terminal of data.items.slice(0,8)){
        const item=document.createElement("div");
        item.className="terminal-item";
        item.setAttribute("role","listitem");
        const name=document.createElement("span");
        name.className="item-label";
        name.textContent=terminal.tid;
        const status=document.createElement("span");
        const presentation=statusPresentation(terminal.status);
        status.className="table-status "+presentation.className;
        status.textContent=presentation.label;
        item.append(name,status);
        list.appendChild(item);
      }
    }
    function fillSettlements(data){
      const list=$("settlement-list");
      list.replaceChildren();
      if(!data.recent.length){list.innerHTML='<div class="empty">No settlement batches are recorded.</div>';return;}
      for(const batch of data.recent){
        const item=document.createElement("div");
        item.className="settlement-item";
        item.setAttribute("role","listitem");
        const details=document.createElement("span");
        const name=document.createElement("span");
        name.className="item-label";
        name.textContent=batch.batchNumber;
        const note=document.createElement("span");
        note.className="item-sub";
        note.textContent=batch.period+" · "+Number(batch.transactionCount).toLocaleString()+" transactions";
        details.append(name,document.createElement("br"),note);
        const state=document.createElement("span");
        const presentation=statusPresentation(batch.status);
        state.className="table-status "+presentation.className;
        state.textContent=presentation.label;
        item.append(details,state);
        list.appendChild(item);
      }
      const summary=data.statuses.map(item=>item.status.replace(/_/g," ")+": "+Number(item.count).toLocaleString()).join(" · ");
      $("settlement-summary").textContent=summary? "Status totals — "+summary:"No settlement statuses recorded.";
    }
    function setMerchantStatus(merchant){
      const banner=$("merchant-status");
      const status=merchant.status;
      const active=["ACTIVE","APPROVED"].includes(status);
      const critical=["SUSPENDED","BLOCKED","TERMINATED"].includes(status);
      const state=active?"ACTIVE":critical?"CRITICAL":"WARNING";
      banner.dataset.state=state;
      banner.querySelector(".status-icon").textContent=active?"✓":critical?"✖":"⚠";
      $("merchant-status-text").textContent=(active?"Operational · ":critical?"Action required · ":"Review required · ")+status.replace(/_/g," ");
      $("merchant-code").textContent=merchant.code+" · "+merchant.country;
      $("welcome").textContent="Welcome, "+(merchant.displayName||merchant.legalName);
    }
    async function loadMerchant(id){
      if(!id)return;
      const version=++merchantLoadVersion;
      let data;
      try{
        data=await request("/admin/merchants/"+encodeURIComponent(id)+"/home");
      }catch(error){
        if(version!==merchantLoadVersion||id!==$("merchant-select").value)return;
        throw error;
      }
      if(version!==merchantLoadVersion||id!==$("merchant-select").value)return;
      setMerchantStatus(data.merchant);
      setVolumeSummary("today",data.volumes.today);
      setVolumeSummary("month",data.volumes.month);
      fillBalances(data.balances);
      fillTerminals(data.terminals);
      fillTransactions(data.recentTransactions);
      fillSettlements(data.settlements);
    }
    async function loadMerchants(){
      const result=await request("/admin/merchants/overview");
      const select=$("merchant-select");
      select.dataset.loaded="true";
      const selected=select.value;
      select.replaceChildren();
      for(const merchant of result.merchants){
        const option=document.createElement("option");
        option.value=merchant.id;
        option.textContent=(merchant.displayName||merchant.legalName)+" · "+merchant.code;
        select.appendChild(option);
      }
      if(!result.merchants.length){
        const option=document.createElement("option");
        option.value="";
        option.textContent="No merchants found";
        select.appendChild(option);
        return;
      }
      const initial=select.dataset.initialMerchant;
      select.value=result.merchants.some(merchant=>merchant.id===selected)?selected:result.merchants.some(merchant=>merchant.id===initial)?initial:result.merchants[0].id;
      await loadMerchant(select.value);
    }
    async function refresh(){
      if(refreshInProgress)return;
      refreshInProgress=true;
      $("refresh").disabled=true;
      try{
        if($("merchant-select").dataset.loaded!=="true")await loadMerchants();
        else await loadMerchant($("merchant-select").value);
        setNotice("");
        $("last-updated").textContent=new Date().toLocaleTimeString();
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        if($("app").inert)$("login-error").textContent=message;
        else setNotice(message);
      }finally{
        refreshInProgress=false;
        $("refresh").disabled=false;
      }
    }
    async function authenticate(){
      const form=$("login-form");
      $("login-error").textContent="";
      try{
        const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form))),cache:"no-store"});
        const payload=await response.json();
        if(!response.ok||!payload.success)throw new Error(payload.error?.message||"Sign-in failed.");
        if(!allowedRoles.includes(payload.data.user.role))throw new Error("This account does not have merchant preview access.");
        sessionStorage.setItem(keys.token,payload.data.token);
        sessionStorage.setItem(keys.role,payload.data.user.role);
        sessionStorage.setItem(keys.email,payload.data.user.email);
        $("identity").textContent=payload.data.user.email;
        form.reset();
        $("login").hidden=true;
        $("app").inert=false;
        $("main-content").focus();
        await refresh();
      }catch(error){
        $("login-error").textContent=error instanceof Error?error.message:String(error);
      }
    }
    $("login-form").addEventListener("submit",event=>{event.preventDefault();authenticate();});
    $("logout").addEventListener("click",signOut);
    $("refresh").addEventListener("click",refresh);
    $("merchant-select").addEventListener("change",async()=>{
      const id=$("merchant-select").value;
      clearMerchantData("Loading merchant data…");
      setNotice("");
      try{
        await loadMerchant(id);
        if(id===$("merchant-select").value){
          setNotice("");
          $("last-updated").textContent=new Date().toLocaleTimeString();
        }
      }catch(error){
        if(id!==$("merchant-select").value)return;
        clearMerchantData("Merchant data unavailable");
        setNotice(error instanceof Error?error.message:String(error));
      }
    });
    const mobileQuery=window.matchMedia("(max-width: 800px)");
    function setDrawerOpen(open){
      const modal=open&&mobileQuery.matches;
      $("sidebar").classList.toggle("open",open);
      $("backdrop").classList.toggle("visible",modal);
      $("menu-toggle").setAttribute("aria-expanded",String(open));
      $("menu-toggle").setAttribute("aria-label",open?"Close navigation":"Open navigation");
      $("sidebar").inert=mobileQuery.matches&&!open;
      $("sidebar").setAttribute("aria-hidden",String(mobileQuery.matches&&!open));
      if(modal){$("sidebar").setAttribute("role","dialog");$("sidebar").setAttribute("aria-modal","true");$("sidebar").querySelector("nav a")?.focus();}
      else{$("sidebar").removeAttribute("role");$("sidebar").removeAttribute("aria-modal");}
    }
    $("menu-toggle").addEventListener("click",()=>setDrawerOpen(!$("sidebar").classList.contains("open")));
    $("backdrop").addEventListener("click",()=>{setDrawerOpen(false);$("menu-toggle").focus();});
    $("sidebar").addEventListener("keydown",event=>{
      const links=[...$("sidebar").querySelectorAll("nav a")];
      if(event.key==="Escape"){setDrawerOpen(false);$("menu-toggle").focus();return;}
      if(event.key==="Tab"&&mobileQuery.matches&&links.length){
        if(event.shiftKey&&document.activeElement===links[0]){event.preventDefault();links[links.length-1].focus();}
        else if(!event.shiftKey&&document.activeElement===links[links.length-1]){event.preventDefault();links[0].focus();}
      }else if(["ArrowDown","ArrowUp"].includes(event.key)){
        const index=links.indexOf(document.activeElement);
        if(index>=0){event.preventDefault();links[(index+(event.key==="ArrowDown"?1:-1)+links.length)%links.length].focus();}
      }
    });
    $("login").addEventListener("keydown",event=>{
      if(event.key!=="Tab")return;
      const focusable=[...$("login").querySelectorAll("input:not([disabled]),button:not([disabled])")];
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    $("sidebar").querySelectorAll("nav a").forEach(link=>link.addEventListener("click",()=>{if(mobileQuery.matches){setDrawerOpen(false);$("menu-toggle").focus();}}));
    mobileQuery.addEventListener("change",()=>{if(mobileQuery.matches&&$("sidebar").contains(document.activeElement))$("menu-toggle").focus();setDrawerOpen(false);});
    setDrawerOpen(false);
    const query=new URLSearchParams(location.search);
    if(query.get("merchantId"))$("merchant-select").dataset.initialMerchant=query.get("merchantId");
    const storedRole=sessionStorage.getItem(keys.role);
    if(getToken()&&allowedRoles.includes(storedRole)){
      $("identity").textContent=sessionStorage.getItem(keys.email)||"Administrator";
      $("app").inert=false;
      $("login").hidden=true;
      refresh();
    }else signOut();
  })();
  </script>
</body>
</html>`;
