import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC_JSON = join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json");
const SPEC_DOC = join(REPO_ROOT, "docs/specs/advance-workflow.md");
const ADV_INSTRUCTIONS = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");
const CHANGE_TS = join(REPO_ROOT, "plugin/src/tools/change.ts");
const ADV_WORKTREE_TS = join(REPO_ROOT, "plugin/src/tools/adv-worktree.ts");
const STATUS_HYGIENE_TS = join(REPO_ROOT, "plugin/src/tools/status-hygiene.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function requirement(id: string): {
  id: string;
  body: string;
  scenarios: Array<{ id: string; when: string; then: string[] }>;
} {
  const spec = JSON.parse(read(SPEC_JSON));
  const req = spec.requirements.find((r: { id: string }) => r.id === id);
  expect(req, `${id} must exist`).toBeTruthy();
  return req;
}

describe("archive branch-cleanup surface assets", () => {
  test("rq-archiveBranchCleanup01 routes merged-branch cleanup through adv_worktree_cleanup archived_branches mode", () => {
    const req = requirement("rq-archiveBranchCleanup01");

    expect(req.body).toContain("adv_worktree_cleanup");
    expect(req.body).toContain("archived_branches");
    expect(req.body).toMatch(/operator-explicit/i);
    expect(req.body).not.toContain("cleanup_merged");
    for (const scenario of req.scenarios) {
      expect(scenario.when, `${scenario.id} when`).not.toContain(
        "cleanup_merged",
      );
    }
    const doc = read(SPEC_DOC);
    expect(doc).toContain("adv_worktree_cleanup");
    expect(doc).toContain("archived_branches");
  });

  test("no active spec, doc, or instruction asset prescribes adv_archive_repair cleanup_merged", () => {
    for (const content of [
      read(SPEC_JSON),
      read(SPEC_DOC),
      read(ADV_INSTRUCTIONS),
    ]) {
      expect(content).not.toContain("cleanup_merged");
    }
  });

  test("operator guidance distinguishes batch reconcile from single-change status repair", () => {
    const req = requirement("rq-archiveRecoveryConsistency01");

    expect(req.body).toContain("adv_archive_repair");
    expect(req.body).toContain("reconcile");
    expect(req.body).toMatch(/branch-merge evidence/i);
    expect(req.body).toContain("adv_change_status_repair");
    expect(req.body).toMatch(/single-change/i);
    expect(req.body).toContain("target_path");

    const doc = read(SPEC_DOC);
    expect(doc).toMatch(/branch-merge evidence/i);
    expect(doc).toContain("adv_change_status_repair");

    const instructions = read(ADV_INSTRUCTIONS);
    expect(instructions).toContain("archived_branches");
    expect(instructions).toContain("adv_change_status_repair");
  });

  test("runtime surface: archive_repair drops cleanup_merged; worktree cleanup exposes archived_branches", () => {
    const changeSource = read(CHANGE_TS);
    expect(changeSource).not.toContain("cleanup_merged");

    const worktreeSource = read(ADV_WORKTREE_TS);
    expect(worktreeSource).toContain("archived_branches");

    const hygieneSource = read(STATUS_HYGIENE_TS);
    expect(hygieneSource).toContain("adv_worktree_cleanup");
    expect(hygieneSource).toContain("archived_branches");
    expect(hygieneSource).not.toContain("cleanup_merged");
  });
});
