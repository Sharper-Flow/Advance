/**
 * Ops follow-up change-state reducer tests.
 */
import { describe, expect, it } from "vitest";
import {
  applyOpsEvidenceAppendedToState,
  applyOpsFollowupLinkAddedToState,
  applyOpsFollowupSeededToState,
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
