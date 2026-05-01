import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHANGE_WORKFLOW_QUERY_NAMES,
  CHANGE_WORKFLOW_SIGNAL_NAMES,
  CHANGE_WORKFLOW_UPDATE_NAMES,
  PROJECT_WORKFLOW_QUERY_NAMES,
  PROJECT_WORKFLOW_UPDATE_NAMES,
} from "./contracts";

/**
 * Workflow-safe invariant guard for `workflows.ts`.
 *
 * `plugin/src/temporal/workflows.ts` is the root module Temporal's
 * `@temporalio/worker` webpack-bundles at plugin init. A single stray
 * direct import of `node:*` or `../storage/` pulls Node-only or
 * side-effect-heavy modules into the workflow sandbox and fails the
 * bundle at boot — exactly the `Webpack finished with errors` path
 * this change was created to eliminate.
 *
 * This test guards the DIRECT import surface. Transitive imports are
 * enforced by `workflow-bundle-boundary.test.ts` in this directory.
 */
describe("workflows module (workflow-safe invariant)", () => {
  const modulePath = fileURLToPath(new URL("./workflows.ts", import.meta.url));
  const messagesPath = fileURLToPath(new URL("./messages.ts", import.meta.url));
  const source = readFileSync(modulePath, "utf8");
  const messagesSource = readFileSync(messagesPath, "utf8");

  it("direct imports are restricted to workflow-safe modules", () => {
    // Join the full source so multi-line import statements collapse to a
    // single line for regex matching (prettier wraps long imports).
    const flat = source.replace(/\n/g, " ").replace(/\s+/g, " ");

    // Allowed: one `import * as wf from "@temporalio/workflow"` star import.
    expect(flat).toMatch(/import \* as wf from "@temporalio\/workflow";/);

    // Allowed: named/type imports from the three sibling workflow-safe
    // modules. Each appears exactly once as an import source.
    expect(flat).toMatch(/from "\.\/contracts";/);
    expect(flat).toMatch(/from "\.\/change-state";/);
    expect(flat).toMatch(/from "\.\/project-state";/);
  });

  it("direct imports use the exact workflow-safe allowlist", () => {
    const importSources = Array.from(
      source.matchAll(/^\s*import(?:\s+type)?[\s\S]*?\sfrom\s"([^"]+)";/gm),
      (match) => match[1],
    );

    expect(importSources).toEqual([
      "@temporalio/workflow",
      "./contracts",
      "./change-state",
      "./project-state",
    ]);
  });

  it("does not directly import node:* modules", () => {
    // Any `from "node:..."` would pull Node built-ins into the workflow
    // bundle and break replay determinism / webpack bundling.
    expect(source).not.toMatch(/from "node:/);
  });

  it("does not directly import ../storage/ modules", () => {
    // Direct storage imports leak the JSON+SQLite layer into the workflow
    // sandbox. Transitive leaks are tracked separately.
    expect(source).not.toMatch(/from "\.\.\/storage\//);
  });

  it("does not import MCP tool layers or plugin-init", () => {
    // Defensive guards against future edits pulling in layers that
    // absolutely must not reach the workflow bundle.
    expect(source).not.toMatch(/from "\.\.\/tools\//);
    expect(source).not.toMatch(/from "\.\.\/plugin-init/);
    expect(source).not.toMatch(/from "\.\.\/tool-registry/);
  });

  it("exports changeWorkflow and projectWorkflow", () => {
    expect(source).toMatch(/export async function changeWorkflow\(/);
    expect(source).toMatch(/export async function projectWorkflow\(/);
  });

  it("declares task-run query and update wire contracts", () => {
    expect(CHANGE_WORKFLOW_QUERY_NAMES.taskRun).toBe("adv.change.taskRun");
    expect(CHANGE_WORKFLOW_QUERY_NAMES.taskRuns).toBe("adv.change.taskRuns");
    expect(CHANGE_WORKFLOW_UPDATE_NAMES.recordTaskRunEvent).toBe(
      "adv.change.recordTaskRunEvent",
    );
  });

  it("client-side message bindings use contract constants, not raw wire strings", () => {
    const executableMessages = messagesSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(executableMessages).not.toMatch(
      /define(?:Query|Update|Signal)<[\s\S]*?>\("adv\./,
    );
    expect(messagesSource).toContain("CHANGE_WORKFLOW_QUERY_NAMES.bootstrap");
    expect(messagesSource).toContain("CHANGE_WORKFLOW_UPDATE_NAMES.addTask");
    expect(messagesSource).toContain(
      "CHANGE_WORKFLOW_SIGNAL_NAMES.applyChangeSummary",
    );
    expect(PROJECT_WORKFLOW_QUERY_NAMES.state).toBe("adv.project.state");
    expect(PROJECT_WORKFLOW_UPDATE_NAMES.addAgendaItem).toBe(
      "adv.project.addAgendaItem",
    );
    expect(CHANGE_WORKFLOW_SIGNAL_NAMES.applyChangeSummary).toBe(
      "adv.change.applyChangeSummary",
    );
  });

  it("mirrors task-run query/update bindings in messages and workflows", () => {
    expect(messagesSource).toContain("changeTaskRunQuery");
    expect(messagesSource).toContain("changeTaskRunsQuery");
    expect(messagesSource).toContain("recordTaskRunEventUpdate");
    expect(source).toContain("changeTaskRunQuery");
    expect(source).toContain("changeTaskRunsQuery");
    expect(source).toContain("recordTaskRunEventUpdate");
    expect(source).toContain("recordTaskRunEventInChangeState");
  });

  it("hydrates and continues task_runs across continue-as-new", () => {
    expect(source).toContain("input.seedState.task_runs");
    expect(source).toContain("state.task_runs = input.seedState.task_runs");
    expect(source).toContain("task_runs: state.task_runs");
  });

  describe("safeUpdateHandler reliability wrapper", () => {
    /**
     * Reliability invariant: every wf.setHandler that wraps a domain
     * handler MUST go through safeUpdateHandler so that domain errors
     * become wf.ApplicationFailure (non-retryable) instead of escaping
     * as WorkflowWorkerUnhandledFailure (which permanently wedges the
     * workflow).
     *
     * Pattern surfaced after a single bad input ("Invalid task-run
     * transition from started via checkpoint") wedged the entire
     * inlineApprovalGateTransition workflow until it was manually
     * terminated. This static guard prevents the regression.
     */
    it("defines safeUpdateHandler helper", () => {
      expect(source).toMatch(/function safeUpdateHandler</);
    });

    it("safeUpdateHandler converts thrown errors to ApplicationFailure", () => {
      // The wrapper must use wf.ApplicationFailure.nonRetryable, not
      // a plain Error rethrow.
      expect(source).toMatch(/wf\.ApplicationFailure\.nonRetryable/);
    });

    it("wraps every change-workflow update handler", () => {
      // Each wf.setHandler call for an update (not a query) must be
      // wrapped. Queries are read-only and don't suffer from the wedge
      // problem, so they don't require wrapping.
      const updateHandlers = [
        "addTaskUpdate",
        "updateTaskUpdate",
        "recordTaskEvidenceUpdate",
        "recordTaskRunEventUpdate",
        "setTaskPhaseUpdate",
        "cancelTaskUpdate",
        "reclassifyTaskTddUpdate",
        "completeGateUpdate",
        "reopenFromGateUpdate",
        "addWisdomUpdate",
        "updateArtifactMetadataUpdate",
        "archiveChangeUpdate",
        "closeChangeUpdate",
      ];
      for (const handler of updateHandlers) {
        // The handler line should be followed (within ~3 lines) by
        // safeUpdateHandler. Joining lines on whitespace makes the
        // regex more forgiving of formatting.
        const flat = source.replace(/\s+/g, " ");
        expect(flat).toMatch(new RegExp(`${handler},\\s*safeUpdateHandler\\(`));
      }
    });

    it("wraps every project-workflow update handler", () => {
      const updateHandlers = [
        "addAgendaItemUpdate",
        "updateAgendaItemUpdate",
        "addProjectWisdomUpdate",
        "recordMigrationEntryUpdate",
        "applyChangeSummarySignalDef",
      ];
      const flat = source.replace(/\s+/g, " ");
      for (const handler of updateHandlers) {
        expect(flat).toMatch(new RegExp(`${handler},\\s*safeUpdateHandler\\(`));
      }
    });
  });

  // rq-searchAttrHealth01.2: workflow handlers must conditionally skip
  // upsertSearchAttributes when input.searchAttributesEnabled === false.
  describe("conditional upsertSearchAttributes guards", () => {
    it("guards every upsertSearchAttributes call with the searchAttributesEnabled flag", () => {
      // Every wf.upsertSearchAttributes(...) call site MUST be inside an
      // `if (input.searchAttributesEnabled !== false)` block. There must
      // be the same number of guards as upsert call sites.
      const upsertCount = (source.match(/wf\.upsertSearchAttributes\(/g) ?? [])
        .length;
      const guardCount = (
        source.match(
          /if\s*\(\s*input\.searchAttributesEnabled\s*!==\s*false/g,
        ) ?? []
      ).length;
      expect(upsertCount).toBeGreaterThan(0);
      expect(guardCount).toBe(upsertCount);
    });

    it("propagates searchAttributesEnabled into the continue-as-new seed", () => {
      // The continue-as-new seed object literal MUST include the field so
      // the flag survives history rollover. Without this, a workflow that
      // started with the flag disabled would re-enable it after CAN and
      // fail on the next handler call.
      const flat = source.replace(/\s+/g, " ");
      expect(flat).toMatch(
        /searchAttributesEnabled:\s*input\.searchAttributesEnabled/,
      );
    });
  });
});
