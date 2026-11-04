import { createConnection, Socket } from "net";
import { connect as tlsConnect, TLSSocket } from "tls";
import { EventEmitter }   from "events";
import { Pool }           from "pg";
import { parse, build, buildEchoResponse, extractMti, ParsedMessage, BuildInput } from "../parser/iso8583.js";

/**
 * Connection Manager
 *
 * Maintains persistent TCP/TLS connections to ISO 8583 hosts.
 * Each host has a connection pool (configurable size, default 5 sockets).
 *
 * Key behaviours:
 *   - Auto-reconnect with exponential backoff
 *   - Heartbeat (echo / 0800) every N seconds
 *   - In-flight message tracking with per-message timeout
 *   - Length-prefixed framing: 2-byte big-endian length header
 *   - Emits events: 'message', 'connected', 'disconnected', 'error'
 *
 * Production requirements not implemented here (require certs/HSM):
 *   - mTLS client certificates
 *   - DUKPT/3DES PIN key management
 *   - MAC verification
 *   - Key exchange (0800/NMI 301)
 */

export interface HostConfig {
  id:                  string;
  hostName:            string;
  hostname:            string;
  port:                number;
  useTls:              boolean;
  poolSize:            number;
  heartbeatIntervalSec: number;
  reconnectDelaySec:   number;
  maxReconnectAttempts: number;
  connectTimeoutMs:    number;
  readTimeoutMs:       number;
  headerLength:        2 | 4;
}

interface PendingMessage {
  resolve:   (msg: ParsedMessage) => void;
  reject:    (err: Error) => void;
  timer:     ReturnType<typeof setTimeout>;
  sentAt:    number;
}

export class HostConnection extends EventEmitter {
  private socket:           Socket | TLSSocket | null = null;
  private reconnectTimer:   ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer:   ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private pending           = new Map<string, PendingMessage>(); // STAN → pending
  private buffer            = Buffer.alloc(0);
  private _connected        = false;
  private sessionId:        string | null = null;

  constructor(
    public readonly config: HostConfig,
    private readonly pool: Pool,
  ) {
    super();
  }

  get connected(): boolean { return this._connected; }

  // ── Connection lifecycle ────────────────────────────────────

  connect(): void {
    if (this._connected || this.socket) return;

    const sock = this.config.useTls
      ? tlsConnect({
          host:              this.config.hostname,
          port:              this.config.port,
          rejectUnauthorized: true,
          timeout:            this.config.connectTimeoutMs,
        })
      : createConnection({
          host:    this.config.hostname,
          port:    this.config.port,
          timeout: this.config.connectTimeoutMs,
        });

    this.socket = sock;

    sock.once("connect", () => this.onConnect());
    sock.on("data",      (data: Buffer) => this.onData(data));
    sock.once("close",   () => this.onClose());
    sock.once("error",   (err: Error)   => this.onError(err));
    sock.once("timeout", () => {
      sock.destroy(new Error(`Connect timeout to ${this.config.hostname}:${this.config.port}`));
    });
  }

  disconnect(): void {
    this.clearTimers();
    this.socket?.destroy();
    this.socket     = null;
    this._connected = false;
  }

  // ── Message sending ─────────────────────────────────────────

  /**
   * Send a message and await the response.
   * Matches response by STAN (field 11) in the reply.
   * Timeout configured per host (default 30s).
   */
  send(message: BuildInput, timeoutMs?: number): Promise<ParsedMessage> {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this.socket) {
        reject(new Error(`Host ${this.config.hostName} is not connected`));
        return;
      }

      const stan = message.fields.get(11) ?? "000000";
      const hex  = build(message, true);
      const buf  = Buffer.from(hex, "hex");

      const timer = setTimeout(() => {
        this.pending.delete(stan);
        reject(new Error(`Timeout waiting for response to STAN ${stan}`));
      }, timeoutMs ?? this.config.readTimeoutMs);

      this.pending.set(stan, { resolve, reject, timer, sentAt: Date.now() });

      this.socket.write(buf, (err?: Error | null) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(stan);
          reject(err);
        }
      });
    });
  }

  // ── Event handlers ──────────────────────────────────────────

  private async onConnect(): Promise<void> {
    this._connected       = true;
    this.reconnectAttempts = 0;

    // Upsert session record
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO network_sessions (host_id, session_key, session_status, connected_at, last_seen)
       VALUES ($1, $2, 'CONNECTED', NOW(), NOW())
       ON CONFLICT (session_key) DO UPDATE
         SET session_status = 'CONNECTED', connected_at = NOW(), last_seen = NOW()
       RETURNING id`,
      [this.config.id, `${this.config.hostName}:0`],
    ).catch(() => ({ rows: [{ id: null }] }));

    this.sessionId = result.rows[0]?.id ?? null;

    await this.pool.query(
      "UPDATE hosts SET status = 'ONLINE', last_connected = NOW() WHERE id = $1",
      [this.config.id],
    ).catch(() => {});

    this.startHeartbeat();
    this.emit("connected", this.config.hostName);
    console.log(`[iso-gw] Connected to ${this.config.hostName} (${this.config.hostname}:${this.config.port})`);
  }

  private onData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    // Update session last_seen (non-blocking)
    if (this.sessionId) {
      this.pool.query(
        "UPDATE network_sessions SET last_seen = NOW(), messages_recv = messages_recv + 1 WHERE id = $1",
        [this.sessionId],
      ).catch(() => {});
    }

    // Frame extraction: loop while we have complete messages
    while (this.buffer.length >= 2) {
      const msgLen = this.config.headerLength === 4
        ? this.buffer.readUInt32BE(0)
        : this.buffer.readUInt16BE(0);

      const totalLen = this.config.headerLength + msgLen;

      if (this.buffer.length < totalLen) break; // incomplete message

      const msgBuf = this.buffer.slice(0, totalLen);
      this.buffer  = this.buffer.slice(totalLen);
      this.handleMessage(msgBuf.toString("hex").toUpperCase());
    }
  }

  private handleMessage(hexMessage: string): void {
    const parsed = parse(hexMessage, true);
    const mti    = parsed.mti;

    // Network management echo request (0800) — auto-respond
    if (mti === "0800") {
      const echoResponse = buildEchoResponse(parsed);
      const buf = Buffer.from(build(echoResponse, true), "hex");
      this.socket?.write(buf);
      this.emit("echo", mti);
      return;
    }

    // Match response to pending request by STAN
    const stan = parsed.fields.get(11);
    if (stan && this.pending.has(stan)) {
      const { resolve, timer, sentAt } = this.pending.get(stan)!;
      clearTimeout(timer);
      this.pending.delete(stan);

      // Record response time
      const responseMs = Date.now() - sentAt;
      this.pool.query(
        `INSERT INTO network_health (host_id, response_time_ms, successful_requests, avg_response_time_ms)
         VALUES ($1,$2,1,$2)
         ON CONFLICT (host_id) DO UPDATE SET
           response_time_ms = EXCLUDED.response_time_ms,
           avg_response_time_ms = (network_health.avg_response_time_ms * 0.9 + EXCLUDED.response_time_ms * 0.1)::int,
           successful_requests = network_health.successful_requests + 1,
           success_rate = ROUND(100.0 * (network_health.successful_requests + 1) / (network_health.successful_requests + network_health.failed_requests + 1), 2),
           checked_at = NOW()`,
        [this.config.id, responseMs],
      ).catch(() => {});

      resolve(parsed);
    } else {
      // Unsolicited message (advice, network management)
      this.emit("message", parsed);
    }
  }

  private onClose(): void {
    this._connected = false;
    this.socket     = null;

    this.pool.query(
      "UPDATE hosts SET status = 'OFFLINE' WHERE id = $1",
      [this.config.id],
    ).catch(() => {});

    if (this.sessionId) {
      this.pool.query(
        "UPDATE network_sessions SET session_status = 'DISCONNECTED', last_seen = NOW() WHERE id = $1",
        [this.sessionId],
      ).catch(() => {});
    }

    this.clearHeartbeat();
    this.emit("disconnected", this.config.hostName);

    // Reject all pending messages
    for (const [stan, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Connection to ${this.config.hostName} closed`));
    }
    this.pending.clear();

    this.scheduleReconnect();
  }

  private onError(err: Error): void {
    this.pool.query(
      "UPDATE hosts SET status = 'ERROR', last_error = $1 WHERE id = $2",
      [err.message.slice(0, 500), this.config.id],
    ).catch(() => {});

    this.pool.query(
      `UPDATE network_health SET failed_requests = failed_requests + 1,
       success_rate = ROUND(100.0 * successful_requests / NULLIF(successful_requests + failed_requests + 1, 0), 2)
       WHERE host_id = $1`,
      [this.config.id],
    ).catch(() => {});

    this.emit("error", err);
  }

  // ── Timers ────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (!this._connected) return;
      try {
        const echoRequest: BuildInput = {
          mti:    "0800",
          fields: new Map([
            [11, Math.floor(Math.random() * 999999).toString().padStart(6, "0")],
            [70, "301"],
          ]),
        };
        await this.send(echoRequest, 5000);
      } catch {
        // Heartbeat failure — connection will close and reconnect
      }
    }, this.config.heartbeatIntervalSec * 1000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`[iso-gw] ${this.config.hostName}: max reconnect attempts reached`);
      return;
    }

    const delay = Math.min(
      this.config.reconnectDelaySec * Math.pow(2, this.reconnectAttempts) * 1000,
      300_000, // max 5-minute backoff
    );

    this.reconnectAttempts++;
    console.log(`[iso-gw] ${this.config.hostName}: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}

// ── Connection Pool Manager ──────────────────────────────────

/**
 * Manages connection pools for all configured hosts.
 * Loads host configurations from DB on startup.
 * Routes outbound messages to the least-loaded connection.
 */
export class ConnectionPool {
  private pools = new Map<string, HostConnection[]>(); // hostId → connections

  constructor(private pool: Pool) {}

  async loadHosts(): Promise<void> {
    const hosts = await this.pool.query<{
      id: string; host_name: string; hostname: string; port: number;
      use_tls: boolean; pool_size: number;
      heartbeat_interval_sec: number; reconnect_delay_sec: number;
      max_reconnect_attempts: number; connect_timeout_ms: number;
      read_timeout_ms: number; header_length: number; active: boolean;
    }>("SELECT * FROM hosts WHERE active = TRUE");

    for (const h of hosts.rows) {
      const config: HostConfig = {
        id:                   h.id,
        hostName:             h.host_name,
        hostname:             h.hostname,
        port:                 h.port,
        useTls:               h.use_tls,
        poolSize:             h.pool_size,
        heartbeatIntervalSec: h.heartbeat_interval_sec,
        reconnectDelaySec:    h.reconnect_delay_sec,
        maxReconnectAttempts: h.max_reconnect_attempts,
        connectTimeoutMs:     h.connect_timeout_ms,
        readTimeoutMs:        h.read_timeout_ms,
        headerLength:         (h.header_length as 2 | 4),
      };

      const connections: HostConnection[] = [];
      for (let i = 0; i < h.pool_size; i++) {
        const conn = new HostConnection(config, this.pool);
        conn.connect();
        connections.push(conn);
      }

      this.pools.set(h.id, connections);
      console.log(`[iso-gw] Loaded host ${h.host_name} with pool size ${h.pool_size}`);
    }
  }

  /**
   * Get the least-loaded connected socket for a host.
   */
  getConnection(hostId: string): HostConnection | null {
    const connections = this.pools.get(hostId);
    if (!connections || connections.length === 0) return null;

    const connected = connections.filter(c => c.connected);
    if (connected.length === 0) return null;

    // Round-robin: pick first connected (could be improved with pending count)
    return connected[0];
  }

  isHostOnline(hostId: string): boolean {
    return this.getConnection(hostId) !== null;
  }

  disconnectAll(): void {
    for (const connections of this.pools.values()) {
      for (const conn of connections) conn.disconnect();
    }
    this.pools.clear();
  }

  getStatus(): Array<{ hostId: string; connected: number; total: number }> {
    return [...this.pools.entries()].map(([hostId, conns]) => ({
      hostId,
      connected: conns.filter(c => c.connected).length,
      total:     conns.length,
    }));
  }
}
