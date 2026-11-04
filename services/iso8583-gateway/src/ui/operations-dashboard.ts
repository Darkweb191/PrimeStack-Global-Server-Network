export const operationsDashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Switch Operations | PrimeStack</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0e17;
      --panel: #121a28;
      --panel-raised: #172233;
      --border: #253248;
      --text: #e7edf6;
      --muted: #91a0b5;
      --cyan: #52d6e8;
      --green: #39d98a;
      --yellow: #f5c451;
      --red: #ff6b78;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 "Segoe UI", system-ui, sans-serif; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px clamp(18px, 4vw, 48px); border-bottom: 1px solid var(--border); background: #0d1420; }
    h1 { margin: 0; font-size: 20px; letter-spacing: .02em; }
    h1 span { color: var(--cyan); }
    .header-meta { color: var(--muted); text-align: right; font-size: 12px; }
    main { width: min(1440px, 100%); margin: 0 auto; padding: 26px clamp(16px, 3vw, 36px) 40px; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
    .toolbar p { margin: 0; color: var(--muted); }
    button { border: 1px solid var(--border); border-radius: 7px; background: var(--panel-raised); color: var(--text); padding: 8px 13px; cursor: pointer; }
    button:hover { border-color: var(--cyan); }
    #error { display: none; margin-bottom: 16px; padding: 12px 14px; border: 1px solid #713b46; border-radius: 8px; background: #321c25; color: #ffb8bf; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 12px; margin-bottom: 22px; }
    .metric, .panel { border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
    .metric { min-height: 108px; padding: 17px; }
    .metric-label { color: var(--muted); font-size: 11px; letter-spacing: .09em; text-transform: uppercase; }
    .metric-value { margin-top: 6px; font-size: 27px; font-weight: 700; }
    .metric-detail { color: var(--muted); font-size: 11px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(280px, .8fr); gap: 16px; }
    .panel { min-width: 0; padding: 17px; }
    .panel h2 { margin: 0 0 13px; font-size: 14px; }
    .panel-subtitle { margin: -8px 0 14px; color: var(--muted); font-size: 11px; }
    .wide { grid-column: 1 / -1; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; white-space: nowrap; }
    th, td { padding: 10px 9px; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; }
    td { font-size: 12px; }
    tbody tr:last-child td { border-bottom: 0; }
    .pill { display: inline-block; border-radius: 999px; padding: 2px 8px; background: var(--panel-raised); font-size: 10px; }
    .online { color: var(--green); }
    .warning { color: var(--yellow); }
    .offline, .error { color: var(--red); }
    .muted { color: var(--muted); }
    .bars { display: grid; gap: 9px; }
    .bar-row { display: grid; grid-template-columns: 88px 1fr 42px; align-items: center; gap: 9px; font-size: 11px; }
    .bar-track { height: 8px; overflow: hidden; border-radius: 8px; background: var(--panel-raised); }
    .bar-fill { height: 100%; min-width: 2px; border-radius: inherit; background: var(--cyan); }
    .empty { padding: 20px 8px; color: var(--muted); text-align: center; }
    footer { margin-top: 18px; color: var(--muted); font-size: 11px; text-align: right; }
    @media (max-width: 850px) { .layout { grid-template-columns: 1fr; } .wide { grid-column: auto; } }
    @media (max-width: 540px) { header { align-items: flex-start; flex-direction: column; } .header-meta { text-align: left; } }
  </style>
</head>
<body>
  <header>
    <h1>Prime<span>Stack</span> Switch Operations</h1>
    <div class="header-meta"><div>ISO 8583 Network Gateway</div><div id="updated">Connecting…</div></div>
  </header>
  <main>
    <div class="toolbar">
      <p>Live host connectivity, network traffic, and message processing</p>
      <button id="refresh" type="button">Refresh now</button>
    </div>
    <div id="error" role="alert"></div>
    <section class="metrics" aria-label="Network summary">
      <article class="metric"><div class="metric-label">Online hosts</div><div class="metric-value" id="online-hosts">—</div><div class="metric-detail" id="host-count">Loading host inventory</div></article>
      <article class="metric"><div class="metric-label">Active sessions</div><div class="metric-value" id="active-sessions">—</div><div class="metric-detail" id="session-count">Connected or authenticated</div></article>
      <article class="metric"><div class="metric-label">Messages / hour</div><div class="metric-value" id="messages-hour">—</div><div class="metric-detail">Observed in the last 60 minutes</div></article>
      <article class="metric"><div class="metric-label">Avg response</div><div class="metric-value" id="response-time">—</div><div class="metric-detail">Latest host health readings</div></article>
      <article class="metric"><div class="metric-label">Success rate</div><div class="metric-value" id="success-rate">—</div><div class="metric-detail">Host network health</div></article>
      <article class="metric"><div class="metric-label">Queue depth</div><div class="metric-value" id="queue-depth">—</div><div class="metric-detail" id="queue-detail">Pending · processing · failed</div></article>
      <article class="metric"><div class="metric-label">Pool connections</div><div class="metric-value" id="pool-usage">—</div><div class="metric-detail" id="pool-detail">Connected / configured</div></article>
    </section>
    <section class="layout">
      <article class="panel">
        <h2>Host status</h2>
        <p class="panel-subtitle">Configured hosts, latest response time, and connection-pool status</p>
        <div class="table-wrap"><table><thead><tr><th>Host</th><th>Type</th><th>Endpoint</th><th>Status</th><th>Response</th><th>Pool</th><th>Success</th></tr></thead><tbody id="hosts"></tbody></table></div>
      </article>
      <article class="panel">
        <h2>Message traffic</h2>
        <p class="panel-subtitle">Last-hour messages grouped by MTI and direction</p>
        <div class="bars" id="traffic"></div>
      </article>
      <article class="panel wide">
        <h2>Network sessions</h2>
        <div class="table-wrap"><table><thead><tr><th>Host</th><th>Session</th><th>Status</th><th>Remote address</th><th>In flight</th><th>Last seen</th></tr></thead><tbody id="sessions"></tbody></table></div>
      </article>
      <article class="panel wide">
        <h2>Recent messages</h2>
        <div class="table-wrap"><table><thead><tr><th>Reference</th><th>MTI</th><th>Direction</th><th>Status</th><th>Response</th><th>Processing</th><th>Received</th></tr></thead><tbody id="messages"></tbody></table></div>
      </article>
    </section>
    <footer>Auto-refresh every 5 seconds · <a href="/dashboard" style="color:var(--cyan)">Dashboard JSON</a></footer>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const number = (value) => Number(value ?? 0).toLocaleString();
    const dateTime = (value) => value ? new Date(value).toLocaleTimeString() : "—";
    const statusClass = (value) => {
      const status = String(value ?? "").toUpperCase();
      if (["ONLINE", "CONNECTED", "AUTHENTICATED", "RESPONDED"].includes(status)) return "online";
      if (["DEGRADED", "CONNECTING", "RECONNECTING", "ROUTING", "FORWARDED"].includes(status)) return "warning";
      if (["ERROR", "OFFLINE", "DISCONNECTED", "TIMEOUT"].includes(status)) return "offline";
      return "muted";
    };
    const cell = (row, value, className) => {
      const td = document.createElement("td");
      td.textContent = value ?? "—";
      if (className) td.className = className;
      row.appendChild(td);
      return td;
    };
    const emptyRow = (body, columns, message) => {
      const row = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns;
      td.className = "empty";
      td.textContent = message;
      row.appendChild(td);
      body.replaceChildren(row);
    };
    async function getJson(path) {
      const response = await fetch(path, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error(path + " returned HTTP " + response.status);
      const result = await response.json();
      if (!result.success) throw new Error(result.error?.message ?? path + " request failed");
      return result;
    }
    function renderHosts(data, pools) {
      const body = $("hosts");
      body.replaceChildren();
      const poolByHost = new Map(pools.map((entry) => [entry.hostId, entry]));
      const hosts = data.hosts ?? [];
      if (!hosts.length) return emptyRow(body, 7, "No active hosts are configured.");
      for (const host of hosts) {
        const row = document.createElement("tr");
        const pool = poolByHost.get(host.id);
        const connected = pool?.connected ?? 0;
        const total = pool?.total ?? 0;
        cell(row, host.host_name);
        cell(row, host.host_type);
        cell(row, host.hostname + ":" + host.port);
        cell(row, host.status, statusClass(host.status));
        cell(row, host.response_time_ms == null ? "—" : number(host.response_time_ms) + " ms");
        cell(row, connected + " / " + total);
        cell(row, host.success_rate == null ? "—" : host.success_rate + "%");
        body.appendChild(row);
      }
    }
    function renderSessions(sessions) {
      const body = $("sessions");
      body.replaceChildren();
      if (!sessions.length) return emptyRow(body, 6, "No network sessions have been recorded.");
      for (const session of sessions) {
        const row = document.createElement("tr");
        cell(row, session.host_name);
        cell(row, session.session_key);
        cell(row, session.session_status, statusClass(session.session_status));
        cell(row, session.remote_addr);
        cell(row, number(session.pending_count));
        cell(row, dateTime(session.last_seen));
        body.appendChild(row);
      }
    }
    function renderMessages(messages) {
      const body = $("messages");
      body.replaceChildren();
      if (!messages.length) return emptyRow(body, 7, "No messages have been recorded.");
      for (const message of messages) {
        const row = document.createElement("tr");
        cell(row, message.reference);
        cell(row, message.mti);
        cell(row, message.direction);
        cell(row, message.status, statusClass(message.status));
        cell(row, message.response_code);
        cell(row, message.processing_ms == null ? "—" : number(message.processing_ms) + " ms");
        cell(row, dateTime(message.received_at));
        body.appendChild(row);
      }
    }
    function renderTraffic(groups) {
      const container = $("traffic");
      container.replaceChildren();
      if (!groups.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No message traffic in the last hour.";
        container.appendChild(empty);
        return;
      }
      const max = Math.max(...groups.map((entry) => Number(entry.count) || 0), 1);
      for (const entry of groups) {
        const row = document.createElement("div");
        row.className = "bar-row";
        const label = document.createElement("span");
        label.textContent = entry.mti + " " + entry.direction.toLowerCase();
        const track = document.createElement("div");
        track.className = "bar-track";
        const fill = document.createElement("div");
        fill.className = "bar-fill";
        fill.style.width = Math.max(2, Number(entry.count) / max * 100) + "%";
        track.appendChild(fill);
        const count = document.createElement("span");
        count.className = "muted";
        count.textContent = number(entry.count);
        row.append(label, track, count);
        container.appendChild(row);
      }
    }
    async function refresh() {
      $("error").style.display = "none";
      try {
        const [dashboardResult, sessionResult, messageResult, poolResult] = await Promise.all([
          getJson("/dashboard"),
          getJson("/sessions"),
          getJson("/messages?page=1&pageSize=8"),
          getJson("/pool")
        ]);
        const data = dashboardResult.data;
        const hosts = data.hosts ?? [];
        const sessions = sessionResult.data ?? [];
        const pools = poolResult.data ?? [];
        const messages = messageResult.data ?? [];
        const onlineHosts = hosts.filter((host) => String(host.status).toUpperCase() === "ONLINE").length;
        const activeSessions = sessions.filter((session) => ["CONNECTED", "AUTHENTICATED"].includes(String(session.session_status).toUpperCase())).length;
        const messageTotal = (data.recentMessages ?? []).reduce((sum, entry) => sum + Number(entry.count || 0), 0);
        const responseTimes = hosts.map((host) => Number(host.response_time_ms)).filter(Number.isFinite);
        const totalRequests = hosts.reduce((sum, host) => sum + Number(host.successful_requests || 0) + Number(host.failed_requests || 0), 0);
        const totalSuccessful = hosts.reduce((sum, host) => sum + Number(host.successful_requests || 0), 0);
        const connected = pools.reduce((sum, entry) => sum + Number(entry.connected || 0), 0);
        const poolSize = pools.reduce((sum, entry) => sum + Number(entry.total || 0), 0);
        const queue = data.queueDepth ?? {};
        $("online-hosts").textContent = number(onlineHosts);
        $("host-count").textContent = number(hosts.length) + " active host(s)";
        $("active-sessions").textContent = number(activeSessions);
        $("session-count").textContent = number(sessions.length) + " recorded session(s)";
        $("messages-hour").textContent = number(messageTotal);
        $("response-time").textContent = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) + " ms" : "—";
        $("success-rate").textContent = totalRequests ? (totalSuccessful / totalRequests * 100).toFixed(1) + "%" : "—";
        $("queue-depth").textContent = number(Number(queue.pending || 0) + Number(queue.processing || 0));
        $("queue-detail").textContent = number(queue.pending) + " pending · " + number(queue.processing) + " processing · " + number(queue.failed) + " failed";
        $("pool-usage").textContent = connected + " / " + poolSize;
        $("pool-detail").textContent = number(connected) + " connected · " + number(Math.max(poolSize - connected, 0)) + " unavailable";
        renderHosts(data, pools);
        renderSessions(sessions);
        renderMessages(messages);
        renderTraffic(data.recentMessages ?? []);
        $("updated").textContent = "Updated " + new Date().toLocaleTimeString();
      } catch (error) {
        $("error").textContent = "Dashboard data could not be loaded: " + (error instanceof Error ? error.message : String(error));
        $("error").style.display = "block";
        $("updated").textContent = "Refresh failed";
      }
    }
    $("refresh").addEventListener("click", refresh);
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
