import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_DIR, name), "utf8");
}

describe("rq-autonomy01 human checkpoint assets", () => {
  // Updated post rq-inlineApproval01: the seven named human checkpoints
  // use inline handoff text (Tier A or Tier B) instead of question-tool
  // popups. These tests assert the inline contract is in place.

  test("proposal confirmation remains in adv-proposal.md", () => {
    const content = readCommand("adv-proposal.md");
    expect(content).toMatch(/Ask the user to confirm/i);
    expect(content).toMatch(/drift is reported/i);
    // Inline approval anchor (rq-inlineApproval01)
    expect(content).toContain("Reply `continue`");
  });

  test("agreement sign-off lives in adv-discover.md (inline Tier A)", () => {
    const content = readCommand("adv-discover.md");
    expect(content).toMatch(/agreement\.md/);
    // Phase 4.5.1 + 4.6 use inline approval per rq-inlineApproval01
    expect(content).toContain("Inline Approval prompt (Tier A");
    expect(content).toContain("Reply `approve`");
  });

  test("design approval remains conditional in adv-design.md (inline Tier A)", () => {
    const content = readCommand("adv-design.md");
    expect(content).toMatch(/real user-value tradeoffs/i);
    expect(content).toMatch(/CONFLICT/i);
    expect(content).toMatch(/contract[- ]compromise risk/i);
    expect(content).toMatch(
      /acceptance criteria.*constraint|constraint.*avoidance/i,
    );
    // Inline approval prompt replaces "ask the user whether the design is acceptable"
    expect(content).toContain("Inline Approval prompt (Tier A");
    expect(content).toContain("Reply `continue`");
  });

  test("acceptance checkpoint preserves accept-before-gate ordering (inline Tier A)", () => {
    const review = readCommand("adv-review.md");
    const mergedGateIdx = review.search(/adv_gate_complete[\s\S]*acceptance/);
    // Inline approval prompt now precedes gate completion (replaces question tool)
    const inlineApprovalIdx = review.search(/Inline Approval prompt/);
    expect(inlineApprovalIdx).toBeGreaterThanOrEqual(0);
    expect(mergedGateIdx).toBeGreaterThan(inlineApprovalIdx);
    expect(review).toMatch(/acceptance|accept.*(sign.?off|approve)/i);
    expect(review).toContain("Reply `accept`");
  });

  test("acceptance criteria checkpoint exists in adv-discover.md before agreement persistence", () => {
    const content = readCommand("adv-discover.md");
    expect(content).toMatch(
      /Phase\s+4\.5\.1:\s+Acceptance Criteria Checkpoint/i,
    );
    // Updated outcome wording (no longer "Approve acceptance criteria"
    // option label — inline reply with `approve` whitelist hit)
    expect(content).toMatch(/approve AC and proceed/i);
    expect(content).toMatch(/\/adv-clarify \{change-id\}/);
    expect(content).toMatch(/describe what to add\/clarify/i);
    const checkpointIdx = content.indexOf(
      "Phase 4.5.1: Acceptance Criteria Checkpoint",
    );
    const persistIdx = content.indexOf("Phase 4.6: Persist Agreement");
    expect(checkpointIdx).toBeGreaterThanOrEqual(0);
    expect(persistIdx).toBeGreaterThanOrEqual(0);
    expect(checkpointIdx).toBeLessThan(persistIdx);
    // Inline approval contract assertions
    expect(content).toContain("Inline Approval prompt");
    expect(content).toMatch(/agreement\.md/);
  });

  test("archive sign-off remains in adv-archive.md (inline Tier B)", () => {
    const content = readCommand("adv-archive.md");
    // Tier B inline approval, single-turn execution (no confirmation-echo turn)
    expect(content).toContain("Inline Approval prompt (Tier B)");
    expect(content).toContain("Reply `sign off`");
    expect(content).toMatch(/Archiving \{change-id\}/);
    expect(content).toMatch(/no separate confirmation-echo turn/i);
    expect(content).toMatch(/dry run/i);
  });

  test("cancellation approval remains in adv-apply.md", () => {
    const content = readCommand("adv-apply.md");
    expect(content).toMatch(
      /All cancellations require explicit user approval/i,
    );
    expect(content).toMatch(/adv_task_cancel/);
  });

  test("doom-loop recovery prompt remains in adv-apply.md", () => {
    const content = readCommand("adv-apply.md");
    expect(content).toMatch(/Provide hint.*Take over task.*Void contract/is);
    expect(content).toMatch(/Skip task.*NOT an option/i);
  });

  test("scope expansion re-entry flow remains explicit in adv-apply.md", () => {
    const content = readCommand("adv-apply.md");
    expect(content).toMatch(/do NOT silently fold/i);
    expect(content).toMatch(/adv_change_reenter/);
    expect(content).toMatch(
      /new tasks will be available alongside existing completed work/i,
    );
  });

  test("conformance verdict gate (Phase 5.5) exists in adv-archive.md", () => {
    const content = readCommand("adv-archive.md");
    // Phase 5.5 marker
    expect(content).toMatch(/Phase 5\.5.*Conformance/i);
    // rq-extConfGate01 citation
    expect(content).toContain("rq-extConfGate01");
    // DRIFT halt path
    expect(content).toMatch(/DRIFT.*HALT/i);
    // User options on drift
    expect(content).toMatch(/override.*unlock/is);
    // No auto-fix instruction
    expect(content).toMatch(/do NOT.*auto-fix|auto-resume|orchestrate/i);
  });

  test("adv-review.md Phase 7 persists executive summary before acceptance gate", () => {
    const content = readCommand("adv-review.md");
    // Persist Executive Summary section exists
    expect(content).toMatch(/###\s*Persist Executive Summary/);
    // Calls adv_change_update with executiveSummary field
    expect(content).toMatch(/adv_change_update.*executiveSummary/s);
    // Persist section appears BEFORE Ask for Acceptance
    const persistIdx = content.search(/###\s*Persist Executive Summary/);
    const askIdx = content.search(/###\s*Ask for Acceptance/);
    expect(persistIdx).toBeGreaterThanOrEqual(0);
    expect(askIdx).toBeGreaterThan(persistIdx);
    expect(content).toContain("workflow-visible executive-summary");
    expect(content).toContain("No-late-homework rule");
    expect(content).toContain(
      "chat approval alone is not durable acceptance proof",
    );
  });

  test("adv-archive.md Phase 1 loads executive summary via include flag", () => {
    const content = readCommand("adv-archive.md");
    expect(content).toMatch(
      /adv_change_show[\s\S]*include:[\s\S]*executiveSummary:\s*true/,
    );
  });

  test("adv.md Sign-Off Boundary instructs reading executive summary, not recomposing", () => {
    const advAgent = readFileSync(
      join(REPO_ROOT, ".opencode/agents/adv.md"),
      "utf8",
    );
    // Executive Summary section exists in Change Report template
    expect(advAgent).toMatch(/###\s*Executive Summary/);
    // Sources from _executiveSummary (include flag projection)
    expect(advAgent).toMatch(/_executiveSummary/);
    // Does NOT instruct to recompose from change.tasks (regression guard)
    expect(advAgent).not.toMatch(/compose from change\.tasks/i);
  });
});
