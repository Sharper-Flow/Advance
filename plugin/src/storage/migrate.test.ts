/**
 * Migration Tests
 *
 * Verifies one-time migration of mutable state from in-repo .adv/ to external directory.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { migrateToExternalState } from "./migrate";

describe("migrateToExternalState", () => {
  let repoDir: string;
  let extDir: string;

  beforeEach(async () => {
    repoDir = await createTempDir();
    extDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(repoDir);
    await cleanupTempDir(extDir);
  });

  test("copies changes/ directory from repo to external", async () => {
    // Set up local .adv/changes with a change
    const localChanges = join(repoDir, ".adv/changes/myChange");
    await mkdir(localChanges, { recursive: true });
    await writeFile(join(localChanges, "change.json"), '{"id": "myChange"}');

    await migrateToExternalState(repoDir, extDir);

    // Verify external directory has the change
    const extChangeFile = join(extDir, "changes/myChange/change.json");
    expect(existsSync(extChangeFile)).toBe(true);
    const content = await readFile(extChangeFile, "utf-8");
    expect(JSON.parse(content).id).toBe("myChange");
  });

  test("copies archive/ directory from repo to external", async () => {
    const localArchive = join(repoDir, ".adv/archive/oldChange");
    await mkdir(localArchive, { recursive: true });
    await writeFile(join(localArchive, "change.json"), '{"id": "oldChange"}');

    await migrateToExternalState(repoDir, extDir);

    expect(existsSync(join(extDir, "archive/oldChange/change.json"))).toBe(
      true,
    );
  });

  test("copies db/ directory from repo to external", async () => {
    const localDb = join(repoDir, ".adv/db");
    await mkdir(localDb, { recursive: true });
    await writeFile(join(localDb, "spec.db"), "fake-db-content");

    await migrateToExternalState(repoDir, extDir);

    expect(existsSync(join(extDir, "db/spec.db"))).toBe(true);
  });

  test("copies wisdom.jsonl from repo to external", async () => {
    const localAdv = join(repoDir, ".adv");
    await mkdir(localAdv, { recursive: true });
    await writeFile(
      join(localAdv, "wisdom.jsonl"),
      '{"id":"pw-test","type":"convention","content":"test"}\n',
    );

    await migrateToExternalState(repoDir, extDir);

    expect(existsSync(join(extDir, "wisdom.jsonl"))).toBe(true);
  });

  test("copies agenda.jsonl from repo to external", async () => {
    const localAdv = join(repoDir, ".adv");
    await mkdir(localAdv, { recursive: true });
    await writeFile(
      join(localAdv, "agenda.jsonl"),
      '{"type":"meta","version":"1.0"}\n',
    );

    await migrateToExternalState(repoDir, extDir);

    expect(existsSync(join(extDir, "agenda.jsonl"))).toBe(true);
  });

  test("skips migration if external directory already has changes/", async () => {
    // Set up both local and external with different content
    const localChanges = join(repoDir, ".adv/changes/localChange");
    await mkdir(localChanges, { recursive: true });
    await writeFile(join(localChanges, "change.json"), '{"id": "localChange"}');

    const extChanges = join(extDir, "changes/extChange");
    await mkdir(extChanges, { recursive: true });
    await writeFile(join(extChanges, "change.json"), '{"id": "extChange"}');

    await migrateToExternalState(repoDir, extDir);

    // External should NOT be overwritten — localChange should NOT exist
    expect(existsSync(join(extDir, "changes/localChange"))).toBe(false);
    // Original external content preserved
    expect(existsSync(join(extDir, "changes/extChange/change.json"))).toBe(
      true,
    );
  });

  test("does nothing when no local .adv/ state exists", async () => {
    // No .adv/ directory at all
    await migrateToExternalState(repoDir, extDir);

    // External should remain empty (no changes/, archive/, etc.)
    const extEntries = await readdir(extDir);
    expect(extEntries.length).toBe(0);
  });

  test("leaves local files in place after migration (safety net)", async () => {
    const localChanges = join(repoDir, ".adv/changes/myChange");
    await mkdir(localChanges, { recursive: true });
    await writeFile(join(localChanges, "change.json"), '{"id": "myChange"}');

    await migrateToExternalState(repoDir, extDir);

    // Local files should still exist
    expect(existsSync(join(localChanges, "change.json"))).toBe(true);
  });

  test("returns migration report", async () => {
    const localAdv = join(repoDir, ".adv");
    const localChanges = join(localAdv, "changes/myChange");
    await mkdir(localChanges, { recursive: true });
    await writeFile(join(localChanges, "change.json"), '{"id": "myChange"}');
    await writeFile(join(localAdv, "wisdom.jsonl"), "test\n");

    const report = await migrateToExternalState(repoDir, extDir);

    expect(report.migrated).toContain("changes");
    expect(report.migrated).toContain("wisdom.jsonl");
    expect(report.skipped).not.toContain("changes");
  });
});
