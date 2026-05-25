/**
 * Asset tests for /adv-atc command and adv-atc agent.
 *
 * These tests verify structural properties of the atc command file,
 * agent overlay, schema acceptance, and spec requirement loadability.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { ChangeSchema } from "../types";

const REPO_ROOT = resolve(__dirname, "../../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_DIR, name), "utf8");
}

function readAgent(name: string): string {
  return readFileSync(join(AGENT_DIR, name), "utf8");
}

interface SpecJson {
  name: string;
  requirements: Array<{
    id: string;
    title: string;
    body: string;
    scenarios: Array<{ id: string; title: string }>;
  }>;
}

function loadSpec(capability: string): SpecJson {
  const path = join(REPO_ROOT, ".adv/specs", capability, "spec.json");
  return JSON.parse(readFileSync(path, "utf8")) as SpecJson;
}

describe("adv-atc command file assets", () => {
  test("adv-atc.md exists with manifest header", () => {
    const content = readCommand("adv-atc.md");
    expect(content).toContain("name: adv-atc");
    expect(content).toMatch(/manifest: adv-atc/);
  });

  test("command file routes to adv-atc agent", () => {
    const content = readCommand("adv-atc.md");
    expect(content).toMatch(/agent:\s*adv-atc/);
  });

  test("command file contains invocation modes", () => {
    const content = readCommand("adv-atc.md");
    expect(content).toContain("ROADMAP loop");
    expect(content).toContain("Single change");
    expect(content).toContain("Idea string");
  });

  test("command file contains flags", () => {
    const content = readCommand("adv-atc.md");
    expect(content).toContain("--limit");
    expect(content).toContain("--resume");
  });
});

describe("adv-atc agent overlay assets", () => {
  test("adv-atc.md agent file exists as primary agent", () => {
    const content = readAgent("adv-atc.md");
    expect(content).toMatch(/mode:\s*primary/);
    expect(content).toMatch(/name:\s*adv-atc/);
  });

  test("agent contains HITL-defer structured comment markers", () => {
    const content = readAgent("adv-atc.md");
    expect(content).toContain("<!-- ADV_ATC_DEFERRED v1");
    expect(content).toContain("<!-- ADV_ATC_RESPONSE v1");
  });

  test("agent contains must-not constraints", () => {
    const content = readAgent("adv-atc.md");
    expect(content).toMatch(/MUST NOT.*auto-approve.*HITL/i);
    expect(content).toMatch(/MUST NOT.*bypass.*Tier B/i);
    expect(content).toMatch(/MUST NOT.*auto-approve.*HITL/i);
  });

  test("agent does NOT have question tool in allowlist", () => {
    const content = readAgent("adv-atc.md");
    // Find the tools section and verify question is excluded
    const toolsSection = content.match(/tools:([\s\S]*?)---/);
    expect(toolsSection).toBeDefined();
    expect(toolsSection![0]).toMatch(
      /question.*false|ATC never prompts inline/,
    );
  });
});

describe("sister-command anchor existence (drift detection)", () => {
  test("adv-apply.md contains Phase 1.5 anchor", () => {
    const content = readCommand("adv-apply.md");
    expect(content).toMatch(/Phase 1\.5/);
  });

  test("adv-discover.md contains Phase 4.5.1 anchor", () => {
    const content = readCommand("adv-discover.md");
    expect(content).toMatch(/Phase 4\.5\.1/);
  });

  test("adv-design.md contains Inline Approval anchor", () => {
    const content = readCommand("adv-design.md");
    expect(content).toMatch(/Inline Approval/);
  });

  test("adv-prep.md contains Reply approve anchor", () => {
    const content = readCommand("adv-prep.md");
    expect(content).toMatch(/Reply `approve`/);
  });

  test("adv-proposal.md contains Must Not scope builder", () => {
    const content = readCommand("adv-proposal.md");
    expect(content).toMatch(/### Must Not/);
  });

  test("adv-discover.md contains Phase 3.5 Discovery Opportunity Scout anchor", () => {
    const content = readCommand("adv-discover.md");
    expect(content).toMatch(/Phase 3\.5.*Discovery Opportunity Scout/);
  });

  test("adv-design.md contains Phase 2.5 Design Leverage Scout anchor", () => {
    const content = readCommand("adv-design.md");
    expect(content).toMatch(/Phase 2\.5.*Design Leverage Scout/);
  });
});

describe("ChangeSchema no longer validates autopilot fields", () => {
  test("schema accepts extra fields via passthrough (no autopilot validation)", () => {
    // approval_mode and autopilot_invoked_at were removed — schema uses passthrough
    // so they pass through as unknown extras without validation
    const result = ChangeSchema.parse({
      id: "test-change",
      title: "Test",
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      tasks: [],
      deltas: {},
      some_extra_field: "passthrough",
    });
    expect(result.id).toBe("test-change");
    expect(result.some_extra_field).toBe("passthrough");
  });
});

describe("rq-atc01 spec requirement", () => {
  test("exists in advance-workflow with 5 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = spec.requirements.find((r) => r.id === "rq-atc01");
    expect(req, "rq-atc01 must exist in advance-workflow").toBeDefined();
    expect(req!.scenarios).toHaveLength(5);
    expect(req!.scenarios.map((s) => s.id)).toEqual([
      "rq-atc01.1",
      "rq-atc01.2",
      "rq-atc01.3",
      "rq-atc01.4",
      "rq-atc01.5",
    ]);
  });

  test("body contains atc and Tier B anchors", () => {
    const spec = loadSpec("advance-workflow");
    const req = spec.requirements.find((r) => r.id === "rq-atc01");
    expect(req!.body.toLowerCase()).toMatch(/atc/);
    expect(req!.body).toMatch(/Tier B/);
  });
});
