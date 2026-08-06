/**
 * Backlog coordination regression coverage for the disk-owned change create
 * boundary. Visibility-query and workflow-lifecycle cases were retired with
 * Temporal; the duplicate-claim behavior remains a real command invariant.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDiskStore, type Store } from "../storage/store";
import { cleanupTempDir, createTempDir, createTestProject } from "./setup";
import { changeTools } from "../tools/change";

describe("duplicate backlog work is prevented by the create claim check", () => {
  let dir: string;
  let store: Store;

  beforeEach(async () => {
    dir = await createTempDir("backlog-claim-");
    await createTestProject(dir, { withChanges: false });
    store = await createDiskStore(dir);
    await store.init();
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(dir);
  });

  test("returns CLAIM_CONFLICT when an active claim already owns the issue", async () => {
    const claimChecker = vi
      .fn()
      .mockResolvedValue([{ changeId: "firstClaim", status: "active" }]);

    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Second attempt at #51",
        origin_kind: "triage",
        origin_issue_number: 51,
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    const parsed = JSON.parse(
      typeof output === "string"
        ? output
        : (output as { content: { text: string }[] }).content[0].text,
    );
    expect(parsed.code).toBe("CLAIM_CONFLICT");
    expect(parsed.existing_change_id).toBe("firstClaim");
    expect(claimChecker).toHaveBeenCalledTimes(1);
  });
});
