/**
 * adv-review command asset tests — non-code evidence policy surface.
 *
 * Verifies that `.opencode/command/adv-review.md` instructs the orchestrator to
 * evaluate non-code deliverables against contract rows and evidence policies,
 * including pass/fail status for each applicable AC/SC (AC7, SC3).
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const REVIEW_PATH = join(REPO_ROOT, ".opencode/command/adv-review.md");

describe("adv-review non-code evidence policy surface", () => {
  const command = readFileSync(REVIEW_PATH, "utf8");

  test("review scanner context packet surfaces task type and evidence policy", () => {
    const idx = command.indexOf("TASK EVIDENCE SUMMARY:");
    expect(idx).toBeGreaterThan(-1);
    const lineEnd = command.indexOf("\n", idx);
    const nextLineEnd = command.indexOf("\n", lineEnd + 1);
    const block = command.slice(idx, nextLineEnd);
    expect(block).toContain("type: {type}");
    expect(block).toContain("evidence_policy: {evidence_policy}");
  });

  test("declares a non-code deliverables / evidence policy dimension", () => {
    expect(command).toContain("Non-Code Deliverables / Evidence Policy");
  });

  test("review-owned dimensions include non-code evidence policy", () => {
    expect(command).toMatch(
      /review-owned dimensions:[\s\S]*non-code deliverable evidence policy/,
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

  test("requires source-quality/audit notes for citations", () => {
    expect(command).toMatch(
      /source_citation[\s\S]{0,200}source-quality\/audit notes where credibility matters/,
    );
    expect(command).toMatch(/Do not accept bare citation lists/);
  });

  test("contract review matrix evaluates non-code evidence policies", () => {
    expect(command).toContain("Non-Code Evidence Policy in the Review Matrix");
    expect(command).toContain("rq-subagentNonCodeEvidence01");
  });

  test("requires pass/fail status per applicable AC/SC", () => {
    expect(command).toMatch(
      /Each applicable `AC\*`\/`SC\*` row must have `pass` or `fail` status/,
    );
  });

  test("failing or missing non-code evidence blocks acceptance", () => {
    expect(command).toMatch(
      /Failing, `unknown`, or missing evidence blocks acceptance/,
    );
  });

  test("designer report evidence is consumed into design-quality review proof", () => {
    expect(command).toContain("Designer Report Evidence");
    expect(command).toContain("adv-designer");
    expect(command).toContain("design_dimensions");
    expect(command).toContain("neighboring_recommendations");
    expect(command).toContain("required_main_agent_actions");
    expect(command).toContain("design_proof");
    expect(command).toContain("rubric_review");
    expect(command).toMatch(
      /unresolved owned-scope design concerns block acceptance/i,
    );
  });

  test("designer neighboring recommendations require explicit disposition", () => {
    expect(command).toMatch(/include-now/i);
    expect(command).toMatch(/split\/fast-follow/i);
    expect(command).toMatch(/rejected_with_evidence/);
    expect(command).toMatch(/not silently dropped/i);
  });
});
