/**
 * Backlog shell MCP tool tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { createTempDir, cleanupTempDir, parseToolOutput } from "./setup";
import { backlogShellTools } from "../tools/backlog-shell";
import type { Store } from "../storage/store";

function createMockStore(root: string): Store {
  return {
    paths: {
      root,
      projectMetadata: join(root, ".adv", "project-metadata.json"),
      specs: join(root, ".adv", "specs"),
      changes: join(root, ".adv", "changes"),
      archive: join(root, ".adv", "archive"),
      db: join(root, ".adv", "db"),
      wisdom: join(root, ".adv", "wisdom.jsonl"),
      agenda: join(root, ".adv", "agenda.jsonl"),
      docs: join(root, "docs", "specs"),
      config: join(root, "project.json"),
      external: null,
    },
  } as unknown as Store;
}

describe("backlog-shell tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir("backlog-shell-");
    store = createMockStore(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("adv_backlog_add creates an item", async () => {
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_add.execute(
        { title: "Feature A", success_hint: "Ship it" },
        store,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.item.title).toBe("Feature A");
  });

  test("adv_backlog_list returns added items", async () => {
    await backlogShellTools.adv_backlog_add.execute(
      { title: "A", success_hint: "a" },
      store,
    );
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_list.execute({}, store),
    );
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  test("adv_backlog_show returns one item", async () => {
    const added = parseToolOutput(
      await backlogShellTools.adv_backlog_add.execute(
        { title: "A", success_hint: "a" },
        store,
      ),
    );
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_show.execute(
        { id: added.item.id },
        store,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.item.title).toBe("A");
  });

  test("adv_backlog_promote records promotion target", async () => {
    const added = parseToolOutput(
      await backlogShellTools.adv_backlog_add.execute(
        { title: "A", success_hint: "a" },
        store,
      ),
    );
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_promote.execute(
        { id: added.item.id, kind: "change", target_id: "addFoo" },
        store,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.item.promoted_to).toEqual({
      kind: "change",
      id: "addFoo",
      promoted_at: expect.any(String),
    });
  });

  test("adv_backlog_promote refuses archived items", async () => {
    const added = parseToolOutput(
      await backlogShellTools.adv_backlog_add.execute(
        { title: "A", success_hint: "a" },
        store,
      ),
    );
    await backlogShellTools.adv_backlog_archive.execute(
      { id: added.item.id },
      store,
    );
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_promote.execute(
        { id: added.item.id, kind: "change", target_id: "addFoo" },
        store,
      ),
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("archived");
  });

  test("adv_backlog_archive soft-deletes an item", async () => {
    const added = parseToolOutput(
      await backlogShellTools.adv_backlog_add.execute(
        { title: "A", success_hint: "a" },
        store,
      ),
    );
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_archive.execute(
        { id: added.item.id },
        store,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.item.status).toBe("archived");

    const list = parseToolOutput(
      await backlogShellTools.adv_backlog_list.execute({}, store),
    );
    expect(list.count).toBe(0);
  });

  test("adv_backlog_add persists a valid context_packet", async () => {
    const packet = {
      background: "Some background",
      constraints: ["Must be fast"],
    };
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_add.execute(
        { title: "A", success_hint: "a", context_packet: packet },
        store,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.item.context_packet).toEqual(packet);
  });

  test("adv_backlog_add rejects an invalid context_packet", async () => {
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_add.execute(
        { title: "A", success_hint: "a", context_packet: "not-an-object" },
        store,
      ),
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("invalid_context_packet");

    const list = parseToolOutput(
      await backlogShellTools.adv_backlog_list.execute({}, store),
    );
    expect(list.count).toBe(0);
  });

  test("adv_backlog_add rejects an oversize context_packet", async () => {
    const packet = {
      background: "y".repeat(4096),
      design_seed: "x".repeat(6144),
      constraints: Array.from({ length: 12 }, () => "z".repeat(512)),
      avoidances: Array.from({ length: 12 }, () => "w".repeat(512)),
    };
    const result = parseToolOutput(
      await backlogShellTools.adv_backlog_add.execute(
        { title: "A", success_hint: "a", context_packet: packet },
        store,
      ),
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("context_packet_too_large");

    const list = parseToolOutput(
      await backlogShellTools.adv_backlog_list.execute({}, store),
    );
    expect(list.count).toBe(0);
  });
});
