/**
 * Asset tests for ops-follow-up traceability spec law.
 *
 * Verifies that the rq-opsFollow* requirements exist in the canonical spec
 * files with the expected scenario coverage. These IDs are also external
 * citations for the spec-citation-invariant test.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

interface SpecJson {
  name: string;
  version: string;
  requirements: Array<{
    id: string;
    title: string;
    body: string;
    priority: string;
    tags: string[];
    scenarios?: Array<{ id: string; title: string }>;
  }>;
}

function loadSpec(capability: string): SpecJson {
  const path = join(REPO_ROOT, ".adv/specs", capability, "spec.json");
  return JSON.parse(readFileSync(path, "utf8")) as SpecJson;
}

function findReq(spec: SpecJson, id: string) {
  return spec.requirements.find((r) => r.id === id);
}

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function expectVersionAtLeast(actual: string, minimum: string): void {
  const parse = (v: string) => v.split(".").map((n) => Number(n));
  const a = parse(actual);
  const b = parse(minimum);
  const aNum = (a[0] ?? 0) * 1_000_000 + (a[1] ?? 0) * 1_000 + (a[2] ?? 0);
  const bNum = (b[0] ?? 0) * 1_000_000 + (b[1] ?? 0) * 1_000 + (b[2] ?? 0);
  expect(
    aNum,
    `expected ${actual} to be at least ${minimum}`,
  ).toBeGreaterThanOrEqual(bNum);
}

describe("ops-follow-up traceability spec law", () => {
  test("rq-opsFollowTrace01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsFollowTrace01");
    expect(req, "rq-opsFollowTrace01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.tags).toContain("ops-follow-up");
    expect(req!.scenarios).toHaveLength(3);
    expect(req!.scenarios!.map((s) => s.id)).toEqual([
      "rq-opsFollowTrace01.1",
      "rq-opsFollowTrace01.2",
      "rq-opsFollowTrace01.3",
    ]);
  });

  test("rq-opsFollowEvidence01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsFollowEvidence01");
    expect(req, "rq-opsFollowEvidence01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/not_started/);
    expect(req!.body).toMatch(/complete/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsFollowRelease01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsFollowRelease01");
    expect(req, "rq-opsFollowRelease01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/blocks/);
    expect(req!.body).toMatch(/follows_release/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsRunbook01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsRunbook01");
    expect(req, "rq-opsRunbook01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.tags).toContain("ops-runbook");
    expect(req!.body).toMatch(/runbook-shaped state/);
    expect(req!.body).toMatch(/chat history/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsRunApproval01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsRunApproval01");
    expect(req, "rq-opsRunApproval01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(
      /Unclassified production-impacting execution defaults to approval-required/,
    );
    expect(req!.body).toMatch(/bounded low-risk autonomous/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsRunEvidence01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsRunEvidence01");
    expect(req, "rq-opsRunEvidence01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/append-only/);
    expect(req!.body).toMatch(/secret-safe/);
    expect(req!.body).toMatch(/health verification/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsRunReleaseReadiness01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsRunReleaseReadiness01");
    expect(req, "rq-opsRunReleaseReadiness01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/fresh verified reconciliation proof/);
    expect(req!.body).toMatch(/stale parent ops_followup_link status alone/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsFollowPromotion01 exists in subagent-reports with 3 scenarios", () => {
    const spec = loadSpec("subagent-reports");
    const req = findReq(spec, "rq-opsFollowPromotion01");
    expect(req, "rq-opsFollowPromotion01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/required_follow_ups/);
    expect(req!.body).toMatch(/source_contract_id/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsFollowWip01 exists in backlog-coordination with 3 scenarios", () => {
    const spec = loadSpec("backlog-coordination");
    const req = findReq(spec, "rq-opsFollowWip01");
    expect(req, "rq-opsFollowWip01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/adv_wip_state/);
    expect(req!.body).toMatch(/ops_followup_links/);
    expect(req!.scenarios).toHaveLength(3);
  });
});

describe("ops-follow-up spec versions bumped", () => {
  test("advance-workflow version is at least 1.22.0", () => {
    const spec = loadSpec("advance-workflow");
    expectVersionAtLeast(spec.version, "1.22.0");
  });

  test("subagent-reports version is at least 1.8.0", () => {
    const spec = loadSpec("subagent-reports");
    expectVersionAtLeast(spec.version, "1.8.0");
  });

  test("backlog-coordination version is at least 1.5.0", () => {
    const spec = loadSpec("backlog-coordination");
    expectVersionAtLeast(spec.version, "1.5.0");
  });
});

describe("ops runbook command contracts", () => {
  test("prep/apply/review/harden/archive document ops runbook authority", () => {
    const prep = readRepoFile(".opencode/command/adv-prep.md");
    const apply = readRepoFile(".opencode/command/adv-apply.md");
    const review = readRepoFile(".opencode/command/adv-review.md");
    const harden = readRepoFile(".opencode/command/adv-harden.md");
    const archive = readRepoFile(".opencode/command/adv-archive.md");

    expect(prep).toMatch(/ops runbook/i);
    expect(prep).toContain("adv_ops_run_upsert");
    expect(apply).toContain("adv_ops_run_upsert");
    expect(apply).toContain("adv_ops_run_evidence_add");
    expect(apply).toContain("bounded_low_risk_autonomous");
    expect(apply).toContain("approval_required");
    expect(review).toContain("status_source");
    expect(review).toContain("completion_proof");
    expect(harden).toContain("completion signal");
    expect(harden).toContain("health verification");
    expect(harden).toContain("rollback/cleanup disposition");
    expect(archive).toContain("getOpenOpsFollowupObligations");
    expect(archive).toContain("unreachable child");
  });
});
