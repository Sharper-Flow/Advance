/**
 * ADV_INSTRUCTIONS.md Asset Tests (T32 — Phase 4 framing reconciliation)
 *
 * Verifies that ADV_INSTRUCTIONS.md reflects the multi-session-first model:
 *   - § Concurrent Session Hazard absent (deleted)
 *   - § Multi-Session Coordination present
 *   - [ADV:PEER_SESSIONS] in canonical status-markers table
 *   - No "Concurrent OpenCode sessions detected" / "git race condition" /
 *     "Limit to one git-mutating session" wording remains
 *
 * Citations: rq-multiSessionFraming01.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

describe("ADV_INSTRUCTIONS.md framing (T32 — multi-session-first)", () => {
  const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

  describe("forbidden phrasing (deleted by Phase 4)", () => {
    test("no '§ Concurrent Session Hazard' header", () => {
      expect(content).not.toMatch(/^### Concurrent Session Hazard\s*$/m);
    });

    test("no 'Concurrent OpenCode sessions detected' wording", () => {
      expect(content).not.toMatch(/Concurrent OpenCode sessions detected/);
    });

    test("no 'git race condition' wording", () => {
      expect(content).not.toMatch(/git race condition/);
    });

    test("no 'Limit to one git-mutating session' rule", () => {
      expect(content).not.toMatch(/Limit to one git-mutating session/);
    });
  });

  describe("required additions (Phase 4 reconciliation)", () => {
    test("§ Multi-Session Coordination header present", () => {
      expect(content).toMatch(/^### Multi-Session Coordination\s*$/m);
    });

    test("[ADV:PEER_SESSIONS] row present in status-markers table", () => {
      expect(content).toMatch(
        /\|\s*`\[ADV:PEER_SESSIONS\]`\s*\|.*peer sessions detected/i,
      );
    });

    test("Multi-Session Coordination cites Temporal serialization", () => {
      // Section must explain WHY multi-session is safe (Temporal + per-worktree
      // git isolation), otherwise the framing is incomplete.
      const idx = content.indexOf("### Multi-Session Coordination");
      expect(idx).toBeGreaterThan(-1);
      const section = content.slice(idx, idx + 2000);
      expect(section).toMatch(/Temporal/);
      expect(section).toMatch(/per-worktree git isolation/);
    });

    test("Multi-Session Coordination references peer-session tools", () => {
      const idx = content.indexOf("### Multi-Session Coordination");
      const section = content.slice(idx, idx + 2000);
      expect(section).toMatch(/adv_status/);
      expect(section).toMatch(/adv_session_list/);
      expect(section).toMatch(/adv_session_show/);
      expect(section).toMatch(/adv_temporal_diagnose/);
    });
  });
});

describe("ADV_INSTRUCTIONS.md drift repairs (repairDriftContradictions T2)", () => {
  const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

  const section = (start: string, end: string): string => {
    const startIdx = content.indexOf(start);
    expect(startIdx, `Missing section start: ${start}`).toBeGreaterThan(-1);
    const endIdx = content.indexOf(end, startIdx + start.length);
    expect(endIdx, `Missing section end: ${end}`).toBeGreaterThan(startIdx);
    return content.slice(startIdx, endIdx);
  };

  test("command boundaries use canonical 7-gate ids, not retired phase labels", () => {
    const boundaries = section("## Command Boundaries", "## Status Markers");

    expect(boundaries).not.toMatch(/\|\s*research\s*\|.*\|\s*research\s*\|/);
    expect(boundaries).not.toMatch(/\|\s*prep\s*\|.*\|\s*prep\s*\|/);
    expect(boundaries).not.toMatch(/\|\s*apply\s*\|.*\|\s*implementation\s*\|/);

    expect(boundaries).toMatch(/\|\s*discover\s*\|.*\|\s*discovery\s*\|/);
    expect(boundaries).toMatch(/\|\s*design\s*\|.*\|\s*design\s*\|/);
    expect(boundaries).toMatch(/\|\s*prep\s*\|.*\|\s*planning\s*\|/);
    expect(boundaries).toMatch(/\|\s*apply\s*\|.*\|\s*execution\s*\|/);
    expect(boundaries).toMatch(/\|\s*review\s*\|.*\|\s*acceptance\s*\|/);
    expect(boundaries).toMatch(/\|\s*archive\s*\|.*\|\s*release\s*\|/);
  });

  test("phase goals table includes lifecycle commands added to manifest phaseGoal", () => {
    const phaseGoals = section("## Phase Goals", "## Commands");

    expect(phaseGoals).toMatch(/`\/adv-discover`/);
    expect(phaseGoals).toMatch(/current-state evidence/);
    expect(phaseGoals).toMatch(/`\/adv-design`/);
    expect(phaseGoals).toMatch(/validated implementation strategy/);
    expect(phaseGoals).toMatch(/`\/adv-reflect`/);
    expect(phaseGoals).toMatch(/durable reflection artifact/);
    expect(phaseGoals).toMatch(/`\/adv-atc`/);
    expect(phaseGoals).toMatch(
      /deferring HITL.*GitHub|preserving all safety boundaries/,
    );
  });

  test("target_path matrix does not contradict adv_status support", () => {
    const crossProject = section(
      "#### `target_path` matrix (which tools support cross-project)",
      "### Cancellation Policy",
    );

    expect(crossProject).toMatch(/`snapshot-ok`:[^\n]*`adv_status`/);
    expect(crossProject).not.toMatch(/planned to add/);
    expect(crossProject).not.toMatch(
      /Tools without `target_path`[^\n]*`adv_status`/,
    );
  });

  test("worktree protocol uses canonical tool names and hard-block fallback", () => {
    const worktree = section("## Worktree Integration", "## When to Use ADV");

    expect(worktree).toMatch(/`adv_worktree_create`/);
    expect(worktree).toMatch(/`adv_worktree_delete`/);
    expect(worktree).toMatch(/hard block with error/i);
    expect(worktree).not.toMatch(/`worktree_create`/);
    expect(worktree).not.toMatch(/`worktree_delete`/);
    expect(worktree).not.toMatch(/proceeding in-place/i);
  });

  test("skill-created marker has agent origin only", () => {
    const markers = section("## Status Markers", "### Context Snapshot");

    expect(markers).toMatch(/`\[ADV:SKILL_CREATED\]`/);
    expect(markers).not.toMatch(/System-emitted:[^\n]*\[ADV:SKILL_CREATED\]/);
  });

  test("context snapshot docs describe include.snapshot exception", () => {
    const snapshot = section("### Context Snapshot", "## Critical Protocols");
    const freshness = section("### Context Freshness", "### TDD Protocol");

    expect(snapshot).not.toMatch(/no `_contextSnapshot` field/);
    expect(snapshot).not.toMatch(/mutation tools only/);
    expect(freshness).toMatch(/include\.snapshot: true/);
  });

  test("reflection trigger wording is phase-number agnostic", () => {
    const reflection = section(
      "### Reflection Protocol",
      "### Task Checkpoint Commits",
    );

    expect(reflection).toMatch(/archive/i);
    expect(reflection).not.toMatch(/Phase 8/);
  });

  test("forbidden ADV state file list covers all external mutable state files", () => {
    const stateAccess = section(
      "### ADV State Access",
      "### Multi-Session Coordination",
    );

    for (const filename of [
      "change.json",
      "proposal.md",
      "problem-statement.md",
      "agenda.jsonl",
      "wisdom.jsonl",
      "conformance.json",
    ]) {
      expect(stateAccess).toContain(filename);
    }
  });

  test("sub-agent budget says the cap is total across batches", () => {
    const subagents = section(
      "### Orchestration Token-Budget Policy",
      "### Phase Summary Pattern",
    );

    expect(subagents).toMatch(
      /Cap total sub-agents per command at 6 across batches/,
    );
  });
});

describe("ADV_INSTRUCTIONS.md medium cleanup (repairDriftContradictions T3)", () => {
  const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

  test("human checkpoint list is canonical, with later references pointing back", () => {
    expect(content).toMatch(/### Human Checkpoints \(Pause Required\)/);
    expect(content).not.toMatch(/First seven checkpoints/);
    expect(content).not.toMatch(/The seven named human checkpoints/);
    expect(content).toMatch(/human checkpoints listed above/i);
  });

  test("stale annotations and labels are removed from live ADV instructions", () => {
    expect(content).not.toMatch(/\(P1\.12\)/);
    expect(content).not.toMatch(/added 2026-05-02/);
    expect(content).not.toMatch(/Trust-domain note/);
  });

  test("When to Use ADV avoids Skip for prefix collision", () => {
    expect(content).not.toMatch(/\*\*Skip for:\*\*/);
    expect(content).toMatch(/\*\*Use lighter workflows for:\*\*/);
  });
});

describe("ADV_INSTRUCTIONS.md adv-designer roster", () => {
  const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

  test("adv-designer is listed in the bundled-global spawnable roster", () => {
    expect(content).toContain("adv-designer");
    // Bundled-global enumeration row must include adv-designer alongside
    // adv-engineer / adv-reviewer / adv-researcher.
    expect(content).toMatch(
      /bundled global[^\n]*adv-researcher[^\n]*adv-engineer[^\n]*adv-reviewer[^\n]*adv-designer|bundled global[^\n]*adv-designer/i,
    );
  });

  test("adv-designer is described as apply-phase write-only frontend specialist", () => {
    const idx = content.indexOf("adv-designer");
    expect(idx).toBeGreaterThan(-1);
    // Roster entry must cover apply-phase + frontend ownership + report shape.
    const lowered = content.toLowerCase();
    expect(lowered).toMatch(/apply-phase frontend|frontend\/component/);
    expect(lowered).toContain("designer_report");
  });

  test("review/harden ownership note preserves adv-reviewer", () => {
    // Ensure the roster + selection prose still pins adv-reviewer as the
    // review/harden owner and does not reassign that to adv-designer.
    expect(content).toMatch(
      /adv-reviewer[^.\n]*(review|harden|acceptance)/i,
    );
    expect(content).not.toMatch(
      /adv-designer[^.\n]*owns.*(review|harden)/i,
    );
  });
});

describe("ADV_INSTRUCTIONS.md compression guards", () => {
  const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

  test("declares exact contract tokens that compression must preserve", () => {
    expect(content).toMatch(/^### Instruction Compression Guard$/m);
    expect(content).toContain("Exact contract tokens stay unchanged");

    for (const token of [
      "tool names",
      "gate IDs",
      "slash commands",
      "enum values",
      "quoted errors",
      "`MUST`",
      "`NEVER`",
      "approval checkpoints",
      "cancellation approval",
      "archive sign-off",
    ]) {
      expect(content).toContain(token);
    }
  });
});
