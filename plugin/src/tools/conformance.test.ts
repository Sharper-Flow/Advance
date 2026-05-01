/**
 * Conformance Tool Tests
 *
 * Tests the multi-action `adv_conformance` tool: init, status, lock,
 * unlock, override, run. Uses temp directories for isolation.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, mkdtemp, rm, writeFile, access } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

import { conformanceTools } from "./conformance";
import { loadConformanceState } from "../storage/conformance";

let tempDir: string;
let projectDir: string;
let externalRoot: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "adv-conformance-tool-test-"));
  projectDir = join(tempDir, "myrepo");
  externalRoot = join(tempDir, "external");
  await mkdir(projectDir, { recursive: true });
  await mkdir(externalRoot, { recursive: true });
});

afterEach(async () => {
  if (tempDir && existsSync(tempDir)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

const tool = conformanceTools.adv_conformance;

describe("adv_conformance action: status", () => {
  test("returns empty state when conformance.json is missing", async () => {
    const result = await tool.execute(
      { action: "status" },
      projectDir,
      externalRoot,
    );
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
    const result = await tool.execute(
      { action: "status" },
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.specs["advance-workflow"]?.conformance_required).toBe(true);
  });
});

describe("adv_conformance action: init", () => {
  test("default mode scaffolds in-repo subfolder", async () => {
    const result = await tool.execute(
      { action: "init" },
      projectDir,
      externalRoot,
    );
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
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.kind).toBe("sibling");
    expect(parsed.path).toContain("advance-conformance-abc123");
    const state = await loadConformanceState(externalRoot, projectDir);
    expect(state.conformance_root_kind).toBe("sibling");
  });

  test("init is idempotent: second invocation succeeds without clobbering specs", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
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
    const result = await tool.execute(
      { action: "init" },
      projectDir,
      externalRoot,
    );
    expect(JSON.parse(result).success).toBe(true);
    const state = await loadConformanceState(externalRoot, projectDir);
    expect(state.specs["my-spec"]?.conformance_required).toBe(true);
  });
});

describe("adv_conformance action: lock", () => {
  test("locks an existing spec entry", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
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
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.locked).toBe(true);
    expect(updated.specs["my-spec"]?.locked_at_archive).toBe("myChange");
    expect(typeof updated.specs["my-spec"]?.locked_at).toBe("string");
  });

  test("rejects lock on missing spec", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
    const result = await tool.execute(
      {
        action: "lock",
        spec: "nonexistent",
        change_id: "myChange",
      },
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/spec/i);
  });
});

describe("adv_conformance action: unlock", () => {
  test("unlocks a locked spec and records an override audit entry", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
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
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.locked).toBe(false);
    expect(updated.specs["my-spec"]?.overrides).toHaveLength(1);
    expect(updated.specs["my-spec"]?.overrides[0]?.user).toBe("jrede");
    expect(updated.specs["my-spec"]?.overrides[0]?.reason).toMatch(/amend/);
  });
});

describe("adv_conformance action: override", () => {
  test("records an override entry without changing lock state", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
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
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.locked).toBe(true); // unchanged
    expect(updated.specs["my-spec"]?.overrides).toHaveLength(1);
    expect(updated.specs["my-spec"]?.overrides[0]?.reason).toMatch(/outage/);
  });

  test("rejects override missing required audit fields", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
    const result = await tool.execute(
      {
        action: "override",
        spec: "my-spec",
        user: "jrede",
        // missing reason + re_verify_deadline
      },
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/reason|deadline/i);
  });
});

describe("adv_conformance action: run", () => {
  test("returns DRIFT verdict when CI artifact reports failed AC labels", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
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
    const result = await tool.execute(
      {
        action: "run",
        spec: "advance-workflow",
        artifact_path: artifactPath,
      },
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.verdict).toBe("DRIFT");
    expect(parsed.failed).toHaveLength(1);
    expect(parsed.failed[0].rq_id).toBe("rq-confLock01");
    expect(typeof parsed.run_id).toBe("string");
  });

  test("returns PASS verdict when artifact has empty failed array", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
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
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.verdict).toBe("PASS");
    expect(parsed.failed).toEqual([]);
  });

  test("rejects when artifact path is missing", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
    const result = await tool.execute(
      {
        action: "run",
        spec: "advance-workflow",
        artifact_path: join(tempDir, "nonexistent.json"),
      },
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/artifact|not found/i);
  });

  test("persists run_id and ran_at in spec.last_verdict", async () => {
    await tool.execute({ action: "init" }, projectDir, externalRoot);
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
      projectDir,
      externalRoot,
    );
    const parsed = JSON.parse(result);
    const updated = await loadConformanceState(externalRoot, projectDir);
    expect(updated.specs["my-spec"]?.last_verdict?.verdict).toBe("PASS");
    expect(updated.specs["my-spec"]?.last_verdict?.run_id).toBe(parsed.run_id);
  });
});
