/**
 * Tests for the claim-collision pre/post-create checks added by C3
 * (rq-backlogCoord02, rq-backlogCoord03). Verifies:
 *   - origin.kind === 'roadmap' fires pre-create Visibility query
 *   - CLAIM_CONFLICT returned when existing change holds same issue
 *   - origin.kind !== 'roadmap' skips Visibility queries
 *   - changes without origin work unchanged
 *   - post-create double-check surfaces CLAIM_RACE_DETECTED on N>1
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createLegacyStore, type Store } from "../storage/store";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import { changeTools } from "./change";

describe("adv_change_create claim checks (rq-backlogCoord02, rq-backlogCoord03)", () => {
  let dir: string;
  let store: Store;

  beforeEach(async () => {
    dir = await createTempDir("adv-claim-");
    // withChanges:false — avoid the default `addFeature` fixture so we can
    // assert exact change-list state after each claim-check scenario.
    await createTestProject(dir, { withChanges: false });
    store = await createLegacyStore(dir);
    await store.init();
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(dir);
  });

  test("origin.kind=roadmap fires pre-create Visibility query (rq-backlogCoord02)", async () => {
    const claimChecker = vi.fn().mockResolvedValue([]);

    await changeTools.adv_change_create.execute(
      {
        summary: "Backlog feature 51",
        origin_kind: "roadmap",
        origin_issue_number: 51,
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    expect(claimChecker).toHaveBeenCalled();
    const [projectId, issueNumber] = claimChecker.mock.calls[0];
    expect(projectId).toBeTypeOf("string");
    expect(issueNumber).toBe(51);
  });

  test("CLAIM_CONFLICT returned when Visibility shows existing claim (rq-backlogCoord02.1)", async () => {
    const claimChecker = vi
      .fn()
      .mockResolvedValue([{ changeId: "existingClaim", status: "active" }]);

    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Backlog feature 51 attempt 2",
        origin_kind: "roadmap",
        origin_issue_number: 51,
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    const parsed = parseToolOutput(output);
    expect(parsed.error).toBeDefined();
    expect(parsed.code).toBe("CLAIM_CONFLICT");
    expect(parsed.existing_change_id).toBe("existingClaim");
    expect(parsed.existing_change_status).toBe("active");
    expect(parsed.issue_number).toBe(51);
    // No change should be created
    const list = await store.changes.list({});
    expect(list.changes.length).toBe(0);
  });

  test("origin.kind=discovery skips Visibility queries (rq-backlogCoord02.3)", async () => {
    const claimChecker = vi.fn().mockResolvedValue([]);

    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Mid-session discovery",
        origin_kind: "discovery",
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    const parsed = parseToolOutput(output);
    expect(parsed.changeId).toBeDefined();
    expect(claimChecker).not.toHaveBeenCalled();
  });

  test("origin.kind=triage with issue_number does fire Visibility query", async () => {
    const claimChecker = vi.fn().mockResolvedValue([]);

    await changeTools.adv_change_create.execute(
      {
        summary: "Promote agenda item",
        origin_kind: "triage",
        origin_issue_number: 89,
        origin_source_artifact: "ag-abc",
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    // Triage with explicit issue number should also participate in coordination.
    expect(claimChecker).toHaveBeenCalled();
    expect(claimChecker.mock.calls[0][1]).toBe(89);
  });

  test("change without origin works unchanged (no Visibility query)", async () => {
    const claimChecker = vi.fn().mockResolvedValue([]);

    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Plain change no origin",
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    const parsed = parseToolOutput(output);
    expect(parsed.changeId).toBeDefined();
    expect(claimChecker).not.toHaveBeenCalled();
  });

  test("CLAIM_RACE_DETECTED warning when post-create double-check finds >1 (rq-backlogCoord03.1)", async () => {
    let callCount = 0;
    const claimChecker = vi.fn(async () => {
      callCount += 1;
      // Pre-create: empty (no claim seen). Post-create: 2 claims (race).
      if (callCount === 1) return [];
      return [
        { changeId: "myNewChange", status: "draft" },
        { changeId: "concurrentSibling", status: "draft" },
      ];
    });

    const output = await changeTools.adv_change_create.execute(
      {
        summary: "My new change",
        origin_kind: "roadmap",
        origin_issue_number: 7,
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    const parsed = parseToolOutput(output);
    expect(parsed.changeId).toBeDefined();
    expect(parsed.warning).toBe("CLAIM_RACE_DETECTED");
    expect(parsed.race_change_ids).toEqual(
      expect.arrayContaining(["myNewChange", "concurrentSibling"]),
    );
    expect(parsed.race_change_ids.length).toBe(2);
    // Pre-create + post-create double-check = 2 calls.
    expect(callCount).toBe(2);
  });

  test("no CLAIM_RACE_DETECTED when post-create double-check returns 1 result (the new change itself)", async () => {
    const claimChecker = vi
      .fn()
      .mockResolvedValueOnce([]) // pre-create: empty
      .mockResolvedValueOnce([{ changeId: "myNewChange", status: "draft" }]); // post-create: self only

    const output = await changeTools.adv_change_create.execute(
      {
        summary: "My new change",
        origin_kind: "roadmap",
        origin_issue_number: 8,
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    const parsed = parseToolOutput(output);
    expect(parsed.changeId).toBeDefined();
    expect(parsed.warning).toBeUndefined();
  });
});
