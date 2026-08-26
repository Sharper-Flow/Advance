/**
 * Tests for system-block.ts — section assemblers, internal-call detection,
 * and the assembleSystemBlock orchestrator.
 *
 * T6 (tk-debf477a4ad4): objective field removed; active-change line has no suffix.
 *
 * Maps to AC1 (single ADV-controlled system entry per turn) and AC8
 * (volatile/stable sentinel placement). Per JC-2 (hardcoded 6 sections)
 * and JC-3 (strict regex internal-call detection).
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VOLATILE_SENTINEL,
  applyAdvSystemBlock,
  assembleSystemBlock,
  formatDegradedBanner,
  formatSessionHealthBanner,
  isInternalCall,
  type AssembleSystemBlockInput,
  type AssembleSystemBlockState,
} from "./system-block";
import type { PluginBundleFreshness } from "../plugin-bundle-manifest";

const cleanState = (
  overrides: Partial<AssembleSystemBlockState> = {},
): AssembleSystemBlockState => ({
  activeChange: { id: null },
  lastCompletedTask: null,
  isWorktree: false,
  lastSessionHealthIssue: null,
  ...overrides,
});

const cleanInput = (
  overrides: Partial<AssembleSystemBlockInput> = {},
): AssembleSystemBlockInput => ({
  state: cleanState(),
  initError: null,
  storeAvailable: true,
  existingSystem: null,
  ...overrides,
});

const INTERNAL_CALL_FIXTURES = {
  title:
    "You are a title generator. You output ONLY a thread title. Nothing else.",
  compaction: "You are a context summarization agent.",
  agent:
    "You are an elite AI agent architect specializing in crafting high-performance agent configurations.",
} as const;

function resolveOpencodeBinary(): string | null {
  const configured = process.env.OPENCODE_BIN;
  if (configured) return existsSync(configured) ? configured : null;

  try {
    const resolved = execFileSync("sh", ["-c", "command -v opencode"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (resolved && existsSync(resolved)) return resolved;
  } catch {
    // Fall through to the known local installation path.
  }

  const fallback = join(homedir(), ".opencode", "bin", "opencode");
  return existsSync(fallback) ? fallback : null;
}

describe("VOLATILE_SENTINEL", () => {
  it("is the documented divider string per AC8 and design F3", () => {
    expect(VOLATILE_SENTINEL).toBe("--- ADV:VOLATILE ---");
  });
});

// ─── isInternalCall ─────────────────────────────────────────────────────────

describe("isInternalCall", () => {
  it("returns false for null existing system", () => {
    expect(isInternalCall(null)).toBe(false);
  });

  it("returns false for empty existing system", () => {
    expect(isInternalCall("")).toBe(false);
  });

  it.each(Object.values(INTERNAL_CALL_FIXTURES))(
    "returns true for a real OpenCode internal prompt fixture",
    (fixture) => {
      expect(isInternalCall(fixture)).toBe(true);
    },
  );

  it("returns false for an ordinary system prompt", () => {
    expect(
      isInternalCall("You are working on ADV change makeFooBar. Use tools."),
    ).toBe(false);
  });

  // CI environments without OpenCode skip this local binary calibration check.
  it("matches each fixture in the installed OpenCode binary", (ctx) => {
    const bin = resolveOpencodeBinary();
    if (!bin) {
      ctx.skip();
      return;
    }

    for (const fixture of Object.values(INTERNAL_CALL_FIXTURES)) {
      try {
        execFileSync("grep", ["-aqF", fixture, bin]);
      } catch (error) {
        throw new Error(
          `OpenCode binary is missing internal prompt fixture: ${fixture}`,
          { cause: error },
        );
      }
    }
  });
});

// ─── Formatters ─────────────────────────────────────────────────────────────

describe("formatDegradedBanner", () => {
  it("includes [ADV:DEGRADED] marker and stage text for factory failures", () => {
    const banner = formatDegradedBanner(new Error("boom"), "factory");
    expect(banner).toContain("[ADV:DEGRADED]");
    expect(banner).toContain(
      "Plugin factory threw before initialization completed",
    );
    expect(banner).toContain("Reason: boom");
  });

  it("uses init stage text for store init failures", () => {
    const banner = formatDegradedBanner(new Error("db unavailable"), "init");
    expect(banner).toContain("Plugin store initialization failed");
    expect(banner).toContain("db unavailable");
  });
});

describe("formatSessionHealthBanner", () => {
  it("surfaces session.error issues with change-id hint", () => {
    const banner = formatSessionHealthBanner(
      {
        kind: "session.error",
        message: "session crashed",
        detectedAt: 0,
      },
      "myChange",
    );
    expect(banner).toContain("[ADV:SESSION_HEALTH]");
    expect(banner).toContain("session.error");
    expect(banner).toContain("session crashed");
    expect(banner).toContain("myChange");
  });

  it("uses generic resume hint when changeId is null", () => {
    const banner = formatSessionHealthBanner(
      {
        kind: "message-history",
        message: "compacted prompt",
        detectedAt: 0,
      },
      null,
    );
    expect(banner).toContain("Open a fresh OpenCode session");
    expect(banner).not.toContain("Known active change");
  });
});

// ─── assembleSystemBlock — orchestrator and section behavior ────────────────

describe("assembleSystemBlock", () => {
  describe("internal-call short-circuit", () => {
    it("returns null when existing system matches title-gen pattern", () => {
      const block = assembleSystemBlock(
        cleanInput({
          existingSystem: INTERNAL_CALL_FIXTURES.title,
          state: cleanState({ activeChange: { id: "c1" } }),
        }),
      );
      expect(block).toBeNull();
    });

    it("returns null when existing system matches summarizer pattern", () => {
      const block = assembleSystemBlock(
        cleanInput({
          existingSystem: INTERNAL_CALL_FIXTURES.compaction,
          state: cleanState({ activeChange: { id: "c1" } }),
        }),
      );
      expect(block).toBeNull();
    });

    it("returns null when existing system matches agent-generation pattern", () => {
      const block = assembleSystemBlock(
        cleanInput({
          existingSystem: INTERNAL_CALL_FIXTURES.agent,
          state: cleanState({ activeChange: { id: "c1" } }),
        }),
      );
      expect(block).toBeNull();
    });

    it("emits content normally when existing system is not an internal call", () => {
      const block = assembleSystemBlock(
        cleanInput({
          existingSystem: "You are a primary agent.",
          state: cleanState({ activeChange: { id: "c1" } }),
        }),
      );
      expect(block).not.toBeNull();
      expect(block).toContain("[ADV] Active change: c1");
    });
  });

  describe("empty-state behavior", () => {
    it("returns null when no section produces content", () => {
      const block = assembleSystemBlock(cleanInput());
      expect(block).toBeNull();
    });
  });

  describe("degraded section", () => {
    it("emits degraded banner when initError is set", () => {
      const block = assembleSystemBlock(
        cleanInput({ initError: new Error("init failed") }),
      );
      expect(block).toContain("[ADV:DEGRADED]");
      expect(block).toContain("init failed");
    });

    it("emits degraded banner when storeAvailable is false (no initError)", () => {
      const block = assembleSystemBlock(cleanInput({ storeAvailable: false }));
      expect(block).toContain("[ADV:DEGRADED]");
      expect(block).toContain("Plugin store unavailable");
    });
  });

  describe("health section", () => {
    it("emits session-health banner when lastSessionHealthIssue is set", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            lastSessionHealthIssue: {
              kind: "session.error",
              message: "boom",
              detectedAt: 0,
            },
          }),
        }),
      );
      expect(block).toContain("[ADV:SESSION_HEALTH]");
      expect(block).toContain("boom");
    });
  });

  describe("worktree section", () => {
    it("emits worktree marker when in worktree with active change", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            isWorktree: true,
            activeChange: { id: "myChange" },
          }),
        }),
      );
      expect(block).toContain("[ADV:WORKTREE_SESSION]");
      expect(block).toContain("myChange");
    });

    it("does NOT emit worktree marker without active change", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({ isWorktree: true }),
        }),
      );
      expect(block).toBeNull();
    });

    it("does NOT emit worktree marker when not in worktree", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            isWorktree: false,
            activeChange: { id: "c1" },
          }),
        }),
      );
      expect(block).not.toContain("[ADV:WORKTREE_SESSION]");
      expect(block).toContain("[ADV] Active change: c1");
    });
  });

  describe("active change section", () => {
    it("emits active-change marker with no objective suffix", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1" },
          }),
        }),
      );
      expect(block).toContain("[ADV] Active change: c1");
      expect(block).not.toContain("Objective:");
    });

    it("does NOT emit when activeChange.id is null", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({ activeChange: { id: null } }),
        }),
      );
      expect(block).toBeNull();
    });
  });

  describe("wisdom-prompt section (volatile, rq-wisdomAutoSurfacing01 / AC8)", () => {
    it("emits draft-aware prompt when pendingWisdomDraftTasks is non-empty", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1" },
            pendingWisdomDraftTasks: [
              { id: "tk-1", title: "Implement foo", count: 1 },
            ],
          }),
        }),
      );
      expect(block).toContain("[ADV:WISDOM_DRAFTS]");
      expect(block).toContain("tk-1");
      expect(block).toContain("Implement foo");
      expect(block).toContain("1 draft(s) pending review");
      expect(block).toContain("adv_wisdom_add from_draft_id");
      // Retired sentinel must NOT appear anymore.
      expect(block).not.toContain("[ADV:RECORD_WISDOM]");
    });

    it("aggregates drafts across multiple tasks", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1" },
            pendingWisdomDraftTasks: [
              { id: "tk-a", title: "Task A", count: 2 },
              { id: "tk-b", title: "Task B", count: 3 },
            ],
          }),
        }),
      );
      expect(block).toContain(
        "5 wisdom draft(s) pending review across 2 task(s)",
      );
      expect(block).toContain("tk-a");
      expect(block).toContain("tk-b");
    });

    it("does NOT emit when pendingWisdomDraftTasks is empty", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1" },
            pendingWisdomDraftTasks: [],
          }),
        }),
      );
      expect(block).not.toContain("[ADV:WISDOM_DRAFTS]");
    });

    it("does NOT emit when pendingWisdomDraftTasks is undefined (legacy callers)", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1" },
          }),
        }),
      );
      expect(block).not.toContain("[ADV:WISDOM_DRAFTS]");
    });

    it("retired [ADV:RECORD_WISDOM]: lastCompletedTask no longer drives the nudge", () => {
      // AC8 retires the old prompt. Even when lastCompletedTask is set,
      // no wisdom-section output fires unless drafts are pending.
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1" },
            lastCompletedTask: { id: "tk-1", title: "Completed" },
          }),
        }),
      );
      expect(block).not.toContain("[ADV:RECORD_WISDOM]");
      expect(block).not.toContain("[ADV:WISDOM_DRAFTS]");
    });
  });

  describe("sentinel placement (AC8)", () => {
    it("inserts sentinel between stable header and volatile suffix when both exist", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1" },
            pendingWisdomDraftTasks: [{ id: "tk-1", title: "Foo", count: 1 }],
          }),
        }),
      );
      expect(block).not.toBeNull();
      expect(block).toContain(VOLATILE_SENTINEL);
      // Stable comes before sentinel
      const sentinelIdx = block!.indexOf(VOLATILE_SENTINEL);
      const activeIdx = block!.indexOf("[ADV] Active change");
      const wisdomIdx = block!.indexOf("[ADV:WISDOM_DRAFTS]");
      expect(activeIdx).toBeLessThan(sentinelIdx);
      expect(sentinelIdx).toBeLessThan(wisdomIdx);
    });

    it("does NOT insert sentinel when only stable content exists", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1" },
            pendingWisdomDraftTasks: [],
          }),
        }),
      );
      expect(block).not.toBeNull();
      expect(block).not.toContain(VOLATILE_SENTINEL);
    });

    it("does NOT insert sentinel when only volatile content exists", () => {
      // Volatile-only: pending drafts without active change. Force this
      // scenario directly.
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: null },
            pendingWisdomDraftTasks: [{ id: "tk-1", title: "Foo", count: 1 }],
          }),
        }),
      );
      // Wisdom prompt fires; no stable content; no sentinel.
      expect(block).not.toBeNull();
      expect(block).toContain("[ADV:WISDOM_DRAFTS]");
      expect(block).not.toContain(VOLATILE_SENTINEL);
    });
  });

  describe("section ordering (stable header)", () => {
    it("orders sections: degraded → health → worktree → activeChange", () => {
      const block = assembleSystemBlock(
        cleanInput({
          initError: new Error("boom"),
          state: cleanState({
            lastSessionHealthIssue: {
              kind: "session.error",
              message: "session error",
              detectedAt: 0,
            },
            isWorktree: true,
            activeChange: { id: "c1" },
          }),
        }),
      );
      expect(block).not.toBeNull();
      const idx = (s: string) => block!.indexOf(s);
      expect(idx("[ADV:DEGRADED]")).toBeGreaterThanOrEqual(0);
      expect(idx("[ADV:DEGRADED]")).toBeLessThan(idx("[ADV:SESSION_HEALTH]"));
      expect(idx("[ADV:SESSION_HEALTH]")).toBeLessThan(
        idx("[ADV:WORKTREE_SESSION]"),
      );
      expect(idx("[ADV:WORKTREE_SESSION]")).toBeLessThan(
        idx("[ADV] Active change"),
      );
    });
  });

  describe("section joining", () => {
    it("joins stable sections with double newline", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            isWorktree: true,
            activeChange: { id: "c1" },
          }),
        }),
      );
      // The two stable sections should be separated by exactly one blank line.
      expect(block).toMatch(
        /\[ADV:WORKTREE_SESSION\][\s\S]*\n\n\[ADV\] Active change/,
      );
    });
  });
});

// ─── applyAdvSystemBlock — single-entry emission (AC1) ──────────────────────

describe("applyAdvSystemBlock", () => {
  it("appends a single entry when output.system was empty (AC1)", () => {
    const output = { system: [] as string[] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState({ activeChange: { id: "c1" } }),
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(true);
    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toContain("[ADV] Active change: c1");
  });

  it("never grows output.system past one entry across all branches (AC1)", () => {
    const branches: AssembleSystemBlockInput[] = [
      // Degraded
      cleanInput({ initError: new Error("init failed") }),
      // Healthy with active change
      cleanInput({
        state: cleanState({ activeChange: { id: "c1" } }),
      }),
      // In worktree with active change
      cleanInput({
        state: cleanState({
          isWorktree: true,
          activeChange: { id: "c1" },
        }),
      }),
      // Active change + just-completed task (volatile suffix)
      cleanInput({
        state: cleanState({
          activeChange: { id: "c1" },
          lastCompletedTask: { id: "tk-1", title: "Implement foo" },
        }),
      }),
    ];

    for (const input of branches) {
      const output = { system: [] as string[] };
      applyAdvSystemBlock(output, input);
      expect(output.system).toHaveLength(1);
    }
  });

  it("preserves an existing system[0] entry by prefixing the ADV block", () => {
    const output = { system: ["You are an agent."] };
    applyAdvSystemBlock(output, {
      state: cleanState({ activeChange: { id: "c1" } }),
      initError: null,
      storeAvailable: true,
    });
    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toContain("You are an agent.");
    expect(output.system[0]).toContain("[ADV] Active change: c1");
    expect(output.system[0].indexOf("You are an agent.")).toBeLessThan(
      output.system[0].indexOf("[ADV] Active change"),
    );
  });

  it("returns emitted: false and leaves system untouched on internal call", () => {
    const output = { system: [INTERNAL_CALL_FIXTURES.title] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState({ activeChange: { id: "c1" } }),
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(false);
    expect(output.system).toEqual([INTERNAL_CALL_FIXTURES.title]);
  });

  it("returns emitted: false when no section produces content", () => {
    const output = { system: [] as string[] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState(),
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(false);
    expect(output.system).toEqual([]);
  });

  it("flags consumedWisdomPrompt when lastCompletedTask was set (legacy tracking)", () => {
    // AC8 retired the lastCompletedTask-driven nudge but the
    // consumedWisdomPrompt flag still tracks legacy state so callers can
    // clear lastCompletedTask after emission. The flag fires even though
    // no [ADV:RECORD_WISDOM] section emits anymore.
    const output = { system: [] as string[] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState({
        activeChange: { id: "c1" },
        lastCompletedTask: { id: "tk-1", title: "Foo" },
      }),
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(true);
    expect(result.consumedWisdomPrompt).toBe(true);
    // Retired prompt must NOT appear
    expect(output.system[0]).not.toContain("[ADV:RECORD_WISDOM]");
  });

  it("flags consumedWisdomPrompt when pendingWisdomDraftTasks is non-empty (rq-wisdomAutoSurfacing01)", () => {
    const output = { system: [] as string[] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState({
        activeChange: { id: "c1" },
        pendingWisdomDraftTasks: [{ id: "tk-1", title: "Foo", count: 2 }],
      }),
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(true);
    expect(result.consumedWisdomPrompt).toBe(true);
    expect(output.system[0]).toContain("[ADV:WISDOM_DRAFTS]");
  });

  it("does NOT flag consumedWisdomPrompt when no task just completed", () => {
    const output = { system: [] as string[] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState({ activeChange: { id: "c1" } }),
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(true);
    expect(result.consumedWisdomPrompt).toBe(false);
  });

  // ─── session-health banner one-shot (fixSessionHealthBannerNoise) ─────────
  describe("session-health banner one-shot", () => {
    it("AC2: fresh message-history issue emits the banner and flags surfacedMessageHistoryHealth", () => {
      const output = { system: [] as string[] };
      const result = applyAdvSystemBlock(output, {
        state: cleanState({
          lastSessionHealthIssue: {
            kind: "message-history",
            message: "compacted 33 oversized diff(s)",
            detectedAt: 0,
          },
        }),
        initError: null,
        storeAvailable: true,
      });
      expect(result.emitted).toBe(true);
      expect(output.system[0]).toContain("[ADV:SESSION_HEALTH]");
      expect(output.system[0]).toContain("message-history");
      expect(result.surfacedMessageHistoryHealth).toBe(true);
    });

    it("AC1: already-surfaced message-history issue does NOT re-emit the banner", () => {
      const output = { system: [] as string[] };
      const result = applyAdvSystemBlock(output, {
        state: cleanState({
          lastSessionHealthIssue: {
            kind: "message-history",
            message: "compacted 33 oversized diff(s)",
            detectedAt: 0,
            surfaced: true,
          },
        }),
        initError: null,
        storeAvailable: true,
      });
      expect(output.system[0] ?? "").not.toContain("[ADV:SESSION_HEALTH]");
      expect(result.surfacedMessageHistoryHealth).toBe(false);
    });

    it("AC1: surfaced message-history is suppressed but other sections still emit", () => {
      const output = { system: [] as string[] };
      applyAdvSystemBlock(output, {
        state: cleanState({
          activeChange: { id: "c1" },
          lastSessionHealthIssue: {
            kind: "message-history",
            message: "compacted diffs",
            detectedAt: 0,
            surfaced: true,
          },
        }),
        initError: null,
        storeAvailable: true,
      });
      expect(output.system[0]).toContain("[ADV] Active change: c1");
      expect(output.system[0]).not.toContain("[ADV:SESSION_HEALTH]");
    });

    it("AC3: session.error banner is sticky — emits even when surfaced=true", () => {
      const output = { system: [] as string[] };
      const result = applyAdvSystemBlock(output, {
        state: cleanState({
          lastSessionHealthIssue: {
            kind: "session.error",
            message: "session crashed",
            detectedAt: 0,
            surfaced: true,
          },
        }),
        initError: null,
        storeAvailable: true,
      });
      expect(output.system[0]).toContain("[ADV:SESSION_HEALTH]");
      expect(output.system[0]).toContain("session.error");
      // session.error never counts as message-history surfacing
      expect(result.surfacedMessageHistoryHealth).toBe(false);
    });

    it("AC4: absent surfaced flag behaves as unsurfaced (emits + flags)", () => {
      const output = { system: [] as string[] };
      const result = applyAdvSystemBlock(output, {
        state: cleanState({
          lastSessionHealthIssue: {
            kind: "message-history",
            message: "compacted diffs",
            detectedAt: 0,
          },
        }),
        initError: null,
        storeAvailable: true,
      });
      expect(output.system[0]).toContain("[ADV:SESSION_HEALTH]");
      expect(result.surfacedMessageHistoryHealth).toBe(true);
    });
  });

  it("emits degraded banner via single entry when storeAvailable is false", () => {
    const output = { system: [] as string[] };
    applyAdvSystemBlock(output, {
      state: cleanState(),
      initError: null,
      storeAvailable: false,
    });
    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toContain("[ADV:DEGRADED]");
  });
});

// ─── Removed Trunk Guard Section ─────────────────────────────────────────

describe("trunkGuardSection", () => {
  it("does not emit trunk guard when not in worktree with active change", () => {
    const result = assembleSystemBlock(
      cleanInput({
        state: cleanState({
          isWorktree: false,
          activeChange: { id: "myChange" },
        }),
      }),
    );
    expect(result).not.toBeNull();
    expect(result).not.toContain("[ADV:TRUNK_GUARD]");
    expect(result).toContain("myChange");
  });

  it("does not fire when in worktree", () => {
    const result = assembleSystemBlock(
      cleanInput({
        state: cleanState({
          isWorktree: true,
          activeChange: { id: "myChange" },
        }),
      }),
    );
    expect(result).not.toContain("[ADV:TRUNK_GUARD]");
  });

  it("does not fire when no active change", () => {
    const result = assembleSystemBlock(
      cleanInput({
        state: cleanState({
          isWorktree: false,
          activeChange: { id: null },
        }),
      }),
    );
    // No active change → no sections fire → null result (or no trunk guard)
    if (result === null) {
      expect(result).toBeNull();
    } else {
      expect(result).not.toContain("[ADV:TRUNK_GUARD]");
    }
  });

  it("does not include worktree routing instruction", () => {
    const result = assembleSystemBlock(
      cleanInput({
        state: cleanState({
          isWorktree: false,
          activeChange: { id: "myChange" },
        }),
      }),
    );
    expect(result).not.toContain("adv_worktree_create");
    expect(result).not.toContain("worktree-first");
  });

  it("does not include emergency override guidance", () => {
    const result = assembleSystemBlock(
      cleanInput({
        state: cleanState({
          isWorktree: false,
          activeChange: { id: "myChange" },
        }),
      }),
    );
    expect(result).not.toContain("emergency");
    expect(result).not.toContain("audit");
  });

  it("emits only active change section when no other stable sections apply", () => {
    const result = assembleSystemBlock(
      cleanInput({
        state: cleanState({
          isWorktree: false,
          activeChange: { id: "myChange" },
        }),
      }),
    );
    expect(result).not.toBeNull();
    expect(result).toBe("[ADV] Active change: myChange");
  });
});

// ─── Plugin Bundle Stale Section ───────────────────────────────────────────

const staleFreshness: PluginBundleFreshness = {
  state: "stale",
  loadedGeneration: "loaded-gen",
  deployedGeneration: "deployed-gen",
  deployedIndexSha256: "index-sha",
  reason: "generation_mismatch",
  recovery: "Restart OpenCode to load the current plugin bundle.",
  advisoryType: "PLUGIN_BUNDLE_STALE",
};

describe("plugin bundle stale section", () => {
  it("emits [ADV:PLUGIN_BUNDLE_STALE] banner when state is stale", () => {
    const block = assembleSystemBlock(
      cleanInput({ pluginBundleFreshness: staleFreshness }),
    );
    expect(block).not.toBeNull();
    expect(block).toContain("[ADV:PLUGIN_BUNDLE_STALE]");
    expect(block).toContain("loaded-gen");
    expect(block).toContain("deployed-gen");
    expect(block).toContain("Restart OpenCode");
  });

  it("does NOT emit when state is current", () => {
    const block = assembleSystemBlock(
      cleanInput({
        pluginBundleFreshness: {
          state: "current",
          loadedGeneration: "gen",
          deployedGeneration: "gen",
          deployedIndexSha256: "sha",
          reason: null,
          recovery: null,
        },
      }),
    );
    expect(block).toBeNull();
  });

  it("does NOT emit when state is unknown", () => {
    const block = assembleSystemBlock(
      cleanInput({
        pluginBundleFreshness: {
          state: "unknown",
          loadedGeneration: null,
          deployedGeneration: null,
          deployedIndexSha256: null,
          reason: "missing_manifest",
          recovery: "Manifest state is unreadable.",
        },
      }),
    );
    expect(block).toBeNull();
  });

  it("preserves session-health state independently", () => {
    const block = assembleSystemBlock(
      cleanInput({
        state: cleanState({
          lastSessionHealthIssue: {
            kind: "session.error",
            message: "session crashed",
            detectedAt: 0,
          },
        }),
        pluginBundleFreshness: staleFreshness,
      }),
    );
    expect(block).not.toBeNull();
    expect(block).toContain("[ADV:SESSION_HEALTH]");
    expect(block).toContain("[ADV:PLUGIN_BUNDLE_STALE]");
    const healthIdx = block!.indexOf("[ADV:SESSION_HEALTH]");
    const staleIdx = block!.indexOf("[ADV:PLUGIN_BUNDLE_STALE]");
    expect(healthIdx).toBeGreaterThanOrEqual(0);
    expect(staleIdx).toBeGreaterThan(healthIdx);
  });

  it("emits PLUGIN_BUNDLE_STALE only once per transform", () => {
    const block = assembleSystemBlock(
      cleanInput({ pluginBundleFreshness: staleFreshness }),
    );
    expect(block).not.toBeNull();
    const matches = block!.match(/\[ADV:PLUGIN_BUNDLE_STALE\]/g);
    expect(matches).toHaveLength(1);
  });
});
