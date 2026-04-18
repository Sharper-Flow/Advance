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
  test("adv-design.md contains a validation phase referencing adv-researcher with capability framing", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toMatch(/adv-researcher/i);
    expect(content).toMatch(/[Vv]alid/);
    // Capability-based framing: references independent validator capability, not just name
    expect(content).toMatch(/independent.*valid|valid.*independent/i);
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

// =============================================================================
// 5. Investment Check-In Policy (addCostTimeInvestment)
// =============================================================================

const COST_GOV = join(REPO_ROOT, ".opencode/instructions/cost-governance.md");
const COST_GOV_SKILL = join(
  REPO_ROOT,
  "skills/adv-cost-governance-methodology/SKILL.md",
);
const PLUGIN_INDEX = join(REPO_ROOT, "plugin/src/index.ts");
const SETUP = join(REPO_ROOT, "SETUP.md");

describe("Investment Check-In Policy (addCostTimeInvestment)", () => {
  test("cost-governance.md instruction file exists", () => {
    const content = readAsset(COST_GOV);
    expect(content).toBeTruthy();
  });

  test("cost-governance.md YAML frontmatter contains threshold keys with conservative defaults", () => {
    const content = readAsset(COST_GOV);
    // YAML frontmatter present
    expect(content).toMatch(/^---\s*$/m);
    // Threshold tiers
    expect(content).toMatch(/thresholds:/);
    expect(content).toMatch(/auto:\s*$/m);
    expect(content).toMatch(/escalate:\s*$/m);
    expect(content).toMatch(/hardstop:\s*$/m);
    // Conservative defaults (agreement user decision #1)
    expect(content).toMatch(/tasks:\s*3/);
    expect(content).toMatch(/tasks:\s*8/);
    expect(content).toMatch(/tasks:\s*15/);
    expect(content).toMatch(/elapsed_minutes:\s*15/);
    expect(content).toMatch(/elapsed_minutes:\s*60/);
    expect(content).toMatch(/elapsed_minutes:\s*180/);
  });

  test("cost-governance.md references the methodology skill", () => {
    const content = readAsset(COST_GOV);
    expect(content).toMatch(/skills\/adv-cost-governance-methodology/);
  });

  test("cost-governance.md scope is ADV-only", () => {
    const content = readAsset(COST_GOV);
    expect(content).toMatch(/scope:\s*adv_only/);
  });

  test("methodology skill file exists with three in-scope categories", () => {
    const content = readAsset(COST_GOV_SKILL);
    expect(content).toBeTruthy();
    expect(content).toMatch(/non_functional_tradeoff/);
    expect(content).toMatch(/extensibility/);
    expect(content).toMatch(/scope_boundary/);
  });

  test("methodology skill documents out-of-scope categories", () => {
    const content = readAsset(COST_GOV_SKILL);
    // Out-of-scope categories (decision-fatigue avoidance)
    expect(content).toMatch(/defaults/);
    expect(content).toMatch(/naming/);
    expect(content).toMatch(/error_semantics/);
  });

  test("methodology skill documents Phase J identification + Phase 1.5 surfacing protocols", () => {
    const content = readAsset(COST_GOV_SKILL);
    expect(content).toMatch(/Phase J/);
    expect(content).toMatch(/Identification Protocol/);
    expect(content).toMatch(/Phase 1\.5/);
    expect(content).toMatch(/Surfacing Protocol/);
  });

  test("methodology skill contains rq-autonomy01 escape-clause citation", () => {
    const content = readAsset(COST_GOV_SKILL);
    expect(content).toMatch(/rq-autonomy01/);
    expect(content).toMatch(/escape.clause|escape clause/i);
    expect(content).toMatch(/unresolved user-value tradeoff/i);
  });

  test("methodology skill documents hard-stop advisory semantics", () => {
    const content = readAsset(COST_GOV_SKILL);
    // Hard-stop is advisory in v1 — does NOT trigger adv_change_reenter
    expect(content).toMatch(/hard.stop/i);
    expect(content).toMatch(/advisory/i);
    expect(content).toMatch(
      /does NOT.*adv_change_reenter|NOT.*trigger.*reenter/i,
    );
    expect(content).toMatch(/rq-scopeReentry01/);
  });

  test("methodology skill documents doom-loop supersede rule", () => {
    const content = readAsset(COST_GOV_SKILL);
    expect(content).toMatch(/[Dd]oom.loop/);
    expect(content).toMatch(/supersede/i);
  });

  test("ADV_INSTRUCTIONS.md contains Investment Check-In subsection", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/### Investment Check-In/);
  });

  test("ADV_INSTRUCTIONS.md contains rq-autonomy01 escape-clause citation", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/rq-autonomy01/);
    expect(content).toMatch(/escape.clause|escape clause/i);
    expect(content).toMatch(/unresolved user-value tradeoff/i);
  });

  test("ADV_INSTRUCTIONS.md contains hard-stop advisory language", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/[Hh]ard.stop/);
    expect(content).toMatch(/advisory/);
    expect(content).toMatch(
      /does NOT.*adv_change_reenter|NOT.*trigger.*reenter/i,
    );
  });

  test("ADV_INSTRUCTIONS.md contains doom-loop supersede rule", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/[Dd]oom.loop supersede|supersede.*doom.loop/i);
  });

  test("adv-prep.md contains Phase J / Identify Judgment Calls", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-prep.md"));
    expect(content).toMatch(/Phase J/);
    expect(content).toMatch(/Identify Judgment Calls/);
    // Should reference the skill
    expect(content).toMatch(/adv-cost-governance-methodology/);
  });

  test("adv-apply.md contains Phase 1.5 Investment Check-In Preamble", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-apply.md"));
    expect(content).toMatch(/Phase 1\.5/);
    expect(content).toMatch(/Investment Check-In Preamble/);
    // Should reference the skill
    expect(content).toMatch(/adv-cost-governance-methodology/);
    // Composition: doom-loop supersedes + hard-stop advisory
    expect(content).toMatch(/[Dd]oom.loop/);
    expect(content).toMatch(/[Hh]ard.stop/);
  });

  test("adv-agree.md, adv-accept.md, adv-archive.md reference adv_investment_report for display", () => {
    for (const file of ["adv-agree.md", "adv-accept.md", "adv-archive.md"]) {
      const content = readAsset(join(COMMAND_DIR, file));
      expect(content).toMatch(/adv_investment_report/);
    }
  });

  test("SETUP.md documents P28 rule and cost-governance file", () => {
    const content = readAsset(SETUP);
    expect(content).toMatch(/P28/);
    expect(content).toMatch(/cost-governance/);
    expect(content).toMatch(/name:\s*cost-governance/);
    expect(content).toMatch(/hint:\s*cost_aware/);
    expect(content).toMatch(/priority:\s*9/);
  });

  test("Negative AC #11: no dynamic INVESTMENT_CHECKIN marker injection in plugin/src/index.ts", () => {
    // AC #11: dynamic injection via experimental.chat.system.transform must be
    // append-only — specifically, no new INVESTMENT_CHECKIN or cost-governance
    // marker tokens added (cache preserved by construction in v1).
    const content = readAsset(PLUGIN_INDEX);
    expect(content).not.toMatch(/INVESTMENT_CHECKIN/);
    expect(content).not.toMatch(/\[ADV:INVESTMENT/);
    // Sanity: existing append-only markers still present
    expect(content).toMatch(
      /RECORD_WISDOM|ACCUMULATED_WISDOM|TODO_CONTINUATION/,
    );
  });
});
