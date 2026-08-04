import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("adv-triage portfolio-balance contract", () => {
  const command = read(".opencode/command/adv-triage.md");
  const skill = read("skills/adv-triage/SKILL.md");
  const schema = read("skills/adv-triage/SCHEMA.md");
  const prompts = read("skills/adv-triage/PROMPTS.md");
  const antiPatterns = read("skills/adv-triage/ANTI-PATTERNS.md");
  const bootstrap = read("skills/adv-triage/BOOTSTRAP.md");

  test("gathers active changes, Epics, and open issues", () => {
    expect(command).toContain("active ADV changes");
    expect(command).toContain("active ADV Epics");
    expect(command).toContain("open GH issues");
    expect(command).toContain("adv_epic_list");
    expect(command).toContain("adv_epic_show");
    expect(bootstrap).toContain("Active ADV Epics");
  });

  test("defines displayed-only Tier B coalesce authority", () => {
    expect(command).toContain("Existing-link exclusion");
    expect(command).toContain("approve all");
    expect(command).toMatch(/DISPLAYED pairs only/i);
    expect(command).toMatch(/Hidden overflow is never authorized/i);
    expect(command).toContain("adv_change_update_issues");
    expect(prompts).toContain("Coalesce link approval prompt");
    expect(schema).toContain("Coalesce candidate");
    expect(antiPatterns).toMatch(/heuristic.*require approval/i);
  });

  test("renders exactly the contracted three portfolio sections", () => {
    for (const heading of [
      "Important to complete",
      "Cleanup needed",
      "Open issues worth solving",
    ]) {
      expect(command).toContain(`### ${heading}`);
      expect(skill).toContain(heading);
    }
    expect(command).toContain("Cap each section at 10 rows");
    expect(command).toContain("Epic order is advisory");
  });

  test("represents unlinked changes structurally and keeps defect hints advisory", () => {
    expect(command).toContain(
      "Represent every nonterminal ADV change with no linked GitHub issue in this same section; absence of an issue link MUST NOT exclude it.",
    );
    expect(command).toContain(
      "Build membership structurally from typed change state only: nonterminal state plus typed absence of issue linkage.",
    );
    expect(command).toContain(
      "Each row includes change ID/title, current gate, task progress, last activity, linked issue + priority, optional Epic ID/title/order, and any advisory defect hint rendered with its evidence source (`source:origin_kind` or `source:title_prefix`).",
    );
  });

  test("preserves the two advisory defect-hint MUST NOT boundaries", () => {
    expect(command).toContain(
      "- × MUST NOT let an advisory defect hint filter, suppress, close, deprioritize, or authorize any mutation",
    );
    expect(command).toContain(
      "- × MUST NOT write any `priority:*` label or parallel priority field to an ADV change; `priority:*` remains GitHub-issue-scoped",
    );
  });

  test("retires all roadmap write/echo/commit behavior", () => {
    expect(command).not.toContain("Generate ROADMAP.md");
    expect(command).not.toContain("Roadmap Echo");
    expect(command).not.toContain("git add ROADMAP.md");
    expect(command).not.toContain("--no-commit");
    expect(skill).toContain("no file-write or git-commit phase");
    expect(prompts).not.toContain("ROADMAP.md commit prompt");
  });
});
