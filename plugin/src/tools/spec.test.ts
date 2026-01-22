/**
 * Spec Tools Tests
 *
 * TDD tests for spec query tools
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { specTools } from "./spec";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";

describe("Spec Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("adv_spec_list", () => {
    test("returns all specs with metadata", async () => {
      const result = await specTools.adv_spec_list.execute({}, store);
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
      const result = await specTools.adv_spec_list.execute(
        { capability: "test-capability" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.specs).toHaveLength(1);
      expect(parsed.specs[0].name).toBe("test-capability");
    });

    test("returns empty array for non-matching capability", async () => {
      const result = await specTools.adv_spec_list.execute(
        { capability: "nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.specs).toHaveLength(0);
    });

    test("filters by tag", async () => {
      const result = await specTools.adv_spec_list.execute(
        { tag: "security" },
        store,
      );
      const parsed = JSON.parse(result);

      // test-capability has requirements with "security" tag
      expect(parsed.specs).toHaveLength(1);
    });

    test("returns empty for non-matching tag", async () => {
      const result = await specTools.adv_spec_list.execute(
        { tag: "nonexistent-tag" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.specs).toHaveLength(0);
    });
  });

  describe("adv_spec_show", () => {
    test("returns full spec with requirements", async () => {
      const result = await specTools.adv_spec_show.execute(
        { capability: "test-capability" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.name).toBe("test-capability");
      expect(parsed.title).toBe("Test Capability");
      expect(parsed.requirements).toHaveLength(2);
      expect(parsed.requirements[0].id).toBe("rq-test0001");
    });

    test("includes scenarios in requirements", async () => {
      const result = await specTools.adv_spec_show.execute(
        { capability: "test-capability" },
        store,
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
      const result = await specTools.adv_spec_show.execute(
        { capability: "nonexistent" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("adv_spec_search", () => {
    test("finds requirements by body content", async () => {
      const result = await specTools.adv_spec_search.execute(
        { query: "authentication" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].requirement).toBe("rq-test0002");
    });

    test("finds requirements by title", async () => {
      const result = await specTools.adv_spec_search.execute(
        { query: "Sample" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].title).toContain("Sample");
    });

    test("respects limit parameter", async () => {
      const result = await specTools.adv_spec_search.execute(
        { query: "requirement", limit: 1 },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.results).toHaveLength(1);
    });

    test("returns empty array for no matches", async () => {
      const result = await specTools.adv_spec_search.execute(
        { query: "xyznonexistent123" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.results).toHaveLength(0);
    });

    test("includes spec name in results", async () => {
      const result = await specTools.adv_spec_search.execute(
        { query: "testing" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].spec).toBe("test-capability");
    });
  });
});
