import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveRecoveredArtifactMetadata,
  saveRecoveredChangeStatus,
  saveRecoveredDesignConcernDisposition,
  saveRecoveredGateCompletion,
  saveRecoveredSubagentReport,
  saveRecoveredTaskAdd,
  saveRecoveredTaskMutation,
} from "./_recovery-writers";
import type { Change } from "../types";

vi.mock("../storage/json", () => ({
  saveChange: vi.fn(async (_changesDir: string, _change: Change) => undefined),
}));

import { saveChange as mockedSaveChange } from "../storage/json";

function createMockStore(): { store: any; saveCalls: Change[] } {
  const saveCalls: Change[] = [];
  const store: any = {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
    },
    changes: {
      save: vi.fn(async (change: Change) => {
        saveCalls.push(change);
      }),
      refresh: vi.fn(async () => undefined),
    },
  };
  return { store, saveCalls };
}

function baseChange(): Change {
  return {
    id: "test-change",
    title: "Test",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: [
      {
        id: "tk-1",
        title: "First task",
        type: "code",
        section: "Implementation",
        status: "pending",
        priority: 0,
        created_at: "2026-01-01T00:00:00Z",
      } as Change["tasks"][number],
    ],
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
  } as Change;
}

describe("saveRecoveredTaskMutation", () => {
  it("mutates an existing task and persists the updated change", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();

    const updated = await saveRecoveredTaskMutation({
      store,
      change,
      taskId: "tk-1",
      mutate: (task) => ({ ...task, status: "done" }),
    });

    expect(updated.tasks[0].status).toBe("done");
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].tasks[0].status).toBe("done");
    expect(store.changes.refresh).toHaveBeenCalledWith("test-change");
  });

  it("throws when the task is not present", async () => {
    const { store } = createMockStore();
    const change = baseChange();

    await expect(
      saveRecoveredTaskMutation({
        store,
        change,
        taskId: "tk-missing",
        mutate: (task) => task,
      }),
    ).rejects.toThrow(/not present in change/);
  });
});

describe("saveRecoveredTaskAdd", () => {
  it("appends a new task and persists", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();
    const newTask = {
      id: "tk-2",
      title: "Second",
      type: "code",
      section: "Implementation",
      status: "pending",
      priority: 1,
      created_at: "2026-01-02T00:00:00Z",
    } as Change["tasks"][number];

    const updated = await saveRecoveredTaskAdd({
      store,
      change,
      task: newTask,
    });

    expect(updated.tasks).toHaveLength(2);
    expect(updated.tasks[1].id).toBe("tk-2");
    expect(saveCalls).toHaveLength(1);
  });

  it("rejects duplicate task IDs", async () => {
    const { store } = createMockStore();
    const change = baseChange();
    await expect(
      saveRecoveredTaskAdd({
        store,
        change,
        task: { ...change.tasks[0] },
      }),
    ).rejects.toThrow(/already present/);
  });
});

describe("saveRecoveredGateCompletion", () => {
  it("replaces gate completion fields through disk-direct saveChange", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const updated = await saveRecoveredGateCompletion({
      store,
      change,
      authorization: {
        reason: "completed_workflow_release_gate_recovery",
        evidence: "WorkflowNotFoundError: workflow execution already completed",
      },
      gateId: "release",
      completion: {
        status: "done",
        completed_at: "2026-05-22T00:00:00Z",
        completed_by: "user:jon",
        approval_evidence: "recovery",
      },
    });

    expect(updated.gates?.release?.status).toBe("done");
    expect(updated.gates?.release?.completed_by).toBe("user:jon");
    expect(updated.gates?.release?.recovery_audit).toMatchObject({
      reason: "completed_workflow_release_gate_recovery",
      evidence: "WorkflowNotFoundError: workflow execution already completed",
    });
    expect(updated.gates?.release?.recovery_audit?.recovered_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(saveCalls).toHaveLength(0);
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mockedSaveChange).toHaveBeenCalledWith(
      "/tmp/test/.adv/changes",
      expect.objectContaining({
        gates: expect.objectContaining({
          release: expect.objectContaining({
            status: "done",
            recovery_audit: expect.objectContaining({
              reason: "completed_workflow_release_gate_recovery",
            }),
          }),
        }),
      }),
    );
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  it("requires recovery authorization for disk-direct gate writes", async () => {
    const { store } = createMockStore();
    const change = baseChange();

    await expect(
      saveRecoveredGateCompletion({
        store,
        change,
        gateId: "release",
        completion: { status: "done" },
      } as any),
    ).rejects.toThrow(/recovery authorization/);
  });
});

describe("saveRecoveredArtifactMetadata", () => {
  it("repairs artifact metadata through disk-direct saveChange", async () => {
    const { store } = createMockStore();
    const change = baseChange();
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const updated = await saveRecoveredArtifactMetadata({
      store,
      change,
      authorization: {
        reason: "completed_workflow_artifact_metadata_recovery",
        evidence: "WorkflowExecutionAlreadyCompleted",
      },
      kind: "executiveSummary",
      metadata: {
        path: "/tmp/test/.adv/changes/test-change/executive-summary.md",
        updatedAt: "2026-05-22T00:00:00Z",
        contentHash: "a".repeat(64),
      },
    });

    expect(updated.artifacts?.executiveSummary).toMatchObject({
      contentHash: "a".repeat(64),
    });
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mockedSaveChange).toHaveBeenCalledWith(
      "/tmp/test/.adv/changes",
      expect.objectContaining({
        artifacts: expect.objectContaining({
          executiveSummary: expect.objectContaining({
            contentHash: "a".repeat(64),
          }),
        }),
      }),
    );
  });

  it("requires recovery authorization for artifact metadata recovery", async () => {
    const { store } = createMockStore();
    await expect(
      saveRecoveredArtifactMetadata({
        store,
        change: baseChange(),
        kind: "executiveSummary",
        metadata: {
          path: "/tmp/executive-summary.md",
          updatedAt: "2026-05-22T00:00:00Z",
          contentHash: "a".repeat(64),
        },
      } as any),
    ).rejects.toThrow(/recovery authorization/);
  });
});

describe("saveRecoveredChangeStatus", () => {
  it("transitions status via disk-direct saveChange (bypasses store.changes.save)", async () => {
    const { store, saveCalls } = createMockStore();
    const change = baseChange();
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const updated = await saveRecoveredChangeStatus({
      store,
      change,
      authorization: {
        reason: "poisoned_history_status_recovery",
        evidence: "TMPRL1100 nondeterministic workflow history",
      },
      status: "archived",
    });

    // rq-fix-archive-recovery-disk-write AC1: store.changes.save is NOT
    // called because it would invoke archiveChangeSignal on a poisoned
    // workflow.
    expect(updated.status).toBe("archived");
    expect(saveCalls).toHaveLength(0);
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mockedSaveChange).toHaveBeenCalledWith(
      "/tmp/test/.adv/changes",
      expect.objectContaining({ status: "archived" }),
    );
  });

  it("does not refresh stale workflow state back over the disk repair", async () => {
    const { store } = createMockStore();
    const change = baseChange();
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    await saveRecoveredChangeStatus({
      store,
      change,
      authorization: {
        reason: "operator_status_repair",
        evidence: "WorkflowNotFoundError + operator approved",
      },
      status: "archived",
    });

    // store.changes.refresh() re-queries Temporal for the temporal store. A
    // wedged release workflow can still return stale draft state, so status
    // repair must not call it after writing the disk projection.
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  it("requires recovery authorization for disk-direct status writes", async () => {
    const { store } = createMockStore();
    const change = baseChange();

    await expect(
      saveRecoveredChangeStatus({
        store,
        change,
        status: "archived",
      } as any),
    ).rejects.toThrow(/recovery authorization/);
  });
});

describe("saveRecoveredDesignConcernDisposition", () => {
  it("records latest-wins disposition through disk-direct saveChange", async () => {
    const { store, saveCalls } = createMockStore();
    const change = {
      ...baseChange(),
      design_concern_dispositions: [
        {
          taskId: "tk-1",
          concernKey: "neighbor:0",
          disposition: "fast_follow",
          evidence: "old follow-up",
          dispositionedAt: "2026-05-21T00:00:00Z",
        },
      ],
    } as Change;
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const updated = await saveRecoveredDesignConcernDisposition({
      store,
      change,
      authorization: {
        reason: "completed_workflow_design_concern_recovery",
        evidence: "WorkflowNotFoundError: workflow execution already completed",
      },
      disposition: {
        taskId: "tk-1",
        concernKey: "neighbor:0",
        disposition: "fixed",
        evidence: "fixed in commit abc123",
        dispositionedAt: "2026-05-22T00:00:00Z",
      },
    });

    expect(updated.design_concern_dispositions).toHaveLength(1);
    expect(updated.design_concern_dispositions?.[0]).toMatchObject({
      taskId: "tk-1",
      concernKey: "neighbor:0",
      disposition: "fixed",
      evidence: "fixed in commit abc123",
      recovery_audit: expect.objectContaining({
        reason: "completed_workflow_design_concern_recovery",
      }),
    });
    expect(saveCalls).toHaveLength(0);
    expect(store.changes.save).not.toHaveBeenCalled();
    expect(mockedSaveChange).toHaveBeenCalledWith(
      "/tmp/test/.adv/changes",
      expect.objectContaining({
        design_concern_dispositions: [
          expect.objectContaining({
            taskId: "tk-1",
            concernKey: "neighbor:0",
            disposition: "fixed",
          }),
        ],
      }),
    );
  });

  it("requires recovery authorization for design concern recovery", async () => {
    const { store } = createMockStore();
    await expect(
      saveRecoveredDesignConcernDisposition({
        store,
        change: baseChange(),
        disposition: {
          taskId: "tk-1",
          concernKey: "neighbor:0",
          disposition: "fixed",
          evidence: "fixed",
          dispositionedAt: "2026-05-22T00:00:00Z",
        },
      } as any),
    ).rejects.toThrow(/recovery authorization/);
  });
});

function changeScopedReport(changeId: string, attempt = 1): any {
  return {
    schema_version: "1.0",
    change_id: changeId,
    attempt,
    workdir_used: "/tmp/work",
    scope: { kind: "change", scope_key: "review:acceptance" },
    agent: "adv-reviewer",
    phase: "review",
    verdict: "READY",
    blocking_findings: [],
    nonblocking_findings: [],
    changes_made: [],
    wisdom_candidates: [],
    verification: { tests_run: [], results: "n/a", evidence: "none" },
    scope_drift: null,
    risks: [],
    required_main_agent_actions: [],
  };
}

describe("saveRecoveredSubagentReport", () => {
  it("appends a report to the ARCHIVE BUNDLE change.json for an archived change", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-arch-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    const change: Change = {
      ...baseChange(),
      id: "test-change",
      status: "archived",
      subagent_reports: [],
    } as Change;
    await writeFile(
      join(bundleDir, "change.json"),
      JSON.stringify(change, null, 2),
    );

    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const report = changeScopedReport("test-change");
    const updated = await saveRecoveredSubagentReport({
      store,
      change,
      report,
      authorization: {
        reason: "post_archive_report_persist",
        evidence: "workflow execution already completed",
      },
    });

    // Report appended in-memory
    expect(updated.subagent_reports).toHaveLength(1);
    expect(updated.subagent_reports?.[0]).toMatchObject({
      agent: "adv-reviewer",
      recovery_audit: expect.objectContaining({
        persisted_via: "archive-sidecar",
        reason: "post_archive_report_persist",
      }),
    });

    // Persisted to the ARCHIVE BUNDLE change.json (not active dir)
    const persisted = JSON.parse(
      await readFile(join(bundleDir, "change.json"), "utf-8"),
    );
    expect(persisted.subagent_reports).toHaveLength(1);
    expect(persisted.subagent_reports[0].agent).toBe("adv-reviewer");
    expect(persisted.subagent_reports[0].recovery_audit.persisted_via).toBe(
      "archive-sidecar",
    );

    // Archive-sidecar change.json ends with exactly one trailing newline (AC3/SC2)
    const rawBundleChange = await readFile(
      join(bundleDir, "change.json"),
      "utf-8",
    );
    expect(rawBundleChange.endsWith("\n")).toBe(true);
    expect(rawBundleChange.endsWith("\n\n")).toBe(false);

    // Did NOT route through the mocked saveChange (active dir)
    expect(mockedSaveChange).not.toHaveBeenCalled();
    // No refresh (clobbers repair)
    expect(store.changes.refresh).not.toHaveBeenCalled();

    await rm(root, { recursive: true, force: true });
  });

  it("dedupes by report key on repeat submission", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-dedup-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    const change: Change = {
      ...baseChange(),
      id: "test-change",
      status: "archived",
      subagent_reports: [],
    } as Change;
    await writeFile(
      join(bundleDir, "change.json"),
      JSON.stringify(change, null, 2),
    );

    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };

    const report = changeScopedReport("test-change");
    const first = await saveRecoveredSubagentReport({
      store,
      change,
      report,
      authorization: {
        reason: "post_archive_report_persist",
        evidence: "workflow execution already completed",
      },
    });
    const second = await saveRecoveredSubagentReport({
      store,
      change: first,
      report,
      authorization: {
        reason: "post_archive_report_persist",
        evidence: "workflow execution already completed",
      },
    });

    expect(second.subagent_reports).toHaveLength(1);
    // The no-op dedupe path returns the freshly loaded authoritative bundle
    // projection (structurally equal), not the caller's object reference.
    expect(second).not.toBe(first);
    expect(second).toEqual(first);

    await rm(root, { recursive: true, force: true });
  });

  it("writes to the ACTIVE changes dir for a CLOSED change", async () => {
    const { store } = createMockStore();
    const change: Change = {
      ...baseChange(),
      id: "test-change",
      status: "closed",
      subagent_reports: [],
    } as Change;
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const report = changeScopedReport("test-change");
    const updated = await saveRecoveredSubagentReport({
      store,
      change,
      report,
      authorization: {
        reason: "post_close_report_persist",
        evidence: "workflow execution already completed",
      },
    });

    expect(updated.subagent_reports).toHaveLength(1);
    expect(mockedSaveChange).toHaveBeenCalledWith(
      "/tmp/test/.adv/changes",
      expect.objectContaining({
        status: "closed",
        subagent_reports: [
          expect.objectContaining({
            agent: "adv-reviewer",
            recovery_audit: expect.objectContaining({
              persisted_via: "active-projection",
            }),
          }),
        ],
      }),
    );
    expect(store.changes.refresh).not.toHaveBeenCalled();
  });

  it("targets task.subagent_reports[] for a task-scoped report", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-task-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    const change: Change = {
      ...baseChange(),
      id: "test-change",
      status: "archived",
    } as Change;
    await writeFile(
      join(bundleDir, "change.json"),
      JSON.stringify(change, null, 2),
    );

    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };

    const report = {
      ...changeScopedReport("test-change"),
      scope: { kind: "task", task_id: "tk-1" },
      task_id: "tk-1",
    };
    const updated = await saveRecoveredSubagentReport({
      store,
      change,
      report,
      authorization: {
        reason: "post_archive_report_persist",
        evidence: "workflow execution already completed",
      },
    });

    // Task-scoped → task.subagent_reports[], NOT change-level
    expect(updated.tasks[0].subagent_reports).toHaveLength(1);
    expect(updated.subagent_reports ?? []).toHaveLength(0);

    const persisted = JSON.parse(
      await readFile(join(bundleDir, "change.json"), "utf-8"),
    );
    expect(persisted.tasks[0].subagent_reports).toHaveLength(1);

    await rm(root, { recursive: true, force: true });
  });

  it("requires recovery authorization", async () => {
    const { store } = createMockStore();
    await expect(
      saveRecoveredSubagentReport({
        store,
        change: { ...baseChange(), status: "archived" },
        report: changeScopedReport("test-change"),
      } as any),
    ).rejects.toThrow(/recovery authorization/);
  });

  it("writes to the ARCHIVE BUNDLE even when change.status is stale (active→archived race)", async () => {
    // Race scenario: loadChange returned status:"active", but the change was
    // archived between load and the signal. The bundle exists on disk. The
    // writer MUST write to the bundle (read path reads bundle first), NOT the
    // active dir — even though change.status is stale "active".
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-race-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    // Stale status: "active" — but bundle exists on disk
    const change: Change = {
      ...baseChange(),
      id: "test-change",
      status: "active",
      subagent_reports: [],
    } as Change;
    await writeFile(
      join(bundleDir, "change.json"),
      JSON.stringify({ ...change, status: "archived" }, null, 2),
    );

    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const report = changeScopedReport("test-change");
    await saveRecoveredSubagentReport({
      store,
      change,
      report,
      authorization: {
        reason: "post_archive_report_persist_race_fallback",
        evidence: "workflow execution already completed",
      },
    });

    // Persisted to the ARCHIVE BUNDLE despite stale status:"active"
    const persisted = JSON.parse(
      await readFile(join(bundleDir, "change.json"), "utf-8"),
    );
    expect(persisted.subagent_reports).toHaveLength(1);
    expect(persisted.subagent_reports[0].recovery_audit.persisted_via).toBe(
      "archive-sidecar",
    );
    // Did NOT write to active dir
    expect(mockedSaveChange).not.toHaveBeenCalled();

    await rm(root, { recursive: true, force: true });
  });

  it("preserves the authoritative terminal archive projection when input.change is a stale pre-archive shadow", async () => {
    // Active→archived race: the caller's in-memory change is a STALE shadow
    // (status "active", release gate pending, no reports). The archive bundle
    // on disk is the terminal record (rq-terminalProjectionTruth01): archived
    // status, completed release gate with evidence, a pre-existing terminal
    // report, and archive-only fields. Recovery MUST mutate from the bundle
    // projection so none of the terminal state is clobbered.
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-tproj-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    const terminalManifest = {
      ...baseChange(),
      id: "test-change",
      status: "archived",
      gates: {
        ...baseChange().gates,
        release: {
          status: "done",
          completed_at: "2026-07-09T00:00:00Z",
          completed_by: "user:jon",
          approval_evidence: "user approved archive",
        },
      },
      terminated: true,
      phase9_status: {
        status: "done",
        startedAt: "2026-07-09T00:00:00Z",
        completedAt: "2026-07-09T00:05:00Z",
      },
      subagent_reports: [changeScopedReport("test-change", 1)],
    };
    await writeFile(
      join(bundleDir, "change.json"),
      `${JSON.stringify(terminalManifest, null, 2)}\n`,
    );

    const staleShadow: Change = {
      ...baseChange(),
      id: "test-change",
      status: "active",
      subagent_reports: [],
    } as Change;
    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };
    (mockedSaveChange as unknown as ReturnType<typeof vi.fn>).mockClear();

    const newReport = changeScopedReport("test-change", 2);
    const updated = await saveRecoveredSubagentReport({
      store,
      change: staleShadow,
      report: newReport,
      authorization: {
        reason: "post_archive_report_persist_race_fallback",
        evidence: "WorkflowNotFoundError: workflow execution already completed",
      },
    });

    // Returned projection carries TERMINAL state, not the stale shadow.
    expect(updated.status).toBe("archived");
    expect(updated.gates?.release).toMatchObject({
      status: "done",
      completed_by: "user:jon",
      approval_evidence: "user approved archive",
    });
    expect(updated.terminated).toBe(true);
    expect(updated.phase9_status).toMatchObject({ status: "done" });
    expect(updated.subagent_reports).toHaveLength(2);
    expect(updated.subagent_reports?.[0]).toMatchObject({
      attempt: 1,
      agent: "adv-reviewer",
    });
    expect(updated.subagent_reports?.[0]).not.toHaveProperty("recovery_audit");
    expect(updated.subagent_reports?.[1]).toMatchObject({
      attempt: 2,
      recovery_audit: expect.objectContaining({
        persisted_via: "archive-sidecar",
      }),
    });

    // Persisted bundle preserves terminal status/gates/reports/archive-only
    // fields — exactly one audited append.
    const persisted = JSON.parse(
      await readFile(join(bundleDir, "change.json"), "utf-8"),
    );
    expect(persisted.status).toBe("archived");
    expect(persisted.gates.release).toMatchObject({
      status: "done",
      completed_by: "user:jon",
    });
    expect(persisted.terminated).toBe(true);
    expect(persisted.phase9_status.status).toBe("done");
    expect(persisted.subagent_reports).toHaveLength(2);
    expect(persisted.subagent_reports[0].recovery_audit).toBeUndefined();
    expect(persisted.subagent_reports[1].recovery_audit.persisted_via).toBe(
      "archive-sidecar",
    );
    expect(mockedSaveChange).not.toHaveBeenCalled();

    // Re-submitting the same report against the same stale shadow is a
    // deduplicated no-op: bundle unchanged, still exactly one audited report.
    const beforeResubmit = await readFile(
      join(bundleDir, "change.json"),
      "utf-8",
    );
    const resubmitted = await saveRecoveredSubagentReport({
      store,
      change: staleShadow,
      report: newReport,
      authorization: {
        reason: "post_archive_report_persist_race_fallback",
        evidence: "WorkflowNotFoundError: workflow execution already completed",
      },
    });
    expect(resubmitted.subagent_reports).toHaveLength(2);
    const afterResubmit = await readFile(
      join(bundleDir, "change.json"),
      "utf-8",
    );
    expect(afterResubmit).toBe(beforeResubmit);

    await rm(root, { recursive: true, force: true });
  });

  it("dedupes against a report that exists only in the authoritative bundle, without rewriting it", async () => {
    // The terminal bundle already holds report attempt 1; the stale shadow
    // does not. Re-submitting attempt 1 MUST be a no-op keyed on the BUNDLE
    // projection — no duplicate append, no recovery_audit retrofit, no file
    // rewrite at all.
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-bdedup-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    const terminalManifest = {
      ...baseChange(),
      id: "test-change",
      status: "archived",
      subagent_reports: [changeScopedReport("test-change", 1)],
    };
    await writeFile(
      join(bundleDir, "change.json"),
      `${JSON.stringify(terminalManifest, null, 2)}\n`,
    );
    const beforeSubmit = await readFile(
      join(bundleDir, "change.json"),
      "utf-8",
    );

    const staleShadow: Change = {
      ...baseChange(),
      id: "test-change",
      status: "active",
      subagent_reports: [],
    } as Change;
    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };

    const result = await saveRecoveredSubagentReport({
      store,
      change: staleShadow,
      report: changeScopedReport("test-change", 1),
      authorization: {
        reason: "post_archive_report_persist_race_fallback",
        evidence: "WorkflowNotFoundError: workflow execution already completed",
      },
    });

    expect(result.subagent_reports).toHaveLength(1);
    // Bundle untouched: no rewrite, no audited duplicate.
    const afterSubmit = await readFile(join(bundleDir, "change.json"), "utf-8");
    expect(afterSubmit).toBe(beforeSubmit);
    const persisted = JSON.parse(afterSubmit);
    expect(persisted.subagent_reports).toHaveLength(1);
    expect(persisted.subagent_reports[0].recovery_audit).toBeUndefined();

    await rm(root, { recursive: true, force: true });
  });

  it("fails closed when the authoritative bundle manifest belongs to a different change", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-badid-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    const manifest = `${JSON.stringify({ ...baseChange(), id: "other-change", status: "archived" }, null, 2)}\n`;
    await writeFile(join(bundleDir, "change.json"), manifest);

    const staleShadow: Change = {
      ...baseChange(),
      id: "test-change",
      status: "active",
      subagent_reports: [],
    } as Change;
    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };

    await expect(
      saveRecoveredSubagentReport({
        store,
        change: staleShadow,
        report: changeScopedReport("test-change", 2),
        authorization: {
          reason: "post_archive_report_persist_race_fallback",
          evidence:
            "WorkflowNotFoundError: workflow execution already completed",
        },
      }),
    ).rejects.toThrow(/archive bundle manifest/);

    // Bundle NOT clobbered by the stale shadow.
    expect(await readFile(join(bundleDir, "change.json"), "utf-8")).toBe(
      manifest,
    );

    await rm(root, { recursive: true, force: true });
  });

  it("fails closed when the authoritative bundle manifest is not valid JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-badjson-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), "{ not json");

    const staleShadow: Change = {
      ...baseChange(),
      id: "test-change",
      status: "active",
      subagent_reports: [],
    } as Change;
    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };

    await expect(
      saveRecoveredSubagentReport({
        store,
        change: staleShadow,
        report: changeScopedReport("test-change", 2),
        authorization: {
          reason: "post_archive_report_persist_race_fallback",
          evidence:
            "WorkflowNotFoundError: workflow execution already completed",
        },
      }),
    ).rejects.toThrow(/archive bundle manifest/);
    expect(await readFile(join(bundleDir, "change.json"), "utf-8")).toBe(
      "{ not json",
    );

    await rm(root, { recursive: true, force: true });
  });

  it("fails closed when the authoritative bundle manifest lacks a valid task carrier", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-badtasks-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    const manifest = `${JSON.stringify(
      {
        ...baseChange(),
        id: "test-change",
        status: "archived",
        tasks: [{ title: "missing canonical task id" }],
      },
      null,
      2,
    )}\n`;
    await writeFile(join(bundleDir, "change.json"), manifest);

    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };

    await expect(
      saveRecoveredSubagentReport({
        store,
        change: { ...baseChange(), id: "test-change", status: "active" },
        report: changeScopedReport("test-change", 2),
        authorization: {
          reason: "post_archive_report_persist_race_fallback",
          evidence:
            "WorkflowNotFoundError: workflow execution already completed",
        },
      }),
    ).rejects.toThrow(/invalid task carrier/);
    expect(await readFile(join(bundleDir, "change.json"), "utf-8")).toBe(
      manifest,
    );

    await rm(root, { recursive: true, force: true });
  });

  it("fails closed when the authoritative bundle has an invalid report carrier entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-recovery-badreport-"));
    const archiveDir = join(root, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-test-change");
    await mkdir(bundleDir, { recursive: true });
    const manifest = `${JSON.stringify(
      {
        ...baseChange(),
        id: "test-change",
        status: "archived",
        subagent_reports: [[]],
      },
      null,
      2,
    )}\n`;
    await writeFile(join(bundleDir, "change.json"), manifest);

    const store: any = {
      paths: { root, changes: join(root, "changes"), archive: archiveDir },
      changes: { save: vi.fn(), refresh: vi.fn() },
    };

    await expect(
      saveRecoveredSubagentReport({
        store,
        change: { ...baseChange(), id: "test-change", status: "active" },
        report: changeScopedReport("test-change", 2),
        authorization: {
          reason: "post_archive_report_persist_race_fallback",
          evidence:
            "WorkflowNotFoundError: workflow execution already completed",
        },
      }),
    ).rejects.toThrow(/invalid subagent_reports entry/);
    expect(await readFile(join(bundleDir, "change.json"), "utf-8")).toBe(
      manifest,
    );

    await rm(root, { recursive: true, force: true });
  });
});
