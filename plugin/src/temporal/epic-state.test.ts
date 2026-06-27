import { describe, expect, it } from "vitest";

import type { EpicWorkflowState } from "./contracts";
import {
  applyChangeLinkedToState,
  applyChangeProjectionStatusUpdatedToState,
  applyChangeRetargetedToState,
  applyChangeUnlinkedToState,
  applyEntriesReorderedToState,
  applyEntryTerminalSummaryToState,
  applyEpicArchivedToState,
  applyEpicMergedToState,
  applyEpicScopeUpdatedToState,
  applyEpicCreatedToState,
  applyEpicUpdatedToState,
  applyShellAddedToState,
  applyShellPromotedToState,
  buildEpicSeedState,
  createEpicWorkflowState,
} from "./epic-state";

function makeInput(): {
  projectId: string;
  epicId: string;
  title: string;
  narrative: string;
  initializedAt: string;
} {
  return {
    projectId: "epic-test-project",
    epicId: "addAuthEpic",
    title: "Add Auth",
    narrative: "Add authentication to the service.",
    initializedAt: "2026-06-24T00:00:00.000Z",
  };
}

function makeState(
  seed?: Partial<EpicWorkflowState["epic"]>,
): EpicWorkflowState {
  const state = createEpicWorkflowState(makeInput());
  if (seed) {
    state.epic = { ...state.epic, ...seed };
  }
  return state;
}

describe("epic-state", () => {
  describe("createEpicWorkflowState", () => {
    it("creates an active Epic with zero entries and version 0", () => {
      const state = createEpicWorkflowState(makeInput());
      expect(state.status).toBe("active");
      expect(state.epic.id).toBe("addAuthEpic");
      expect(state.epic.entries).toEqual([]);
      expect(state.epic.version).toBe(0);
      expect(state.idempotencyLedger).toEqual({});
    });
  });

  describe("applyEpicCreatedToState", () => {
    it("replaces the Epic record entirely", () => {
      const state = makeState();
      const payload = {
        ...state.epic,
        title: "Updated title",
        narrative: "Updated narrative",
        entries: [
          {
            kind: "shell" as const,
            entry_id: "shell-1",
            order: 0,
            title: "Shell One",
            success_hint: "hint",
          },
        ],
      };
      applyEpicCreatedToState(state, payload);
      expect(state.epic.title).toBe("Updated title");
      expect(state.epic.entries).toHaveLength(1);
    });
  });

  describe("applyShellAddedToState", () => {
    it("adds a shell entry and assigns the next order", () => {
      const state = makeState();
      const result = applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.entries).toHaveLength(1);
      expect(state.epic.entries[0]).toMatchObject({
        kind: "shell",
        entry_id: "shell-1",
        order: 0,
      });
      expect(state.epic.version).toBe(1);
      expect(state.idempotencyLedger["add-shell-1"]).toBeDefined();
    });

    it("returns idempotent success on duplicate idempotency key", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyShellAddedToState(state, {
        entryId: "shell-2",
        title: "Shell Two",
        successHint: "Do another thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:02:00.000Z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("duplicate_idempotency_key");
      expect(state.epic.entries).toHaveLength(1);
    });

    it("rejects adding an entry with a duplicate entry ID", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One Again",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1-again",
        addedAt: "2026-06-24T00:02:00.000Z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("entry_already_exists");
    });
  });

  describe("applyShellPromotedToState", () => {
    it("replaces a shell row with a linked change row carrying provenance", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "promote-shell-1",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.entries).toHaveLength(1);
      const entry = state.epic.entries[0];
      expect(entry.kind).toBe("change");
      if (entry.kind !== "change") throw new Error("Expected change entry");
      expect(entry.change_id).toBe("change-1");
      expect(entry.promotion).toMatchObject({
        shell_entry_id: "shell-1",
        shell_title: "Shell One",
        shell_success_hint: "Do the thing",
        promoted_by: "agent",
        change_id: "change-1",
      });
      expect(state.epic.version).toBe(2);
    });

    it("is idempotent by idempotency key", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "promote-shell-1",
      });
      const result = applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:03:00.000Z",
        idempotencyKey: "promote-shell-1",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("duplicate_idempotency_key");
      expect(state.epic.entries).toHaveLength(1);
    });

    it("returns the existing change when retrying promotion after the shell is gone", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "promote-shell-1",
      });
      // New key, but shell is already promoted to the same change.
      const result = applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:03:00.000Z",
        idempotencyKey: "promote-shell-1-retry",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entryId).toBe("shell-1");
        expect(result.value.changeId).toBe("change-1");
      }
      expect(state.epic.entries).toHaveLength(1);
    });

    it("rejects promotion to a different change ID when shell is already promoted", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "promote-shell-1",
      });
      const result = applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-2",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:03:00.000Z",
        idempotencyKey: "promote-shell-1-dup",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("already_promoted");
      expect(state.epic.entries).toHaveLength(1);
      expect((state.epic.entries[0] as { change_id: string }).change_id).toBe(
        "change-1",
      );
    });

    it("returns already_promoted when retrying promotion to a different change ID after the shell is gone", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "promote-shell-1",
      });
      // A misdirected retry claims the shell should have promoted to change-2.
      const result = applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-2",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:03:00.000Z",
        idempotencyKey: "promote-shell-1-wrong",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("already_promoted");
      expect(state.epic.entries).toHaveLength(1);
      expect((state.epic.entries[0] as { change_id: string }).change_id).toBe(
        "change-1",
      );
    });
  });

  describe("applyEntriesReorderedToState", () => {
    it("reorders entries with CAS version check", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "a",
        title: "A",
        successHint: "a",
        idempotencyKey: "add-a",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyShellAddedToState(state, {
        entryId: "b",
        title: "B",
        successHint: "b",
        idempotencyKey: "add-b",
        addedAt: "2026-06-24T00:02:00.000Z",
      });
      const versionBefore = state.epic.version;
      const result = applyEntriesReorderedToState(state, {
        entryIds: ["b", "a"],
        expectedVersion: versionBefore,
        idempotencyKey: "reorder-1",
        reorderedAt: "2026-06-24T00:03:00.000Z",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.entries.map((e) => e.entry_id)).toEqual(["b", "a"]);
      expect(state.epic.entries[0].order).toBe(0);
      expect(state.epic.entries[1].order).toBe(1);
    });

    it("rejects reorder with stale expected version", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "a",
        title: "A",
        successHint: "a",
        idempotencyKey: "add-a",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyEntriesReorderedToState(state, {
        entryIds: ["a"],
        expectedVersion: 0,
        idempotencyKey: "reorder-1",
        reorderedAt: "2026-06-24T00:03:00.000Z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("stale_version");
    });

    it("is idempotent by idempotency key", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "a",
        title: "A",
        successHint: "a",
        idempotencyKey: "add-a",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyShellAddedToState(state, {
        entryId: "b",
        title: "B",
        successHint: "b",
        idempotencyKey: "add-b",
        addedAt: "2026-06-24T00:02:00.000Z",
      });
      const versionBefore = state.epic.version;
      applyEntriesReorderedToState(state, {
        entryIds: ["b", "a"],
        expectedVersion: versionBefore,
        idempotencyKey: "reorder-1",
        reorderedAt: "2026-06-24T00:03:00.000Z",
      });
      const result = applyEntriesReorderedToState(state, {
        entryIds: ["a", "b"],
        expectedVersion: state.epic.version,
        idempotencyKey: "reorder-1",
        reorderedAt: "2026-06-24T00:04:00.000Z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("duplicate_idempotency_key");
      expect(state.epic.entries.map((e) => e.entry_id)).toEqual(["b", "a"]);
    });
  });

  describe("applyEpicUpdatedToState", () => {
    it("updates title/narrative with CAS version check", () => {
      const state = makeState();
      const result = applyEpicUpdatedToState(state, {
        title: "New Title",
        expectedVersion: 0,
        idempotencyKey: "update-1",
        updatedAt: "2026-06-24T00:01:00.000Z",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.title).toBe("New Title");
      expect(state.epic.version).toBe(1);
    });

    it("rejects stale version", () => {
      const state = makeState();
      const result = applyEpicUpdatedToState(state, {
        title: "New Title",
        expectedVersion: 5,
        idempotencyKey: "update-1",
        updatedAt: "2026-06-24T00:01:00.000Z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("stale_version");
    });
  });

  describe("applyEpicScopeUpdatedToState", () => {
    it("updates Epic scope with CAS version check", () => {
      const state = makeState();
      const result = applyEpicScopeUpdatedToState(state, {
        epicScope: {
          kind: "product",
          owner_project_id: "project-web",
          repos: [
            {
              repo_id: "web",
              repo_project_id: "project-web",
              role: "primary",
              required: true,
            },
            {
              repo_id: "api",
              repo_project_id: "project-api",
              role: "secondary",
              required: true,
            },
          ],
        },
        expectedVersion: 0,
        updatedBy: "agent",
        auditEvidence: "User approved product scope.",
        idempotencyKey: "scope-update-1",
        updatedAt: "2026-06-24T00:01:00.000Z",
      });

      expect(result.ok).toBe(true);
      expect(state.epic.epic_scope?.repos).toHaveLength(2);
      expect(state.epic.version).toBe(1);
      expect(state.idempotencyLedger["scope-update-1"]).toBeDefined();
    });

    it("rejects stale scope update without changing scope", () => {
      const state = makeState({
        epic_scope: {
          kind: "repo",
          owner_project_id: "project-web",
          repos: [
            {
              repo_id: "web",
              repo_project_id: "project-web",
              role: "primary",
              required: true,
            },
          ],
        },
      });

      const result = applyEpicScopeUpdatedToState(state, {
        epicScope: undefined,
        expectedVersion: 5,
        updatedBy: "agent",
        auditEvidence: "Bad stale write.",
        idempotencyKey: "scope-update-stale",
        updatedAt: "2026-06-24T00:01:00.000Z",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("stale_version");
      expect(state.epic.epic_scope?.repos).toHaveLength(1);
    });
  });

  describe("applyEpicMergedToState", () => {
    it("marks an active source Epic as merged with no active next work", () => {
      const state = makeState({
        version: 2,
        entries: [
          {
            kind: "shell" as const,
            entry_id: "shell-1",
            order: 0,
            title: "Future work",
            success_hint: "done",
          },
        ],
      });

      const result = applyEpicMergedToState(state, {
        mergedInto: {
          epic_id: "survivorEpic",
          merged_at: "2026-06-24T00:02:00.000Z",
          merged_by: "agent",
          evidence: "Duplicate active Epic merged.",
          moved_entry_count: 1,
        },
        expectedVersion: 2,
        idempotencyKey: "merge-source-1",
      });

      expect(result.ok).toBe(true);
      expect(state.status).toBe("merged");
      expect(state.epic.merged_into?.epic_id).toBe("survivorEpic");
      expect(state.epic.progress).toMatchObject({
        status: "merged",
        active_entries: 0,
        next_entry_id: null,
      });
    });

    it("rejects completed source Epics", () => {
      const state = makeState({ version: 1 });
      state.epic.progress.status = "completed";

      const result = applyEpicMergedToState(state, {
        mergedInto: {
          epic_id: "survivorEpic",
          merged_at: "2026-06-24T00:02:00.000Z",
          merged_by: "agent",
          evidence: "No active source mutation.",
          moved_entry_count: 0,
        },
        expectedVersion: 1,
        idempotencyKey: "merge-completed-source",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("epic_not_active");
      expect(state.status).toBe("active");
    });
  });

  describe("applyChangeLinkedToState", () => {
    it("links an existing change as a new entry", () => {
      const state = makeState();
      const result = applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-1",
        title: "Linked Change",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.entries[0].kind).toBe("change");
    });
  });

  describe("applyChangeProjectionStatusUpdatedToState", () => {
    it("updates a change entry membership status for repair surfaces", () => {
      const state = makeState({
        entries: [
          {
            kind: "change",
            entry_id: "entry-1",
            order: 0,
            change_ref: { change_id: "change-1", project_id: "project-api" },
            title: "API Change",
            membership_status: "projection_pending",
            linked_at: "2026-06-24T00:01:00.000Z",
            linked_by: "agent",
            link_evidence: "linked during test",
          },
        ],
      });

      const result = applyChangeProjectionStatusUpdatedToState(state, {
        entryId: "entry-1",
        membershipStatus: "target_unreachable",
        evidence: "target queue unavailable",
        idempotencyKey: "status-entry-1",
        updatedAt: "2026-06-24T00:02:00.000Z",
      });

      expect(result.ok).toBe(true);
      expect(state.epic.entries[0]).toMatchObject({
        kind: "change",
        membership_status: "target_unreachable",
      });
      expect(state.epic.version).toBe(1);
      expect(state.idempotencyLedger["status-entry-1"]).toBeDefined();
    });
  });

  describe("applyChangeUnlinkedToState", () => {
    it("removes a linked change entry", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-1",
        title: "Linked Change",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyChangeUnlinkedToState(state, {
        entryId: "entry-1",
        unlinkEvidence: "User approved unlink.",
        idempotencyKey: "unlink-1",
        unlinkedAt: "2026-06-24T00:02:00.000Z",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.entries).toHaveLength(0);
    });
  });

  describe("applyEntryTerminalSummaryToState", () => {
    it("records terminal summary on a change entry", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-1",
        title: "Linked Change",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyEntryTerminalSummaryToState(state, {
        entryId: "entry-1",
        status: "archived",
        completedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "terminal-1",
      });
      expect(result.ok).toBe(true);
      const entry = state.epic.entries[0];
      expect(entry.kind).toBe("change");
      if (entry.kind !== "change") throw new Error("Expected change entry");
      expect(entry.terminal_summary).toEqual({
        status: "archived",
        completed_at: "2026-06-24T00:02:00.000Z",
      });
    });

    it("records closed terminal summary and recomputes progress", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-1",
        title: "Linked Change",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyEntryTerminalSummaryToState(state, {
        entryId: "entry-1",
        status: "closed",
        completedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "terminal-1",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.progress.completed_entries).toBe(1);
      expect(state.epic.progress.active_entries).toBe(0);
      expect(state.epic.progress.status).toBe("completed");
      const entry = state.epic.entries[0];
      expect(entry.kind).toBe("change");
      if (entry.kind !== "change") throw new Error("Expected change entry");
      expect(entry.terminal_summary?.status).toBe("closed");
    });

    it("returns entry_not_found for missing entry", () => {
      const state = makeState();
      const result = applyEntryTerminalSummaryToState(state, {
        entryId: "missing",
        status: "archived",
        completedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "terminal-1",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("entry_not_found");
    });

    it("returns entry_not_found for shell entries", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell",
        successHint: "hint",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyEntryTerminalSummaryToState(state, {
        entryId: "shell-1",
        status: "archived",
        completedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "terminal-1",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("entry_not_found");
    });
  });

  describe("applyChangeUnlinkedToState", () => {
    it("removes a linked change entry", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-1",
        title: "Linked Change",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyChangeUnlinkedToState(state, {
        entryId: "entry-1",
        unlinkEvidence: "User approved unlink.",
        idempotencyKey: "unlink-1",
        unlinkedAt: "2026-06-24T00:02:00.000Z",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.entries).toHaveLength(0);
    });

    it("is idempotent when entry is already removed", () => {
      const state = makeState();
      const result = applyChangeUnlinkedToState(state, {
        entryId: "entry-1",
        unlinkEvidence: "User approved unlink.",
        idempotencyKey: "unlink-1",
        unlinkedAt: "2026-06-24T00:02:00.000Z",
      });
      expect(result.ok).toBe(true);
      expect(state.epic.entries).toHaveLength(0);
    });
  });

  describe("applyChangeLinkedToState", () => {
    it("rejects duplicate entry IDs", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-1",
        title: "Linked Change",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-2",
        title: "Another Linked Change",
        idempotencyKey: "link-2",
        linkedAt: "2026-06-24T00:02:00.000Z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("entry_already_exists");
      expect(state.epic.entries).toHaveLength(1);
    });

    it("rejects duplicate change IDs under different entry IDs", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-1",
        title: "Linked Change",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyChangeLinkedToState(state, {
        entryId: "entry-2",
        changeId: "change-1",
        title: "Duplicate Linked Change",
        idempotencyKey: "link-2",
        linkedAt: "2026-06-24T00:02:00.000Z",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("entry_already_exists");
      expect(state.epic.entries).toHaveLength(1);
    });
  });

  describe("concurrent reorder/promotion conflicts", () => {
    it("rejects reorder with stale version after concurrent promotion", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyShellAddedToState(state, {
        entryId: "shell-2",
        title: "Shell Two",
        successHint: "Do another thing",
        idempotencyKey: "add-shell-2",
        addedAt: "2026-06-24T00:02:00.000Z",
      });
      // Concurrent promotion bumps the version.
      const promoteResult = applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:03:00.000Z",
        idempotencyKey: "promote-shell-1",
      });
      expect(promoteResult.ok).toBe(true);

      // Reorder payload was prepared before the promotion.
      const versionBeforePromotion = 1;
      const reorderResult = applyEntriesReorderedToState(state, {
        entryIds: ["shell-2", "shell-1"],
        expectedVersion: versionBeforePromotion,
        idempotencyKey: "reorder-1",
        reorderedAt: "2026-06-24T00:04:00.000Z",
      });
      expect(reorderResult.ok).toBe(false);
      if (!reorderResult.ok) expect(reorderResult.code).toBe("stale_version");
    });
  });

  describe("recomputeEpicProgress", () => {
    it("skips terminal entries when selecting next work", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Future Shell",
        successHint: "hint",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyChangeLinkedToState(state, {
        entryId: "entry-2",
        changeId: "change-2",
        title: "Active Change",
        idempotencyKey: "link-2",
        linkedAt: "2026-06-24T00:02:00.000Z",
      });
      applyChangeLinkedToState(state, {
        entryId: "entry-3",
        changeId: "change-3",
        title: "Archived Change",
        idempotencyKey: "link-3",
        linkedAt: "2026-06-24T00:03:00.000Z",
      });
      applyEntryTerminalSummaryToState(state, {
        entryId: "entry-3",
        status: "archived",
        completedAt: "2026-06-24T00:04:00.000Z",
        idempotencyKey: "terminal-3",
      });

      expect(state.epic.progress.total_entries).toBe(3);
      expect(state.epic.progress.completed_entries).toBe(1);
      expect(state.epic.progress.active_entries).toBe(1);
      expect(state.epic.progress.next_entry_id).toBe("shell-1");
      expect(state.epic.progress.status).toBe("active");
    });

    it("marks Epic completed when all change entries are terminal", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-1",
        title: "Archived Change",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      applyChangeLinkedToState(state, {
        entryId: "entry-2",
        changeId: "change-2",
        title: "Closed Change",
        idempotencyKey: "link-2",
        linkedAt: "2026-06-24T00:02:00.000Z",
      });
      applyEntryTerminalSummaryToState(state, {
        entryId: "entry-1",
        status: "archived",
        completedAt: "2026-06-24T00:03:00.000Z",
        idempotencyKey: "terminal-1",
      });
      applyEntryTerminalSummaryToState(state, {
        entryId: "entry-2",
        status: "closed",
        completedAt: "2026-06-24T00:04:00.000Z",
        idempotencyKey: "terminal-2",
      });

      expect(state.epic.progress.total_entries).toBe(2);
      expect(state.epic.progress.completed_entries).toBe(2);
      expect(state.epic.progress.active_entries).toBe(0);
      expect(state.epic.progress.next_entry_id).toBeNull();
      expect(state.epic.progress.status).toBe("completed");
    });

    it("keeps next_entry_id null for archived Epics", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Future Shell",
        successHint: "hint",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyEpicArchivedToState(state, {
        archivedAt: "2026-06-24T00:02:00.000Z",
        archivedBy: "agent",
      });
      expect(state.epic.progress.status).toBe("archived");
      expect(state.epic.progress.next_entry_id).toBeNull();
    });
  });

  describe("applyEpicArchivedToState", () => {
    it("sets status and progress to archived", () => {
      const state = makeState();
      applyEpicArchivedToState(state, {
        archivedAt: "2026-06-24T00:01:00.000Z",
        archivedBy: "agent",
      });
      expect(state.status).toBe("archived");
      expect(state.epic.progress.status).toBe("archived");
    });
  });

  describe("applyChangeRetargetedToState", () => {
    it("retargets a change entry to a new change ID preserving entry_id/order/title", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-a",
        title: "Original",
        membershipStatus: "linked",
        linkedBy: "agent",
        linkEvidence: "Initial link.",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });

      const result = applyChangeRetargetedToState(state, {
        entryId: "entry-1",
        fromChangeId: "change-a",
        toChangeId: "change-b",
        title: "Retargeted",
        membershipStatus: "projection_pending",
        retargetedBy: "agent",
        retargetEvidence: "Stale parent retargeted to reachable child.",
        idempotencyKey: "retarget-1",
        retargetedAt: "2026-06-24T00:02:00.000Z",
      });

      expect(result).toMatchObject({
        ok: true,
        value: { entryId: "entry-1", changeId: "change-b" },
      });
      const entry = state.epic.entries[0];
      expect(entry.entry_id).toBe("entry-1");
      expect(entry.order).toBe(0);
      expect(entry.title).toBe("Retargeted");
      expect(entry.kind === "change" && entry.change_id).toBe("change-b");
      expect(entry.kind === "change" && entry.membership_status).toBe(
        "projection_pending",
      );
      expect(entry.kind === "change" && entry.retargeted_by).toBe("agent");
      expect(entry.kind === "change" && entry.retargeted_from_change_id).toBe(
        "change-a",
      );
    });

    it("rejects retarget when entry is missing", () => {
      const state = makeState();
      const result = applyChangeRetargetedToState(state, {
        entryId: "missing",
        fromChangeId: "change-a",
        toChangeId: "change-b",
        retargetedBy: "agent",
        retargetEvidence: "Evidence",
        idempotencyKey: "retarget-missing",
        retargetedAt: "2026-06-24T00:01:00.000Z",
      });
      expect(result).toMatchObject({ ok: false, code: "entry_not_found" });
    });

    it("rejects retarget when entry is a shell", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell",
        successHint: "hint",
        idempotencyKey: "shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyChangeRetargetedToState(state, {
        entryId: "shell-1",
        fromChangeId: "change-a",
        toChangeId: "change-b",
        retargetedBy: "agent",
        retargetEvidence: "Evidence",
        idempotencyKey: "retarget-shell",
        retargetedAt: "2026-06-24T00:02:00.000Z",
      });
      expect(result).toMatchObject({ ok: false, code: "entry_not_found" });
    });

    it("rejects retarget when fromChangeId does not match current child", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-a",
        title: "Original",
        membershipStatus: "linked",
        linkedBy: "agent",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      const result = applyChangeRetargetedToState(state, {
        entryId: "entry-1",
        fromChangeId: "change-wrong",
        toChangeId: "change-b",
        retargetedBy: "agent",
        retargetEvidence: "Evidence",
        idempotencyKey: "retarget-mismatch",
        retargetedAt: "2026-06-24T00:02:00.000Z",
      });
      expect(result).toMatchObject({
        ok: false,
        code: "retarget_source_mismatch",
      });
    });

    it("rejects retarget when toChangeId duplicates another entry", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-a",
        title: "A",
        membershipStatus: "linked",
        linkedBy: "agent",
        idempotencyKey: "link-a",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });
      applyChangeLinkedToState(state, {
        entryId: "entry-2",
        changeId: "change-b",
        title: "B",
        membershipStatus: "linked",
        linkedBy: "agent",
        idempotencyKey: "link-b",
        linkedAt: "2026-06-24T00:02:00.000Z",
      });
      const result = applyChangeRetargetedToState(state, {
        entryId: "entry-1",
        fromChangeId: "change-a",
        toChangeId: "change-b",
        retargetedBy: "agent",
        retargetEvidence: "Evidence",
        idempotencyKey: "retarget-dup",
        retargetedAt: "2026-06-24T00:03:00.000Z",
      });
      expect(result).toMatchObject({
        ok: false,
        code: "retarget_duplicate_target",
      });
    });

    it("is idempotent for the same retarget payload", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-a",
        title: "Original",
        membershipStatus: "linked",
        linkedBy: "agent",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });

      const payload = {
        entryId: "entry-1",
        fromChangeId: "change-a",
        toChangeId: "change-b",
        membershipStatus: "projection_pending" as const,
        retargetedBy: "agent",
        retargetEvidence: "Evidence",
        idempotencyKey: "retarget-idem",
        retargetedAt: "2026-06-24T00:02:00.000Z",
      };

      const first = applyChangeRetargetedToState(state, payload);
      const second = applyChangeRetargetedToState(state, payload);
      expect(second).toMatchObject({
        ok: true,
        value: { entryId: "entry-1", changeId: "change-b" },
      });
      expect(
        state.epic.entries[0].kind === "change" &&
          state.epic.entries[0].change_id,
      ).toBe("change-b");
      expect(first).toEqual(second);
    });

    it("is idempotent when retry source equals already-retargeted target", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-a",
        title: "Original",
        membershipStatus: "linked",
        linkedBy: "agent",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });

      applyChangeRetargetedToState(state, {
        entryId: "entry-1",
        fromChangeId: "change-a",
        toChangeId: "change-b",
        membershipStatus: "projection_pending",
        retargetedBy: "agent",
        retargetEvidence: "Original retarget evidence.",
        idempotencyKey: "retarget-a-b",
        retargetedAt: "2026-06-24T00:02:00.000Z",
      });

      const result = applyChangeRetargetedToState(state, {
        entryId: "entry-1",
        fromChangeId: "change-b",
        toChangeId: "change-b",
        membershipStatus: "linked",
        retargetedBy: "agent",
        retargetEvidence: "Retry evidence must not replace audit.",
        idempotencyKey: "retarget-b-b",
        retargetedAt: "2026-06-24T00:03:00.000Z",
      });

      expect(result).toMatchObject({
        ok: true,
        value: { entryId: "entry-1", changeId: "change-b" },
      });
      const entry = state.epic.entries[0];
      expect(entry.kind === "change" && entry.change_id).toBe("change-b");
      expect(entry.kind === "change" && entry.retargeted_from_change_id).toBe(
        "change-a",
      );
      expect(entry.kind === "change" && entry.retarget_evidence).toBe(
        "Original retarget evidence.",
      );
      expect(state.idempotencyLedger["retarget-b-b"]?.outcome).toBe(
        "idempotent",
      );
    });

    it("rejects a superseded retry by idempotency key", () => {
      const state = makeState();
      applyChangeLinkedToState(state, {
        entryId: "entry-1",
        changeId: "change-a",
        title: "Original",
        membershipStatus: "linked",
        linkedBy: "agent",
        idempotencyKey: "link-1",
        linkedAt: "2026-06-24T00:01:00.000Z",
      });

      const originalPayload = {
        entryId: "entry-1",
        fromChangeId: "change-a",
        toChangeId: "change-b",
        membershipStatus: "projection_pending" as const,
        retargetedBy: "agent",
        retargetEvidence: "Original retarget evidence.",
        idempotencyKey: "retarget-a-b",
        retargetedAt: "2026-06-24T00:02:00.000Z",
      };
      applyChangeRetargetedToState(state, originalPayload);
      applyChangeRetargetedToState(state, {
        entryId: "entry-1",
        fromChangeId: "change-b",
        toChangeId: "change-c",
        membershipStatus: "projection_pending",
        retargetedBy: "agent",
        retargetEvidence: "Second retarget evidence.",
        idempotencyKey: "retarget-b-c",
        retargetedAt: "2026-06-24T00:03:00.000Z",
      });

      const result = applyChangeRetargetedToState(state, originalPayload);

      expect(result).toMatchObject({
        ok: false,
        code: "duplicate_idempotency_key",
      });
      expect(
        state.epic.entries[0].kind === "change" &&
          state.epic.entries[0].change_id,
      ).toBe("change-c");
    });
  });

  describe("buildEpicSeedState", () => {
    it("preserves epic, ledger, status, and lastSignalAt for continue-as-new", () => {
      const state = makeState();
      applyShellAddedToState(state, {
        entryId: "shell-1",
        title: "Shell One",
        successHint: "Do the thing",
        idempotencyKey: "add-shell-1",
        addedAt: "2026-06-24T00:01:00.000Z",
      });
      applyShellPromotedToState(state, {
        entryId: "shell-1",
        changeId: "change-1",
        promotedBy: "agent",
        promotedAt: "2026-06-24T00:02:00.000Z",
        idempotencyKey: "promote-shell-1",
      });
      const seed = buildEpicSeedState(state);
      expect(seed.epic).toEqual(state.epic);
      expect(seed.idempotencyLedger).toEqual(state.idempotencyLedger);
      expect(seed.status).toBe("active");
      expect(seed.lastSignalAt).toBe(state.lastSignalAt);
    });
  });
});
