import { mkdir, readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  appendReconcileAudit,
  RECONCILE_AUDIT_FILENAME,
} from "./reconcile-audit";

describe("reconcile audit", () => {
  test("appends valid JSONL events without rewriting prior rows", async () => {
    const root = await createTempDir("adv-reconcile-audit-");
    try {
      const first = {
        event: "store_reconcile" as const,
        run_id: "run-1",
        record_id: "change-a",
        class: "unknown_store_noise" as const,
        action: "quarantine_to_trash",
        ts: new Date().toISOString(),
      };
      const second = { ...first, record_id: "change-b" };
      await expect(appendReconcileAudit(root, first)).resolves.toMatchObject({
        ok: true,
        event: first,
      });
      await expect(appendReconcileAudit(root, second)).resolves.toMatchObject({
        ok: true,
        event: second,
      });
      const content = await readFile(
        `${root}/${RECONCILE_AUDIT_FILENAME}`,
        "utf8",
      );
      expect(content.trim().split("\n")).toHaveLength(2);
      expect(JSON.parse(content.trim().split("\n")[0])).toMatchObject(first);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("reports an audit write failure instead of throwing", async () => {
    const root = await createTempDir("adv-reconcile-audit-failure-");
    try {
      const path = `${root}/audit.jsonl`;
      await mkdir(path);
      const result = await appendReconcileAudit(path, {
        event: "store_reconcile",
        run_id: "run-1",
        record_id: "change-a",
        class: "unknown_store_noise",
        action: "quarantine_to_trash",
        ts: new Date().toISOString(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.warning).toContain("audit");
    } finally {
      await cleanupTempDir(root);
    }
  });
});
