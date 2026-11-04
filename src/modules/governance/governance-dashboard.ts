export const governanceDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><title>PrimeStack Governance Center</title>
  <style>
    :root{color-scheme:dark;--bg:#0a0e17;--panel:#121a28;--border:#253248;--text:#e7edf6;--muted:#91a0b5;--cyan:#52d6e8}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 "Segoe UI",system-ui,sans-serif}
    header{padding:20px clamp(16px,4vw,44px);border-bottom:1px solid var(--border);background:#0d1420}h1{font-size:21px;margin:0}h1 span{color:var(--cyan)}
    main{max-width:1550px;margin:auto;padding:20px clamp(14px,3vw,32px)}.muted,.sub{color:var(--muted);font-size:12px}
    .panel,.metric{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:15px}.warning{margin:14px 0;padding:12px;border:1px solid #8a6820;border-radius:7px;background:#2b2313}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px;margin:12px 0}.value{font-size:22px;font-weight:700}.label{font-size:10px;color:var(--muted);text-transform:uppercase}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:11px}.wide{grid-column:1/-1}.panel h2{font-size:14px;margin:0 0 10px}
    form{display:grid;gap:8px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.full{grid-column:1/-1}
    label{display:grid;gap:4px;color:var(--muted);font-size:11px}input,select,textarea{width:100%;padding:8px;border:1px solid #34435b;border-radius:6px;background:#0d1420;color:var(--text);font:inherit}textarea{min-height:65px;resize:vertical}
    button{padding:7px 10px;border:1px solid #28778a;border-radius:6px;background:#104250;color:white;font:inherit;cursor:pointer;margin:2px}.table-wrap{overflow:auto;max-height:360px}
    table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:8px;border-bottom:1px solid var(--border);font-size:11px}th{color:var(--muted);text-transform:uppercase;font-size:10px}
    .login{max-width:420px;margin:22px auto}.hidden{display:none!important}.notice{padding:8px;color:#ff9da6}
    @media(max-width:600px){.wide{grid-column:auto}.fields{grid-template-columns:1fr}}
  </style>
</head>
<body>
<header><h1>Prime<span>Stack</span> Governance Center</h1><div class="sub">Risk · recovery plans · evidence registers · change management · vendors · continuity</div></header>
<main>
  <section class="panel warning">Governance records and workflows only. A backup record does not run or verify a backup; key records contain no key material and do not operate a KMS; recovery plans do not configure replication or failover; retention policies do not delete data; report records do not generate or submit regulatory filings. Change approval here does not gate production changes or financial operations.</section>
  <section id="login" class="panel login"><h2>Administrator sign-in</h2><form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button>Sign in</button></form><div id="login-error" class="notice hidden"></div></section>
  <div id="app" class="hidden">
    <section class="panel"><span id="identity" class="muted"></span> <button id="logout" type="button">Sign out</button><button id="refresh" type="button">Refresh</button><div id="error" class="notice hidden"></div></section>
    <section class="metrics">
      <article class="metric"><div class="label">Open risks</div><div class="value" id="openRisks-count">0</div></article>
      <article class="metric"><div class="label">DR plans</div><div class="value" id="drPlans-count">0</div></article>
      <article class="metric"><div class="label">Backup failures</div><div class="value" id="backupFailures-count">0</div></article>
      <article class="metric"><div class="label">Active key records</div><div class="value" id="activeKeyRecords-count">0</div></article>
      <article class="metric"><div class="label">Active data policies</div><div class="value" id="activePolicies-count">0</div></article>
      <article class="metric"><div class="label">Pending changes</div><div class="value" id="pendingChanges-count">0</div></article>
      <article class="metric"><div class="label">Pending reports</div><div class="value" id="pendingReports-count">0</div></article>
      <article class="metric"><div class="label">Active vendors</div><div class="value" id="activeVendors-count">0</div></article>
    </section>
    <section class="grid">
      <article class="panel"><h2>Record enterprise risk</h2><form id="risk-form">
        <label>Category<select name="riskCategory"><option>OPERATIONAL</option><option>SECURITY</option><option>LIQUIDITY</option><option>COMPLIANCE</option><option>TECHNOLOGY</option><option>VENDOR</option></select></label>
        <div class="fields"><label>Impact<select name="impact"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Likelihood<select name="likelihood"><option>RARE</option><option>UNLIKELY</option><option>POSSIBLE</option><option>LIKELY</option><option>ALMOST_CERTAIN</option></select></label></div>
        <label>Description<textarea name="description" maxlength="4000" required></textarea></label><label>Mitigation<textarea name="mitigation" maxlength="4000" required></textarea></label><button>Record risk</button>
      </form></article>
      <article class="panel"><h2>Disaster-recovery plan record</h2><form id="dr-form">
        <label>Service name<input name="serviceName" maxlength="100" required></label><div class="fields"><label>RTO (minutes)<input name="rtoMinutes" type="number" min="0" max="525600" required></label><label>RPO (minutes)<input name="rpoMinutes" type="number" min="0" max="525600" required></label></div>
        <label>Plan reference<input name="planReference" maxlength="500"></label><button>Record draft plan</button>
      </form></article>
      <article class="panel"><h2>Record backup evidence</h2><form id="backup-form">
        <label>Type<select name="backupType"><option>FULL</option><option>INCREMENTAL</option><option>CONTINUOUS</option></select></label><label>Backup timestamp<input name="backupDate" type="datetime-local" required></label>
        <label>Status<select name="status"><option>SCHEDULED</option><option>SUCCEEDED</option><option>FAILED</option><option>VERIFIED</option></select></label><label>Artifact reference<input name="locationReference" maxlength="500"></label><label>Notes<textarea name="notes" maxlength="4000"></textarea></label><button>Record backup evidence</button>
      </form></article>
      <article class="panel"><h2>Record key metadata</h2><form id="key-form">
        <label>Purpose<input name="purpose" maxlength="100" placeholder="JWT signing / HMAC / encryption key" required></label><label>Version<input name="keyVersion" type="number" min="1" required></label><button>Register metadata only</button>
      </form><p class="muted">Never enter a key or secret here.</p></article>
      <article class="panel"><h2>Data-retention policy record</h2><form id="policy-form">
        <label>Name<input name="policyName" maxlength="100" required></label><label>Data category<input name="dataCategory" maxlength="100" placeholder="Audit logs" required></label><label>Retention days<input name="retentionDays" type="number" min="1" max="36500" required></label><label>Description<textarea name="description" maxlength="2000"></textarea></label><button>Record policy</button>
      </form></article>
      <article class="panel"><h2>Submit change request</h2><form id="change-form">
        <label>Title<input name="title" maxlength="255" required></label><label>Risk level<select name="riskLevel"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Description<textarea name="description" maxlength="4000" required></textarea></label><button>Submit for review</button>
      </form></article>
      <article class="panel"><h2>Regulatory report record</h2><form id="report-form">
        <label>Report type<input name="reportType" maxlength="100" required></label><label>Reporting period<input name="reportingPeriod" type="date" required></label><label>Artifact reference (optional)<input name="artifactReference" maxlength="500"></label><button>Record planned report</button>
      </form></article>
      <article class="panel"><h2>Vendor register</h2><form id="vendor-form">
        <label>Vendor name<input name="vendorName" maxlength="255" required></label><div class="fields"><label>Criticality<select name="criticality"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Risk rating<select name="riskRating"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label></div><label>Notes<textarea name="notes" maxlength="4000"></textarea></label><button>Record vendor</button>
      </form></article>
      <article class="panel"><h2>Continuity test record</h2><form id="test-form">
        <label>Scenario<input name="scenario" maxlength="255" placeholder="Data center failure" required></label><label>Test date<input name="testDate" type="datetime-local" required></label><label>Result<select name="result"><option>PLANNED</option><option>PASSED</option><option>FAILED</option><option>PARTIAL</option></select></label><label>Notes<textarea name="notes" maxlength="4000"></textarea></label><button>Record test</button>
      </form></article>
      <article class="panel wide"><h2>Enterprise risks</h2><div class="table-wrap"><table><thead><tr><th>Category</th><th>Impact</th><th>Likelihood</th><th>Status</th><th>Description</th><th>Mitigation</th></tr></thead><tbody id="risks-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Disaster-recovery plan records</h2><div class="table-wrap"><table><thead><tr><th>Service</th><th>RTO</th><th>RPO</th><th>Status</th><th>Plan reference</th></tr></thead><tbody id="dr-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Backup evidence</h2><div class="table-wrap"><table><thead><tr><th>Type</th><th>Backup time</th><th>Status</th><th>Reference</th><th>Recorded by</th></tr></thead><tbody id="backups-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Key lifecycle metadata</h2><div class="table-wrap"><table><thead><tr><th>Purpose</th><th>Version</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody id="keys-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Data-retention policies</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Category</th><th>Days</th><th>Status</th></tr></thead><tbody id="policies-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Change requests</h2><div class="table-wrap"><table><thead><tr><th>Title</th><th>Risk</th><th>Status</th><th>Requester</th><th>Reviewer</th><th>Approver</th><th>Action</th></tr></thead><tbody id="changes-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Regulatory report records</h2><div class="table-wrap"><table><thead><tr><th>Type</th><th>Period</th><th>Status</th><th>Generated</th><th>Artifact reference</th></tr></thead><tbody id="reports-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Vendors</h2><div class="table-wrap"><table><thead><tr><th>Vendor</th><th>Criticality</th><th>Risk</th><th>Status</th><th>Notes</th></tr></thead><tbody id="vendors-table"></tbody></table></div></article>
      <article class="panel wide"><h2>Business-continuity tests</h2><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Date</th><th>Result</th><th>Conducted by</th><th>Notes</th></tr></thead><tbody id="tests-table"></tbody></table></div></article>
    </section>
  </div>
</main>
<script>
  const $=id=>document.getElementById(id),tokenKey="governanceToken",roleKey="governanceRole",emailKey="governanceEmail";
  const canWrite=()=>["SUPER_ADMIN","ADMIN","OPERATOR"].includes(sessionStorage.getItem(roleKey));
  const api=async(path,options={})=>{const response=await fetch("/admin/governance"+path,{...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),Authorization:"Bearer "+sessionStorage.getItem(tokenKey),...(options.headers||{})},cache:"no-store"});const payload=await response.json();if(response.status===401){signOut();throw Error("Admin session expired.");}if(!response.ok||payload.success===false)throw Error(payload.error?.message||"Request failed");return payload.data;};
  function signOut(){$("app").classList.add("hidden");$("login").classList.remove("hidden");for(const key of [tokenKey,roleKey,emailKey])sessionStorage.removeItem(key);}
  function cell(row,value){const td=document.createElement("td");td.textContent=String(value??"—");row.appendChild(td);return td;}
  function addAction(row,label,action){const td=document.createElement("td"),button=document.createElement("button");button.textContent=label;button.dataset.action=action;td.appendChild(button);row.appendChild(td);}
  function table(id,rows,render){const body=$(id);body.replaceChildren();for(const item of rows){const tr=document.createElement("tr");render(tr,item);body.appendChild(tr);}}
  function showError(error){$("error").textContent=error instanceof Error?error.message:String(error);$("error").classList.remove("hidden");}
  function optional(data,keys){for(const key of keys)if(!data[key])delete data[key];return data;}
  function numberFields(data,keys){for(const key of keys)data[key]=Number(data[key]);return data;}
  function dateFields(data,keys){for(const key of keys)if(data[key])data[key]=new Date(data[key]).toISOString();return data;}
  function submit(id,path,transform=data=>data){$(id).addEventListener("submit",async event=>{event.preventDefault();$("error").classList.add("hidden");try{const form=event.currentTarget,data=transform(Object.fromEntries(new FormData(form)));await api(path,{method:"POST",body:JSON.stringify(data)});form.reset();await refresh();}catch(error){showError(error);}});}
  async function refresh(){const data=await api("/dashboard");for(const[key,value]of Object.entries(data.summary))$(key+"-count").textContent=value;$("identity").textContent=sessionStorage.getItem(emailKey)||"";
    table("risks-table",data.risks,(tr,r)=>[r.riskCategory,r.impact,r.likelihood,r.status,r.description,r.mitigation].forEach(v=>cell(tr,v)));
    table("dr-table",data.drPlans,(tr,r)=>[r.serviceName,r.rtoMinutes+" min",r.rpoMinutes+" min",r.status,r.planReference].forEach(v=>cell(tr,v)));
    table("backups-table",data.backups,(tr,r)=>[r.backupType,new Date(r.backupDate).toLocaleString(),r.status,r.locationReference,r.recordedBy].forEach(v=>cell(tr,v)));
    table("keys-table",data.keys,(tr,r)=>{[r.purpose,r.keyVersion,r.status,new Date(r.createdAt).toLocaleString()].forEach(v=>cell(tr,v));if(canWrite()){const next={GENERATED:"ACTIVE",ACTIVE:"ROTATING",ROTATING:"RETIRED",RETIRED:"DESTROYED"}[r.status];if(next)addAction(tr,"Mark "+next,"key:"+r.id+":"+next);}else cell(tr,"—");});
    table("policies-table",data.retentionPolicies,(tr,r)=>[r.policyName,r.dataCategory,r.retentionDays,r.active?"ACTIVE":"INACTIVE"].forEach(v=>cell(tr,v)));
    table("changes-table",data.changeRequests,(tr,r)=>{[r.title,r.riskLevel,r.approvalStatus,r.requestedBy,r.reviewedBy,r.approvedBy].forEach(v=>cell(tr,v));const next={REQUESTED:"REVIEWED",REVIEWED:"APPROVED",APPROVED:"IMPLEMENTED",IMPLEMENTED:"VERIFIED"}[r.approvalStatus];if(next&&(canWrite()||sessionStorage.getItem(roleKey)==="REVIEWER"))addAction(tr,"Move to "+next,"change:"+r.id+":"+next);else cell(tr,"—");});
    table("reports-table",data.regulatoryReports,(tr,r)=>[r.reportType,new Date(r.reportingPeriod).toLocaleDateString(),r.status,r.generatedAt?new Date(r.generatedAt).toLocaleString():"—",r.artifactReference].forEach(v=>cell(tr,v)));
    table("vendors-table",data.vendors,(tr,r)=>[r.vendorName,r.criticality,r.riskRating,r.status,r.notes].forEach(v=>cell(tr,v)));
    table("tests-table",data.continuityTests,(tr,r)=>[r.scenario,new Date(r.testDate).toLocaleString(),r.result,r.conductedBy,r.notes].forEach(v=>cell(tr,v)));
    for(const form of document.querySelectorAll("#app form"))form.classList.toggle("hidden",!canWrite());
  }
  submit("risk-form","/risks");submit("dr-form","/disaster-recovery-plans",d=>numberFields(optional(d,["planReference"]),["rtoMinutes","rpoMinutes"]));
  submit("backup-form","/backups",d=>dateFields(optional(d,["locationReference","notes"]),["backupDate"]));
  submit("key-form","/key-records",d=>numberFields(d,["keyVersion"]));
  submit("policy-form","/retention-policies",d=>numberFields(optional(d,["description"]),["retentionDays"]));
  submit("change-form","/change-requests");submit("report-form","/regulatory-reports",d=>dateFields(optional(d,["artifactReference"]),["reportingPeriod"]));
  submit("vendor-form","/vendors",d=>optional(d,["notes"]));submit("test-form","/continuity-tests",d=>dateFields(optional(d,["notes"]),["testDate"]));
  $("app").addEventListener("click",async event=>{const target=event.target;if(!(target instanceof HTMLButtonElement)||!target.dataset.action)return;const[action,id,status]=target.dataset.action.split(":");try{const path=action==="key"?"/key-records/":"/change-requests/";await api(path+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(action==="key"?{status}:{approvalStatus:status})});await refresh();}catch(error){showError(error);}});
  $("login-form").addEventListener("submit",async event=>{event.preventDefault();try{const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),cache:"no-store"}),payload=await response.json();if(!response.ok||!payload.success)throw Error(payload.error?.message||"Sign-in failed");if(!["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"].includes(payload.data.user.role))throw Error("Admin role is not permitted");sessionStorage.setItem(tokenKey,payload.data.token);sessionStorage.setItem(roleKey,payload.data.user.role);sessionStorage.setItem(emailKey,payload.data.user.email);$("login").classList.add("hidden");$("app").classList.remove("hidden");await refresh();}catch(error){$("login-error").textContent=error instanceof Error?error.message:String(error);$("login-error").classList.remove("hidden");}});
  $("logout").addEventListener("click",signOut);$("refresh").addEventListener("click",()=>refresh().catch(showError));
  if(sessionStorage.getItem(tokenKey)&&["SUPER_ADMIN","ADMIN","OPERATOR","REVIEWER","READONLY"].includes(sessionStorage.getItem(roleKey))){$("login").classList.add("hidden");$("app").classList.remove("hidden");refresh().catch(showError);}else signOut();
</script>
</body>
</html>`;
