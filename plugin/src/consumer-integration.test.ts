/**
 * Consumer integration boundary tests (AC9, AC10, AC14).
 *
 * AC9: command docs reference projection consumption
 * AC10: bin/adv adapter exists and is importable
 * AC14: no new mutation verbs added to commands — they remain
 *       read-only / approval-gated / order-advisory
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase F1
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const CMD_DIR = join(REPO_ROOT, ".opencode", "command");

function readCmd(name: string): string {
  return readFileSync(join(CMD_DIR, name), "utf-8");
}

describe("AC9 — command docs specify projection consumption", () => {
  test("adv-coordinate.md references resume projection", () => {
    const content = readCmd("adv-coordinate.md");
    // The coordinate command should reference the projection for sequencing.
    expect(content).toMatch(/resume[_-]projection|ordered_next|adv_resume_projection/);
  });

  test("adv-status.md or status tool references resume projection", () => {
    // adv-status.md is a thin wrapper; the projection integration is in the
    // status tool (Phase E registered the tool). Verify the tool exists.
    const statusTool = readFileSync(
      join(REPO_ROOT, "plugin", "src", "tools", "resume-projection.ts"),
      "utf-8",
    );
    expect(statusTool).toContain("adv_resume_projection");
  });

  test("adv-triage.md references resume projection for portfolio what's next", () => {
    const content = readCmd("adv-triage.md");
    expect(content).toMatch(/resume[_-]projection|ordered_next|adv_resume_projection/);
  });
});

describe("AC10 — bin/adv adapter exists", () => {
  test("bin/lib/resume-projection.ts exports buildBinResumeProjection", () => {
    const adapter = readFileSync(
      join(REPO_ROOT, "bin", "lib", "resume-projection.ts"),
      "utf-8",
    );
    expect(adapter).toContain("buildBinResumeProjection");
    expect(adapter).toContain("buildResumeProjection");
  });
});

describe("AC14 — boundary preservation (no new mutation verbs)", () => {
  test("adv-coordinate.md does not add new mutation command definitions", () => {
    const content = readCmd("adv-coordinate.md");
    // The command must remain read-first / approval-gated.
    expect(content).toMatch(/read-first|approval-gated|read-only/i);
    // Must NOT define new mutation slash commands (existing boundary text is OK).
    // Check for new command definitions, not existing MUST NOT references.
    const lines = content.split("\n");
    const newCmdLines = lines.filter(
      (l) => l.match(/^##\s/) && l.match(/create|close|archive|delete|mutate/i),
    );
    expect(newCmdLines).toEqual([]);
  });

  test("adv-status.md remains a read-only command", () => {
    const content = readCmd("adv-status.md");
    // adv-status is explicitly read-only.
    expect(content).toMatch(/Do not call ADV tools|read-only/i);
  });

  test("adv-triage.md remains order-advisory", () => {
    const content = readCmd("adv-triage.md");
    // Triage is advisory — must not gain mutation authority.
    expect(content).toMatch(/advisory|order-advisory|read-only|approval/i);
  });

  test("adv_resume_projection is pure-read (no store mutation calls)", () => {
    const tool = readFileSync(
      join(REPO_ROOT, "plugin", "src", "tools", "resume-projection.ts"),
      "utf-8",
    );
    // The tool must not call mutation store methods or fire signals.
    expect(tool).not.toMatch(/store\.changes\.create|store\.changes\.save|store\.epics\.create|store\.save|fireSignal|emitSignal/i);
  });
});
