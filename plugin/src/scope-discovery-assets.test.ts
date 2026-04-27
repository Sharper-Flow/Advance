/**
 * Scope Discovery Protocol Assets Tests
 *
 * Verifies that the scope-discovery protocol doc exists, is referenced from
 * all three execution-phase commands, and that ADV_INSTRUCTIONS.md contains
 * the Large-Scope Validity section.
 */

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

const SCOPE_DISCOVERY_PROTOCOL_PATH = join(
  REPO_ROOT,
  "docs/scope-discovery-protocol.md",
);

const COMMAND_FILES = [
  {
    name: "adv-apply",
    path: join(REPO_ROOT, ".opencode/command/adv-apply.md"),
  },
  {
    name: "adv-review",
    path: join(REPO_ROOT, ".opencode/command/adv-review.md"),
  },
  {
    name: "adv-harden",
    path: join(REPO_ROOT, ".opencode/command/adv-harden.md"),
  },
];

const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

describe("scope discovery protocol assets", () => {
  test("docs/scope-discovery-protocol.md exists", () => {
    expect(existsSync(SCOPE_DISCOVERY_PROTOCOL_PATH)).toBe(true);
  });

  for (const { name, path } of COMMAND_FILES) {
    test(`${name} references docs/scope-discovery-protocol.md`, () => {
      const content = readFileSync(path, "utf8");
      expect(content).toContain("docs/scope-discovery-protocol.md");
    });
  }

  test("ADV_INSTRUCTIONS.md contains ### Large-Scope Validity heading", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");
    expect(content).toContain("### Large-Scope Validity");
  });

  test("ADV_INSTRUCTIONS.md references cost-governance", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");
    expect(content).toContain("cost-governance");
  });
});
