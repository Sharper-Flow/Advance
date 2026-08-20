import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  parseToolOutput,
} from "../../__tests__/setup";
import { createDiskStore } from "../../storage/store-disk";
import type { Store } from "../../types";
import { changeTools } from "../change";

describe("adv_change_create local Epic seed", () => {
  let projectDir: string;
  let store: Store;

  beforeEach(async () => {
    projectDir = await createTempDir("adv-local-epic-seed-");
    store = await createDiskStore(projectDir);
    await store.init();
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(projectDir);
  });

  test("rejects a seed naming a missing Epic before creating a change", async () => {
    const parsed = parseToolOutput(
      await changeTools.adv_change_create.execute(
        {
          summary: "Missing local Epic",
          epic_id: "missing-epic",
          entry_id: "entry-1",
          epic_title: "Caller title",
        },
        store,
      ),
    );

    expect(parsed.code).toBe("EPIC_NOT_FOUND");
    expect((await store.changes.list({})).changes).toHaveLength(0);
  });

  test("rejects a seed naming a missing entry with the creation hint", async () => {
    await store.epics.create("local-epic", "Local Epic", "Narrative");

    const parsed = parseToolOutput(
      await changeTools.adv_change_create.execute(
        {
          summary: "Missing local entry",
          epic_id: "local-epic",
          entry_id: "missing-entry",
          epic_title: "Caller title",
        },
        store,
      ),
    );

    expect(parsed.code).toBe("ENTRY_NOT_FOUND");
    expect(String(parsed.hint)).toContain("parent_epic_id");
    expect((await store.changes.list({})).changes).toHaveLength(0);
  });

  test("persists the entry-derived projection instead of seed content", async () => {
    await store.epics.create("local-epic", "Local Epic", "Narrative");
    const entry = await store.epics.linkChange("local-epic", {
      entryId: "entry-1",
      changeId: "existing-change",
      title: "Authoritative entry title",
    });

    const parsed = parseToolOutput(
      await changeTools.adv_change_create.execute(
        {
          summary: "Derived local membership",
          epic_id: "local-epic",
          entry_id: "entry-1",
          epic_order: 99,
          epic_title: "Caller supplied title",
        },
        store,
      ),
    );

    expect(parsed.epic_membership).toEqual({
      epic_id: "local-epic",
      entry_id: "entry-1",
      order: entry.order,
      title: entry.title,
      linked_at: entry.linked_at,
      source: "create",
    });
    const created = await store.changes.get(parsed.changeId);
    expect(created.success && created.data?.epic_membership).toEqual(
      parsed.epic_membership,
    );
  });
});
