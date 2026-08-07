#!/usr/bin/env bun
/**
 * Deterministic disk-only ten-agent stress harness.
 *
 * Every actor is a separate Bun process. The fixture owns its repository,
 * XDG data home, ADV worktree home, projections, and archive. No OpenCode
 * session, background worker, or live ADV state is touched.
 *
 * Usage:
 *   bun scripts/disk-concurrency-stress.ts
 *   bun scripts/disk-concurrency-stress.ts --report docs/ten-agent-concurrency-evidence.md
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  archiveChange,
  findArchiveBundle,
} from "../plugin/src/archive/archive";
import { commitChangeProjection } from "../plugin/src/storage/change-projection-transaction";
import {
  compactProjectWisdom,
  addProjectWisdom,
  listProjectWisdom,
} from "../plugin/src/storage/project-wisdom";
import { writeProjectMetadataEntry } from "../plugin/src/storage/project-metadata";
import {
  advWorktreeCreate,
  drainPendingDeletes,
  type AdvWorktreeDeleteDeps,
} from "../plugin/src/tools/worktree/index";
import {
  getPendingDeletes,
  setPendingDelete,
  type WorktreeStateAccess,
} from "../plugin/src/tools/worktree/state";
import { acquireFileLock } from "../plugin/src/utils/fs";
import {
  getExternalRoot,
  synthesizeTestProjectId,
} from "../plugin/src/utils/project-id";
import { ChangeSchema, type Change } from "../plugin/src/types";
import { releaseGateProofToCompletion } from "../plugin/src/tools/change/release-proof";
import { SAMPLE_CHANGE } from "../plugin/src/__tests__/setup";

const ACTOR_COUNT = 10;
const LOCK_BUDGET_MS = 15_000;
// 20% of the primitive's 15s budget leaves 12s for a real lock timeout or
// filesystem stall. This is intentionally a bounded clearance threshold, not
// a claim about a particular machine's absolute latency.
const LOCK_WAIT_P95_THRESHOLD_MS = 3_000;
const SHARED_CHANGE_ID = "disk-stress-shared";
const RELEASE_CHANGE_ID = "disk-stress-release";
const ARCHIVE_CHANGE_ID = "disk-stress-archive";
const WORKTREE_BRANCH = "change/disk-stress";

type Logger = {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type HarnessConfig = {
  root: string;
  xdgDataHome: string;
  worktreeHome: string;
  projectId: string;
  changesDir: string;
  wisdomPath: string;
  metadataPath: string;
  archiveDir: string;
  specsDir: string;
  docsDir: string;
  startAt: number;
};

type ActorResult = {
  actor: number;
  lockWaitMs: number;
  commits: Array<{ kind: string; operation: string }>;
  archive: { success: boolean; errors: string[] };
  create: unknown;
  error?: string;
};

export type StressEvidence = {
  checkedAt: string;
  actorCount: number;
  lockBudgetMs: number;
  lockWaitP95ThresholdMs: number;
  lockWaitMs: number[];
  lockWaitP95Ms: number;
  lockTimeouts: number;
  committedUnverified: number;
  tornWrites: number;
  expectedRecords: number;
  survivingRecords: number;
  createResults: { successful: number; fresh: number; reused: number };
  pendingDelete: { queued: boolean; drained: boolean; remaining: number };
  archiveRelease: {
    archiveSuccesses: number;
    archiveBundleTerminal: boolean;
    releaseProjectionTerminal: boolean;
    failClosed: boolean;
  };
  actorErrors: string[];
  assertions: Record<string, boolean>;
};

const quietLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeChange(id: string, overrides: Partial<Change> = {}): Change {
  return ChangeSchema.parse({
    ...SAMPLE_CHANGE,
    id,
    status: "draft",
    deltas: {},
    ...overrides,
  });
}

async function seedChange(changesDir: string, change: Change): Promise<void> {
  const directory = join(changesDir, change.id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "change.json"), JSON.stringify(change, null, 2));
}

function worktreeDeps(
  config: HarnessConfig,
  worktreePath?: string,
  inUse = false,
): AdvWorktreeDeleteDeps {
  const database: WorktreeStateAccess = {
    projectDir: config.root,
    projectId: config.projectId,
  };
  return {
    projectRoot: config.root,
    database,
    log: quietLogger(),
    ...(worktreePath ? { worktreePath } : {}),
    registry: worktreePath
      ? [{ branch: WORKTREE_BRANCH, changeId: "disk-stress", path: worktreePath }]
      : undefined,
    integrationCheck: async () => ({
      ok: true as const,
      branch: WORKTREE_BRANCH,
      changeId: "disk-stress",
      defaultBranch: "main",
    }),
    store: {
      changes: {
        get: async () => ({
          success: true as const,
          data: { id: "disk-stress", status: "archived" },
        }),
        refresh: async () => undefined,
      },
    } as any,
    approvalEvidence: "isolated stress harness approved pending deletion",
    isWorktreeInUse: () => inUse,
  };
}

async function waitForStart(startAt: number): Promise<void> {
  const delay = startAt - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

async function runActor(config: HarnessConfig, actor: number): Promise<ActorResult> {
  await waitForStart(config.startAt);
  const operations: ActorResult["commits"] = [];
  try {
    const lockPath = join(config.root, "shared-lock-metric.json");
    const lockStarted = performance.now();
    const releaseMetricLock = await acquireFileLock(lockPath, LOCK_BUDGET_MS);
    const lockWaitMs = Number((performance.now() - lockStarted).toFixed(3));
    await new Promise((resolve) => setTimeout(resolve, 8));
    await releaseMetricLock();

    const authority = {
      kind: "recovery" as const,
      reason: "disk_stress_harness",
      evidence: "isolated ten-agent child-process fixture",
    };
    const commit = async (
      changeId: string,
      operation: string,
      mutateLatest?: (latest: Change) => Change,
    ) => {
      const result = await commitChangeProjection({
        changesDir: config.changesDir,
        changeId,
        operationId: operation,
        payloadHash: `hash-${operation}`,
        mutationKind: "stress:projection",
        authority,
        payload: { actor },
        mutateLatest: mutateLatest ?? ((latest) => latest),
        verify: ({ readback }) =>
          readback.projection_commits?.some(
            (entry) => entry.operation_id === operation,
          ) === true,
        lockTimeoutMs: LOCK_BUDGET_MS,
      });
      operations.push({ kind: result.kind, operation });
    };

    await commit(SHARED_CHANGE_ID, `shared-${actor}`);
    await commit(`disk-stress-own-${actor}`, `own-${actor}`);
    const releaseCompletion = releaseGateProofToCompletion({
      accepted: true,
      ok: true,
      source: "disk",
      finalizationStatus: "stress_verified",
      releasedCommitSha: "a".repeat(40),
    });
    await commit(RELEASE_CHANGE_ID, `release-${actor}`, (latest) => ({
      ...latest,
      status: "archived",
      gates: { ...latest.gates, release: releaseCompletion },
    }));

    await addProjectWisdom(config.root, {
      type: "pattern",
      content: `disk-stress actor ${actor}`,
      sourceChange: SHARED_CHANGE_ID,
      sourceTask: `actor-${actor}`,
      wisdomPath: config.wisdomPath,
    });
    await compactProjectWisdom(config.root, {
      maxEntries: 50,
      wisdomPath: config.wisdomPath,
    });

    await writeProjectMetadataEntry(
      config.root,
      {
        key: `disk-stress.actor.${actor}`,
        timestamp: new Date(actor * 1000).toISOString(),
        count: actor,
        summary: `actor-${actor} metadata survived`,
        written_by: "agent",
      },
      config.metadataPath,
    );
    await writeProjectMetadataEntry(
      config.root,
      {
        key: "disk-stress.shared",
        timestamp: new Date(actor * 1000).toISOString(),
        count: actor,
        summary: `last shared writer actor-${actor}`,
        written_by: "agent",
      },
      config.metadataPath,
    );

    const archiveResult = await archiveChange({
      change: makeChange(ARCHIVE_CHANGE_ID),
      specs: new Map(),
      paths: {
        specs: config.specsDir,
        archive: config.archiveDir,
        docs: config.docsDir,
        changes: config.changesDir,
        wisdom: config.wisdomPath,
      },
    });

    const createResult = await advWorktreeCreate(
      WORKTREE_BRANCH,
      { base: "main" },
      {
        projectRoot: config.root,
        database: { projectDir: config.root, projectId: config.projectId },
        log: quietLogger(),
      },
    );

    return {
      actor,
      lockWaitMs,
      commits: operations,
      archive: { success: archiveResult.success, errors: archiveResult.errors },
      create: createResult,
    };
  } catch (error) {
    return {
      actor,
      lockWaitMs: Number.POSITIVE_INFINITY,
      commits: operations,
      archive: { success: false, errors: [String(error)] },
      create: { ok: false, error: "ACTOR_ERROR" },
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }
}

async function runDrain(config: HarnessConfig): Promise<unknown> {
  const deps = worktreeDeps(config);
  const result = await drainPendingDeletes(
    "startup",
    { ...deps, isWorktreeInUse: () => false },
    { forceAttempts: true },
  );
  return { ...result, after: await getPendingDeletes(deps.database) };
}

async function spawnJson(
  mode: "actor" | "drain",
  configPath: string,
  actor?: number,
): Promise<{ exitCode: number; value: any; stderr: string }> {
  const runtime = process.env.BUN_BIN ?? "bun";
  const args = [fileURLToPath(import.meta.url), `--${mode}`, configPath];
  if (actor !== undefined) args.push(String(actor));
  const child = spawn(runtime, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const exitCode = await new Promise<number>((resolve) =>
    child.on("close", (code) => resolve(code ?? 1)),
  );
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const line = stdout.trim().split("\n").filter(Boolean).at(-1) ?? "{}";
  let value: any;
  try {
    value = JSON.parse(line);
  } catch {
    value = { error: `invalid child JSON: ${line}` };
  }
  return { exitCode, value, stderr };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
}

async function assertJsonFiles(
  config: HarnessConfig,
): Promise<{ tornWrites: number; survivingRecords: number }> {
  let tornWrites = 0;
  let survivingRecords = 0;
  const parseJson = async (path: string): Promise<any> => {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      tornWrites++;
      return null;
    }
  };
  for (const changeId of [
    SHARED_CHANGE_ID,
    RELEASE_CHANGE_ID,
    ARCHIVE_CHANGE_ID,
    ...Array.from(
      { length: ACTOR_COUNT },
      (_, i) => `disk-stress-own-${i}`,
    ),
  ]) {
    const projection = await parseJson(
      join(config.changesDir, changeId, "change.json"),
    );
    if (projection) {
      try {
        ChangeSchema.parse(projection);
        survivingRecords += projection.projection_commits?.length ?? 0;
      } catch {
        tornWrites++;
      }
    }
  }
  const metadata = await parseJson(config.metadataPath);
  if (metadata) survivingRecords += Object.keys(metadata).length;
  try {
    const rawWisdom = await readFile(config.wisdomPath, "utf8");
    const wisdomLines = rawWisdom.split("\n").filter((line) => line.trim());
    for (const line of wisdomLines) JSON.parse(line);
    const wisdom = await listProjectWisdom(config.root, {
      wisdomPath: config.wisdomPath,
    });
    survivingRecords += wisdom.length === wisdomLines.length ? wisdomLines.length : 0;
  } catch {
    tornWrites++;
  }
  const pending = await parseJson(
    join(getExternalRoot(config.projectId), "worktree-pending-deletes.json"),
  );
  if (pending) survivingRecords += pending.length;
  return { tornWrites, survivingRecords };
}

export async function runDiskConcurrencyStress(): Promise<StressEvidence> {
  const root = await mkdtemp(join(tmpdir(), "adv-disk-ten-agent-"));
  const xdgDataHome = join(root, "xdg");
  const worktreeHome = join(root, "worktrees");
  const projectId = synthesizeTestProjectId(root);
  const config: HarnessConfig = {
    root,
    xdgDataHome,
    worktreeHome,
    projectId,
    changesDir: join(root, ".adv", "changes"),
    wisdomPath: join(root, "shared", "wisdom.jsonl"),
    metadataPath: join(root, "shared", "project-metadata.json"),
    archiveDir: join(root, ".adv", "archive"),
    specsDir: join(root, ".adv", "specs"),
    docsDir: join(root, "docs", "specs"),
    startAt: Date.now() + 700,
  };
  const configPath = join(root, "harness-config.json");
  try {
    await mkdir(config.specsDir, { recursive: true });
    await mkdir(config.docsDir, { recursive: true });
    await seedChange(config.changesDir, makeChange(SHARED_CHANGE_ID));
    await seedChange(config.changesDir, makeChange(RELEASE_CHANGE_ID));
    await seedChange(config.changesDir, makeChange(ARCHIVE_CHANGE_ID));
    for (let actor = 0; actor < ACTOR_COUNT; actor++) {
      await seedChange(config.changesDir, makeChange(`disk-stress-own-${actor}`));
    }
    await writeFile(configPath, JSON.stringify(config));
    process.env.ADV_TEST_MODE = "1";
    process.env.ADV_TEST_DATA_HOME = "0";
    process.env.XDG_DATA_HOME = config.xdgDataHome;
    process.env.ADV_WORKTREE_HOME = config.worktreeHome;
    await mkdir(xdgDataHome, { recursive: true });
    await mkdir(worktreeHome, { recursive: true });
    git(root, "init", "-b", "main");
    git(root, "config", "user.email", "stress@example.test");
    git(root, "config", "user.name", "ADV stress harness");
    await writeFile(join(root, "README.md"), "disk stress fixture\n");
    git(root, "add", "README.md");
    git(root, "commit", "-m", "seed disk stress fixture");

    const children = await Promise.all(
      Array.from({ length: ACTOR_COUNT }, (_, actor) =>
        spawnJson("actor", configPath, actor),
      ),
    );
    const actors = children.map((child) => child.value as ActorResult);
    const actorErrors = children.flatMap((child) => [
      ...(child.exitCode === 0
        ? []
        : [`child exit ${child.exitCode}: ${child.stderr}`]),
      ...(child.value?.error ? [String(child.value.error)] : []),
    ]);

    const createResults = actors.map(
      (actor) => actor.create as { ok?: boolean; reused?: boolean },
    );
    const firstCreated = actors.find(
      (actor) => (actor.create as { ok?: boolean }).ok,
    )!.create as { path: string };
    const pendingAccess = {
      projectDir: root,
      projectId,
    };
    await setPendingDelete(
      pendingAccess,
      WORKTREE_BRANCH,
      firstCreated.path,
      "stress harness retained in-use worktree",
    );
    const queuedPending = (await getPendingDeletes(pendingAccess)).some(
      (entry) => entry.branch === WORKTREE_BRANCH,
    );
    const drainChild = await spawnJson("drain", configPath);
    if (drainChild.exitCode !== 0 || drainChild.value?.after?.length) {
      actorErrors.push(
        `startup drain: ${JSON.stringify(drainChild.value)}${drainChild.stderr ? ` stderr=${drainChild.stderr}` : ""}`,
      );
    }
    const remainingPending = await getPendingDeletes({
      projectDir: root,
      projectId,
    });
    const drained =
      drainChild.exitCode === 0 &&
      remainingPending.length === 0 &&
      !git(root, "worktree", "list", "--porcelain").includes(WORKTREE_BRANCH);

    const blockedChange = makeChange("disk-stress-blocked", {
      contract: {
        version: 1,
        rigor: "standard",
        source: {
          artifact: "agreement",
          approvedAt: "2026-01-01T00:00:00.000Z",
        },
        items: [
          {
            id: "AC-STRESS",
            kind: "acceptance_criterion",
            text: "Archive requires durable proof",
            sourceArtifact: "agreement",
            verificationRequired: true,
            evidencePolicy: "test",
            status: "approved",
          },
        ],
        amendments: [],
      },
      deltas: {
        "test-capability": [
          {
            id: "dl-blocked",
            operation: "remove",
            target_id: "missing-requirement",
            reason: "fail-closed stress case",
          },
        ],
      },
    });
    const blocked = await archiveChange({
      change: blockedChange,
      specs: new Map(),
      paths: {
        specs: config.specsDir,
        archive: config.archiveDir,
        docs: config.docsDir,
      },
    });
    const blockedBundle = await findArchiveBundle(
      config.archiveDir,
      blockedChange.id,
    );
    const archiveBundle = await findArchiveBundle(
      config.archiveDir,
      ARCHIVE_CHANGE_ID,
    );
    const archiveProjection = archiveBundle
      ? JSON.parse(
          await readFile(join(archiveBundle, "change.json"), "utf8"),
        )
      : null;
    const releaseProjection = JSON.parse(
      await readFile(
        join(config.changesDir, RELEASE_CHANGE_ID, "change.json"),
        "utf8",
      ),
    );
    const files = await assertJsonFiles(config);
    const lockWaitMs = actors.map((actor) => actor.lockWaitMs);
    const lockTimeouts = actors
      .flatMap((actor) => actor.commits)
      .filter((commit) => commit.kind === "lock_timeout").length;
    const committedUnverified = actors
      .flatMap((actor) => actor.commits)
      .filter((commit) => commit.kind === "committed_unverified").length;
    const expectedRecords = ACTOR_COUNT * 3 + ACTOR_COUNT + ACTOR_COUNT + 1;
    const archiveSuccesses = actors.filter((actor) => actor.archive.success).length;
    const assertions = {
      tenIndependentActors: actors.length === ACTOR_COUNT && actorErrors.length === 0,
      lockWaitP95Bounded:
        percentile(lockWaitMs, 0.95) <= LOCK_WAIT_P95_THRESHOLD_MS,
      zeroLockTimeouts: lockTimeouts === 0,
      zeroCommittedUnverified: committedUnverified === 0,
      zeroTornWrites: files.tornWrites === 0,
      recordsSurvive: files.survivingRecords >= expectedRecords,
      createDeleteStable:
        createResults.every((result) => result.ok) &&
        createResults.some((result) => result.reused === false) &&
        createResults.some((result) => result.reused === true) &&
        drained,
      pendingDeletePersistsAndDrains: queuedPending && drained,
      archiveReleaseTerminal:
        archiveSuccesses === ACTOR_COUNT &&
        archiveProjection?.status === "archived" &&
        releaseProjection.status === "archived" &&
        releaseProjection.gates?.release?.status === "done",
      archiveFailsClosed: blocked.success === false && blockedBundle === null,
    };
    return {
      checkedAt: new Date().toISOString(),
      actorCount: actors.length,
      lockBudgetMs: LOCK_BUDGET_MS,
      lockWaitP95ThresholdMs: LOCK_WAIT_P95_THRESHOLD_MS,
      lockWaitMs,
      lockWaitP95Ms: percentile(lockWaitMs, 0.95),
      lockTimeouts,
      committedUnverified,
      tornWrites: files.tornWrites,
      expectedRecords,
      survivingRecords: files.survivingRecords,
      createResults: {
        successful: createResults.filter((result) => result.ok).length,
        fresh: createResults.filter(
          (result) => result.ok && result.reused === false,
        ).length,
        reused: createResults.filter(
          (result) => result.ok && result.reused === true,
        ).length,
      },
      pendingDelete: {
        queued: queuedPending,
        drained,
        remaining: remainingPending.length,
      },
      archiveRelease: {
        archiveSuccesses,
        archiveBundleTerminal: archiveProjection?.status === "archived",
        releaseProjectionTerminal:
          releaseProjection.status === "archived" &&
          releaseProjection.gates?.release?.status === "done",
        failClosed: blocked.success === false && blockedBundle === null,
      },
      actorErrors,
      assertions,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function renderDiskStressReport(evidence: StressEvidence): string {
  const pass = Object.values(evidence.assertions).every(Boolean);
  const rows = Object.entries(evidence.assertions)
    .map(([name, value]) => `| ${name} | ${value ? "PASS" : "FAIL"} |`)
    .join("\n");
  return `# Ten-Agent Concurrency Evidence Report\n\n**Checked at:** ${evidence.checkedAt}\n**Method:** ${evidence.actorCount} independent Bun child processes against isolated temporary disk state and temporary git repositories.\n\n## Result\n\n**${pass ? "PASS" : "FAIL"}** — disk-only concurrency clearance.\n\n## Metrics\n\n- Lock budget: **${evidence.lockBudgetMs} ms**\n- Lock-wait P95: **${evidence.lockWaitP95Ms} ms** (threshold: **${evidence.lockWaitP95ThresholdMs} ms**, 20% of the 15s lock budget)\n- Lock timeouts: **${evidence.lockTimeouts}**\n- committed_unverified outcomes: **${evidence.committedUnverified}**\n- Torn/corrupt JSON or JSONL writes: **${evidence.tornWrites}**\n- Expected records: **${evidence.expectedRecords}**\n- Surviving records: **${evidence.survivingRecords}**\n\n## Worktree and terminal projections\n\n- Create results: **${evidence.createResults.successful}** successful (${evidence.createResults.fresh} fresh, ${evidence.createResults.reused} reused)\n- Pending delete queued: **${evidence.pendingDelete.queued}**\n- Startup drain complete: **${evidence.pendingDelete.drained}**\n- Archive calls successful: **${evidence.archiveRelease.archiveSuccesses}/${evidence.actorCount}**\n- Archive bundle terminal: **${evidence.archiveRelease.archiveBundleTerminal}**\n- Release projection terminal: **${evidence.archiveRelease.releaseProjectionTerminal}**\n- Archive fail-closed: **${evidence.archiveRelease.failClosed}**\n\n## Assertions\n\n| Assertion | Result |\n|---|---|\n${rows}\n\n## Scope and safety\n\n- No OpenCode sessions or background workers were created.\n- XDG_DATA_HOME and ADV_WORKTREE_HOME pointed into the temporary fixture.\n- Temporary projections, JSONL stores, git worktrees, and archive output were removed after verification.\n`;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "--actor" || mode === "--drain") {
    const config = JSON.parse(
      await readFile(process.argv[3]!, "utf8"),
    ) as HarnessConfig;
    process.env.ADV_TEST_MODE = "1";
    process.env.ADV_TEST_DATA_HOME = "0";
    process.env.XDG_DATA_HOME = config.xdgDataHome;
    process.env.ADV_WORKTREE_HOME = config.worktreeHome;
    const value =
      mode === "--actor"
        ? await runActor(config, Number(process.argv[4]))
        : await runDrain(config);
    console.log(JSON.stringify(value));
    return;
  }
  const evidence = await runDiskConcurrencyStress();
  const reportFlag = process.argv.indexOf("--report");
  if (reportFlag !== -1 && process.argv[reportFlag + 1]) {
    await writeFile(
      process.argv[reportFlag + 1]!,
      renderDiskStressReport(evidence),
    );
  }
  console.log(JSON.stringify(evidence, null, 2));
  if (!Object.values(evidence.assertions).every(Boolean)) process.exitCode = 1;
}

if (import.meta.main) await main();
