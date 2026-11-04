export const pagDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><title>PrimeStack Asset Gateway</title>
  <style>
    :root{color-scheme:dark;--bg:#0a0e17;--panel:#121a28;--border:#253248;--text:#e7edf6;--muted:#91a0b5;--cyan:#52d6e8}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 "Segoe UI",system-ui,sans-serif}
    header{padding:20px clamp(16px,4vw,44px);border-bottom:1px solid var(--border);background:#0d1420}h1{font-size:21px;margin:0}h1 span{color:var(--cyan)}
    main{max-width:1500px;margin:auto;padding:20px clamp(14px,3vw,32px)}.sub,.muted{color:var(--muted);font-size:12px}.panel,.metric{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:15px}
    .warning{margin:14px 0;padding:12px;border:1px solid #8a6820;border-radius:7px;background:#2b2313}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px;margin:12px 0}
    .value{font-size:22px;font-weight:700}.label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:11px}.wide{grid-column:1/-1}.panel h2{font-size:14px;margin:0 0 10px}
    form{display:grid;gap:8px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.full{grid-column:1/-1}
    label{display:grid;gap:4px;color:var(--muted);font-size:11px}input,select{width:100%;padding:8px;border:1px solid #34435b;border-radius:6px;background:#0d1420;color:var(--text);font:inherit}
    button{padding:8px 11px;border:1px solid #28778a;border-radius:6px;background:#104250;color:white;font:inherit;cursor:pointer}.table-wrap{overflow:auto;max-height:360px}
    table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:8px;border-bottom:1px solid var(--border);font-size:11px}th{color:var(--muted);text-transform:uppercase;font-size:10px}
    .login{max-width:420px;margin:22px auto}.hidden{display:none!important}.notice{padding:8px;color:#ff9da6}.good{color:#7be3ae}.route-output{white-space:pre-wrap;overflow-wrap:anywhere}
    @media(max-width:600px){.wide{grid-column:auto}.fields{grid-template-columns:1fr}}
  </style>
</head>
<body>
<header><h1>Prime<span>Stack</span> Asset Gateway</h1><div class="sub">Asset registry · network directory · routing · liquidity · conversions · operational compliance review</div></header>
<main>
  <section class="panel warning">PAG foundation: asset and network routing recommendations are configuration-based only. This dashboard does not screen sanctions, exchange assets, reserve balances, post ledger entries, settle funds, or connect to external payment networks. Liquidity figures are operator-maintained snapshots.</section>
  <section id="login" class="panel login"><h2>Administrator sign-in</h2><form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form><div id="login-error" class="notice hidden"></div></section>
  <div id="app" class="hidden">
    <section class="panel"><span id="identity" class="muted"></span> <button id="logout" type="button">Sign out</button> <button id="refresh" type="button">Refresh</button><div id="error" class="notice hidden"></div></section>
    <section class="metrics">
      <article class="metric"><div class="label">Assets</div><div class="value" id="assets-count">0</div></article>
      <article class="metric"><div class="label">Networks</div><div class="value" id="networks-count">0</div></article>
      <article class="metric"><div class="label">Asset routes</div><div class="value" id="routes-count">0</div></article>
      <article class="metric"><div class="label">Active conversion rates</div><div class="value" id="rates-count">0</div></article>
      <article class="metric"><div class="label">Liquidity pools</div><div class="value" id="pools-count">0</div></article>
      <article class="metric"><div class="label">Compliance review queue</div><div class="value" id="checks-count">0</div></article>
    </section>
    <section class="grid">
      <article class="panel"><h2>Register asset</h2><form id="asset-form"><div class="fields">
        <label>Asset code<input name="code" placeholder="EUR" maxlength="50" required></label><label>Name<input name="name" maxlength="255" required></label>
        <label>Type<select name="type"><option>FIAT</option><option>DIGITAL</option><option>LOYALTY</option><option>REWARD</option><option>STORED_VALUE</option><option>MERCHANT_CREDIT</option></select></label>
        <label>Precision<input name="precision" type="number" min="0" max="8" value="2" required></label></div><button>Register asset</button></form>
      </article>
      <article class="panel"><h2>Add network</h2><form id="network-form"><div class="fields">
        <label>Name<input name="networkName" maxlength="100" required></label><label>Type<select name="networkType"><option>INTERNAL</option><option>MERCHANT</option><option>WALLET</option><option>TERMINAL</option><option>SETTLEMENT</option><option>BANK</option><option>PAYMENT_PROCESSOR</option><option>DIGITAL_ASSET</option></select></label>
      </div><button>Add network</button></form></article>
      <article class="panel"><h2>Configure asset route</h2><form id="route-form">
        <label>Asset<select name="assetId" id="route-asset" required></select></label><label>Source network<select name="sourceNetworkId" id="route-source" required></select></label><label>Destination network<select name="destinationNetworkId" id="route-destination" required></select></label>
        <div class="fields"><label>Priority<input name="priority" type="number" min="1" max="1000" value="100" required></label><label>Cost (%)<input name="costPercent" type="number" min="0" step="0.0001" value="0" required></label>
        <label>Latency (ms)<input name="estimatedLatencyMs" type="number" min="0" max="600000" value="0" required></label><label>Availability (0-100)<input name="availabilityScore" type="number" min="0" max="100" value="100" required></label>
        <label class="full">Risk score (0-100)<input name="riskScore" type="number" min="0" max="100" value="0" required></label></div><button>Create route</button>
      </form></article>
      <article class="panel"><h2>Set conversion rate</h2><form id="rate-form">
        <label>From asset<select name="sourceAssetId" id="rate-source" required></select></label><label>To asset<select name="destinationAssetId" id="rate-destination" required></select></label>
        <label>Rate<input name="rate" type="number" min="0" step="0.00000001" required></label><button>Save rate</button>
      </form></article>
      <article class="panel"><h2>Create liquidity pool</h2><form id="pool-form">
        <label>Asset<select name="assetId" id="pool-asset" required></select></label><label>Network<select name="networkId" id="pool-network" required></select></label><button>Create empty pool</button>
      </form><p class="muted">Pool begins at zero. Update its snapshot only from reconciled operational data; it is not a ledger balance.</p></article>
      <article class="panel"><h2>Update liquidity snapshot</h2><form id="snapshot-form">
        <label>Pool<select name="id" id="pool-select" required></select></label>
        <div class="fields"><label>Available<input name="availableBalance" type="number" min="0" step="0.00000001" required></label><label>Reserved<input name="reservedBalance" type="number" min="0" step="0.00000001" required></label></div><button>Update snapshot</button>
      </form></article>
      <article class="panel wide"><h2>Smart route recommendation</h2><form id="select-form"><div class="fields">
        <label>Source network<select name="sourceNetworkId" id="select-source" required></select></label><label>Destination network<select name="destinationNetworkId" id="select-destination" required></select></label>
        <label>Asset<select name="assetCode" id="select-asset" required></select></label><label>Requested amount<input name="amount" type="number" min="0.00000001" step="0.00000001" required></label></div><button>Score available routes</button></form><div id="route-result" class="route-output muted"></div></article>
      <article class="panel wide"><h2>Asset registry</h2><div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Precision</th><th>Active</th></tr></thead><tbody id="assets-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Network directory</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Status</th></tr></thead><tbody id="networks-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Asset routes</h2><div class="table-wrap"><table><thead><tr><th>Asset</th><th>Source</th><th>Destination</th><th>Priority</th><th>Cost %</th><th>Latency</th><th>Availability</th><th>Risk</th><th>Active</th></tr></thead><tbody id="routes-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Liquidity snapshots</h2><div class="table-wrap"><table><thead><tr><th>Asset</th><th>Network</th><th>Available</th><th>Reserved</th><th>Updated</th></tr></thead><tbody id="pools-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Conversion rates</h2><div class="table-wrap"><table><thead><tr><th>From</th><th>To</th><th>Rate</th><th>Active</th><th>Updated</th></tr></thead><tbody id="rates-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Compliance review records</h2><p class="muted">Manual workflow records only; no automated sanctions or AML screening is connected.</p><form id="check-form" class="fields"><label>Reference<input name="reference" maxlength="100" required></label><label>Asset<select name="assetId" id="check-asset"></select></label><button>Create pending review record</button></form><div class="table-wrap"><table><thead><tr><th>Reference</th><th>Asset</th><th>Result</th><th>Checked</th><th>Review</th></tr></thead><tbody id="checks-table"></tbody></table></div></article>
    </section>
  </div>
</main>
<script>
  const $=id=>document.getElementById(id),tokenKey="pagAdminToken",roleKey="pagAdminRole",emailKey="pagAdminEmail";
  const canWrite=()=>["SUPER_ADMIN","ADMIN","OPERATOR"].includes(sessionStorage.getItem(roleKey));
  async function api(path,options={}){const response=await fetch("/admin/pag"+path,{...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),Authorization:"Bearer "+sessionStorage.getItem(tokenKey),...(options.headers||{})},cache:"no-store"});const payload=await response.json();if(response.status===401){signOut();throw Error("Admin session expired.");}if(!response.ok||payload.success===false)throw Error(payload.error?.message||"Request failed");return payload.data;}
  function signOut(){sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(roleKey);sessionStorage.removeItem(emailKey);$("app").classList.add("hidden");$("login").classList.remove("hidden");}
  function fill(id,items,label,key,allowEmpty=false){const node=$(id),prior=node.value;node.replaceChildren();if(allowEmpty)node.add(new Option("No asset filter",""));for(const item of items)node.add(new Option(label(item),item[key]));if(items.some(item=>item[key]===prior))node.value=prior;}
  function table(id,rows,columns){const body=$(id);body.replaceChildren();for(const row of rows){const tr=document.createElement("tr");for(const column of columns){const td=document.createElement("td");td.textContent=String(column(row)??"—");tr.appendChild(td);}body.appendChild(tr);}}
  async function refresh(){const data=await api("/dashboard");for(const [key,value] of Object.entries({assets:data.summary.assets,networks:data.summary.networks,routes:data.summary.routes,rates:data.summary.activeConversionRates,pools:data.summary.liquidityPools,checks:data.summary.complianceItemsForReview}))$(""+key+"-count").textContent=value;
    fill("route-asset",data.assets,item=>item.code+" · "+item.name,"id");fill("rate-source",data.assets,item=>item.code,"id");fill("rate-destination",data.assets,item=>item.code,"id");fill("pool-asset",data.assets,item=>item.code,"id");fill("select-asset",data.assets,item=>item.code,"code");fill("check-asset",data.assets,item=>item.code,"id",true);
    for(const id of ["route-source","route-destination","pool-network","select-source","select-destination"])fill(id,data.networks,item=>item.networkName+" · "+item.status,"id");
    fill("pool-select",data.liquidityPools,item=>item.asset.code+" · "+item.network.networkName,"id");
    table("assets-table",data.assets,[r=>r.code,r=>r.name,r=>r.type,r=>r.precision,r=>r.active?"Yes":"No"]);
    table("networks-table",data.networks,[r=>r.networkName,r=>r.networkType,r=>r.status]);
    table("routes-table",data.routes,[r=>r.asset.code,r=>r.sourceNetwork.networkName,r=>r.destinationNetwork.networkName,r=>r.priority,r=>r.costPercent,r=>r.estimatedLatencyMs+" ms",r=>r.availabilityScore,r=>r.riskScore,r=>r.active?"Yes":"No"]);
    table("pools-table",data.liquidityPools,[r=>r.asset.code,r=>r.network.networkName,r=>r.availableBalance,r=>r.reservedBalance,r=>new Date(r.updatedAt).toLocaleString()]);
    table("rates-table",data.rates,[r=>r.sourceAsset.code,r=>r.destinationAsset.code,r=>r.rate,r=>r.active?"Yes":"No",r=>new Date(r.updatedAt).toLocaleString()]);
    const checks=await api("/compliance-checks");const body=$("checks-table");body.replaceChildren();for(const check of checks){const tr=document.createElement("tr");for(const value of [check.reference,check.asset?.code||"—",check.result,new Date(check.checkedAt).toLocaleString()]){const td=document.createElement("td");td.textContent=value;tr.appendChild(td);}const td=document.createElement("td");if(["PENDING_REVIEW","REVIEW"].includes(check.result)&&canWrite()){for(const result of ["CLEARED","REVIEW","REJECTED"]){const button=document.createElement("button");button.textContent=result;button.style.margin="2px";button.onclick=async()=>{try{await api("/compliance-checks/"+encodeURIComponent(check.id),{method:"PATCH",body:JSON.stringify({result})});await refresh();}catch(error){showError(error);}};td.appendChild(button);}}tr.appendChild(td);body.appendChild(tr);}
    for(const form of document.querySelectorAll("#app form"))form.classList.toggle("hidden",!canWrite()&&form.id!=="select-form");
    $("identity").textContent=sessionStorage.getItem(emailKey)||"";
  }
  function showError(error){$("error").textContent=error instanceof Error?error.message:String(error);$("error").classList.remove("hidden");}
  function numericForm(form,keys){const value=Object.fromEntries(new FormData(form));for(const key of keys)value[key]=Number(value[key]);return value;}
  function submit(id,path,method="POST",numbers=[]){$(id).addEventListener("submit",async event=>{event.preventDefault();$("error").classList.add("hidden");try{const form=event.currentTarget,data=numericForm(form,numbers);await api(path,{method,body:JSON.stringify(data)});form.reset();await refresh();}catch(error){showError(error);}});}
  $("login-form").addEventListener("submit",async event=>{event.preventDefault();try{const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),cache:"no-store"}),payload=await response.json();if(!response.ok||!payload.success)throw Error(payload.error?.message||"Sign-in failed");if(!["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"].includes(payload.data.user.role))throw Error("Admin role is not permitted");sessionStorage.setItem(tokenKey,payload.data.token);sessionStorage.setItem(roleKey,payload.data.user.role);sessionStorage.setItem(emailKey,payload.data.user.email);$("login").classList.add("hidden");$("app").classList.remove("hidden");await refresh();}catch(error){$("login-error").textContent=error instanceof Error?error.message:String(error);$("login-error").classList.remove("hidden");}});
  $("logout").addEventListener("click",signOut);$("refresh").addEventListener("click",()=>refresh().catch(showError));
  submit("asset-form","/assets","POST",["precision"]);submit("network-form","/networks");submit("route-form","/routes","POST",["priority","estimatedLatencyMs","availabilityScore","riskScore"]);submit("rate-form","/conversion-rates");submit("pool-form","/liquidity-pools");
  $("snapshot-form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));try{await api("/liquidity-pools/"+encodeURIComponent(data.id)+"/snapshot",{method:"PUT",body:JSON.stringify({availableBalance:data.availableBalance,reservedBalance:data.reservedBalance})});await refresh();}catch(error){showError(error);}});
  $("check-form").addEventListener("submit",async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));if(!data.assetId)delete data.assetId;try{await api("/compliance-checks",{method:"POST",body:JSON.stringify(data)});event.currentTarget.reset();await refresh();}catch(error){showError(error);}});
  $("select-form").addEventListener("submit",async event=>{event.preventDefault();try{const data=Object.fromEntries(new FormData(event.currentTarget));const result=await api("/route-selection",{method:"POST",body:JSON.stringify(data)});$("route-result").textContent=JSON.stringify(result,null,2);}catch(error){showError(error);}});
  if(sessionStorage.getItem(tokenKey)&&["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"].includes(sessionStorage.getItem(roleKey))){$("login").classList.add("hidden");$("app").classList.remove("hidden");refresh().catch(showError);}else signOut();
</script>
</body>
</html>`;
