/**
 * adv_change_show enrichment output-shape and best-effort integration.
 *
 * Verifies that degraded/best-effort clarify and external-dependency enrichment
 * preserves the core disk-authoritative change output shape and never issues
 * Temporal workflow queries, signals, or disk writes on the read path.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Store } from "../storage/store";
import type { Change } from "../types";

const mocks = vi.hoisted(() => {
  return {
    getService: vi.fn(() => ({})),
    querySignal: vi.fn(),
    fireSignal: vi.fn(),
    fireSignalAndRefresh: vi.fn(),
    getChangeHandle: vi.fn(() => ({ query: vi.fn() })),
    waitForGateCompletion: vi.fn(),
    getProjectId: vi.fn(async () => "test-project-id"),
    listActiveEpicProjections: vi.fn(async () => ({ success: true, data: [] })),
    listRetiredEpicProjections: vi.fn(async () => ({
      success: true,
      data: [],
    })),
    validateCrossRepoTarget: vi.fn(async () => ({ ok: true }) as const),
    runClarifyReadinessChecks: vi.fn(() => ({ findings: [] })),
  };
});

vi.mock("../validator/clarify-readiness", () => ({
  runClarifyReadinessChecks: mocks.runClarifyReadinessChecks,
}));

vi.mock("../storage/store-disk", () => ({
  createDiskStore: vi.fn(async () => {
    const store = {
      close: vi.fn(),
      changes: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            id: "target-change",
            title: "Target Change",
            status: "active",
            gates: {
              proposal: { status: "done" },
              discovery: { status: "done" },
              design: { status: "done" },
              planning: { status: "done" },
              execution: { status: "done" },
              acceptance: { status: "done" },
              release: { status: "done" },
            },
            tasks: [],
          },
        })),
      },
    };
    return store;
  }),
}));

vi.mock("../storage/epic-projection-reader", () => ({
  listActiveEpicProjections: mocks.listActiveEpicProjections,
  listRetiredEpicProjections: mocks.listRetiredEpicProjections,
}));

import { changeTools } from "./change";

function createMockStore(changeOverride: Partial<Change> = {}): Store {
  const change: Change = {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "done" },
      release: { status: "pending" },
    },
    artifacts: {},
    external_dependencies: [],
    ...changeOverride,
  } as Change;

  return {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
      archive: "/tmp/test/.adv/archive",
      activeEpics: "/tmp/test/.adv/active-epics",
      retiredEpics: "/tmp/test/.adv/retired-epics",
    } as Store["paths"],
    config: {
      features: { clarify_enforcement: "advisory" },
    },
    productContext: { repoProjectId: "test-project-id" },
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(async () => ({ specs: [] })),
      get: vi.fn(async () => ({ success: false, error: "not found" })),
    } as unknown as Store["specs"],
    changes: {
      list: vi.fn(async () => ({ changes: [] })),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
      invalidate: vi.fn(),
    } as Store["changes"],
    tasks: {
      ready: vi.fn(async () => ({ ready: [], blocked: [] })),
    } as unknown as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => change.gates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
    epics: {
      create: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: null })),
      list: vi.fn(async () => []),
      update: vi.fn(),
      addShell: vi.fn(),
      promoteShell: vi.fn(),
      linkChange: vi.fn(),
      unlinkChange: vi.fn(),
      reorder: vi.fn(),
    },
  } as unknown as Store;
}

function assertNoWorkflowCalls(store: Store) {
  expect(mocks.getChangeHandle).not.toHaveBeenCalled();
  expect(mocks.querySignal).not.toHaveBeenCalled();
  expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  expect(mocks.fireSignal).not.toHaveBeenCalled();
  expect(store.changes.save).not.toHaveBeenCalled();
}

describe("adv_change_show enrichment best-effort integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runClarifyReadinessChecks.mockReturnValue({ findings: [] });
  });

  test("preserves core change shape and includes degraded external-dependency status", async () => {
    const store = createMockStore({
      external_dependencies: [
        {
          target_path: "/repo/other",
          changeId: "other-change",
          relationship: "follow_up",
          advisory: true,
          taskId: "missing-task",
        },
      ],
    });

    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe("test-change");
    expect(parsed.title).toBe("Test Change");
    expect(parsed.status).toBe("active");
    expect(parsed._externalDependencyStatus).toMatchObject({
      summary: {
        total: 1,
        satisfied: 0,
        warning: 1,
        blocking: 0,
        advisoryOnly: true,
      },
    });
    expect(parsed._externalDependencyStatus.dependencies[0].status).toBe(
      "warning",
    );
    assertNoWorkflowCalls(store);
  });

  test("surfaces clarify findings on the read path without persisting", async () => {
    mocks.runClarifyReadinessChecks.mockReturnValue({
      findings: [
        {
          code: "missing-acceptance",
          severity: "warning",
          message: "Acceptance criteria are missing.",
          details: { questionCategory: "scope" },
        },
      ],
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.clarifyFindings).toMatchObject({
      count: 1,
      findings: [
        {
          code: "missing-acceptance",
          severity: "warning",
          message: "Acceptance criteria are missing.",
          questionCategory: "scope",
        },
      ],
    });
    expect(store.changes.save).not.toHaveBeenCalled();
    assertNoWorkflowCalls(store);
  });

  // KD2 (AC2): the projection is the live artifact authority. Presence must be
  // derived from `change.documents`, not from a disk `problem-statement.md`
  // that is no longer materialized in the active change directory. The
  // response must also not advertise a markdown artifact path (AC1).
  test("reports problem-statement presence from the projection without advertising a markdown path", async () => {
    const store = createMockStore({
      documents: { problemStatement: "Confirmed problem statement text." },
    } as Partial<Change>);

    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.problemStatementExists).toBe(true);
    expect(parsed.problemStatementPath).toBeUndefined();
    assertNoWorkflowCalls(store);
  });

  test("reports problem-statement absence when no source carries content", async () => {
    const store = createMockStore();

    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.problemStatementExists).toBe(false);
    expect(parsed.problemStatementPath).toBeUndefined();
  });

  test("surfaces Epic membership verification on projection, snapshot, and briefing reads", async () => {
    mocks.listActiveEpicProjections.mockResolvedValue({
      success: true,
      data: [
        {
          id: "epic-test",
          entries: [],
        },
      ],
    });
    mocks.listRetiredEpicProjections.mockResolvedValue({
      success: true,
      data: [],
    });
    const store = createMockStore({
      epic_membership: {
        epic_id: "epic-test",
        entry_id: "entry-missing",
        order: 0,
        title: "Test membership",
        linked_at: "2026-01-01T00:00:00Z",
      },
    });

    const result = await changeTools.adv_change_show.execute(
      {
        changeId: "test-change",
        include: { snapshot: true, briefingPacket: true },
      },
      store,
    );
    const parsed = JSON.parse(result);
    const epicSection = parsed._briefingPacket.sections.find(
      (section: { kind: string }) => section.kind === "epic_context",
    );

    expect(parsed.epic_membership_verification).toBe("entry_missing");
    expect(parsed._contextSnapshot).toContain("entry_missing");
    expect(parsed._contextSnapshot).toMatch(/reconcile/i);
    expect(epicSection.content).toMatchObject({
      verification: "entry_missing",
      reconcile: "adv-store-reconcile",
    });
    assertNoWorkflowCalls(store);
  });
});
