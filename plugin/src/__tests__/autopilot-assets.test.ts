/**
 * Asset tests for /adv-atc command.
 *
 * These tests verify structural properties of the atc command file,
 * sister command anchors that atc relies on, schema acceptance,
 * and spec requirement loadability.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { ChangeSchema } from "../types";

const REPO_ROOT = resolve(__dirname, "../../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");

function readCommand(name: string): string {
  return readFileSync(join(COMMAND_DIR, name), "utf8");
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

  test("command file contains atc references", () => {
    const content = readCommand("adv-atc.md");
    expect(content).toContain("adv-atc");
    expect(content).toContain("ROADMAP");
    expect(content).toContain("HITL");
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
});

describe("ChangeSchema passthrough fields", () => {
  test("accepts extra fields via passthrough", () => {
    const result = ChangeSchema.parse({
      id: "test-change",
      title: "Test",
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      tasks: [],
      deltas: {},
      approval_mode: "atc",
      atc_invoked_at: "2026-04-28T22:00:00.000Z",
    });
    expect(result.approval_mode).toBe("atc");
    expect(result.atc_invoked_at).toBe("2026-04-28T22:00:00.000Z");
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
