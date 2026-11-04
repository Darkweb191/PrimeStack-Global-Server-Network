export const developerPlatformDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><title>PrimeStack Developer Platform</title>
  <style>
    :root{color-scheme:dark;--bg:#0a0e17;--panel:#121a28;--border:#253248;--text:#e7edf6;--muted:#91a0b5;--cyan:#52d6e8}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 "Segoe UI",system-ui,sans-serif}
    header{padding:20px clamp(16px,4vw,44px);border-bottom:1px solid var(--border);background:#0d1420}h1{font-size:21px;margin:0}h1 span{color:var(--cyan)}
    main{max-width:1500px;margin:auto;padding:20px clamp(14px,3vw,32px)}.muted,.sub{color:var(--muted);font-size:12px}
    .panel,.metric{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:15px}.warning{margin:14px 0;padding:12px;border:1px solid #8a6820;border-radius:7px;background:#2b2313}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px;margin:12px 0}.value{font-size:22px;font-weight:700}.label{font-size:10px;color:var(--muted);text-transform:uppercase}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:11px}.wide{grid-column:1/-1}.panel h2{font-size:14px;margin:0 0 10px}
    form{display:grid;gap:8px}label{display:grid;gap:4px;color:var(--muted);font-size:11px}input,select{width:100%;padding:8px;border:1px solid #34435b;border-radius:6px;background:#0d1420;color:var(--text);font:inherit}
    select[multiple]{min-height:80px}button{padding:7px 10px;border:1px solid #28778a;border-radius:6px;background:#104250;color:white;font:inherit;cursor:pointer;margin:2px}
    button:disabled{opacity:.45;cursor:not-allowed}.table-wrap{overflow:auto;max-height:400px}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:8px;border-bottom:1px solid var(--border);font-size:11px}th{color:var(--muted);text-transform:uppercase;font-size:10px}
    .login{max-width:420px;margin:22px auto}.hidden{display:none!important}.notice{padding:8px;color:#ff9da6}.good{color:#7be3ae}dialog{max-width:600px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:9px}pre{white-space:pre-wrap;overflow-wrap:anywhere}
    @media(max-width:600px){.wide{grid-column:auto}}
  </style>
</head>
<body>
<header><h1>Prime<span>Stack</span> Developer Platform</h1><div class="sub">Applications · credentials · API catalog · webhooks · SDKs · partners · certification</div></header>
<main>
  <section class="panel warning">Platform foundation only: rate plans and product assignments are configuration and are not enforced on API traffic. Webhook registrations are stored but are not connected to event delivery. OAuth, tenant isolation, analytics, marketplace publishing, and SDK downloads are not enabled.</section>
  <section id="login" class="panel login"><h2>Administrator sign-in</h2><form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form><div id="login-error" class="notice hidden"></div></section>
  <div id="app" class="hidden">
    <section class="panel"><span id="identity" class="muted"></span> <button id="logout" type="button">Sign out</button><button id="refresh" type="button">Refresh</button><div id="error" class="notice hidden"></div></section>
    <section class="metrics">
      <article class="metric"><div class="label">Applications</div><div class="value" id="applications-count">0</div></article>
      <article class="metric"><div class="label">Active applications</div><div class="value" id="activeApplications-count">0</div></article>
      <article class="metric"><div class="label">API products</div><div class="value" id="products-count">0</div></article>
      <article class="metric"><div class="label">Rate plans</div><div class="value" id="ratePlans-count">0</div></article>
      <article class="metric"><div class="label">Active webhooks</div><div class="value" id="activeWebhooks-count">0</div></article>
      <article class="metric"><div class="label">Pending certifications</div><div class="value" id="pendingCertifications-count">0</div></article>
    </section>
    <section class="grid">
      <article class="panel"><h2>Register application</h2><form id="application-form">
        <label>Application name<input name="appName" maxlength="255" required></label>
        <label>Owner ID (UUID)<input name="ownerId" placeholder="Owner or partner reference UUID" required></label>
        <label>Application type<select name="appType"><option>MERCHANT_APP</option><option>TERMINAL_APP</option><option>WALLET_APP</option><option>TREASURY_APP</option><option>PARTNER_APP</option></select></label>
        <label>Rate plan<select name="ratePlanId" id="app-rate-plan"></select></label>
        <label>API products (Ctrl/Cmd-click to select)<select name="productIds" id="app-products" multiple></select></label><button>Register pending application</button>
      </form></article>
      <article class="panel"><h2>Create API product</h2><form id="product-form">
        <label>Product name<input name="productName" maxlength="255" required></label><label>Description<input name="description" maxlength="2000"></label><button>Create product</button>
      </form></article>
      <article class="panel"><h2>Create rate plan</h2><form id="rate-plan-form">
        <label>Plan name<input name="planName" maxlength="100" required></label>
        <label>Requests per minute<input name="requestsPerMinute" type="number" min="1"></label><label>Daily limit<input name="dailyLimit" type="number" min="1"></label><p class="muted">Leave both limits blank for an unlimited configuration. Values are not currently enforced.</p><button>Create rate plan</button>
      </form></article>
      <article class="panel"><h2>Register webhook endpoint</h2><form id="webhook-form">
        <label>Application<select name="applicationId" id="webhook-app" required></select></label>
        <label>Event<select name="eventName"><option>TRANSFER_APPROVED</option><option>TRANSFER_FAILED</option><option>WALLET_CREDITED</option><option>SETTLEMENT_COMPLETED</option><option>TERMINAL_ONLINE</option><option>TERMINAL_OFFLINE</option></select></label>
        <label>HTTPS callback URL<input name="callbackUrl" type="url" placeholder="https://example.com/webhooks" required></label><button>Register endpoint</button>
      </form></article>
      <article class="panel"><h2>Register SDK version</h2><form id="sdk-form">
        <label>SDK name<input name="sdkName" maxlength="100" placeholder="PrimeStack SDK" required></label>
        <label>Language<select name="language"><option>NodeJS</option><option>Java</option><option>Go</option><option>Python</option><option>.NET</option><option>PHP</option></select></label>
        <label>Version<input name="version" maxlength="20" placeholder="1.0.0" required></label><button>Register SDK metadata</button>
      </form></article>
      <article class="panel"><h2>Register partner</h2><form id="partner-form">
        <label>Partner name<input name="partnerName" maxlength="255" required></label>
        <label>Partner type<select name="partnerType"><option>BANK</option><option>PROCESSOR</option><option>AGGREGATOR</option><option>MERCHANT</option><option>TREASURY</option><option>NETWORK</option></select></label><button>Register partner</button>
      </form></article>
      <article class="panel"><h2>Start certification</h2><form id="certification-form">
        <label>Application<select name="applicationId" id="cert-app" required></select></label>
        <label>Type<select name="certificationType"><option>API_CERTIFICATION</option><option>TERMINAL_CERTIFICATION</option><option>MERCHANT_CERTIFICATION</option><option>INTEGRATION_CERTIFICATION</option></select></label><button>Create pending certification</button>
      </form></article>
      <article class="panel wide"><h2>Applications and credentials</h2><p class="muted">Secrets are shown only once when created or rotated. Only administrators can manage credentials.</p><div class="table-wrap"><table><thead><tr><th>Application</th><th>Owner</th><th>Type</th><th>Status</th><th>Products</th><th>Rate plan</th><th>Keys</th><th>Actions</th></tr></thead><tbody id="applications-table"></tbody></table></div></article>
      <article class="panel wide"><h2>API products</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th>Status</th><th>Action</th></tr></thead><tbody id="products-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Rate plans</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Requests/minute</th><th>Daily limit</th></tr></thead><tbody id="rates-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Webhook registrations</h2><div class="table-wrap"><table><thead><tr><th>Application</th><th>Event</th><th>Callback URL</th><th>Status</th><th>Action</th></tr></thead><tbody id="webhooks-table"></tbody></table></div></article>
      <article class="panel wide"><h2>SDK versions</h2><div class="table-wrap"><table><thead><tr><th>SDK</th><th>Language</th><th>Version</th></tr></thead><tbody id="sdks-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Partners</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody id="partners-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Certifications</h2><div class="table-wrap"><table><thead><tr><th>Application</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody id="certifications-table"></tbody></table></div></article>
    </section>
  </div>
  <dialog id="key-dialog"><h2>Copy this API secret now</h2><p class="muted">The secret is not stored in recoverable form and will not be shown again.</p><pre id="key-output"></pre><button id="key-close" type="button">Close</button></dialog>
</main>
<script>
  const $=id=>document.getElementById(id),tokenKey="developerPlatformToken",roleKey="developerPlatformRole",emailKey="developerPlatformEmail";
  const canWrite=()=>["SUPER_ADMIN","ADMIN","OPERATOR"].includes(sessionStorage.getItem(roleKey));
  const canManageKeys=()=>["SUPER_ADMIN","ADMIN"].includes(sessionStorage.getItem(roleKey));
  async function api(path,options={}){const response=await fetch("/admin/developer-platform"+path,{...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),Authorization:"Bearer "+sessionStorage.getItem(tokenKey),...(options.headers||{})},cache:"no-store"});const payload=await response.json();if(response.status===401){signOut();throw Error("Admin session expired.");}if(!response.ok||payload.success===false)throw Error(payload.error?.message||"Request failed");return payload.data;}
  function signOut(){$("app").classList.add("hidden");$("login").classList.remove("hidden");for(const key of [tokenKey,roleKey,emailKey])sessionStorage.removeItem(key);}
  function fill(id,items,label,key,emptyLabel){const node=$(id),prior=node.value;node.replaceChildren();if(emptyLabel)node.add(new Option(emptyLabel,""));for(const item of items)node.add(new Option(label(item),item[key]));if(items.some(item=>item[key]===prior))node.value=prior;}
  function cell(row,value){const td=document.createElement("td");td.textContent=String(value??"—");row.appendChild(td);return td;}
  function button(parent,label,action,disabled=false){const b=document.createElement("button");b.textContent=label;b.dataset.action=action;b.disabled=disabled;parent.appendChild(b);}
  function showKey(data){$("key-output").textContent="Key ID: "+data.keyId+"\\nSecret: "+data.secret;$("key-dialog").showModal();}
  function showError(error){$("error").textContent=error instanceof Error?error.message:String(error);$("error").classList.remove("hidden");}
  async function refresh(){const data=await api("/dashboard");
    for(const [key,value] of Object.entries(data.summary))$(key+"-count").textContent=value;
    fill("app-rate-plan",data.ratePlans,item=>item.planName,"id","No plan");fill("app-products",data.products.filter(item=>item.active),item=>item.productName,"id");
    fill("webhook-app",data.applications,item=>item.appName+" · "+item.status,"id");fill("cert-app",data.applications,item=>item.appName+" · "+item.status,"id");
    const appBody=$("applications-table");appBody.replaceChildren();for(const app of data.applications){const tr=document.createElement("tr");cell(tr,app.appName);cell(tr,app.ownerId);cell(tr,app.appType);cell(tr,app.status);cell(tr,app.products.map(x=>x.product.productName).join(", "));cell(tr,app.ratePlan?.planName);
      const keys=cell(tr,"");for(const key of app.keys){const line=document.createElement("div");line.textContent=key.keyId+" · "+(key.active?"active":"revoked")+" · …"+key.secretLast4;keys.appendChild(line);}
      const actions=cell(tr,"");if(canWrite()){const next=app.status==="ACTIVE"?"SUSPENDED":"ACTIVE";button(actions,next==="ACTIVE"?"Activate":"Suspend","app-status:"+app.id+":"+next);}
      if(canManageKeys()&&app.status==="ACTIVE"){const active=app.keys.find(key=>key.active);button(actions,active?"Rotate key":"Create key",active?"rotate:"+app.id+":"+active.keyId:"create-key:"+app.id);}
      if(canManageKeys()){for(const key of app.keys.filter(item=>item.active))button(actions,"Revoke "+key.keyId.slice(-6),"revoke:"+app.id+":"+key.keyId);}
      appBody.appendChild(tr);}
    const productBody=$("products-table");productBody.replaceChildren();for(const item of data.products){const tr=document.createElement("tr");cell(tr,item.productName);cell(tr,item.description);cell(tr,item.active?"ACTIVE":"INACTIVE");const actions=cell(tr,"");if(canWrite())button(actions,item.active?"Disable":"Enable","product:"+item.id+":"+!item.active);productBody.appendChild(tr);}
    const rateBody=$("rates-table");rateBody.replaceChildren();for(const item of data.ratePlans){const tr=document.createElement("tr");cell(tr,item.planName);cell(tr,item.requestsPerMinute??"Unlimited");cell(tr,item.dailyLimit??"Unlimited");rateBody.appendChild(tr);}
    const webhookBody=$("webhooks-table");webhookBody.replaceChildren();for(const item of data.webhooks){const tr=document.createElement("tr");cell(tr,item.application.appName);cell(tr,item.eventName);cell(tr,item.callbackUrl);cell(tr,item.active?"ACTIVE":"INACTIVE");const actions=cell(tr,"");if(canWrite())button(actions,item.active?"Disable":"Enable","webhook:"+item.id+":"+!item.active);webhookBody.appendChild(tr);}
    const sdkBody=$("sdks-table");sdkBody.replaceChildren();for(const item of data.sdkVersions){const tr=document.createElement("tr");cell(tr,item.sdkName);cell(tr,item.language);cell(tr,item.version);sdkBody.appendChild(tr);}
    const partnerBody=$("partners-table");partnerBody.replaceChildren();for(const item of data.partners){const tr=document.createElement("tr");cell(tr,item.partnerName);cell(tr,item.partnerType);cell(tr,item.active?"ACTIVE":"INACTIVE");const actions=cell(tr,"");if(canWrite())button(actions,item.active?"Disable":"Enable","partner:"+item.id+":"+!item.active);partnerBody.appendChild(tr);}
    const certBody=$("certifications-table");certBody.replaceChildren();for(const item of data.certifications){const tr=document.createElement("tr");cell(tr,item.application.appName);cell(tr,item.certificationType);cell(tr,item.status);const actions=cell(tr,"");if(canWrite()&&["PENDING","IN_PROGRESS"].includes(item.status)){button(actions,"In progress","cert:"+item.id+":IN_PROGRESS");button(actions,"Certify","cert:"+item.id+":CERTIFIED");button(actions,"Reject","cert:"+item.id+":REJECTED");}certBody.appendChild(tr);}
    for(const form of document.querySelectorAll("#app form"))form.classList.toggle("hidden",!canWrite());$("identity").textContent=sessionStorage.getItem(emailKey)||"";
  }
  function formSubmit(id,path,transform=value=>value){$(id).addEventListener("submit",async event=>{event.preventDefault();$("error").classList.add("hidden");try{const data=transform(Object.fromEntries(new FormData(event.currentTarget)));await api(path,{method:"POST",body:JSON.stringify(data)});event.currentTarget.reset();await refresh();}catch(error){showError(error);}});}
  formSubmit("application-form","/applications",data=>{const products=$("app-products");data.productIds=Array.from(products.selectedOptions,item=>item.value);if(!data.ratePlanId)delete data.ratePlanId;return data;});
  formSubmit("product-form","/products",data=>{if(!data.description)delete data.description;return data;});
  formSubmit("rate-plan-form","/rate-plans",data=>{for(const key of ["requestsPerMinute","dailyLimit"])data[key]=data[key]?Number(data[key]):null;return data;});
  $("webhook-form").addEventListener("submit",async event=>{event.preventDefault();try{const data=Object.fromEntries(new FormData(event.currentTarget)),applicationId=data.applicationId;delete data.applicationId;await api("/applications/"+encodeURIComponent(applicationId)+"/webhooks",{method:"POST",body:JSON.stringify(data)});event.currentTarget.reset();await refresh();}catch(error){showError(error);}});
  formSubmit("sdk-form","/sdk-versions");formSubmit("partner-form","/partners");
  formSubmit("certification-form","/certifications",data=>data);
  $("app").addEventListener("click",async event=>{const target=event.target;if(!(target instanceof HTMLButtonElement)||!target.dataset.action)return;const [action,id,value]=target.dataset.action.split(":");try{
    if(action==="app-status")await api("/applications/"+id,{method:"PATCH",body:JSON.stringify({status:value})});
    if(action==="create-key"){const key=await api("/applications/"+id+"/api-keys",{method:"POST"});showKey(key);}
    if(action==="rotate"){const key=await api("/applications/"+id+"/api-keys/"+encodeURIComponent(value)+"/rotate",{method:"POST"});showKey(key);}
    if(action==="revoke")await api("/applications/"+id+"/api-keys/"+encodeURIComponent(value),{method:"DELETE"});
    if(action==="product")await api("/products/"+id,{method:"PATCH",body:JSON.stringify({active:value==="true"})});
    if(action==="webhook")await api("/webhooks/"+id,{method:"PATCH",body:JSON.stringify({active:value==="true"})});
    if(action==="partner")await api("/partners/"+id,{method:"PATCH",body:JSON.stringify({active:value==="true"})});
    if(action==="cert")await api("/certifications/"+id,{method:"PATCH",body:JSON.stringify({status:value})});
    await refresh();
  }catch(error){showError(error);}});
  $("login-form").addEventListener("submit",async event=>{event.preventDefault();try{const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),cache:"no-store"}),payload=await response.json();if(!response.ok||!payload.success)throw Error(payload.error?.message||"Sign-in failed");if(!["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"].includes(payload.data.user.role))throw Error("Admin role is not permitted");sessionStorage.setItem(tokenKey,payload.data.token);sessionStorage.setItem(roleKey,payload.data.user.role);sessionStorage.setItem(emailKey,payload.data.user.email);$("login").classList.add("hidden");$("app").classList.remove("hidden");await refresh();}catch(error){$("login-error").textContent=error instanceof Error?error.message:String(error);$("login-error").classList.remove("hidden");}});
  $("logout").addEventListener("click",signOut);$("refresh").addEventListener("click",()=>refresh().catch(showError));$("key-close").addEventListener("click",()=>$("key-dialog").close());
  if(sessionStorage.getItem(tokenKey)&&["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"].includes(sessionStorage.getItem(roleKey))){$("login").classList.add("hidden");$("app").classList.remove("hidden");refresh().catch(showError);}else signOut();
</script>
</body>
</html>`;
