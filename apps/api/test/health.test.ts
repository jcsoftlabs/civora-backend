import { afterAll, describe, expect, it } from "vitest";
import { buildApp, type AppDeps } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LatencyWindow } from "../src/lib/latency.js";

describe("supervision (NFR-04, NFR-07)", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  const make = async (health: NonNullable<AppDeps["health"]>) => {
    const app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }), { health });
    apps.push(app);
    return app;
  };
  afterAll(async () => Promise.all(apps.map((a) => a.close())));

  it("répond ok quand la base et le worker suivent", async () => {
    const app = await make(async () => ({ database: true, workerLastRunAt: new Date(Date.now() - 60_000) }));
    const res = await app.inject({ url: "/health/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", checks: { database: "ok", worker: "ok" } });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("signale un worker en retard et une base injoignable (503)", async () => {
    const late = await make(async () => ({ database: true, workerLastRunAt: new Date(Date.now() - 30 * 60_000) }));
    const r1 = await late.inject({ url: "/health/status" });
    expect(r1.statusCode).toBe(503);
    expect(r1.json().checks.worker).toBe("late");
    const down = await make(async () => ({ database: false, workerLastRunAt: null }));
    const r2 = await down.inject({ url: "/health/status" });
    expect(r2.statusCode).toBe(503);
    expect(r2.json().checks).toEqual({ database: "down", worker: "late" });
  });

  it("calcule le 95e centile sur la fenêtre de 15 minutes", () => {
    let t = 0;
    const w = new LatencyWindow(() => t);
    expect(w.summary()).toEqual({ requests: 0, p95Ms: null });
    for (let i = 1; i <= 100; i++) w.record(i * 10);
    expect(w.summary()).toEqual({ requests: 100, p95Ms: 950 });
    t = 16 * 60_000;
    w.record(42);
    expect(w.summary()).toEqual({ requests: 1, p95Ms: 42 });
  });
});
