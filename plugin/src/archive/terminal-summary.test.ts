import { describe, expect, test } from "vitest";
import {
  buildTerminalArchiveSummary,
  serializeTerminalArchiveSummary,
  sha256HexString,
  TerminalArchiveSummarySchema,
  validateTerminalArchiveSummary,
  verifyTerminalArchiveSummaryHash,
} from "./terminal-summary";
import type { Change } from "../types";

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "terminal-summary-change",
    title: "Terminal summary change",
    status: "archived",
    created_at: "2026-05-08T00:00:00.000Z",
    tasks: [
      {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "done",
        priority: 0,
        created_at: "2026-05-08T00:00:00.000Z",
      },
      {
        id: "tk-2",
        title: "Task two",
        type: "code",
        status: "pending",
        priority: 1,
        created_at: "2026-05-08T00:00:00.000Z",
      },
    ],
    deltas: {
      capabilityA: [
        {
          id: "delta-1",
          operation: "add",
          requirement: { id: "REQ-1", title: "Req", capability: "capabilityA" },
        },
      ],
      capabilityB: [
        {
          id: "delta-2",
          operation: "modify",
          requirement: { id: "REQ-2", title: "Req", capability: "capabilityB" },
          target: { id: "REQ-2", title: "Req", capability: "capabilityB" },
        },
      ],
    },
    gates: {
      proposal: { status: "done", completed_at: "2026-05-08T01:00:00.000Z" },
      discovery: { status: "done", completed_at: "2026-05-08T02:00:00.000Z" },
      design: { status: "done", completed_at: "2026-05-08T03:00:00.000Z" },
      planning: { status: "done", completed_at: "2026-05-08T04:00:00.000Z" },
      execution: { status: "done", completed_at: "2026-05-08T05:00:00.000Z" },
      acceptance: { status: "done", completed_at: "2026-05-08T06:00:00.000Z" },
      release: { status: "done", completed_at: "2026-05-08T07:00:00.000Z" },
    },
    ...overrides,
  } as Change;
}

describe("buildTerminalArchiveSummary", () => {
  test("produces a lightweight, versioned summary from a validated Change", () => {
    const change = makeChange();
    const summary = buildTerminalArchiveSummary({
      change,
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });

    expect(summary.version).toBe("1");
    expect(summary.change_id).toBe("terminal-summary-change");
    expect(summary.title).toBe("Terminal summary change");
    expect(summary.status).toBe("archived");
    expect(summary.created_at).toBe("2026-05-08T00:00:00.000Z");
    expect(summary.archived_at).toBe("2026-07-18T12:00:00.000Z");
    expect(summary.current_gate).toBe("done");
    expect(summary.task_count).toBe(2);
    expect(summary.completed_tasks).toBe(1);
    expect(summary.capabilities).toEqual(["capabilityA", "capabilityB"]);
    expect(summary.change_hash).toBe("abc123");
    expect(summary.summary_hash).toBe("");
    expect(summary.last_activity_at).toBe("2026-05-08T07:00:00.000Z");
  });

  test("derives the first open gate when not all gates are done", () => {
    const change = makeChange({
      gates: {
        proposal: { status: "done", completed_at: "2026-05-08T01:00:00.000Z" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      },
    });
    const summary = buildTerminalArchiveSummary({
      change,
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    expect(summary.current_gate).toBe("discovery");
  });

  test("passes through optional relational fields", () => {
    const change = makeChange({
      fast_follow_of: {
        parent_change_id: "parent-1",
        followup_ref: "fu-1",
      },
      epic_membership: {
        epic_id: "epic-1",
        entry_id: "entry-1",
        order: 0,
        title: "Epic title",
        linked_at: "2026-05-08T00:00:00.000Z",
      },
    });
    const summary = buildTerminalArchiveSummary({
      change,
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    expect(summary.fast_follow_of).toEqual({
      parent_change_id: "parent-1",
      followup_ref: "fu-1",
    });
    expect(summary.epic_membership).toMatchObject({ epic_id: "epic-1" });
  });
});

describe("serializeTerminalArchiveSummary", () => {
  test("emits versioned JSON with a trailing newline and populated hash", () => {
    const summary = buildTerminalArchiveSummary({
      change: makeChange(),
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    const serialized = serializeTerminalArchiveSummary(summary);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
    const parsed = JSON.parse(serialized);
    expect(parsed.version).toBe("1");
    expect(parsed.change_id).toBe("terminal-summary-change");
    expect(parsed.summary_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.change_hash).toBe("abc123");
  });

  test("produces deterministic output for identical inputs", () => {
    const summary = buildTerminalArchiveSummary({
      change: makeChange(),
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    const first = serializeTerminalArchiveSummary(summary);
    const second = serializeTerminalArchiveSummary(
      JSON.parse(first) as ReturnType<typeof buildTerminalArchiveSummary>,
    );
    expect(second).toBe(first);
  });

  test("sorts keys lexicographically", () => {
    const summary = buildTerminalArchiveSummary({
      change: makeChange(),
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    const serialized = serializeTerminalArchiveSummary(summary);
    const firstLine = serialized.split("\n")[1];
    expect(firstLine).toBe('  "archived_at": "2026-07-18T12:00:00.000Z",');
  });
});

describe("TerminalArchiveSummarySchema", () => {
  test("accepts a valid summary", () => {
    const summary = buildTerminalArchiveSummary({
      change: makeChange(),
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    expect(() => TerminalArchiveSummarySchema.parse(summary)).not.toThrow();
  });

  test("rejects an unsupported version", () => {
    const summary = buildTerminalArchiveSummary({
      change: makeChange(),
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    expect(() =>
      TerminalArchiveSummarySchema.parse({ ...summary, version: "2" }),
    ).toThrow();
  });

  test("rejects a non-terminal status", () => {
    const summary = buildTerminalArchiveSummary({
      change: makeChange(),
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    expect(() =>
      TerminalArchiveSummarySchema.parse({ ...summary, status: "draft" }),
    ).toThrow();
  });
});

describe("verifyTerminalArchiveSummaryHash", () => {
  test("returns true for a freshly serialized summary", () => {
    const summary = buildTerminalArchiveSummary({
      change: makeChange(),
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    const serialized = serializeTerminalArchiveSummary(summary);
    const parsed = validateTerminalArchiveSummary(JSON.parse(serialized));
    expect(verifyTerminalArchiveSummaryHash(parsed)).toBe(true);
  });

  test("returns false when the summary has been tampered with", () => {
    const summary = buildTerminalArchiveSummary({
      change: makeChange(),
      archivedAt: "2026-07-18T12:00:00.000Z",
      changeHash: "abc123",
    });
    const serialized = serializeTerminalArchiveSummary(summary);
    const parsed = validateTerminalArchiveSummary(JSON.parse(serialized));
    parsed.title = "Tampered";
    expect(verifyTerminalArchiveSummaryHash(parsed)).toBe(false);
  });
});

describe("sha256HexString", () => {
  test("produces a 64-character hex digest", () => {
    const hash = sha256HexString("hello");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
