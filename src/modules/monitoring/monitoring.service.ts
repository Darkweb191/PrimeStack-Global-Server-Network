import { Prisma, type PrismaClient } from "@prisma/client";
import { redis } from "../../core/redis.js";
import { logger } from "../../core/logger.js";

/**
 * Monitoring Service
 *
 * Provides real-time visibility into the switch:
 *   - Live transaction feed (last N transactions)
 *   - Host connection status
 *   - Terminal status overview (online/offline/degraded counts)
 *   - Error tracking (recent errors by category)
 *   - Network monitoring (latency, throughput)
 *
 * Uses Redis for real-time counters and caching where appropriate.
 */
export class MonitoringService {
  constructor(private prisma: PrismaClient) {}

  // ── Dashboard Overview ──────────────────────────

  async getDashboard(): Promise<{
    transactions: {
      total: number;
      today: number;
      authorized: number;
      declined: number;
      pending: number;
    };
    terminals: {
      total: number;
      active: number;
      offline: number;
      degraded: number;
    };
    hosts: {
      total: number;
      connected: number;
      disconnected: number;
      error: number;
    };
    transfers: {
      total: number;
      today: number;
      completed: number;
      failed: number;
      pending: number;
    };
  }> {
    const [
      txTotal, txToday, txAuthorized, txDeclined, txPending,
      terminalsTotal, terminalsActive, terminalsOffline, terminalsDegraded,
      hostsTotal, hostsConnected, hostsDisconnected, hostsError,
      transfersTotal, transfersToday, transfersCompleted, transfersFailed, transfersPending,
    ] = await Promise.all([
      this.prisma.transaction.count(),
      this.prisma.transaction.count({ where: { createdAt: { gte: this.startOfDay() } } }),
      this.prisma.transaction.count({ where: { status: "AUTHORIZED" } }),
      this.prisma.transaction.count({ where: { status: "DECLINED" } }),
      this.prisma.transaction.count({ where: { status: "INITIATED" } }),
      this.prisma.terminal.count(),
      this.prisma.terminal.count({ where: { status: "ACTIVE" } }),
      this.prisma.terminal.count({ where: { health: { status: "OFFLINE" } } }),
      this.prisma.terminal.count({ where: { health: { status: "DEGRADED" } } }),
      this.prisma.hostConnection.count(),
      this.prisma.hostConnection.count({ where: { status: "CONNECTED" } }),
      this.prisma.hostConnection.count({ where: { status: "DISCONNECTED" } }),
      this.prisma.hostConnection.count({ where: { status: "ERROR" } }),
      this.prisma.transfer.count(),
      this.prisma.transfer.count({ where: { createdAt: { gte: this.startOfDay() } } }),
      this.prisma.transfer.count({ where: { status: "COMPLETED" } }),
      this.prisma.transfer.count({ where: { status: "FAILED" } }),
      this.prisma.transfer.count({ where: { status: "PENDING" } }),
    ]);

    return {
      transactions: {
        total: txTotal,
        today: txToday,
        authorized: txAuthorized,
        declined: txDeclined,
        pending: txPending,
      },
      terminals: {
        total: terminalsTotal,
        active: terminalsActive,
        offline: terminalsOffline,
        degraded: terminalsDegraded,
      },
      hosts: {
        total: hostsTotal,
        connected: hostsConnected,
        disconnected: hostsDisconnected,
        error: hostsError,
      },
      transfers: {
        total: transfersTotal,
        today: transfersToday,
        completed: transfersCompleted,
        failed: transfersFailed,
        pending: transfersPending,
      },
    };
  }

  // ── Live Transactions ────────────────────────────

  async getLiveTransactions(limit = 50) {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
      include: {
        merchant: { select: { code: true, legalName: true } },
        terminal: { select: { tid: true, serialNumber: true } },
      },
    });
  }

  // ── Terminal Status ──────────────────────────────

  async getTerminalStatus() {
    return this.prisma.terminal.findMany({
      select: {
        id: true,
        tid: true,
        serialNumber: true,
        status: true,
        lastSeenAt: true,
        health: { select: { status: true, heartbeatAt: true, errorMessage: true } },
        merchant: { select: { code: true, legalName: true } },
      },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  // ── Host Status ──────────────────────────────────

  async getHostStatus() {
    return this.prisma.hostConnection.findMany({
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        status: true,
        lastConnectedAt: true,
        lastError: true,
        protocol: true,
      },
      orderBy: { status: "asc" },
    });
  }

  // ── Error Tracking ───────────────────────────────

  async getRecentErrors(limit = 100) {
    return this.prisma.transaction.findMany({
      where: {
        status: { in: ["DECLINED", "EXPIRED"] },
      },
      select: {
        id: true,
        stan: true,
        responseCode: true,
        responseMessage: true,
        merchant: { select: { code: true, legalName: true } },
        terminal: { select: { tid: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
    });
  }

  // ── Network Stats (Redis) ───────────────────────

  async getNetworkStats(): Promise<{
    tps: number;
    avgLatencyMs: number;
    errorRate: number;
  }> {
    const tpsStr = await redis.get("monitor:tps");
    const latencyStr = await redis.get("monitor:avg_latency");
    const errorRateStr = await redis.get("monitor:error_rate");

    return {
      tps: tpsStr ? parseFloat(tpsStr) : 0,
      avgLatencyMs: latencyStr ? parseFloat(latencyStr) : 0,
      errorRate: errorRateStr ? parseFloat(errorRateStr) : 0,
    };
  }

  async recordTransactionMetrics(durationMs: number, success: boolean) {
    // Update counters in Redis
    await redis.incr("monitor:tx_count");
    await redis.incr(success ? "monitor:tx_success" : "monitor:tx_error");

    // Simple moving average for latency
    const currentLatency = await redis.get("monitor:avg_latency");
    const current = currentLatency ? parseFloat(currentLatency) : 0;
    const newLatency = current === 0 ? durationMs : (current * 0.9 + durationMs * 0.1);
    await redis.set("monitor:avg_latency", newLatency.toFixed(2));

    // Calculate error rate
    const total = await redis.get("monitor:tx_count");
    const errors = await redis.get("monitor:tx_error");
    if (total && errors) {
      const rate = (parseFloat(errors) / parseFloat(total)) * 100;
      await redis.set("monitor:error_rate", rate.toFixed(2));
    }
  }

  // ── Private Helpers ──────────────────────────────

  private startOfDay(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }
}
