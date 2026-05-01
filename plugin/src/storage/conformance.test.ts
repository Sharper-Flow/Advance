/**
 * Conformance Storage Tests
 *
 * Tests atomic read/write of conformance.json + path resolution for
 * subfolder (default) and sibling (opt-in) location modes.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile, rm, access } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

import {
  getConformanceStatePath,
  resolveDefaultConformanceRoot,
  resolveSiblingConformanceRoot,
  loadConformanceState,
  saveConformanceState,
  upsertSpecEntry,
  appendOverride,
} from "./conformance";

import {
  EMPTY_CONFORMANCE_STATE,
  type ConformanceState,
} from "../types";

let tempDir: string;
let projectDir: string;
let externalRoot: string;

beforeEach(async () => {
  tempDir = await mkdtemp();
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

async function mkdtemp(): Promise<string> {
  const { mkdtemp: fsmkdtemp } = await import("fs/promises");
  return await fsmkdtemp(join(tmpdir(), "adv-conformance-test-"));
}

describe("getConformanceStatePath", () => {
  test("computes path under externalRoot", () => {
    const p = getConformanceStatePath(externalRoot);
    expect(p).toBe(join(externalRoot, "conformance.json"));
  });
});

describe("resolveDefaultConformanceRoot (subfolder mode)", () => {
  test("returns .adv/specs/_conformance under projectDir", () => {
    const root = resolveDefaultConformanceRoot(projectDir);
    expect(root).toBe(join(projectDir, ".adv", "specs", "_conformance"));
  });
});

describe("resolveSiblingConformanceRoot (sibling mode)", () => {
  test("returns advance-conformance-{projectId} alongside projectDir", () => {
    const root = resolveSiblingConformanceRoot(projectDir, "abc123");
    const expected = join(tempDir, "advance-conformance-abc123");
    expect(root).toBe(expected);
  });
});

describe("loadConformanceState", () => {
  test("returns EMPTY state when conformance.json is missing", async () => {
    const state = await loadConformanceState(externalRoot, projectDir);
    expect(state.version).toBe(1);
    expect(state.conformance_root_kind).toBe("subfolder");
    expect(state.conformance_root).toBe(
      join(projectDir, ".adv", "specs", "_conformance"),
    );
    expect(state.specs).toEqual({});
  });

  test("reads existing valid state", async () => {
    const existing: ConformanceState = {
      version: 1,
      conformance_root: "/abs/example",
      conformance_root_kind: "sibling",
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
      JSON.stringify(existing),
    );
    const state = await loadConformanceState(externalRoot, projectDir);
    expect(state.specs["advance-workflow"]?.conformance_required).toBe(true);
    expect(state.conformance_root_kind).toBe("sibling");
  });

  test("rejects malformed state with explanatory error", async () => {
    await writeFile(
      join(externalRoot, "conformance.json"),
      JSON.stringify({ version: 99, garbage: true }),
    );
    await expect(loadConformanceState(externalRoot, projectDir)).rejects.toThrow();
  });
});

describe("saveConformanceState", () => {
  test("atomic round-trip: write then read returns identical state", async () => {
    const initial = EMPTY_CONFORMANCE_STATE(
      join(projectDir, ".adv", "specs", "_conformance"),
      "subfolder",
    );
    initial.specs["my-spec"] = {
      conformance_required: true,
      locked: false,
      overrides: [],
    };
    await saveConformanceState(externalRoot, initial);
    const reloaded = await loadConformanceState(externalRoot, projectDir);
    expect(reloaded.specs["my-spec"]?.conformance_required).toBe(true);
  });

  test("creates externalRoot dir if missing", async () => {
    const fresh = join(tempDir, "fresh-external");
    expect(existsSync(fresh)).toBe(false);
    const state = EMPTY_CONFORMANCE_STATE(
      join(projectDir, ".adv", "specs", "_conformance"),
    );
    await saveConformanceState(fresh, state);
    await access(join(fresh, "conformance.json"));
  });

  test("writes JSON with stable formatting (newline at end)", async () => {
    const state = EMPTY_CONFORMANCE_STATE(
      join(projectDir, ".adv", "specs", "_conformance"),
    );
    await saveConformanceState(externalRoot, state);
    const raw = await readFile(
      join(externalRoot, "conformance.json"),
      "utf-8",
    );
    expect(raw.endsWith("\n")).toBe(true);
  });
});

describe("upsertSpecEntry", () => {
  test("adds a new spec entry to existing state", async () => {
    const state = EMPTY_CONFORMANCE_STATE(
      join(projectDir, ".adv", "specs", "_conformance"),
    );
    const updated = upsertSpecEntry(state, "new-spec", {
      conformance_required: true,
      locked: false,
      overrides: [],
    });
    expect(updated.specs["new-spec"]?.conformance_required).toBe(true);
    // Original unchanged (immutability)
    expect(state.specs["new-spec"]).toBeUndefined();
  });

  test("merges into existing spec entry preserving fields", () => {
    const state: ConformanceState = {
      version: 1,
      conformance_root: "/x",
      conformance_root_kind: "subfolder",
      specs: {
        "my-spec": {
          conformance_required: true,
          locked: false,
          overrides: [
            {
              user: "u",
              reason: "r",
              re_verify_deadline: "d",
              applied_at: "a",
            },
          ],
        },
      },
    };
    const updated = upsertSpecEntry(state, "my-spec", {
      locked: true,
      locked_at: "2026-01-01T00:00:00Z",
    });
    expect(updated.specs["my-spec"]?.locked).toBe(true);
    expect(updated.specs["my-spec"]?.locked_at).toBe("2026-01-01T00:00:00Z");
    // Preserved fields
    expect(updated.specs["my-spec"]?.conformance_required).toBe(true);
    expect(updated.specs["my-spec"]?.overrides).toHaveLength(1);
  });
});

describe("appendOverride", () => {
  test("appends an override entry to a spec (immutable)", () => {
    const state: ConformanceState = {
      version: 1,
      conformance_root: "/x",
      conformance_root_kind: "subfolder",
      specs: {
        "my-spec": {
          conformance_required: true,
          locked: true,
          overrides: [],
        },
      },
    };
    const override = {
      user: "jrede",
      reason: "CI down",
      re_verify_deadline: "2026-05-22T00:00:00Z",
      applied_at: "2026-05-15T14:00:00Z",
    };
    const updated = appendOverride(state, "my-spec", override);
    expect(updated.specs["my-spec"]?.overrides).toHaveLength(1);
    expect(updated.specs["my-spec"]?.overrides[0]?.user).toBe("jrede");
    // Original unchanged
    expect(state.specs["my-spec"]?.overrides).toHaveLength(0);
  });

  test("rejects override on missing spec", () => {
    const state = EMPTY_CONFORMANCE_STATE("/x");
    expect(() =>
      appendOverride(state, "nonexistent", {
        user: "u",
        reason: "r",
        re_verify_deadline: "d",
        applied_at: "a",
      }),
    ).toThrow(/spec/i);
  });
});
