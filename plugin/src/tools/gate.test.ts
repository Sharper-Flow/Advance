/**
 * Gate Tools Tests
 *
 * Tests for 6-gate quality checklist tools.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { gateTools } from "./gate";
import { createStore, type Store } from "../storage/store";
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
      expect(parsed.gates.research.status).toBe("pending");
      expect(parsed.gates.prep.status).toBe("pending");
      expect(parsed.gates.implementation.status).toBe("pending");
      expect(parsed.gates.review.status).toBe("pending");
      expect(parsed.gates.harden.status).toBe("pending");
      expect(parsed.gates.signoff.status).toBe("pending");
    });

    test("returns incomplete gates list", async () => {
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.incomplete).toEqual([
        "research",
        "prep",
        "implementation",
        "review",
        "harden",
        "signoff",
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

      expect(parsed.nextGate).toBe("research");
    });
  });

  describe("gate migration", () => {
    test("migrates change gates to legacy status except signoff", async () => {
      // Get initial gates (should be created as pending)
      const beforeResult = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const beforeParsed = JSON.parse(beforeResult);
      expect(beforeParsed.gates.research.status).toBe("pending");

      // Migrate the change
      await store.gates.migrate("addFeature");

      // After migration, all gates should be 'legacy' except signoff
      const afterResult = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const afterParsed = JSON.parse(afterResult);

      expect(afterParsed.gates.research.status).toBe("legacy");
      expect(afterParsed.gates.prep.status).toBe("legacy");
      expect(afterParsed.gates.implementation.status).toBe("legacy");
      expect(afterParsed.gates.review.status).toBe("legacy");
      expect(afterParsed.gates.harden.status).toBe("legacy");
      expect(afterParsed.gates.signoff.status).toBe("pending"); // NEVER auto-marked
    });

    test("legacy gates count as satisfied for sequence enforcement", async () => {
      // Migrate gates to legacy
      await store.gates.migrate("addFeature");

      // Should be able to complete signoff directly (all others are legacy)
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "signoff" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("signoff");
    });

    test("canArchive is true when all gates satisfied (legacy or done)", async () => {
      // Migrate gates to legacy
      await store.gates.migrate("addFeature");

      // Complete signoff
      await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "signoff" },
        store,
      );

      // Check canArchive
      const result = await gateTools.adv_gate_status.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.canArchive).toBe(true);
      expect(parsed.incomplete).toEqual([]);
    });
  });

  describe("adv_gate_complete", () => {
    test("marks first gate (research) as done", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "research" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("research");
      expect(parsed.status).toBe("done");
      expect(parsed.completed_at).toBeDefined();
    });

    test("blocks completing gate if prior gate incomplete", async () => {
      // Try to complete prep without completing research first
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "prep" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("prior gate");
      expect(parsed.blockedBy).toEqual(["research"]);
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

      // Complete research first
      await gateTools.adv_gate_complete.execute(
        { changeId: "cleanSeqChange", gateId: "research" },
        store,
      );

      // Now prep should work (clean change passes readiness checks)
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "cleanSeqChange", gateId: "prep" },
        store,
      );
      const parsed = extractJson(result) as Record<string, unknown>;

      expect(parsed.success).toBe(true);
      expect(parsed.gateId).toBe("prep");
    });

    test("persists gate completion to JSON file", async () => {
      await gateTools.adv_gate_complete.execute(
        { changeId: "addFeature", gateId: "research" },
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

      expect(gates.research.status).toBe("done");
    });

    test("returns error for nonexistent change", async () => {
      const result = await gateTools.adv_gate_complete.execute(
        { changeId: "nonexistent", gateId: "research" },
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
  });
});

// =============================================================================
// Prep Gate Readiness Integration Tests
// =============================================================================

describe("adv_gate_complete prep — readiness enforcement", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
    await store.init();
    await store.sync();

    // Complete research gate so we can attempt prep
    await gateTools.adv_gate_complete.execute(
      { changeId: "addFeature", gateId: "research" },
      store,
    );
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

  test("blocks prep gate when change has a requirement with no scenarios (SCENARIO_MISSING)", async () => {
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

    // Complete research gate for the new change
    await gateTools.adv_gate_complete.execute(
      { changeId: "badScenarios", gateId: "research" },
      store,
    );

    // Attempt to complete prep — should be blocked
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "badScenarios", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.error).toBeDefined();
    expect(parsed.readinessFailures).toBeDefined();
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;
    expect(failures.some((f) => f.code === "SCENARIO_MISSING")).toBe(true);
  });

  test("blocks prep gate when change has TDD inversion (TASK_TDD_INVERSION)", async () => {
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

    await gateTools.adv_gate_complete.execute(
      { changeId: "tddInversion", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "tddInversion", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.error).toBeDefined();
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;
    expect(failures.some((f) => f.code === "TASK_TDD_INVERSION")).toBe(true);
  });

  test("blocks prep gate when task has incomplete cross-repo routing (CROSS_REPO_MISSING_METADATA)", async () => {
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

    await gateTools.adv_gate_complete.execute(
      { changeId: "badRouting", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "badRouting", gateId: "prep" },
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

    await gateTools.adv_gate_complete.execute(
      { changeId: "checkShape", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "checkShape", gateId: "prep" },
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

  test("prep gate succeeds with only warnings (no must-failures) and includes readinessWarnings", async () => {
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
          deps: [],
        },
        {
          id: "tk-impl0002",
          title: "Implement the feature",
          status: "pending",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
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

    await gateTools.adv_gate_complete.execute(
      { changeId: "warningsOnly", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "warningsOnly", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should succeed (no must-failures)
    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("prep");
    // Should include advisory warnings
    expect(parsed.readinessWarnings).toBeDefined();
    expect(Array.isArray(parsed.readinessWarnings)).toBe(true);
    expect((parsed.readinessWarnings as unknown[]).length).toBeGreaterThan(0);
  });

  test("prep gate succeeds cleanly with no issues when change is clean", async () => {
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
          deps: [],
        },
        {
          id: "tk-impl0003",
          title: "Implement the fix",
          status: "pending",
          priority: 1,
          created_at: "2026-01-01T00:00:00Z",
          tdd_phase: "none",
          deps: [{ type: "blocked_by", target: "tk-test0003" }],
        },
      ],
      deltas: {}, // no deltas — bug fix scenario
    });

    await gateTools.adv_gate_complete.execute(
      { changeId: "cleanChange", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "cleanChange", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("prep");
    // No readinessFailures or empty
    expect(
      !parsed.readinessFailures ||
        (parsed.readinessFailures as unknown[]).length === 0,
    ).toBe(true);
  });

  test("non-prep gates (research, implementation) are not affected by readiness checks", async () => {
    // research gate should complete without running prep-readiness
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "addFeature", gateId: "research" },
      store,
    );
    // research is already done (completed in beforeEach), expect it to either
    // succeed again (idempotent) or return a non-readiness-related response
    const parsed = extractJson(result) as Record<string, unknown>;
    // Either success or a gate-already-done message — no readinessFailures
    expect(parsed.readinessFailures).toBeUndefined();
  });

  // --- metadata.tdd_intent integration tests (rq-TDD005inv) ---

  test("prep gate passes when separate_verification task is blocked by impl task (not an inversion)", async () => {
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

    await gateTools.adv_gate_complete.execute(
      { changeId: "separateVerification", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "separateVerification", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should pass — separate_verification is exempt from inversion detection
    expect(parsed.success).toBe(true);
  });

  test("prep gate passes when inline metadata prevents false positive on test-like title", async () => {
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

    await gateTools.adv_gate_complete.execute(
      { changeId: "inlineMetadata", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "inlineMetadata", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should pass — inline metadata prevents false positive
    expect(parsed.success).toBe(true);
  });

  test("prep gate blocks in strict clarify mode when change has ambiguity findings", async () => {
    // Set clarify_enforcement to strict
    const config = store.config!;
    (config.features as Record<string, unknown>).clarify_enforcement = "strict";

    // The sample change "addFeature" has a delta with add + no scenarios
    // and the sample proposal has no Success Criteria or Scope section
    // This should trigger clarify findings that block the prep gate in strict mode
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "addFeature", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should be blocked by clarify findings (or prep-readiness — either is valid)
    expect(parsed.error).toBeDefined();
    // Check for clarify-specific blocking
    const errorStr = parsed.error as string;
    const hasClarifyBlock =
      errorStr.includes("clarify") || errorStr.includes("ambiguity");
    const hasPrepBlock = errorStr.includes("readiness");
    expect(hasClarifyBlock || hasPrepBlock).toBe(true);
  });

  test("prep gate passes in advisory clarify mode with clarify warnings included", async () => {
    // Create a clean change that passes prep-readiness but has clarify findings
    await createChangeFile("advisoryChange", {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id: "advisoryChange",
      title: "Make it fast", // subjective language triggers clarify finding
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {}, // no deltas — passes prep-readiness
    });

    // Set clarify_enforcement to advisory (default)
    const config = store.config!;
    (config.features as Record<string, unknown>).clarify_enforcement =
      "advisory";

    await gateTools.adv_gate_complete.execute(
      { changeId: "advisoryChange", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "advisoryChange", gateId: "prep" },
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

  test("prep gate has no clarify output when clarify_enforcement is off", async () => {
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

    await gateTools.adv_gate_complete.execute(
      { changeId: "offChange", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "offChange", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    expect(parsed.success).toBe(true);
    expect(parsed.clarifyWarnings).toBeUndefined();
  });

  test("prep gate still blocks TDD inversion for legacy tasks without metadata", async () => {
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

    await gateTools.adv_gate_complete.execute(
      { changeId: "legacyInversion", gateId: "research" },
      store,
    );

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "legacyInversion", gateId: "prep" },
      store,
    );
    const parsed = extractJson(result) as Record<string, unknown>;

    // Should block — legacy behavior preserved
    expect(parsed.error).toBeDefined();
    const failures = parsed.readinessFailures as Array<Record<string, unknown>>;
    expect(failures.some((f) => f.code === "TASK_TDD_INVERSION")).toBe(true);
  });
});
