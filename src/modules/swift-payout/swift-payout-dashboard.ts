export const swiftPayoutDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><title>SWIFT payout draft | PrimeStack</title>
  <style>
    *{box-sizing:border-box}body{margin:0;padding:22px;background:#0a0e17;color:#e7edf6;font:14px/1.5 "Segoe UI",system-ui,sans-serif}
    main{max-width:1100px;margin:auto}.panel{padding:18px;border:1px solid #253248;border-radius:9px;background:#121a28;margin-bottom:14px}
    h1{font-size:22px;margin:0}.sub,.hint{color:#91a0b5;font-size:12px}.warning{padding:12px;margin:15px 0;border:1px solid #a77a1c;background:#332912;border-radius:7px;font-weight:600}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}fieldset{border:1px solid #253248;border-radius:7px;margin:0 0 12px;padding:14px}legend{color:#52d6e8;padding:0 6px}
    label{display:grid;gap:4px;color:#91a0b5;font-size:12px}input,select,textarea{width:100%;padding:9px 10px;border:1px solid #34435b;border-radius:6px;background:#0d1420;color:#e7edf6;font:inherit}
    button{padding:9px 13px;border:1px solid #28778a;border-radius:6px;background:#104250;color:#fff;font:inherit;cursor:pointer;margin-right:8px}
    button.secondary{border-color:#34435b;background:#172233}textarea{min-height:360px;font:12px/1.5 Consolas,monospace;white-space:pre;tab-size:2}
    .error{color:#ff9da6;white-space:pre-wrap}.hidden{display:none!important}.ids{overflow-wrap:anywhere}
    @media print{body{background:white;color:#111;padding:0}.panel{background:white;color:#111;border:0;padding:0}.warning{color:#111;background:white}.sub,.hint{color:#444}fieldset,#draft-form,.actions{display:none!important}textarea{color:#111;border:0;min-height:0}}
  </style>
</head>
<body>
<main>
  <section class="panel"><h1>SWIFT MX payout draft</h1><div class="sub">ISO 20022 pacs.008.001.08 message preparation</div>
  <div class="warning">DRAFT ONLY — this creates XML for review. It does not submit a payment, contact SWIFT or a bank, reserve funds, or confirm settlement. Production acceptance depends on your bank's certified CBPR+ profile.</div></section>
  <section id="login-panel" class="panel"><h2>Administrator sign-in</h2><form id="login-form" class="grid">
    <label>Email<input name="email" type="email" autocomplete="username" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <div><button type="submit">Sign in</button><button id="logout" class="secondary hidden" type="button">Sign out</button><span id="identity" class="hint"></span></div>
  </form><div id="login-error" class="error hidden" role="alert"></div></section>
  <div id="error" class="panel error hidden" role="alert"></div>
  <form id="draft-form" class="panel hidden">
    <div class="grid">
      <label>Settlement method<select name="settlementMethod"><option>INDA</option><option>INGA</option><option>COVE</option><option>CLRG</option></select></label>
      <label>Settlement date<input name="settlementDate" type="date" required></label>
      <label>Interbank settlement amount<input name="settlementAmount" inputmode="decimal" placeholder="40000000.00" required></label>
      <label>Settlement currency<input name="settlementCurrency" value="EUR" maxlength="3" required></label>
      <label>Instructed amount<input name="instructedAmount" inputmode="decimal" placeholder="Same as settlement amount"></label>
      <label>Instructed currency<input name="instructedCurrency" maxlength="3" placeholder="Same as settlement currency"></label>
      <label>Charge bearer<select name="chargeBearer"><option>SHAR</option><option>DEBT</option><option>CRED</option><option>SLEV</option></select></label>
      <label>End-to-end ID (optional)<input name="endToEndId" maxlength="35"></label>
      <label>Local instrument proprietary code<input name="localInstrument" maxlength="35"></label>
      <label>Category purpose proprietary code<input name="categoryPurpose" maxlength="35" value="CASH"></label>
      <label class="full">Remittance information<input name="remittanceInformation" maxlength="140"></label>
    </div>
    <div class="grid">
      <fieldset><legend>Debtor / ordering customer</legend><div class="grid">
        <label>Name<input name="debtor.name" maxlength="140" required></label><label>Debtor IBAN<input name="debtor.iban" autocomplete="off" required></label>
        <label>Debtor agent BIC<input name="debtor.agentBic" maxlength="11" required></label><label>Debtor agent name<input name="debtor.agentName" maxlength="140"></label>
        <label>Street<input name="debtor.streetName" maxlength="70" required></label><label>Building number<input name="debtor.buildingNumber" maxlength="16"></label>
        <label>Postal code<input name="debtor.postalCode" maxlength="16"></label><label>Town / city<input name="debtor.townName" maxlength="35" required></label>
        <label>Country code<input name="debtor.country" maxlength="2" placeholder="DE" required></label>
      </div></fieldset>
      <fieldset><legend>Creditor / beneficiary</legend><div class="grid">
        <label>Name<input name="creditor.name" maxlength="140" required></label><label>Creditor IBAN<input name="creditor.iban" autocomplete="off" required></label>
        <label>Creditor agent BIC<input name="creditor.agentBic" maxlength="11" required></label><label>Creditor agent name<input name="creditor.agentName" maxlength="140"></label>
        <label>Street<input name="creditor.streetName" maxlength="70" required></label><label>Building number<input name="creditor.buildingNumber" maxlength="16"></label>
        <label>Postal code<input name="creditor.postalCode" maxlength="16"></label><label>Town / city<input name="creditor.townName" maxlength="35" required></label>
        <label>Country code<input name="creditor.country" maxlength="2" placeholder="ES" required></label>
      </div></fieldset>
    </div>
    <button type="submit">Generate draft XML</button><span class="hint">Bank account and party details are sent only to this PrimeStack API request and are not persisted by this draft feature.</span>
  </form>
  <section id="result" class="panel hidden">
    <h2>Generated message <span id="state">DRAFT_NOT_SENT</span></h2>
    <p class="ids">Message ID: <code id="message-id"></code><br>End-to-end ID: <code id="end-id"></code><br>UETR: <code id="uetr"></code></p>
    <div class="warning">Review with your bank or authorized payment provider. This XML has not been validated against a bank-specific CBPR+ usage profile and must not be treated as sent or accepted.</div>
    <label>Generated pacs.008 XML<textarea id="xml" readonly spellcheck="false"></textarea></label>
    <div class="actions"><button id="download" type="button">Download XML draft</button><button id="print" class="secondary" type="button">Print review copy</button></div>
  </section>
</main>
<script>
  const $=id=>document.getElementById(id),form=$("draft-form"),error=$("error"),result=$("result"),tokenKey="swiftPayoutAdminToken";
  const permitted=role=>["SUPER_ADMIN","ADMIN","OPERATOR"].includes(role);
  function signOut(){sessionStorage.removeItem(tokenKey);sessionStorage.removeItem("swiftPayoutAdminRole");sessionStorage.removeItem("swiftPayoutAdminEmail");$("draft-form").classList.add("hidden");$("result").classList.add("hidden");$("logout").classList.add("hidden");$("identity").textContent="";}
  $("login-form").addEventListener("submit",async event=>{event.preventDefault();$("login-error").classList.add("hidden");try{const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),cache:"no-store"});const payload=await response.json();if(!response.ok||!payload.success)throw new Error(payload.error?.message||"Sign-in failed.");if(!permitted(payload.data.user.role))throw new Error("Your admin role cannot create payout drafts.");sessionStorage.setItem(tokenKey,payload.data.token);sessionStorage.setItem("swiftPayoutAdminRole",payload.data.user.role);sessionStorage.setItem("swiftPayoutAdminEmail",payload.data.user.email);$("draft-form").classList.remove("hidden");$("logout").classList.remove("hidden");$("identity").textContent=payload.data.user.email;}catch(failure){$("login-error").textContent=failure instanceof Error?failure.message:String(failure);$("login-error").classList.remove("hidden");}});
  $("logout").addEventListener("click",signOut);
  if(sessionStorage.getItem(tokenKey)&&permitted(sessionStorage.getItem("swiftPayoutAdminRole"))){$("draft-form").classList.remove("hidden");$("logout").classList.remove("hidden");$("identity").textContent=sessionStorage.getItem("swiftPayoutAdminEmail")||"";}else signOut();
  const date=new Date();form.elements.settlementDate.value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);
  form.addEventListener("submit",async event=>{event.preventDefault();error.classList.add("hidden");result.classList.add("hidden");const data=Object.fromEntries(new FormData(form));for(const key of ["debtor","creditor"]){data[key]={};for(const field of form.querySelectorAll("[name^='"+key+".']"))data[key][field.name.slice(key.length+1)]=field.value.trim();}for(const key of ["instructedAmount","instructedCurrency","endToEndId","localInstrument","categoryPurpose","remittanceInformation"]){if(!data[key])delete data[key];}for(const key of ["debtor","creditor"]){for(const field of Object.keys(data[key]))if(!data[key][field])delete data[key][field];}try{const response=await fetch("/admin/swift-payouts/draft",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:"Bearer "+sessionStorage.getItem(tokenKey)},body:JSON.stringify(data),cache:"no-store"});const payload=await response.json();if(response.status===401){signOut();throw new Error("Admin session expired. Sign in again.");}if(!response.ok||payload.success===false)throw new Error(payload.error?.message||"Draft generation failed.");const draft=payload.data;$("state").textContent=draft.status;$("message-id").textContent=draft.messageId;$("end-id").textContent=draft.endToEndId;$("uetr").textContent=draft.uetr;$("xml").value=draft.xml;result.classList.remove("hidden");}catch(failure){error.textContent=failure instanceof Error?failure.message:String(failure);error.classList.remove("hidden");}});
  document.getElementById("download").addEventListener("click",()=>{const blob=new Blob([document.getElementById("xml").value],{type:"application/xml;charset=utf-8"});const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="primestack-pacs008-draft.xml";anchor.click();URL.revokeObjectURL(url);});
  document.getElementById("print").addEventListener("click",()=>window.print());
</script>
</body>
</html>`;
