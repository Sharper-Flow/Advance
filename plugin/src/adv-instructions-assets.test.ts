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
