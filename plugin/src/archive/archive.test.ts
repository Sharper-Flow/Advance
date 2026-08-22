import { existsSync } from "fs";
import { createHash } from "crypto";
import { execSync } from "child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";
import { afterEach, describe, expect, test } from "vitest";
import type { Change } from "../types";
import { ChangeSchema } from "../types";
import { atomicWriteFile } from "../utils/fs";
import {
  archiveChange,
  bundleJsonStringify,
  createInRepoArchive,
  generateContractTraceability,
  getArchiveContractProofErrors,
  reconcileInRepoArchive,
} from "./archive";
import {
  TERMINAL_SUMMARY_FILE,
  buildTerminalArchiveSummary,
  serializeTerminalArchiveSummary,
  validateTerminalArchiveSummary,
  verifyTerminalArchiveSummaryHash,
} from "./terminal-summary";

const createdAt = "2026-05-08T00:00:00.000Z";
let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  tempDirs = [];
});

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adv-archive-contract-"));
  tempDirs.push(dir);
  return dir;
}

async function gitRepo(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `adv-archive-${name}-`));
  tempDirs.push(dir);
  execSync("git init", { cwd: dir });
  execSync("git config user.email 'test@test.com'", { cwd: dir });
  execSync("git config user.name 'Test'", { cwd: dir });
  execSync("git branch -m main", { cwd: dir });
  await writeFile(join(dir, "README.md"), `# ${name}\n`);
  execSync("git add README.md", { cwd: dir });
  execSync("git commit -m 'initial'", { cwd: dir });
  execSync("git checkout -b change/test", { cwd: dir });
  await writeFile(join(dir, `${name}.txt`), `${name}\n`);
  execSync(`git add ${name}.txt`, { cwd: dir });
  execSync("git commit -m 'change'", { cwd: dir });
  return dir;
}

function gitHead(repo: string): string {
  return execSync("git rev-parse HEAD", { cwd: repo }).toString().trim();
}

function changeWithContract(overrides: Partial<Change> = {}): Change {
  return {
    id: "contract-change",
    title: "Contract change",
    status: "active",
    created_at: createdAt,
    tasks: [
      {
        id: "tk-1",
        title: "Implement AC1",
        type: "code",
        status: "done",
        priority: 0,
        created_at: createdAt,
        contract_refs: { implements: ["AC1"], verifies: ["AC1"] },
      },
    ],
    deltas: {},
    contract: {
      version: 1,
      rigor: "standard",
      source: {
        artifact: "agreement",
        approvedAt: createdAt,
      },
      items: [
        {
          id: "AC1",
          kind: "acceptance_criterion",
          text: "Archive includes contract proof",
          sourceArtifact: "agreement",
          verificationRequired: true,
          evidencePolicy: "test",
          status: "approved",
        },
      ],
      reviewMatrix: {
        reviewedAt: "2026-05-08T01:00:00.000Z",
        rows: [
          {
            contractId: "AC1",
            kind: "acceptance_criterion",
            status: "pass",
            evidencePolicy: "test",
            evidence: "pnpm test -- archive contract proof passed",
          },
        ],
      },
      amendments: [],
    },
    ...overrides,
  } as Change;
}

describe("contract archive traceability", () => {
  test("blocks archive proof when review matrix is missing", () => {
    const change = changeWithContract({
      contract: {
        ...changeWithContract().contract!,
        reviewMatrix: undefined,
      },
    });

    expect(getArchiveContractProofErrors(change)).toContain(
      "Contract proof missing: change has required contract items but no review matrix",
    );
  });

  test("blocks unresolved review matrix statuses", () => {
    const base = changeWithContract();
    const change = changeWithContract({
      contract: {
        ...base.contract!,
        reviewMatrix: {
          reviewedAt: "2026-05-08T01:00:00.000Z",
          rows: [
            {
              ...base.contract!.reviewMatrix!.rows[0],
              status: "unknown",
            },
          ],
        },
      },
    });

    expect(getArchiveContractProofErrors(change)).toContain(
      'Contract proof unresolved: AC1 has status "unknown"',
    );
  });

  test("generates contract traceability markdown", () => {
    const markdown = generateContractTraceability(changeWithContract());

    expect(markdown).toContain("# Contract Traceability");
    expect(markdown).toContain("| AC1 | acceptance_criterion | pass |");
    expect(markdown).toContain("pnpm test -- archive contract proof passed");
  });

  test("archiveChange writes CONTRACT_TRACEABILITY.md for proven contracts", async () => {
    const root = await tempProject();
    const result = await archiveChange({
      change: changeWithContract(),
      specs: new Map(),
      paths: {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: join(root, "archive"),
      },
    });

    expect(result.success).toBe(true);
    const trace = await readFile(
      join(result.archivePath, "CONTRACT_TRACEABILITY.md"),
      "utf8",
    );
    expect(trace).toContain("# Contract Traceability");
    expect(trace).toContain("AC1");
  });

  test("archiveChange writes reconciled spec, docs, and manifest only to supplied worktree paths", async () => {
    const root = await tempProject();
    const mainSpecs = join(root, "main", ".adv", "specs");
    const worktree = join(root, "worktree");
    const worktreeSpecs = join(worktree, ".adv", "specs");
    const worktreeDocs = join(worktree, "docs", "specs");
    const inRepoArchive = join(worktree, ".adv", "archive");
    const baseline = {
      name: "example",
      title: "Example",
      purpose: "Example capability",
      version: "1.0.0",
      updated_at: createdAt,
      requirements: [],
    };
    await mkdir(join(mainSpecs, "example"), { recursive: true });
    await writeFile(
      join(mainSpecs, "example", "spec.json"),
      JSON.stringify(baseline),
    );

    const result = await archiveChange({
      change: changeWithContract({
        id: "worktree-projection",
        deltas: {
          example: [
            {
              id: "dl-add",
              operation: "add",
              requirement: {
                id: "rq-example01",
                title: "Example law",
                body: "Archive projects this law",
                priority: "must",
                scenarios: [
                  {
                    id: "rq-example01.1",
                    title: "Projected",
                    given: ["An accepted delta"],
                    when: "Archive succeeds",
                    then: ["The worktree contains the law"],
                  },
                ],
              },
            },
          ],
        },
      }),
      specs: new Map([["example", baseline]]),
      paths: {
        specs: worktreeSpecs,
        docs: worktreeDocs,
        archive: join(root, "external-archive"),
        inRepoArchive,
      },
    });

    expect(result.success).toBe(true);
    expect(
      JSON.parse(
        await readFile(join(worktreeSpecs, "example", "spec.json"), "utf8"),
      ).requirements.map((row: { id: string }) => row.id),
    ).toContain("rq-example01");
    expect(
      JSON.parse(
        await readFile(join(mainSpecs, "example", "spec.json"), "utf8"),
      ).requirements,
    ).toEqual([]);
    expect(await readFile(join(worktreeDocs, "example.md"), "utf8")).toContain(
      "Example law",
    );
    expect(
      JSON.parse(
        await readFile(
          join(result.archivePath, "spec-projection.json"),
          "utf8",
        ),
      ).change_id,
    ).toBe("worktree-projection");
    expect(
      result.commitPaths.some((path) => path.endsWith("docs/specs/example.md")),
    ).toBe(true);
    expect(
      result.commitPaths.some((path) => path.includes("/.adv/archive/")),
    ).toBe(true);
  });

  test("semantic projection conflict writes no bundle or spec", async () => {
    const root = await tempProject();
    const baseline = {
      name: "example",
      title: "Example",
      purpose: "Example capability",
      version: "1.0.0",
      updated_at: createdAt,
      requirements: [
        {
          id: "rq-example01",
          title: "Current",
          body: "Current law",
          priority: "must" as const,
        },
      ],
    };
    const result = await archiveChange({
      change: changeWithContract({
        id: "projection-conflict",
        deltas: {
          example: [
            {
              id: "dl-add",
              operation: "add",
              requirement: {
                ...baseline.requirements[0],
                title: "Conflicting",
              },
            },
          ],
        },
      }),
      specs: new Map([["example", baseline]]),
      paths: {
        specs: join(root, "worktree", ".adv", "specs"),
        docs: join(root, "worktree", "docs", "specs"),
        archive: join(root, "external-archive"),
      },
    });

    expect(result.success).toBe(false);
    expect(result.errors.join("\n")).toContain("conflicting");
    expect(existsSync(result.archivePath)).toBe(false);
    expect(existsSync(join(root, "worktree", ".adv", "specs"))).toBe(false);
  });

  test("archiveChange reconciles missing in-repo archive when external bundle already exists", async () => {
    const root = await tempProject();
    const change = changeWithContract();
    const archiveDir = join(root, "external-archive");
    const inRepoArchiveDir = join(root, "repo", ".adv", "archive");
    const today = new Date().toISOString().split("T")[0];
    const externalBundle = join(archiveDir, `${today}-${change.id}`);

    await mkdir(externalBundle, { recursive: true });
    const changeJsonRaw = bundleJsonStringify({
      ...change,
      status: "archived",
    });
    await atomicWriteFile(join(externalBundle, "change.json"), changeJsonRaw);
    const changeHash = createHash("sha256")
      .update(changeJsonRaw, "utf-8")
      .digest("hex");
    await atomicWriteFile(
      join(externalBundle, TERMINAL_SUMMARY_FILE),
      serializeTerminalArchiveSummary(
        buildTerminalArchiveSummary({
          change: ChangeSchema.parse({ ...change, status: "archived" }),
          archivedAt: createdAt,
          changeHash,
        }),
      ),
    );

    await reconcileInRepoArchive(change, archiveDir, inRepoArchiveDir);

    const inRepoChange = await readFile(
      join(inRepoArchiveDir, `${today}-${change.id}`, "change.json"),
      "utf8",
    );
    expect(JSON.parse(inRepoChange).status).toBe("archived");
  });

  // rq-fixReconcileArchivedAt (Defect A): reconcileInRepoArchive must
  // resolve the authoritative archived_at from the existing source bundle's
  // terminal summary and never silently stamp "now".
  describe("reconcileInRepoArchive preserves authoritative archived_at", () => {
    test("uses the external bundle's terminal-summary archived_at, not now()", async () => {
      const root = await tempProject();
      const change = changeWithContract({ id: "preserve-archived-at" });
      const archiveDir = join(root, "external-archive");
      const inRepoArchiveDir = join(root, "repo", ".adv", "archive");
      const today = new Date().toISOString().split("T")[0];
      const externalBundle = join(archiveDir, `${today}-${change.id}`);
      const originalArchivedAt = "2026-04-01T12:34:56.000Z";

      await mkdir(externalBundle, { recursive: true });
      const changeJsonRaw = bundleJsonStringify({
        ...change,
        status: "archived",
      });
      await atomicWriteFile(join(externalBundle, "change.json"), changeJsonRaw);
      const changeHash = createHash("sha256")
        .update(changeJsonRaw, "utf-8")
        .digest("hex");
      await atomicWriteFile(
        join(externalBundle, TERMINAL_SUMMARY_FILE),
        serializeTerminalArchiveSummary(
          buildTerminalArchiveSummary({
            change: ChangeSchema.parse({ ...change, status: "archived" }),
            archivedAt: originalArchivedAt,
            changeHash,
          }),
        ),
      );

      // Wait so any silent "now()" fallback would be observably later than
      // the original archived_at.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const beforeReconcile = new Date().toISOString();

      await reconcileInRepoArchive(change, archiveDir, inRepoArchiveDir);

      const inRepoSummaryRaw = await readFile(
        join(inRepoArchiveDir, `${today}-${change.id}`, TERMINAL_SUMMARY_FILE),
        "utf-8",
      );
      const inRepoSummary = validateTerminalArchiveSummary(
        JSON.parse(inRepoSummaryRaw),
      );
      expect(inRepoSummary.archived_at).toBe(originalArchivedAt);
      expect(inRepoSummary.archived_at < beforeReconcile).toBe(true);
    });

    test("fails loudly when the external bundle has no readable terminal summary", async () => {
      const root = await tempProject();
      const change = changeWithContract({ id: "missing-summary" });
      const archiveDir = join(root, "external-archive");
      const inRepoArchiveDir = join(root, "repo", ".adv", "archive");
      const today = new Date().toISOString().split("T")[0];
      const externalBundle = join(archiveDir, `${today}-${change.id}`);

      await mkdir(externalBundle, { recursive: true });
      await writeFile(
        join(externalBundle, "change.json"),
        JSON.stringify({ ...change, status: "archived" }, null, 2),
      );

      await expect(
        reconcileInRepoArchive(change, archiveDir, inRepoArchiveDir),
      ).rejects.toThrow(/terminal summary/i);
    });
  });

  test("reuses the existing bundle archived_at for external and in-repo retries", async () => {
    const root = await tempProject();
    const change = changeWithContract({ id: "retry-preserves-archived-at" });
    const archiveDir = join(root, "external-archive");
    const inRepoArchiveDir = join(root, "repo", ".adv", "archive");
    const paths = {
      specs: join(root, "specs"),
      docs: join(root, "docs"),
      archive: archiveDir,
      inRepoArchive: inRepoArchiveDir,
    };

    const firstResult = await archiveChange({
      change,
      specs: new Map(),
      paths,
    });
    const inRepoBundlePath = join(
      inRepoArchiveDir,
      basename(firstResult.archivePath),
    );
    const originalArchivedAt = validateTerminalArchiveSummary(
      JSON.parse(
        await readFile(
          join(firstResult.archivePath, TERMINAL_SUMMARY_FILE),
          "utf8",
        ),
      ),
    ).archived_at;
    const originalInRepoArchivedAt = validateTerminalArchiveSummary(
      JSON.parse(
        await readFile(join(inRepoBundlePath, TERMINAL_SUMMARY_FILE), "utf8"),
      ),
    ).archived_at;

    await new Promise((resolve) => setTimeout(resolve, 50));

    await archiveChange({
      change,
      specs: new Map(),
      paths,
      reuseExistingBundlePath: firstResult.archivePath,
    });

    const retriedArchivedAt = validateTerminalArchiveSummary(
      JSON.parse(
        await readFile(
          join(firstResult.archivePath, TERMINAL_SUMMARY_FILE),
          "utf8",
        ),
      ),
    ).archived_at;
    const retriedInRepoArchivedAt = validateTerminalArchiveSummary(
      JSON.parse(
        await readFile(join(inRepoBundlePath, TERMINAL_SUMMARY_FILE), "utf8"),
      ),
    ).archived_at;

    expect(retriedArchivedAt).toBe(originalArchivedAt);
    expect(retriedInRepoArchivedAt).toBe(originalInRepoArchivedAt);
    expect(retriedInRepoArchivedAt).toBe(originalArchivedAt);
  });

  test("single-repo archive bundle remains unchanged without scope_repos", async () => {
    const root = await tempProject();
    const result = await archiveChange({
      change: changeWithContract(),
      specs: new Map(),
      paths: {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: join(root, "archive"),
      },
    });

    expect(result.success).toBe(true);
    expect(
      existsSync(join(result.archivePath, "multi-repo-archive.json")),
    ).toBe(false);
  });

  test("multi-repo archive bundle captures ordered repo refs and verification evidence", async () => {
    const root = await tempProject();
    const backend = await gitRepo("backend");
    const web = await gitRepo("web");
    const backendHead = gitHead(backend);
    const webHead = gitHead(web);
    const change = changeWithContract({
      id: "multi-repo-change",
      scope_repos: [
        {
          repo_id: "web",
          path: web,
          repo_project_id: "a".repeat(40),
          required: true,
          merge_order: 2,
        },
        {
          repo_id: "backend",
          path: backend,
          repo_project_id: "b".repeat(40),
          required: true,
          merge_order: 1,
        },
      ],
      tasks: [
        {
          id: "tk-verify",
          title: "Verify both repos",
          type: "code",
          status: "done",
          priority: 0,
          created_at: createdAt,
          verification: "backend and web checks passed",
        },
      ],
      contract: undefined,
    });

    const result = await archiveChange({
      change,
      specs: new Map(),
      paths: {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: join(root, "archive"),
      },
    });

    expect(result.success).toBe(true);
    const metadata = JSON.parse(
      await readFile(
        join(result.archivePath, "multi-repo-archive.json"),
        "utf8",
      ),
    );
    expect(
      metadata.repos.map((repo: { repo_id: string }) => repo.repo_id),
    ).toEqual(["backend", "web"]);
    expect(metadata.repos[0]).toMatchObject({
      repo_id: "backend",
      head_before: backendHead,
      head_after: backendHead,
      ff_only_preflight: { passed: true },
    });
    expect(metadata.repos[1]).toMatchObject({
      repo_id: "web",
      head_before: webHead,
      head_after: webHead,
      ff_only_preflight: { passed: true },
    });
    expect(metadata.verification_evidence).toEqual([
      expect.objectContaining({
        task_id: "tk-verify",
        verification: "backend and web checks passed",
      }),
    ]);
  });

  test("multi-repo archive preflight fails before writing bundle when default branch diverged", async () => {
    const root = await tempProject();
    const backend = await gitRepo("backend-diverged");
    execSync("git checkout main", { cwd: backend });
    await writeFile(join(backend, "main-only.txt"), "main moved\n");
    execSync("git add main-only.txt", { cwd: backend });
    execSync("git commit -m 'main moved'", { cwd: backend });
    execSync("git checkout change/test", { cwd: backend });

    const result = await archiveChange({
      change: changeWithContract({
        id: "multi-repo-diverged",
        scope_repos: [
          {
            repo_id: "backend",
            path: backend,
            required: true,
            merge_order: 0,
          },
        ],
        contract: undefined,
      }),
      specs: new Map(),
      paths: {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: join(root, "archive"),
      },
    });

    expect(result.success).toBe(false);
    expect(result.errors.join("\n")).toContain("ff-only preflight failed");
    expect(existsSync(join(root, "archive"))).toBe(false);
  });

  // completeStateBackedGate AC4 + AC7: createInRepoArchive copies sibling
  // files from the source change directory (readdir-based copy). The
  // state-backed acceptance branch materializes executive-summary.md to that
  // directory at acceptance time, so a no-prior-disk change still produces a
  // bundle containing executive-summary.md. Legacy changes that already have
  // on-disk acceptance.md + executive-summary.md archive cleanly via the same
  // copy path.
  describe("executive-summary archive-bundle materialization (AC4, AC7)", () => {
    test("includes executive-summary.md and acceptance.md from the source change dir in the bundle", async () => {
      const root = await tempProject();
      const archiveDir = join(root, "archive");
      const sourceChangeDir = join(root, "changes", "state-backed-archive");
      await mkdir(sourceChangeDir, { recursive: true });
      // These files are written by the state-backed acceptance branch at
      // acceptance time (AC7) and by the legacy disk path for older changes
      // (AC4); from the archive's perspective the source is identical.
      await writeFile(
        join(sourceChangeDir, "executive-summary.md"),
        "# Executive Summary\n\nState-backed acceptance proof materialized to disk.",
      );
      await writeFile(
        join(sourceChangeDir, "acceptance.md"),
        "# Acceptance\n\nContract review proof.",
      );

      const archivePath = await createInRepoArchive(
        changeWithContract({ id: "state-backed-archive", status: "active" }),
        archiveDir,
        sourceChangeDir,
        undefined,
        createdAt,
      );

      expect(existsSync(join(archivePath, "executive-summary.md"))).toBe(true);
      await expect(
        readFile(join(archivePath, "executive-summary.md"), "utf-8"),
      ).resolves.toContain("State-backed acceptance proof materialized");
      expect(existsSync(join(archivePath, "acceptance.md"))).toBe(true);
      // change.json is never copied as a sibling (it is written from state).
      expect(existsSync(join(archivePath, "change.json"))).toBe(true);
    });

    test("archives cleanly when the source change dir is absent (legacy/no-disk safe)", async () => {
      const root = await tempProject();
      const archiveDir = join(root, "archive");

      // No sourceChangeDir → readdir copy is a no-op; archive still succeeds.
      const archivePath = await createInRepoArchive(
        changeWithContract({ id: "no-source-dir", status: "active" }),
        archiveDir,
        undefined,
        undefined,
        createdAt,
      );

      expect(existsSync(join(archivePath, "change.json"))).toBe(true);
      expect(existsSync(join(archivePath, "ARCHIVE_SUMMARY.md"))).toBe(true);
    });
  });

  // KD1 (#403): archive sources narrative .md from the projection; the
  // sourceChangeDir copy only fills kinds absent from the projection (legacy).
  describe("projection-sourced narrative archive (KD1, #403)", () => {
    test("writes agreement.md from change.documents when no source dir is provided", async () => {
      const root = await tempProject();
      const archiveDir = join(root, "archive");
      const change = changeWithContract({
        id: "projection-only",
        status: "active",
        documents: { agreement: "# Agreement\n\nFrom the projection." },
      });

      const archivePath = await createInRepoArchive(
        change,
        archiveDir,
        undefined,
        undefined,
        createdAt,
      );

      expect(existsSync(join(archivePath, "agreement.md"))).toBe(true);
      await expect(
        readFile(join(archivePath, "agreement.md"), "utf-8"),
      ).resolves.toContain("From the projection.");
    });

    test("projection content wins over stale active-dir .md for a transitional change", async () => {
      const root = await tempProject();
      const archiveDir = join(root, "archive");
      const sourceChangeDir = join(root, "changes", "transitional");
      await mkdir(sourceChangeDir, { recursive: true });
      // Stale on-disk agreement from before the projection-canonical update.
      await writeFile(
        join(sourceChangeDir, "agreement.md"),
        "# Agreement\n\nSTALE disk content.",
      );
      const change = changeWithContract({
        id: "transitional",
        status: "active",
        documents: { agreement: "# Agreement\n\nCURRENT projection content." },
      });

      const archivePath = await createInRepoArchive(
        change,
        archiveDir,
        sourceChangeDir,
        undefined,
        createdAt,
      );

      const bundled = await readFile(
        join(archivePath, "agreement.md"),
        "utf-8",
      );
      expect(bundled).toContain("CURRENT projection content.");
      expect(bundled).not.toContain("STALE disk content.");
    });

    test("legacy change with on-disk .md and empty projection still archives the disk content", async () => {
      const root = await tempProject();
      const archiveDir = join(root, "archive");
      const sourceChangeDir = join(root, "changes", "legacy-disk");
      await mkdir(sourceChangeDir, { recursive: true });
      await writeFile(
        join(sourceChangeDir, "agreement.md"),
        "# Agreement\n\nLegacy on-disk only.",
      );
      // No documents in projection (pre-cutover legacy change).
      const change = changeWithContract({
        id: "legacy-disk",
        status: "active",
      });

      const archivePath = await createInRepoArchive(
        change,
        archiveDir,
        sourceChangeDir,
      );

      await expect(
        readFile(join(archivePath, "agreement.md"), "utf-8"),
      ).resolves.toContain("Legacy on-disk only.");
    });
  });

  describe("archive briefing digest (AC7)", () => {
    test("archiveChange writes BRIEFING_DIGEST.md with identity, status, and terminal gate summary", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "digest-change",
        status: "active",
        gates: {
          proposal: { status: "done", completed_at: createdAt },
          discovery: { status: "done", completed_at: createdAt },
          design: { status: "done", completed_at: createdAt },
          planning: { status: "done", completed_at: createdAt },
          execution: { status: "done", completed_at: createdAt },
          acceptance: { status: "done", completed_at: createdAt },
          release: { status: "done", completed_at: createdAt },
        },
      });

      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
        },
      });

      expect(result.success).toBe(true);
      const digestPath = join(result.archivePath, "BRIEFING_DIGEST.md");
      expect(existsSync(digestPath)).toBe(true);
      const digest = await readFile(digestPath, "utf8");
      expect(digest).toContain("Archive Briefing Digest");
      expect(digest).toContain("digest-change");
      expect(digest).toContain("TERMINAL_GATE_SUMMARY");
      expect(digest).toContain("release");
      expect(digest).toContain("archived");
    });

    test("digest excludes transient prompt context and includes durable fact outcomes", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "digest-facts",
        status: "active",
        contract: undefined,
        tasks: [
          {
            id: "tk-digest",
            title: "Digest task",
            type: "code",
            status: "done",
            priority: 0,
            created_at: createdAt,
            subagent_reports: [
              {
                schema_version: "1.0",
                change_id: "digest-facts",
                task_id: "tk-digest",
                attempt: 1,
                workdir_used: "/tmp/wt",
                scope: { kind: "task", task_id: "tk-digest" },
                agent: "adv-engineer",
                status: "complete",
                files_touched: ["src/a.ts"],
                verification: [
                  {
                    command: "pnpm test",
                    exit_code: 0,
                    summary: "All tests pass",
                  },
                ],
                decisions: [{ what: "Use renderer", why: "Pure function" }],
                blockers: [],
                scope_drift: null,
                follow_ups: [],
                required_follow_ups: [],
                required_main_agent_actions: ["Review digest"],
                related_scan: "none",
                context_update_for_adv: {
                  what_ads_needs_to_know: "Digest ready",
                  suggested_next_action: "Review digest",
                },
              },
            ],
          },
        ],
      });

      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
        },
      });

      expect(result.success).toBe(true);
      const digest = await readFile(
        join(result.archivePath, "BRIEFING_DIGEST.md"),
        "utf8",
      );
      expect(digest).toContain("Review digest");
      expect(digest).toContain("Use renderer");
      expect(digest).not.toContain("Digest ready");
      expect(digest).not.toContain("context_update_for_adv");
    });

    test("digest includes Epic terminal note when present", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "digest-epic",
        status: "active",
        contract: undefined,
        epic_membership: {
          epic_id: "epicCleanup",
          entry_id: "entry-1",
          order: 2,
          title: "Cleanup initiative",
          linked_at: createdAt,
        },
      });

      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
        },
      });

      expect(result.success).toBe(true);
      const digest = await readFile(
        join(result.archivePath, "BRIEFING_DIGEST.md"),
        "utf8",
      );
      expect(digest).toContain("epicCleanup");
      expect(digest).toContain("Cleanup initiative");
    });

    test("digest includes contract / AC coverage summary when contract present", async () => {
      const root = await tempProject();
      const change = changeWithContract({ id: "digest-contract" });

      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
        },
      });

      expect(result.success).toBe(true);
      const digest = await readFile(
        join(result.archivePath, "BRIEFING_DIGEST.md"),
        "utf8",
      );
      expect(digest).toContain("Contract / AC Coverage");
      expect(digest).toContain("AC1");
    });

    test("repeated archive overwrites deterministic digest path and does not duplicate durable promotions", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "digest-idempotent",
        status: "active",
        contract: undefined,
        wisdom: [
          {
            id: "ws-1",
            type: "convention",
            content: "Always write tests first",
            source_task: "tk-1",
            recorded_at: createdAt,
          },
        ],
      });

      const paths = {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: join(root, "archive"),
        wisdom: join(root, "wisdom.json"),
      };

      const result1 = await archiveChange({
        change,
        specs: new Map(),
        paths,
      });
      expect(result1.success).toBe(true);
      expect(result1.wisdomPromoted).toBe(1);
      const digestPath1 = join(result1.archivePath, "BRIEFING_DIGEST.md");
      expect(existsSync(digestPath1)).toBe(true);
      const digest1 = await readFile(digestPath1, "utf8");

      const result2 = await archiveChange({
        change,
        specs: new Map(),
        paths,
      });
      expect(result2.success).toBe(true);
      expect(result2.wisdomPromoted).toBeFalsy();
      const digestPath2 = join(result2.archivePath, "BRIEFING_DIGEST.md");
      expect(digestPath1).toBe(digestPath2);
      const digest2 = await readFile(digestPath2, "utf8");
      expect(digest2.length).toBe(digest1.length);

      const wisdomContent = await readFile(paths.wisdom, "utf8");
      const wisdomEntries = wisdomContent
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(wisdomEntries).toHaveLength(1);
    });

    test("archive replay reuses an existing dated bundle instead of duplicating digests", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "digest-cross-day",
        status: "active",
        contract: undefined,
      });
      const paths = {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: join(root, "archive"),
      };
      const existingArchivePath = join(
        paths.archive,
        "2026-01-01-digest-cross-day",
      );
      await mkdir(existingArchivePath, { recursive: true });
      await writeFile(
        join(existingArchivePath, "change.json"),
        JSON.stringify({ ...change, status: "archived" }, null, 2),
      );

      const result = await archiveChange({
        change,
        specs: new Map(),
        paths,
      });

      expect(result.success).toBe(true);
      expect(result.archivePath).toBe(existingArchivePath);
      expect(existsSync(join(existingArchivePath, "BRIEFING_DIGEST.md"))).toBe(
        true,
      );
      const matchingBundles = (await readdir(paths.archive)).filter((name) =>
        name.endsWith("-digest-cross-day"),
      );
      expect(matchingBundles).toEqual(["2026-01-01-digest-cross-day"]);
    });

    test("reports a structured failure when a reused bundle lacks its terminal summary", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "digest-missing-terminal-summary",
        status: "active",
        contract: undefined,
      });
      const paths = {
        specs: join(root, "specs"),
        docs: join(root, "docs"),
        archive: join(root, "archive"),
      };
      const existingArchivePath = join(
        paths.archive,
        "2026-01-01-digest-missing-terminal-summary",
      );
      await mkdir(existingArchivePath, { recursive: true });
      await writeFile(
        join(existingArchivePath, "change.json"),
        JSON.stringify({ ...change, status: "archived" }, null, 2),
      );

      const result = await archiveChange({
        change,
        specs: new Map(),
        paths,
        reuseExistingBundlePath: existingArchivePath,
      });

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          changeId: change.id,
          archivePath: existingArchivePath,
          archivedAt: "",
          requirement: "rq-archiveTerminalDurability01.1",
        }),
      );
      expect(result.errors).toContain(
        "Cannot preserve archive timestamp for digest-missing-terminal-summary: terminal summary is not_found.",
      );
    });
  });

  describe("archive bundle JSON artifacts end with exactly one trailing newline (AC3/SC2)", () => {
    async function expectSingleTrailingNewline(path: string): Promise<void> {
      const raw = await readFile(path, "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.endsWith("\n\n")).toBe(false);
      expect(() => JSON.parse(raw)).not.toThrow();
    }

    test("bundleJsonStringify emits exactly one trailing newline for objects, arrays, and strings", () => {
      expect(bundleJsonStringify({ a: 1 }).endsWith("\n")).toBe(true);
      expect(bundleJsonStringify({ a: 1 }).endsWith("\n\n")).toBe(false);
      expect(bundleJsonStringify([1, 2, 3]).endsWith("\n")).toBe(true);
      expect(bundleJsonStringify("tail\n").endsWith("\n")).toBe(true);
      expect(bundleJsonStringify("tail\n").endsWith("\n\n")).toBe(false);
      expect(JSON.parse(bundleJsonStringify({ a: 1 }))).toEqual({ a: 1 });
    });

    test("bundleJsonStringify rejects values JSON.stringify cannot serialize", () => {
      expect(() => bundleJsonStringify(undefined)).toThrow(
        "Archive bundle JSON value must be JSON-serializable",
      );
    });

    test("createArchive (via archiveChange) writes newline-terminated change.json and wisdom.json", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "newline-external",
        wisdom: [
          {
            id: "ws-newline",
            type: "convention",
            content: "newline matters",
            source_task: "tk-1",
            recorded_at: createdAt,
          },
        ],
      });
      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
        },
      });
      expect(result.success).toBe(true);
      await expectSingleTrailingNewline(
        join(result.archivePath, "change.json"),
      );
      await expectSingleTrailingNewline(
        join(result.archivePath, "wisdom.json"),
      );
    });

    test("createArchive (via archiveChange) writes newline-terminated multi-repo-archive.json", async () => {
      const root = await tempProject();
      const backend = await gitRepo("nl-backend");
      const change = changeWithContract({
        id: "newline-multi",
        contract: undefined,
        scope_repos: [
          {
            repo_id: "backend",
            path: backend,
            repo_project_id: "b".repeat(40),
            required: true,
            merge_order: 0,
          },
        ],
      });
      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
        },
      });
      expect(result.success).toBe(true);
      await expectSingleTrailingNewline(
        join(result.archivePath, "multi-repo-archive.json"),
      );
    });

    test("createInRepoArchive writes newline-terminated change.json and wisdom.json", async () => {
      const root = await tempProject();
      const archiveDir = join(root, "archive");
      const change = changeWithContract({
        id: "newline-inrepo",
        wisdom: [
          {
            id: "ws-newline",
            type: "convention",
            content: "newline matters",
            source_task: "tk-1",
            recorded_at: createdAt,
          },
        ],
      });
      const archivePath = await createInRepoArchive(
        change,
        archiveDir,
        undefined,
        undefined,
        createdAt,
      );
      await expectSingleTrailingNewline(join(archivePath, "change.json"));
      await expectSingleTrailingNewline(join(archivePath, "wisdom.json"));
    });
  });

  describe("terminal-summary archive bundles (SC4/AC4/AC6)", () => {
    test("archiveChange writes summary.v1.json to the external archive", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "terminal-summary-external",
        gates: {
          proposal: { status: "done", completed_at: createdAt },
          discovery: { status: "done", completed_at: createdAt },
          design: { status: "done", completed_at: createdAt },
          planning: { status: "done", completed_at: createdAt },
          execution: { status: "done", completed_at: createdAt },
          acceptance: { status: "done", completed_at: createdAt },
          release: { status: "done", completed_at: createdAt },
        },
      });

      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
        },
      });

      expect(result.success).toBe(true);
      const summaryPath = join(result.archivePath, TERMINAL_SUMMARY_FILE);
      expect(existsSync(summaryPath)).toBe(true);
      const raw = await readFile(summaryPath, "utf-8");
      const summary = validateTerminalArchiveSummary(JSON.parse(raw));
      expect(summary.version).toBe("1");
      expect(summary.change_id).toBe("terminal-summary-external");
      expect(summary.status).toBe("archived");
      expect(summary.current_gate).toBe("done");
      expect(summary.task_count).toBe(1);
      expect(summary.completed_tasks).toBe(1);
      expect(summary.change_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(summary.summary_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(verifyTerminalArchiveSummaryHash(summary)).toBe(true);
    });

    test("createInRepoArchive writes summary.v1.json to the in-repo archive", async () => {
      const root = await tempProject();
      const archiveDir = join(root, "archive");
      const change = changeWithContract({
        id: "terminal-summary-inrepo",
        contract: undefined,
      });

      const archivePath = await createInRepoArchive(
        change,
        archiveDir,
        undefined,
        undefined,
        createdAt,
      );
      const summaryPath = join(archivePath, TERMINAL_SUMMARY_FILE);
      expect(existsSync(summaryPath)).toBe(true);
      const raw = await readFile(summaryPath, "utf-8");
      const summary = validateTerminalArchiveSummary(JSON.parse(raw));
      expect(summary.version).toBe("1");
      expect(summary.change_id).toBe("terminal-summary-inrepo");
      expect(summary.status).toBe("archived");
    });

    test("external and in-repo terminal summaries are coherent for the same Change", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "terminal-summary-coherent",
        contract: undefined,
      });
      const inRepoArchiveDir = join(root, "repo", ".adv", "archive");

      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
          inRepoArchive: inRepoArchiveDir,
        },
      });

      expect(result.success).toBe(true);
      const externalRaw = await readFile(
        join(result.archivePath, TERMINAL_SUMMARY_FILE),
        "utf-8",
      );
      const inRepoRaw = await readFile(
        join(
          inRepoArchiveDir,
          `${new Date().toISOString().split("T")[0]}-terminal-summary-coherent`,
          TERMINAL_SUMMARY_FILE,
        ),
        "utf-8",
      );
      const externalSummary = validateTerminalArchiveSummary(
        JSON.parse(externalRaw),
      );
      const inRepoSummary = validateTerminalArchiveSummary(
        JSON.parse(inRepoRaw),
      );
      expect(externalSummary.change_hash).toBe(inRepoSummary.change_hash);
      expect(externalSummary.archived_at).toBe(inRepoSummary.archived_at);
      expect(inRepoSummary).toEqual(externalSummary);
    });

    test("change_hash binds terminal summary to the sibling change.json bytes", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "terminal-summary-hash-binding",
        contract: undefined,
      });
      const archivePath = await createInRepoArchive(
        change,
        join(root, "archive"),
        undefined,
        undefined,
        createdAt,
      );
      const changeJson = await readFile(
        join(archivePath, "change.json"),
        "utf-8",
      );
      const summary = validateTerminalArchiveSummary(
        JSON.parse(
          await readFile(join(archivePath, TERMINAL_SUMMARY_FILE), "utf-8"),
        ),
      );
      const expectedHash = createHash("sha256")
        .update(changeJson, "utf-8")
        .digest("hex");
      expect(summary.change_hash).toBe(expectedHash);
    });

    test("terminal summary is lightweight relative to full change.json", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "terminal-summary-lightweight",
        contract: undefined,
        documents: {
          proposal: "a".repeat(5000),
          acceptance: "b".repeat(5000),
        },
      });
      const archivePath = await createInRepoArchive(
        change,
        join(root, "archive"),
        undefined,
        undefined,
        createdAt,
      );
      const changeJson = await readFile(
        join(archivePath, "change.json"),
        "utf-8",
      );
      const summaryJson = await readFile(
        join(archivePath, TERMINAL_SUMMARY_FILE),
        "utf-8",
      );
      expect(summaryJson.length).toBeLessThan(changeJson.length / 2);
    });

    test("summary.v1.json is newline-terminated", async () => {
      const root = await tempProject();
      const change = changeWithContract({
        id: "terminal-summary-newline",
        contract: undefined,
      });
      const result = await archiveChange({
        change,
        specs: new Map(),
        paths: {
          specs: join(root, "specs"),
          docs: join(root, "docs"),
          archive: join(root, "archive"),
        },
      });
      const raw = await readFile(
        join(result.archivePath, TERMINAL_SUMMARY_FILE),
        "utf-8",
      );
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.endsWith("\n\n")).toBe(false);
    });

    test("sibling files with generated names do not overwrite generated bundle files", async () => {
      const root = await tempProject();
      const archiveDir = join(root, "archive");
      const sourceChangeDir = join(
        root,
        "changes",
        "terminal-summary-preserve",
      );
      await mkdir(sourceChangeDir, { recursive: true });
      const bogus = "this should not overwrite generated files";
      await writeFile(
        join(sourceChangeDir, "change.json"),
        JSON.stringify({ bogus }),
      );
      await writeFile(
        join(sourceChangeDir, TERMINAL_SUMMARY_FILE),
        JSON.stringify({ bogus }),
      );
      await writeFile(join(sourceChangeDir, "ARCHIVE_SUMMARY.md"), bogus);
      await writeFile(join(sourceChangeDir, "BRIEFING_DIGEST.md"), bogus);
      await writeFile(join(sourceChangeDir, "CONTRACT_TRACEABILITY.md"), bogus);
      await writeFile(
        join(sourceChangeDir, "wisdom.json"),
        JSON.stringify({ bogus }),
      );
      await writeFile(
        join(sourceChangeDir, "multi-repo-archive.json"),
        JSON.stringify({ bogus }),
      );

      const archivePath = await createInRepoArchive(
        changeWithContract({
          id: "terminal-summary-preserve",
          contract: undefined,
        }),
        archiveDir,
        sourceChangeDir,
        undefined,
        createdAt,
      );

      const changeJson = JSON.parse(
        await readFile(join(archivePath, "change.json"), "utf-8"),
      );
      expect(changeJson.status).toBe("archived");
      expect(changeJson.bogus).toBeUndefined();

      const summary = validateTerminalArchiveSummary(
        JSON.parse(
          await readFile(join(archivePath, TERMINAL_SUMMARY_FILE), "utf-8"),
        ),
      );
      expect(summary.version).toBe("1");
      expect(summary.change_id).toBe("terminal-summary-preserve");

      const archiveSummary = await readFile(
        join(archivePath, "ARCHIVE_SUMMARY.md"),
        "utf-8",
      );
      expect(archiveSummary).toContain("Archive:");
      expect(archiveSummary).not.toContain(bogus);

      const digest = await readFile(
        join(archivePath, "BRIEFING_DIGEST.md"),
        "utf-8",
      );
      expect(digest).toContain("Archive Briefing Digest");
      expect(digest).not.toContain(bogus);

      expect(existsSync(join(archivePath, "wisdom.json"))).toBe(false);
      expect(existsSync(join(archivePath, "multi-repo-archive.json"))).toBe(
        false,
      );
    });
  });
});
