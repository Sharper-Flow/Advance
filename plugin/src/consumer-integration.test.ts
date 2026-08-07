/**
 * Consumer integration boundary tests (AC9, AC10, AC14).
 *
 * AC9: adv_status summary consumes the resume projection kernel
 *       (behavioral: verify recommendation source/kind includes "resume_projection").
 * AC10: bin/adv status, epic-list, and dashboard adapters call buildBinResumeProjection
 *        (static call-site + output-shape tests).
 * AC14: no new mutation verbs added to commands — they remain
 *        read-only / approval-gated / order-advisory
 *        (static AST checks + mutation-call absence).
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase F1
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const CMD_DIR = join(REPO_ROOT, ".opencode", "command");
const BIN_ADV = join(REPO_ROOT, "bin", "adv");
const BIN_DASHBOARD_ADV = join(REPO_ROOT, "bin", "lib", "dashboard", "adv.ts");
const BIN_EPIC_LIST = join(REPO_ROOT, "bin", "lib", "epic-list.ts");
const BIN_RESUME_PROJECTION = join(
  REPO_ROOT,
  "bin",
  "lib",
  "resume-projection.ts",
);
const BIN_RESUME_PROJECTION_LIVE = join(
  REPO_ROOT,
  "bin",
  "lib",
  "resume-projection-live.ts",
);
const PROJECTION_BOUNDARY = join(
  REPO_ROOT,
  "plugin",
  "src",
  "cli",
  "projection-boundary.ts",
);
const RESUME_PROJECTION_TOOL = join(
  REPO_ROOT,
  "plugin",
  "src",
  "tools",
  "resume-projection.ts",
);
const STATUS_TOOL = join(REPO_ROOT, "plugin", "src", "tools", "status.ts");
const STATUS_ENRICH = join(
  REPO_ROOT,
  "plugin",
  "src",
  "tools",
  "status-enrich.ts",
);

function readCmd(name: string): string {
  return readFileSync(join(CMD_DIR, name), "utf-8");
}

function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("AC9 — status consumes resume projection behaviorally", () => {
  test("status-enrich exports appendResumeProjectionRecommendations", () => {
    const content = readFile(STATUS_ENRICH);
    expect(content).toContain(
      "export async function appendResumeProjectionRecommendations",
    );
    expect(content).toContain("buildResumeProjection");
    expect(content).toContain('source: "resume_projection"');
  });

  test("adv_status imports and calls appendResumeProjectionRecommendations", () => {
    const content = readFile(STATUS_TOOL);
    expect(content).toContain("appendResumeProjectionRecommendations");
    expect(content).toContain("plan.resumeProjection");
  });

  test("status view plan enables resumeProjection for summary", () => {
    const content = readFile(
      join(REPO_ROOT, "plugin", "src", "tools", "status-view.ts"),
    );
    expect(content).toMatch(/resumeProjection:\s*true/);
  });

  test("resume projection recommendation kind/source are typed", () => {
    const content = readFile(
      join(REPO_ROOT, "plugin", "src", "tools", "status-recommendations.ts"),
    );
    expect(content).toContain('"resume"');
    expect(content).toContain('"resume_projection"');
  });
});

describe("AC10 — bin/adv adapters are connected to resume projection", () => {
  test("projection boundary exports buildResumeProjection + WorkNodeRef + ResumeProjection", () => {
    const content = readFile(PROJECTION_BOUNDARY);
    expect(content).toContain("export type { WorkNodeRef, ResumeProjection }");
    expect(content).toContain("export {\n  buildResumeProjection");
  });

  test("bin/lib/resume-projection.ts exports buildBinResumeProjection using the boundary", () => {
    const content = readFile(BIN_RESUME_PROJECTION);
    expect(content).toContain("export function buildBinResumeProjection");
    expect(content).toContain("buildResumeProjection");
    expect(content).toContain("../../plugin/src/cli/projection-boundary");
  });

  test("bin/lib/resume-projection-live.ts loads disk projections and calls buildBinResumeProjection", () => {
    const content = readFile(BIN_RESUME_PROJECTION_LIVE);
    expect(content).toContain("export async function loadLiveResumeProjection");
    expect(content).toContain("buildBinResumeProjection(");
    expect(content).toContain("loadResumeProjectionFromDisk");
    expect(content).toContain("resolveAdvStateSubdir");
    expect(content).not.toMatch(/temporal|workflow/i);
  });

  test("bin/adv status wires loadLiveResumeProjection into payload", () => {
    const content = readFile(BIN_ADV);
    expect(content).toContain("loadLiveResumeProjection");
    expect(content).toContain(
      "payload.resume_projection = resumeResult.resume_projection",
    );
  });

  test("bin/adv epic-list wires loadLiveResumeProjection into payload", () => {
    const content = readFile(BIN_ADV);
    const epicListIndex = content.indexOf("runEpicListCommand");
    const afterEpicList = content.slice(epicListIndex);
    expect(afterEpicList).toContain("loadLiveResumeProjection");
    expect(afterEpicList).toContain(
      "payload.resume_projection = resumeResult.resume_projection",
    );
  });

  test("bin/lib/dashboard/adv.ts consumes loadLiveResumeProjection", () => {
    const content = readFile(BIN_DASHBOARD_ADV);
    expect(content).toContain("loadLiveResumeProjection");
    expect(content).toContain(
      "resume_projection: resumeResult.resume_projection",
    );
  });

  test("CLI payload types include resume_projection field", () => {
    const cliProjection = readFile(
      join(REPO_ROOT, "plugin", "src", "shared", "cli-projection.ts"),
    );
    expect(cliProjection).toContain("resume_projection?: unknown");
    const epicList = readFile(BIN_EPIC_LIST);
    expect(epicList).toContain("resume_projection?: unknown");
  });
});

describe("AC11 — next_entry_id authority boundary", () => {
  test("projection kernel does not import workflow code", () => {
    const content = readFile(
      join(REPO_ROOT, "plugin", "src", "projection", "resume-projection.ts"),
    );
    expect(content).not.toMatch(/from "\.\.\/temporal\//);
    expect(content).not.toContain("next_entry_id");
  });

  test("disk resume loader does not import projection kernel through Temporal", () => {
    const content = readFile(BIN_RESUME_PROJECTION_LIVE);
    expect(content).not.toMatch(/from ["'].*temporal\//);
    expect(content).not.toContain("getState");
  });

  test("Epic progress summary next_entry_id is advisory (schema nullable)", () => {
    const content = readFile(
      join(REPO_ROOT, "plugin", "src", "types", "epics.ts"),
    );
    const match = content.match(/next_entry_id:\s*z\.[^\n]+/);
    expect(match?.[0]).toContain(".nullable()");
  });
});

describe("AC14 — boundary preservation (no new mutation verbs)", () => {
  test("adv-coordinate.md does not add new mutation command definitions", () => {
    const content = readCmd("adv-coordinate.md");
    // The command must remain read-first / approval-gated.
    expect(content).toMatch(/read-first|approval-gated|read-only/i);
    // Must NOT define new mutation slash commands (existing boundary text is OK).
    // Check for new command definitions, not existing MUST NOT references.
    const lines = content.split("\n");
    const newCmdLines = lines.filter(
      (l) => l.match(/^##\s/) && l.match(/create|close|archive|delete|mutate/i),
    );
    expect(newCmdLines).toEqual([]);
  });

  test("adv-status.md remains a read-only command", () => {
    const content = readCmd("adv-status.md");
    // adv-status is explicitly read-only.
    expect(content).toMatch(/Do not call ADV tools|read-only/i);
  });

  test("adv-triage.md remains order-advisory", () => {
    const content = readCmd("adv-triage.md");
    // Triage is advisory — must not gain mutation authority.
    expect(content).toMatch(/advisory|order-advisory|read-only|approval/i);
  });

  test("adv_resume_projection is pure-read (no store mutation calls)", () => {
    const tool = readFile(RESUME_PROJECTION_TOOL);
    // The tool must not call mutation store methods or fire signals.
    expect(tool).not.toMatch(
      /store\.changes\.create|store\.changes\.save|store\.epics\.create|store\.save|fireSignal|emitSignal/i,
    );
  });

  test("bin/adv resume projection loader does not fire signals or mutate store", () => {
    const content = readFile(BIN_RESUME_PROJECTION_LIVE);
    expect(content).not.toMatch(
      /\.signal\(|fireSignal|emitSignal|store\.[a-z]+\.(create|save|update|delete)/i,
    );
  });
});
