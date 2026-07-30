/**
 * Asset tests for the worktree-lifecycle spec law.
 *
 * Locks terminal cleanup reaper requirements and safety guardrails so future
 * cleanup changes stay routed through ADV's structural delete primitive.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../../..");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/worktree-lifecycle/spec.json");
const WORKTREE_INDEX_PATH = join(
  REPO_ROOT,
  "plugin/src/tools/worktree/index.ts",
);

interface SpecRequirement {
  id: string;
  title: string;
  body: string;
  priority: string;
  tags: string[];
  scenarios: Array<{
    id: string;
    title: string;
    given: string[];
    when: string;
    then: string[];
  }>;
}

interface SpecJson {
  name: string;
  requirements: SpecRequirement[];
}

function loadSpec(): SpecJson {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as SpecJson;
}

function requirement(id: string): SpecRequirement {
  const req = loadSpec().requirements.find((item) => item.id === id);
  if (!req) throw new Error(`Missing requirement ${id}`);
  return req;
}

describe("worktree-lifecycle terminal cleanup reaper law", () => {
  test("spec declares terminal cleanup reaper requirements", () => {
    const ids = loadSpec().requirements.map((req) => req.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "rq-terminalCleanupReaper01",
        "rq-terminalCleanupSafety01",
        "rq-terminalCleanupVisibility01",
        "rq-terminalCleanupLifecycle01",
      ]),
    );
  });

  test("terminal reaper requirement names every shared cleanup trigger", () => {
    const req = requirement("rq-terminalCleanupReaper01");
    for (const trigger of [
      "archive",
      "manual cleanup",
      "status/triage",
      "startup",
      "session.deleted",
    ]) {
      expect(req.body).toContain(trigger);
    }
  });

  test("terminal safety requirement keeps advWorktreeDelete as sole deletion authority", () => {
    const req = requirement("rq-terminalCleanupSafety01");
    expect(req.body).toContain("advWorktreeDelete");
    expect(req.body).toContain("MUST NOT run git worktree remove directly");
    expect(req.body).toContain("census.cleanupEligible");
    expect(req.body).toContain("durable ADV state");
  });

  test("visibility requirement separates status aggregates from triage details", () => {
    const req = requirement("rq-terminalCleanupVisibility01");
    expect(req.body).toContain("adv_status");
    expect(req.body).toContain("counts/classes");
    expect(req.body).toContain("adv_worktree_triage");
    expect(req.body).toContain("exact branches, paths, and blockers");
  });

  test("lifecycle requirement mandates one shared cleanup path", () => {
    const req = requirement("rq-terminalCleanupLifecycle01");
    expect(req.body).toContain("one shared cleanup path");
    expect(req.body).toContain("serialized");
    expect(req.body).toContain("idempotent");
  });

  test("implementation has no direct git worktree remove outside gitWorktreeRemove", () => {
    const content = readFileSync(WORKTREE_INDEX_PATH, "utf8");
    const offenders: string[] = [];
    const lines = content.split("\n");

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      if (!line.includes("worktree") || !line.includes("remove")) continue;
      if (!line.includes("execFile") && !line.includes("execFileAsync")) {
        continue;
      }

      const nearby = lines.slice(Math.max(0, index - 8), index + 1).join("\n");
      if (!nearby.includes("function gitWorktreeRemove")) {
        offenders.push(`${index + 1}: ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("worktree detach lifecycle boundary law", () => {
  const REPO_ROOT = resolve(__dirname, "../../..");

  test("detach primitive is not invoked by terminal cleanup, reaper, startup, triage, or migration paths", () => {
    const boundaryFiles = [
      // Terminal cleanup, shared reaper, and bounded startup drain all live in
      // the worktree index module.
      "plugin/src/tools/worktree/index.ts",
      // Triage is read-only advisory and must never trigger detach.
      "plugin/src/tools/worktree/triage.ts",
      // Lazy worktree_auto_managed migration and legacy-change state migration.
      "plugin/src/storage/store-temporal/index.ts",
      // Workflow state migration reducer for worktree markers.
      "plugin/src/temporal/change-state.ts",
    ];

    const offenders: { file: string; lines: number[] }[] = [];
    for (const file of boundaryFiles) {
      const content = readFileSync(join(REPO_ROOT, file), "utf8");
      const matches: number[] = [];
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index] ?? "";
        // Match calls to the detach primitive, not the export/import plumbing.
        if (/\badvWorktreeDetachBatch\s*\(/.test(line)) {
          matches.push(index + 1);
        }
      }
      if (matches.length > 0) offenders.push({ file, lines: matches });
    }

    expect(offenders).toEqual([]);
  });
});
