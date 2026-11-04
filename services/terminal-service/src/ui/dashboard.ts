export const terminalDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Terminal Management | PrimeStack</title>
  <style>
    :root{color-scheme:dark;--bg:#0a0e17;--panel:#121a28;--raised:#172233;--border:#253248;--text:#e7edf6;--muted:#91a0b5;--cyan:#52d6e8;--green:#39d98a;--yellow:#f5c451;--red:#ff6b78}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 "Segoe UI",system-ui,sans-serif}
    header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:22px clamp(18px,4vw,48px);background:#0d1420;border-bottom:1px solid var(--border)}
    h1{margin:0;font-size:20px}h1 span{color:var(--cyan)}.meta{color:var(--muted);font-size:12px;text-align:right}
    main{width:min(1500px,100%);margin:auto;padding:24px clamp(16px,3vw,36px) 42px}
    .toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.toolbar p{margin:0;color:var(--muted)}
    button,.button{border:1px solid var(--border);border-radius:7px;background:var(--raised);color:var(--text);padding:8px 12px;cursor:pointer;text-decoration:none;font:inherit}
    button:hover,.button:hover{border-color:var(--cyan)}button.primary{background:#104250;border-color:#1b7585}
    #error,#notice{display:none;margin:12px 0;padding:11px 13px;border-radius:8px}#error{border:1px solid #713b46;background:#321c25;color:#ffb8bf}#notice{border:1px solid #286248;background:#143326;color:#a7f0c7}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:11px;margin-bottom:18px}
    .metric,.panel{border:1px solid var(--border);border-radius:10px;background:var(--panel)}.metric{padding:15px;min-height:95px}
    .label{color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.value{font-size:25px;font-weight:700;margin-top:5px}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.38fr);gap:14px}.panel{min-width:0;padding:16px}.wide{grid-column:1/-1}
    .panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.panel h2{font-size:14px;margin:0}
    .table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;text-align:left;white-space:nowrap}th,td{padding:9px 8px;border-bottom:1px solid var(--border)}th{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em}td{font-size:12px}
    tbody tr:last-child td{border-bottom:0}.muted{color:var(--muted)}.online,.active{color:var(--green)}.warning{color:var(--yellow)}.offline,.error-status,.disabled{color:var(--red)}
    .pill{display:inline-block;border-radius:999px;padding:2px 8px;background:var(--raised);font-size:10px}
    input,select{width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:7px;background:#0d1420;color:var(--text);font:inherit}
    .filters{display:flex;gap:8px;max-width:470px}.filters input{min-width:160px}
    .stack{display:grid;gap:12px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.form-grid .full{grid-column:1/-1}
    form label{display:grid;gap:4px;color:var(--muted);font-size:11px}form button{width:100%}
    .list{display:grid;gap:8px}.list-item{display:flex;justify-content:space-between;gap:12px;padding:9px;border-bottom:1px solid var(--border);font-size:12px}.list-item:last-child{border:0}
    .empty{text-align:center;padding:18px 8px;color:var(--muted)}footer{color:var(--muted);font-size:11px;text-align:right;margin-top:16px}
    @media(max-width:980px){.layout{grid-template-columns:1fr}.wide{grid-column:auto}}@media(max-width:560px){header{align-items:flex-start;flex-direction:column}.meta{text-align:left}.toolbar{align-items:flex-start;flex-direction:column}.filters{max-width:none;width:100%}.form-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header><h1>Prime<span>Stack</span> Terminal Management</h1><div class="meta">Terminal Management Platform<br><span id="updated">Connecting…</span></div></header>
  <main>
    <div class="toolbar"><p>Fleet inventory, device health, security, and remote operations</p><button id="refresh" type="button">Refresh now</button></div>
    <div id="error" role="alert"></div><div id="notice" role="status"></div>
    <section class="metrics" aria-label="Fleet summary">
      <article class="metric"><div class="label">Registered terminals</div><div class="value" id="total">—</div></article>
      <article class="metric"><div class="label">Online</div><div class="value online" id="online">—</div></article>
      <article class="metric"><div class="label">Offline</div><div class="value offline" id="offline">—</div></article>
      <article class="metric"><div class="label">Degraded</div><div class="value warning" id="degraded">—</div></article>
      <article class="metric"><div class="label">Pending firmware</div><div class="value" id="firmware-count">—</div></article>
      <article class="metric"><div class="label">Keys expiring · 30 days</div><div class="value" id="key-count">—</div></article>
      <article class="metric"><div class="label">Pending commands</div><div class="value" id="command-count">—</div></article>
      <article class="metric"><div class="label">Active groups</div><div class="value" id="group-count">—</div></article>
    </section>
    <section class="layout">
      <article class="panel wide">
        <div class="panel-head"><h2>Terminal inventory &amp; health</h2><div class="filters"><input id="search" type="search" placeholder="Search TID, serial, merchant…" aria-label="Search terminal inventory"><select id="status-filter" aria-label="Filter terminal status"><option value="">All terminal states</option><option>REGISTERED</option><option>ACTIVE</option><option>INACTIVE</option><option>DISABLED</option><option>DECOMMISSIONED</option></select></div></div>
        <div class="table-wrap"><table><thead><tr><th>Terminal</th><th>Serial / model</th><th>Merchant</th><th>State</th><th>Health</th><th>Battery</th><th>Memory / storage</th><th>Firmware</th><th>Last seen</th><th>Action</th></tr></thead><tbody id="terminals"></tbody></table></div>
      </article>
      <article class="panel"><div class="panel-head"><h2>Register terminal</h2></div>
        <form id="register-form" class="stack">
          <div class="form-grid">
            <label>Terminal ID<input name="tid" required maxlength="20"></label>
            <label>Serial number<input name="serialNumber" required maxlength="100"></label>
            <label>Merchant<select name="merchantId" id="merchant" required><option value="">Loading merchants…</option></select></label>
            <label>Model<input name="model" maxlength="100"></label>
            <label>Firmware version<input name="firmwareVersion" maxlength="50"></label>
            <label>Country<input name="country" maxlength="2" value="US"></label>
          </div><button class="primary" type="submit">Register terminal</button>
        </form>
      </article>
      <article class="panel"><div class="panel-head"><h2>Remote command</h2></div>
        <form id="command-form" class="stack">
          <label>Terminal<select name="tid" id="command-terminal" required><option value="">Select a terminal</option></select></label>
          <label>Command<select name="command"><option>PING</option><option>RESTART</option><option>LOCK</option><option>UNLOCK</option><option>UPDATE_CONFIG</option><option>REFRESH_KEYS</option></select></label>
          <button type="submit">Queue command</button>
        </form>
        <p class="muted" style="font-size:11px">Commands are delivered on the device’s next heartbeat.</p>
        <div id="recent-commands" class="list"></div>
      </article>
      <article class="panel"><div class="panel-head"><h2>Firmware rollout</h2><a class="button" href="/firmware/pending">API</a></div><div id="firmware-list" class="list"></div></article>
      <article class="panel"><div class="panel-head"><h2>Terminal groups</h2><a class="button" href="/groups">API</a></div><div id="groups" class="list"></div></article>
      <article class="panel wide"><div class="panel-head"><h2>Recent device events</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Time</th><th>Terminal</th><th>Event</th><th>Description</th><th>By</th></tr></thead><tbody id="events"></tbody></table></div>
      </article>
    </section>
    <footer>Auto-refresh every 10 seconds · Device keys are never displayed by this dashboard</footer>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const fmt = (value) => value == null ? "—" : Number(value).toLocaleString();
    const time = (value) => value ? new Date(value).toLocaleString() : "—";
    const stateClass = (value) => ({ONLINE:"online",ACTIVE:"active",OFFLINE:"offline",DISABLED:"disabled",DEGRADED:"warning",MAINTENANCE:"warning",REGISTERED:"muted",INACTIVE:"muted",DECOMMISSIONED:"muted"}[String(value || "").toUpperCase()] || "muted");
    async function get(path) {
      const response = await fetch(path, {headers:{Accept:"application/json"},cache:"no-store"});
      if (!response.ok) throw new Error(path + " returned HTTP " + response.status);
      const result = await response.json();
      if (!result.success) throw new Error(result.error?.message || path + " request failed");
      return result.data;
    }
    async function post(path, body) {
      const response = await fetch(path,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(body)});
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Request failed (HTTP " + response.status + ")");
      return result.data;
    }
    function empty(body, columns, message) {
      const row = document.createElement("tr"), cell = document.createElement("td");
      cell.colSpan=columns;cell.className="empty";cell.textContent=message;row.appendChild(cell);body.replaceChildren(row);
    }
    function addCell(row, value, cls) {
      const cell=document.createElement("td");cell.textContent=value ?? "—";if(cls)cell.className=cls;row.appendChild(cell);
    }
    function listItem(container, left, right, cls) {
      const row=document.createElement("div");row.className="list-item";
      const a=document.createElement("span"),b=document.createElement("span");a.textContent=left;b.textContent=right||"—";if(cls)b.className=cls;row.append(a,b);container.appendChild(row);
    }
    function renderTerminals(rows) {
      const body=$("terminals");body.replaceChildren();
      if(!rows.length)return empty(body,10,"No terminals match this filter.");
      for(const terminal of rows) {
        const row=document.createElement("tr");
        addCell(row,terminal.tid);
        addCell(row,[terminal.serial_number,terminal.model].filter(Boolean).join(" · "));
        addCell(row,terminal.merchant_code || terminal.merchant_name);
        addCell(row,terminal.status,stateClass(terminal.status));
        addCell(row,terminal.health_status || "NO HEARTBEAT",stateClass(terminal.health_status));
        addCell(row,terminal.battery_level_pct == null ? "—" : terminal.battery_level_pct+"%");
        addCell(row,(terminal.memory_usage_pct == null ? "—" : terminal.memory_usage_pct+"%")+" / "+(terminal.disk_usage_pct == null ? "—" : terminal.disk_usage_pct+"%"));
        addCell(row,terminal.firmware_version);
        addCell(row,time(terminal.last_seen_at));
        const action=document.createElement("td");
        if(terminal.status==="REGISTERED") {
          const activate=document.createElement("button");
          activate.type="button";activate.textContent="Activate";
          activate.addEventListener("click",async()=>{
            activate.disabled=true;
            try{await post("/terminals/"+encodeURIComponent(terminal.tid)+"/activate",{});$("notice").textContent="Activated "+terminal.tid;$("notice").style.display="block";await refresh();}
            catch(error){$("error").textContent="Could not activate terminal: "+(error instanceof Error?error.message:String(error));$("error").style.display="block";activate.disabled=false;}
          });
          action.appendChild(activate);
        } else action.textContent="—";
        row.appendChild(action);
        body.appendChild(row);
      }
    }
    function renderEvents(rows) {
      const body=$("events");body.replaceChildren();
      if(!rows.length)return empty(body,5,"No device events have been recorded.");
      for(const event of rows) {
        const row=document.createElement("tr");addCell(row,time(event.created_at));addCell(row,event.tid);addCell(row,event.activity_type);addCell(row,event.description);addCell(row,event.performed_by);body.appendChild(row);
      }
    }
    function refreshCommandTargets(terminals) {
      const select=$("command-terminal"),current=select.value;
      select.replaceChildren(new Option("Select a terminal",""));
      for(const terminal of terminals)select.add(new Option(terminal.tid+" · "+(terminal.merchant_code||terminal.serial_number),terminal.tid));
      if(terminals.some((entry)=>entry.tid===current))select.value=current;
    }
    let inventoryTimer;
    function inventoryUrl() {
      const query=new URLSearchParams({limit:"200"});
      if($("search").value.trim())query.set("q",$("search").value.trim());
      if($("status-filter").value)query.set("status",$("status-filter").value);
      return "/terminals?"+query.toString();
    }
    async function loadInventory() {
      const terminals=await get(inventoryUrl());
      $("total").textContent=fmt(($("total").dataset.total)||0);
      renderTerminals(terminals);
      refreshCommandTargets(terminals);
    }
    async function loadMerchants() {
      const select=$("merchant"),merchants=await get("/merchants");
      select.replaceChildren(new Option("Select a merchant",""));
      for(const merchant of merchants)select.add(new Option(merchant.merchant_code+" · "+merchant.legal_name,merchant.id));
    }
    async function refresh() {
      $("error").style.display="none";
      try {
        const [overview,terminals,groups,commands,firmware,keys,events]=await Promise.all([
          get("/fleet/overview"),get(inventoryUrl()),get("/groups"),get("/commands/recent"),get("/firmware/pending"),get("/keys/expiring?days=30"),get("/events/recent")
        ]);
        $("total").textContent=fmt(overview.total_terminals);
        $("total").dataset.total=String(overview.total_terminals ?? 0);
        $("online").textContent=fmt(overview.online_terminals);
        $("offline").textContent=fmt(overview.offline_terminals);
        $("degraded").textContent=fmt(overview.degraded_terminals);
        $("firmware-count").textContent=fmt(firmware.length);
        $("key-count").textContent=fmt(keys.length);
        $("command-count").textContent=fmt(overview.pending_commands);
        $("group-count").textContent=fmt(groups.length);
        renderTerminals(terminals);refreshCommandTargets(terminals);renderEvents(events);
        const groupList=$("groups");groupList.replaceChildren();
        if(!groups.length)groupList.textContent="No groups configured.";
        for(const group of groups)listItem(groupList,group.group_name,fmt(group.member_count)+" members");
        const fwList=$("firmware-list");fwList.replaceChildren();
        if(!firmware.length)fwList.textContent="No pending firmware deployments.";
        for(const deployment of firmware)listItem(fwList,deployment.tid+" · "+deployment.version,deployment.status+" · "+fmt(deployment.progress_pct)+"%");
        const commandList=$("recent-commands");commandList.replaceChildren();
        if(!commands.length)commandList.textContent="No recent remote commands.";
        for(const command of commands)listItem(commandList,command.tid+" · "+command.command,command.status,stateClass(command.status));
        $("updated").textContent="Updated "+new Date().toLocaleTimeString();
      } catch(error) {
        $("error").textContent="Fleet data could not be loaded: "+(error instanceof Error?error.message:String(error));
        $("error").style.display="block";$("updated").textContent="Refresh failed";
      }
    }
    $("register-form").addEventListener("submit",async(event)=>{
      event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form));
      try{const result=await post("/terminals",values);$("notice").textContent="Registered "+result.tid+" in REGISTERED state."; $("notice").style.display="block";form.reset();$("register-form").elements.country.value="US";await refresh();}
      catch(error){$("error").textContent="Registration failed: "+(error instanceof Error?error.message:String(error));$("error").style.display="block";}
    });
    $("command-form").addEventListener("submit",async(event)=>{
      event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
      try{const result=await post("/terminals/"+encodeURIComponent(values.tid)+"/commands",{command:values.command});$("notice").textContent="Command queued: "+result.commandId;$("notice").style.display="block";await refresh();}
      catch(error){$("error").textContent="Could not queue command: "+(error instanceof Error?error.message:String(error));$("error").style.display="block";}
    });
    function scheduleInventoryLoad() {
      clearTimeout(inventoryTimer);
      inventoryTimer=setTimeout(()=>loadInventory().catch((error)=>{$("error").textContent="Inventory could not be loaded: "+error.message;$("error").style.display="block";}),250);
    }
    $("refresh").addEventListener("click",refresh);$("search").addEventListener("input",scheduleInventoryLoad);$("status-filter").addEventListener("change",scheduleInventoryLoad);
    loadMerchants().catch((error)=>{$("error").textContent="Merchant list could not be loaded: "+error.message;$("error").style.display="block";});
    refresh();setInterval(refresh,10000);
  </script>
</body>
</html>`;
