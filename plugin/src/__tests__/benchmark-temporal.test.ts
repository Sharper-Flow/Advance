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
});
