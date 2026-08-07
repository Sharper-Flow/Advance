/**
 * Change Origin Tests
 *
 * Verifies the typed origin field on adv_change_create:
 *   - roadmap remains readable legacy provenance but is rejected for new writes
 *   - discovery, triage, and adhoc remain accepted
 *   - origin without kind is rejected
 *   - persisted origin survives a round-trip via store.changes.get
 *
 * Behavior automation (auto-create issue, auto-close on archive) lives
 * in a follow-up change and is NOT tested here.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createDiskStore, type Store } from "../storage/store";
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
    store = await createDiskStore(dir);
    await store.init();
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(dir);
  });

  test("origin_kind=roadmap is rejected for new writes", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Reject roadmap origin",
        origin_kind: "roadmap",
        origin_issue_number: 51,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toContain("ORIGIN_KIND_ROADMAP_RETIRED");
    expect(parsed.fields).toEqual(["origin_kind"]);
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
      undefined,
      { claimRaceCheckMs: 0 },
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

  test("origin_kind=discovery with source_artifact persists origin", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Mid-session sourced discovery",
        origin_kind: "discovery",
        origin_source_artifact: "note-17",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.origin).toEqual({
      kind: "discovery",
      source_artifact: "note-17",
    });
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

  test("origin_kind=roadmap without issue_number reports retirement", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Missing roadmap issue",
        origin_kind: "roadmap",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toContain("ORIGIN_KIND_ROADMAP_RETIRED");
    expect(parsed.fields).toEqual(["origin_kind"]);
  });

  test("origin_kind=roadmap with source_artifact reports retirement", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Roadmap with source",
        origin_kind: "roadmap",
        origin_issue_number: 77,
        origin_source_artifact: "ag-should-not-apply",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toContain("ORIGIN_KIND_ROADMAP_RETIRED");
    expect(parsed.fields).toEqual(["origin_kind"]);
  });

  test("origin_kind=discovery rejects issue_number", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Discovery with issue",
        origin_kind: "discovery",
        origin_issue_number: 42,
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toMatch(/origin_issue_number is only allowed/);
    expect(parsed.fields).toEqual(["origin_issue_number"]);
  });

  test("origin_kind=adhoc rejects linkage fields", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Adhoc with linkage",
        origin_kind: "adhoc",
        origin_issue_number: 42,
        origin_source_artifact: "ag-nope",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toMatch(/origin linkage fields are not allowed/);
    expect(parsed.fields).toEqual([
      "origin_issue_number",
      "origin_source_artifact",
    ]);
  });

  test("blank create artifacts and source_artifact are rejected", async () => {
    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Blank create args",
        proposal: "real proposal",
        design: "  ",
        origin_kind: "triage",
        origin_source_artifact: " ",
      },
      store,
    );
    const parsed = parseToolOutput(output);
    expect(parsed.error).toMatch(
      /Blank artifact or linkage fields are not allowed/,
    );
    expect(parsed.fields).toEqual(["design", "origin_source_artifact"]);
    expect(parsed.hint).toContain("omit fields you do not intend to set");
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
