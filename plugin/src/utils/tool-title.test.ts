import { describe, expect, test } from "vitest";
import { formatAdvToolTitle, hasExplicitAdvToolTitle } from "./tool-title";

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
    expect(formatAdvToolTitle("adv_status", {}).title).toBe("Show ADV status");
  });

  test("redacts sensitive values from title strings", () => {
    const result = formatAdvToolTitle("adv_run_test", {
      command: "FOO_TOKEN=super-secret pnpm test -- --password=also-secret",
    });

    expect(result.title).not.toContain("super-secret");
    expect(result.title).not.toContain("also-secret");
    expect(result.title).toContain("[redacted]");
    expect(JSON.stringify(result.metadata)).not.toContain("super-secret");
  });

  test("strips terminal control sequences from title strings", () => {
    const result = formatAdvToolTitle("adv_change_create", {
      summary:
        "Add \u001b]8;;https://evil.example\u0007hidden\u001b]8;;\u0007 title",
    });

    expect(result.title).not.toContain("\u001b");
    expect(result.title).not.toContain("\u0007");
    expect(result.title).not.toContain("https://evil.example");
  });

  test("distinguishes explicit coverage from fallback titles", () => {
    expect(hasExplicitAdvToolTitle("adv_change_show")).toBe(true);
    expect(hasExplicitAdvToolTitle("adv_future_tool")).toBe(false);
    expect(formatAdvToolTitle("adv_future_tool", {}).title).toBe("Future tool");
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
