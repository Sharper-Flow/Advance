/**
 * Handoff footer drift regression test
 *
 * Asserts that gate handoff footers use the blockquote wayfinder block:
 *
 *     > **{change-id}**
 *     > {gate} ✓ → {next-gate}
 *     >
 *     > → `/adv-{next-command} {change-id}`
 *
 * Also asserts the prior prose-labeled footer (Current phase / Next phase /
 * Run when ready) is absent.
 *
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
    currentPhase: "task",
    nextPhase: "apply",
    command: "adv-apply",
  },
];

describe("handoff blockquote wayfinder contract", () => {
  test.each(handoffCommands)(
    "$file uses blockquote wayfinder block",
    ({ file, currentPhase, nextPhase, command }) => {
      const content = readFileSync(join(COMMANDS_DIR, file), "utf8");

      // Negative assertions — prose labels MUST be absent
      expect(
        content,
        `${file} must NOT contain 'Current phase:' label`,
      ).not.toMatch(/Current phase:/);

      expect(
        content,
        `${file} must NOT contain 'Next phase:' label`,
      ).not.toMatch(/Next phase:/);

      expect(
        content,
        `${file} must NOT contain 'Run when ready:' label`,
      ).not.toMatch(/Run when ready:/);

      // Positive assertions — blockquote wayfinder rows MUST be present
      expect(
        content,
        `${file} must contain blockquote change-id row '> **{change-id}**'`,
      ).toMatch(/^> \*\*\{change-id\}\*\*$/m);

      expect(
        content,
        `${file} must contain blockquote gate-transition row '> ${currentPhase} ✓ → ${nextPhase}'`,
      ).toMatch(new RegExp(`^> ${currentPhase} ✓ → ${nextPhase}$`, "m"));

      expect(
        content,
        `${file} must contain blockquote arrow-prefixed command row for /${command}`,
      ).toMatch(
        new RegExp(
          `^> → \`\\/${command} \\{change-id\\}\`$`,
          "m",
        ),
      );
    },
  );

  test("command-voice-standard.md canonical spine shows blockquote wayfinder", () => {
    const content = readFileSync(
      join(DOCS_DIR, "command-voice-standard.md"),
      "utf8",
    );

    // Extract the canonical spine code block
    const spineMatch = content.match(
      /### Canonical spine[\s\S]*?```\n([\s\S]*?)\n```/,
    );
    expect(spineMatch, "Canonical spine code block must exist").toBeTruthy();
    const spineBlock = spineMatch![1];

    expect(
      spineBlock,
      "Canonical spine must NOT show 'Current phase:' label",
    ).not.toMatch(/Current phase:/);

    expect(
      spineBlock,
      "Canonical spine must NOT show 'Run when ready:' label",
    ).not.toMatch(/Run when ready:/);

    expect(
      spineBlock,
      "Canonical spine must show blockquote change-id row",
    ).toMatch(/^> \*\*\{change-id\}\*\*$/m);

    expect(
      spineBlock,
      "Canonical spine must show blockquote gate transition row",
    ).toMatch(/^> \{gate\} ✓ → \{next-gate\}$/m);

    expect(
      spineBlock,
      "Canonical spine must show blockquote arrow command row",
    ).toMatch(/^> → `\/adv-\{next-command\} \{change-id\}`$/m);
  });

  test("adv.md output contract uses blockquote wayfinder", () => {
    const content = readFileSync(join(AGENTS_DIR, "adv.md"), "utf8");

    // Extract the Output Contract code block
    const outputMatch = content.match(
      /## Output Contract[\s\S]*?```\n([\s\S]*?)\n```/,
    );
    expect(outputMatch, "Output Contract code block must exist").toBeTruthy();
    const outputBlock = outputMatch![1];

    expect(
      outputBlock,
      "adv.md Output Contract must NOT show 'Current phase:' label",
    ).not.toMatch(/Current phase:/);

    expect(
      outputBlock,
      "adv.md Output Contract must NOT show 'Run when ready:' label",
    ).not.toMatch(/Run when ready:/);

    expect(
      outputBlock,
      "adv.md Output Contract must show blockquote change-id row",
    ).toMatch(/^> \*\*\{change-id\}\*\*$/m);

    expect(
      outputBlock,
      "adv.md Output Contract must show blockquote gate transition row",
    ).toMatch(/^> \{gate\} ✓ → \{next-gate\}$/m);

    expect(
      outputBlock,
      "adv.md Output Contract must show blockquote arrow command row",
    ).toMatch(/^> → `\/adv-\{next-command\} \{change-id\}`$/m);
  });

  test("Archive Shipped variant uses single-line blockquote terminal", () => {
    const content = readFileSync(
      join(DOCS_DIR, "command-voice-standard.md"),
      "utf8",
    );

    // Extract the full Archive terminal variant section
    const sectionMatch = content.match(
      /### Archive terminal variant\n[\s\S]*?(?=\n### )/,
    );
    expect(
      sectionMatch,
      "Archive terminal variant section must exist",
    ).toBeTruthy();
    const sectionText = sectionMatch![0];

    // Collect all code blocks within the section
    const codeBlocks = [...sectionText.matchAll(/```([\s\S]*?)```/g)].map(
      (m) => m[1],
    );

    expect(
      codeBlocks.length,
      "Archive terminal variant must contain at least 2 code blocks (Shipped + Merged locally)",
    ).toBeGreaterThanOrEqual(2);

    const shippedBlock = codeBlocks[0];

    expect(
      shippedBlock,
      "Shipped variant must NOT contain 'Current phase:'",
    ).not.toMatch(/Current phase:/);

    expect(
      shippedBlock,
      "Shipped variant must NOT contain 'Next phase:'",
    ).not.toMatch(/Next phase:/);

    expect(
      shippedBlock,
      "Shipped variant must NOT contain 'Run when ready:'",
    ).not.toMatch(/Run when ready:/);

    expect(
      shippedBlock,
      "Shipped variant must contain 'Shipped.'",
    ).toMatch(/Shipped\./);

    expect(
      shippedBlock,
      "Shipped variant must use single-line blockquote terminal",
    ).toMatch(/^> \*\*\{change-id\}\*\* · release ✓ · Shipped\.$/m);
  });

  test("Archive Merged-locally variant uses single-line blockquote terminal", () => {
    const content = readFileSync(
      join(DOCS_DIR, "command-voice-standard.md"),
      "utf8",
    );

    const sectionMatch = content.match(
      /### Archive terminal variant\n[\s\S]*?(?=\n### )/,
    );
    expect(
      sectionMatch,
      "Archive terminal variant section must exist",
    ).toBeTruthy();
    const sectionText = sectionMatch![0];

    const codeBlocks = [...sectionText.matchAll(/```([\s\S]*?)```/g)].map(
      (m) => m[1],
    );
    const localBlock = codeBlocks[1];

    expect(
      localBlock,
      "Merged-locally variant must NOT contain 'Current phase:'",
    ).not.toMatch(/Current phase:/);

    expect(
      localBlock,
      "Merged-locally variant must NOT contain 'Next phase:'",
    ).not.toMatch(/Next phase:/);

    expect(
      localBlock,
      "Merged-locally variant must NOT contain 'Run when ready:'",
    ).not.toMatch(/Run when ready:/);

    expect(
      localBlock,
      "Merged-locally variant must contain 'Merged locally.'",
    ).toMatch(/Merged locally\./);

    expect(
      localBlock,
      "Merged-locally variant must use single-line blockquote terminal",
    ).toMatch(/^> \*\*\{change-id\}\*\* · release ✓ · Merged locally\.$/m);
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

    // Given-clause was updated for spec-text consistency: the wayfinder
    // block (formerly labeled footer block) shows the continuation command.
    expect(
      commandAsApproval.given.some((g: string) =>
        g.includes("blockquote wayfinder block"),
      ),
      "rq-inlineApproval01.7 given-clause must reference blockquote wayfinder block",
    ).toBe(true);

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

  test("spec.json describes blockquote wayfinder block", () => {
    const content = readFileSync(join(SPECS_DIR, "spec.json"), "utf8");
    const spec = JSON.parse(content);

    const handoffVoice = spec.requirements.find(
      (r: any) => r.id === "rq-handoffVoice01",
    );
    expect(handoffVoice, "rq-handoffVoice01 must exist").toBeTruthy();

    expect(
      handoffVoice.body,
      "Body must mention blockquote wayfinder block",
    ).toMatch(/blockquote wayfinder block/);

    expect(
      handoffVoice.body,
      "Body must NOT mention 'Current phase:' (legacy prose label)",
    ).not.toMatch(/Current phase:/);

    expect(
      handoffVoice.body,
      "Body must NOT mention 'Run when ready:' (legacy prose label)",
    ).not.toMatch(/Run when ready:/);

    const wayfinderScenario = handoffVoice.scenarios.find(
      (s: any) => s.id === "rq-handoffVoice01.1",
    );
    expect(
      wayfinderScenario,
      "rq-handoffVoice01.1 must exist",
    ).toBeTruthy();

    expect(
      wayfinderScenario.then.some((t: string) =>
        t.includes("blockquote wayfinder block"),
      ),
      "Scenario .1 must assert blockquote wayfinder block in then-clause",
    ).toBe(true);

    expect(
      wayfinderScenario.then.some((t: string) =>
        t.includes("`**{change-id}**`"),
      ),
      "Scenario .1 must assert bolded change-id row",
    ).toBe(true);

    expect(
      wayfinderScenario.then.some((t: string) =>
        t.includes("{gate} ✓ → {next-gate}"),
      ),
      "Scenario .1 must assert gate transition row",
    ).toBe(true);

    const replacesNextScenario = handoffVoice.scenarios.find(
      (s: any) => s.id === "rq-handoffVoice01.4",
    );
    expect(
      replacesNextScenario,
      "rq-handoffVoice01.4 must exist",
    ).toBeTruthy();

    expect(
      replacesNextScenario.title,
      "Scenario .4 title must reference blockquote wayfinder",
    ).toMatch(/blockquote wayfinder/i);

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
