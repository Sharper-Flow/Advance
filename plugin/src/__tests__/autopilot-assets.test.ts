/**
 * Asset tests for /adv-autopilot command.
 *
 * These tests verify structural properties of the autopilot command file,
 * sister command anchors that autopilot relies on, schema acceptance,
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

describe("adv-autopilot command file assets", () => {
  test("adv-autopilot.md exists with manifest header", () => {
    const content = readCommand("adv-autopilot.md");
    expect(content).toContain("name: adv-autopilot");
    expect(content).toMatch(/manifest: adv-autopilot/);
  });

  test("command file contains autopilot delegation anchors", () => {
    const content = readCommand("adv-autopilot.md");
    // Gate completion pattern
    expect(content).toContain("completedBy");
    expect(content).toContain("adv-autopilot");
    // Tier B archive sign-off preserved
    expect(content).toContain("sign off");
    expect(content).toContain("ship it");
  });

  test("command file contains constraint markers", () => {
    const content = readCommand("adv-autopilot.md");
    expect(content).toMatch(/MUST NOT invoke.*slash commands/i);
    expect(content).toMatch(/MUST NOT embed.*phase logic/i);
    expect(content).toMatch(/MUST NOT auto-archive/i);
    expect(content).toMatch(/MUST NOT.*suppress.*system.*interrupt/i);
  });

  test("command file references Tier B parsing rules", () => {
    const content = readCommand("adv-autopilot.md");
    expect(content).toMatch(/Tier B/i);
    expect(content).toMatch(/whitelist/i);
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

describe("ChangeSchema autopilot fields", () => {
  test("accepts approval_mode 'autopilot' with autopilot_invoked_at", () => {
    const result = ChangeSchema.parse({
      id: "test-change",
      title: "Test",
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      tasks: [],
      deltas: {},
      approval_mode: "autopilot",
      autopilot_invoked_at: "2026-04-28T22:00:00.000Z",
    });
    expect(result.approval_mode).toBe("autopilot");
    expect(result.autopilot_invoked_at).toBe("2026-04-28T22:00:00.000Z");
  });

  test("rejects invalid approval_mode value", () => {
    expect(() =>
      ChangeSchema.parse({
        id: "test-change",
        title: "Test",
        status: "draft",
        created_at: "2026-01-01T00:00:00.000Z",
        tasks: [],
        deltas: {},
        approval_mode: "invalid",
      }),
    ).toThrow();
  });
});

describe("rq-autopilot01 spec requirement", () => {
  test("exists in advance-workflow with 4 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = spec.requirements.find((r) => r.id === "rq-autopilot01");
    expect(req, "rq-autopilot01 must exist in advance-workflow").toBeDefined();
    expect(req!.scenarios).toHaveLength(4);
    expect(req!.scenarios.map((s) => s.id)).toEqual([
      "rq-autopilot01.1",
      "rq-autopilot01.2",
      "rq-autopilot01.3",
      "rq-autopilot01.4",
    ]);
  });

  test("body contains autopilot and Tier B anchors", () => {
    const spec = loadSpec("advance-workflow");
    const req = spec.requirements.find((r) => r.id === "rq-autopilot01");
    expect(req!.body.toLowerCase()).toMatch(/autopilot/);
    expect(req!.body).toMatch(/Tier B/);
  });
});
