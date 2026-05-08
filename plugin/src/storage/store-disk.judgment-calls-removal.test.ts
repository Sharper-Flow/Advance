/**
 * T03 Regression Tests — judgment_calls / batch_surfaced_at removal from storage
 *
 * Verifies KD-3: active writes dropped, passthrough reads preserved.
 */

import { describe, test, expect } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createDiskStore } from "./store-disk";
import { getLastActivityTimestamp } from "./change-selection";
import type { Change } from "../types";

async function makeTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adv-t03-"));
  await writeFile(
    join(dir, "project.json"),
    JSON.stringify({
      name: "t03-test",
      version: "0.1.0",
      specs_dir: ".adv/specs",
      changes_dir: ".adv/changes",
      archive_dir: ".adv/archive",
      docs_dir: "docs/specs",
      db_dir: ".adv/db",
    }),
  );
  return dir;
}

describe("store-disk — judgment_calls removal", () => {
  test("(a) createChange does NOT initialize judgment_calls", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);

    const result = await store.changes.create(
      "Test Change",
      "test-capability",
      "# Proposal\n",
      undefined,
      undefined,
      undefined,
    );
    expect(result.changeId).toBeTruthy();

    const loaded = await store.changes.get(result.changeId);
    expect(loaded.success).toBe(true);
    expect(loaded.data).toBeTruthy();

    const change = loaded.data!;
    expect("judgment_calls" in change).toBe(false);
    expect(change.judgment_calls).toBeUndefined();
  });
});

describe("change-selection — batch_surfaced_at removal", () => {
  test("(b) getLastActivityTimestamp ignores batch_surfaced_at", () => {
    const createdAt = "2025-01-01T00:00:00Z";
    const base: Change = {
      $schema:
        "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/change.schema.json",
      id: "chg-test",
      title: "Test",
      status: "draft",
      created_at: createdAt,
      tasks: [],
      deltas: {},
    } as Change;

    const withoutBatch = getLastActivityTimestamp(base);
    expect(withoutBatch).toBe(new Date(createdAt).getTime());

    const withBatch: Change = {
      ...base,
      batch_surfaced_at: "2026-12-31T23:59:59Z",
    } as Change;

    const withBatchResult = getLastActivityTimestamp(withBatch);
    expect(withBatchResult).toBe(new Date(createdAt).getTime());
    expect(withBatchResult).not.toBe(
      new Date("2026-12-31T23:59:59Z").getTime(),
    );
  });
});

describe("passthrough contract — archived bundles remain readable", () => {
  test("(c) Change without judgment_calls/batch_surfaced_at loads without auto-init", async () => {
    const dir = await makeTempProject();
    const store = await createDiskStore(dir);

    // Manually write a minimal change.json lacking the removed fields
    const changeId = "legacy-change";
    const changeJson = {
      $schema:
        "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/change.schema.json",
      id: changeId,
      title: "Legacy",
      status: "draft",
      created_at: "2025-06-01T00:00:00Z",
      tasks: [],
      deltas: {},
    };

    await mkdir(join(dir, ".adv/changes", changeId), { recursive: true });
    await writeFile(
      join(dir, ".adv/changes", changeId, "change.json"),
      JSON.stringify(changeJson, null, 2),
    );

    const loaded = await store.changes.get(changeId);
    expect(loaded.success).toBe(true);
    expect(loaded.data).toBeTruthy();

    const change = loaded.data!;
    expect(change.judgment_calls).toBeUndefined();
    expect(change.batch_surfaced_at).toBeUndefined();
  });
});
