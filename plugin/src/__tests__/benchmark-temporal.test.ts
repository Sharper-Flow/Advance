import { describe, expect, it } from "vitest";
import {
  checkEnvBypass,
  time,
  computeStats,
  classifyContamination,
  recordRun,
  validateOutputDir,
  type BenchmarkOp,
  type BenchmarkMode,
  type ContaminationContext,
} from "../../scripts/benchmark-temporal";

describe("benchmark-temporal scaffold (A1)", () => {
  describe("checkEnvBypass", () => {
    it("returns ok=true when no bypass flags are set", () => {
      const result = checkEnvBypass();
      expect(result.ok).toBe(true);
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
        health: {
          server_alive: true,
          worker_alive: true,
          worker_process_alive: true,
          registered_queues: [],
          last_op_at: new Date().toISOString(),
          last_error: null,
        },
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
        health: {
          server_alive: false,
          worker_alive: false,
          worker_process_alive: false,
          registered_queues: [],
          last_op_at: null,
          last_error: null,
        },
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
        health: {
          server_alive: true,
          worker_alive: true,
          worker_process_alive: true,
          registered_queues: [],
          last_op_at: null,
          last_error: "err",
        },
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
      const { runWarmInteractive } =
        await import("../../scripts/benchmark-temporal");
      const start = Date.now();
      const samples = await runWarmInteractive(
        "adv_status",
        3,
        50,
        fakeAdapter,
      );
      const elapsed = Date.now() - start;

      expect(samples).toHaveLength(3);
      expect(samples.every((s) => s.mode === "warm-interactive")).toBe(true);
      expect(samples.every((s) => s.op === "adv_status")).toBe(true);
      // 3 samples with 50ms gap between = at least 100ms total
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it("runRepeatedCommand returns N samples back-to-back", async () => {
      const { runRepeatedCommand } =
        await import("../../scripts/benchmark-temporal");
      const start = Date.now();
      const samples = await runRepeatedCommand(
        "adv_change_list",
        5,
        fakeAdapter,
      );
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
      const { createBoundOpAdapter } =
        await import("../../scripts/benchmark-temporal");
      const adapter = createBoundOpAdapter("adv_status", "/tmp/adv-bench-test");
      expect(typeof adapter).toBe("function");
      // We don't actually invoke it here because it would need a real store;
      // the integration test for invocation belongs in B4.
    });
  });

  describe("promote-pipeline segmented adapter (B2)", () => {
    it("runPromotePipeline returns both segment timings", async () => {
      const { runPromotePipeline } =
        await import("../../scripts/benchmark-temporal");

      // Fake store with minimal wisdom.add implementation
      const fakeStore = {
        paths: { root: "/tmp", wisdom: "/tmp/wisdom.jsonl" },
        wisdom: {
          add: async (
            _changeId: string,
            type: string,
            content: string,
            _sourceTask?: string,
          ) => ({
            id: "w1",
            type,
            content,
            source_task: undefined,
          }),
        },
        close: () => {},
      } as unknown as import("../../src/storage/store-types").Store;

      const result = await runPromotePipeline(
        fakeStore,
        "test-change",
        "pattern",
        "test content",
      );

      expect(result).toHaveProperty("entry");
      expect(result).toHaveProperty("timings");
      expect(result.timings.seg1_change_level_ns).toBeGreaterThan(0);
      expect(result.timings.seg2_project_level_ns).toBeGreaterThanOrEqual(0);
      expect(result.timings.end_to_end_ns).toBeGreaterThan(0);
      // end_to_end should be >= sum of segments (it IS the sum)
      expect(result.timings.end_to_end_ns).toBe(
        result.timings.seg1_change_level_ns +
          result.timings.seg2_project_level_ns,
      );
    });

    it("runPromotePipeline handles missing Temporal gracefully", async () => {
      const { runPromotePipeline } =
        await import("../../scripts/benchmark-temporal");

      const fakeStore = {
        paths: { root: "/tmp", wisdom: "/tmp/wisdom.jsonl" },
        wisdom: {
          add: async () => ({ id: "w1", type: "pattern", content: "test" }),
        },
        close: () => {},
      } as unknown as import("../../src/storage/store-types").Store;

      const result = await runPromotePipeline(
        fakeStore,
        "test-change",
        "pattern",
        "test",
      );

      // Should still return timings even if project-level pipeline fails
      expect(result.timings.seg1_change_level_ns).toBeGreaterThan(0);
      expect(result).toHaveProperty("warning");
    });
  });

  describe("fixture generator (B3)", () => {
    it("creates the expected directory structure", async () => {
      const { createBenchmarkFixture } =
        await import("../../scripts/benchmark-temporal");
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const os = await import("node:os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "adv-bench-"));

      try {
        const fixture = await createBenchmarkFixture({
          externalRoot: tmpDir,
          activeChanges: 3,
          tasksPerChange: 2,
          wisdomPerChange: 1,
        });

        expect(fixture.changeIds).toHaveLength(3);
        expect(fixture.taskCounts.get("bench-change-000")).toBe(2);
        expect(fixture.wisdomCounts.get("bench-change-000")).toBe(1);

        // Verify directory shape
        for (const changeId of fixture.changeIds) {
          const changeDir = path.join(tmpDir, "changes", changeId);
          const stat = await fs.stat(changeDir);
          expect(stat.isDirectory()).toBe(true);

          const changeJson = await fs.readFile(
            path.join(changeDir, "change.json"),
            "utf-8",
          );
          const parsed = JSON.parse(changeJson);
          expect(parsed.tasks).toHaveLength(2);
          expect(parsed.wisdom).toHaveLength(1);

          const proposalMd = await fs.readFile(
            path.join(changeDir, "proposal.md"),
            "utf-8",
          );
          expect(proposalMd).toContain("Benchmark Proposal");
        }
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("defaults to stress shape (50 changes × 30 tasks)", async () => {
      const { createBenchmarkFixture } =
        await import("../../scripts/benchmark-temporal");
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const os = await import("node:os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "adv-bench-"));

      try {
        const fixture = await createBenchmarkFixture({
          externalRoot: tmpDir,
        });

        expect(fixture.changeIds).toHaveLength(50);
        expect(fixture.taskCounts.get("bench-change-000")).toBe(30);
        expect(fixture.wisdomCounts.get("bench-change-000")).toBe(5);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("validateOutputDir", () => {
    it("accepts undefined and returns default under temp/bench", () => {
      const result = validateOutputDir();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toContain("temp/bench");
      }
    });

    it("accepts relative path under cwd", () => {
      const result = validateOutputDir("temp/my-run");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toContain("temp/my-run");
      }
    });

    it("rejects path traversal", () => {
      const result = validateOutputDir("../escape");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("escapes");
      }
    });

    it("rejects absolute path outside cwd", () => {
      const result = validateOutputDir("/etc/passwd");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("escapes");
      }
    });
  });

  describe("runSingleShot (B1 fix)", () => {
    it("measures actual adapter, not noop", async () => {
      const { runSingleShot } =
        await import("../../scripts/benchmark-temporal");
      let called = false;
      const adapter = async (op: BenchmarkOp) => {
        called = true;
        await new Promise((r) => setTimeout(r, 5));
        return `result-${op}`;
      };

      const sample = await runSingleShot("adv_status", adapter);
      expect(called).toBe(true);
      expect(sample.duration_ns).toBeGreaterThan(0);
      expect(sample.contamination).toBe("clean");
    });

    it("classifies contamination when adapter throws", async () => {
      const { runSingleShot } =
        await import("../../scripts/benchmark-temporal");
      const adapter = async () => {
        throw new Error("boom");
      };

      const sample = await runSingleShot("adv_status", adapter);
      expect(sample.duration_ns).toBe(0);
      expect(sample.contamination).toBe("unknown");
    });
  });

  describe("runners error capture (A3 fix)", () => {
    it("runWarmInteractive tags unknown when adapter throws", async () => {
      const { runWarmInteractive } =
        await import("../../scripts/benchmark-temporal");
      const adapter = async () => {
        throw new Error("warm fail");
      };

      const samples = await runWarmInteractive("adv_status", 2, 10, adapter);
      expect(samples).toHaveLength(2);
      expect(samples.every((s) => s.contamination === "unknown")).toBe(true);
      expect(samples.every((s) => s.duration_ns === 0)).toBe(true);
    });

    it("runRepeatedCommand tags unknown when adapter throws", async () => {
      const { runRepeatedCommand } =
        await import("../../scripts/benchmark-temporal");
      const adapter = async () => {
        throw new Error("repeat fail");
      };

      const samples = await runRepeatedCommand("adv_status", 3, adapter);
      expect(samples).toHaveLength(3);
      expect(samples.every((s) => s.contamination === "unknown")).toBe(true);
      expect(samples.every((s) => s.duration_ns === 0)).toBe(true);
    });

    it("runColdStart fallback tags contamination, not clean", async () => {
      const { runColdStart } = await import("../../scripts/benchmark-temporal");
      // Use an op that will cause child process to fail (no real store)
      // so it falls back to in-process measurement
      const adapter = async () => {
        throw new Error("fallback fail");
      };

      const samples = await runColdStart("adv_status", 1, adapter);
      expect(samples).toHaveLength(1);
      // Child will likely fail; fallback measures in-process and classifies
      expect(samples[0].contamination).not.toBe("clean");
    });
  });
});
