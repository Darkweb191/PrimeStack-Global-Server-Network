import Fastify from "fastify";
import { afterAll, describe, expect, it, vi } from "vitest";
import { registerGovernanceRoutes } from "./governance.routes.js";
import type { GovernanceService } from "./governance.service.js";

describe("Governance admin routes", () => {
  const app = Fastify();
  const service = {
    getDashboard: vi.fn(async () => ({ summary: { openRisks: 0 } })),
    createRisk: vi.fn(async (input, actorId) => ({
      ...input,
      createdBy: actorId,
    })),
    updateChangeRequest: vi.fn(async (_id, input, actorId) => ({
      ...input,
      reviewedBy: actorId,
    })),
  };

  app.decorate("authenticate", async (request) => {
    const role = request.headers["x-test-role"];
    if (typeof role !== "string") {
      throw Object.assign(new Error("Authentication required"), {
        statusCode: 401,
      });
    }
    const id = request.headers["x-test-user"];
    request.user = {
      role,
      ...(typeof id === "string" ? { id } : {}),
    } as typeof request.user;
  });
  registerGovernanceRoutes(app, service as unknown as GovernanceService);

  afterAll(async () => app.close());

  it("serves the dashboard shell without exposing governance data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/governance-dashboard",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toContain("PrimeStack Governance Center");
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it("requires authentication for governance APIs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/governance/dashboard",
    });
    expect(response.statusCode).toBe(401);
  });

  it("prevents read-only roles from creating risk records", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/governance/risks",
      headers: { "x-test-role": "READONLY", "x-test-user": "user-1" },
      payload: {
        riskCategory: "SECURITY",
        impact: "HIGH",
        likelihood: "POSSIBLE",
        description: "Test risk",
        mitigation: "Mitigate test risk",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(service.createRisk).not.toHaveBeenCalled();
  });

  it("rejects malformed governance records", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/governance/risks",
      headers: { "x-test-role": "OPERATOR", "x-test-user": "user-1" },
      payload: { riskCategory: "MADE_UP" },
    });
    expect(response.statusCode).toBe(422);
    expect(service.createRisk).not.toHaveBeenCalled();
  });

  it("attributes new records to the authenticated user", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/governance/risks",
      headers: { "x-test-role": "OPERATOR", "x-test-user": "operator-1" },
      payload: {
        riskCategory: "SECURITY",
        impact: "HIGH",
        likelihood: "POSSIBLE",
        description: "Test risk",
        mitigation: "Mitigate test risk",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.createdBy).toBe("operator-1");
  });

  it("allows a reviewer to advance a change request through the approval workflow", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/admin/governance/change-requests/change-1",
      headers: { "x-test-role": "REVIEWER", "x-test-user": "reviewer-1" },
      payload: { approvalStatus: "REVIEWED" },
    });
    expect(response.statusCode).toBe(200);
    expect(service.updateChangeRequest).toHaveBeenCalledWith(
      "change-1",
      { approvalStatus: "REVIEWED" },
      "reviewer-1",
    );
  });
});
