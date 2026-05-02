/**
 * Mature-project fixture for Bucket A scaling verification.
 *
 * Builds a `ProjectWorkflowState` with N synthetic archived change_summaries
 * via direct `applyChangeSummaryToProjectState` calls — bypasses the
 * full Temporal workflow startup so the test is deterministic and fast.
 *
 * Used by `mature-project-eviction.test.ts` to verify the bounded
 * `change_summaries` registry contract (rq-changeSummariesCap01) at scale,
 * specifically AC8: on a project with ≥250 archived changes, eviction
 * happens at the configured cap and access remains well under 10s.
 */

import {
  applyChangeSummaryToProjectState,
  createProjectWorkflowState,
} from "../../project-state";
import type { ChangeSummaryPayload } from "../../contracts";
import type { ProjectWorkflowState } from "../../contracts";

export interface MatureProjectFixtureOptions {
  /** Number of archived change summaries to seed. */
  archivedCount: number;
  /** Optional cap to install on the state (overrides default). */
  changeSummariesCap?: number;
  /** Number of additional active (non-archived) summaries. */
  activeCount?: number;
  /** Project ID to use. */
  projectId?: string;
}

export function buildMatureProjectFixture(
  options: MatureProjectFixtureOptions,
): ProjectWorkflowState {
  const {
    archivedCount,
    changeSummariesCap,
    activeCount = 0,
    projectId = "synthetic-mature-project",
  } = options;

  const state = createProjectWorkflowState({
    projectId,
    initializedAt: "2026-01-01T00:00:00.000Z",
    changeSummariesCap,
  });

  // Seed archived entries with strictly increasing lastActivityAt so that
  // oldest-first eviction is deterministic for assertions.
  for (let i = 0; i < archivedCount; i++) {
    applyChangeSummaryToProjectState(state, summaryFor(i, "archived"));
  }
  for (let i = 0; i < activeCount; i++) {
    applyChangeSummaryToProjectState(
      state,
      summaryFor(archivedCount + i, "active"),
    );
  }
  return state;
}

function summaryFor(
  index: number,
  status: "archived" | "active",
): ChangeSummaryPayload {
  // ISO-8601 strings ordered by index. Pad to 6 digits so localeCompare
  // sorts deterministically (string-compare on identical-length numerals).
  const seconds = String(index).padStart(6, "0");
  return {
    changeId: `chg-${status}-${seconds}`,
    title: `${status} change ${seconds}`,
    status,
    gateProgress: {
      proposal: status === "archived" ? "done" : "pending",
      discovery: status === "archived" ? "done" : "pending",
      design: status === "archived" ? "done" : "pending",
      planning: status === "archived" ? "done" : "pending",
      execution: status === "archived" ? "done" : "pending",
      acceptance: status === "archived" ? "done" : "pending",
      release: status === "archived" ? "done" : "pending",
    },
    taskCounts: { total: 0, done: 0, pending: 0 },
    // Spread lastActivityAt across an interval that ensures monotonic
    // ordering by index without colliding on identical timestamps.
    lastActivityAt: `2026-01-01T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.${seconds.slice(0, 3)}Z`,
    sourceVersion: 1,
  };
}
