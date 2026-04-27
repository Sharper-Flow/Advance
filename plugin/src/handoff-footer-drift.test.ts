/**
 * Handoff footer drift regression test
 *
 * Asserts that gate handoff footers use labeled blocks with
 * Current phase, Next phase, and Run when ready labels.
 * Also asserts command-as-approval semantics for Tier A checkpoints
 * and Tier B strictness (no command-as-approval bypass).
 *
 * Spec ref: rq-handoffVoice01, rq-inlineApproval01.7, rq-inlineApproval01.8.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMMANDS_DIR = join(REPO_ROOT, ".opencode", "command");
const AGENTS_DIR = join(REPO_ROOT, ".opencode", "agents");
const DOCS_DIR = join(REPO_ROOT, "docs");
const SPECS_DIR = join(REPO_ROOT, ".adv", "specs", "advance");

interface HandoffCommand {
  file: string;
  currentPhase: string;
  nextPhase: string;
  command: string;
}

const handoffCommands: HandoffCommand[] = [
  {
    file: "adv-proposal.md",
    currentPhase: "proposal",
    nextPhase: "discovery",
    command: "adv-discover",
  },
  {
    file: "adv-discover.md",
    currentPhase: "discovery",
    nextPhase: "design",
    command: "adv-design",
  },
  {
    file: "adv-design.md",
    currentPhase: "design",
    nextPhase: "planning",
    command: "adv-prep",
  },
  {
    file: "adv-prep.md",
    currentPhase: "planning",
    nextPhase: "execution",
    command: "adv-apply",
  },
  {
    file: "adv-apply.md",
    currentPhase: "execution",
    nextPhase: "acceptance",
    command: "adv-review",
  },
  {
    file: "adv-review.md",
    currentPhase: "acceptance",
    nextPhase: "release",
    command: "adv-harden",
  },
  {
    file: "adv-harden.md",
    currentPhase: "release",
    nextPhase: "archive",
    command: "adv-archive",
  },
  {
    file: "adv-task.md",
    currentPhase: "planning",
    nextPhase: "execution",
    command: "adv-apply",
  },
];

describe("handoff footer labeled block contract", () => {
  test.each(handoffCommands)(
    "$file uses labeled footer block",
    ({ file, currentPhase, nextPhase, command }) => {
      const content = readFileSync(join(COMMANDS_DIR, file), "utf8");

      expect(content, `${file} must contain 'Current phase:' label`).toMatch(
        /Current phase:\s*\w+/,
      );

      expect(content, `${file} must contain 'Next phase:' label`).toMatch(
        /Next phase:\s*\w+/,
      );

      expect(
        content,
        `${file} must contain 'Run when ready:' label with a command`,
      ).toMatch(/Run when ready:\s*`\/adv-[\w-]+\s+\{change-id\}`/);

      // Verify the specific phases match the gate transition
      expect(
        content,
        `${file} Current phase must be '${currentPhase}'`,
      ).toMatch(new RegExp(`Current phase:\\s*${currentPhase}`));

      expect(content, `${file} Next phase must be '${nextPhase}'`).toMatch(
        new RegExp(`Next phase:\\s*${nextPhase}`),
      );

      expect(
        content,
        `${file} Run when ready must reference /${command}`,
      ).toMatch(
        new RegExp(`Run when ready:\\s*\`\\/${command}\\s+\\{change-id\\}\``),
      );
    },
  );

  test("command-voice-standard.md requires labeled footer block in canonical spine", () => {
    const content = readFileSync(
      join(DOCS_DIR, "command-voice-standard.md"),
      "utf8",
    );

    expect(content, "Canonical spine must show labeled footer block").toMatch(
      /Current phase:\s*\{completed-gate-name\}/,
    );

    expect(content, "Canonical spine must show Next phase label").toMatch(
      /Next phase:\s*\{next-gate-name\}/,
    );

    expect(content, "Canonical spine must show Run when ready label").toMatch(
      /Run when ready:\s*`\/adv-\{next-command\}\s+\{change-id\}`/,
    );
  });

  test("adv.md output contract uses labeled footer block", () => {
    const content = readFileSync(join(AGENTS_DIR, "adv.md"), "utf8");

    expect(
      content,
      "adv.md Output Contract must show labeled footer block",
    ).toMatch(/Current phase:\s*\{completed-gate-name\}/);

    expect(
      content,
      "adv.md Output Contract must show Next phase label",
    ).toMatch(/Next phase:\s*\{next-gate-name\}/);

    expect(
      content,
      "adv.md Output Contract must show Run when ready label",
    ).toMatch(/Run when ready:\s*`\/adv-\{command\}\s+\{change-id\}`/);
  });

  test("archive terminal variant has no labeled footer block", () => {
    const content = readFileSync(
      join(DOCS_DIR, "command-voice-standard.md"),
      "utf8",
    );

    // Extract archive terminal variant section
    const archiveMatch = content.match(
      /### Archive terminal variant[\s\S]*?```([\s\S]*?)```/,
    );
    expect(archiveMatch, "Archive terminal variant must exist").toBeTruthy();
    const archiveSection = archiveMatch![1];

    expect(
      archiveSection,
      "Archive terminal must NOT contain 'Current phase:'",
    ).not.toMatch(/Current phase:/);

    expect(
      archiveSection,
      "Archive terminal must NOT contain 'Next phase:'",
    ).not.toMatch(/Next phase:/);

    expect(
      archiveSection,
      "Archive terminal must NOT contain 'Run when ready:'",
    ).not.toMatch(/Run when ready:/);
  });
});

describe("command-as-approval semantics", () => {
  test("adv-prep.md treats /adv-apply as approval", () => {
    const content = readFileSync(join(COMMANDS_DIR, "adv-prep.md"), "utf8");

    expect(
      content,
      "adv-prep.md must describe /adv-apply as explicit approval",
    ).toMatch(/Counts as explicit approval/);

    expect(
      content,
      "adv-prep.md must mention userApproved: true for /adv-apply",
    ).toMatch(/userApproved:\s*true/);
  });

  test("adv-apply.md handles planning pending as command-as-approval", () => {
    const content = readFileSync(join(COMMANDS_DIR, "adv-apply.md"), "utf8");

    expect(
      content,
      "adv-apply.md must describe planning-pending command-as-approval",
    ).toMatch(/Planning gate pending/);

    expect(
      content,
      "adv-apply.md must mention completing planning with userApproved: true",
    ).toMatch(/adv_gate_complete.*gateId:\s*planning.*userApproved:\s*true/);
  });

  test("Tier B archive sign-off does NOT allow command-as-approval", () => {
    const content = readFileSync(join(COMMANDS_DIR, "adv-archive.md"), "utf8");

    // Archive should remain whitelist-only, no slash-command bypass
    expect(
      content,
      "adv-archive.md must NOT describe command-as-approval bypass",
    ).not.toMatch(/command-as-approval|counts as approval|invocation counts/);
  });

  test("spec.json includes command-as-approval scenario", () => {
    const content = readFileSync(join(SPECS_DIR, "spec.json"), "utf8");
    const spec = JSON.parse(content);

    const inlineApproval = spec.requirements.find(
      (r: any) => r.id === "rq-inlineApproval01",
    );
    expect(inlineApproval, "rq-inlineApproval01 must exist").toBeTruthy();

    const commandAsApproval = inlineApproval.scenarios.find(
      (s: any) => s.id === "rq-inlineApproval01.7",
    );
    expect(
      commandAsApproval,
      "rq-inlineApproval01.7 (command-as-approval) must exist",
    ).toBeTruthy();

    expect(
      commandAsApproval.title,
      "Scenario title must mention exact shown command counts as approval",
    ).toMatch(/Exact shown.*command counts as approval/i);

    const tierBStrict = inlineApproval.scenarios.find(
      (s: any) => s.id === "rq-inlineApproval01.8",
    );
    expect(
      tierBStrict,
      "rq-inlineApproval01.8 (Tier B strictness) must exist",
    ).toBeTruthy();

    expect(
      tierBStrict.title,
      "Scenario title must mention Tier B whitelist-only",
    ).toMatch(/Tier B.*whitelist-only/i);
  });

  test("spec.json includes labeled footer block scenarios", () => {
    const content = readFileSync(join(SPECS_DIR, "spec.json"), "utf8");
    const spec = JSON.parse(content);

    const handoffVoice = spec.requirements.find(
      (r: any) => r.id === "rq-handoffVoice01",
    );
    expect(handoffVoice, "rq-handoffVoice01 must exist").toBeTruthy();

    expect(handoffVoice.body, "Body must mention labeled footer block").toMatch(
      /labeled footer block/,
    );

    expect(handoffVoice.body, "Body must mention Current phase").toMatch(
      /Current phase:/,
    );

    expect(handoffVoice.body, "Body must mention Next phase").toMatch(
      /Next phase:/,
    );

    expect(
      handoffVoice.body,
      "Body must mention command-needed-to-continue label",
    ).toMatch(/command-needed-to-continue/);

    const labeledBlockScenario = handoffVoice.scenarios.find(
      (s: any) => s.id === "rq-handoffVoice01.1",
    );
    expect(labeledBlockScenario, "rq-handoffVoice01.1 must exist").toBeTruthy();

    expect(
      labeledBlockScenario.then.some((t: string) =>
        t.includes("labeled footer block"),
      ),
      "Scenario must assert labeled footer block",
    ).toBe(true);

    const singleCommandScenario = handoffVoice.scenarios.find(
      (s: any) => s.id === "rq-handoffVoice01.5",
    );
    expect(
      singleCommandScenario,
      "rq-handoffVoice01.5 (single command) must exist",
    ).toBeTruthy();

    expect(
      singleCommandScenario.title,
      "Title must mention only the needed command",
    ).toMatch(/shows only the needed command/i);
  });
});
