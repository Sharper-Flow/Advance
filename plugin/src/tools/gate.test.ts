/**
 * Gate Tools Tests
 *
 * Tests for 7-gate quality checklist tools.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { gateTools } from "./gate";
import { createStore, type Store } from "../storage/store";
import { GateIdSchema } from "../types";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Extract JSON content from banner-wrapped output.
 * Banner format: banner + "\n\n" + json
 */
function extractJson(output: string): unknown {
  // If output starts with banner (╔), extract JSON after the double newline
  if (output.startsWith("╔")) {
    const jsonStart = output.indexOf("\n\n");
    if (jsonStart !== -1) {
      return JSON.parse(output.slice(jsonStart + 2));
    }
  }
  // Otherwise, parse as-is
  return JSON.parse(output);
}

describe("Gate Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
    await store.init();
    await store.sync();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("adv_gate_status", () => {
    test("returns gate status for change without gates (creates defaults)", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.changeId).toBe("addFeature");
      expect(parsed.gates).toBeDefined();
      expect(parsed.gates.proposal.status).toBe("pending");
      expect(parsed.gates.discovery.status).toBe("pending");
      expect(parsed.gates.design.status).toBe("pending");
      expect(parsed.gates.planning.status).toBe("pending");
      expect(parsed.gates.execution.status).toBe("pending");
      expect(parsed.gates.acceptance.status).toBe("pending");
      expect(parsed.gates.release.status).toBe("pending");
    });

    test("returns incomplete gates list", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.incomplete).toEqual([
        "proposal",
        "discovery",
        "design",
        "planning",
        "execution",
        "acceptance",
        "release",
      ]);
      expect(parsed.canArchive).toBe(false);
    });

    test("returns error for nonexistent change", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });

    test("returns next gate to complete", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.nextGate).toBe("proposal");
    });
  });

  describe("adv_gate_complete context snapshot", () => {
    test("includes updated context snapshot in gate completion output", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "proposal" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed._contextSnapshot).toBeDefined();
      expect(parsed._contextSnapshot).toMatch(/\[✓ proposal\]/);
      expect(parsed._contextSnapshot).toMatch(/Success:/);
      expect(parsed._contextSnapshot).toMatch(/Workdir:/);
    });
  });

  describe("forward-only gate surface", () => {
    test("store.gates does not expose migrate helper", () => {
      expect("migrate" in store.gates).toBe(false);
    });
  });

  describe("adv_gate_complete", () => {
    test("marks first gate (proposal) as done", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "proposal" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("proposal");
      expect(parsed.status).toBe("done");
      expect(parsed.completed_at).toBeDefined();
    });

    test("blocks completing gate if prior gate incomplete", async () => {
      // Try to complete discovery without completing proposal first
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "discovery" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("prior gate");
      expect(parsed.blockedBy).toEqual(["proposal"]);
    });

    test("allows completing gate after prior gate done", async () => {
      // Create a clean change (no readiness failures) to test gate sequencing
      const cleanChange = {
        $schema: "https://advance.dev/schemas/change.v1.json",
        id: "cleanSeqChange",
        title: "Clean Sequence Change",
        status: "draft",
        created_at: "2026-01-01T00:00:00Z",
        tasks: [],
        deltas: {}, // no deltas — bug fix scenario, no scenario checks
      };
      const { mkdir: mkdirFs, writeFile: writeFileFs } =
        await import("fs/promises");
      const { join: joinPath } = await import("path");
      await mkdirFs(joinPath(tempDir, ".adv/changes/cleanSeqChange"), {
        recursive: true,
      });
      await writeFileFs(
        joinPath(tempDir, ".adv/changes/cleanSeqChange/change.json"),
        JSON.stringify(cleanChange, null, 2),
      );
      await writeFileFs(
        joinPath(tempDir, ".adv/changes/cleanSeqChange/proposal.md"),
        "# Clean Change\n\nTest.\n",
      );
      await store.sync();

      // Complete proposal first
      await gateTools.adv_gate_complete.execute(
        { changeId: "cleanSeqChange", gateId: "proposal" },
        store,
      );

      // Now discovery should work
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "cleanSeqChange", gateId: "discovery" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("discovery");
    });

    test("persists gate completion to JSON file", async () => {
      await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "proposal" },
        store,
      );

      // Reload store to verify persistence
      const freshStore = await createStore(tempDir);
      await freshStore.sync();

      const status = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        freshStore,
      );
      const parsed = extractJson(status) as Record<string, unknown>;
      const gates = parsed.gates as Record<string, { status: string }>;

      expect(gates.proposal.status).toBe("done");
    });

    test("returns error for nonexistent change", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "nonexistent", gateId: "proposal" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.error).toContain("not found");
    });

    test("returns error for invalid gate ID", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "invalid" as never },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.error).toContain("Invalid gate");
    });

    test("emits boundary warning when an unauthorized command completes a gate", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "addFeature",
          gateId: "proposal",
          completedBy: "adv-apply auto-complete",
        },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.boundaryWarning).toContain(
        "owned by [adv-proposal, adv-task]",
      );
      expect(parsed.boundaryWarning).toContain(
        "completed by 'adv-apply auto-complete'",
      );
    });

    test("does not emit boundary warning for an authorized command", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "addFeature",
          gateId: "proposal",
          completedBy: "adv-proposal validation pass",
        },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.boundaryWarning).toBeUndefined();
    });
  });
});

// =============================================================================
// Planning Gate Readiness Integration Tests
// =============================================================================

describe("adv_gate_complete planning — readiness enforcement", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
    await store.init();
    await store.sync();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /**
   * Helper: create a change file on disk and reload the store
   */
  async function createChangeFile(
    changeId: string,
    changeData: unknown,
  ): Promise<void> {
    await mkdir(join(tempDir, `.adv/changes/${changeId}`), { recursive: true });
    await writeFile(
      join(tempDir, `.adv/changes/${changeId}/change.json`),
      JSON.stringify(changeData, null, 2),
    );
    await writeFile(
      join(tempDir, `.adv/changes/${changeId}/proposal.md`),
      `# ${changeId}\n\nTest change.\n`,
    );
    // Reload store to pick up the new change
    await store.sync();
  }

  async function completePlanningPrereqs(changeId: string): Promise<void> {
    await gateTools.adv_gate_complete.execute(
      { changeId, gateId: "proposal" },
      store,
    );
    await gateTools.adv_gate_complete.execute(
      { changeId, gateId: "discovery" },
      store,
    );
    await gateTools.adv_gate_complete.execute(
      { changeId, gateId: "design" },
      store,
    );
  }

  test("blocks planning gate when change has a requirement with no scenarios (SCENARIO_MISSING)", async () => {
    // Create a change with a delta that has a requirement with no scenarios
    await createChangeFile("badScenarios", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "badScenarios",
      title: "Bad Scenarios Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {
        "some-cap": [
          {
            id: "dl-bad00001",
            operation: "add",
            requirement: {
              id: "rq-bad00001",
              title: "Feature with no scenarios",
              body: "body",
              priority: "must",
              scenarios: [], // <-- no scenarios
            },
          },
        ],
      },
    });

    await completePlanningPrereqs("badScenarios");

    // Attempt to complete planning — should be blocked
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "badScenarios", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.error).toBeDefined();
    expect(parsed.readinessFailures).toBeDefined();
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;
    expect(failures.some((f) => f.code === "SCENARIO_MISSING")).toBe(true);
  });

  test("blocks planning gate when change has TDD inversion (TASK_TDD_INVERSION)", async () => {
    await createChangeFile("tddInversion", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "tddInversion",
      title: "TDD Inversion Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-impl0001",
          title: "Implement the feature",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          deps: [],
        },
        {
          id: "tk-test0001",
          title: "Write tests for the feature",
          status: "pending",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          deps: [{ type: "blocked_by", target: "tk-impl0001" }], // <-- inversion
        },
      ],
      deltas: {},
    });

    await completePlanningPrereqs("tddInversion");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "tddInversion", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.error).toBeDefined();
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;
    expect(failures.some((f) => f.code === "TASK_TDD_INVERSION")).toBe(true);
  });

  test("blocks planning gate when task has incomplete cross-repo routing (CROSS_REPO_MISSING_METADATA)", async () => {
    await createChangeFile("badRouting", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "badRouting",
      title: "Bad Routing Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-xrp0001",
          title: "Cross-repo task",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          deps: [],
          target_repo: "backend", // has repo but no path
        },
      ],
      deltas: {},
    });

    await completePlanningPrereqs("badRouting");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "badRouting", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.error).toBeDefined();
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;
    expect(failures.some((f) => f.code === "CROSS_REPO_MISSING_METADATA")).toBe(
      true,
    );
  });

  test("readinessFailures items include code and path fields", async () => {
    await createChangeFile("checkShape", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "checkShape",
      title: "Check Shape",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {
        cap: [
          {
            id: "dl-shape001",
            operation: "add",
            requirement: {
              id: "rq-shape001",
              title: "Feature",
              body: "body",
              priority: "must",
              scenarios: [],
            },
          },
        ],
      },
    });

    await completePlanningPrereqs("checkShape");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "checkShape", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;

    expect(failures.length).toBeGreaterThan(0);
    const failure = failures[0];
    expect(failure.code).toBeDefined();
    expect(typeof failure.code).toBe("string");
    expect(failure.message).toBeDefined();
  });

  test("planning gate succeeds with only warnings (no must-failures) and includes readinessWarnings", async () => {
    // A change with smell warnings only (no scenarios issues, valid TDD order)
    await createChangeFile("warningsOnly", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "warningsOnly",
      title: "Warnings Only Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-test0002",
          title: "Write failing tests",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [],
        },
        {
          id: "tk-impl0002",
          title: "Implement the feature",
          status: "pending",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [{ type: "blocked_by", target: "tk-test0002" }],
        },
      ],
      deltas: {
        cap: [
          {
            id: "dl-warn0001",
            operation: "add",
            requirement: {
              id: "rq-warn0001",
              title: "Easy login for all users", // smell: easy + all
              body: "body",
              priority: "must",
              scenarios: [
                {
                  id: "rq-warn0001.1",
                  title: "Happy path",
                  given: ["user exists"],
                  when: "user logs in",
                  then: ["login succeeds"],
                },
              ],
            },
          },
        ],
      },
    });

    await completePlanningPrereqs("warningsOnly");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "warningsOnly", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should succeed (no must-failures)
    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("planning");
    // Should include advisory warnings
    expect(parsed.readinessWarnings).toBeDefined();
    expect(Array.isArray(parsed.readinessWarnings)).toBe(true);
    expect((parsed.readinessWarnings as unknown[]).length).toBeGreaterThan(0);
  });

  test("planning gate succeeds cleanly with no issues when change is clean", async () => {
    // A minimal valid change: correct TDD order, no deltas (bug fix), no routing issues
    await createChangeFile("cleanChange", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "cleanChange",
      title: "Clean Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-test0003",
          title: "Write failing tests",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [],
        },
        {
          id: "tk-impl0003",
          title: "Implement the fix",
          status: "pending",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [{ type: "blocked_by", target: "tk-test0003" }],
        },
      ],
      deltas: {}, // no deltas — bug fix scenario
    });

    await completePlanningPrereqs("cleanChange");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "cleanChange", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("planning");
    // No readinessFailures or empty
    expect(
      !parsed.readinessFailures ||
        (parsed.readinessFailures as unknown[]).length === 0,
    ).toBe(true);
  });

  test("non-planning gates (proposal, execution) are not affected by readiness checks", async () => {
    // proposal gate should complete without running planning-readiness
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "addFeature", gateId: "proposal" },
      store,
    );
    // proposal may already be done; either way, no readiness failures should appear
    const parsed = extractJson(result) as Record<string, unknown>;
    // Either success or a gate-already-done message — no readinessFailures
    expect(parsed.readinessFailures).toBeUndefined();
  });

  // --- metadata.tdd_intent integration tests (rq-TDD005inv) ---

  test("planning gate passes when separate_verification task is blocked by impl task (not an inversion)", async () => {
    await createChangeFile("separateVerification", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "separateVerification",
      title: "Separate Verification Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-impl0010",
          title: "Implement auth module",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [],
        },
        {
          id: "tk-e2e00010",
          title: "Run E2E tests across services",
          status: "pending",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "separate_verification" },
          deps: [{ type: "blocked_by", target: "tk-impl0010" }],
        },
      ],
      deltas: {},
    });

    await completePlanningPrereqs("separateVerification");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "separateVerification", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should pass — separate_verification is exempt from inversion detection
    expect(parsed.success).toBe(true);
  });

  test("planning gate passes when inline metadata prevents false positive on test-like title", async () => {
    await createChangeFile("inlineMetadata", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "inlineMetadata",
      title: "Inline Metadata Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-impl0020",
          title: "Create API endpoint",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [],
        },
        {
          id: "tk-cls00020",
          title: "Create task classifier with test-first approach",
          status: "pending",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [{ type: "blocked_by", target: "tk-impl0020" }],
        },
      ],
      deltas: {},
    });

    await completePlanningPrereqs("inlineMetadata");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "inlineMetadata", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should pass — inline metadata prevents false positive
    expect(parsed.success).toBe(true);
  });

  test("planning gate blocks in strict clarify mode when change has ambiguity findings", async () => {
    // Set clarify_enforcement to strict
    const config = store.config!;
    (config.features as Record<string, unknown>).clarify_enforcement = "strict";

    // The sample change "addFeature" has a delta with add + no scenarios
    // and the sample proposal has no Success Criteria or Scope section
    await completePlanningPrereqs("addFeature");

    // This should trigger clarify findings that block the planning gate in strict mode
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "addFeature", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should be blocked by clarify findings (or prep-readiness — either is valid)
    expect(parsed.error).toBeDefined();
    // Check for clarify-specific blocking
    const errorStr = parsed.error as string;
    const hasClarifyBlock =
      errorStr.includes("clarify") || errorStr.includes("ambiguity");
    const hasPlanningBlock = errorStr.includes("readiness");
    expect(hasClarifyBlock || hasPlanningBlock).toBe(true);
  });

  test("planning gate passes in advisory clarify mode with clarify warnings included", async () => {
    // Create a clean change that passes planning-readiness but has clarify findings
    await createChangeFile("advisoryChange", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "advisoryChange",
      title: "Make it fast", // subjective language triggers clarify finding
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {},
    });

    // Set clarify_enforcement to advisory (default)
    const config = store.config!;
    (config.features as Record<string, unknown>).clarify_enforcement =
      "advisory";

    await completePlanningPrereqs("advisoryChange");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "advisoryChange", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should succeed (advisory doesn't block)
    expect(parsed.success).toBe(true);
    // Should include clarify warnings
    expect(parsed.clarifyWarnings).toBeDefined();
    expect(Array.isArray(parsed.clarifyWarnings)).toBe(true);
    expect((parsed.clarifyWarnings as unknown[]).length).toBeGreaterThan(0);
  });

  test("planning gate has no clarify output when clarify_enforcement is off", async () => {
    await createChangeFile("offChange", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "offChange",
      title: "Make it fast", // would trigger clarify finding, but enforcement is off
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {},
    });

    const config = store.config!;
    (config.features as Record<string, unknown>).clarify_enforcement = "off";

    await completePlanningPrereqs("offChange");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "offChange", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.success).toBe(true);
    expect(parsed.clarifyWarnings).toBeUndefined();
  });

  test("planning gate still blocks TDD inversion for legacy tasks without metadata", async () => {
    // This is the existing behavior — legacy tasks use title heuristics
    await createChangeFile("legacyInversion", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "legacyInversion",
      title: "Legacy Inversion Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-impl0030",
          title: "Implement the feature",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          deps: [],
        },
        {
          id: "tk-test0030",
          title: "Write tests for the feature",
          status: "pending",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          // No metadata — falls back to title heuristics
          deps: [{ type: "blocked_by", target: "tk-impl0030" }],
        },
      ],
      deltas: {},
    });

    await completePlanningPrereqs("legacyInversion");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "legacyInversion", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should block — legacy behavior preserved
    expect(parsed.error).toBeDefined();
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;
    expect(failures.some((f) => f.code === "TASK_TDD_INVERSION")).toBe(true);
  });

  // --- TDD intent assignment enforcement tests (rq-PR006tdi) ---

  test("planning gate blocks when task is missing metadata.tdd_intent (TASK_TDD_INTENT_MISSING)", async () => {
    await createChangeFile("missingTddIntent", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "missingTddIntent",
      title: "Missing TDD Intent",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-nointent1",
          title: "Implement feature",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          deps: [],
          // No metadata.tdd_intent → should trigger TASK_TDD_INTENT_MISSING
        },
      ],
      deltas: {},
    });

    await completePlanningPrereqs("missingTddIntent");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "missingTddIntent", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.error).toBeDefined();
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;
    expect(failures.some((f) => f.code === "TASK_TDD_INTENT_MISSING")).toBe(
      true,
    );
  });

  test("planning gate passes when tdd_enforcement is 'advisory' and tasks lack tdd_intent (downgraded to warning) (rq-PR006tdi.4)", async () => {
    await createChangeFile("advisoryTddIntent", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "advisoryTddIntent",
      title: "Advisory TDD Intent",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-nointent2",
          title: "Implement feature",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          deps: [],
          // No metadata.tdd_intent — would be error in strict, but warning in advisory
        },
      ],
      deltas: {},
    });

    // Set tdd_enforcement to advisory
    const config = store.config!;
    (config.features as Record<string, unknown>).tdd_enforcement = "advisory";

    await completePlanningPrereqs("advisoryTddIntent");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "advisoryTddIntent", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should pass — advisory mode downgrades to warning
    expect(parsed.success).toBe(true);
    // Should include readiness warnings with the downgraded issue
    expect(parsed.readinessWarnings).toBeDefined();
    const warnings = parsed.readinessWarnings as Array<Record<string, unknown>>;
    expect(warnings.some((w) => w.code === "TASK_TDD_INTENT_MISSING")).toBe(
      true,
    );
  });

  test("planning gate skips TDD intent check entirely when tdd_enforcement is 'off' (rq-PR006tdi.5)", async () => {
    await createChangeFile("offTddIntent", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "offTddIntent",
      title: "Off TDD Intent",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-nointent3",
          title: "Implement feature",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          deps: [],
          // No metadata.tdd_intent — but enforcement is off, so no issue
        },
      ],
      deltas: {},
    });

    // Set tdd_enforcement to off
    const config = store.config!;
    (config.features as Record<string, unknown>).tdd_enforcement = "off";

    await completePlanningPrereqs("offTddIntent");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "offTddIntent", gateId: "planning" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should pass — off mode skips entirely
    expect(parsed.success).toBe(true);
    // No TDD intent warnings should be present
    const warnings =
      (parsed.readinessWarnings as
        | Array<Record<string, unknown>>
        | undefined) ?? [];
    expect(warnings.some((w) => w.code === "TASK_TDD_INTENT_MISSING")).toBe(
      false,
    );
  });
});

// =============================================================================
// Execution gate — task completion guard
// =============================================================================

describe("Execution Gate Task Completion", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
    await store.init();
    await store.sync();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  async function createChangeWithGates(
    changeId: string,
    changeData: unknown,
  ): Promise<void> {
    await mkdir(join(tempDir, `.adv/changes/${changeId}`), { recursive: true });
    await writeFile(
      join(tempDir, `.adv/changes/${changeId}/change.json`),
      JSON.stringify(changeData, null, 2),
    );
    await writeFile(
      join(tempDir, `.adv/changes/${changeId}/proposal.md`),
      `# ${changeId}\n\nTest change.\n`,
    );
    await store.sync();
  }

  async function completePreExecGates(changeId: string): Promise<void> {
    for (const gateId of [
      "proposal",
      "discovery",
      "design",
      "planning",
    ] as const) {
      await gateTools.adv_gate_complete.execute({ changeId, gateId }, store);
    }
  }

  test("blocks execution gate when tasks are pending", async () => {
    await createChangeWithGates("execPending", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "execPending",
      title: "Exec Pending Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-exec0001",
          title: "Implement feature",
          status: "pending",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [],
        },
      ],
      deltas: {},
    });
    await completePreExecGates("execPending");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "execPending", gateId: "execution" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.error).toContain("task(s) not done");
    expect(parsed.incompleteTasks).toBeDefined();
    const tasks = parsed.incompleteTasks as Array<{
      id: string;
      status: string;
    }>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("tk-exec0001");
    expect(tasks[0].status).toBe("pending");
  });

  test("blocks execution gate when tasks are in_progress", async () => {
    await createChangeWithGates("execInProg", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "execInProg",
      title: "Exec In Progress Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-exec0002",
          title: "Implement feature",
          status: "in_progress",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "red",
          metadata: { tdd_intent: "inline" },
          deps: [],
        },
      ],
      deltas: {},
    });
    await completePreExecGates("execInProg");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "execInProg", gateId: "execution" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.error).toContain("task(s) not done");
  });

  test("allows execution gate when all tasks are done", async () => {
    await createChangeWithGates("execAllDone", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "execAllDone",
      title: "Exec All Done Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-exec0003",
          title: "Implement feature",
          status: "done",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "complete",
          metadata: { tdd_intent: "inline" },
          deps: [],
        },
      ],
      deltas: {},
    });
    await completePreExecGates("execAllDone");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "execAllDone", gateId: "execution" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("execution");
  });

  test("cancelled tasks do not block execution gate", async () => {
    await createChangeWithGates("execCancelled", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "execCancelled",
      title: "Exec Cancelled Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [
        {
          id: "tk-exec0004",
          title: "Implement feature A",
          status: "done",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "complete",
          metadata: { tdd_intent: "inline" },
          deps: [],
        },
        {
          id: "tk-exec0005",
          title: "Implement feature B",
          status: "cancelled",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          metadata: { tdd_intent: "inline" },
          deps: [],
          cancellation: {
            reason: "Absorbed into tk-exec0004",
            approved_by_user: true,
            approval_evidence: "User approved",
            approved_at: "2026-01-01T01:00:00Z",
          },
        },
      ],
      deltas: {},
    });
    await completePreExecGates("execCancelled");

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "execCancelled", gateId: "execution" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("execution");
  });
});

// =============================================================================
// Gate enum single source of truth — no duplicate hard-coded enums
// =============================================================================

describe("gate enum derivation from GateIdSchema", () => {
  test("gate.ts adv_gate_complete args.gateId uses GateIdSchema (not a hard-coded enum)", () => {
    // The gate.ts args should use GateIdSchema directly, so its .options should match
    const argsSchema = gateTools.adv_gate_complete.args.gateId;
    expect(argsSchema.options).toEqual(GateIdSchema.options);
  });
});

// =============================================================================
// adv_gate_complete notes parameter (Leak #11)
// =============================================================================

describe("adv_gate_complete notes parameter (Leak #11)", () => {
  let notesTempDir: string;
  let notesStore: Store;

  beforeEach(async () => {
    notesTempDir = await createTempDir();
    await createTestProject(notesTempDir);
    notesStore = await createStore(notesTempDir);
    await notesStore.init();
    await notesStore.sync();
  });

  afterEach(async () => {
    notesStore.close();
    await cleanupTempDir(notesTempDir);
  });

  test("adv_gate_complete args schema has notes field", () => {
    expect(gateTools.adv_gate_complete.args.notes).toBeDefined();
  });

  test("adv_gate_complete works without notes (backwards compat)", async () => {
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "addFeature", gateId: "proposal" },
      notesStore,
    );
    const parsed = extractJson(result) as Record<string, unknown>;
    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("proposal");

    // gates.proposal.notes should be absent
    const gates = await notesStore.gates.get("addFeature");
    expect(gates?.proposal?.notes).toBeUndefined();
  });

  test("adv_gate_complete stores notes when provided (Leak #11)", async () => {
    const notesText =
      "Drift detection scoped to advisory warnings. spec-sync warning limited to worktrees only.";
    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "addFeature",
        gateId: "proposal",
        notes: notesText,
      },
      notesStore,
    );
    const parsed = extractJson(result) as Record<string, unknown>;
    expect(parsed.success).toBe(true);

    // Verify notes persisted in the gate state
    const gates = await notesStore.gates.get("addFeature");
    expect(gates?.proposal?.notes).toBe(notesText);
  });
});
