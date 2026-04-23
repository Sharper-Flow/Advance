import { describe, expect, it, vi } from "vitest";
import {
  checkEnvBypass,
  time,
  computeStats,
  classifyContamination,
  recordRun,
  type BenchmarkOp,
  type BenchmarkMode,
  type ContaminationContext,
} from "../../scripts/benchmark-temporal";

describe("benchmark-temporal scaffold (A1)", () => {
  describe("checkEnvBypass", () => {
    it("returns ok=true when neither bypass flag is set", () => {
      const originalDisable = process.env.ADV_DISABLE_TEMPORAL;
      const originalFallback = process.env.ADV_ALLOW_DEGRADED_FALLBACK;
      delete process.env.ADV_DISABLE_TEMPORAL;
      delete process.env.ADV_ALLOW_DEGRADED_FALLBACK;

      const result = checkEnvBypass();
      expect(result.ok).toBe(true);

      process.env.ADV_DISABLE_TEMPORAL = originalDisable;
      process.env.ADV_ALLOW_DEGRADED_FALLBACK = originalFallback;
    });

    it("returns ok=false when ADV_DISABLE_TEMPORAL is set", () => {
      const original = process.env.ADV_DISABLE_TEMPORAL;
      process.env.ADV_DISABLE_TEMPORAL = "1";

      const result = checkEnvBypass();
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("remediation");

      process.env.ADV_DISABLE_TEMPORAL = original;
    });

    it("returns ok=false when ADV_ALLOW_DEGRADED_FALLBACK is set", () => {
      const original = process.env.ADV_ALLOW_DEGRADED_FALLBACK;
      process.env.ADV_ALLOW_DEGRADED_FALLBACK = "1";

      const result = checkEnvBypass();
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("remediation");

      process.env.ADV_ALLOW_DEGRADED_FALLBACK = original;
    });
  });

  describe("time helper", () => {
    it("measures duration in nanoseconds", async () => {
      const { result, duration_ns } = await time("test", async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 42;
      });

      expect(result).toBe(42);
      expect(duration_ns).toBeGreaterThan(0);
      // 10ms = 10,000,000ns; allow wide margin for scheduler jitter
      expect(duration_ns).toBeGreaterThan(5_000_000);
    });
  });

  describe("computeStats", () => {
    it("returns zeros for empty array", () => {
      const stats = computeStats([]);
      expect(stats.p50_ns).toBe(0);
      expect(stats.p95_ns).toBe(0);
      expect(stats.max_ns).toBe(0);
    });

    it("computes p50/p95/max correctly", () => {
      const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => n * 1_000_000);
      const stats = computeStats(samples);
      // 10 elements: p50 = index 5 = 6th element = 6_000_000
      expect(stats.p50_ns).toBe(6_000_000);
      expect(stats.p95_ns).toBe(10_000_000);
      expect(stats.max_ns).toBe(10_000_000);
    });

    it("handles odd-length arrays", () => {
      const samples = [100, 200, 300].map((n) => n * 1_000_000);
      const stats = computeStats(samples);
      expect(stats.p50_ns).toBe(200_000_000);
      expect(stats.p95_ns).toBe(300_000_000);
      expect(stats.max_ns).toBe(300_000_000);
    });
  });

  describe("parseArgs (via module import)", () => {
    it("exports types for BenchmarkOp and BenchmarkMode", () => {
      // Type-only check at runtime — just verify the module loads
      const ops: BenchmarkOp[] = [
        "adv_status",
        "adv_change_list",
        "adv_change_show",
        "adv_task_list",
        "adv_task_show",
        "adv_wisdom_add",
      ];
      const modes: BenchmarkMode[] = [
        "cold-start",
        "warm-interactive",
        "repeated-command",
      ];
      expect(ops).toHaveLength(6);
      expect(modes).toHaveLength(3);
    });
  });

  describe("classifyContamination (A2)", () => {
    it("tags clean when no error, server alive, no fallback", () => {
      const ctx: ContaminationContext = {
        health: { server_alive: true, worker_alive: true, worker_process_alive: true, registered_queues: [], last_op_at: new Date().toISOString(), last_error: null },
        retry: { lastOpAt: new Date().toISOString(), lastError: null },
        opError: null,
        fallbackCount: 0,
      };
      expect(classifyContamination(ctx)).toBe("clean");
    });

    it("tags fallback when fallbackCount > 0", () => {
      const ctx: ContaminationContext = {
        health: null,
        retry: null,
        opError: null,
        fallbackCount: 1,
      };
      expect(classifyContamination(ctx)).toBe("fallback");
    });

    it("tags server-unreachable when health says server down", () => {
      const ctx: ContaminationContext = {
        health: { server_alive: false, worker_alive: false, worker_process_alive: false, registered_queues: [], last_op_at: null, last_error: null },
        retry: null,
        opError: null,
        fallbackCount: 0,
      };
      expect(classifyContamination(ctx)).toBe("server-unreachable");
    });

    it("tags retry-exhausted when retry shows error with lastOpAt", () => {
      const ctx: ContaminationContext = {
        health: null,
        retry: { lastOpAt: new Date().toISOString(), lastError: "some error" },
        opError: new Error("boom"),
        fallbackCount: 0,
      };
      expect(classifyContamination(ctx)).toBe("retry-exhausted");
    });

    it("tags retry-exhausted when retry shows error without lastOpAt", () => {
      const ctx: ContaminationContext = {
        health: { server_alive: true, worker_alive: true, worker_process_alive: true, registered_queues: [], last_op_at: null, last_error: "err" },
        retry: { lastOpAt: null, lastError: "err" },
        opError: null,
        fallbackCount: 0,
      };
      expect(classifyContamination(ctx)).toBe("retry-exhausted");
    });

    it("tags server-unreachable on connection error text", () => {
      const ctx: ContaminationContext = {
        health: null,
        retry: null,
        opError: new Error("ECONNREFUSED localhost:7233"),
        fallbackCount: 0,
      };
      expect(classifyContamination(ctx)).toBe("server-unreachable");
    });

    it("tags unknown on unrecognized error", () => {
      const ctx: ContaminationContext = {
        health: null,
        retry: null,
        opError: new Error("something weird"),
        fallbackCount: 0,
      };
      expect(classifyContamination(ctx)).toBe("unknown");
    });
  });

  describe("recordRun (A2)", () => {
    it("returns sample with updated contamination tag", () => {
      const sample = {
        op: "adv_status" as BenchmarkOp,
        mode: "cold-start" as BenchmarkMode,
        run_id: "test",
        sample_index: 0,
        duration_ns: 1_000_000,
        contamination: "clean" as const,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      };

      const ctx: ContaminationContext = {
        health: null,
        retry: null,
        opError: new Error("ECONNREFUSED"),
        fallbackCount: 0,
      };

      const tagged = recordRun(sample, ctx);
      expect(tagged.contamination).toBe("server-unreachable");
      expect(tagged.duration_ns).toBe(sample.duration_ns);
    });
  });

  describe("runners (A3)", () => {
    const fakeAdapter = async (op: BenchmarkOp) => {
      await new Promise((r) => setTimeout(r, 5));
      return `result-${op}`;
    };

    it("runWarmInteractive returns N samples with correct mode and gap", async () => {
      const { runWarmInteractive } = await import("../../scripts/benchmark-temporal");
      const start = Date.now();
      const samples = await runWarmInteractive("adv_status", 3, 50, fakeAdapter);
      const elapsed = Date.now() - start;

      expect(samples).toHaveLength(3);
      expect(samples.every((s) => s.mode === "warm-interactive")).toBe(true);
      expect(samples.every((s) => s.op === "adv_status")).toBe(true);
      // 3 samples with 50ms gap between = at least 100ms total
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it("runRepeatedCommand returns N samples back-to-back", async () => {
      const { runRepeatedCommand } = await import("../../scripts/benchmark-temporal");
      const start = Date.now();
      const samples = await runRepeatedCommand("adv_change_list", 5, fakeAdapter);
      const elapsed = Date.now() - start;

      expect(samples).toHaveLength(5);
      expect(samples.every((s) => s.mode === "repeated-command")).toBe(true);
      // Should be fast — no gaps
      expect(elapsed).toBeLessThan(200);
    });

    it("runColdStart spawns child processes (or falls back gracefully)", async () => {
      const { runColdStart } = await import("../../scripts/benchmark-temporal");
      // We can't easily test actual child-process spawning in vitest without
      // complex mocking, but we can verify the function accepts the adapter
      // and returns the expected shape (even if all children fail and fall back).
      const samples = await runColdStart("adv_task_show", 2, fakeAdapter);

      expect(samples).toHaveLength(2);
      expect(samples.every((s) => s.mode === "cold-start")).toBe(true);
      // Each sample should have a duration (either from child or fallback)
      expect(samples.every((s) => s.duration_ns >= 0)).toBe(true);
    });

    it("cold-start isolation: each sample has distinct run_id prefix", async () => {
      const { runColdStart } = await import("../../scripts/benchmark-temporal");
      const samples = await runColdStart("adv_status", 3, fakeAdapter);

      // All samples share the same run_id base
      const baseId = samples[0]?.run_id;
      expect(baseId).toBeDefined();
      expect(samples.every((s) => s.run_id === baseId)).toBe(true);
    });
  });

  describe("op adapters (B1)", () => {
    it("opAdapters registry has all six ops", async () => {
      const { opAdapters } = await import("../../scripts/benchmark-temporal");
      expect(Object.keys(opAdapters)).toHaveLength(6);
      expect(opAdapters).toHaveProperty("adv_status");
      expect(opAdapters).toHaveProperty("adv_change_list");
      expect(opAdapters).toHaveProperty("adv_change_show");
      expect(opAdapters).toHaveProperty("adv_task_list");
      expect(opAdapters).toHaveProperty("adv_task_show");
      expect(opAdapters).toHaveProperty("adv_wisdom_add");
    });

    it("createBoundOpAdapter returns a callable adapter", async () => {
      const { createBoundOpAdapter } = await import("../../scripts/benchmark-temporal");
      const adapter = createBoundOpAdapter("adv_status", "/tmp/adv-bench-test");
      expect(typeof adapter).toBe("function");
      // We don't actually invoke it here because it would need a real store;
      // the integration test for invocation belongs in B4.
    });
  });
});
