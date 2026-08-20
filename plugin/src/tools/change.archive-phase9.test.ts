/** Archive terminal-proof tests for disk projection and archive bundles. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { Change, Gates, Store } from "../types";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { GitFinalizeOutcome } from "./archive-helpers/git-finalize";
import {
  buildTerminalArchiveSummary,
  serializeTerminalArchiveSummary,
  sha256HexString,
  TERMINAL_SUMMARY_FILE,
  validateTerminalArchiveSummary,
} from "../archive/terminal-summary";
import {
  buildReleaseCompletionEvidence,
  completeReleaseGateAfterFinalization,
  preservePhase9Evidence,
  verifyReleaseGateDurableForArchive,
} from "./change/archive-gate";

const shipped: GitFinalizeOutcome = {
  status: "shipped",
  repoRoot: "/repo",
  defaultBranch: "trunk",
  pushStatus: "pushed",
  releasedCommitSha: "a".repeat(40),
  mergeCommitSha: "a".repeat(40),
  route: "direct",
};
const doneGates = (): Gates => ({
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: "done" },
  acceptance: { status: "done" },
  release: { status: "done", approval_evidence: "disk proof" },
});
function change(overrides: Partial<Change> = {}): Change {
  return {
    id: "example",
    title: "Example",
    status: "archived",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "tester",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: doneGates(),
    ...overrides,
  };
}
async function seed(root: string, current: Change): Promise<void> {
  await mkdir(join(root, current.id), { recursive: true });
  await writeFile(
    join(root, current.id, "change.json"),
    JSON.stringify(current),
  );
  await writeFile(
    join(root, `${current.id}.json`),
    JSON.stringify({
      schemaVersion: 2,
      projectId: "0".repeat(40),
      changeId: current.id,
      projectedAt: current.created_at,
      state: current,
    }),
  );
}
function store(root: string, current: Change): Store {
  return {
    paths: { root, changes: root, archive: join(root, "archive") },
    config: { name: "test", features: {} },
    changes: { get: async () => ({ success: true, data: current }) },
    gates: { get: async () => current.gates },
  } as unknown as Store;
}

describe("archive terminal proof", () => {
  test("accepts an already-complete release projection after shipped finalization", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change();
      await seed(root, current);
      const result = await completeReleaseGateAfterFinalization({
        store: store(root, current),
        change: current,
        changeId: current.id,
        finalization: shipped,
      });
      expect(result).toMatchObject({ ok: true, alreadyDone: true });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("preserves resume-after-merge proof while recording its merge commit", () => {
    const previous = {
      status: "pending_merge" as const,
      startedAt: "2026-01-02T02:00:00.000Z",
      preArchiveTipSha: "b".repeat(40),
    } as unknown as import("../types").Phase9FinalizationStatus;
    const next = preservePhase9Evidence(previous, {
      status: "done",
      startedAt: previous.startedAt,
      completedAt: "2026-01-02T03:00:00.000Z",
      mergeCommitSha: "c".repeat(40),
    });

    expect(next.mergeCommitSha).toBe("c".repeat(40));
    expect(
      (next as unknown as { preArchiveTipSha?: string }).preArchiveTipSha,
    ).toBe("b".repeat(40));
  });

  test("rejects non-shipped finalization before loading a release projection", async () => {
    const current = change();
    const result = await completeReleaseGateAfterFinalization({
      store: store("/missing", current),
      change: current,
      changeId: current.id,
      finalization: { ...shipped, status: "pending_merge" },
    });

    expect(result).toMatchObject({
      ok: false,
      error:
        "Release gate requires successful Phase 9 finalization, got pending_merge",
    });
  });

  test("repairs release and Phase 9 metadata in an archived bundle without an active projection", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const archivedAt = "2026-01-02T03:04:05.000Z";
      const current = change({
        gates: { ...doneGates(), release: { status: "pending" } },
        lifecycleState: "open",
        phase9_status: {
          status: "pending_merge",
          startedAt: "2026-01-02T02:00:00.000Z",
          prNumber: 405,
          prUrl: "https://github.com/example/repo/pull/405",
          autoMergeArmed: true,
          route: "pr_auto_merge",
          changeTipSha: "b".repeat(40),
          mergeCommitSha: "c".repeat(40),
        },
      });
      const bundle = join(root, "archive", "2026-01-02-example");
      await mkdir(bundle, { recursive: true });
      const initialChangeJson = `${JSON.stringify(current, null, 2)}\n`;
      await writeFile(join(bundle, "change.json"), initialChangeJson);
      await writeFile(
        join(bundle, TERMINAL_SUMMARY_FILE),
        serializeTerminalArchiveSummary(
          buildTerminalArchiveSummary({
            change: current,
            archivedAt,
            changeHash: sha256HexString(initialChangeJson),
          }),
        ),
      );
      const preservedSidecars = {
        "spec-projection.json": '{"schema_version":1}\n',
        "agreement.md": "# Agreement\n",
        "wisdom.json": '{"entries":[]}\n',
        "multi-repo-archive.json": '{"repos":[]}\n',
      };
      for (const [filename, contents] of Object.entries(preservedSidecars)) {
        await writeFile(join(bundle, filename), contents);
      }

      const targetStore = store(root, current);
      const first = await completeReleaseGateAfterFinalization({
        store: targetStore,
        change: current,
        changeId: current.id,
        finalization: {
          ...shipped,
          mergeCommitSha: undefined,
          route: "pr_auto_merge",
          repo: "example/repo",
          prNumber: 405,
          prUrl: "https://github.com/example/repo/pull/405",
          prHeadSha: "b".repeat(40),
          defaultBranchSha: "a".repeat(40),
          changeTipSha: "b".repeat(40),
        },
        existingBundlePath: bundle,
      });

      expect(first.ok, JSON.stringify(first)).toBe(true);
      expect(first).toMatchObject({
        ok: true,
        alreadyDone: false,
        recoveryMutation: true,
      });
      const repaired = JSON.parse(
        await readFile(join(bundle, "change.json"), "utf8"),
      ) as Change;
      expect(repaired.gates?.release?.status).toBe("done");
      expect(repaired.phase9_status?.status).toBe("done");
      expect(repaired.lifecycleState).toBe("archived");
      expect(repaired.phase9_status?.autoMergeArmed).toBe(true);
      expect(repaired.phase9_status?.mergeCommitSha).toBe("c".repeat(40));
      expect(repaired.projection_revision).toBe(1);
      expect(repaired.projection_commits?.at(-1)).toMatchObject({
        mutation_kind: "archive_release_recovery",
        authority_kind: "recovery",
      });
      expect(repaired.projection_commits?.at(-1)?.operation_id).toMatch(
        /^archive-release-recovery:example:[a-f0-9]{64}$/,
      );
      const summary = validateTerminalArchiveSummary(
        JSON.parse(await readFile(join(bundle, TERMINAL_SUMMARY_FILE), "utf8")),
      );
      expect(summary.archived_at).toBe(archivedAt);
      expect(summary.change_hash).toBe(
        sha256HexString(await readFile(join(bundle, "change.json"), "utf8")),
      );
      expect(
        await readFile(join(bundle, "ARCHIVE_SUMMARY.md"), "utf8"),
      ).toContain(archivedAt);
      await readFile(join(bundle, "BRIEFING_DIGEST.md"), "utf8");
      for (const [filename, contents] of Object.entries(preservedSidecars)) {
        expect(await readFile(join(bundle, filename), "utf8")).toBe(contents);
      }

      const second = await completeReleaseGateAfterFinalization({
        store: targetStore,
        change: repaired,
        changeId: current.id,
        finalization: {
          ...shipped,
          route: "pr_auto_merge",
          repo: "example/repo",
          prNumber: 405,
          prUrl: "https://github.com/example/repo/pull/405",
          prHeadSha: "b".repeat(40),
          defaultBranchSha: "a".repeat(40),
          changeTipSha: "b".repeat(40),
        },
        existingBundlePath: bundle,
      });
      expect(second).toMatchObject({
        ok: true,
        alreadyDone: true,
        recoveryMutation: true,
      });
      expect(
        JSON.parse(await readFile(join(bundle, "change.json"), "utf8"))
          .projection_revision,
      ).toBe(1);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("audits terminal status convergence instead of treating it as an exact replay", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const archivedAt = "2026-01-02T03:04:05.000Z";
      const current = change({
        status: "draft",
        lifecycleState: "archived",
        phase9_status: {
          status: "done",
          startedAt: "2026-01-02T02:00:00.000Z",
          completedAt: "2026-01-02T03:00:00.000Z",
        },
      });
      const bundle = join(root, "archive", "2026-01-02-example");
      await mkdir(bundle, { recursive: true });
      const initialChangeJson = `${JSON.stringify(current, null, 2)}\n`;
      await writeFile(join(bundle, "change.json"), initialChangeJson);
      await writeFile(
        join(bundle, TERMINAL_SUMMARY_FILE),
        serializeTerminalArchiveSummary(
          buildTerminalArchiveSummary({
            change: { ...current, status: "archived" },
            archivedAt,
            changeHash: sha256HexString(initialChangeJson),
          }),
        ),
      );

      const result = await completeReleaseGateAfterFinalization({
        store: store(root, current),
        change: current,
        changeId: current.id,
        finalization: shipped,
        existingBundlePath: bundle,
      });

      expect(result).toMatchObject({
        ok: true,
        alreadyDone: false,
        recoveryMutation: true,
      });
      const repaired = JSON.parse(
        await readFile(join(bundle, "change.json"), "utf8"),
      ) as Change;
      expect(repaired.status).toBe("archived");
      expect(repaired.projection_revision).toBe(1);
      expect(repaired.projection_commits?.at(-1)?.mutation_kind).toBe(
        "archive_release_recovery",
      );
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("does not route a corrupt active projection through archived-bundle recovery", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change({
        gates: { ...doneGates(), release: { status: "pending" } },
      });
      await mkdir(join(root, current.id), { recursive: true });
      await writeFile(join(root, current.id, "change.json"), "{not-json");
      const bundle = join(root, "archive", "2026-01-02-example");
      await mkdir(bundle, { recursive: true });
      await writeFile(
        join(bundle, "change.json"),
        `${JSON.stringify(current, null, 2)}\n`,
      );

      const result = await completeReleaseGateAfterFinalization({
        store: store(root, current),
        change: current,
        changeId: current.id,
        finalization: shipped,
        existingBundlePath: bundle,
      });

      expect(result).toMatchObject({
        ok: false,
        code: "CHANGE_PROJECTION_LOAD_FAILED",
        projectionFailureType: "corrupt",
      });
      expect(
        JSON.parse(await readFile(join(bundle, "change.json"), "utf8")).gates
          .release.status,
      ).toBe("pending");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("fails closed when the existing bundle cannot preserve its archive timestamp", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change({
        gates: { ...doneGates(), release: { status: "pending" } },
        phase9_status: {
          status: "pending_merge",
          startedAt: "2026-01-02T02:00:00.000Z",
        },
      });
      const bundle = join(root, "archive", "2026-01-02-example");
      await mkdir(bundle, { recursive: true });
      await writeFile(
        join(bundle, "change.json"),
        `${JSON.stringify(current, null, 2)}\n`,
      );

      const first = await completeReleaseGateAfterFinalization({
        store: store(root, current),
        change: current,
        changeId: current.id,
        finalization: shipped,
        existingBundlePath: bundle,
      });
      expect(first.ok).toBe(false);
      if (!first.ok)
        expect(first.error).toContain("terminal summary is not_found");

      const committed = JSON.parse(
        await readFile(join(bundle, "change.json"), "utf8"),
      ) as Change;
      expect(committed.gates?.release?.status).toBe("done");
      expect(committed.phase9_status?.status).toBe("done");
      expect(committed.projection_revision).toBe(1);

      const second = await completeReleaseGateAfterFinalization({
        store: store(root, committed),
        change: committed,
        changeId: current.id,
        finalization: shipped,
        existingBundlePath: bundle,
      });
      expect(second.ok).toBe(false);
      expect(
        JSON.parse(await readFile(join(bundle, "change.json"), "utf8"))
          .projection_revision,
      ).toBe(1);
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("fails closed when the authoritative release projection is missing", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change({
        gates: { ...doneGates(), release: { status: "pending" } },
      });
      const result = await verifyReleaseGateDurableForArchive({
        store: store(root, current),
        changeId: current.id,
        evidence: "Phase 9 finalization shipped; defaultBranch=trunk",
        change: current,
      });
      expect(result).toMatchObject({
        ok: false,
        error:
          "Cannot confirm release gate completion from disk projection (status: missing)",
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("fails closed when the archive bundle release status is not complete", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change();
      const bundle = join(root, "bundle");
      await mkdir(bundle, { recursive: true });
      await writeFile(
        join(bundle, "change.json"),
        JSON.stringify(
          change({
            status: "active",
            gates: { ...doneGates(), release: { status: "pending" } },
          }),
        ),
      );
      const result = await verifyReleaseGateDurableForArchive({
        store: store(root, current),
        changeId: current.id,
        evidence: "disk proof",
        bundlePath: bundle,
        change: current,
      });
      expect(result).toMatchObject({
        ok: false,
        error:
          "Cannot confirm release gate completion from disk projection (status: pending)",
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("rejects release proof from a bundle with a foreign change identity", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change();
      const bundle = join(root, "bundle");
      await mkdir(bundle, { recursive: true });
      await writeFile(
        join(bundle, "change.json"),
        JSON.stringify(change({ id: "different" })),
      );

      const result = await verifyReleaseGateDurableForArchive({
        store: store(root, current),
        changeId: current.id,
        evidence: "disk proof",
        finalization: shipped,
        bundlePath: bundle,
        change: current,
      });

      expect(result).toMatchObject({
        ok: false,
        error:
          "Archive bundle identity mismatch: expected example, got different.",
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("uses durable disk gate evidence without workflow reads", async () => {
    const root = await createTempDir("adv-archive-proof-");
    try {
      const current = change();
      await seed(root, current);
      const result = await verifyReleaseGateDurableForArchive({
        store: store(root, current),
        changeId: current.id,
        evidence: "disk proof",
        finalization: shipped,
        change: current,
      });
      expect(result).toMatchObject({
        ok: true,
        source: "shipped-finalization",
      });
      expect(
        JSON.parse(
          await readFile(join(root, current.id, "change.json"), "utf8"),
        ).gates.release.status,
      ).toBe("done");
      expect(buildReleaseCompletionEvidence(shipped)).toContain(
        "Phase 9 finalization shipped",
      );
    } finally {
      await cleanupTempDir(root);
    }
  });
});
