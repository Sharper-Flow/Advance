/**
 * Conformance Tool Tests
 *
 * Tests the multi-action `adv_conformance` tool: init, status, lock,
 * unlock, override, run. Uses temp directories for isolation.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdir, mkdtemp, rm, writeFile, access } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

import { conformanceTools } from "./conformance";
import { loadConformanceState } from "../storage/conformance";

const mocks = vi.hoisted(() => {
  const signal = vi.fn(async () => {});
  const query = vi.fn(async () => undefined);
  return {
    signal,
    query,
    getService: vi.fn(() => ({
      connection: { close: vi.fn(async () => {}) },
      client: {
        workflow: {
          // Mock workflow handle must include both signal AND query so
          // _adapters.isWorkflowHandleLike() recognizes it as a handle
          // and routes fireSignal() through the direct-handle path.
          getHandle: vi.fn(() => ({ signal, query })),
        },
      },
    })),
  };
});

vi.mock("../temporal/service", async () => {
  const actual = await vi.importActual<typeof import("../temporal/service")>(
    "../temporal/service",
  );
  return {
    ...actual,
    getService: mocks.getService,
  };
});

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: vi.fn(async () => "proj123"),
  };
});

let tempDir: string;
let projectDir: string;
let externalRoot: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "adv-conformance-tool-test-"));
  projectDir = join(tempDir, "myrepo");
  externalRoot = join(tempDir, "external");
  await mkdir(projectDir, { recursive: true });
  await mkdir(externalRoot, { recursive: true });
  vi.clearAllMocks();
});

afterEach(async () => {
  if (tempDir && existsSync(tempDir)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

const tool = conformanceTools.adv_conformance;

// Helper to construct a minimal Store-shaped object for tool.execute.
// After centralizemutationcacherefresh T02, adv_conformance uses
// bindTool (not bindToolSimple) and derives projectDir/externalRoot from
// store.paths.{root,external}. The conformance tool only reads these
// fields, so a minimal partial-store is sufficient for tests.
function makeStore() {
  return {
    paths: {
      root: projectDir,
      external: externalRoot,
    },
  } as unknown as Parameters<typeof tool.execute>[1];
}

async function seedRequiredSpec(spec = "advance-workflow"): Promise<void> {
  const state = await loadConformanceState(externalRoot, projectDir);
  state.specs[spec] = {
    conformance_required: true,
    locked: false,
    overrides: [],
  };
  await writeFile(
    join(externalRoot, "conformance.json"),
    JSON.stringify(state),
  );
}

describe("adv_conformance action: status", () => {
  test("returns empty state when conformance.json is missing", async () => {
    const result = await tool.execute({ action: "status" }, makeStore());
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe(1);
    expect(parsed.specs).toEqual({});
    expect(parsed.conformance_root_kind).toBe("subfolder");
  });

  test("returns existing state with spec entries", async () => {
    const stateData = {
      version: 1,
      conformance_root: join(projectDir, ".adv", "specs", "_conformance"),
      conformance_root_kind: "subfolder" as const,
      specs: {
        "advance-workflow": {
          conformance_required: true,
          locked: false,
          overrides: [],
        },
      },
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(stateData),
    );
    const result = await tool.execute({ action: "status" }, makeStore());
    const parsed = JSON.parse(result);
    expect(parsed.specs["advance-workflow"]?.conformance_required).toBe(true);
  });
});

describe("adv_conformance action: init", () => {
  test("default mode scaffolds in-repo subfolder", async () => {
    const result = await tool.execute({ action: "init" }, makeStore());
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.kind).toBe("subfolder");
    await access(join(projectDir, ".adv", "specs", "_conformance"));
    const state = await loadConformanceState(externalRoot, projectDir);
    expect(state.conformance_root_kind).toBe("subfolder");
    expect(state.conformance_root).toBe(
      join(projectDir, ".adv", "specs", "_conformance"),
    );
  });

  test("mode=sibling records the sibling path (does not require git availability)", async () => {
    const result = await tool.execute(
      { action: "init", mode: "sibling", projectId: "abc123" },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.kind).toBe("sibling");
    expect(parsed.path).toContain("advance-conformance-abc123");
    const state = await loadConformanceState(externalRoot, projectDir);
    expect(state.conformance_root_kind).toBe("sibling");
  });

  test("init is idempotent: second invocation succeeds without clobbering specs", async () => {
    await tool.execute({ action: "init" }, makeStore());
    // Add a spec entry between inits
    const before = await loadConformanceState(externalRoot, projectDir);
    const seeded = {
      ...before,
      specs: {
        "my-spec": {
          conformance_required: true,
          locked: false,
          overrides: [],
        },
      },
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(seeded),
    );
    // Re-init should preserve the spec entry
    const result = await tool.execute({ action: "init" }, makeStore());
    expect(JSON.parse(result).success).toBe(true);
    const state = await loadConformanceState(externalRoot, projectDir);
    expect(state.specs["my-spec"]?.conformance_required).toBe(true);
  });
});

describe("adv_conformance action: lock", () => {
  test("locks an existing spec entry and fires conformanceLockedSignal", async () => {
    await tool.execute({ action: "init" }, makeStore());
    // Seed a spec entry
    const state = await loadConformanceState(externalRoot, projectDir);
    state.specs["my-spec"] = {
      conformance_required: true,
      locked: false,
      overrides: [],
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(state),
    );
    const result = await tool.execute(
      {
        action: "lock",
        spec: "my-spec",
        change_id: "myChange",
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.locked).toBe(true);
    expect(updated.specs["my-spec"]?.locked_at_archive).toBe("myChange");
    expect(typeof updated.specs["my-spec"]?.locked_at).toBe("string");

    // Signal-driven: conformanceLockedSignal fired
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    const signalCall = mocks.signal.mock.calls[0];
    expect(signalCall[0].name).toBe("adv.change.conformanceLocked");
    expect(signalCall[1]).toMatchObject({
      specs: ["my-spec"],
    });
  });

  test("rejects lock on missing spec", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const result = await tool.execute(
      {
        action: "lock",
        spec: "nonexistent",
        change_id: "myChange",
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/spec/i);
    expect(mocks.signal).not.toHaveBeenCalled();
  });
});

describe("adv_conformance action: unlock", () => {
  test("unlocks a locked spec and records an override audit entry", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const state = await loadConformanceState(externalRoot, projectDir);
    state.specs["my-spec"] = {
      conformance_required: true,
      locked: true,
      locked_at: "2026-05-01T00:00:00Z",
      locked_at_archive: "originalChange",
      overrides: [],
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(state),
    );
    const result = await tool.execute(
      {
        action: "unlock",
        spec: "my-spec",
        user: "jrede",
        reason: "amend spec for new edge case",
        re_verify_deadline: "2026-05-22T00:00:00Z",
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.locked).toBe(false);
    expect(updated.specs["my-spec"]?.overrides).toHaveLength(1);
    expect(updated.specs["my-spec"]?.overrides[0]?.user).toBe("jrede");
    expect(updated.specs["my-spec"]?.overrides[0]?.reason).toMatch(/amend/);
    // No unlock signal in current set — stays local
    expect(mocks.signal).not.toHaveBeenCalled();
  });

  test("dryRun validates unlock without changing lock state or audit log", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const state = await loadConformanceState(externalRoot, projectDir);
    state.specs["my-spec"] = {
      conformance_required: true,
      locked: true,
      locked_at: "2026-05-01T00:00:00Z",
      locked_at_archive: "originalChange",
      overrides: [],
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(state),
    );

    const result = await tool.execute(
      {
        action: "unlock",
        spec: "my-spec",
        user: "jrede",
        reason: "preview unlock",
        re_verify_deadline: "2026-05-22T00:00:00Z",
        dryRun: true,
      },
      makeStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.locked).toBe(false);
    expect(parsed.overrides).toBe(1);

    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.locked).toBe(true);
    expect(updated.specs["my-spec"]?.overrides).toHaveLength(0);
    expect(mocks.signal).not.toHaveBeenCalled();
  });
});

describe("adv_conformance action: override", () => {
  test("records an override entry and fires conformanceOverriddenSignal when changeId is known", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const state = await loadConformanceState(externalRoot, projectDir);
    state.specs["my-spec"] = {
      conformance_required: true,
      locked: true,
      locked_at_archive: "originalChange",
      overrides: [],
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(state),
    );
    const result = await tool.execute(
      {
        action: "override",
        spec: "my-spec",
        user: "jrede",
        reason: "CI cluster outage 2026-05-15",
        re_verify_deadline: "2026-05-22T00:00:00Z",
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.locked).toBe(true); // unchanged
    expect(updated.specs["my-spec"]?.overrides).toHaveLength(1);
    expect(updated.specs["my-spec"]?.overrides[0]?.reason).toMatch(/outage/);

    // Signal-driven: conformanceOverriddenSignal fired to the change that locked the spec
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    const signalCall = mocks.signal.mock.calls[0];
    expect(signalCall[0].name).toBe("adv.change.conformanceOverridden");
    expect(signalCall[1]).toMatchObject({
      user: "jrede",
      reason: "CI cluster outage 2026-05-15",
    });
  });

  test("records override without signal when locked_at_archive is absent", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const state = await loadConformanceState(externalRoot, projectDir);
    state.specs["my-spec"] = {
      conformance_required: true,
      locked: true,
      overrides: [],
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(state),
    );
    const result = await tool.execute(
      {
        action: "override",
        spec: "my-spec",
        user: "jrede",
        reason: "CI cluster outage 2026-05-15",
        re_verify_deadline: "2026-05-22T00:00:00Z",
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.signal).not.toHaveBeenCalled();
  });

  test("dryRun validates override without writing audit or firing signal", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const state = await loadConformanceState(externalRoot, projectDir);
    state.specs["my-spec"] = {
      conformance_required: true,
      locked: true,
      locked_at_archive: "originalChange",
      overrides: [],
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(state),
    );

    const result = await tool.execute(
      {
        action: "override",
        spec: "my-spec",
        user: "jrede",
        reason: "preview override",
        re_verify_deadline: "2026-05-22T00:00:00Z",
        dryRun: true,
      },
      makeStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.overrides).toBe(1);

    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.overrides).toHaveLength(0);
    expect(mocks.signal).not.toHaveBeenCalled();
  });

  test("rejects override missing required audit fields", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const result = await tool.execute(
      {
        action: "override",
        spec: "my-spec",
        user: "jrede",
        // missing reason + re_verify_deadline
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/reason|deadline/i);
  });
});

describe("adv_conformance action: run", () => {
  test("returns DRIFT verdict and fires conformanceVerdictSignal when changeId is known", async () => {
    await tool.execute({ action: "init" }, makeStore());
    await seedRequiredSpec();
    // Seed a CI artifact at the documented path
    const artifactPath = join(externalRoot, "verdict.json");
    await writeFile(
      artifactPath,
      JSON.stringify({
        passed: ["rq-confSource01"],
        failed: [
          { rq_id: "rq-confLock01", summary: "lock state did not persist" },
        ],
      }),
    );
    // Set locked_at_archive so signal routing works
    const preState = await loadConformanceState(externalRoot, projectDir);
    preState.specs["advance-workflow"].locked_at_archive = "testChange";
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(preState),
    );

    const result = await tool.execute(
      {
        action: "run",
        spec: "advance-workflow",
        artifact_path: artifactPath,
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.verdict).toBe("DRIFT");
    expect(parsed.failed).toHaveLength(1);
    expect(parsed.failed[0].rq_id).toBe("rq-confLock01");
    expect(typeof parsed.run_id).toBe("string");

    // Signal-driven: conformanceVerdictSignal fired
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    const signalCall = mocks.signal.mock.calls[0];
    expect(signalCall[0].name).toBe("adv.change.conformanceVerdict");
    expect(signalCall[1]).toMatchObject({
      verdict: "DRIFT",
      failed: [
        { rq_id: "rq-confLock01", summary: "lock state did not persist" },
      ],
    });
  });

  test("returns PASS verdict when artifact has empty failed array", async () => {
    await tool.execute({ action: "init" }, makeStore());
    await seedRequiredSpec();
    const artifactPath = join(externalRoot, "verdict.json");
    await writeFile(
      artifactPath,
      JSON.stringify({
        passed: ["rq-confSource01", "rq-confLock01"],
        failed: [],
      }),
    );
    const result = await tool.execute(
      {
        action: "run",
        spec: "advance-workflow",
        artifact_path: artifactPath,
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.verdict).toBe("PASS");
    expect(parsed.failed).toEqual([]);
  });

  test("rejects when artifact path is missing", async () => {
    await tool.execute({ action: "init" }, makeStore());
    await seedRequiredSpec();
    const result = await tool.execute(
      {
        action: "run",
        spec: "advance-workflow",
        artifact_path: join(tempDir, "nonexistent.json"),
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/artifact|not found/i);
  });

  test("rejects when spec is not conformance_required", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const artifactPath = join(externalRoot, "verdict.json");
    await writeFile(artifactPath, JSON.stringify({ passed: [], failed: [] }));
    const result = await tool.execute(
      {
        action: "run",
        spec: "advance-workflow",
        artifact_path: artifactPath,
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/conformance_required/);
  });

  test("persists run_id and ran_at in spec.last_verdict", async () => {
    await tool.execute({ action: "init" }, makeStore());
    const state = await loadConformanceState(externalRoot, projectDir);
    state.specs["my-spec"] = {
      conformance_required: true,
      locked: false,
      overrides: [],
    };
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify(state),
    );
    const artifactPath = join(externalRoot, "verdict.json");
    await writeFile(
      artifactPath,
      JSON.stringify({ passed: ["rq-1"], failed: [] }),
    );
    const result = await tool.execute(
      {
        action: "run",
        spec: "my-spec",
        artifact_path: artifactPath,
      },
      makeStore(),
    );
    const parsed = JSON.parse(result);
    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.last_verdict?.verdict).toBe("PASS");
    expect(updated.specs["my-spec"]?.last_verdict?.run_id).toBe(parsed.run_id);
  });
});
