import Fastify from "fastify";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIntelligenceRoutes } from "./intelligence.routes.js";
import type { IntelligenceService } from "./intelligence.service.js";

describe("Intelligence admin routes", () => {
  const app = Fastify();
  const service = {
    getDashboard: vi.fn(async (days: number) => ({ transactions: { days } })),
    listEvents: vi.fn(async (limit: number) => [{ id: "event-1", limit }]),
    recordEvent: vi.fn(async (input, createdBy) => ({ ...input, createdBy })),
  };

  app.decorate("authenticate", async (request) => {
    const role = request.headers["x-test-role"];
    if (typeof role !== "string")
      throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
    const id = request.headers["x-test-user"];
    request.user = {
      role,
      ...(typeof id === "string" ? { id } : {}),
    } as typeof request.user;
  });
  registerIntelligenceRoutes(app, service as unknown as IntelligenceService);

  beforeEach(() => {
    service.getDashboard.mockClear();
    service.listEvents.mockClear();
    service.recordEvent.mockClear();
  });

  afterAll(async () => app.close());

  it("serves a no-store intelligence shell without exposing operational data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/intelligence-dashboard",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toContain(
      "no routing, fraud, treasury, settlement, or infrastructure action is automated",
    );
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it("requires authentication to read intelligence data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/intelligence/dashboard",
    });
    expect(response.statusCode).toBe(401);
  });

  it("allows read-only users to view the dashboard", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/intelligence/dashboard?days=7",
      headers: { "x-test-role": "READONLY" },
    });
    expect(response.statusCode).toBe(200);
    expect(service.getDashboard).toHaveBeenCalledWith(7);
  });

  it("rejects invalid event data and attributes valid records to the actor", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/admin/intelligence/events",
      headers: { "x-test-role": "OPERATOR", "x-test-user": "operator-1" },
      payload: { eventType: "bad event", sourceSystem: "core", confidenceScore: 150, summary: "" },
    });
    expect(invalid.statusCode).toBe(422);
    expect(service.recordEvent).not.toHaveBeenCalled();

    const valid = await app.inject({
      method: "POST",
      url: "/admin/intelligence/events",
      headers: { "x-test-role": "OPERATOR", "x-test-user": "operator-1" },
      payload: {
        eventType: "HOST_AVAILABILITY_REVIEW",
        sourceSystem: "SWITCH_CORE",
        confidenceScore: 92,
        summary: "One host is unavailable.",
      },
    });
    expect(valid.statusCode).toBe(201);
    expect(valid.json().data.createdBy).toBe("operator-1");
  });

  it("does not allow read-only users to create events", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/intelligence/events",
      headers: { "x-test-role": "READONLY", "x-test-user": "reader-1" },
      payload: {
        eventType: "OBSERVATION",
        sourceSystem: "ANALYST",
        confidenceScore: 50,
        summary: "Observation.",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(service.recordEvent).not.toHaveBeenCalled();
  });
});
