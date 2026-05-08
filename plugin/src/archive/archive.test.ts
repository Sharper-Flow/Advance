import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, test } from "vitest";
import type { Change } from "../types";
import {
  archiveChange,
  generateContractTraceability,
  getArchiveContractProofErrors,
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
});
