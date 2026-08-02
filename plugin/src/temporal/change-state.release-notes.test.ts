/**
 * RED/GREEN tests for release-note state reducer (rq-releaseNotesCapture01).
 *
 * Covers:
 *   - applyReleaseNotesSetToState replaces release_notes and records ledger.
 *   - Invalid payload rejects via signal_rejection without mutating state.
 *   - Idempotent replay with same operation_id + payload_hash leaves revision.
 *   - Conflicting operation_id with different payload is rejected.
 *   - Absence of release_notes remains valid (legacy compatibility).
 */

import { describe, expect, it } from "vitest";
import {
  applyReleaseNotesSetToState,
  createChangeWorkflowState,
} from "./change-state";
import { ReleaseNotesSetSignalPayloadSchema } from "../types";
import type { ReleaseNotesSetSignalPayload } from "../types";

const at = "2026-01-01T00:00:00.000Z";

function baseState() {
  const state = createChangeWorkflowState({
    changeId: "chg-release-notes",
    title: "Release notes change",
    createdAt: at,
  });
  state.projectId = "0000100000000000000000000000000000000000";
  state.state_revision = 5;
  return state;
}

function validPayload(
  overrides: Partial<ReleaseNotesSetSignalPayload> = {},
): ReleaseNotesSetSignalPayload {
  return ReleaseNotesSetSignalPayloadSchema.parse({
    release_notes: {
      audience: "external",
      category: "added",
      headline_external: "Added release-note setter",
      area: "workflow",
    },
    set_at: "2026-01-01T00:00:01.000Z",
    operation_id: "op-release-notes-1",
    command_kind: "releaseNotesSet",
    payload_hash: "hash-1",
    ...overrides,
  });
}

describe("applyReleaseNotesSetToState", () => {
  it("replaces release_notes and advances state_revision", () => {
    const state = baseState();
    applyReleaseNotesSetToState(state, validPayload());

    expect(state.release_notes?.audience).toBe("external");
    expect(state.release_notes?.category).toBe("added");
    expect(state.state_revision).toBe(6);
    expect(state.lastSignalAt).toBe("2026-01-01T00:00:01.000Z");
    expect(state.operation_ledger?.["op-release-notes-1"]).toMatchObject({
      operation_id: "op-release-notes-1",
      command_kind: "releaseNotesSet",
      payload_hash: "hash-1",
      outcome: "accepted",
      state_revision: 6,
    });
  });

  it("rejects invalid payload and records signal rejection", () => {
    const state = baseState();
    applyReleaseNotesSetToState(state, {
      release_notes: { audience: "invalid", category: "added" },
      set_at: "2026-01-01T00:00:01.000Z",
      operation_id: "op-release-notes-invalid",
      command_kind: "releaseNotesSet",
      payload_hash: "hash-invalid",
    } as unknown as ReleaseNotesSetSignalPayload);

    expect(state.release_notes).toBeUndefined();
    expect(state.state_revision).toBe(5);
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.signal_rejections?.[0]?.signalName).toBe("releaseNotesSet");
    expect(state.operation_ledger?.["op-release-notes-invalid"]).toMatchObject({
      outcome: "rejected",
    });
  });

  it("is idempotent on replay with same operation_id and payload_hash", () => {
    const state = baseState();
    const payload = validPayload();
    applyReleaseNotesSetToState(state, payload);
    applyReleaseNotesSetToState(state, payload);

    expect(state.state_revision).toBe(6);
    expect(state.operation_ledger?.["op-release-notes-1"]).toMatchObject({
      outcome: "idempotent_replay",
    });
  });

  it("rejects conflicting operation_id with different payload_hash", () => {
    const state = baseState();
    applyReleaseNotesSetToState(state, validPayload());
    applyReleaseNotesSetToState(
      state,
      validPayload({
        payload_hash: "hash-2",
        release_notes: {
          audience: "internal",
          category: "changed",
          headline_internal: "Changed something",
        },
      }),
    );

    expect(state.release_notes?.audience).toBe("external");
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.signal_rejections?.[0]?.signalName).toBe("releaseNotesSet");
    expect(state.operation_ledger?.["op-release-notes-1"]).toMatchObject({
      outcome: "accepted",
    });
  });

  it("accepts a second distinct operation_id as a new replacement", () => {
    const state = baseState();
    applyReleaseNotesSetToState(state, validPayload());
    applyReleaseNotesSetToState(
      state,
      validPayload({
        operation_id: "op-release-notes-2",
        payload_hash: "hash-2",
        release_notes: {
          audience: "internal",
          category: "changed",
          headline_internal: "Changed something",
        },
      }),
    );

    expect(state.state_revision).toBe(7);
    expect(state.release_notes?.audience).toBe("internal");
  });

  it("keeps release_notes undefined when never set (legacy compatibility)", () => {
    const state = baseState();
    expect(state.release_notes).toBeUndefined();
  });
});
