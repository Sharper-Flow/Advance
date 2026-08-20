import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ToolDefinition } from "@opencode-ai/plugin";

import {
  cleanupTempDir,
  createTempDir,
  parseToolOutput,
} from "../../__tests__/setup";
import { createDiskStore } from "../../storage/store-disk";
import type { Store } from "../../types";
import { createToolMap } from "../../tool-registry";

type ToolMap = Record<string, unknown>;

function asTool(definition: unknown): ToolDefinition {
  return definition as ToolDefinition;
}

async function callTool(
  map: ToolMap,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, any>> {
  const result = await asTool(map[name]).execute(args, undefined);
  const output =
    typeof result === "string"
      ? result
      : typeof result === "object" && result !== null && "output" in result
        ? String((result as { output: unknown }).output)
        : JSON.stringify(result);
  return parseToolOutput(output) as Record<string, any>;
}

describe("adv_change_update Epic structural facade", () => {
  let projectDir: string;
  let store: Store;
  let map: ToolMap;

  beforeEach(async () => {
    projectDir = await createTempDir("adv-epic-facade-");
    store = await createDiskStore(projectDir);
    await store.init();
    map = createToolMap(store, projectDir) as ToolMap;
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(projectDir);
  });

  test("links, reads, unlinks, and reorders through the registered surface", async () => {
    const epicId = "facade-epic";
    await store.epics.create(
      epicId,
      "Facade Epic",
      "Epic facade integration test",
    );
    const firstChange = await store.changes.create("First facade change");
    const secondChange = await store.changes.create("Second facade change");

    const initialEpic = await store.epics.get(epicId);
    expect(initialEpic.success && initialEpic.data).toBeTruthy();
    expect(initialEpic.data?.version).toBe(0);
    expect(initialEpic.data?.entries).toHaveLength(0);

    const linked = await callTool(map, "adv_change_update", {
      changeId: epicId,
      link_change: firstChange.changeId,
    });
    expect(linked.success).toBe(true);

    const linkedEpicResult = await store.epics.get(epicId);
    expect(linkedEpicResult.success && linkedEpicResult.data).toBeTruthy();
    const linkedEpic = linkedEpicResult.data!;
    expect(linkedEpic.version).toBeGreaterThan(initialEpic.data!.version);
    expect(linkedEpic.entries).toHaveLength(1);
    const firstEntry = linkedEpic.entries[0];
    expect(firstEntry?.kind).toBe("change");
    if (firstEntry?.kind !== "change") throw new Error("Expected change entry");
    expect(firstEntry.change_id).toBe(firstChange.changeId);

    const linkedChildResult = await store.changes.get(firstChange.changeId);
    expect(linkedChildResult.success && linkedChildResult.data).toBeTruthy();
    expect(linkedChildResult.data?.epic_membership).toEqual({
      epic_id: epicId,
      entry_id: firstEntry.entry_id,
      order: firstEntry.order,
      title: firstEntry.title,
      linked_at: firstEntry.linked_at,
      source: "link_existing",
    });

    const epicRead = await callTool(map, "adv_change_show", {
      changeId: epicId,
      include: { entries: true },
    });
    expect(epicRead.epic.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "change",
          entry_id: firstEntry.entry_id,
          change_id: firstEntry.change_id,
          order: firstEntry.order,
          title: firstEntry.title,
          linked_at: firstEntry.linked_at,
        }),
      ]),
    );

    const childRead = await callTool(map, "adv_change_show", {
      changeId: firstChange.changeId,
    });
    expect(childRead.epic_membership).toEqual(
      linkedChildResult.data?.epic_membership,
    );
    expect(childRead.epic_membership_verification).toBe("verified");

    const unlinked = await callTool(map, "adv_change_update", {
      changeId: epicId,
      unlink_change: firstChange.changeId,
    });
    expect(unlinked.success).toBe(true);

    const unlinkedEpicResult = await store.epics.get(epicId);
    expect(unlinkedEpicResult.success && unlinkedEpicResult.data).toBeTruthy();
    expect(unlinkedEpicResult.data?.entries).toHaveLength(0);
    const unlinkedChild = await store.changes.get(firstChange.changeId);
    expect(unlinkedChild.success && unlinkedChild.data).toBeTruthy();
    expect(unlinkedChild.data?.epic_membership).toBeUndefined();

    await callTool(map, "adv_change_update", {
      changeId: epicId,
      link_change: firstChange.changeId,
    });
    await callTool(map, "adv_change_update", {
      changeId: epicId,
      link_change: secondChange.changeId,
    });
    const beforeReorderResult = await store.epics.get(epicId);
    expect(
      beforeReorderResult.success && beforeReorderResult.data,
    ).toBeTruthy();
    const beforeReorder = beforeReorderResult.data!;
    const entriesByChange = new Map(
      beforeReorder.entries
        .filter(
          (entry): entry is Extract<typeof entry, { kind: "change" }> =>
            entry.kind === "change",
        )
        .map((entry) => [entry.change_id, entry]),
    );
    const firstEntryAgain = entriesByChange.get(firstChange.changeId)!;
    const secondEntry = entriesByChange.get(secondChange.changeId)!;

    const reordered = await callTool(map, "adv_change_update", {
      changeId: epicId,
      reorder_entries: [secondEntry.entry_id, firstEntryAgain.entry_id],
    });
    expect(reordered.success).toBe(true);

    const reorderedEpicResult = await store.epics.get(epicId);
    expect(
      reorderedEpicResult.success && reorderedEpicResult.data,
    ).toBeTruthy();
    const reorderedEpic = reorderedEpicResult.data!;
    expect(reorderedEpic.entries.map((entry) => entry.entry_id)).toEqual([
      secondEntry.entry_id,
      firstEntryAgain.entry_id,
    ]);
    expect(reorderedEpic.entries.map((entry) => entry.order)).toEqual([0, 1]);
  });

  test("keeps Epic identity and preflight refusals on the surface", async () => {
    const epicId = "facade-errors-epic";
    await store.epics.create(epicId, "Facade Error Epic", "Error cases");
    const change = await store.changes.create("Facade child change");

    const changeAsEpic = await callTool(map, "adv_change_update", {
      changeId: change.changeId,
      link_change: "another-change",
    });
    expect(changeAsEpic.code).toBe("EPIC_REQUIRED");

    const unknownEpic = await callTool(map, "adv_change_update", {
      changeId: "missing-epic",
      link_change: change.changeId,
    });
    expect(unknownEpic.code).toBe("EPIC_REQUIRED");
    expect(unknownEpic.error).toContain("Epic not found");

    const mixedOperation = await callTool(map, "adv_change_update", {
      changeId: epicId,
      proposal: "not allowed with structural operation",
      link_change: change.changeId,
    });
    expect(mixedOperation.code).toBe("INVALID_TOOL_ARGS");
    expect(mixedOperation.invalid[0].message).toContain(
      "one operation at a time",
    );

    const blankLink = await callTool(map, "adv_change_update", {
      changeId: epicId,
      link_change: "   ",
    });
    expect(blankLink.code).toBe("INVALID_TOOL_ARGS");
    expect(blankLink.invalid[0].message).toContain("requires one operation");
  });
});
