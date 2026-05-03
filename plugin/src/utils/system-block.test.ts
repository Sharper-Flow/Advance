/**
 * Tests for system-block.ts — section assemblers, internal-call detection,
 * and the assembleSystemBlock orchestrator.
 *
 * Maps to AC1 (single ADV-controlled system entry per turn) and AC8
 * (volatile/stable sentinel placement). Per JC-2 (hardcoded 6 sections)
 * and JC-3 (strict regex internal-call detection).
 */

import { describe, expect, it } from "vitest";

import {
  FALLBACK_CHAIN,
  INTERNAL_CALL_PATTERNS,
  VOLATILE_SENTINEL,
  applyAdvSystemBlock,
  assembleSystemBlock,
  formatDegradedBanner,
  formatSessionHealthBanner,
  isInternalCall,
  type AssembleSystemBlockInput,
  type AssembleSystemBlockState,
} from "./system-block";

const cleanState = (
  overrides: Partial<AssembleSystemBlockState> = {},
): AssembleSystemBlockState => ({
  activeChange: { id: null, objective: null },
  lastCompletedTask: null,
  isWorktree: false,
  lastSessionHealthIssue: null,
  lastProviderID: null,
  ...overrides,
});

const cleanInput = (
  overrides: Partial<AssembleSystemBlockInput> = {},
): AssembleSystemBlockInput => ({
  state: cleanState(),
  currentProviderID: null,
  initError: null,
  storeAvailable: true,
  existingSystem: null,
  ...overrides,
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe("VOLATILE_SENTINEL", () => {
  it("is the documented divider string per AC8 and design F3", () => {
    expect(VOLATILE_SENTINEL).toBe("--- ADV:VOLATILE ---");
  });
});

describe("INTERNAL_CALL_PATTERNS", () => {
  it("includes title-generation pattern (per JC-3)", () => {
    expect(
      INTERNAL_CALL_PATTERNS.some((re) =>
        re.test("Generate a short title for this conversation"),
      ),
    ).toBe(true);
  });

  it("includes summarizer pattern (per JC-3)", () => {
    expect(
      INTERNAL_CALL_PATTERNS.some((re) =>
        re.test("You are a helpful assistant that summarizes content"),
      ),
    ).toBe(true);
  });

  it("does NOT match a normal user prompt", () => {
    expect(
      INTERNAL_CALL_PATTERNS.some((re) =>
        re.test("You are an ADV agent. Use the tools..."),
      ),
    ).toBe(false);
  });
});

describe("FALLBACK_CHAIN", () => {
  it("provides alternatives for openai, anthropic, google", () => {
    expect(FALLBACK_CHAIN.openai).toContain("anthropic");
    expect(FALLBACK_CHAIN.anthropic).toContain("openai");
    expect(FALLBACK_CHAIN.google).toContain("anthropic");
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

  it("returns true when existing system contains a title-gen pattern", () => {
    expect(
      isInternalCall("You are a model. Generate a short title for the input."),
    ).toBe(true);
  });

  it("returns true when existing system contains the summarizer pattern", () => {
    expect(
      isInternalCall("You are a helpful assistant that summarizes content."),
    ).toBe(true);
  });

  it("returns false for an ordinary system prompt", () => {
    expect(
      isInternalCall("You are working on ADV change makeFooBar. Use tools."),
    ).toBe(false);
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
          existingSystem: "Generate a short title for this conversation",
          state: cleanState({ activeChange: { id: "c1", objective: null } }),
        }),
      );
      expect(block).toBeNull();
    });

    it("returns null when existing system matches summarizer pattern", () => {
      const block = assembleSystemBlock(
        cleanInput({
          existingSystem: "You are a helpful assistant that summarizes ...",
          state: cleanState({ activeChange: { id: "c1", objective: null } }),
        }),
      );
      expect(block).toBeNull();
    });

    it("emits content normally when existing system is not an internal call", () => {
      const block = assembleSystemBlock(
        cleanInput({
          existingSystem: "You are a primary agent.",
          state: cleanState({ activeChange: { id: "c1", objective: null } }),
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
      const block = assembleSystemBlock(
        cleanInput({ storeAvailable: false }),
      );
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

  describe("provider-switch section", () => {
    it("emits hint when provider changes between turns", () => {
      const block = assembleSystemBlock(
        cleanInput({
          currentProviderID: "anthropic",
          state: cleanState({ lastProviderID: "openai" }),
        }),
      );
      expect(block).toContain("[ADV:PROVIDER_SWITCH]");
      expect(block).toContain("openai");
      expect(block).toContain("anthropic");
    });

    it("does NOT emit when same provider as last turn", () => {
      const block = assembleSystemBlock(
        cleanInput({
          currentProviderID: "anthropic",
          state: cleanState({ lastProviderID: "anthropic" }),
        }),
      );
      expect(block).toBeNull();
    });

    it("does NOT emit on first turn (no lastProviderID)", () => {
      const block = assembleSystemBlock(
        cleanInput({
          currentProviderID: "anthropic",
          state: cleanState({ lastProviderID: null }),
        }),
      );
      expect(block).toBeNull();
    });

    it("does NOT emit when fallback chain has no alternatives", () => {
      const block = assembleSystemBlock(
        cleanInput({
          currentProviderID: "zai-coding-plan",
          state: cleanState({ lastProviderID: "anthropic" }),
        }),
      );
      expect(block).toBeNull();
    });
  });

  describe("worktree section", () => {
    it("emits worktree marker when in worktree with active change", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            isWorktree: true,
            activeChange: { id: "myChange", objective: null },
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
            activeChange: { id: "c1", objective: null },
          }),
        }),
      );
      expect(block).not.toContain("[ADV:WORKTREE_SESSION]");
      expect(block).toContain("[ADV] Active change: c1");
    });
  });

  describe("active change section", () => {
    it("emits active-change marker with objective truncated to 60 chars", () => {
      const longObjective = "a".repeat(120);
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1", objective: longObjective },
          }),
        }),
      );
      expect(block).toContain("[ADV] Active change: c1");
      expect(block).toContain("Objective:");
      // 60-char truncation
      expect(block).toContain("a".repeat(60));
      expect(block).not.toContain("a".repeat(61));
    });

    it("emits active-change marker without objective when none set", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({ activeChange: { id: "c1", objective: null } }),
        }),
      );
      expect(block).toContain("[ADV] Active change: c1");
      expect(block).not.toContain("Objective:");
    });

    it("does NOT emit when activeChange.id is null", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({ activeChange: { id: null, objective: null } }),
        }),
      );
      expect(block).toBeNull();
    });
  });

  describe("wisdom-prompt section (volatile)", () => {
    it("emits wisdom prompt when lastCompletedTask is set", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1", objective: null },
            lastCompletedTask: { id: "tk-1", title: "Implement foo" },
          }),
        }),
      );
      expect(block).toContain("[ADV:RECORD_WISDOM]");
      expect(block).toContain("tk-1");
      expect(block).toContain("Implement foo");
    });

    it("does NOT emit when lastCompletedTask is null", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1", objective: null },
            lastCompletedTask: null,
          }),
        }),
      );
      expect(block).not.toContain("[ADV:RECORD_WISDOM]");
    });
  });

  describe("sentinel placement (AC8)", () => {
    it("inserts sentinel between stable header and volatile suffix when both exist", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1", objective: null },
            lastCompletedTask: { id: "tk-1", title: "Foo" },
          }),
        }),
      );
      expect(block).not.toBeNull();
      expect(block).toContain(VOLATILE_SENTINEL);
      // Stable comes before sentinel
      const sentinelIdx = block!.indexOf(VOLATILE_SENTINEL);
      const activeIdx = block!.indexOf("[ADV] Active change");
      const wisdomIdx = block!.indexOf("[ADV:RECORD_WISDOM]");
      expect(activeIdx).toBeLessThan(sentinelIdx);
      expect(sentinelIdx).toBeLessThan(wisdomIdx);
    });

    it("does NOT insert sentinel when only stable content exists", () => {
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: "c1", objective: null },
            lastCompletedTask: null,
          }),
        }),
      );
      expect(block).not.toBeNull();
      expect(block).not.toContain(VOLATILE_SENTINEL);
    });

    it("does NOT insert sentinel when only volatile content exists", () => {
      // Volatile-only: completed task without active change is impossible by
      // section logic (wisdom only fires when state.lastCompletedTask !== null,
      // independent of activeChange). Force this scenario directly.
      const block = assembleSystemBlock(
        cleanInput({
          state: cleanState({
            activeChange: { id: null, objective: null },
            lastCompletedTask: { id: "tk-1", title: "Foo" },
          }),
        }),
      );
      // Wisdom prompt fires; no stable content; no sentinel.
      expect(block).not.toBeNull();
      expect(block).toContain("[ADV:RECORD_WISDOM]");
      expect(block).not.toContain(VOLATILE_SENTINEL);
    });
  });

  describe("section ordering (stable header)", () => {
    it("orders sections: degraded → health → providerSwitch → worktree → activeChange", () => {
      const block = assembleSystemBlock(
        cleanInput({
          initError: new Error("boom"),
          currentProviderID: "anthropic",
          state: cleanState({
            lastSessionHealthIssue: {
              kind: "session.error",
              message: "session error",
              detectedAt: 0,
            },
            lastProviderID: "openai",
            isWorktree: true,
            activeChange: { id: "c1", objective: null },
          }),
        }),
      );
      expect(block).not.toBeNull();
      const idx = (s: string) => block!.indexOf(s);
      expect(idx("[ADV:DEGRADED]")).toBeGreaterThanOrEqual(0);
      expect(idx("[ADV:DEGRADED]")).toBeLessThan(idx("[ADV:SESSION_HEALTH]"));
      expect(idx("[ADV:SESSION_HEALTH]")).toBeLessThan(
        idx("[ADV:PROVIDER_SWITCH]"),
      );
      expect(idx("[ADV:PROVIDER_SWITCH]")).toBeLessThan(
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
            activeChange: { id: "c1", objective: null },
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
      state: cleanState({ activeChange: { id: "c1", objective: null } }),
      currentProviderID: null,
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
        state: cleanState({ activeChange: { id: "c1", objective: null } }),
      }),
      // In worktree with active change
      cleanInput({
        state: cleanState({
          isWorktree: true,
          activeChange: { id: "c1", objective: "build feature" },
        }),
      }),
      // Provider switch + active change
      cleanInput({
        currentProviderID: "anthropic",
        state: cleanState({
          activeChange: { id: "c1", objective: null },
          lastProviderID: "openai",
        }),
      }),
      // Active change + just-completed task (volatile suffix)
      cleanInput({
        state: cleanState({
          activeChange: { id: "c1", objective: null },
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
      state: cleanState({ activeChange: { id: "c1", objective: null } }),
      currentProviderID: null,
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
    const output = { system: ["Generate a short title for this conversation"] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState({ activeChange: { id: "c1", objective: null } }),
      currentProviderID: null,
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(false);
    expect(output.system).toEqual([
      "Generate a short title for this conversation",
    ]);
  });

  it("returns emitted: false when no section produces content", () => {
    const output = { system: [] as string[] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState(),
      currentProviderID: null,
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(false);
    expect(output.system).toEqual([]);
  });

  it("flags consumedWisdomPrompt when lastCompletedTask was set", () => {
    const output = { system: [] as string[] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState({
        activeChange: { id: "c1", objective: null },
        lastCompletedTask: { id: "tk-1", title: "Foo" },
      }),
      currentProviderID: null,
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(true);
    expect(result.consumedWisdomPrompt).toBe(true);
    expect(output.system[0]).toContain("[ADV:RECORD_WISDOM]");
  });

  it("does NOT flag consumedWisdomPrompt when no task just completed", () => {
    const output = { system: [] as string[] };
    const result = applyAdvSystemBlock(output, {
      state: cleanState({ activeChange: { id: "c1", objective: null } }),
      currentProviderID: null,
      initError: null,
      storeAvailable: true,
    });
    expect(result.emitted).toBe(true);
    expect(result.consumedWisdomPrompt).toBe(false);
  });

  it("emits degraded banner via single entry when storeAvailable is false", () => {
    const output = { system: [] as string[] };
    applyAdvSystemBlock(output, {
      state: cleanState(),
      currentProviderID: null,
      initError: null,
      storeAvailable: false,
    });
    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toContain("[ADV:DEGRADED]");
  });
});
