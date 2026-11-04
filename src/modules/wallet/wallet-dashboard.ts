export const walletDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Wallet Center | PrimeStack</title>
  <style>
    :root{color-scheme:dark;--bg:#0a0e17;--panel:#121a28;--raised:#172233;--border:#253248;--text:#e7edf6;--muted:#91a0b5;--cyan:#52d6e8;--green:#39d98a;--yellow:#f5c451;--red:#ff6b78}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 "Segoe UI",system-ui,sans-serif}
    header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px clamp(18px,4vw,48px);background:#0d1420;border-bottom:1px solid var(--border)}
    h1{margin:0;font-size:20px}h1 span{color:var(--cyan)}.meta{color:var(--muted);font-size:12px}
    main{width:min(1440px,100%);margin:auto;padding:24px clamp(16px,3vw,36px) 40px}
    .toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.toolbar p{color:var(--muted);margin:0}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px}
    .metric,.panel{border:1px solid var(--border);border-radius:10px;background:var(--panel)}.metric{padding:16px;min-height:100px}
    .label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.value{margin-top:6px;font-size:25px;font-weight:700}
    .layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.75fr);gap:14px}.panel{min-width:0;padding:16px}.wide{grid-column:1/-1}
    .panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.panel h2{margin:0;font-size:14px}
    .table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:9px 8px;border-bottom:1px solid var(--border)}th{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em}td{font-size:12px}tbody tr:last-child td{border-bottom:0}
    button,.button{border:1px solid var(--border);border-radius:7px;background:var(--raised);color:var(--text);padding:8px 12px;cursor:pointer;font:inherit;text-decoration:none}
    button:hover,.button:hover{border-color:var(--cyan)}button.primary{background:#104250;border-color:#1b7585}.active{color:var(--green)}.frozen{color:var(--yellow)}.closed{color:var(--red)}.muted{color:var(--muted)}
    input,select{width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:7px;background:#0d1420;color:var(--text);font:inherit}
    form{display:grid;gap:10px}form label{display:grid;gap:4px;color:var(--muted);font-size:11px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fields .full{grid-column:1/-1}
    .notice{display:none;padding:11px 13px;border-radius:8px;margin:12px 0}.notice.error{background:#321c25;border:1px solid #713b46;color:#ffb8bf}.notice.success{background:#143326;border:1px solid #286248;color:#a7f0c7}
    .empty{text-align:center;padding:18px;color:var(--muted)}.actions{display:flex;gap:6px}.list{display:grid;gap:8px}.list-item{padding:9px;border-bottom:1px solid var(--border);font-size:12px}
    .hidden{display:none!important}.login{width:min(420px,calc(100% - 32px));margin:48px auto;padding:20px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}
    footer{margin-top:16px;text-align:right;color:var(--muted);font-size:11px}
    @media(max-width:900px){.layout{grid-template-columns:1fr}.wide{grid-column:auto}}@media(max-width:560px){header,.toolbar{align-items:flex-start;flex-direction:column}.fields{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header><h1>Prime<span>Stack</span> Wallet Center</h1><div class="meta"><span id="updated">Admin sign-in required</span> <span id="signed-in"></span> <button id="logout" class="hidden" type="button">Sign out</button></div></header>
  <section id="login-panel" class="login">
    <h2>Administrator sign-in</h2><p class="muted">Use your PrimeStack admin account to access wallet operations.</p>
    <div id="login-error" class="notice error" role="alert"></div>
    <form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="primary" type="submit">Sign in</button></form>
  </section>
  <main id="wallet-main" class="hidden">
    <div class="toolbar"><p>Ledger-backed wallets, holds, statements, and digital accounts</p><button id="refresh">Refresh</button></div>
    <div id="error" class="notice error" role="alert"></div><div id="success" class="notice success" role="status"></div>
    <section class="metrics">
      <article class="metric"><div class="label">Wallets</div><div class="value" id="wallet-count">—</div></article>
      <article class="metric"><div class="label">Active</div><div class="value active" id="active-count">—</div></article>
      <article class="metric"><div class="label">Frozen</div><div class="value frozen" id="frozen-count">—</div></article>
      <article class="metric"><div class="label">Currencies</div><div class="value" id="currency-count">—</div></article>
    </section>
    <section class="layout">
      <article class="panel wide"><div class="panel-head"><h2>Wallet inventory</h2><button id="load-wallets">Load wallets</button></div>
        <div class="table-wrap"><table><thead><tr><th>Wallet</th><th>Type</th><th>Owner</th><th>Currency</th><th>Balance</th><th>Held</th><th>Available</th><th>Status</th><th>Actions</th></tr></thead><tbody id="wallets"></tbody></table></div>
      </article>
      <article class="panel"><div class="panel-head"><h2>Create wallet</h2></div>
        <form id="create-form"><div class="fields">
          <label>Wallet number<input name="walletAddress" required minlength="3" maxlength="100"></label>
          <label>Owner type<select name="type"><option>CUSTOMER</option><option>MERCHANT</option><option>AGENT</option><option>TREASURY</option><option>ESCROW</option><option>RESERVE</option><option>SETTLEMENT</option></select></label>
          <label>Currency<input name="currency" value="USD" minlength="3" maxlength="3" required></label>
          <label>Label<input name="label" maxlength="100"></label>
          <label class="full hidden" id="merchant-id-field">Merchant ID (required for merchant wallet)<input name="merchantId"></label>
        </div><button class="primary" type="submit">Create wallet</button></form>
      </article>
      <article class="panel"><div class="panel-head"><h2>Wallet transfer</h2></div>
        <form id="transfer-form"><label>From wallet<select name="sourceAddress" id="source" required></select></label>
          <label>To wallet<select name="destinationAddress" id="destination" required></select></label>
          <div class="fields"><label>Amount<input name="amount" type="number" min="0.0001" step="0.0001" required></label><label>Currency<input name="currency" value="USD" maxlength="3" required></label></div>
          <label>Description<input name="description" maxlength="500"></label><button type="submit">Transfer through ledger</button></form>
      </article>
      <article class="panel"><div class="panel-head"><h2>Wallet holds</h2></div>
        <form id="hold-form"><label>Wallet<select name="walletAddress" class="wallet-select" required></select></label>
          <div class="fields"><label>Amount<input name="amount" type="number" min="0.0001" step="0.0001" required></label><label>Reference<input name="reference" required maxlength="100"></label></div>
          <label>Reason<input name="reason" required maxlength="500"></label><button type="submit">Place ledger hold</button></form>
        <div id="holds" class="list"></div>
      </article>
      <article class="panel"><div class="panel-head"><h2>Beneficiary</h2></div>
        <form id="beneficiary-form"><label>Wallet<select name="walletAddress" class="wallet-select" required></select></label>
          <label>Beneficiary name<input name="beneficiaryName" required maxlength="255"></label>
          <label>Beneficiary identifier<input name="beneficiaryIdentifier" required maxlength="255"></label>
          <button type="submit">Add beneficiary</button></form>
      </article>
      <article class="panel"><div class="panel-head"><h2>Virtual account</h2></div>
        <form id="virtual-form"><label>Wallet<select name="walletAddress" class="wallet-select" required></select></label>
          <label>Currency<input name="currency" value="USD" minlength="3" maxlength="3" required></label><button type="submit">Create virtual account</button></form>
        <div id="virtual-list" class="list"></div>
      </article>
      <article class="panel"><div class="panel-head"><h2>Escrow</h2></div>
        <form id="escrow-form"><label>Buyer wallet<select name="buyerAddress" class="wallet-select" required></select></label>
          <label>Seller wallet<select name="sellerAddress" class="wallet-select" required></select></label>
          <div class="fields"><label>Reference<input name="reference" required maxlength="100"></label><label>Amount<input name="amount" type="number" min="0.0001" step="0.0001" required></label></div>
          <label>Currency<input name="currency" value="USD" maxlength="3" required></label><button type="submit">Fund escrow</button></form>
        <div id="escrows" class="list"></div>
      </article>
      <article class="panel"><div class="panel-head"><h2>Fee rules</h2></div>
        <form id="fee-form"><div class="fields"><label>Transaction type<input name="transactionType" required maxlength="50"></label>
          <label>Fee type<select name="feeType"><option>FIXED</option><option>PERCENTAGE</option></select></label>
          <label>Value<input name="value" type="number" min="0" step="0.0001" required></label><label>Currency<input name="currency" value="USD" maxlength="3" required></label></div>
          <button type="submit">Add fee rule</button></form><div id="fees" class="list"></div>
      </article>
      <article class="panel"><div class="panel-head"><h2>Statement &amp; limits</h2></div>
        <label class="muted" style="font-size:11px">Wallet<select id="statement-wallet" class="wallet-select"></select></label>
        <div class="fields" style="margin-top:9px"><label>Daily limit<input id="daily-limit" type="number" min="0" step="0.01"></label><label>Monthly limit<input id="monthly-limit" type="number" min="0" step="0.01"></label><label class="full">Yearly limit<input id="yearly-limit" type="number" min="0" step="0.01"></label></div>
        <button id="save-limits" style="margin-top:9px">Save limits</button><button id="load-statement" style="margin-top:8px">View recent statement</button><div id="statement" class="list"></div>
      </article>
    </section>
    <footer>Balances are read from linked ledger accounts; the wallet record does not store a separate balance.</footer>
  </main>
  <script>
    const $=id=>document.getElementById(id);
    const fmt=value=>value==null?"—":Number(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4});
    const esc=value=>String(value??"");
    const api="/admin";
    const canManage=()=>["SUPER_ADMIN","ADMIN","OPERATOR"].includes(sessionStorage.getItem("walletAdminRole")||"");
    function clearAdminSession(){for(const key of ["walletAdminToken","walletAdminRole","walletAdminEmail"])sessionStorage.removeItem(key);}
    function showLogin(){ $("login-panel").classList.remove("hidden");$("wallet-main").classList.add("hidden");$("logout").classList.add("hidden");$("signed-in").textContent=""; }
    function showWalletCenter(){ $("login-panel").classList.add("hidden");$("wallet-main").classList.remove("hidden");$("logout").classList.remove("hidden");$("signed-in").textContent=sessionStorage.getItem("walletAdminEmail")||""; }
    async function request(path,options={}) {
      const token=sessionStorage.getItem("walletAdminToken");
      const response=await fetch(api+path,{...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})},cache:"no-store"});
      const payload=response.status===204?{}:await response.json();
      if(response.status===401){clearAdminSession();showLogin();const loginError=$("login-error");loginError.textContent="Your admin session expired. Please sign in again.";loginError.style.display="block";throw new Error("Your admin session expired. Please sign in again.");}
      if(!response.ok||payload.success===false){const error=new Error(payload.error?.message||"Request failed (HTTP "+response.status+")");error.status=response.status;throw error;}
      return payload.data;
    }
    function notify(message,isError=false){const node=$(isError?"error":"success"),other=$(isError?"success":"error");other.style.display="none";node.textContent=message;node.style.display="block";}
    $("login-form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget;const values=Object.fromEntries(new FormData(form));const error=$("login-error");error.style.display="none";
      try{const response=await fetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(values),cache:"no-store"});const payload=await response.json();if(!response.ok||!payload.success)throw new Error(payload.error?.message||"Sign-in failed");const {token,user}=payload.data;if(!token||!user)throw new Error("Sign-in response did not contain an admin session");sessionStorage.setItem("walletAdminToken",token);sessionStorage.setItem("walletAdminRole",user.role);sessionStorage.setItem("walletAdminEmail",user.email);form.reset();showWalletCenter();applyPermissions();await refresh();}
      catch(failure){error.textContent=failure instanceof Error?failure.message:String(failure);error.style.display="block";}});
    $("logout").addEventListener("click",()=>{clearAdminSession();showLogin();});
    function applyPermissions(){const manage=canManage();for(const form of document.querySelectorAll("#create-form,#transfer-form,#hold-form,#beneficiary-form,#virtual-form,#escrow-form,#fee-form"))form.classList.toggle("hidden",!manage);$("save-limits").classList.toggle("hidden",!manage);}
    function fillWalletSelects(wallets){
      document.querySelectorAll(".wallet-select,#source,#destination").forEach(select=>{
        const current=select.value;select.replaceChildren(new Option("Select wallet",""));
        for(const wallet of wallets)select.add(new Option(wallet.walletAddress+" · "+wallet.currency+" · "+wallet.type,wallet.walletAddress));
        if(wallets.some(wallet=>wallet.walletAddress===current))select.value=current;
      });
    }
    function renderWallets(wallets){
      const body=$("wallets");body.replaceChildren();
      if(!wallets.length){const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=9;cell.className="empty";cell.textContent="No wallets found.";row.appendChild(cell);body.appendChild(row);return;}
      for(const wallet of wallets){
        const row=document.createElement("tr");
        const values=[wallet.walletAddress,wallet.type,wallet.merchant?.merchantCode||wallet.label||"—",wallet.currency,fmt(wallet.account?.balance),fmt(wallet.account?.heldBalance),fmt(Number(wallet.account?.balance||0)-Number(wallet.account?.heldBalance||0)),wallet.status];
        for(let index=0;index<values.length;index++){const cell=document.createElement("td");cell.textContent=String(values[index]??"—");if(index===7)cell.className=wallet.status.toLowerCase();row.appendChild(cell);}
        const action=document.createElement("td"),button=document.createElement("button");
        if(canManage()){button.textContent=wallet.status==="FROZEN"?"Unfreeze":"Freeze";
          button.addEventListener("click",async()=>{button.disabled=true;try{await request("/wallets/"+encodeURIComponent(wallet.walletAddress)+(wallet.status==="FROZEN"?"/unfreeze":"/freeze"),{method:"POST",body:"{}"});notify("Wallet status updated.");await loadWallets();}catch(error){notify(error.message,true);button.disabled=false;}});
          action.appendChild(button);}
        row.appendChild(action);body.appendChild(row);
      }
      $("wallet-count").textContent=wallets.length;
      $("active-count").textContent=wallets.filter(item=>item.status==="ACTIVE").length;
      $("frozen-count").textContent=wallets.filter(item=>item.status==="FROZEN").length;
      $("currency-count").textContent=new Set(wallets.map(item=>item.currency)).size;
      fillWalletSelects(wallets);
    }
    async function loadWallets(){
      const response=await request("/wallets?page=1&pageSize=100");
      const wallets=Array.isArray(response)?response:response.data;
      renderWallets(wallets||[]);
      $("updated").textContent="Updated "+new Date().toLocaleTimeString();
    }
    async function submit(form,build){
      const values=Object.fromEntries(new FormData(form));
      try{const result=await build(values);notify(result||"Operation completed.");form.reset();await loadWallets();}
      catch(error){notify(error instanceof Error?error.message:String(error),true);}
    }
    const merchantIdField=$("merchant-id-field"),merchantIdInput=merchantIdField.querySelector("input");
    $("create-form").elements.namedItem("type").addEventListener("change",event=>{const required=event.target.value==="MERCHANT";merchantIdField.classList.toggle("hidden",!required);merchantIdInput.required=required;if(!required)merchantIdInput.value="";});
    $("create-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,async values=>{if(!values.merchantId)delete values.merchantId;if(!values.label)delete values.label;await request("/wallets",{method:"POST",body:JSON.stringify(values)});return "Wallet created.";});});
    $("transfer-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,async values=>{await request("/wallets/"+encodeURIComponent(values.sourceAddress)+"/transfer",{method:"POST",body:JSON.stringify(values)});return "Transfer posted to the ledger.";});});
    $("hold-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,async values=>{await request("/wallets/"+encodeURIComponent(values.walletAddress)+"/holds",{method:"POST",body:JSON.stringify(values)});return "Funds held in the ledger.";});});
    $("beneficiary-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,async values=>{const {walletAddress,...body}=values;await request("/wallets/"+encodeURIComponent(walletAddress)+"/beneficiaries",{method:"POST",body:JSON.stringify(body)});return "Beneficiary added.";});});
    $("virtual-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,async values=>{const {walletAddress,...body}=values;await request("/wallets/"+encodeURIComponent(walletAddress)+"/virtual-accounts",{method:"POST",body:JSON.stringify(body)});return "Virtual account created.";});});
    $("escrow-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,async values=>{await request("/escrows",{method:"POST",body:JSON.stringify(values)});return "Escrow funded through the ledger.";});});
    $("fee-form").addEventListener("submit",event=>{event.preventDefault();submit(event.currentTarget,async values=>{await request("/fee-rules",{method:"POST",body:JSON.stringify(values)});return "Fee rule created.";});});
    $("save-limits").addEventListener("click",async()=>{const address=$("statement-wallet").value;if(!address)return notify("Select a wallet first.",true);try{await request("/wallets/"+encodeURIComponent(address)+"/limits",{method:"PUT",body:JSON.stringify({dailyLimit:$("daily-limit").value||undefined,monthlyLimit:$("monthly-limit").value||undefined,yearlyLimit:$("yearly-limit").value||undefined})});notify("Wallet limits saved.");}catch(error){notify(error.message,true);}});
    $("load-statement").addEventListener("click",async()=>{const address=$("statement-wallet").value;if(!address)return notify("Select a wallet first.",true);try{const lines=await request("/wallets/"+encodeURIComponent(address)+"/statement?page=1&pageSize=20"),container=$("statement");container.replaceChildren();if(!Array.isArray(lines))throw new Error("Statement response was invalid.");if(!lines.length){container.textContent="No ledger entries.";return;}for(const line of lines){const item=document.createElement("div");item.className="list-item";item.textContent=line.createdAt+" · "+line.reference+" · debit "+line.debit+" / credit "+line.credit;container.appendChild(item);}}catch(error){notify(error.message,true);}});
    $("statement-wallet").addEventListener("change",async event=>{try{const limits=await request("/wallets/"+encodeURIComponent(event.target.value)+"/limits");$("daily-limit").value=limits.dailyLimit??"";$("monthly-limit").value=limits.monthlyLimit??"";$("yearly-limit").value=limits.yearlyLimit??"";}catch(error){$("daily-limit").value="";$("monthly-limit").value="";$("yearly-limit").value="";if(error.status!==404)notify(error.message,true);}});
    async function loadOperations(){
      const [escrows,fees,holds]=await Promise.all([request("/escrows"),request("/fee-rules"),request("/wallet-holds")]);
      const holdList=$("holds");holdList.replaceChildren();
      if(!holds.length)holdList.textContent="No wallet holds.";
      for(const hold of holds){const row=document.createElement("div");row.className="list-item";const details=document.createElement("span");details.textContent=hold.reference+" · "+hold.wallet.walletAddress+" · "+hold.amount+" "+hold.wallet.currency+" · "+hold.status;row.appendChild(details);
        if(canManage()&&hold.status==="ACTIVE"){const button=document.createElement("button");button.textContent="Release";button.style.marginLeft="6px";button.addEventListener("click",async()=>{button.disabled=true;try{await request("/wallet-holds/"+encodeURIComponent(hold.reference)+"/release",{method:"POST",body:"{}"});notify("Wallet hold released.");await loadOperations();}catch(error){notify(error.message,true);button.disabled=false;}});row.appendChild(button);}
        holdList.appendChild(row);}
      const escrowList=$("escrows");escrowList.replaceChildren();
      if(!escrows.length)escrowList.textContent="No escrow accounts.";
      for(const escrow of escrows){const row=document.createElement("div");row.className="list-item";const details=document.createElement("span");details.textContent=escrow.reference+" · "+escrow.amount+" "+escrow.currency+" · "+escrow.status;row.appendChild(details);
        if(canManage()&&escrow.status==="FUNDED"){for(const action of ["release","refund"]){const button=document.createElement("button");button.textContent=action==="release"?"Release":"Refund";button.style.marginLeft="6px";button.addEventListener("click",async()=>{button.disabled=true;try{await request("/escrows/"+encodeURIComponent(escrow.reference)+"/"+action,{method:"POST",body:"{}"});notify("Escrow "+action+"d.");await loadOperations();}catch(error){notify(error.message,true);button.disabled=false;}});row.appendChild(button);}}
        escrowList.appendChild(row);}
      const feeList=$("fees");feeList.replaceChildren();
      if(!fees.length)feeList.textContent="No fee rules configured.";
      for(const fee of fees){const item=document.createElement("div");item.className="list-item";item.textContent=fee.transactionType+" · "+fee.feeType+" "+fee.value+" "+fee.currency;feeList.appendChild(item);}
    }
    async function refresh(){await Promise.all([loadWallets(),loadOperations()]);}
    $("refresh").addEventListener("click",()=>refresh().catch(error=>notify(error.message,true)));
    $("load-wallets").addEventListener("click",()=>refresh().catch(error=>notify(error.message,true)));
    if(sessionStorage.getItem("walletAdminToken")){showWalletCenter();applyPermissions();refresh().catch(error=>notify("Wallet data could not be loaded: "+error.message,true));}
    else showLogin();
  </script>
</body>
</html>`;
