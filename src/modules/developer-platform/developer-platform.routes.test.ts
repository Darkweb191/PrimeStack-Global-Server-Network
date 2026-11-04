import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDeveloperPlatformRoutes } from "./developer-platform.routes.js";
import type { DeveloperPlatformService } from "./developer-platform.service.js";

describe("Developer Platform admin routes", () => {
  const app = Fastify();
  const service = {
    getDashboard: vi.fn(async () => ({ summary: { applications: 0 } })),
    createApplicationKey: vi.fn(async () => ({
      id: "key-id",
      keyId: "dpk_test",
      secretLast4: "1234",
      secret: "dps_one-time-secret",
      createdAt: new Date(),
    })),
  };

  app.decorate("authenticate", async (request) => {
    const role = request.headers["x-test-role"];
    if (typeof role !== "string") {
      throw Object.assign(new Error("Authentication required"), {
        statusCode: 401,
      });
    }
    request.user = { role } as typeof request.user;
  });
  registerDeveloperPlatformRoutes(
    app,
    service as unknown as DeveloperPlatformService,
  );

  afterEach(() => {
    service.createApplicationKey.mockClear();
    service.getDashboard.mockClear();
  });

  it("serves the dashboard shell without exposing API data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/developer-platform-dashboard",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toContain("PrimeStack Developer Platform");
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it("requires admin authentication for platform data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/developer-platform/dashboard",
    });
    expect(response.statusCode).toBe(401);
  });

  it("restricts API credential creation to administrators", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/developer-platform/applications/app-id/api-keys",
      headers: { "x-test-role": "OPERATOR" },
    });
    expect(response.statusCode).toBe(403);
    expect(service.createApplicationKey).not.toHaveBeenCalled();
  });

  it("returns a newly issued credential once to an administrator", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/developer-platform/applications/app-id/api-keys",
      headers: { "x-test-role": "ADMIN" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.secret).toBe("dps_one-time-secret");
    expect(service.createApplicationKey).toHaveBeenCalledWith("app-id");
  });
});
