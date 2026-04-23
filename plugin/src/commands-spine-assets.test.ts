/**
 * Command Doc Gate Handoff Spine Asset Tests
 *
 * Verifies that every `.opencode/command/adv-*.md` file containing the
 * gate handoff spine (## Problem / ## Chosen direction / ## Delivered)
 * uses the canonical format defined in `docs/command-voice-standard.md`.
 *
 * Also bans retired headings (`## Next stage`, `## Next`) everywhere.
 */

import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");

function listCommandFiles(): string[] {
  const entries = readdirSync(COMMAND_DIR);
  return entries
    .filter((f) => f.startsWith("adv-") && f.endsWith(".md"))
    .sort();
}

interface SpineCheck {
  file: string;
  hasSpine: boolean;
  errors: string[];
}

function checkSpine(content: string, fileName: string): SpineCheck {
  const errors: string[] = [];
  const lines = content.split("\n");

  const problemIndex = lines.findIndex((l) => l.trim() === "## Problem");
  const chosenIndex = lines.findIndex((l) => l.trim() === "## Chosen direction");
  const deliveredIndex = lines.findIndex((l) => l.trim() === "## Delivered");

  const hasProblem = problemIndex !== -1;
  const hasChosen = chosenIndex !== -1;
  const hasDelivered = deliveredIndex !== -1;
  const hasSpine = hasProblem && hasChosen && hasDelivered;

  if (!hasSpine) {
    return { file: fileName, hasSpine: false, errors };
  }

  // Order check
  if (problemIndex > chosenIndex) {
    errors.push("`## Problem` must appear before `## Chosen direction`");
  }
  if (chosenIndex > deliveredIndex) {
    errors.push("`## Chosen direction` must appear before `## Delivered`");
  }

  // Find `---` separator after ## Delivered
  let separatorIndex = -1;
  for (let i = deliveredIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      separatorIndex = i;
      break;
    }
  }
  if (separatorIndex === -1) {
    errors.push("Missing `---` separator after `## Delivered`");
  }

  // Find footer line with **{change-id}** after the separator
  if (separatorIndex !== -1) {
    let footerIndex = -1;
    for (let i = separatorIndex + 1; i < lines.length; i++) {
      if (lines[i].includes("**{change-id}**")) {
        footerIndex = i;
        break;
      }
    }
    if (footerIndex === -1) {
      errors.push(
        "Missing footer line containing `**{change-id}**` after `---` separator",
      );
    }
  }

  return { file: fileName, hasSpine: true, errors };
}

function checkRetiredHeadings(content: string, fileName: string): string[] {
  const errors: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "## Next stage") {
      errors.push(
        `Line ${i + 1}: retired heading \`## Next stage\` found`,
      );
    }
    if (trimmed === "## Next") {
      errors.push(`Line ${i + 1}: retired heading \`## Next\` found`);
    }
  }

  return errors;
}

describe("Command doc gate handoff spine format", () => {
  const commandFiles = listCommandFiles();

  test("at least one command doc exists", () => {
    expect(commandFiles.length).toBeGreaterThan(0);
  });

  const spineResults: SpineCheck[] = [];
  const retiredErrors: { file: string; errors: string[] }[] = [];

  for (const file of commandFiles) {
    const content = readFileSync(join(COMMAND_DIR, file), "utf8");
    const spineResult = checkSpine(content, file);
    if (spineResult.hasSpine) {
      spineResults.push(spineResult);
    }
    const retired = checkRetiredHeadings(content, file);
    if (retired.length > 0) {
      retiredErrors.push({ file, errors: retired });
    }
  }

  test("no retired headings in any command doc", () => {
    const messages = retiredErrors.map(
      ({ file, errors }) => `${file}:\n  ${errors.join("\n  ")}`,
    );
    expect(
      retiredErrors,
      `Retired headings detected:\n\n${messages.join("\n\n")}`,
    ).toHaveLength(0);
  });

  test("all spine-bearing command docs have correct format", () => {
    const failures = spineResults.filter((r) => r.errors.length > 0);
    const messages = failures.map(
      ({ file, errors }) => `${file}:\n  ${errors.join("\n  ")}`,
    );
    expect(
      failures,
      `Spine format errors:\n\n${messages.join("\n\n")}`,
    ).toHaveLength(0);
  });

  test("known gate-handoff commands have a spine", () => {
    // These commands are expected to produce a gate handoff spine
    const expectedSpineFiles = [
      "adv-apply.md",
      "adv-archive.md",
      "adv-design.md",
      "adv-discover.md",
      "adv-harden.md",
      "adv-prep.md",
      "adv-proposal.md",
      "adv-review.md",
      "adv-task.md",
    ];

    const missingSpine = expectedSpineFiles.filter(
      (file) => !spineResults.some((r) => r.file === file),
    );

    expect(
      missingSpine,
      `Expected gate-handoff commands missing spine:\n  ${missingSpine.join("\n  ")}`,
    ).toHaveLength(0);
  });
});
