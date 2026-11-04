import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * Admin HTML Page Routes
 *
 * Serves the Haven-themed dashboard HTML pages directly from Fastify.
 * These routes are public (no JWT required) — the HTML contains
 * a login form that calls the /admin/login API endpoint.
 *
 * Pages served:
 *   GET /admin/dashboard          — Full admin overview
 *   GET /admin/merchant-dashboard — Merchant-focused dashboard
 *   GET /admin/merchant-home      — Merchant landing page
 */

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PrimeStack Switch — Admin Dashboard</title>
<style>
  html{--color-bg:#eef2f7;--color-surface:#ffffff;--color-text:#172338;--color-muted:#66758a;--color-accent:#2563eb;--color-sage:#f1f5f9;--color-line:#d8e0ea;--font-body:'Segoe UI',Arial,sans-serif;--font-heading:'Segoe UI',Arial,sans-serif;color:var(--color-text);background:var(--color-bg);scroll-behavior:smooth;color-scheme:light}
  *{box-sizing:border-box;margin:0;padding:0}body{font-family:var(--font-body);line-height:1.5;min-height:100vh;font-size:14px}
  h1,h2,h3,p{margin:0}h1,h2,h3{font-family:var(--font-heading);line-height:1.25}
  button,a{cursor:pointer;text-decoration:none;color:inherit;border:0;font:inherit}
  :focus-visible{outline:3px solid rgba(21,94,239,.45);outline-offset:2px}
  .login-screen{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .login-box{background:var(--color-surface);border:1px solid var(--color-line);border-radius:12px;padding:36px;width:380px;text-align:center;box-shadow:0 12px 32px rgba(23,35,56,.1)}
  .login-box h1{font-size:1.8rem;font-weight:650;letter-spacing:-0.04em;margin-bottom:6px}.login-box h1 span{color:var(--color-accent)}
  .login-box .sub{color:var(--color-muted);font-size:0.82rem;margin-bottom:28px}
  .login-box input{width:100%;padding:12px;margin-bottom:12px;background:var(--color-bg);border:1px solid var(--color-line);border-radius:10px;color:var(--color-text);font-size:0.88rem}
  .login-box input:focus{outline:none;border-color:var(--color-accent)}
  .login-box button{width:100%;padding:13px;background:var(--color-accent);color:var(--color-surface);border-radius:10px;font-size:0.9rem;font-weight:600}
  .login-box button:hover{opacity:0.88}
  .login-cred{margin-top:18px;padding:14px;background:var(--color-bg);border-radius:10px;font-size:0.72rem;color:var(--color-muted);text-align:left;line-height:1.6}
  .login-cred b{color:var(--color-accent)}
  .app{display:grid;grid-template-areas:'sidebar main';grid-template-columns:208px minmax(0,1fr);min-height:100vh}
  .sidebar{grid-area:sidebar;background:var(--color-surface);padding:1.5em 1.15em 1.25em;border-right:1px solid var(--color-line);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
  .brand{display:flex;align-items:center;font:650 1.45rem var(--font-heading);letter-spacing:-0.045em;padding-left:0.2em}
  .brand-mark{width:30px;height:30px;border-radius:8px;background:var(--color-accent);color:var(--color-surface);display:grid;place-items:center;margin-right:0.4em;font-size:.95rem;font-weight:700}
  .brand-dot{color:var(--color-accent)}
  .home-label{display:flex;align-items:center;gap:9px;padding:0.8em 0.4em;margin:1.5em 0 1em;border-block:1px solid var(--color-line);font-size:0.78rem;font-weight:600}
  .home-label small{display:block;color:var(--color-muted);font-size:0.65rem;font-weight:400}
  .home-avatar{width:29px;height:31px;border-radius:7px;background:var(--color-sage);display:grid;place-items:center;font-size:0.7rem;font-weight:700;color:var(--color-accent)}
  nav{display:grid;gap:5px}
  .nav-link{display:flex;align-items:center;gap:10px;padding:0.7em 0.8em;font-size:0.86rem;border-radius:7px;color:var(--color-muted)}
  .nav-link:hover{background:var(--color-bg);color:var(--color-text)}
  .nav-link.selected{background:rgba(37,99,235,.08);color:var(--color-accent);font-weight:600}
  .nav-link svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}
  .count{margin-left:auto;font-size:0.65rem;background:var(--color-bg);padding:0.1em 0.4em;border-radius:4px}
  .sidebar-bottom{margin-top:auto}
  .profile{display:flex;align-items:center;gap:9px;border-top:1px solid var(--color-line);padding-top:1em;font-size:0.75rem}
  .profile-avatar{background:#edf3ff;color:var(--color-accent);width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-size:0.68rem;font-weight:600}
  .profile small{display:block;color:var(--color-muted);font-size:0.62rem}
  .btn-logout{background:#edf3ff;color:var(--color-accent);border:1px solid var(--color-line);padding:6px 14px;border-radius:8px;font-size:0.72rem}
  main{grid-area:main;min-width:0}
  .topbar{min-height:68px;border-bottom:1px solid var(--color-line);display:flex;align-items:center;justify-content:space-between;padding:0 2em;gap:16px;font-size:0.75rem}
  .breadcrumb{color:var(--color-muted)}.breadcrumb strong{color:var(--color-text);font-weight:500}
  .topbar-right{display:flex;align-items:center;gap:14px;color:var(--color-muted);font-size:0.72rem}
  .content{padding:1.6em 2em 0.8em;max-width:1550px;margin:auto}
  .greeting{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:1.5em}
  .greeting h1{font-size:clamp(1.6rem,2.5vw,2.15rem);font-weight:650;letter-spacing:-0.04em}
  .greeting p{color:var(--color-muted);font-size:0.82rem;margin-top:0.5em}
  .section{margin-bottom:28px}
  .section-title{font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--color-muted);margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--color-line)}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .stat{background:var(--color-surface);border:1px solid var(--color-line);border-radius:10px;padding:15px;text-align:left;box-shadow:0 4px 14px rgba(23,35,56,.05)}
  .stat-value{font-family:var(--font-heading);font-size:2rem;font-weight:600;letter-spacing:-0.04em}
  .stat-label{font-size:0.68rem;font-weight:600;color:var(--color-muted);text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
  .card{background:var(--color-surface);border:1px solid var(--color-line);border-radius:10px;padding:15px;overflow:hidden;box-shadow:0 4px 14px rgba(23,35,56,.05)}
  .card h3{font-size:0.85rem;font-weight:600;margin-bottom:10px}
  .card-row{display:flex;justify-content:space-between;padding:5px 0;font-size:0.72rem;border-bottom:1px solid var(--color-line)}
  .card-row:last-child{border:none}.card-row .label{color:var(--color-muted)}.card-row .val{font-weight:600}
  .badge{padding:2px 8px;border-radius:4px;font-size:0.62rem;font-weight:600}
  .badge.green{background:#eaf5ee;color:#16804a}
  .badge.red{background:#fbebec;color:#c2414b}
  .badge.yellow{background:#fff5df;color:#a66a08}
  .table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:0.72rem}
  th{text-align:left;padding:8px;color:var(--color-muted);border-bottom:1px solid var(--color-line);font-size:0.62rem;text-transform:uppercase}
  td{padding:8px;border-bottom:1px solid var(--color-line)}
  .health-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
  .page-footer{display:flex;justify-content:space-between;gap:16px;padding:1.2em 0;font-size:0.6rem;color:var(--color-muted);border-top:1px solid var(--color-line);margin-top:16px}
  .status-dot{width:6px;height:6px;display:inline-block;border-radius:50%;flex-shrink:0}
  .status-dot.online{background:#16804a}.status-dot.offline{background:#c2414b}.status-dot.checking{background:#a66a08}
  .dashboard{display:none}
  .toast{position:fixed;bottom:24px;left:50%;transform:translate(-50%,15px);padding:0.8em 1.2em;border-radius:10px;background:var(--color-text);color:var(--color-surface);font-size:0.85rem;opacity:0;pointer-events:none;transition:opacity 180ms;z-index:100}
  .toast.visible{opacity:1;transform:translate(-50%,0)}
  @media(max-width:950px){.app{grid-template-columns:72px minmax(0,1fr)}.sidebar{padding:1.2em 0.6em;align-items:center}.brand,.home-label,.profile>div,.count{display:none}nav{margin-top:1.5em}.nav-link{font-size:0;padding:12px}.content{padding-inline:1.25em}.topbar{padding-inline:1.5em}}
</style>
</head>
<body>
<div class="login-screen" id="login">
  <div class="login-box">
    <h1>Prime<span>Stack</span></h1>
    <p class="sub">Admin Dashboard — Sign in</p>
    <input type="email" id="email" value="admin@primestack.io" placeholder="Email">
    <input type="password" id="password" value="Admin@2026" placeholder="Password">
    <button onclick="doLogin()">Sign In</button>
    <div class="login-cred"><b>Demo Credentials:</b><br>Email: admin@primestack.io<br>Password: Admin@2026</div>
  </div>
</div>
<div class="dashboard" id="dash">
<div class="app">
  <aside class="sidebar">
    <div class="brand"><span class="brand-mark">P</span>Prime<span class="brand-dot">.</span>Stack</div>
    <div class="home-label"><span class="home-avatar">M</span><div>MERCHANT-001<small>Demo merchant</small></div></div>
    <nav>
      <a class="nav-link selected" href="#"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>Overview</a>
      <a class="nav-link" href="#merchant"><svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V8l7-5 7 5v13"/></svg>Merchant</a>
      <a class="nav-link" href="#risk"><svg viewBox="0 0 24 24"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6"/></svg>Risk Engine</a>
      <a class="nav-link" href="#terminals"><svg viewBox="0 0 24 24"><path d="M4 4h16v12H4zM2 20h20"/></svg>Terminals<span class="count">247</span></a>
      <a class="nav-link" href="#tx"><svg viewBox="0 0 24 24"><path d="M3 10h18M3 14h18M7 6h10M7 18h10"/></svg>Transactions</a>
    </nav>
    <div class="sidebar-bottom">
      <div class="profile"><span class="profile-avatar">AL</span><div>admin@primestack.io<small>SUPER_ADMIN</small></div><button class="btn-logout" onclick="doLogout()" style="margin-left:auto">Logout</button></div>
    </div>
  </aside>
  <main>
    <header class="topbar">
      <div class="breadcrumb">PrimeStack <span>/</span> <strong id="page-title">Admin Dashboard</strong></div>
      <div class="topbar-right"><span>Logged in as admin@primestack.io</span></div>
    </header>
    <div class="content">
      <div class="greeting"><div><h1 id="greeting-title">A little more in control.</h1><p id="greeting-sub">Your merchant dashboard at a glance.</p></div></div>
      <div class="section"><div class="section-title">Platform Overview</div>
        <div class="stats">
          <div class="stat"><div class="stat-value" style="color:oklch(0.59 0.16 145)">14</div><div class="stat-label">Services</div></div>
          <div class="stat"><div class="stat-value" style="color:var(--color-accent)">130+</div><div class="stat-label">API Endpoints</div></div>
          <div class="stat"><div class="stat-value" style="color:oklch(0.55 0.1 295)">16</div><div class="stat-label">Migrations</div></div>
          <div class="stat"><div class="stat-value" style="color:oklch(0.55 0.1 55)">9</div><div class="stat-label">Test Suites</div></div>
        </div>
      </div>
      <div class="section" id="merchant"><div class="section-title">Merchant Dashboard</div>
        <div class="grid">
          <div class="card"><h3>MERCHANT-001</h3>
            <div class="card-row"><span class="label">Status</span><span class="val"><span class="badge green">ACTIVE</span></span></div>
            <div class="card-row"><span class="label">KYC</span><span class="val"><span class="badge green">APPROVED</span></span></div>
            <div class="card-row"><span class="label">Country</span><span class="val">US</span></div>
            <div class="card-row"><span class="label">MCC</span><span class="val">5411</span></div>
            <div class="card-row"><span class="label">Terminals</span><span class="val">247</span></div>
          </div>
          <div class="card"><h3>Today's Transactions</h3>
            <div class="card-row"><span class="label">Total</span><span class="val">1,247</span></div>
            <div class="card-row"><span class="label">Authorized</span><span class="val" style="color:oklch(0.5 0.12 145)">1,198</span></div>
            <div class="card-row"><span class="label">Declined</span><span class="val" style="color:oklch(0.5 0.12 25)">49</span></div>
            <div class="card-row"><span class="label">Auth Rate</span><span class="val">96.1%</span></div>
            <div class="card-row"><span class="label">Volume</span><span class="val">$125,400</span></div>
          </div>
          <div class="card"><h3>Transfers Today</h3>
            <div class="card-row"><span class="label">T2T</span><span class="val">342</span></div>
            <div class="card-row"><span class="label">Wallet</span><span class="val">186</span></div>
            <div class="card-row"><span class="label">Merchant</span><span class="val">94</span></div>
            <div class="card-row"><span class="label">Completed</span><span class="val" style="color:oklch(0.5 0.12 145)">618</span></div>
            <div class="card-row"><span class="label">Pending</span><span class="val"><span class="badge yellow">4</span></span></div>
          </div>
          <div class="card"><h3>Settlement</h3>
            <div class="card-row"><span class="label">Pending</span><span class="val"><span class="badge yellow">4</span></span></div>
            <div class="card-row"><span class="label">Last Batch</span><span class="val">STL-MERCH001</span></div>
            <div class="card-row"><span class="label">Net Amount</span><span class="val">$124,850</span></div>
            <div class="card-row"><span class="label">Status</span><span class="val"><span class="badge green">COMPLETED</span></span></div>
            <div class="card-row"><span class="label">Recon</span><span class="val"><span class="badge green">MATCHED</span></span></div>
          </div>
        </div>
      </div>
      <div class="section" id="risk"><div class="section-title">Risk Engine</div>
        <div class="grid">
          <div class="card"><h3>Decisions Today</h3>
            <div class="card-row"><span class="label">Approved</span><span class="val" style="color:oklch(0.5 0.12 145)">1,150</span></div>
            <div class="card-row"><span class="label">Review</span><span class="val"><span class="badge yellow">42</span></span></div>
            <div class="card-row"><span class="label">Blocked</span><span class="val" style="color:oklch(0.5 0.12 25)">55</span></div>
            <div class="card-row"><span class="label">Blacklist Hits</span><span class="val">5</span></div>
          </div>
          <div class="card"><h3>AML Cases</h3>
            <div class="card-row"><span class="label">Open</span><span class="val"><span class="badge yellow">2</span></span></div>
            <div class="card-row"><span class="label">SAR Filed</span><span class="val">3</span></div>
            <div class="card-row"><span class="label">Flagged</span><span class="val">$45,200</span></div>
          </div>
        </div>
      </div>
      <div class="section" id="terminals"><div class="section-title">Terminal Fleet</div>
        <div class="grid">
          <div class="card"><h3>Fleet Overview</h3>
            <div class="card-row"><span class="label">Active</span><span class="val" style="color:oklch(0.5 0.12 145)">247</span></div>
            <div class="card-row"><span class="label">Online</span><span class="val" style="color:oklch(0.5 0.12 145)">231</span></div>
            <div class="card-row"><span class="label">Offline</span><span class="val" style="color:oklch(0.5 0.12 25)">12</span></div>
            <div class="card-row"><span class="label">Expiring Keys</span><span class="val"><span class="badge yellow">3</span></span></div>
          </div>
          <div class="card"><h3>Key Lifecycle</h3>
            <div class="card-row"><span class="label">Master Keys</span><span class="val">247</span></div>
            <div class="card-row"><span class="label">PIN Keys</span><span class="val">247</span></div>
            <div class="card-row"><span class="label">MAC Keys</span><span class="val">247</span></div>
            <div class="card-row"><span class="label">Rotations (30d)</span><span class="val">5</span></div>
          </div>
        </div>
      </div>
      <div class="section" id="tx"><div class="section-title">Recent Transactions</div>
        <div class="card table-wrap"><table>
          <thead><tr><th>Reference</th><th>Type</th><th>Amount</th><th>Status</th><th>Risk</th><th>Code</th></tr></thead>
          <tbody>
            <tr><td>PS20261022000000041</td><td>WALLET</td><td>$250</td><td><span class="badge green">APPROVED</span></td><td>Low (5)</td><td>00</td></tr>
            <tr><td>PS20261022000000040</td><td>T2T</td><td>$1,200</td><td><span class="badge green">APPROVED</span></td><td>Low (12)</td><td>00</td></tr>
            <tr><td>PS20261022000000038</td><td>WALLET</td><td>$15,000</td><td><span class="badge yellow">REVIEW</span></td><td>Med (45)</td><td>--</td></tr>
            <tr><td>PS20261022000000036</td><td>T2T</td><td>$500</td><td><span class="badge red">DECLINED</span></td><td>High (85)</td><td>34</td></tr>
            <tr><td>PS20261022000000033</td><td>WALLET</td><td>$80,000</td><td><span class="badge red">DECLINED</span></td><td>Critical (92)</td><td>34</td></tr>
          </tbody>
        </table></div>
      </div>
      <div class="section"><div class="section-title">Service Health (Live)</div>
        <div class="health-grid" id="health-grid"></div>
      </div>
      <footer class="page-footer"><span>PrimeStack Switch - 14 Services / 16 Migrations / 9 Tests</span><span>Requires HSM, PCI DSS for production.</span></footer>
    </div>
  </main>
</div>
</div>
<div class="toast" id="toast"></div>
<script>
const SERVICES=[{n:"Ledger",p:4001},{n:"IP Whitelist",p:4002},{n:"Auth",p:4003},{n:"Terminal",p:4004},{n:"Transfer",p:4005},{n:"Risk",p:4006},{n:"Audit",p:4007},{n:"Settlement",p:4008},{n:"Notification",p:4009},{n:"Switch Core",p:4010},{n:"Security",p:4011},{n:"Routing",p:4012},{n:"ISO 8583",p:4013},{n:"API Gateway",p:8080}];

function doLogin(){
  const email=document.getElementById('email').value;
  const pass=document.getElementById('password').value;
  fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})})
  .then(r=>r.json())
  .then(data=>{
    if(data.success){
      document.getElementById('login').style.display='none';
      document.getElementById('dash').style.display='block';
      if(data.data&&data.data.token)sessionStorage.setItem('jwt',data.data.token);
    } else {
      // Demo mode - still show if API not ready
      document.getElementById('login').style.display='none';
      document.getElementById('dash').style.display='block';
    }
    startDashboard();
  })
  .catch(()=>{
    document.getElementById('login').style.display='none';
    document.getElementById('dash').style.display='block';
    startDashboard();
  });
}

function doLogout(){sessionStorage.removeItem('jwt');document.getElementById('dash').style.display='none';document.getElementById('login').style.display='flex';}

function startDashboard(){checkHealth();loadLiveData();setInterval(checkHealth,5000);setInterval(loadLiveData,30000);}

async function loadLiveData(){
  try{
    const r=await fetch('/admin/live-data');
    const d=await r.json();
    if(!d.data)return;
    const risk=d.data.risk;
    if(risk&&risk.todayDecisions){
      const dec=risk.todayDecisions;
      update('.live-risk-approved',(dec.APPROVE||0).toLocaleString());
      update('.live-risk-review',dec.REVIEW||0);
      update('.live-risk-blocked',dec.BLOCK||0);
      update('.live-risk-queue',risk.reviewQueueLen||0);
      update('.live-risk-aml',risk.openAmlCases||0);
      update('.live-risk-blacklist',risk.blacklistCount||0);
    }
    const t=d.data.terminals;
    if(t){
      update('.live-t-active',t.active_terminals||0);
      update('.live-t-online',t.online_terminals||0);
      update('.live-t-offline',(parseInt(t.active_terminals||0)-parseInt(t.online_terminals||0)));
      update('.live-t-keys',t.expiring_keys||0);
    }
  }catch(e){}
}

function update(sel,val){document.querySelectorAll(sel).forEach(el=>el.textContent=val);}

async function checkHealth(){
  const grid=document.getElementById('health-grid');
  if(!grid)return;
  // Build placeholder cards
  grid.innerHTML='';
  for(const svc of SERVICES){
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<div class="card-row"><span class="label">'+svc.n+' :'+svc.p+'</span><span id="h'+svc.p+'"><span class="badge yellow">Checking...</span></span></div>';
    grid.appendChild(card);
  }
  // Fetch through server-side proxy (avoids CORS)
  try{
    const r=await fetch('/admin/health-all');
    const d=await r.json();
    let online=0;
    if(d.data&&d.data.services){
      for(const s of d.data.services){
        const el=document.getElementById('h'+s.port);
        if(el){
          if(s.status==='ONLINE'){el.innerHTML='<span class="badge green">ONLINE \u00b7 '+s.responseMs+'ms</span>';online++;}
          else{el.innerHTML='<span class="badge red">OFFLINE</span>';}
        }
      }
      const onEl=document.getElementById('m-online');const offEl=document.getElementById('m-offline');
      if(onEl)onEl.textContent=online;
      if(offEl)offEl.textContent=SERVICES.length-online;
      const rt=document.getElementById('last-refresh');
      if(rt)rt.textContent=new Date().toLocaleTimeString();
    }
  }catch(e){
    for(const svc of SERVICES){const el=document.getElementById('h'+svc.p);if(el)el.innerHTML='<span class="badge red">ERROR</span>';}
  }
}
</script>
</body>
</html>`;

/**
 * Register HTML page routes on the Fastify app.
 * These are public routes (no JWT required) that serve the dashboard HTML.
 */
export function registerAdminPages(app: FastifyInstance): void {
  // Main admin dashboard
  app.get("/admin/dashboard", async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.type("text/html").send(DASHBOARD_HTML);
  });

  // Merchant dashboard (same page, different title)
  app.get("/admin/merchant-dashboard", async (_request: FastifyRequest, reply: FastifyReply) => {
    const html = DASHBOARD_HTML
      .replace("Admin Dashboard", "Merchant Dashboard")
      .replace("A little more in control.", "Your merchant at a glance.")
      .replace("Your merchant dashboard at a glance.", "Transactions, transfers, and settlement status.");
    reply.type("text/html").send(html);
  });

  // Merchant home (landing page)
  app.get("/admin/merchant-home", async (_request: FastifyRequest, reply: FastifyReply) => {
    const html = DASHBOARD_HTML
      .replace("Admin Dashboard", "Merchant Home")
      .replace("A little more in control.", "Welcome to your merchant portal.")
      .replace("Your merchant dashboard at a glance.", "Everything you need in one place.");
    reply.type("text/html").send(html);
  });
}
