/**
 * adv-prep command asset tests — non-code evidence policy surface.
 *
 * Verifies that `.opencode/command/adv-prep.md` instructs the orchestrator to
 * produce/check non-code evidence policies explicitly (AC6, SC3).
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const PREP_PATH = join(REPO_ROOT, ".opencode/command/adv-prep.md");

describe("adv-prep non-code evidence policy surface", () => {
  const command = readFileSync(PREP_PATH, "utf8");

  test("declares a non-code deliverable evidence policy section", () => {
    expect(command).toContain("Non-Code Deliverable Evidence Policy");
    expect(command).toContain("rq-prepNonCodeEvidence01");
  });

  test("requires evidence_policy on non-code tasks", () => {
    expect(command).toContain("evidence_policy");
    expect(command).toMatch(
      /Non-code tasks MUST NOT be forced through fake red\/green TDD/,
    );
  });

  test("lists at least the five SC3 non-code evidence modes", () => {
    for (const policy of [
      "source_citation",
      "source_audit",
      "rubric_review",
      "stakeholder_acceptance",
      "artifact_reference",
    ]) {
      expect(command).toContain(policy);
    }
  });

  test("requires bounded rationale for not_applicable evidence policy", () => {
    expect(command).toMatch(
      /evidence_policy:\s*not_applicable[\s\S]{0,200}contract_refs\.not_applicable_reason/,
    );
  });

  test("TDD ordering table includes evidence policy column", () => {
    const idx = command.indexOf("#### B. TDD Ordering");
    expect(idx).toBeGreaterThan(-1);
    const section = command.slice(idx, idx + 1200);
    expect(section).toContain("Evidence policy");
    expect(section).toContain("source_citation");
    expect(section).toContain("not_applicable");
  });

  test("non-code tasks require contract refs or bounded not_applicable_reason", () => {
    expect(command).toMatch(
      /Every non-code task MUST have `contract_refs` \(`implements`\/`verifies`\/`respects`\) or a bounded `not_applicable_reason`/,
    );
  });
});
