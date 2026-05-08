import { describe, expect, test } from "vitest";
import { buildCompactionContext } from "./compaction-context";
import type { GateInfo } from "./context-snapshot";

const baseGates = (executionStatus: string): Record<string, GateInfo> => ({
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: executionStatus },
  acceptance: { status: "pending" },
  release: { status: "pending" },
});

const buildContext = (input: {
  tasks: Array<{ id: string; title: string; status: string }>;
  gates?: Record<string, GateInfo>;
}): string =>
  buildCompactionContext({
    change: { id: "staleLedgerChange", title: "Stale ledger change" },
    tasks: input.tasks,
    gates: input.gates,
    specs: [],
    workdir: "/repo",
  });

describe("buildCompactionContext stale-ledger remediation", () => {
  test("emits remediation when execution is incomplete with pending work and no active task after progress", () => {
    const output = buildContext({
      gates: baseGates("pending"),
      tasks: [
        { id: "tk-done", title: "Done task", status: "done" },
        { id: "tk-next", title: "Next task", status: "pending" },
      ],
    });

    expect(output).toContain("ADV STALE LEDGER REMEDIATION");
    expect(output).toContain("adv_change_show");
    expect(output).toContain("include.snapshot=true");
    expect(output).toContain("include.readyTasks=true");
    expect(output).toContain("_readyTasks");
    expect(output).toContain("acceptance");
  });

  test("emits remediation for all-terminal tasks while execution is incomplete", () => {
    const output = buildContext({
      gates: baseGates("pending"),
      tasks: [
        { id: "tk-done", title: "Done task", status: "done" },
        { id: "tk-cancel", title: "Cancelled task", status: "cancelled" },
      ],
    });

    expect(output).toContain("ADV STALE LEDGER REMEDIATION");
  });

  test("does not emit remediation when an active task is present", () => {
    const output = buildContext({
      gates: baseGates("pending"),
      tasks: [{ id: "tk-active", title: "Active task", status: "in_progress" }],
    });

    expect(output).toContain("Current: tk-active");
    expect(output).not.toContain("ADV STALE LEDGER REMEDIATION");
  });

  test("does not emit remediation for a fresh pending-only plan", () => {
    const output = buildContext({
      gates: baseGates("pending"),
      tasks: [{ id: "tk-new", title: "New task", status: "pending" }],
    });

    expect(output).not.toContain("ADV STALE LEDGER REMEDIATION");
  });

  test("does not emit remediation when execution is already done", () => {
    const output = buildContext({
      gates: baseGates("done"),
      tasks: [{ id: "tk-done", title: "Done task", status: "done" }],
    });

    expect(output).not.toContain("ADV STALE LEDGER REMEDIATION");
  });

  test("does not emit remediation without gate data", () => {
    const output = buildContext({
      tasks: [
        { id: "tk-done", title: "Done task", status: "done" },
        { id: "tk-next", title: "Next task", status: "pending" },
      ],
    });

    expect(output).not.toContain("ADV STALE LEDGER REMEDIATION");
  });
});
