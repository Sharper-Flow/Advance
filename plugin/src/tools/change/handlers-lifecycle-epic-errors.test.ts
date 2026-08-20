import { describe, expect, test, vi } from "vitest";
import { join } from "node:path";

import {
  cleanupTempDir,
  createTempDir,
  parseToolOutput,
} from "../../__tests__/setup";
import type { Epic, Store } from "../../types";
import { changeTools } from "../change";

function epic(id: string): Epic {
  return {
    id,
    kind: "epic",
    title: "Some Epic",
    narrative: "Why this Epic exists",
    entries: [],
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    progress: {
      status: "active",
      total_entries: 0,
      completed_entries: 0,
      active_entries: 0,
      next_entry_id: null,
    },
  } as unknown as Epic;
}

/**
 * Store where the requested id resolves as an Epic and not as a change —
 * the shape that made artifact updates report a nonexistent change.
 */
function storeWithEpic(root: string, found: Epic | undefined): Store {
  return {
    paths: {
      root,
      changes: join(root, "changes"),
      archive: join(root, "archive"),
    },
    config: null,
    changes: {
      get: vi.fn(async () => ({ success: true, data: undefined })),
      listSummary: vi.fn(async () => ({ changes: [] })),
      list: vi.fn(async () => ({ changes: [] })),
      save: vi.fn(async () => {}),
    },
    epics: {
      get: vi.fn(async () => ({ success: true, data: found })),
    },
  } as unknown as Store;
}

describe("adv_change_update — Epic ids are reported as Epics", () => {
  test("an artifact update against an Epic id returns a typed Epic error", async () => {
    const root = await createTempDir("adv-lifecycle-epic-errors-");
    try {
      const parsed = parseToolOutput(
        await changeTools.adv_change_update.execute(
          { changeId: "someEpic", problemStatement: "content" },
          storeWithEpic(root, epic("someEpic")),
        ),
      );

      expect(parsed.code).toBe("EPIC_ARTIFACTS_UNSUPPORTED");
      expect(String(parsed.error)).not.toContain("not found");
      // The reply must name the Epic's own narrative field so the caller can
      // retry without a schema lookup.
      expect(JSON.stringify(parsed)).toContain("narrative");
      expect(String(parsed.hint)).toContain("tools.adv.epic_show");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("a genuinely unknown id still reports change-not-found", async () => {
    const root = await createTempDir("adv-lifecycle-epic-errors-");
    try {
      const parsed = parseToolOutput(
        await changeTools.adv_change_update.execute(
          { changeId: "ghostChange", problemStatement: "content" },
          storeWithEpic(root, undefined),
        ),
      );

      expect(parsed.code).not.toBe("EPIC_ARTIFACTS_UNSUPPORTED");
      expect(String(parsed.error)).toContain("not found");
      expect(String(parsed.hint)).toContain("adv_change_list");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("an unreadable Epic store still reports change-not-found", async () => {
    const root = await createTempDir("adv-lifecycle-epic-errors-");
    try {
      const store = storeWithEpic(root, undefined);
      (store as unknown as { epics: { get: unknown } }).epics = {
        get: vi.fn(async () => {
          throw new Error("epic store unreachable");
        }),
      };

      const parsed = parseToolOutput(
        await changeTools.adv_change_update.execute(
          { changeId: "ghostChange", problemStatement: "content" },
          store,
        ),
      );

      expect(String(parsed.error)).toContain("not found");
    } finally {
      await cleanupTempDir(root);
    }
  });
});
