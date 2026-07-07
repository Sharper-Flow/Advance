/**
 * Backlog migration tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { createTempDir, cleanupTempDir } from "./setup";
import {
  migrateBacklog,
  requireCurrentSchemaOrConsent,
  parseBacklogSchemaVersion,
  BacklogMigrationError,
} from "../utils/backlog-migrations";
import { readBacklog } from "../utils/backlog-store";

function backlogPath(root: string) {
  return join(root, ".adv", "backlog.jsonl");
}

describe("backlog-migrations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("backlog-migration-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("v0→v1 migrator upgrades header and items", async () => {
    await mkdir(join(tempDir, ".adv"), { recursive: true });
    await writeFile(
      backlogPath(tempDir),
      JSON.stringify({ schemaVersion: 0 }) +
        "\n" +
        JSON.stringify({ id: "bl-old", title: "Old Item" }) +
        "\n",
    );

    const result = await migrateBacklog(tempDir, {
      consent: true,
      migratedAt: "2026-01-01T00:00:00Z",
    });
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(1);

    const raw = await readFile(backlogPath(tempDir), "utf8");
    const lines = raw.trim().split("\n");
    expect(JSON.parse(lines[0]!)).toEqual({ schemaVersion: 1 });

    const migrated = JSON.parse(lines[1]!) as {
      id: string;
      title: string;
      success_hint: string;
      status: string;
      created_at: string;
      updated_at: string;
    };
    expect(migrated.id).toBe("bl-old");
    expect(migrated.title).toBe("Old Item");
    expect(migrated.status).toBe("active");
    expect(migrated.created_at).toBe("2026-01-01T00:00:00Z");
    expect(migrated.updated_at).toBe("2026-01-01T00:00:00Z");

    const readResult = await readBacklog(tempDir);
    expect(readResult.header.schemaVersion).toBe(1);
    expect(readResult.latestItems).toHaveLength(1);
  });

  test("migrateBacklog creates current header for missing file", async () => {
    const result = await migrateBacklog(tempDir, { consent: true });
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(1);
    const raw = await readFile(backlogPath(tempDir), "utf8");
    expect(JSON.parse(raw.trim())).toEqual({ schemaVersion: 1 });
  });

  test("migrateBacklog throws already_current when at v1", async () => {
    await migrateBacklog(tempDir, { consent: true });
    await expect(
      migrateBacklog(tempDir, { consent: true }),
    ).rejects.toMatchObject({ code: "already_current" });
  });

  test("requireCurrentSchemaOrConsent allows current version", () => {
    const result = requireCurrentSchemaOrConsent({ schemaVersion: 1 });
    expect(result.writable).toBe(true);
  });

  test("requireCurrentSchemaOrConsent refuses old schema without consent", () => {
    expect(() => requireCurrentSchemaOrConsent({ schemaVersion: 0 })).toThrow(
      BacklogMigrationError,
    );
  });

  test("parseBacklogSchemaVersion returns 0 for missing header and 1 for v1", () => {
    expect(parseBacklogSchemaVersion({ schemaVersion: 0 })).toBe(0);
    expect(parseBacklogSchemaVersion({ schemaVersion: 1 })).toBe(1);
    expect(
      parseBacklogSchemaVersion(null as unknown as { schemaVersion: number }),
    ).toBe(0);
  });
});
