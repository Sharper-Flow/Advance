import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");
const INSTRUCTIONS = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

function readAsset(path: string): string {
  return readFileSync(path, "utf8");
}

// =============================================================================
// 1. Human Checkpoint & Auto-Continue Policy
// =============================================================================

describe("Human checkpoint and auto-continue policy", () => {
  test("ADV_INSTRUCTIONS.md contains Human Checkpoints section", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toContain("### Human Checkpoints (Pause Required)");
  });

  test("ADV_INSTRUCTIONS.md lists required human checkpoints", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/Proposal confirmation/);
    expect(content).toMatch(/Agreement sign-off/);
    expect(content).toMatch(/Design approval/);
    expect(content).toMatch(/Acceptance/);
    expect(content).toMatch(/Archive sign-off/);
    expect(content).toMatch(/Cancellation approval/);
    expect(content).toMatch(/Re-entry approval/);
    expect(content).toMatch(/Doom-loop recovery/);
  });

  test("ADV_INSTRUCTIONS.md contains Clean Auto-Continue Rule", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toContain("### Clean Auto-Continue Rule");
    expect(content).toMatch(/proceed sequentially without prompting the user/);
  });

  test("adv.md orchestrator names pause vs auto-continue", () => {
    const content = readAsset(join(AGENT_DIR, "adv.md"));
    expect(content).toContain("Human Checkpoints vs Auto-Continue");
    expect(content).toMatch(/Proposal confirmation/);
    expect(content).toMatch(/Agreement sign-off/);
    expect(content).toMatch(/Clean auto-continue/);
  });
});

// =============================================================================
// 2. Validated In-Scope Remediation Policy
// =============================================================================

describe("Validated in-scope remediation policy", () => {
  test("ADV_INSTRUCTIONS.md contains remediation policy", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toContain("### Validated In-Scope Remediation Policy");
    expect(content).toMatch(/No report-only/);
    expect(content).toMatch(/future-work/);
  });

  test("adv-harden.md does NOT offer Report only for in-scope findings", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-harden.md"));
    // The old wording "Report only" should no longer appear as an option
    expect(content).not.toMatch(/Report only/);
  });

  test("adv-harden.md does NOT allow accepted debt for validated in-scope findings", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-harden.md"));
    expect(content).not.toMatch(/documented as accepted debt/i);
    expect(content).not.toMatch(/accepted debt:/i);
    expect(content).not.toMatch(/fix or document as accepted debt/i);
    expect(content).toMatch(
      /No report-only, future-work, or accepted-debt path/i,
    );
  });

  test("adv-harden.md requires fixing validated in-scope findings", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-harden.md"));
    expect(content).toMatch(/fix all validated in-scope findings/i);
  });

  test("adv-review.md forbids future-work deferral for validated findings", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-review.md"));
    expect(content).toMatch(/no future-work deferral/i);
  });

  test("adv-review.md requires implementing validated in-scope suggestions", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-review.md"));
    expect(content).toMatch(/validated in-scope/i);
  });

  test("adv-review.md REVIEW_FINDINGS template does not use accepted_debt", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-review.md"));
    expect(content).not.toMatch(/accepted_debt/);
    expect(content).toMatch(/rejected_with_evidence/);
  });
});

// =============================================================================
// 3. Touched-Scope Quality Ownership
// =============================================================================

describe("Touched-scope quality ownership", () => {
  test("ADV_INSTRUCTIONS.md contains touched-scope ownership section", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toContain("### Touched-Scope Quality Ownership");
    expect(content).toMatch(/Directly touched implementation files/);
    expect(content).toMatch(/Adjacent tests and docs/);
    expect(content).toMatch(/Same-pattern local subsystem issues/);
  });

  test("adv-prep.md requires touched-scope tasks", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-prep.md"));
    expect(content).toContain("Touched-Scope Quality Ownership");
    expect(content).toMatch(/Adjacent tests and docs/);
    expect(content).toMatch(/Same-pattern local subsystem issues/);
  });

  test("adv-apply.md verifies touched-scope obligations", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-apply.md"));
    expect(content).toMatch(/touched-scope/i);
  });

  test("ownership boundary prevents repo-wide expansion", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/Do NOT expand into implicit repo-wide refactors/);
  });
});

// =============================================================================
// 4. Design Validation Policy
// =============================================================================

describe("Design validation policy", () => {
  test("adv-design.md contains a validation phase referencing adv-researcher", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toMatch(/adv-researcher/i);
    expect(content).toMatch(/[Vv]alid/);
  });

  test("adv-design.md contains verdict handling for VALIDATED, CAUTION, CONFLICT, INCONCLUSIVE", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toContain("VALIDATED");
    expect(content).toContain("CAUTION");
    expect(content).toContain("CONFLICT");
    expect(content).toContain("INCONCLUSIVE");
    expect(content).toMatch(/adv_change_update/);
  });

  test("adv-present.md contains validator result display section", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-present.md"));
    expect(content).toMatch(/[Vv]alidator/);
    expect(content).toMatch(
      /VALIDATED|clean pass|CAUTION|CONFLICT|INCONCLUSIVE/,
    );
    expect(content).toMatch(/No validation data.*omit section silently/);
    expect(content).toMatch(/CONFLICT.*pause/i);
  });

  test("ADV_INSTRUCTIONS.md references design validation in sub-agent orchestration", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/design.*validator|validator.*design/i);
  });

  test("adv-design.md does NOT contain passive inform-user manual validation guidance", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).not.toMatch(/inform the user.*additional frontier model/i);
    expect(content).not.toMatch(/have an additional frontier model/i);
  });
});
