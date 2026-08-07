/**
 * Spec Tools Tests
 *
 * TDD tests for spec query tools
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { resolveActiveSpecsDir, specTools } from "./spec";
import { createDiskStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  SAMPLE_SPEC,
} from "../__tests__/setup";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

describe("Spec Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createDiskStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("adv_spec", () => {
    test("returns all specs with metadata", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "list" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.specs).toHaveLength(1);
      expect(parsed.specs[0]).toEqual({
        name: "test-capability",
        title: "Test Capability",
        version: "1.0.0",
        requirementCount: 2,
      });
    });

    test("filters by capability name", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "list", capability: "test-capability" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.specs).toHaveLength(1);
      expect(parsed.specs[0].name).toBe("test-capability");
    });

    test("returns empty array for non-matching capability", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "list", capability: "nonexistent" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.specs).toHaveLength(0);
    });

    test("filters by tag", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "list", tag: "security" },
        { store },
      );
      const parsed = JSON.parse(result);

      // test-capability has requirements with "security" tag
      expect(parsed.specs).toHaveLength(1);
    });

    test("returns empty for non-matching tag", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "list", tag: "nonexistent-tag" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.specs).toHaveLength(0);
    });
  });

  describe("adv_spec", () => {
    test("returns full spec with requirements", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "show", capability: "test-capability" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.name).toBe("test-capability");
      expect(parsed.title).toBe("Test Capability");
      expect(parsed.requirements).toHaveLength(2);
      expect(parsed.requirements[0].id).toBe("rq-test0001");
    });

    test("includes scenarios in requirements", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "show", capability: "test-capability" },
        { store },
      );
      const parsed = JSON.parse(result);

      const req = parsed.requirements[0];
      expect(req.scenarios).toHaveLength(2);
      expect(req.scenarios[0].given).toEqual([
        "the system is initialized",
        "a user exists",
      ]);
    });

    test("returns error for nonexistent spec", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "show", capability: "nonexistent" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_spec with worktree context", () => {
    const writeSpec = async (specsDir: string, spec: unknown) => {
      const name = (spec as { name: string }).name;
      await mkdir(join(specsDir, name), { recursive: true });
      await writeFile(
        join(specsDir, name, "spec.json"),
        JSON.stringify(spec, null, 2),
      );
    };

    test("show returns edited spec from context.worktree", async () => {
      const worktree = join(tempDir, "worktree");
      const specsDir = join(worktree, ".adv", "specs");
      await writeSpec(specsDir, {
        ...SAMPLE_SPEC,
        title: "Edited Title from Worktree",
      });

      const result = await specTools.adv_spec.execute(
        { action: "show", capability: "test-capability" },
        { store, worktree },
      );
      const parsed = JSON.parse(result);

      expect(parsed.title).toBe("Edited Title from Worktree");
    });

    test("list returns spec from context.worktree", async () => {
      const worktree = join(tempDir, "worktree");
      const specsDir = join(worktree, ".adv", "specs");
      await writeSpec(specsDir, {
        ...SAMPLE_SPEC,
        title: "Listed from Worktree",
      });

      const result = await specTools.adv_spec.execute(
        { action: "list" },
        { store, worktree },
      );
      const parsed = JSON.parse(result);

      expect(parsed.specs).toHaveLength(1);
      expect(parsed.specs[0].title).toBe("Listed from Worktree");
    });

    test("search scans specs from context.worktree", async () => {
      const worktree = join(tempDir, "worktree");
      const specsDir = join(worktree, ".adv", "specs");
      await writeSpec(specsDir, {
        ...SAMPLE_SPEC,
        requirements: [
          ...(SAMPLE_SPEC.requirements ?? []),
          {
            id: "rq-worktree0001",
            title: "Worktree-only requirement",
            body: "xyzzyworktreeunique phrase",
            priority: "must",
            scenarios: [],
          },
        ],
      });

      const result = await specTools.adv_spec.execute(
        { action: "search", query: "xyzzyworktreeunique" },
        { store, worktree },
      );
      const parsed = JSON.parse(result);

      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].requirement).toBe("rq-worktree0001");
    });

    test("isolation: divergent worktrees each resolve their own specs", async () => {
      const wtA = join(tempDir, "worktree-a");
      const wtB = join(tempDir, "worktree-b");
      await writeSpec(join(wtA, ".adv", "specs"), {
        ...SAMPLE_SPEC,
        title: "Worktree A",
      });
      await writeSpec(join(wtB, ".adv", "specs"), {
        ...SAMPLE_SPEC,
        title: "Worktree B",
      });

      const resA = await specTools.adv_spec.execute(
        { action: "show", capability: "test-capability" },
        { store, worktree: wtA },
      );
      const resB = await specTools.adv_spec.execute(
        { action: "show", capability: "test-capability" },
        { store, worktree: wtB },
      );

      expect(JSON.parse(resA).title).toBe("Worktree A");
      expect(JSON.parse(resB).title).toBe("Worktree B");
    });
  });

  describe("adv_spec", () => {
    test("finds requirements by body content", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "search", query: "authentication" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].requirement).toBe("rq-test0002");
    });

    test("finds requirements by title", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "search", query: "Sample" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].title).toContain("Sample");
    });

    test("respects limit parameter", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "search", query: "requirement", limit: 1 },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.results).toHaveLength(1);
    });

    test("returns empty array for no matches", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "search", query: "xyznonexistent123" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.results).toHaveLength(0);
    });

    test("includes spec name in results", async () => {
      const result = await specTools.adv_spec.execute(
        { action: "search", query: "testing" },
        { store },
      );
      const parsed = JSON.parse(result);

      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].spec).toBe("test-capability");
    });
  });
});

describe("resolveActiveSpecsDir", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const specsDir = (root: string) => join(root, ".adv", "specs");
  const makeSpecsDir = async (root: string) => {
    await mkdir(specsDir(root), { recursive: true });
  };

  test("(a) prefers SDK context.worktree when present and exists", async () => {
    const worktree = join(tempDir, "worktree");
    const fallback = join(tempDir, "fallback", ".adv", "specs");
    await makeSpecsDir(worktree);

    const result = resolveActiveSpecsDir({
      contextWorktree: worktree,
      fallbackSpecsDir: fallback,
    });

    expect(result).toBe(specsDir(worktree));
  });

  test("(b) uses context.directory when it is itself a worktree", async () => {
    const directory = join(tempDir, "worktree-dir");
    const fallback = join(tempDir, "fallback", ".adv", "specs");
    await makeSpecsDir(directory);

    const result = resolveActiveSpecsDir({
      contextDirectory: directory,
      fallbackSpecsDir: fallback,
    });

    expect(result).toBe(specsDir(directory));
  });

  test("(c) falls back to active-change worktree when no context", async () => {
    const activeChangeId = "fixSpecMcpStaleness";
    const fallback = join(tempDir, "fallback", ".adv", "specs");
    const activeWorktree = join(tempDir, "change", activeChangeId);
    await makeSpecsDir(activeWorktree);

    const result = resolveActiveSpecsDir({
      activeChangeId,
      worktreeBase: tempDir,
      fallbackSpecsDir: fallback,
    });

    expect(result).toBe(specsDir(activeWorktree));
  });

  test("(d) returns fallbackSpecsDir when nothing is available", () => {
    const fallback = join(tempDir, "fallback", ".adv", "specs");

    const result = resolveActiveSpecsDir({
      fallbackSpecsDir: fallback,
    });

    expect(result).toBe(fallback);
  });

  test("context.worktree wins over context.directory", async () => {
    const worktree = join(tempDir, "worktree");
    const directory = join(tempDir, "directory");
    await makeSpecsDir(worktree);
    await makeSpecsDir(directory);

    const result = resolveActiveSpecsDir({
      contextWorktree: worktree,
      contextDirectory: directory,
      fallbackSpecsDir: join(tempDir, "fallback"),
    });

    expect(result).toBe(specsDir(worktree));
  });

  test("skips context.worktree branch when its specs dir does not exist", async () => {
    const worktree = join(tempDir, "worktree");
    const directory = join(tempDir, "directory");
    await makeSpecsDir(directory);

    const result = resolveActiveSpecsDir({
      contextWorktree: worktree,
      contextDirectory: directory,
      fallbackSpecsDir: join(tempDir, "fallback"),
    });

    expect(result).toBe(specsDir(directory));
  });
});
