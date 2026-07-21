import { describe, expect, it, vi } from "vitest";
import type { Change } from "../types";
import type { Store } from "./store";
import {
  RESUME_FRESHNESS_TRIGGER_MINUTES,
  resolveArchivedSinceDuplicates,
  resolveCodebaseDrift,
  resolveResumeFreshness,
  resolveSiblingOverlap,
} from "./resume-freshness-resolver";

/** Build a minimal Change fixture. */
function buildChange(
  overrides: Partial<Change> & Record<string, unknown> = {},
): Change {
  return {
    id: "testChange",
    title: "Test change",
    status: "draft",
    created_at: "2026-07-21T00:00:00.000Z",
    ...overrides,
  } as Change;
}

/** Build a mock Store with given changes. Mock list() returns ChangeListResponse shape ({changes: [...]}). */
function buildStore(changes: Change[]): Store {
  const byId = new Map(changes.map((c) => [c.id, c]));
  const listResponse = {
    changes: changes.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      currentGate: "proposal" as const,
      created_at: c.created_at,
      lastActivityAt:
        (c as unknown as { lastActivityAt?: string }).lastActivityAt ??
        c.created_at,
      taskCount: ((c as unknown as { tasks?: unknown[] }).tasks ?? []).length,
      completedTasks: 0,
    })),
  };
  return {
    paths: { root: "/tmp/fake-workdir" },
    changes: {
      get: vi.fn(async (id: string) => {
        const data = byId.get(id);
        return data ? { success: true, data } : { success: false };
      }),
      list: vi.fn(async () => listResponse),
    },
  } as unknown as Store;
}

describe("resolveSiblingOverlap", () => {
  it("emits repo_backed_fact when sibling shares both capability AND paths", async () => {
    const target = buildChange({
      id: "target",
      deltas: { "advance-workflow": [] },
      tasks: [{ touched_files: ["src/foo.ts"] } as never],
    });
    const sibling = buildChange({
      id: "sibling1",
      deltas: { "advance-workflow": [] },
      tasks: [{ touched_files: ["src/foo.ts"] } as never],
      lastActivityAt: "2026-07-21T01:00:00.000Z",
    });
    const store = buildStore([target, sibling]);

    const findings = await resolveSiblingOverlap(store, "target", {
      capabilities: ["advance-workflow"],
      touchedFiles: ["src/foo.ts"],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("resume:sibling_overlap");
    expect(findings[0].label).toBe("repo_backed_fact");
    expect(findings[0].evidenceChangeIds).toEqual(["sibling1"]);
  });

  it("emits judgment_call when sibling shares capability only", async () => {
    const sibling = buildChange({
      id: "siblingCap",
      deltas: { "advance-workflow": [] },
      tasks: [{ touched_files: ["src/other.ts"] } as never],
      lastActivityAt: "2026-07-21T01:00:00.000Z",
    });
    const store = buildStore([sibling]);

    const findings = await resolveSiblingOverlap(store, "target", {
      capabilities: ["advance-workflow"],
      touchedFiles: ["src/foo.ts"],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].label).toBe("judgment_call");
  });

  it("emits no finding when sibling has no overlap", async () => {
    const sibling = buildChange({
      id: "siblingNone",
      deltas: { "other-capability": [] },
      tasks: [{ touched_files: ["src/other.ts"] } as never],
      lastActivityAt: "2026-07-21T01:00:00.000Z",
    });
    const store = buildStore([sibling]);

    const findings = await resolveSiblingOverlap(store, "target", {
      capabilities: ["advance-workflow"],
      touchedFiles: ["src/foo.ts"],
    });

    expect(findings).toEqual([]);
  });

  it("excludes self and archived/closed changes", async () => {
    const self = buildChange({ id: "target", status: "draft" });
    const archived = buildChange({
      id: "archived1",
      status: "archived",
      deltas: { "advance-workflow": [] },
      lastActivityAt: "2026-07-21T01:00:00.000Z",
    });
    const closed = buildChange({
      id: "closed1",
      status: "closed",
      deltas: { "advance-workflow": [] },
      lastActivityAt: "2026-07-21T01:00:00.000Z",
    });
    const store = buildStore([self, archived, closed]);

    const findings = await resolveSiblingOverlap(store, "target", {
      capabilities: ["advance-workflow"],
      touchedFiles: [],
    });

    expect(findings).toEqual([]);
  });

  it("returns freshness_limited when store.changes.list throws", async () => {
    const store = {
      changes: { list: vi.fn(async () => Promise.reject(new Error("nope"))) },
    } as unknown as Store;

    const findings = await resolveSiblingOverlap(store, "target", {
      capabilities: [],
      touchedFiles: [],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].label).toBe("freshness_limited");
  });
});

describe("resolveArchivedSinceDuplicates", () => {
  it("emits repo_backed_fact when archived change has cap+≥3 path overlap", async () => {
    const target = buildChange({ id: "target" });
    const archived = buildChange({
      id: "archived1",
      status: "archived",
      deltas: { "advance-workflow": [] },
      tasks: [
        {
          touched_files: ["a.ts", "b.ts", "c.ts", "d.ts"],
        } as never,
      ],
      lastActivityAt: "2026-07-21T02:00:00.000Z",
    });
    const store = buildStore([target, archived]);

    const findings = await resolveArchivedSinceDuplicates(
      store,
      "target",
      "2026-07-21T01:00:00.000Z",
      {
        capabilities: ["advance-workflow"],
        touchedFiles: ["a.ts", "b.ts", "c.ts"],
      },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("resume:archived_duplicate");
    expect(findings[0].label).toBe("repo_backed_fact");
  });

  it("skips archived changes shipped before lastActivityAt", async () => {
    const archived = buildChange({
      id: "oldArchive",
      status: "archived",
      deltas: { "advance-workflow": [] },
      lastActivityAt: "2026-07-21T00:00:00.000Z", // before target's lastActivity
    });
    const store = buildStore([archived]);

    const findings = await resolveArchivedSinceDuplicates(
      store,
      "target",
      "2026-07-21T01:00:00.000Z",
      {
        capabilities: ["advance-workflow"],
        touchedFiles: ["a.ts", "b.ts", "c.ts"],
      },
    );

    expect(findings).toEqual([]);
  });

  it("skips fast-follow parent", async () => {
    const target = buildChange({
      id: "child",
      fast_follow_of: { parent_change_id: "parent" },
    });
    const parent = buildChange({
      id: "parent",
      status: "archived",
      deltas: { "advance-workflow": [] },
      tasks: [{ touched_files: ["a.ts", "b.ts", "c.ts"] } as never],
      lastActivityAt: "2026-07-21T02:00:00.000Z",
    });
    const store = buildStore([target, parent]);

    const findings = await resolveArchivedSinceDuplicates(
      store,
      "child",
      "2026-07-21T01:00:00.000Z",
      {
        capabilities: ["advance-workflow"],
        touchedFiles: ["a.ts", "b.ts", "c.ts"],
      },
    );

    expect(findings).toEqual([]);
  });
});

describe("resolveCodebaseDrift", () => {
  it("returns no findings when touchedFiles is empty", async () => {
    const findings = await resolveCodebaseDrift(
      "/tmp",
      "2026-07-21T00:00:00.000Z",
      [],
    );
    expect(findings).toEqual([]);
  });
});

describe("resolveResumeFreshness entrypoint", () => {
  it("skips entirely when lastActivityAgeMinutes <= trigger band", async () => {
    const store = buildStore([]);
    const result = await resolveResumeFreshness(store, "target", {
      lastActivityAgeMinutes: RESUME_FRESHNESS_TRIGGER_MINUTES,
      lastActivityAt: "2026-07-21T00:00:00.000Z",
    });

    expect(result.skipped).toBe(true);
    expect(result.findings).toEqual([]);
    // Verify sub-resolvers NOT called (store.changes.list spy)
    expect(
      (store.changes.list as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);
  });

  it("returns freshness_limited when target change unreadable", async () => {
    const store = buildStore([]); // empty store — get returns success:false
    const result = await resolveResumeFreshness(store, "missing", {
      lastActivityAgeMinutes: 120,
      lastActivityAt: "2026-07-21T00:00:00.000Z",
    });

    expect(result.skipped).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].code).toBe("resume:freshness_limited");
  });

  it("runs sub-resolvers when stale and target readable", async () => {
    const target = buildChange({
      id: "target",
      deltas: { "advance-workflow": [] },
      tasks: [{ touched_files: ["src/foo.ts"] } as never],
    });
    const store = buildStore([target]);

    const result = await resolveResumeFreshness(store, "target", {
      lastActivityAgeMinutes: 120,
      lastActivityAt: "2026-07-21T00:00:00.000Z",
    });

    expect(result.skipped).toBe(false);
    // sibling-overlap may emit findings or not (store has no siblings),
    // codebase-drift will likely emit freshness_limited (no real git repo at /tmp)
    expect(Array.isArray(result.findings)).toBe(true);
  });
});
