export const intelligenceDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><title>PrimeStack Intelligence</title>
  <style>
    :root{color-scheme:dark;--bg:#0a0e17;--panel:#121a28;--border:#253248;--text:#e7edf6;--muted:#91a0b5;--cyan:#52d6e8;--yellow:#f5c451}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 "Segoe UI",system-ui,sans-serif}
    header{padding:20px clamp(16px,4vw,44px);border-bottom:1px solid var(--border);background:#0d1420}h1{font-size:21px;margin:0}h1 span{color:var(--cyan)}
    main{max-width:1500px;margin:auto;padding:20px clamp(14px,3vw,32px)}.muted,.sub{color:var(--muted);font-size:12px}
    .panel,.metric{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:15px}.warning{margin:14px 0;padding:12px;border:1px solid #8a6820;border-radius:7px;background:#2b2313}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin:12px 0}.value{font-size:22px;font-weight:700}.label{font-size:10px;color:var(--muted);text-transform:uppercase}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:11px}.wide{grid-column:1/-1}.panel h2{font-size:14px;margin:0 0 10px}
    form{display:grid;gap:8px}label{display:grid;gap:4px;color:var(--muted);font-size:11px}input,select,textarea{width:100%;padding:8px;border:1px solid #34435b;border-radius:6px;background:#0d1420;color:var(--text);font:inherit}textarea{min-height:70px}
    button{padding:7px 10px;border:1px solid #28778a;border-radius:6px;background:#104250;color:white;font:inherit;cursor:pointer;margin:2px}.table-wrap{overflow:auto;max-height:360px}
    table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:8px;border-bottom:1px solid var(--border);font-size:11px}th{color:var(--muted);text-transform:uppercase;font-size:10px}
    .login{max-width:420px;margin:22px auto}.hidden{display:none!important}.notice{padding:8px;color:#ff9da6}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    @media(max-width:600px){.wide{grid-column:auto}}
  </style>
</head>
<body>
<header><h1>Prime<span>Stack</span> Intelligence</h1><div class="sub">Observed transaction, merchant and network indicators · recommendation-only mode</div></header>
<main>
  <section class="panel warning">Read-only intelligence foundation. Metrics summarize recorded data and may not represent settled financial results. Amounts are grouped by currency. Baseline projections are arithmetic, not validated predictive models. Recommendations are informational only: no routing, fraud, treasury, settlement, or infrastructure action is automated here.</section>
  <section id="login" class="panel login"><h2>Administrator sign-in</h2><form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form><div id="login-error" class="notice hidden"></div></section>
  <div id="app" class="hidden">
    <section class="panel toolbar"><span id="identity" class="muted"></span><button id="logout" type="button">Sign out</button><label>Period<select id="days"><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></label><button id="refresh" type="button">Refresh</button><div id="error" class="notice hidden"></div></section>
    <section class="metrics">
      <article class="metric"><div class="label">Transactions</div><div class="value" id="tx-total">—</div></article>
      <article class="metric"><div class="label">Successful</div><div class="value" id="tx-successful">—</div></article>
      <article class="metric"><div class="label">Declined</div><div class="value" id="tx-declined">—</div></article>
      <article class="metric"><div class="label">Observed success rate</div><div class="value" id="tx-rate">—</div></article>
      <article class="metric"><div class="label">Avg. log-stage duration</div><div class="value" id="tx-latency">—</div></article>
      <article class="metric"><div class="label">Recorded intelligence events</div><div class="value" id="event-count">—</div></article>
    </section>
    <section class="grid">
      <article class="panel"><h2>Successful transaction volume by currency</h2><div class="table-wrap"><table><thead><tr><th>Currency</th><th>Amount</th><th>Transactions</th></tr></thead><tbody id="volume"></tbody></table></div></article>
      <article class="panel"><h2>Completed transfer fees by currency</h2><p class="muted">Recorded transfer fees only; not net revenue or profit.</p><div class="table-wrap"><table><thead><tr><th>Currency</th><th>Fees</th><th>Transfers</th></tr></thead><tbody id="fees"></tbody></table></div></article>
      <article class="panel"><h2>Merchant activity</h2><div class="table-wrap"><table><thead><tr><th>Merchant</th><th>Currency</th><th>Successful amount</th><th>Count</th></tr></thead><tbody id="merchants"></tbody></table></div></article>
      <article class="panel"><h2>Network and terminal status</h2><div id="operations" class="muted"></div></article>
      <article class="panel"><h2>Informational recommendations</h2><div id="recommendations" class="muted"></div></article>
      <article class="panel"><h2>Observed baseline</h2><div id="forecast" class="muted"></div></article>
      <article class="panel wide"><h2>Intelligence event log</h2><div class="table-wrap"><table><thead><tr><th>Created</th><th>Type</th><th>Source</th><th>Confidence</th><th>Summary</th><th>Recorded by</th></tr></thead><tbody id="events"></tbody></table></div></article>
      <article class="panel" id="event-panel"><h2>Record an intelligence event</h2><p class="muted">This records an analyst/system observation only; it does not trigger an operational action.</p><form id="event-form">
        <label>Event type<input name="eventType" maxlength="100" pattern="[A-Z][A-Z0-9_]*" placeholder="ROUTE_LATENCY_ANOMALY" required></label>
        <label>Source system<input name="sourceSystem" maxlength="100" placeholder="SWITCH_CORE" required></label>
        <label>Confidence score (0-100)<input name="confidenceScore" type="number" min="0" max="100" step="0.01" required></label>
        <label>Summary<textarea name="summary" maxlength="1000" required></textarea></label><button>Record observation</button>
      </form></article>
    </section>
  </div>
</main>
<script>
(()=>{
  const tokenKey="intelligenceAdminToken",roleKey="intelligenceAdminRole",emailKey="intelligenceAdminEmail";
  const $=id=>document.getElementById(id),allowed=["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"];
  function signOut(){$("login").classList.remove("hidden");$("app").classList.add("hidden");sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(roleKey);sessionStorage.removeItem(emailKey);}
  function cell(row,value){const td=document.createElement("td");td.textContent=value==null?"—":String(value);row.appendChild(td);}
  function fill(id,rows,values){const body=$(id);body.replaceChildren();for(const valuesForRow of rows){const tr=document.createElement("tr");valuesForRow.forEach(value=>cell(tr,value));body.appendChild(tr);}}
  function showError(error){$("error").textContent=error instanceof Error?error.message:String(error);$("error").classList.remove("hidden");}
  async function api(path,options={}){const response=await fetch(path,{...options,headers:{"Authorization":"Bearer "+sessionStorage.getItem(tokenKey),"Content-Type":"application/json",...(options.headers||{})},cache:"no-store"});const payload=await response.json();if(!response.ok||!payload.success)throw Error(payload.error?.message||"Request failed");return payload.data;}
  async function refresh(){const data=await api("/admin/intelligence/dashboard?days="+$("days").value);$("error").classList.add("hidden");
    $("tx-total").textContent=data.transactions.currentTotal.toLocaleString();$("tx-successful").textContent=data.transactions.currentSuccessful.toLocaleString();$("tx-declined").textContent=data.transactions.currentDeclined.toLocaleString();
    $("tx-rate").textContent=data.transactions.successRatePercent===null?"—":data.transactions.successRatePercent+"%";
    $("tx-latency").textContent=data.operations.averageTransactionLogDurationMs===null?"—":Math.round(data.operations.averageTransactionLogDurationMs)+" ms";
    $("event-count").textContent=data.eventCount.toLocaleString();
    fill("volume",data.transactions.successfulVolumeByCurrency.map(row=>[row.currency,row.amount,row.count]));
    fill("fees",data.transferFeesByCurrency.map(row=>[row.currency,row.fees,row.completedTransfers]));
    fill("merchants",data.topMerchants.map(row=>[row.merchantCode+" · "+row.merchantName,row.currency,row.successfulAmount,row.successfulTransactions]));
    $("operations").textContent="Hosts: "+data.operations.hostStatuses.map(row=>row.status+" "+row.count).join(" · ")+" | Terminals: "+data.operations.terminalStatuses.map(row=>row.status+" "+row.count).join(" · ");
    $("recommendations").textContent=data.recommendations.length?data.recommendations.map(row=>row.severity+": "+row.message).join(" "):"No host availability review recommendations from the current snapshot.";
    $("forecast").textContent=data.forecast.description+" Observed-period baseline: "+data.forecast.nextPeriodTransactionCount.toLocaleString()+" transactions.";
    fill("events",data.events.map(row=>[new Date(row.createdAt).toLocaleString(),row.eventType,row.sourceSystem,row.confidenceScore+"%",row.summary,row.createdBy]));
  }
  $("login-form").addEventListener("submit",async event=>{event.preventDefault();try{const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),cache:"no-store"}),payload=await response.json();if(!response.ok||!payload.success)throw Error(payload.error?.message||"Sign-in failed");if(!allowed.includes(payload.data.user.role))throw Error("Admin role is not permitted");sessionStorage.setItem(tokenKey,payload.data.token);sessionStorage.setItem(roleKey,payload.data.user.role);sessionStorage.setItem(emailKey,payload.data.user.email);$("login").classList.add("hidden");$("app").classList.remove("hidden");$("identity").textContent=payload.data.user.email;$("event-panel").classList.toggle("hidden",!["SUPER_ADMIN","ADMIN","OPERATOR"].includes(payload.data.user.role));await refresh();}catch(error){$("login-error").textContent=error instanceof Error?error.message:String(error);$("login-error").classList.remove("hidden");}});
  $("event-form").addEventListener("submit",async event=>{event.preventDefault();try{const data=Object.fromEntries(new FormData(event.currentTarget));data.confidenceScore=Number(data.confidenceScore);await api("/admin/intelligence/events",{method:"POST",body:JSON.stringify(data)});event.currentTarget.reset();await refresh();}catch(error){showError(error);}});
  $("logout").addEventListener("click",signOut);$("refresh").addEventListener("click",()=>refresh().catch(showError));$("days").addEventListener("change",()=>refresh().catch(showError));
  const role=sessionStorage.getItem(roleKey);if(sessionStorage.getItem(tokenKey)&&allowed.includes(role)){$("login").classList.add("hidden");$("app").classList.remove("hidden");$("identity").textContent=sessionStorage.getItem(emailKey)||"";$("event-panel").classList.toggle("hidden",!["SUPER_ADMIN","ADMIN","OPERATOR"].includes(role));refresh().catch(showError);}else signOut();
})();
</script>
</body>
</html>`;
