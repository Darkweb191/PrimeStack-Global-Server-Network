import { createServer } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Iso8583Service } from "./iso8583.service.js";

const servers: ReturnType<typeof createServer>[] = [];

function createService(port: number) {
  const connection = {
    id: "bank-connection-1",
    host: "127.0.0.1",
    port,
    timeout: 1000,
  };
  const findUnique = vi.fn().mockResolvedValue(connection);
  const update = vi.fn().mockResolvedValue({});
  const prisma = {
    hostConnection: { findUnique, update },
  } as unknown as PrismaClient;
  return { service: new Iso8583Service(prisma), findUnique, update };
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("TCP test server did not bind to a network port"));
        return;
      }
      resolve(address.port);
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  ));
});

describe("Iso8583Service.testHostConnection", () => {
  it("reports reachable TCP hosts without sending application data", async () => {
    let receivedBytes = 0;
    const server = createServer((socket) => {
      socket.on("data", (data) => { receivedBytes += data.length; });
    });
    servers.push(server);
    const port = await listen(server);
    const { service, update } = createService(port);

    const result = await service.testHostConnection("bank-connection-1");

    expect(result.reachable).toBe(true);
    expect(result.status).toBe("CONNECTED");
    expect(result.message).toContain("no payment or ISO 8583 message");
    expect(receivedBytes).toBe(0);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "bank-connection-1" },
      data: expect.objectContaining({ status: "CONNECTED", lastError: null }),
    }));
  });

  it("records a refused connection as an explicit failed test result", async () => {
    const server = createServer();
    servers.push(server);
    const port = await listen(server);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    servers.splice(servers.indexOf(server), 1);
    const { service, update } = createService(port);

    const result = await service.testHostConnection("bank-connection-1");

    expect(result.reachable).toBe(false);
    expect(result.status).toBe("ERROR");
    expect(result.message.length).toBeGreaterThan(0);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "bank-connection-1" },
      data: expect.objectContaining({ status: "ERROR" }),
    }));
  });

  it("rejects tests for unknown bank connections", async () => {
    const prisma = {
      hostConnection: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    } as unknown as PrismaClient;

    await expect(new Iso8583Service(prisma).testHostConnection("missing"))
      .rejects.toThrow("Bank connection not found: missing");
  });
});
