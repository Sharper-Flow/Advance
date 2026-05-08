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
  // Heuristic-drift heading assertions removed per T1.5 audit
  // (`adv-autonomy-quality-assets.test.ts` H-class). Canonical-list V
  // assertions retained below.

  test("ADV_INSTRUCTIONS.md lists required human checkpoints", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/Proposal confirmation/);
    expect(content).toMatch(/Agreement sign-off/);
    expect(content).toMatch(/Design approval/);
    expect(content).toMatch(/Acceptance/);
    expect(content).toMatch(/Archive sign-off/);
    expect(content).toMatch(/Cancellation approval/);
    expect(content).toMatch(/Doom-loop recovery/);
  });

  test("ADV_INSTRUCTIONS.md preserves auto-continue anti-pattern", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/No "shall I proceed\?"/);
  });

  test("adv.md orchestrator names checkpoint canonical list", () => {
    const content = readAsset(join(AGENT_DIR, "adv.md"));
    expect(content).toMatch(/Proposal confirmation/);
    expect(content).toMatch(/Agreement sign-off/);
    expect(content).toMatch(/Cancellation approval/);
    expect(content).toMatch(/Doom-loop recovery/);
    expect(content).toMatch(/Post-approval auto-continue/);
  });
});

// =============================================================================
// 2. Validated In-Scope Remediation Policy
// =============================================================================

describe("Validated in-scope remediation policy", () => {
  // Heuristic-drift heading and topic-presence assertions removed per
  // T1.5 audit. Anti-pattern × assertions and canonical-policy V
  // assertions retained.

  test("ADV_INSTRUCTIONS.md preserves remediation anti-patterns", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/No report-only/);
    expect(content).toMatch(/future-work/);
  });

  test("adv-harden.md forbids Report only / accepted-debt anti-patterns", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-harden.md"));
    expect(content).not.toMatch(/Report only/);
    expect(content).not.toMatch(/documented as accepted debt/i);
    expect(content).not.toMatch(/accepted debt:/i);
    expect(content).not.toMatch(/fix or document as accepted debt/i);
    expect(content).toMatch(
      /No report-only, future-work, or accepted-debt path/i,
    );
    expect(content).toMatch(/fix all validated in-scope findings/i);
  });

  test("adv-review.md forbids future-work deferral and accepted_debt", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-review.md"));
    expect(content).toMatch(/no future-work deferral/i);
    expect(content).not.toMatch(/accepted_debt/);
    expect(content).toMatch(/rejected_with_evidence/);
  });
});

// =============================================================================
// 3. Touched-Scope Quality Ownership
// =============================================================================

describe("Touched-scope quality ownership", () => {
  // Heuristic-drift heading exact-match assertions removed per T1.5 audit.
  // Canonical-list V phrases (3 scope categories) and anti-pattern × phrases
  // for ralph-loop restoration retained.

  test("ADV_INSTRUCTIONS.md preserves 3 touched-scope categories", () => {
    const content = readAsset(INSTRUCTIONS);
    expect(content).toMatch(/Directly touched implementation files/);
    expect(content).toMatch(/Adjacent tests and docs/);
    expect(content).toMatch(/Same-pattern local subsystem issues/);
    expect(content).toMatch(/Do NOT expand into implicit repo-wide refactors/);
  });

  test("adv-prep.md preserves touched-scope categories", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-prep.md"));
    expect(content).toMatch(/Adjacent tests and docs/);
    expect(content).toMatch(/Same-pattern local subsystem issues/);
  });

  test("adv-apply.md ralph-loop restoration anti-patterns + MUST-continue (rq-autonomy01.4)", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-apply.md"));
    expect(content).not.toMatch(/Shall I continue/i);
    expect(content).not.toMatch(/Task \d+ of \d+ complete[^\n]*continue/i);
    expect(content).toMatch(/MUST continue|MUST NOT pause/);
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

  test("adv-design.md contains validator result display section after absorb", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toMatch(/[Vv]alidator/);
    expect(content).toMatch(
      /VALIDATED|clean pass|CAUTION|CONFLICT|INCONCLUSIVE/,
    );
    expect(content).toMatch(/No validation data.*omit section silently/);
    expect(content).toMatch(/CONFLICT.*pause/i);
    expect(content).toMatch(/contract[- ]compromise risk/i);
    expect(content).toMatch(
      /keep.*compromise|revise.*design|revisit.*agreement|defer/i,
    );
  });

  test("adv-design.md contains contract-compromise risk assessment with trigger scope", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-design.md"));
    expect(content).toMatch(/Phase 4\.1|contract-compromise risk assessment/i);
    expect(content).toMatch(
      /acceptance criteria.*explicit constraints.*stated avoidances|written agreement/i,
    );
    expect(content).toMatch(/agreement\.md.*amend|amend.*agreement/i);
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
// 5. Archive and spec assets
// =============================================================================

describe("Archive and spec assets", () => {
  const ADVANCE_WORKFLOW_SPEC = join(
    REPO_ROOT,
    ".adv/specs/advance-workflow/spec.json",
  );

  test("adv-archive.md refreshes basis before choosing local or PR archive path", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    expect(content).toMatch(/Refresh Merge Basis/i);
    expect(content).toMatch(/git -C "\$MAIN" fetch origin \{default-branch\}/);
    expect(content).toMatch(
      /git -C "\$MAIN" merge --ff-only change\/\{change-id\}/,
    );
    // Post-T28e (J3 expansion): the reconcile path rebases the change branch
    // and Step 4 handles conflicts via the full classification + resolution
    // flow (classifyConflict → navigateConflicts → applyResolveAction). The
    // old `git rebase {freshness-ref}` placeholder was replaced by explicit
    // references to the conflict-recovery flow.
    expect(content).toMatch(/rebase the change branch/i);
    expect(content).toMatch(/Step 4 handles conflicts/i);
    expect(content).toMatch(/PR workflow path/i);
  });

  test("adv-archive.md explicitly owns ship finalization merge and push", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    expect(content).toMatch(/canonical ship\/finalize path/i);
    expect(content).toMatch(/merge\+push/i);
    expect(content).toMatch(
      /git -C "\$MAIN" merge --ff-only change\/\{change-id\}[\s\S]*git -C "\$MAIN" push origin \{default-branch\}/,
    );
    expect(content).toMatch(/push failure[\s\S]*Merged locally\./i);
  });

  test("advance-workflow spec encodes archive push-after-merge semantics", () => {
    const content = readAsset(ADVANCE_WORKFLOW_SPEC);
    expect(content).toMatch(/push origin \{default-branch\}/);
    expect(content).toMatch(/Merged locally\./);
    expect(content).toMatch(/push fails/);
  });

  test("adv-archive.md Phase 9 keeps main checkout on default branch (no git checkout/switch)", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    // Resolve $MAIN once at start of Phase 9
    expect(content).toMatch(
      /MAIN="\$\(dirname "\$\(git rev-parse --path-format=absolute --git-common-dir\)"\)"/,
    );
    // Hard gate before any merge
    expect(content).toMatch(/Step 4\.4: Main Checkout Invariant Check/);
    expect(content).toMatch(/git -C "\$MAIN" branch --show-current/);
    expect(content).toMatch(/git -C "\$MAIN" status --porcelain/);
    // Invariant statement at top of Phase 9
    expect(content).toMatch(
      /Invariant: main checkout stays on the default branch/i,
    );
    // No git checkout / git switch directives anywhere in Phase 9 except the
    // forbidding statement in the invariant block.
    const phase9Match = content.match(
      /## Phase 9: Git Finalization[\s\S]*?(?=\n## |$)/,
    );
    expect(phase9Match).toBeTruthy();
    const phase9 = phase9Match?.[0] ?? "";
    // Allow `git checkout` / `git switch` only inside the invariant statement
    // and the user-remediation hint, both of which describe what NOT to do or
    // what the user must do manually. Strip those known-safe lines and assert
    // no other occurrences remain.
    const stripped = phase9
      .split("\n")
      .filter(
        (line) =>
          !/Invariant: main checkout/i.test(line) &&
          !/git -C "\$MAIN" switch \{default-branch\}/.test(line),
      )
      .join("\n");
    expect(stripped).not.toMatch(/git checkout/);
    expect(stripped).not.toMatch(/git switch/);
  });

  test("adv-archive.md preserves cleanup safety on reconcile conflicts", () => {
    const content = readAsset(join(COMMAND_DIR, "adv-archive.md"));
    expect(content).toMatch(/git rebase --abort/);
    expect(content).toMatch(/do NOT delete worktree/i);
    expect(content).toMatch(/conflicting files/i);
  });

  test("Negative AC #11: no dynamic INVESTMENT_CHECKIN marker injection in plugin/src/index.ts", () => {
    // AC #11: dynamic injection via experimental.chat.system.transform must be
    // append-only — specifically, no new INVESTMENT_CHECKIN markers
    // marker tokens added (cache preserved by construction in v1).
    const content = readAsset(join(REPO_ROOT, "plugin/src/index.ts"));
    expect(content).not.toMatch(/INVESTMENT_CHECKIN/);
    expect(content).not.toMatch(/\[ADV:INVESTMENT/);
    // Sanity: existing append-only markers still present
    expect(content).toMatch(
      /RECORD_WISDOM|ACCUMULATED_WISDOM|TODO_CONTINUATION/,
    );
  });
});
