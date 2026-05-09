/**
 * Change Origin Tests
 *
 * Verifies the typed origin field on adv_change_create:
 *   - all four kinds (roadmap, discovery, triage, adhoc) are accepted
 *   - kind=roadmap requires origin_issue_number
 *   - origin without kind is rejected
 *   - persisted origin survives a round-trip via store.changes.get
 *
 * Behavior automation (auto-create issue, auto-close on archive) lives
 * in a follow-up change and is NOT tested here.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createLegacyStore, type Store } from "../storage/store";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";
import { changeTools } from "./change";

describe("adv_change_create origin field", () => {
  let dir: string;
  let store: Store;

  beforeEach(async () => {
    dir = await createTempDir("adv-origin-");
    await createTestProject(dir);
    store = await createLegacyStore(dir);
    await store.init();
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(dir);
  });

  test("origin_kind=roadmap with issue_number persists full origin", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Wire roadmap origin",
        origin_kind: "roadmap",
        origin_issue_number: 51,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.changeId).toBe("wireRoadmapOrigin");
    expect(parsed.origin).toEqual({
      kind: "roadmap",
      issue_number: 51,
    });

    // Round-trip: origin survives store read
    const change = await store.changes.get("wireRoadmapOrigin");
    expect(change.success).toBe(true);
    expect(change.data?.origin).toEqual({
      kind: "roadmap",
      issue_number: 51,
    });
  });

  test("origin_kind=triage with source_artifact persists origin", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Promote agenda item",
        origin_kind: "triage",
        origin_source_artifact: "ag-abc123",
        origin_issue_number: 89,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.origin).toEqual({
      kind: "triage",
      issue_number: 89,
      source_artifact: "ag-abc123",
    });
  });

  test("origin_kind=discovery without issue_number is allowed", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Mid-session discovery fix",
        origin_kind: "discovery",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.origin).toEqual({ kind: "discovery" });
  });

  test("origin_kind=adhoc persists kind only", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Quick adhoc work",
        origin_kind: "adhoc",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.origin).toEqual({ kind: "adhoc" });
  });

  test("origin_kind=roadmap without issue_number is rejected", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Missing roadmap issue",
        origin_kind: "roadmap",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toMatch(/origin_issue_number is required/);
  });

  test("origin_issue_number without origin_kind is rejected", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Issue without kind",
        origin_issue_number: 42,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toMatch(/origin_kind to be set/);
  });

  test("origin omitted leaves change.origin undefined (legacy compat)", async () => {
    const output = await changeTools.adv_change_create.execute(
      { summary: "No origin given" },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.origin).toBeUndefined();

    const change = await store.changes.get("noOriginGiven");
    expect(change.success).toBe(true);
    expect(change.data?.origin).toBeUndefined();
  });
});
