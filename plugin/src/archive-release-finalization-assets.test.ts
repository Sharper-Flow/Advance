import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC_JSON = join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json");
const SPEC_DOC = join(REPO_ROOT, "docs/specs/advance-workflow.md");
const ARCHIVE_COMMAND = join(REPO_ROOT, ".opencode/command/adv-archive.md");
const VOICE_DOC = join(REPO_ROOT, "docs/command-voice-standard.md");
const ADV_INSTRUCTIONS = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("archive release-finalization docs/spec assets", () => {
  test("rq-releaseFinalization01 requires origin/default or merged-PR proof", () => {
    const spec = JSON.parse(read(SPEC_JSON));
    const requirement = spec.requirements.find(
      (r: { id: string }) => r.id === "rq-releaseFinalization01",
    );

    expect(requirement, "rq-releaseFinalization01 must exist").toBeTruthy();
    expect(requirement.body).toMatch(
      /origin\/?\{default-branch\}|origin\/<default>/i,
    );
    expect(requirement.body).toMatch(/merged PR/i);
    expect(requirement.body).toMatch(/Pending auto-merge\./);
    expect(requirement.body).toMatch(/phase9:"skip"/);
    expect(requirement.body).toMatch(/recovery/i);
    expect(requirement.body).toMatch(/archived-but-unmerged/i);

    expect(
      requirement.body,
      "Remote-backed push failure must not be documented as local-only archive success",
    ).not.toMatch(/push (fails|failed)[\s\S]{0,120}local-only/i);
    expect(requirement.body).not.toMatch(
      /push (fails|failed)[\s\S]{0,120}`Merged locally\.`/i,
    );
  });

  test("release-finalization spec/doc parity covers pending, skip, recovery, and re-drive", () => {
    const specDoc = read(SPEC_DOC);
    const specJson = read(SPEC_JSON);

    for (const content of [specJson, specDoc]) {
      expect(content).toContain("origin/{default-branch}");
      expect(content).toContain("Pending auto-merge.");
      expect(content).toMatch(/phase9:(\\?")skip\1/);
      expect(content).toContain("release recovery");
      expect(content).toContain("archived-but-unmerged");
      expect(content).toContain("adv_archive_repair");
    }
  });

  test("archive command and voice expose honest remote-backed terminals", () => {
    const command = read(ARCHIVE_COMMAND);
    const voice = read(VOICE_DOC);

    for (const content of [command, voice]) {
      expect(content).toContain("Pending auto-merge.");
      expect(content).toContain("Blocked.");
      expect(content).toMatch(
        /Merged locally[\s\S]{0,220}(no `origin` remote|no-remote)/i,
      );
      expect(content).not.toMatch(
        /Merged locally[\s\S]{0,240}(push skipped|push fails|push failed)/i,
      );
      expect(content).not.toMatch(
        /push (skipped|fails|failed)[\s\S]{0,240}Merged locally/i,
      );
    }

    expect(voice).toMatch(
      /^> \*\*\{change-id\}\*\* · release pending · Pending auto-merge\.$/m,
    );
    expect(voice).toMatch(
      /^> \*\*\{change-id\}\*\* · release blocked · Blocked\.$/m,
    );
  });

  test("ADV instructions cite PR auto-merge and origin proof, not local-only PR handoff", () => {
    const instructions = read(ADV_INSTRUCTIONS);

    expect(instructions).toContain("origin/{default-branch}");
    expect(instructions).toContain("PR + GitHub auto-merge");
    expect(instructions).toContain("Pending auto-merge.");
    expect(instructions).toContain("adv_archive_repair");
    expect(instructions).not.toMatch(/PR-mode branch-push handoff/i);
  });
});
