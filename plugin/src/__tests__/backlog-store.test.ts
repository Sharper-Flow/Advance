/**
 * Backlog store primitive tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { createTempDir, cleanupTempDir } from "./setup";
import {
  addBacklogItem,
  archiveBacklogItem,
  getBacklogItem,
  promoteBacklogItem,
  readBacklog,
} from "../utils/backlog-store";

function backlogPath(root: string) {
  return join(root, ".adv", "backlog.jsonl");
}

describe("backlog-store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("backlog-store-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("addBacklogItem creates header and item", async () => {
    const item = await addBacklogItem(tempDir, {
      title: "Feature A",
      success_hint: "Ship feature A",
    });
    expect(item.id).toMatch(/^bl-/);
    expect(item.title).toBe("Feature A");
    expect(item.status).toBe("active");

    const raw = await readFile(backlogPath(tempDir), "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ schemaVersion: 1 });
  });

  test("readBacklog returns active latest items by default", async () => {
    await addBacklogItem(tempDir, { title: "A", success_hint: "a" });
    await addBacklogItem(tempDir, { title: "B", success_hint: "b" });
    const result = await readBacklog(tempDir);
    expect(result.header.schemaVersion).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(result.latestItems).toHaveLength(2);
  });

  test("archiveBacklogItem soft-deletes and read excludes archived", async () => {
    const item = await addBacklogItem(tempDir, {
      title: "A",
      success_hint: "a",
    });
    const archived = await archiveBacklogItem(tempDir, item.id);
    expect(archived?.status).toBe("archived");

    const active = await readBacklog(tempDir);
    expect(active.latestItems).toHaveLength(0);

    const withArchived = await readBacklog(tempDir, { includeArchived: true });
    expect(withArchived.latestItems).toHaveLength(1);
    expect(withArchived.latestItems[0]?.status).toBe("archived");
  });

  test("promoteBacklogItem records target and is idempotent", async () => {
    const item = await addBacklogItem(tempDir, {
      title: "A",
      success_hint: "a",
    });
    const first = await promoteBacklogItem(tempDir, {
      id: item.id,
      kind: "change",
      targetId: "addFoo",
    });
    expect(first.promoted_to).toEqual({
      kind: "change",
      id: "addFoo",
      promoted_at: expect.any(String),
    });

    const second = await promoteBacklogItem(tempDir, {
      id: item.id,
      kind: "change",
      targetId: "addFoo",
    });
    expect(second).toEqual(first);

    const raw = await readFile(backlogPath(tempDir), "utf8");
    // header + original + one promotion record (idempotent second call no-op)
    expect(raw.trim().split("\n")).toHaveLength(3);
  });

  test("promoteBacklogItem refuses archived items", async () => {
    const item = await addBacklogItem(tempDir, {
      title: "A",
      success_hint: "a",
    });
    await archiveBacklogItem(tempDir, item.id);
    await expect(
      promoteBacklogItem(tempDir, {
        id: item.id,
        kind: "change",
        targetId: "addFoo",
      }),
    ).rejects.toMatchObject({ code: "archived" });
  });

  test("malformed JSONL line is reported with line number", async () => {
    await mkdir(join(tempDir, ".adv"), { recursive: true });
    await writeFile(
      backlogPath(tempDir),
      JSON.stringify({ schemaVersion: 1 }) +
        "\n" +
        JSON.stringify({
          id: "ok",
          title: "OK",
          success_hint: "ok",
          status: "active",
          created_at: "t",
          updated_at: "t",
        }) +
        "\nnot-json\n",
    );
    const result = await readBacklog(tempDir);
    expect(result.latestItems).toHaveLength(1);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0]?.line).toBe(3);
    expect(result.malformed[0]?.raw).toBe("not-json");
  });

  test("tail-read returns only last N lines for large files", async () => {
    await mkdir(join(tempDir, ".adv"), { recursive: true });
    const header = JSON.stringify({ schemaVersion: 1 });
    const lines: string[] = [header];
    const padding = "x".repeat(900);
    // ~1200 lines * ~1KB pushes the file above the 1MB threshold.
    for (let i = 0; i < 1200; i += 1) {
      lines.push(
        JSON.stringify({
          id: `bl-${i}`,
          title: `Item ${i} ${padding}`,
          success_hint: "hint",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
      );
    }
    await writeFile(backlogPath(tempDir), lines.join("\n") + "\n");

    const result = await readBacklog(tempDir, { tailLimit: 10 });
    expect(result.latestItems).toHaveLength(10);
    expect(result.latestItems[0]?.id).toBe("bl-1190");
    expect(result.latestItems[9]?.id).toBe("bl-1199");
  });

  test("addBacklogItem reactivates an archived item with the same id", async () => {
    const item = await addBacklogItem(tempDir, {
      id: "bl-1",
      title: "A",
      success_hint: "a",
    });
    await archiveBacklogItem(tempDir, item.id);
    const reactivated = await addBacklogItem(tempDir, {
      id: "bl-1",
      title: "A2",
      success_hint: "a2",
    });
    expect(reactivated.status).toBe("active");
    expect(reactivated.title).toBe("A2");

    const result = await readBacklog(tempDir);
    expect(result.latestItems).toHaveLength(1);
    expect(result.latestItems[0]?.status).toBe("active");
  });

  test("getBacklogItem returns null for missing or archived items", async () => {
    const item = await addBacklogItem(tempDir, {
      title: "A",
      success_hint: "a",
    });
    expect(await getBacklogItem(tempDir, item.id)).toBeTruthy();
    await archiveBacklogItem(tempDir, item.id);
    expect(await getBacklogItem(tempDir, item.id)).toBeNull();
    expect(await getBacklogItem(tempDir, item.id, true)).toBeTruthy();
  });
});
