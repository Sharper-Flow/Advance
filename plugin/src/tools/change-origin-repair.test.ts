/** Origin repair tests for the disk mutation authority. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createTempDir, cleanupTempDir, parseToolOutput } from "../__tests__/setup";
import { changeTools } from "./change";
import type { Change, Store } from "../types";

function change(overrides: Partial<Change> = {}): Change {
  return {
    id: "repairMe", title: "Repair origin change", status: "active",
    created_at: "2026-01-01T00:00:00Z", created_by: "test", tasks: [], deltas: {}, wisdom: [],
    gates: { proposal: { status: "done" }, discovery: { status: "done" }, design: { status: "done" }, planning: { status: "done" }, execution: { status: "pending" }, acceptance: { status: "pending" }, release: { status: "pending" } },
    ...overrides,
  } as Change;
}

async function setup(current: Change): Promise<{ root: string; store: Store }> {
  const root = await createTempDir("adv-origin-repair-");
  await mkdir(join(root, current.id), { recursive: true });
  await writeFile(join(root, current.id, "change.json"), JSON.stringify(current));
  const store = { paths: { root, changes: root, archive: join(root, "archive") } as Store["paths"], config: null, changes: { get: vi.fn(async () => ({ success: true, data: current })), list: vi.fn(async () => ({ changes: [current] })) } } as unknown as Store;
  return { root, store };
}

const input = { changeId: "repairMe", origin_kind: "triage" as const, origin_issue_number: 42, approvalEvidence: "operator approved origin repair", approvedByUser: true as const, reason: "origin was missing issue number" };

describe("adv_change_repair_origin", () => {
  test("requires operator evidence and a reason", async () => {
    const { root, store } = await setup(change());
    try {
      expect(parseToolOutput(await changeTools.adv_change_repair_origin.execute({ ...input, approvalEvidence: "" }, store)).error).toContain("approvalEvidence");
      expect(parseToolOutput(await changeTools.adv_change_repair_origin.execute({ ...input, reason: "" }, store)).error).toContain("reason");
    } finally { await cleanupTempDir(root); }
  });

  test("dry-run reports the proposed origin without changing the projection", async () => {
    const current = change(); const { root, store } = await setup(current);
    try {
      const parsed = parseToolOutput(await changeTools.adv_change_repair_origin.execute({ ...input, dryRun: true }, store));
      expect(parsed).toMatchObject({ success: true, dryRun: true, origin: { kind: "triage", issue_number: 42 } });
      expect(JSON.parse(await readFile(join(root, current.id, "change.json"), "utf8")).origin).toBeUndefined();
    } finally { await cleanupTempDir(root); }
  });

  test("persists an approved origin repair with recovery authority audit", async () => {
    const current = change(); const { root, store } = await setup(current);
    try {
      const parsed = parseToolOutput(await changeTools.adv_change_repair_origin.execute(input, store));
      expect(parsed.success).toBe(true);
      const readback = JSON.parse(await readFile(join(root, current.id, "change.json"), "utf8"));
      expect(readback.origin).toEqual({ kind: "triage", issue_number: 42 });
      expect(readback.projection_commits[0].authority_kind).toBe("recovery");
    } finally { await cleanupTempDir(root); }
  });

  test("refuses repair of archived changes", async () => {
    const { root, store } = await setup(change({ status: "archived" }));
    try {
      expect(parseToolOutput(await changeTools.adv_change_repair_origin.execute(input, store)).error).toContain("archived");
    } finally { await cleanupTempDir(root); }
  });
});
