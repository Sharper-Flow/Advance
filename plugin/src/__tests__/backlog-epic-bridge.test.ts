/**
 * Backlog-to-Epic bridge tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { createTempDir, cleanupTempDir, parseToolOutput } from "./setup";
import { epicTools } from "../tools/epic";
import { addBacklogItem, archiveBacklogItem } from "../utils/backlog-store";
import { EpicEntrySchema } from "../types";
import type { Store } from "../storage/store";

function createMockStore(
  root: string,
  addShell: Store["epics"]["addShell"],
): Store {
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
    changes: {
      // buildD3ContextFromStore (D3 shell-add enforcement, added by #293)
      // queries the store for the work graph; provide an empty graph so the
      // shell-add proceeds without D3 blockers in this unit context.
      list: async () => ({ changes: [] }),
      get: async () => ({ success: false, error: "not found" }),
    },
    epics: {
      addShell,
      get: async () => ({ success: false, error: "not found" }),
      list: async () => [],
    },
  } as unknown as Store;
}

describe("backlog-epic bridge", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("backlog-epic-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("EpicShellEntry schema validates imported_from", () => {
    const valid = {
      kind: "shell",
      entry_id: "shell-1",
      order: 0,
      title: "T",
      success_hint: "H",
      imported_from: {
        backlog_id: "bl-1",
        imported_at: "2026-01-01T00:00:00Z",
      },
    };
    expect(EpicEntrySchema.parse(valid).kind).toBe("shell");
  });

  test("adv_epic_add_shell derives title/success_hint from backlog_ref", async () => {
    const item = await addBacklogItem(tempDir, {
      id: "bl-derived",
      title: "Backlog Title",
      success_hint: "Backlog Hint",
    });

    let capturedInput: Parameters<Store["epics"]["addShell"]>[1] | undefined;
    const store = createMockStore(tempDir, async (_epicId, input) => {
      capturedInput = input;
      return {
        kind: "shell",
        entry_id: "shell-1",
        order: 0,
        title: input.title,
        success_hint: input.successHint,
        ...(input.importedFrom ? { imported_from: input.importedFrom } : {}),
      } as import("../types").EpicEntry;
    });

    const result = parseToolOutput(
      await epicTools.adv_epic_add_shell.execute(
        { epic_id: "epic", backlog_ref: item.id },
        store,
      ),
    );
    expect(result.success).toBe(true);
    expect(capturedInput?.title).toBe("Backlog Title");
    expect(capturedInput?.successHint).toBe("Backlog Hint");
    expect(capturedInput?.importedFrom).toEqual({
      backlog_id: item.id,
      imported_at: expect.any(String),
    });
  });

  test("adv_epic_add_shell refuses archived backlog import", async () => {
    const item = await addBacklogItem(tempDir, {
      id: "bl-archived",
      title: "Archived",
      success_hint: "Hint",
    });
    await archiveBacklogItem(tempDir, item.id);

    const store = createMockStore(tempDir, async () => {
      throw new Error("addShell should not be called");
    });

    const result = parseToolOutput(
      await epicTools.adv_epic_add_shell.execute(
        { epic_id: "epic", backlog_ref: item.id },
        store,
      ),
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("backlog_archived");
  });
});
