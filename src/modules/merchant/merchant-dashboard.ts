export const merchantDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light"><title>Merchant Acquiring | PrimeStack</title>
  <style>
    :root{color-scheme:light;--bg:#f3f6fa;--panel:#ffffff;--raised:#edf2f7;--border:#d5dee9;--text:#172338;--muted:#526176;--cyan:#006a83;--green:#18743a;--yellow:#805200;--red:#b42318}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 "Segoe UI",system-ui,sans-serif}
    header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px clamp(18px,4vw,48px);background:#ffffff;border-bottom:1px solid var(--border)}
    h1{margin:0;font-size:20px}h1 span{color:var(--cyan)}h2{font-size:15px;margin:0 0 12px}.muted{color:var(--muted);font-size:12px}
    main{width:min(1440px,100%);margin:auto;padding:22px clamp(16px,3vw,36px) 40px}.hidden{display:none!important}
    .login,.panel,.metric{border:1px solid var(--border);border-radius:10px;background:var(--panel);padding:16px}.login{width:min(420px,calc(100% - 32px));margin:48px auto}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}.metric .label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.metric .value{font-size:24px;font-weight:700;margin-top:4px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.wide{grid-column:1/-1}
    .row,.head{display:flex;align-items:center;justify-content:space-between;gap:10px}.head{margin-bottom:10px}
    .table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap;text-align:left}th,td{padding:9px 8px;border-bottom:1px solid var(--border);font-size:12px}th{color:var(--muted);font-size:10px;text-transform:uppercase}
    input,select{width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:7px;background:#ffffff;color:var(--text);font:inherit}
    label{display:grid;gap:4px;color:var(--muted);font-size:11px}form{display:grid;gap:9px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.full{grid-column:1/-1}
    button{border:1px solid var(--border);border-radius:7px;background:#ffffff;color:var(--text);padding:8px 12px;cursor:pointer;font:inherit}button:hover{border-color:var(--cyan)}button.primary{background:#006a83;border-color:#006a83;color:#ffffff}
    .notice{display:none;padding:10px 12px;border-radius:8px;margin:10px 0}.error{background:#fff1f0;border:1px solid #d99a9a;color:#8f1d18}.success{background:#eaf6ee;border:1px solid #9bc9a9;color:#185c30}
    .list{display:grid;gap:7px;max-height:260px;overflow:auto}.item{padding:8px;border-bottom:1px solid var(--border);font-size:12px}.tag{color:var(--cyan)}.status{color:var(--green)}.no-review #documents button{display:none}
    .merchant-nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));align-items:start;gap:8px;margin:0 0 14px;padding:10px;border:1px solid var(--border);border-radius:10px;background:#fff}
    .merchant-nav>a,.merchant-nav summary{display:flex;align-items:center;gap:8px;min-width:0;min-height:40px;padding:8px 10px;border-radius:7px;color:var(--text);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;overflow-wrap:anywhere}
    .merchant-nav>a:hover,.merchant-nav summary:hover,.merchant-nav details[open] summary{background:var(--raised);color:var(--cyan)}
    .merchant-nav details{min-width:0}
    .merchant-nav summary{list-style:none}
    .merchant-nav summary::-webkit-details-marker{display:none}
    .merchant-nav summary:after{content:"⌄";margin-left:4px}
    .merchant-nav details[open] summary:after{content:"⌃"}
    .merchant-submenu{position:static;display:grid;min-width:0;width:100%;margin-top:4px;padding:4px;border:1px solid var(--border);border-radius:8px;background:#fff}
    .merchant-submenu a{padding:9px 10px;border-radius:5px;color:var(--text);font-size:12px;text-decoration:none}
    .merchant-submenu a:hover{background:var(--raised);color:var(--cyan)}
    .merchant-nav .nav-icon{width:18px;text-align:center;color:var(--cyan);font-size:15px}
    :focus-visible{outline:3px solid var(--cyan);outline-offset:3px}
    @media(max-width:700px){.wide{grid-column:auto}header{align-items:flex-start;flex-direction:column}.fields{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header><div><h1>Prime<span>Stack</span> Merchant Acquiring</h1><div class="muted">Merchant onboarding, risk, pricing, MID and terminal operations</div></div>
    <div class="row"><span id="identity" class="muted"></span><button id="logout" class="hidden" type="button">Sign out</button></div></header>
  <section id="login" class="login"><h2>Administrator sign-in</h2><p class="muted">Sign in with your PrimeStack admin account.</p>
    <div id="login-error" class="notice error"></div>
    <form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Sign in</button></form>
  </section>
  <main id="portal" class="hidden">
    <div id="error" class="notice error" role="alert"></div><div id="success" class="notice success" role="status"></div>
    <nav class="merchant-nav" aria-label="Merchant acquiring navigation">
      <a href="/admin/dashboard"><span class="nav-icon" aria-hidden="true">◫</span>Command Center</a>
      <a href="/admin/merchant-home"><span class="nav-icon" aria-hidden="true">⌂</span>Merchant home preview</a>
      <details>
        <summary><span class="nav-icon" aria-hidden="true">♙</span>Merchants</summary>
        <div class="merchant-submenu"><a href="#merchant-overview">Overview</a><a href="#merchant-registry">Merchant registry</a><a href="#merchant-onboarding">Onboard merchant</a><a href="#merchant-selected">Selected merchant</a></div>
      </details>
      <details>
        <summary><span class="nav-icon" aria-hidden="true">✓</span>Verification &amp; risk</summary>
        <div class="merchant-submenu"><a href="#merchant-kyc">KYC documents</a><a href="#merchant-risk">Risk profile</a></div>
      </details>
      <details>
        <summary><span class="nav-icon" aria-hidden="true">▣</span>Setup &amp; pricing</summary>
        <div class="merchant-submenu"><a href="#merchant-mids">Merchant IDs &amp; terminals</a><a href="#merchant-pricing">Pricing plans</a><a href="#merchant-agents">Agent network</a></div>
      </details>
      <a href="/docs"><span class="nav-icon" aria-hidden="true">⌘</span>API reference</a>
    </nav>
    <section class="metrics" id="merchant-overview"><article class="metric"><div class="label">Merchants</div><div class="value" id="total">—</div></article>
      <article class="metric"><div class="label">Onboarding / review</div><div class="value" id="pending">—</div></article><article class="metric"><div class="label">Active</div><div class="value" id="active">—</div></article>
      <article class="metric"><div class="label">Transactions today</div><div class="value" id="transactions">—</div></article></section>
    <div class="grid">
      <section class="panel wide" id="merchant-registry"><div class="head"><h2>Merchant registry</h2><button id="refresh">Refresh</button></div>
        <div class="table-wrap"><table><thead><tr><th>Code</th><th>Legal / display name</th><th>Country</th><th>Category</th><th>Status</th><th>KYC</th><th>Terminals</th><th>Transactions</th></tr></thead><tbody id="merchants"></tbody></table></div>
      </section>
      <section class="panel" id="merchant-onboarding"><h2>Onboard merchant</h2><form id="merchant-form"><div class="fields">
        <label>Merchant code<input name="code" required minlength="3" maxlength="50" pattern="[A-Z0-9_-]+"></label><label>Legal name<input name="legalName" required maxlength="255"></label>
        <label>Display name<input name="displayName" maxlength="255"></label><label>Email<input name="email" type="email" required></label>
        <label>Country<input name="country" value="US" maxlength="3" required></label><label>MCC<input name="mcc" maxlength="4"></label>
        <label class="full">Business category<input name="merchantCategory" maxlength="50"></label></div><button class="primary">Create pending merchant</button></form>
      </section>
      <section class="panel" id="merchant-selected"><h2>Selected merchant</h2><label>Merchant<select id="selected"></select></label>
        <div id="details" class="list" style="margin-top:10px"></div></section>
      <section class="panel" id="merchant-mids"><h2>Merchant IDs &amp; terminal assignment</h2>
        <form id="mid-form"><label>MID<input name="mid" required maxlength="30"></label><label>Label<input name="label" maxlength="100"></label><button>Create MID</button></form>
        <form id="terminal-form" style="margin-top:12px"><label>Terminal ID<input name="terminalId" required></label><label>Active MID<select name="mid" id="mid-select" required></select></label><button>Assign terminal</button></form><div id="mids" class="list"></div>
      </section>
      <section class="panel" id="merchant-kyc"><h2>KYC documents</h2>
        <form id="kyc-form"><label>Document type<select name="documentType"><option value="TRADE_LICENSE">Trade License</option><option value="PASSPORT">Passport</option><option value="NATIONAL_ID">National ID</option><option value="BANK_LETTER">Bank Letter</option><option value="ADDRESS_PROOF">Address Proof</option><option value="ARTICLES_OF_INCORPORATION">Articles of Incorporation</option><option value="OTHER">Other</option></select></label>
          <label>Document reference<input name="documentReference" required maxlength="255"></label><button>Add reference</button></form><div id="documents" class="list"></div>
      </section>
      <section class="panel" id="merchant-risk"><h2>Risk profile</h2><form id="risk-form"><div class="fields">
        <label>Daily limit<input name="dailyLimit" type="number" min="0" step="0.01"></label><label>Monthly limit<input name="monthlyLimit" type="number" min="0" step="0.01"></label>
        <label>Chargeback limit<input name="chargebackLimit" type="number" min="0" step="0.01"></label><label>Risk score (0-100)<input name="riskScore" type="number" min="0" max="100" step="1" value="0" required></label></div><button>Save risk profile</button></form>
      </section>
      <section class="panel" id="merchant-pricing"><h2>Pricing plans</h2><form id="plan-form"><div class="fields">
        <label>Plan name<input name="planName" required maxlength="100"></label><label>Currency<input name="currency" value="USD" maxlength="3" required></label>
        <label>Transaction fee %<input name="transactionFee" type="number" min="0" step="0.0001" value="0" required></label><label>Settlement fee %<input name="settlementFee" type="number" min="0" step="0.0001" value="0" required></label>
        <label class="full">Payout fee %<input name="payoutFee" type="number" min="0" step="0.0001" value="0" required></label></div><button>Create plan</button></form>
        <label style="margin-top:12px">Assign plan<select id="plan-select"></select></label><button id="assign-plan" style="margin-top:8px">Assign to merchant</button>
      </section>
      <section class="panel" id="merchant-agents"><h2>Agent network</h2><form id="agent-form"><div class="fields">
        <label>Agent code<input name="code" required pattern="[A-Z0-9_-]+" maxlength="50"></label><label>Name<input name="name" required maxlength="255"></label>
        <label class="full">Commission %<input name="commissionRate" type="number" min="0" max="100" step="0.0001" value="0" required></label></div><button>Create agent</button></form>
        <label style="margin-top:12px">Assign agent<select id="agent-select"></select></label><button id="assign-agent" style="margin-top:8px">Assign to merchant</button><div id="agents" class="list"></div>
      </section>
    </div>
  </main>
  <script>
    const $=id=>document.getElementById(id), api="/admin";
    const token=()=>sessionStorage.getItem("merchantAdminToken");
    const role=()=>sessionStorage.getItem("merchantAdminRole");
    const canWrite=()=>["SUPER_ADMIN","ADMIN","OPERATOR"].includes(role());
    const canReview=()=>["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER"].includes(role());
    function showLogin(){ $("login").classList.remove("hidden");$("portal").classList.add("hidden");$("logout").classList.add("hidden");$("identity").textContent="";document.body.classList.add("no-review"); }
    function showPortal(){ $("login").classList.add("hidden");$("portal").classList.remove("hidden");$("logout").classList.remove("hidden");$("identity").textContent=sessionStorage.getItem("merchantAdminEmail")||"";for(const form of $("portal").querySelectorAll("form"))form.classList.toggle("hidden",!canWrite());$("assign-plan").classList.toggle("hidden",!canWrite());$("assign-agent").classList.toggle("hidden",!canWrite());document.body.classList.toggle("no-review",!canReview()); }
    function notify(message,error=false){const node=$(error?"error":"success"),other=$(error?"success":"error");other.style.display="none";node.textContent=message;node.style.display="block";}
    async function parsePayload(response){const body=await response.text();if(!body)return{};try{return JSON.parse(body);}catch{throw new Error("Server returned a non-JSON response (HTTP "+response.status+"). Confirm the PrimeStack application API is running.");}}
    async function request(path,options={}){const response=await fetch(api+path,{...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(token()?{Authorization:"Bearer "+token()}:{}),...(options.headers||{})},cache:"no-store"});const payload=response.status===204?{}:await parsePayload(response);if(response.status===401){sessionStorage.removeItem("merchantAdminToken");sessionStorage.removeItem("merchantAdminEmail");sessionStorage.removeItem("merchantAdminRole");showLogin();throw new Error("Admin session expired; sign in again.");}if(!response.ok||payload.success===false)throw new Error(payload.error?.message||"Request failed (HTTP "+response.status+")");return payload.data;}
    async function submit(form,build){const values=Object.fromEntries(new FormData(form));try{await build(values);form.reset();await refresh();notify("Operation completed.");}catch(error){notify(error instanceof Error?error.message:String(error),true);}}
    function fillSelect(id,items,label,value,allowNone=false){const select=$(id),current=select.value;select.replaceChildren();if(allowNone)select.add(new Option("No assignment",""));for(const item of items)select.add(new Option(label(item),item[value]));if(items.some(item=>item[value]===current))select.value=current;}
    async function loadMerchants(){const result=await request("/merchants/overview");$("total").textContent=result.summary.total;$("pending").textContent=result.summary.pending;$("active").textContent=result.summary.active;$("transactions").textContent=result.summary.transactionsToday;const tbody=$("merchants");tbody.replaceChildren();for(const merchant of result.merchants){const row=document.createElement("tr");for(const value of [merchant.code,merchant.displayName||merchant.legalName,merchant.country,merchant.merchantCategory||merchant.mcc||"—",merchant.status,merchant.kycRecord?.status||"NOT_STARTED",merchant._count.terminals,merchant._count.transactions]){const cell=document.createElement("td");cell.textContent=String(value);row.appendChild(cell);}row.addEventListener("click",()=>{$("selected").value=merchant.id;loadSelected().catch(error=>notify(error.message,true));});tbody.appendChild(row);}fillSelect("selected",result.merchants,item=>item.code+" · "+item.legalName,"id");if(!result.merchants.some(item=>item.id===$("selected").value)&&result.merchants.length)$("selected").value=result.merchants[0].id;}
    async function loadReferenceData(){const [plans,agents]=await Promise.all([request("/pricing-plans"),request("/agents")]);fillSelect("plan-select",plans,item=>item.planName+" · "+item.currency,"id",true);fillSelect("agent-select",agents,item=>item.code+" · "+item.name,"id",true);const list=$("agents");list.replaceChildren();for(const agent of agents){const item=document.createElement("div");item.className="item";item.textContent=agent.code+" · "+agent.name+" · "+agent.commissionRate+"% · "+agent._count.merchants+" merchants";list.appendChild(item);}}
    async function loadSelected(){const id=$("selected").value;if(!id)return;const merchant=await request("/merchants/"+encodeURIComponent(id));const mids=await request("/merchants/"+encodeURIComponent(id)+"/mids");const documents=await request("/merchants/"+encodeURIComponent(id)+"/kyc-documents");const terminals=await request("/merchants/"+encodeURIComponent(id)+"/terminals");const details=$("details");details.replaceChildren();for(const text of [merchant.legalName+" · "+merchant.status,"KYC: "+(merchant.kycRecord?.status||"NOT_STARTED")+" · Risk: "+merchant.riskLevel,(merchant.pricingPlan?.planName||"No pricing plan"),"Terminals: "+terminals.length]){const item=document.createElement("div");item.className="item";item.textContent=text;details.appendChild(item);}const midList=$("mids");midList.replaceChildren();for(const mid of mids){const item=document.createElement("div");item.className="item";item.textContent=mid.mid+" · "+(mid.label||"MID")+" · "+mid.status;midList.appendChild(item);}fillSelect("mid-select",mids.filter(item=>item.status==="ACTIVE"),item=>item.mid+" · "+(item.label||"Active"),"mid");const docs=$("documents");docs.replaceChildren();for(const doc of documents){const item=document.createElement("div");item.className="item";const text=document.createElement("span");text.textContent=doc.documentType+" · "+doc.documentReference+" · "+doc.verificationStatus;item.appendChild(text);if(doc.verificationStatus==="PENDING"){for(const status of ["VERIFIED","REJECTED"]){const button=document.createElement("button");button.textContent=status==="VERIFIED"?"Verify":"Reject";button.style.marginLeft="6px";button.addEventListener("click",async()=>{try{await request("/merchants/kyc-documents/"+encodeURIComponent(doc.id),{method:"PATCH",body:JSON.stringify({verificationStatus:status})});await refresh();notify("KYC document "+status.toLowerCase()+".");}catch(error){notify(error.message,true);}});item.appendChild(button);}}docs.appendChild(item);}const profile=merchant.riskProfile;if(profile){$("risk-form").elements.dailyLimit.value=profile.dailyLimit??"";$("risk-form").elements.monthlyLimit.value=profile.monthlyLimit??"";$("risk-form").elements.chargebackLimit.value=profile.chargebackLimit??"";$("risk-form").elements.riskScore.value=profile.riskScore??0;}}
    async function refresh(){await Promise.all([loadMerchants(),loadReferenceData()]);await loadSelected();}
    $("login-form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,error=$("login-error");error.style.display="none";try{const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form))),cache:"no-store"});const payload=await parsePayload(response);if(!response.ok||!payload.success)throw new Error(payload.error?.message||"Sign-in failed (HTTP "+response.status+")");sessionStorage.setItem("merchantAdminToken",payload.data.token);sessionStorage.setItem("merchantAdminEmail",payload.data.user.email);sessionStorage.setItem("merchantAdminRole",payload.data.user.role);form.reset();showPortal();await refresh();}catch(failure){error.textContent=failure instanceof Error?failure.message:String(failure);error.style.display="block";}});
    $("logout").addEventListener("click",()=>{sessionStorage.removeItem("merchantAdminToken");sessionStorage.removeItem("merchantAdminEmail");sessionStorage.removeItem("merchantAdminRole");showLogin();});
    $("refresh").addEventListener("click",()=>refresh().catch(error=>notify(error.message,true)));
    $("selected").addEventListener("change",()=>loadSelected().catch(error=>notify(error.message,true)));
    $("merchant-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,values=>request("/merchants",{method:"POST",body:JSON.stringify(values)}));});
    $("mid-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,values=>request("/merchants/"+encodeURIComponent($("selected").value)+"/mids",{method:"POST",body:JSON.stringify(values)}));});
    $("terminal-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,values=>request("/merchants/"+encodeURIComponent($("selected").value)+"/terminals/"+encodeURIComponent(values.terminalId)+"/mid",{method:"PUT",body:JSON.stringify({mid:values.mid})}));});
    $("kyc-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,values=>request("/merchants/"+encodeURIComponent($("selected").value)+"/kyc-documents",{method:"POST",body:JSON.stringify(values)}));});
    $("risk-form").addEventListener("submit",event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));for(const key of ["dailyLimit","monthlyLimit","chargebackLimit"])if(!values[key])delete values[key];submit(event.currentTarget,()=>request("/merchants/"+encodeURIComponent($("selected").value)+"/risk-profile",{method:"PUT",body:JSON.stringify(values)}));});
    $("plan-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,values=>request("/pricing-plans",{method:"POST",body:JSON.stringify(values)}));});
    $("assign-plan").addEventListener("click",async()=>{try{await request("/merchants/"+encodeURIComponent($("selected").value)+"/pricing-plan",{method:"PUT",body:JSON.stringify({pricingPlanId:$("plan-select").value||null})});await refresh();notify("Pricing plan assigned.");}catch(error){notify(error.message,true);}});
    $("agent-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,values=>request("/agents",{method:"POST",body:JSON.stringify(values)}));});
    $("assign-agent").addEventListener("click",async()=>{try{await request("/merchants/"+encodeURIComponent($("selected").value)+"/agent",{method:"PUT",body:JSON.stringify({agentId:$("agent-select").value||null})});await refresh();notify("Agent assigned.");}catch(error){notify(error.message,true);}});
    if(token()){showPortal();refresh().catch(error=>notify(error.message,true));}else showLogin();
  </script>
</body>
</html>`;
