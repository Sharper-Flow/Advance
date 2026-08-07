import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { loadProposalForSnapshot } from "./proposal-read";
import type { Store } from "./store";
import type { Change } from "../types";

/**
 * KD5 (AC1/C1/C3): the projection is the live authority for proposal content
 * consumed by the context snapshot. Disk `proposal.md` and the archive bundle
 * remain read-only legacy fallbacks; the scaffold is the last resort.
 *
 * This helper lives in the storage layer so `context-snapshot-fetch` can read
 * projection-first without importing from `tools/` (layering invariant).
 */
describe("loadProposalForSnapshot", () => {
  let root: string;
  let changesDir: string;
  let store: Store;

  const change = (overrides: Partial<Change> = {}): Change =>
    ({
      id: "chg-test",
      title: "My Change",
      status: "draft",
      created_at: new Date().toISOString(),
      ...overrides,
    }) as unknown as Change;

  beforeEach(async () => {
    root = await createTempDir();
    changesDir = join(root, "changes");
    await mkdir(changesDir, { recursive: true });
    store = { paths: { root, changes: changesDir } } as unknown as Store;
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  test("returns projection content when change.documents.proposal is present", async () => {
    // Disk holds stale content; the projection must win.
    await mkdir(join(changesDir, "chg-test"), { recursive: true });
    await writeFile(
      join(changesDir, "chg-test", "proposal.md"),
      "# Stale disk proposal",
    );

    const result = await loadProposalForSnapshot(
      store,
      change({
        documents: { proposal: "# Fresh projection proposal" },
      } as Partial<Change>),
    );

    expect(result.content).toContain("Fresh projection proposal");
    expect(result.content).not.toContain("Stale disk");
    expect(result.warning).toBeUndefined();
  });

  test("falls back to disk proposal.md for legacy changes with an empty projection", async () => {
    await mkdir(join(changesDir, "chg-test"), { recursive: true });
    await writeFile(
      join(changesDir, "chg-test", "proposal.md"),
      "# Legacy disk proposal",
    );

    const result = await loadProposalForSnapshot(store, change());

    expect(result.content).toContain("Legacy disk proposal");
    expect(result.warning).toBeUndefined();
  });

  test("falls back to the archive bundle when the active dir is gone", async () => {
    // Bundles are named `{timestamp}-{changeId}` (findArchiveBundle contract).
    const bundleDir = join(root, ".adv", "archive", "20260101T000000-chg-test");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), "{}");
    await writeFile(join(bundleDir, "proposal.md"), "# Archived proposal");

    const result = await loadProposalForSnapshot(store, change());

    expect(result.content).toContain("Archived proposal");
    expect(result.warning).toBeUndefined();
  });

  test("returns a titled scaffold plus warning when no source has content", async () => {
    const result = await loadProposalForSnapshot(
      store,
      change({ title: "Fix Login Bug" }),
    );

    expect(result.content).toContain("Fix Login Bug");
    expect(result.warning).toBeDefined();
  });

  test("treats an empty projection document and an empty disk file as absent", async () => {
    await mkdir(join(changesDir, "chg-test"), { recursive: true });
    await writeFile(join(changesDir, "chg-test", "proposal.md"), "   \n  ");

    const result = await loadProposalForSnapshot(
      store,
      change({ documents: { proposal: "" } } as Partial<Change>),
    );

    expect(result.content).toContain("My Change");
    expect(result.warning).toBeDefined();
  });

  test("never throws — unreadable paths still return a result", async () => {
    const brokenStore = {
      paths: { root: "/nonexistent/root", changes: "/nonexistent/changes" },
    } as unknown as Store;

    const result = await loadProposalForSnapshot(brokenStore, change());

    expect(result.content).toBeDefined();
    expect(result.warning).toBeDefined();
  });
});
