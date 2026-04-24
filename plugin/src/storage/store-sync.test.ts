/**
 * Store Sync Tests
 *
 * TDD tests for spec-cache reconciliation in ensureAllSpecsSynced().
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { createLegacyStore, type Store } from "./store";
import { createSQLiteStore, type SQLiteStore } from "./sqlite";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
  SAMPLE_SPEC,
} from "../__tests__/setup";

describe("store-sync spec reconciliation", () => {
  let tempDir: string;
  let store: Store;
  let sqlite: SQLiteStore;

  async function writeSpec(name: string, searchTerm: string) {
    const spec = {
      ...SAMPLE_SPEC,
      name,
      title: `${name} title`,
      purpose: `${name} purpose`,
      requirements: [
        {
          id: `rq-${name}-0001`,
          title: `${name} requirement`,
          body: `Requirement body with ${searchTerm} keyword.`,
          priority: "must" as const,
          tags: [searchTerm],
          scenarios: [
            {
              id: `rq-${name}-0001.1`,
              title: `${name} scenario`,
              given: ["a spec exists"],
              when: "the cache sync runs",
              then: ["the spec is indexed"],
            },
          ],
        },
      ],
    };

    const dir = join(tempDir, ".adv/specs", name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "spec.json"), JSON.stringify(spec, null, 2));
  }

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir, { withChanges: false });
    store = await createLegacyStore(tempDir);
    sqlite = createSQLiteStore(join(tempDir, ".adv/db/spec.db"));
  });

  afterEach(async () => {
    sqlite.db.close();
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("indexes spec content into list and search before prune", async () => {
    const list = await store.specs.list();
    const search = await store.specs.search("authentication");

    expect(list.specs.map((s) => s.name)).toContain("test-capability");
    expect(search.some((r) => r.spec === "test-capability")).toBe(true);
  });

  test("removes deleted spec from list and search after store.sync", async () => {
    await store.specs.list();
    await rm(join(tempDir, ".adv/specs/test-capability"), {
      recursive: true,
      force: true,
    });

    await store.sync();

    const list = await store.specs.list();
    const search = await store.specs.search("authentication");

    expect(list.specs.map((s) => s.name)).not.toContain("test-capability");
    expect(search.some((r) => r.spec === "test-capability")).toBe(false);
  });

  test("prunes specs, requirements, scenarios, and sync_files rows for deleted specs", async () => {
    await store.specs.list();
    const deletedJsonPath = join(
      tempDir,
      ".adv/specs/test-capability/spec.json",
    );

    await rm(join(tempDir, ".adv/specs/test-capability"), {
      recursive: true,
      force: true,
    });
    await store.sync();

    const specRow = sqlite.specs.get("test-capability");
    const reqRows = sqlite.requirements.list("test-capability");
    const scenarioRows = sqlite.db
      .query("SELECT * FROM scenarios WHERE requirement_id LIKE 'rq-test%'")
      .all() as unknown[];
    const ftsRows = sqlite.db
      .query("SELECT * FROM requirements_fts WHERE id LIKE 'rq-test%'")
      .all() as unknown[];
    const syncRow = sqlite.syncFiles.getFileAttrs(deletedJsonPath);

    expect(specRow).toBeNull();
    expect(reqRows).toHaveLength(0);
    expect(scenarioRows).toHaveLength(0);
    expect(ftsRows).toHaveLength(0);
    expect(syncRow).toBeNull();
  });

  test("pruning one spec does not affect other specs still on disk", async () => {
    await writeSpec("second-capability", "secondarykeyword");
    await store.sync();

    await rm(join(tempDir, ".adv/specs/test-capability"), {
      recursive: true,
      force: true,
    });
    await store.sync();

    const list = await store.specs.list();
    const search = await store.specs.search("secondarykeyword");

    expect(list.specs.map((s) => s.name)).toContain("second-capability");
    expect(list.specs.map((s) => s.name)).not.toContain("test-capability");
    expect(search.some((r) => r.spec === "second-capability")).toBe(true);
    expect(search.some((r) => r.spec === "test-capability")).toBe(false);
  });

  test("does not mark a missing spec as synced in the current session", async () => {
    const missingBefore = await store.specs.get("late-capability");
    expect(missingBefore.success).toBe(true);
    expect(missingBefore.data).toBeNull();

    await writeSpec("late-capability", "latekeyword");

    const presentAfter = await store.specs.get("late-capability");
    expect(presentAfter.success).toBe(true);
    expect(presentAfter.data?.name).toBe("late-capability");
  });
});
