import { existsSync } from "fs";
import { execSync } from "child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, test } from "vitest";
import type { Change } from "../types";
import {
  archiveChange,
  generateContractTraceability,
  getArchiveContractProofErrors,
  reconcileInRepoArchive,
} from "./archive";

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

  test("archiveChange reconciles missing in-repo archive when external bundle already exists", async () => {
    const root = await tempProject();
    const change = changeWithContract();
    const archiveDir = join(root, "external-archive");
    const inRepoArchiveDir = join(root, "repo", ".adv", "archive");
    const today = new Date().toISOString().split("T")[0];
    const externalBundle = join(archiveDir, `${today}-${change.id}`);

    await mkdir(externalBundle, { recursive: true });
    await writeFile(
      join(externalBundle, "change.json"),
      JSON.stringify({ ...change, status: "archived" }, null, 2),
    );

    await reconcileInRepoArchive(change, inRepoArchiveDir);

    const inRepoChange = await readFile(
      join(inRepoArchiveDir, `${today}-${change.id}`, "change.json"),
      "utf8",
    );
    expect(JSON.parse(inRepoChange).status).toBe("archived");
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
          repo_project_id: "w".repeat(40),
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
});
