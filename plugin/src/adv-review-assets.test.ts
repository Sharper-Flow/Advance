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

  test("review scanner context packet surfaces task evidence plan", () => {
    expect(command).toContain("evidence_plan");
    expect(command).toContain("proof_target");
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
    expect(command).toContain(
      "For each non-code task, create or verify `contract.reviewMatrix` rows",
    );
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
});

describe("adv-review touched-scope bad-test cleanup", () => {
  const command = readFileSync(REVIEW_PATH, "utf8");

  test("declares a touched-scope bad-test cleanup dimension", () => {
    expect(command).toContain("Touched-Scope Bad-Test Cleanup");
    expect(command).toContain("flaky");
    expect(command).toContain("tautological");
    expect(command).toContain("implementation-coupled");
  });

  test("limits cleanup to safe and local touched scope", () => {
    expect(command).toMatch(/safe and local/i);
    expect(command).toMatch(/broader cleanup.*out of scope/is);
  });
});

// AC1: the 12-dimension framework is defined exactly once (embedded
// methodology) and later usage is a same-file reference that preserves the
// mandatory scanner behavior. Reintroducing a second full matrix, dropping the
// OWASP top 10 security scope, or weakening the reference must fail here.
describe("adv-review 12-dimension framework single-source (AC1)", () => {
  const command = readFileSync(REVIEW_PATH, "utf8");

  test("exactly one full 12-dimension matrix is defined", () => {
    expect(command.match(/^\| 1 \| Design \|/gm) ?? []).toHaveLength(1);
    expect(command.match(/^\| 12 \| Consistency \|/gm) ?? []).toHaveLength(1);
    expect(command.match(/^\| 9 \| Security \|/gm) ?? []).toHaveLength(1);
  });

  test("canonical matrix retains OWASP top 10 security scope", () => {
    expect(command).toContain(
      "| 9 | Security | Auth, validation, secrets, OWASP top 10 |",
    );
  });

  test("later framework section is a same-file reference preserving mandatory behavior", () => {
    const methodologyIdx = command.indexOf("### Review Methodology");
    const frameworkIdx = command.indexOf("## 12-Dimension Review Framework");
    expect(methodologyIdx).toBeGreaterThan(-1);
    expect(frameworkIdx).toBeGreaterThan(methodologyIdx);

    const section = command.slice(frameworkIdx, frameworkIdx + 800);
    expect(section).not.toMatch(/^\| 1 \| Design \|/m);
    expect(section).toMatch(/embedded methodology/i);
    expect(section).toMatch(/all 12 dimensions/i);
    expect(section).toMatch(/explicit justification/i);
  });
});

// NON-BEHAVIORAL (asset presence only): these tests assert that the command
// markdown points operators at the STRUCTURAL enforcement rail. They prove the
// guidance text exists — NOT that enforcement works. The behavioral guarantees
// (concerns block acceptance/release; dispositions clear them; advisory consumer
// warnings) are covered by gate-readiness.test.ts (checkUnresolvedDesignConcerns),
// subagent-report.test.ts (consumeDesignerDesignConcerns), and
// design-concern.test.ts (adv_design_concern_disposition). See AC11 / DONT8.
describe("adv-review designer-concern prose points at the structural rail (non-behavioral)", () => {
  const command = readFileSync(REVIEW_PATH, "utf8");

  test("prose references the structural evaluator, not reviewer goodwill", () => {
    expect(command).toContain("Designer Concern Enforcement");
    expect(command).toContain("checkUnresolvedDesignConcerns");
    expect(command).toContain("DESIGN_CONCERN_UNRESOLVED");
    expect(command).toContain("adv_design_concern_disposition");
    expect(command).toMatch(/STRUCTURAL, not reviewer-prose/i);
  });

  test("prose preserves design-proof vocabulary and advisory-only consumer warning framing", () => {
    expect(command).toContain("design_dimensions");
    expect(command).toContain("neighboring_recommendation");
    expect(command).toContain("design_proof");
    expect(command).toContain("rubric_review");
    expect(command).toMatch(/Advisory only/i);
    expect(command).toMatch(/no debt-acceptance disposition/i);
  });
});
