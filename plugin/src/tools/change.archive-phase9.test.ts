/** Archive terminal-proof tests for disk projection and archive bundles. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { Change, Gates, Store } from "../types";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { GitFinalizeOutcome } from "./archive-helpers/git-finalize";
import { buildReleaseCompletionEvidence, completeReleaseGateAfterFinalization, verifyReleaseGateDurableForArchive } from "./change/archive-gate";

const shipped: GitFinalizeOutcome = { status: "shipped", repoRoot: "/repo", defaultBranch: "trunk", pushStatus: "pushed", releasedCommitSha: "merge-sha", mergeCommitSha: "merge-sha", route: "direct" };
const doneGates = (): Gates => ({ proposal: { status: "done" }, discovery: { status: "done" }, design: { status: "done" }, planning: { status: "done" }, execution: { status: "done" }, acceptance: { status: "done" }, release: { status: "done", approval_evidence: "disk proof" } });
function change(overrides: Partial<Change> = {}): Change { return { id: "example", title: "Example", status: "archived", created_at: "2026-01-01T00:00:00Z", created_by: "tester", tasks: [], deltas: {}, wisdom: [], gates: doneGates(), ...overrides }; }
async function seed(root: string, current: Change): Promise<void> { await mkdir(join(root, current.id), { recursive: true }); await writeFile(join(root, current.id, "change.json"), JSON.stringify(current)); await writeFile(join(root, `${current.id}.json`), JSON.stringify({ schemaVersion: 2, projectId: "0".repeat(40), changeId: current.id, projectedAt: current.created_at, state: current })); }
function store(root: string, current: Change): Store { return { paths: { root, changes: root, archive: join(root, "archive") }, config: { name: "test", features: {} }, changes: { get: async () => ({ success: true, data: current }) }, gates: { get: async () => current.gates } } as unknown as Store; }

describe("archive terminal proof", () => {
  test("accepts an already-complete release projection after shipped finalization", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change(); await seed(root, current);
      const result = await completeReleaseGateAfterFinalization({ store: store(root, current), change: current, changeId: current.id, finalization: shipped });
      expect(result).toMatchObject({ ok: true, alreadyDone: true });
    } finally { await cleanupTempDir(root); }
  });

  test("fails closed when the authoritative release projection is missing", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change({ gates: { ...doneGates(), release: { status: "pending" } } });
      const result = await verifyReleaseGateDurableForArchive({ store: store(root, current), changeId: current.id, evidence: "Phase 9 finalization shipped; defaultBranch=trunk", change: current });
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toContain("status: missing");
    } finally { await cleanupTempDir(root); }
  });

  test("fails closed when the archive bundle release status is not complete", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change(); const bundle = join(root, "bundle"); await mkdir(bundle, { recursive: true });
      await writeFile(join(bundle, "change.json"), JSON.stringify(change({ id: "different", status: "active", gates: { ...doneGates(), release: { status: "pending" } } })));
      const result = await verifyReleaseGateDurableForArchive({ store: store(root, current), changeId: current.id, evidence: "disk proof", bundlePath: bundle, change: current });
      expect(result.ok).toBe(false);
    } finally { await cleanupTempDir(root); }
  });

  test("uses durable disk gate evidence without workflow reads", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change(); await seed(root, current);
      const result = await verifyReleaseGateDurableForArchive({ store: store(root, current), changeId: current.id, evidence: "disk proof", finalization: shipped, change: current });
      expect(result).toMatchObject({ ok: true, source: "shipped-finalization" });
      expect(JSON.parse(await readFile(join(root, current.id, "change.json"), "utf8")).gates.release.status).toBe("done");
      expect(buildReleaseCompletionEvidence(shipped)).toContain("Phase 9 finalization shipped");
    } finally { await cleanupTempDir(root); }
  });
});
