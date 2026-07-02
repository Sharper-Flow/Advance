/**
 * Ops follow-up change-state reducer tests.
 */
import { describe, expect, it } from "vitest";
import {
  applyOpsEvidenceAppendedToState,
  applyOpsFollowupLinkAddedToState,
  applyOpsFollowupSeededToState,
  applyOpsRunEvidenceAppendedToState,
  applyOpsRunUpsertedToState,
  changeSeedStateFromChange,
  createChangeWorkflowState,
} from "./change-state";
import type { Change } from "../types";

const timestamp = "2026-06-20T04:00:00.000Z";

function makeProfile() {
  return {
    kind: "migration" as const,
    source: {
      source_change_id: "parent-1",
      source_kind: "required_follow_up" as const,
    },
    relationship: "follows_release" as const,
    status: "not_started" as const,
    created_at: timestamp,
    evidence: [],
  };
}

describe("ops follow-up state reducers", () => {
  it("seeds an ops follow-up profile", () => {
    const state = createChangeWorkflowState({
      changeId: "child-1",
      title: "Child follow-up",
      createdAt: timestamp,
    });

    applyOpsFollowupSeededToState(state, {
      profile: makeProfile(),
      seededAt: timestamp,
    });

    expect(state.ops_followup).toMatchObject(makeProfile());
    expect(state.lastSignalAt).toBe(timestamp);
  });

  it("appends an outbound ops follow-up link", () => {
    const state = createChangeWorkflowState({
      changeId: "parent-1",
      title: "Parent change",
      createdAt: timestamp,
    });

    applyOpsFollowupLinkAddedToState(state, {
      link: {
        id: "ofl-1",
        changeId: "child-1",
        relationship: "follows_release",
        status: "not_started",
        linked_at: timestamp,
      },
      addedAt: timestamp,
    });

    expect(state.ops_followup_links).toHaveLength(1);
    expect(state.ops_followup_links?.[0]?.changeId).toBe("child-1");
    expect(state.lastSignalAt).toBe(timestamp);
  });

  it("replaces an outbound link with the same id", () => {
    const state = createChangeWorkflowState({
      changeId: "parent-1",
      title: "Parent change",
      createdAt: timestamp,
    });

    applyOpsFollowupLinkAddedToState(state, {
      link: {
        id: "ofl-1",
        changeId: "child-1",
        relationship: "follows_release",
        status: "not_started",
        linked_at: timestamp,
      },
      addedAt: timestamp,
    });
    applyOpsFollowupLinkAddedToState(state, {
      link: {
        id: "ofl-1",
        changeId: "child-1",
        relationship: "follows_release",
        status: "running",
        linked_at: "2026-06-20T04:01:00.000Z",
      },
      addedAt: "2026-06-20T04:01:00.000Z",
    });

    expect(state.ops_followup_links).toHaveLength(1);
    expect(state.ops_followup_links?.[0]?.status).toBe("running");
  });

  it("appends evidence and updates profile status", () => {
    const state = createChangeWorkflowState({
      changeId: "child-1",
      title: "Child follow-up",
      createdAt: timestamp,
    });
    applyOpsFollowupSeededToState(state, {
      profile: makeProfile(),
      seededAt: timestamp,
    });

    applyOpsEvidenceAppendedToState(state, {
      entry: {
        id: "ev-1",
        recorded_at: "2026-06-20T04:01:00.000Z",
        env: "prod",
        action: "run migration",
        status: "started",
        summary: "Migration started",
        next_step: "validate counts",
      },
      status: "running",
      appendedAt: "2026-06-20T04:01:00.000Z",
    });

    expect(state.ops_followup?.evidence).toHaveLength(1);
    expect(state.ops_followup?.status).toBe("running");
    expect(state.ops_followup?.updated_at).toBe("2026-06-20T04:01:00.000Z");
  });

  it("upserts an ops run into the child profile", () => {
    const state = createChangeWorkflowState({
      changeId: "child-1",
      title: "Child follow-up",
      createdAt: timestamp,
    });
    applyOpsFollowupSeededToState(state, {
      profile: makeProfile(),
      seededAt: timestamp,
    });

    applyOpsRunUpsertedToState(state, {
      run: {
        id: "run-1",
        title: "Run prod cleanup",
        status: "planned",
        created_at: timestamp,
        plan: {
          env: "prod",
          action: "cleanup temp rows",
          bounds: ["batch=001"],
          evidence_policy: "summary_and_pointer",
          rollback_or_cleanup_plan: "rerun cleanup or restore backup snapshot",
        },
        steps: [],
        evidence: [],
      },
      upsertedAt: "2026-06-20T04:02:00.000Z",
    });

    expect(state.ops_followup?.runs).toHaveLength(1);
    expect(state.ops_followup?.runs?.[0]?.id).toBe("run-1");
    expect(state.ops_followup?.updated_at).toBe("2026-06-20T04:02:00.000Z");
  });

  it("preserves existing run evidence when a later upsert replaces run metadata", () => {
    const state = createChangeWorkflowState({
      changeId: "child-1",
      title: "Child follow-up",
      createdAt: timestamp,
    });
    applyOpsFollowupSeededToState(state, {
      profile: {
        ...makeProfile(),
        runs: [
          {
            id: "run-1",
            title: "Run prod cleanup",
            status: "running",
            created_at: timestamp,
            plan: {
              env: "prod",
              action: "cleanup temp rows",
              bounds: ["batch=001"],
              evidence_policy: "summary_and_pointer",
              rollback_or_cleanup_plan:
                "rerun cleanup or restore backup snapshot",
            },
            steps: [],
            evidence: [
              {
                id: "run-ev-1",
                recorded_at: "2026-06-20T04:03:00.000Z",
                step_kind: "execute",
                env: "prod",
                run_id: "run-1",
                status: "partial",
                summary: "Cleanup partially complete",
                artifact: {
                  kind: "none",
                  rationale: "No external artifact emitted",
                },
                next_status: "partial",
              },
            ],
          },
        ],
      },
      seededAt: timestamp,
    });

    applyOpsRunUpsertedToState(state, {
      run: {
        id: "run-1",
        title: "Run prod cleanup with revised bounds",
        status: "planned",
        created_at: timestamp,
        plan: {
          env: "prod",
          action: "cleanup temp rows",
          bounds: ["batch=001", "limit=100"],
          evidence_policy: "summary_and_pointer",
          rollback_or_cleanup_plan: "rerun cleanup or restore backup snapshot",
        },
        steps: [],
        evidence: [],
      },
      upsertedAt: "2026-06-20T04:04:00.000Z",
    });

    expect(state.ops_followup?.runs?.[0]?.title).toBe(
      "Run prod cleanup with revised bounds",
    );
    expect(state.ops_followup?.runs?.[0]?.evidence).toHaveLength(1);
    expect(state.ops_followup?.runs?.[0]?.evidence[0]?.id).toBe("run-ev-1");
  });

  it("appends run evidence and updates run/profile status", () => {
    const state = createChangeWorkflowState({
      changeId: "child-1",
      title: "Child follow-up",
      createdAt: timestamp,
    });
    applyOpsFollowupSeededToState(state, {
      profile: {
        ...makeProfile(),
        runs: [
          {
            id: "run-1",
            title: "Run prod cleanup",
            status: "running",
            created_at: timestamp,
            plan: {
              env: "prod",
              action: "cleanup temp rows",
              bounds: ["batch=001"],
              evidence_policy: "summary_and_pointer",
              rollback_or_cleanup_plan:
                "rerun cleanup or restore backup snapshot",
            },
            steps: [],
            evidence: [],
          },
        ],
      },
      seededAt: timestamp,
    });

    applyOpsRunEvidenceAppendedToState(state, {
      runId: "run-1",
      entry: {
        id: "run-ev-1",
        recorded_at: "2026-06-20T04:03:00.000Z",
        step_kind: "execute",
        env: "prod",
        run_id: "run-1",
        status: "complete",
        summary: "Cleanup complete",
        artifact: { kind: "none", rationale: "No external artifact emitted" },
        next_status: "complete",
        completion_signal: "cleanup job finished",
        health_verification: "row count is zero",
        rollback_or_cleanup_disposition: "cleanup complete; no rollback needed",
      },
      status: "complete",
      appendedAt: "2026-06-20T04:03:00.000Z",
    });

    expect(state.ops_followup?.runs?.[0]?.status).toBe("complete");
    expect(state.ops_followup?.runs?.[0]?.evidence).toHaveLength(1);
    expect(state.ops_followup?.status).toBe("complete");
  });

  it("throws when appending evidence without a profile", () => {
    const state = createChangeWorkflowState({
      changeId: "orphan",
      title: "No profile",
      createdAt: timestamp,
    });

    expect(() =>
      applyOpsEvidenceAppendedToState(state, {
        entry: {
          id: "ev-1",
          recorded_at: timestamp,
          env: "prod",
          action: "x",
          status: "complete",
          summary: "x",
        },
        appendedAt: timestamp,
      }),
    ).toThrow(/no ops_followup profile/);
  });

  it("changeSeedStateFromChange carries ops fields for workflow reseed", () => {
    const change = {
      id: "legacy-ops",
      title: "Legacy ops",
      status: "active",
      created_at: timestamp,
      tasks: [],
      ops_followup: makeProfile(),
      ops_followup_links: [
        {
          id: "ofl-1",
          changeId: "child-1",
          relationship: "follows_release",
          status: "not_started",
          linked_at: timestamp,
        },
      ],
    } as unknown as Change;

    const seed = changeSeedStateFromChange(change);
    expect(seed.ops_followup).toMatchObject(makeProfile());
    expect(seed.ops_followup_links).toHaveLength(1);
  });

  it("changeSeedStateFromChange carries ops runbook state for workflow reseed", () => {
    const profile = {
      ...makeProfile(),
      runs: [
        {
          id: "run-1",
          title: "Run prod cleanup",
          status: "planned" as const,
          created_at: timestamp,
          plan: {
            env: "prod",
            action: "cleanup temp rows",
            bounds: ["batch=001"],
            evidence_policy: "summary_and_pointer",
            rollback_or_cleanup_plan:
              "rerun cleanup or restore backup snapshot",
          },
          steps: [],
          evidence: [],
        },
      ],
    };
    const change = {
      id: "runbook-ops",
      title: "Runbook ops",
      status: "active",
      created_at: timestamp,
      tasks: [],
      ops_followup: profile,
    } as unknown as Change;

    const seed = changeSeedStateFromChange(change);
    expect(seed.ops_followup?.runs).toHaveLength(1);
    expect(seed.ops_followup?.runs?.[0]?.plan.env).toBe("prod");
  });

  it("changeSeedStateFromChange is safe for changes without ops fields", () => {
    const change = {
      id: "plain",
      title: "Plain",
      status: "draft",
      created_at: timestamp,
      tasks: [],
    } as Change;

    const seed = changeSeedStateFromChange(change);
    expect(seed.ops_followup).toBeUndefined();
    expect(seed.ops_followup_links).toBeUndefined();
  });
});
