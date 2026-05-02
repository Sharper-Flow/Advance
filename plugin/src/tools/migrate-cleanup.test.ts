/**
 * Migrate Cleanup Tool Tests
 *
 * Detects and (with approval) removes legacy in-repo `.adv/{changes,archive,db,agenda.json,agenda.jsonl}`
 * while always preserving `.adv/specs/`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, writeFile, access } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { migrateCleanupTools } from "./migrate-cleanup";
import type { Store } from "../storage/store";

const execFileAsync = promisify(execFile);

// =============================================================================
// Test fixture builders
// =============================================================================

interface FixtureLayout {
  testDir: string;
  advDir: string;
}

async function buildFixture(): Promise<FixtureLayout> {
  const testDir = await createTempDir();
  const advDir = join(testDir, ".adv");
  await mkdir(advDir, { recursive: true });
  return { testDir, advDir };
}

async function initGitRepo(dir: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], {
    cwd: dir,
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: dir,
  });
  // Create an initial commit so git commit in the tool works
  await writeFile(join(dir, "initial.txt"), "initial");
  await execFileAsync("git", ["add", "."], { cwd: dir });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: dir });
}

function makeStub(root: string): Store {
  return {
    paths: {
      root,
    },
  } as unknown as Store;
}

// =============================================================================
// Tool tests
// =============================================================================

describe("adv_migrate_cleanup tool", () => {
  let fixture: FixtureLayout;

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  afterEach(async () => {
    await cleanupTempDir(fixture.testDir);
  });

  it("dryRun detects legacy in-repo state and reports counts", async () => {
    await mkdir(join(fixture.advDir, "changes"), { recursive: true });
    await mkdir(join(fixture.advDir, "archive"), { recursive: true });
    await mkdir(join(fixture.advDir, "db"), { recursive: true });
    await writeFile(join(fixture.advDir, "agenda.jsonl"), "[]");
    await writeFile(join(fixture.advDir, "agenda.json"), "{}");
    await mkdir(join(fixture.advDir, "specs"), { recursive: true });

    const out = await migrateCleanupTools.adv_migrate_cleanup.execute(
      { dryRun: true },
      makeStub(fixture.testDir),
    );
    const parsed = JSON.parse(out);

    expect(parsed.success).toBe(true);
    expect(parsed.detected).toEqual({
      changes_dirs: 1,
      archive_dirs: 1,
      db_present: true,
      agenda_jsonl_present: true,
      agenda_json_present: true,
    });
    expect(parsed.preserved).toEqual({ specs: true });
    expect(parsed.backup_dir).toBeUndefined();
    expect(parsed.deleted).toBeUndefined();
    expect(parsed.git_commit_sha).toBeUndefined();
  });

  it("dryRun is default when no dryRun arg is provided", async () => {
    await mkdir(join(fixture.advDir, "changes"), { recursive: true });
    await mkdir(join(fixture.advDir, "specs"), { recursive: true });

    const out = await migrateCleanupTools.adv_migrate_cleanup.execute(
      {},
      makeStub(fixture.testDir),
    );
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.detected.changes_dirs).toBe(1);
    expect(parsed.preserved.specs).toBe(true);
  });

  it("execute mode backs up, deletes legacy paths, preserves specs, and commits", async () => {
    await initGitRepo(fixture.testDir);

    await mkdir(join(fixture.advDir, "changes", "some-change"), {
      recursive: true,
    });
    await writeFile(
      join(fixture.advDir, "changes", "some-change", "change.json"),
      "{}",
    );
    await mkdir(join(fixture.advDir, "archive", "2026-01-01-x"), {
      recursive: true,
    });
    await mkdir(join(fixture.advDir, "db"), { recursive: true });
    await writeFile(join(fixture.advDir, "agenda.jsonl"), "[]");
    await writeFile(join(fixture.advDir, "agenda.json"), "{}");
    await mkdir(join(fixture.advDir, "specs", "cap"), { recursive: true });
    await writeFile(join(fixture.advDir, "specs", "cap", "spec.json"), "{}");

    const out = await migrateCleanupTools.adv_migrate_cleanup.execute(
      { dryRun: false },
      makeStub(fixture.testDir),
    );
    const parsed = JSON.parse(out);

    expect(parsed.success).toBe(true);
    expect(parsed.backup_dir).toBeDefined();
    expect(typeof parsed.backup_dir).toBe("string");
    expect(parsed.deleted).toContain("changes");
    expect(parsed.deleted).toContain("archive");
    expect(parsed.deleted).toContain("db");
    expect(parsed.deleted).toContain("agenda.jsonl");
    expect(parsed.deleted).toContain("agenda.json");
    expect(parsed.git_commit_sha).toBeDefined();
    expect(typeof parsed.git_commit_sha).toBe("string");

    // Legacy paths removed
    await expect(access(join(fixture.advDir, "changes"))).rejects.toThrow();
    await expect(access(join(fixture.advDir, "archive"))).rejects.toThrow();
    await expect(access(join(fixture.advDir, "db"))).rejects.toThrow();
    await expect(
      access(join(fixture.advDir, "agenda.jsonl")),
    ).rejects.toThrow();
    await expect(access(join(fixture.advDir, "agenda.json"))).rejects.toThrow();

    // Specs preserved
    await access(join(fixture.advDir, "specs", "cap", "spec.json"));

    // Backup contains the legacy items
    const backupAdvDir = join(parsed.backup_dir, ".adv");
    await access(join(backupAdvDir, "changes", "some-change", "change.json"));
    await access(join(backupAdvDir, "archive", "2026-01-01-x"));
    await access(join(backupAdvDir, "db"));
    await access(join(backupAdvDir, "agenda.jsonl"));
    await access(join(backupAdvDir, "agenda.json"));
    await access(join(backupAdvDir, "specs", "cap", "spec.json"));

    // Git commit exists
    const { stdout } = await execFileAsync("git", [
      "-C",
      fixture.testDir,
      "log",
      "-1",
      "--pretty=%s",
    ]);
    expect(stdout.trim()).toBe(
      "chore(adv): remove legacy in-repo state superseded by external store",
    );
  });

  it("execute mode skips git commit when target is not a git repo", async () => {
    await mkdir(join(fixture.advDir, "changes"), { recursive: true });
    await mkdir(join(fixture.advDir, "specs"), { recursive: true });

    const out = await migrateCleanupTools.adv_migrate_cleanup.execute(
      { dryRun: false },
      makeStub(fixture.testDir),
    );
    const parsed = JSON.parse(out);

    expect(parsed.success).toBe(true);
    expect(parsed.git_commit_sha).toBeNull();
    await expect(access(join(fixture.advDir, "changes"))).rejects.toThrow();
    await access(join(fixture.advDir, "specs"));
  });

  it("dryRun description includes safety boilerplate", () => {
    const dryRunSchema = migrateCleanupTools.adv_migrate_cleanup.args.dryRun;
    const description = (dryRunSchema as any).description;
    expect(description).toContain(
      "read-only and safe to invoke without approval",
    );
  });
});
