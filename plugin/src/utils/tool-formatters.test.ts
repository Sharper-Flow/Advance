import { describe, expect, it } from "vitest";
import {
  truncate,
  buildTodoProjection,
  formatTaskReadyOutput,
  formatStatusOutput,
  formatValidationOutput,
  formatDoomLoopDiagnostics,
  formatSmellReport,
} from "./tool-formatters";

describe("tool-formatters", () => {
  describe("truncate", () => {
    it("returns string unchanged when within limit", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("truncates with ellipsis when over limit", () => {
      expect(truncate("hello world", 8)).toBe("hello...");
    });

    it("handles edge case: string exactly at limit", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });

    it("handles empty string", () => {
      expect(truncate("", 10)).toBe("");
    });
  });

  describe("formatTaskReadyOutput", () => {
    it("returns formatted output with readyList and blockedList", () => {
      const result = formatTaskReadyOutput({
        ready: [{ id: "tk-abc", content: "Implement auth", status: "pending" }],
        blocked: [],
      });
      expect(result.readyList).toContain("tk-abc");
      expect(result.readyList).toContain("Implement auth");
      expect(result.blockedList).toBe("(no blocked tasks)");
      expect(result.nextSuggested).toEqual({
        id: "tk-abc",
        title: "Implement auth",
      });
      expect(result.todoFormat).toBe("tk-abc — Implement auth");
    });

    it("handles empty ready and blocked lists", () => {
      const result = formatTaskReadyOutput({ ready: [], blocked: [] });
      expect(result.readyList).toBe("(no tasks ready)");
      expect(result.blockedList).toBe("(no blocked tasks)");
      expect(result.nextSuggested).toBeUndefined();
      expect(result.todoFormat).toBeUndefined();
    });

    it("formats blocked tasks with blocker IDs", () => {
      const result = formatTaskReadyOutput({
        ready: [],
        blocked: [
          {
            task: { id: "tk-def", content: "Deploy", status: "pending" },
            blockedBy: ["tk-abc"],
          },
        ],
      });
      expect(result.blockedList).toContain("tk-def");
      expect(result.blockedList).toContain("blocked by: tk-abc");
    });

    it("truncates long task content", () => {
      const longContent = "A".repeat(100);
      const result = formatTaskReadyOutput({
        ready: [{ id: "tk-abc", content: longContent, status: "pending" }],
        blocked: [],
      });
      expect(result.readyList).toContain("...");
      // Should be truncated to ~60 chars
      const line = result.readyList.split("\n")[0];
      expect(line.length).toBeLessThan(80);
    });
  });

  describe("buildTodoProjection", () => {
    it("builds current task plus next three ready tasks with em dash content", () => {
      const result = buildTodoProjection({
        current: {
          id: "tk-current",
          title: "Current task",
          status: "in_progress",
        },
        ready: [
          { id: "tk-1", title: "Ready one", status: "pending" },
          { id: "tk-2", title: "Ready two", status: "pending" },
          { id: "tk-3", title: "Ready three", status: "pending" },
          { id: "tk-4", title: "Ready four", status: "pending" },
        ],
      });

      expect(result).toEqual({
        rows: [
          {
            taskId: "tk-current",
            title: "Current task",
            status: "in_progress",
            content: "tk-current — Current task",
          },
          {
            taskId: "tk-1",
            title: "Ready one",
            status: "pending",
            content: "tk-1 — Ready one",
          },
          {
            taskId: "tk-2",
            title: "Ready two",
            status: "pending",
            content: "tk-2 — Ready two",
          },
          {
            taskId: "tk-3",
            title: "Ready three",
            status: "pending",
            content: "tk-3 — Ready three",
          },
        ],
        format: "task-id-em-dash-title",
        window: { includeCurrent: true, readyLimit: 3, omitDone: true },
      });
    });

    it("omits done tasks from projection rows", () => {
      const result = buildTodoProjection({
        current: { id: "tk-done", title: "Done task", status: "done" },
        ready: [
          { id: "tk-ready", title: "Ready task", status: "pending" },
          { id: "tk-done-2", title: "Done ready", status: "done" },
        ],
      });

      expect(result.rows).toEqual([
        {
          taskId: "tk-ready",
          title: "Ready task",
          status: "pending",
          content: "tk-ready — Ready task",
        },
      ]);
    });
  });

  describe("formatStatusOutput", () => {
    it("returns formatted sections", () => {
      const result = formatStatusOutput({
        specCount: 9,
        requirementCount: 67,
        activeChanges: [],
        archivedCount: 105,
        recommendations: ["Run /adv-apply foo"],
        temporalAlive: true,
      });
      expect(result.specsSection).toContain("9");
      expect(result.specsSection).toContain("67");
      expect(result.archivedSection).toContain("105");
      expect(result.recommendationsList).toHaveLength(1);
      expect(result.healthSection).toBeDefined();
    });

    it("formats OpenCode session debt diagnostics", () => {
      const result = formatStatusOutput({
        specCount: 1,
        requirementCount: 1,
        activeChanges: [],
        archivedCount: 0,
        recommendations: [],
        temporalAlive: true,
        opencodeSessionDebt: {
          available: true,
          orphanGhostCount: 2,
          liveInFlightCount: 1,
        },
      });

      expect(result.sessionDebtSection).toContain(
        "2 orphan ghost blank assistant",
      );
      expect(result.sessionDebtSection).toContain("1 live/in-flight");
    });

    it("handles empty state", () => {
      const result = formatStatusOutput({
        specCount: 0,
        requirementCount: 0,
        activeChanges: [],
        archivedCount: 0,
        recommendations: [],
        temporalAlive: false,
      });
      expect(result.specsSection).toContain("0");
      expect(result.recommendationsList).toHaveLength(0);
    });

    it("includes recency emojis in active section", () => {
      const result = formatStatusOutput({
        specCount: 1,
        requirementCount: 5,
        activeChanges: [
          {
            id: "testChange",
            title: "Test Change",
            minutesSinceActivity: 2,
            recency: "hot",
          },
        ],
        archivedCount: 0,
        recommendations: [],
        temporalAlive: true,
      });
      expect(result.activeSection).toContain("🔥");
      expect(result.activeSection).toContain("testChange");
    });

    it("renders serviceable peer-owned Temporal queue as informational, not degraded", () => {
      const result = formatStatusOutput({
        specCount: 1,
        requirementCount: 1,
        activeChanges: [],
        archivedCount: 0,
        recommendations: [],
        temporalAlive: true,
        temporalHealth: {
          worker_alive: true,
          worker_process_alive: false,
        },
        temporalQueueServiceability: {
          status: "serviceable",
          confidence: "server",
          expectedQueue: "advance-project",
          blockers: [],
        },
      });

      expect(result.healthSection).toContain(
        "Worker process: peer-owned, serviceable",
      );
      expect(result.healthSection).not.toContain("Worker process: degraded");
    });

    it("prepends ↳ to active changes with parent_change_id", () => {
      const result = formatStatusOutput({
        specCount: 1,
        requirementCount: 5,
        activeChanges: [
          {
            id: "childChange",
            title: "Child Change",
            minutesSinceActivity: 2,
            recency: "hot",
            parent_change_id: "parentChange",
          },
        ],
        archivedCount: 0,
        recommendations: [],
        temporalAlive: true,
      });
      expect(result.activeSection).toContain("↳ childChange");
    });

    describe("worktree census", () => {
      const baseInput = {
        specCount: 1,
        requirementCount: 5,
        activeChanges: [],
        archivedCount: 0,
        recommendations: [],
        temporalAlive: true,
      };

      it("shows (unavailable) when no census data", () => {
        const result = formatStatusOutput(baseInput);
        expect(result.worktreeSection).toBe("## Worktrees\n(unavailable)");
      });

      it("shows active count with no stale worktrees", () => {
        const result = formatStatusOutput({
          ...baseInput,
          worktreeCensus: { total: 3, stale: [] },
        });
        expect(result.worktreeSection).toContain("3 active");
        expect(result.worktreeSection).not.toContain("stale");
      });

      it("shows stale count and details when stale worktrees exist", () => {
        const result = formatStatusOutput({
          ...baseInput,
          worktreeCensus: {
            total: 4,
            stale: [
              {
                path: "/tmp/wt-old",
                branch: "change/oldFeature",
                lastActivity: "10d ago",
              },
            ],
          },
        });
        expect(result.worktreeSection).toContain("4 active");
        expect(result.worktreeSection).toContain("1 stale");
        expect(result.worktreeSection).toContain("change/oldFeature");
        expect(result.worktreeSection).toContain("10d ago");
      });

      it("shows multiple stale worktrees", () => {
        const result = formatStatusOutput({
          ...baseInput,
          worktreeCensus: {
            total: 3,
            stale: [
              {
                path: "/tmp/wt-old",
                branch: "change/oldFeature",
                lastActivity: "10d ago",
              },
              {
                path: "/tmp/wt-older",
                branch: "change/olderFeature",
                lastActivity: "14d ago",
              },
            ],
          },
        });

        expect(result.worktreeSection).toContain("3 active");
        expect(result.worktreeSection).toContain("2 stale");
        expect(result.worktreeSection).toContain("change/oldFeature");
        expect(result.worktreeSection).toContain("change/olderFeature");
      });

      it("shows (none) when total is 0", () => {
        const result = formatStatusOutput({
          ...baseInput,
          worktreeCensus: { total: 0, stale: [] },
        });
        expect(result.worktreeSection).toContain("(none)");
      });
    });

    describe("plugin runtime freshness", () => {
      const baseInput = {
        specCount: 1,
        requirementCount: 1,
        activeChanges: [],
        archivedCount: 0,
        recommendations: [],
        temporalAlive: true,
      };

      it("does NOT add freshness lines when fresh", () => {
        const result = formatStatusOutput({
          ...baseInput,
          pluginRuntime: {
            loaded_module_path: "/p",
            process_started_at: "2026-05-08T12:00:00.000Z",
            build_marker_path: "/p/dist/oca-build.json",
            build_marker_found: false,
            worker_script_path: "/p/dist/temporal/worker.js",
            reload_caveat: "Restart OpenCode after rebuilding Advance",
            dist_index_path: "/p/dist/index.js",
            dist_mtime_iso: "2026-05-08T11:00:00.000Z",
            source_index_path: "/p/src/index.ts",
            source_index_mtime_iso: "2026-05-08T10:00:00.000Z",
            source_dist_freshness: "fresh",
            plugin_checkout_branch: "trunk",
            plugin_checkout_head_sha: "abc123",
            cwd_vs_plugin_root: "match",
            recovery_hint: null,
          },
        });
        expect(result.healthSection).not.toContain("Plugin freshness");
      });

      it("surfaces freshness verdict + recovery hint when source_ahead_of_dist", () => {
        const result = formatStatusOutput({
          ...baseInput,
          pluginRuntime: {
            loaded_module_path: "/p",
            process_started_at: "2026-05-08T12:00:00.000Z",
            build_marker_path: "/p/dist/oca-build.json",
            build_marker_found: false,
            worker_script_path: "/p/dist/temporal/worker.js",
            reload_caveat: "Restart OpenCode after rebuilding Advance",
            dist_index_path: "/p/dist/index.js",
            dist_mtime_iso: "2026-05-08T11:00:00.000Z",
            source_index_path: "/p/src/index.ts",
            source_index_mtime_iso: "2026-05-08T13:00:00.000Z",
            source_dist_freshness: "source_ahead_of_dist",
            plugin_checkout_branch: "change/foo",
            plugin_checkout_head_sha: "def456",
            cwd_vs_plugin_root: "match",
            recovery_hint: {
              action:
                "Source code is newer than built dist. Rebuild before restart.",
              commands: ["pnpm run build", "# then restart OpenCode session"],
              paths: { plugin_root: "/p" },
            },
          },
        });
        expect(result.healthSection).toContain("Plugin freshness");
        expect(result.healthSection).toContain("source_ahead_of_dist");
        expect(result.healthSection).toContain("Rebuild before restart");
        expect(result.healthSection).toContain("pnpm run build");
      });

      it("surfaces verdict + restart hint when dist_ahead_of_process", () => {
        const result = formatStatusOutput({
          ...baseInput,
          pluginRuntime: {
            loaded_module_path: "/p",
            process_started_at: "2026-05-08T11:00:00.000Z",
            build_marker_path: "/p/dist/oca-build.json",
            build_marker_found: false,
            worker_script_path: "/p/dist/temporal/worker.js",
            reload_caveat: "Restart OpenCode after rebuilding Advance",
            dist_index_path: "/p/dist/index.js",
            dist_mtime_iso: "2026-05-08T13:00:00.000Z",
            source_index_path: "/p/src/index.ts",
            source_index_mtime_iso: "2026-05-08T10:00:00.000Z",
            source_dist_freshness: "dist_ahead_of_process",
            plugin_checkout_branch: "trunk",
            plugin_checkout_head_sha: "abc123",
            cwd_vs_plugin_root: "match",
            recovery_hint: {
              action:
                "Dist is newer than the running process. Restart the OpenCode session.",
              commands: ["# restart OpenCode session in: /p"],
              paths: { plugin_root: "/p" },
            },
          },
        });
        expect(result.healthSection).toContain("dist_ahead_of_process");
        expect(result.healthSection).toContain("Restart");
      });

      it("does nothing when pluginRuntime is undefined (backward compat)", () => {
        const result = formatStatusOutput(baseInput);
        expect(result.healthSection).not.toContain("Plugin freshness");
      });
    });
  });

  describe("formatValidationOutput", () => {
    it("formats passed state", () => {
      const result = formatValidationOutput({
        passed: true,
        errors: [],
        warnings: [],
      });
      expect(result.summary).toContain("✓");
      expect(result.nextAction).toContain("proceed");
    });

    it("formats errors and warnings", () => {
      const result = formatValidationOutput({
        passed: false,
        errors: [
          {
            code: "SPEC_NOT_FOUND",
            message: "Missing spec",
            path: "specs/foo",
          },
        ],
        warnings: [{ code: "NO_TASKS", message: "No tasks", path: "tasks" }],
      });
      expect(result.summary).toContain("1");
      expect(result.errorTable).toContain("SPEC_NOT_FOUND");
      expect(result.checklist).toBeDefined();
      expect(result.nextAction).toBeDefined();
    });

    it("handles warnings-only state", () => {
      const result = formatValidationOutput({
        passed: true,
        errors: [],
        warnings: [{ code: "NO_TASKS", message: "No tasks", path: "tasks" }],
      });
      expect(result.summary).toContain("0");
      expect(result.summary).toContain("1");
    });
  });

  describe("formatDoomLoopDiagnostics", () => {
    it("detects doom loop when retries exhausted", () => {
      const result = formatDoomLoopDiagnostics({
        retry_count: 3,
        max_retries: 3,
        last_error: "type error",
        error_class: "SEMANTIC",
        attempts: [
          {
            attempt_number: 1,
            error: "type error",
            strategy_label: "fix types",
            outcome: "failed",
            attempted_at: "2026-01-01T00:00:00Z",
            diagnosis: "",
            fix_tried: "",
          },
          {
            attempt_number: 2,
            error: "type error",
            strategy_label: "refactor",
            outcome: "failed",
            attempted_at: "2026-01-01T00:01:00Z",
            diagnosis: "",
            fix_tried: "",
          },
          {
            attempt_number: 3,
            error: "timeout",
            strategy_label: "retry",
            outcome: "failed",
            attempted_at: "2026-01-01T00:02:00Z",
            diagnosis: "",
            fix_tried: "",
          },
        ],
      });
      expect(result.inDoomLoop).toBe(true);
      expect(result.banner).toContain("[ADV:BLOCKED]");
      expect(result.attemptSummary).toContain("3 attempts");
      expect(result.suggestedAction).toBeDefined();
    });

    it("returns non-doom-loop when retries remain", () => {
      const result = formatDoomLoopDiagnostics({
        retry_count: 1,
        max_retries: 3,
        last_error: "type error",
        error_class: "SEMANTIC",
        attempts: [],
      });
      expect(result.inDoomLoop).toBe(false);
      expect(result.banner).toBe("");
    });

    it("handles null/undefined error_recovery gracefully", () => {
      const result = formatDoomLoopDiagnostics(null);
      expect(result.inDoomLoop).toBe(false);
      expect(result.attemptSummary).toBe("");
    });
  });

  describe("formatSmellReport", () => {
    it("formats requirement smells", () => {
      const result = formatSmellReport([
        {
          type: "subjective",
          text: "easy integration",
          suggestion: "Specify measurable SLA",
        },
        {
          type: "totality",
          text: "handles all errors",
          suggestion: "List specific error types",
        },
      ]);
      expect(result.smellReport).toContain("subjective");
      expect(result.smellReport).toContain("easy integration");
      expect(result.gapChecklist).toContain("2");
      expect(result.nextAction).toBeDefined();
    });

    it("handles empty smells", () => {
      const result = formatSmellReport([]);
      expect(result.smellReport).toContain("No requirement smells");
      expect(result.gapChecklist).toContain("0");
    });
  });
});
