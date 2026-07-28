/**
 * Release Notes Command Integration Asset Tests
 *
 * Staged rq-releaseNotesCapture01: verifies that review, harden, and archive
 * command prompts instruct the orchestrator to compose and persist a typed
 * ReleaseNotesContent block via adv_change_set_release_notes, and that the
 * orchestrator manifest/policy surface allows the setter.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import {
  AGENT_TOOL_POLICY,
  SPAWNABLE_SUBAGENT_ROSTER,
} from "./tool-role-policy";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const AGENTS_DIR = join(REPO_ROOT, ".opencode/agents");

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_DIR, name), "utf8");
}

function readAgent(name: string): string {
  return readFileSync(join(AGENTS_DIR, `${name}.md`), "utf8");
}

describe("release notes setter — orchestrator tool visibility", () => {
  test("orchestrator policy allows adv_change_set_release_notes", () => {
    const policy = AGENT_TOOL_POLICY.find((p) => p.agent === "adv");
    expect(policy?.allowed).toContain("adv_change_set_release_notes");
  });

  test("sub-agents are not granted adv_change_set_release_notes", () => {
    for (const agent of SPAWNABLE_SUBAGENT_ROSTER) {
      const policy = AGENT_TOOL_POLICY.find((p) => p.agent === agent);
      expect(
        policy?.allowed,
        `${agent} must not carry the release-notes setter`,
      ).not.toContain("adv_change_set_release_notes");
    }
  });

  test("adv.md manifest grants adv_change_set_release_notes: true", () => {
    const manifest = readAgent("adv");
    expect(manifest).toMatch(/^ {2}adv_change_set_release_notes: true$/m);
  });
});

describe("release notes setter — command prompt integration", () => {
  test("adv-review.md instructs composing ReleaseNotesContent at executive summary", () => {
    const content = readCommand("adv-review.md");
    expect(content).toContain("adv_change_set_release_notes");
    expect(content).toContain("ReleaseNotesContent");
    expect(content).toContain("executive summary");
  });

  test("adv-harden.md instructs refining release notes from Release Readiness Summary", () => {
    const content = readCommand("adv-harden.md");
    expect(content).toContain("adv_change_set_release_notes");
    expect(content).toContain("Release Readiness Summary");
    expect(content).toContain("ReleaseNotesContent");
  });

  test("adv-archive.md instructs composing release notes if change.release_notes absent", () => {
    const content = readCommand("adv-archive.md");
    expect(content).toContain("adv_change_set_release_notes");
    expect(content).toContain("change.release_notes");
    expect(content).toContain("fast-track");
  });
});
