import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_DIR, name), "utf8");
}

describe("rq-autonomy01 human checkpoint assets", () => {
  test("proposal confirmation remains in adv-proposal.md", () => {
    const content = readCommand("adv-proposal.md");
    expect(content).toMatch(/Ask the user to confirm/i);
    expect(content).toMatch(/drift is reported/i);
  });

  test("agreement sign-off lives in adv-discover.md", () => {
    const content = readCommand("adv-discover.md");
    expect(content).toMatch(/Ask for explicit user confirmation or edits/i);
    expect(content).toMatch(/agreement\.md/);
  });

  test("design approval remains conditional in adv-design.md", () => {
    const content = readCommand("adv-design.md");
    expect(content).toMatch(/real user-value tradeoffs/i);
    expect(content).toMatch(/ask the user whether the design is acceptable/i);
    expect(content).toMatch(/CONFLICT.*pause/i);
    expect(content).toMatch(/contract-compromise|compromise.*risk/i);
    expect(content).toMatch(
      /acceptance criteria.*constraint|constraint.*avoidance/i,
    );
  });

  test("acceptance checkpoint exists and preserves question-before-gate ordering", () => {
    const review = readCommand("adv-review.md");
    const mergedGateIdx = review.search(/adv_gate_complete[\s\S]*acceptance/);
    const questionIdx = review.search(/question/);
    expect(questionIdx).toBeGreaterThanOrEqual(0);
    expect(mergedGateIdx).toBeGreaterThan(questionIdx);
    expect(review).toMatch(/acceptance|accept.*(sign.?off|approve)/i);
  });

  test("acceptance criteria checkpoint exists in adv-discover.md before agreement persistence", () => {
    const content = readCommand("adv-discover.md");
    expect(content).toMatch(
      /Phase\s+4\.5\.1:\s+Acceptance Criteria Checkpoint/i,
    );
    expect(content).toMatch(/Approve acceptance criteria/i);
    expect(content).toMatch(/Start \/adv-clarify/i);
    expect(content).toMatch(/Add or clarify acceptance criteria/i);
    expect(content).toMatch(/custom input enabled/i);
    const checkpointIdx = content.indexOf(
      "Phase 4.5.1: Acceptance Criteria Checkpoint",
    );
    const persistIdx = content.indexOf("Phase 4.6: Persist Agreement");
    expect(checkpointIdx).toBeGreaterThanOrEqual(0);
    expect(persistIdx).toBeGreaterThanOrEqual(0);
    expect(checkpointIdx).toBeLessThan(persistIdx);
    // Existing agreement sign-off assertions must still hold
    expect(content).toMatch(/Ask for explicit user confirmation or edits/i);
    expect(content).toMatch(/agreement\.md/);
  });

  test("archive sign-off remains in adv-archive.md", () => {
    const content = readCommand("adv-archive.md");
    expect(content).toMatch(/Ask via `question`/i);
    expect(content).toMatch(/Archive '\{change-id\}' and apply to specs/i);
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
});
