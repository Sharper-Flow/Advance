import { describe, expect, test } from "vitest";
import { formatAdvToolTitle } from "./tool-title";

describe("formatAdvToolTitle", () => {
  test("formats representative ADV tool titles", () => {
    expect(
      formatAdvToolTitle("adv_change_show", { changeId: "addThing" }).title,
    ).toBe("Show change: addThing");
    expect(
      formatAdvToolTitle("adv_task_update", { taskId: "tk-123" }).title,
    ).toBe("Update task: tk-123");
    expect(
      formatAdvToolTitle("adv_gate_complete", { gateId: "planning" }).title,
    ).toBe("Complete gate: planning");
    expect(
      formatAdvToolTitle("adv_run_test", { command: "pnpm test" }).title,
    ).toBe("Run test: pnpm test");
    expect(formatAdvToolTitle("adv_status", {}).title).toBe(
      "Show ADV status",
    );
  });

  test("redacts sensitive values from title metadata", () => {
    const result = formatAdvToolTitle("adv_project_metadata", {
      action: "write",
      key: "scan",
      apiKey: "super-secret",
      nested: { token: "also-secret" },
    });

    expect(result.title).not.toContain("super-secret");
    expect(JSON.stringify(result.metadata)).not.toContain("also-secret");
    expect(JSON.stringify(result.metadata)).toContain("[redacted]");
  });

  test("truncates long opaque values", () => {
    const longCommand = `pnpm test -- ${"x".repeat(120)}`;
    const result = formatAdvToolTitle("adv_run_test", { command: longCommand });

    expect(result.title.length).toBeLessThanOrEqual(96);
    expect(result.title).toContain("…");
  });

  test("uses stable generic titles for weak-key tools", () => {
    expect(formatAdvToolTitle("adv_change_list", {}).title).toBe(
      "List changes",
    );
    expect(formatAdvToolTitle("adv_task_ready", {}).title).toBe(
      "Show ready tasks",
    );
    expect(formatAdvToolTitle("adv_wip_state", {}).title).toBe(
      "Show WIP state",
    );
  });

  test("includes display-only namespaced metadata", () => {
    const result = formatAdvToolTitle("adv_gate_status", {
      changeId: "fixThing",
    });

    expect(result.metadata).toEqual({
      adv: {
        toolName: "adv_gate_status",
        title: "Show gate status: fixThing",
        titleKind: "read",
        changeId: "fixThing",
      },
    });
  });
});
