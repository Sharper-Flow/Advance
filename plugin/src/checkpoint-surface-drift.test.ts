/**
 * Checkpoint surface drift regression test
 *
 * Asserts that the seven checkpoint-owning command docs use the Inline
 * Approval Voice anchor phrase and have removed the old `question` tool
 * checkpoint phrasing. Also asserts that non-checkpoint question-tool
 * uses (change-id selection, etc.) remain in place.
 *
 * Spec ref: rq-inlineApproval01.
 *
 * If a future edit re-introduces the old "via `question` tool" pattern
 * at any of the seven checkpoints, or removes an anchor phrase, this
 * test fails — preventing accidental regression of the inline approval
 * UX contract.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMMANDS_DIR = join(REPO_ROOT, ".opencode", "command");

interface CheckpointCommand {
  file: string;
  anchorPhrase: string;
  oldPattern: RegExp;
}

/**
 * Each entry covers one of the seven named human checkpoints from
 * rq-autonomy01. The anchor phrase is unique to the inline approval
 * pattern; the oldPattern matches the question-tool phrasing that
 * existed before this conversion.
 */
const checkpointCommands: CheckpointCommand[] = [
  {
    file: "adv-proposal.md",
    anchorPhrase: "Reply `continue`",
    oldPattern: /Step 9.*via\s+`question`\s+tool/s,
  },
  {
    file: "adv-discover.md",
    anchorPhrase: "Reply `approve`",
    oldPattern:
      /Phase 4\.6.*Ask\s+for\s+explicit\s+user\s+confirmation\s+or\s+edits\s+using\s+the\s+`question`\s+tool/s,
  },
  {
    file: "adv-design.md",
    anchorPhrase: "Reply `continue`",
    oldPattern: /Recommended options.*Looks good — proceed/s,
  },
  {
    file: "adv-prep.md",
    anchorPhrase: "Reply `approve`",
    oldPattern: /Phase 5\.2.*via\s+`question`\s+tool/s,
  },
  {
    file: "adv-review.md",
    anchorPhrase: "Reply `accept`",
    oldPattern:
      /Use the `question` tool to ask whether the delivered work satisfies/i,
  },
  {
    file: "adv-archive.md",
    anchorPhrase: "Reply `sign off`",
    oldPattern: /Ask via `question`: ?"Archive/i,
  },
  {
    file: "adv-apply.md",
    anchorPhrase: "approve all",
    oldPattern: /present via `question` tool \(Approve all/i,
  },
];

describe("checkpoint surface drift", () => {
  test.each(checkpointCommands)(
    "$file uses inline approval pattern",
    ({ file, anchorPhrase, oldPattern }) => {
      const content = readFileSync(join(COMMANDS_DIR, file), "utf8");

      // Anchor phrase MUST be present — proves inline pattern adopted
      expect(
        content,
        `${file} must contain anchor phrase "${anchorPhrase}" (Inline Approval Voice marker)`,
      ).toContain(anchorPhrase);

      // Old question-tool pattern at this checkpoint MUST be absent
      expect(
        content,
        `${file} must NOT contain old question-tool checkpoint phrasing matching ${oldPattern}`,
      ).not.toMatch(oldPattern);
    },
  );

  test("non-checkpoint question-tool uses are preserved", () => {
    // Smoke test: change-id selection and AC clarification rounds in
    // adv-apply.md still use the question tool legitimately. This
    // ensures the conversion didn't accidentally migrate non-checkpoint
    // uses.
    const apply = readFileSync(join(COMMANDS_DIR, "adv-apply.md"), "utf8");

    // Change-id selection (target resolution) — non-checkpoint use
    expect(
      apply,
      "adv-apply.md must still reference question tool for change-id selection (non-checkpoint use)",
    ).toMatch(/adv_change_list.*question/i);

    // Non-checkpoint question-tool uses remain available for change-id
    // selection and other structured choice flows.
  });

  test("adv-discover.md preserves question tool for clarification rounds (Phase 4.5)", () => {
    // Phase 4.5 (Open Question Resolution Loop) is NOT a checkpoint —
    // it's a multi-round clarification flow that legitimately uses
    // the question tool with structured options.
    const discover = readFileSync(
      join(COMMANDS_DIR, "adv-discover.md"),
      "utf8",
    );

    expect(
      discover,
      "adv-discover.md Phase 4.5 must still use question tool for clarification rounds",
    ).toMatch(/Phase 4\.5.*Open Question Resolution/s);
    expect(
      discover,
      "adv-discover.md must still mention question tool for clarification rounds (non-checkpoint)",
    ).toMatch(/up to 5 questions per round via the `question` tool/i);
  });
});
