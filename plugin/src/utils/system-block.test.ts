/**
 * Tests for system-block.ts — section assemblers, internal-call detection,
 * and the assembleSystemBlock orchestrator.
 *
 * Maps to AC1 (single ADV-controlled system entry per turn) and AC8
 * (volatile/stable sentinel placement). Per JC-2 (hardcoded 6 sections)
 * and JC-3 (strict regex internal-call detection).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FALLBACK_CHAIN,
  INTERNAL_CALL_PATTERNS,
  PROVIDER_HINTS,
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

const GPT_REQUIREMENTS_RIGOR_DIRECTIVES = [
  "Requirements artifacts (problem statements, clarifying questions, acceptance criteria, agreements) are exempt from brevity/compression when detail is required; keep them complete, specific, and testable, not verbose.",
  "Acceptance criteria must be pass/fail, name an observable signal, and be bounded by a number, threshold, or explicit state. Rewrite subjective terms like fast/easy/robust/clean before presenting.",
  'During idea/problem/proposal/discovery, ask narrow clarifying questions when missing information would materially change outcome, acceptance boundary, or risk. This is required work, not "shall I continue?", so no-pause/auto-continue rules do not suppress it.',
] as const;

const normalizeTrailingNewline = (content: string): string =>
  content.replace(/\n$/, "");

const readProviderHintSource = (provider: string): string =>
  normalizeTrailingNewline(
    readFileSync(
      new URL(
        `../../../.opencode/agent-parts/providers/${provider}.md`,
        import.meta.url,
      ),
      "utf8",
    ),
  );

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
          currentProviderID: "google",
          state: cleanState({ lastProviderID: "google" }),
        }),
      );
      expect(block).toBeNull();
    });

    it("does NOT emit on first turn (no lastProviderID)", () => {
      const block = assembleSystemBlock(
        cleanInput({
          currentProviderID: "google",
          state: cleanState({ lastProviderID: null }),
        }),
      );
      expect(block).toBeNull();
    });

    it("does NOT emit provider switch when fallback chain has no alternatives", () => {
      const block = assembleSystemBlock(
        cleanInput({
          currentProviderID: "zai-coding-plan",
          state: cleanState({ lastProviderID: "anthropic" }),
        }),
      );
      expect(block).not.toContain("[ADV:PROVIDER_SWITCH]");
      expect(block).toContain("[ADV:PROVIDER_HINT:glm]");
    });
  });

  describe("provider-hint section", () => {
    it("emits a Claude provider hint from structured anthropic provider ID", () => {
      const block = assembleSystemBlock(
        cleanInput({ currentProviderID: "anthropic" }),
      );
      expect(block).toContain("[ADV:PROVIDER_HINT:claude]");
      expect(block).toContain("<!-- PROVIDER_HINT:claude -->");
      expect(block).toContain("Default model family: Claude");
    });

    it("emits a GPT provider hint from structured openai provider ID", () => {
      const block = assembleSystemBlock(
        cleanInput({ currentProviderID: "openai" }),
      );
      expect(block).toContain("[ADV:PROVIDER_HINT:gpt]");
      expect(block).toContain("<!-- PROVIDER_HINT:gpt -->");
      for (const directive of GPT_REQUIREMENTS_RIGOR_DIRECTIVES) {
        expect(block).toContain(directive);
      }
      expect(PROVIDER_HINTS.gpt).toContain(
        "If user asked to continue/ship, keep going after interim findings unless a stop condition above is met",
      );
      expect(PROVIDER_HINTS.gpt).toContain(
        GPT_REQUIREMENTS_RIGOR_DIRECTIVES[2],
      );
      expect(
        PROVIDER_HINTS.gpt.indexOf(GPT_REQUIREMENTS_RIGOR_DIRECTIVES[2]),
      ).toBeGreaterThan(
        PROVIDER_HINTS.gpt.indexOf(
          "If user asked to continue/ship, keep going after interim findings unless a stop condition above is met",
        ),
      );
    });

    it("keeps GPT runtime hint aligned with source markdown", () => {
      expect(PROVIDER_HINTS.gpt).toBe(readProviderHintSource("gpt"));
    });

    it("emits a MiniMax provider hint from minimax-coding-plan provider ID", () => {
      const block = assembleSystemBlock(
        cleanInput({ currentProviderID: "minimax-coding-plan" }),
      );
      expect(block).toContain("[ADV:PROVIDER_HINT:minimax]");
      expect(block).toContain("<!-- PROVIDER_HINT:minimax -->");
      expect(block).toContain("Default model family: MiniMax M3");
    });

    it("emits a MiniMax provider hint from bare minimax provider ID", () => {
      const block = assembleSystemBlock(
        cleanInput({ currentProviderID: "minimax" }),
      );
      expect(block).toContain("[ADV:PROVIDER_HINT:minimax]");
    });

    it("emits a Qwen provider hint from openrouter provider ID", () => {
      const block = assembleSystemBlock(
        cleanInput({ currentProviderID: "openrouter" }),
      );
      expect(block).toContain("[ADV:PROVIDER_HINT:qwen]");
      expect(block).toContain("<!-- PROVIDER_HINT:qwen -->");
      expect(block).toContain("Default model family: Qwen 3.7 Max");
    });

    it("emits a Qwen provider hint from dashscope provider ID", () => {
      const block = assembleSystemBlock(
        cleanInput({ currentProviderID: "dashscope" }),
      );
      expect(block).toContain("[ADV:PROVIDER_HINT:qwen]");
    });

    it("keeps minimax runtime hint aligned with source markdown", () => {
      expect(PROVIDER_HINTS.minimax).toBe(readProviderHintSource("minimax"));
    });

    it("keeps qwen runtime hint aligned with source markdown", () => {
      expect(PROVIDER_HINTS.qwen).toBe(readProviderHintSource("qwen"));
    });

    it("emits no provider hint for unknown provider IDs", () => {
      const block = assembleSystemBlock(
        cleanInput({ currentProviderID: "unknown-provider" }),
      );
      expect(block).toBeNull();
    });

    it("emits no provider hint when provider identity is missing", () => {
      const block = assembleSystemBlock(
        cleanInput({ currentProviderID: null }),
      );
      expect(block).toBeNull();
    });

    it("keeps requirements-rigor directives GPT-only", () => {
      const blocks = [
        assembleSystemBlock(cleanInput({ currentProviderID: "anthropic" })),
        assembleSystemBlock(
          cleanInput({ currentProviderID: "unknown-provider" }),
        ),
        assembleSystemBlock(cleanInput({ currentProviderID: null })),
      ].map((block) => block ?? "");
      for (const directive of GPT_REQUIREMENTS_RIGOR_DIRECTIVES) {
        for (const block of blocks) {
          expect(block).not.toContain(directive);
        }
      }
    });

    it("keeps non-GPT provider hints byte-pinned", () => {
      const expectedClaude = [
        "<!-- PROVIDER_HINT:claude -->",
        "",
        "## Provider Hint",
        "",
        "- Default model family: Claude",
        "- When a user or workflow implies execution, act directly via tools — do not suggest or describe what you would do",
        "- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound",
      ].join("\n");
      const expectedGlm = [
        "<!-- PROVIDER_HINT:glm -->",
        "",
        "## Provider Hint",
        "",
        "- Default model family: GLM",
        "- Do not generalize rules beyond their stated scope — if a rule applies to a specific gate or tool, do not silently extend it",
        "- Keep all instructions and tool args in English even when context contains Chinese; validate tool args against schema before calling",
        "- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound",
        "- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries",
        "- When a tool choice exists, pick the most specific one; prefer lgrep over grep, prefer read over cat, prefer ADV MCP tools over direct file access",
        "- Before calling any tool, verify that every required parameter is present and matches the schema — do not guess or invent parameter values",
      ].join("\n");
      const expectedKimi = [
        "<!-- PROVIDER_HINT:kimi -->",
        "",
        "## Provider Hint",
        "",
        "- Default model family: Kimi",
        "- Critical instructions (gate rules, state access policy, NEVER/ONLY constraints) are non-negotiable even in long contexts — re-verify before every gate transition",
        "- If you notice repeated phrases or looping output, stop and summarize current state before continuing",
        "- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries",
        "- When multiple constraints apply, check each one individually before acting — do not collapse or merge distinct rules",
        "- Sequential tool dependencies must be executed one at a time in order — never parallelize dependent calls",
      ].join("\n");
      const expectedMinimax = [
        "<!-- PROVIDER_HINT:minimax -->",
        "",
        "## Provider Hint",
        "",
        "- Default model family: MiniMax M3",
        "- Parallel tool calls may mis-attribute results by arrival order rather than tool_call_id — execute dependent tool calls sequentially, never parallelize when call results feed into each other",
        "- Interleaved thinking is preserved in response content; do not strip or summarize reasoning_content from message history between turns",
        "- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound",
        "- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries",
        "- When a tool choice exists, pick the most specific one; prefer lgrep over grep, prefer read over cat, prefer ADV MCP tools over direct file access",
        "- Before calling any tool, verify that every required parameter is present and matches the schema — do not guess or invent parameter values",
      ].join("\n");
      const expectedQwen = [
        "<!-- PROVIDER_HINT:qwen -->",
        "",
        "## Provider Hint",
        "",
        "- Default model family: Qwen 3.7 Max",
        "- Preserve thinking content across multi-turn agent workflows — the model relies on accumulated reasoning context for long-horizon task coherence. Loss of prior reasoning degrades task coherence",
        "- For long-running ADV workflows, summarize intermediate state explicitly rather than relying on the model to infer from distant context",
        "- ALWAYS emit a tool call after reasoning about needing one in a thinking block. NEVER describe what the tool would return or fabricate results from reasoning alone",
        "- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound",
        "- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries",
        "- NEVER parallelize dependent tool calls — if tool B needs tool A's output, wait for A's result before calling B",
        "- Parallel tool calls are for independent operations only — never run the same command multiple times in parallel; make one call, wait for the result, then decide next steps",
        "- When a tool choice exists, pick the most specific one; prefer lgrep over grep, prefer read over cat, prefer ADV MCP tools over direct file access",
        "- Before calling any tool, verify that every required parameter is present and matches the schema — do not guess or invent parameter values",
        "- Call each tool exactly once per distinct operation — never duplicate identical calls in parallel or sequentially",
        "- Parallel batches: every file path, search query, and command must be unique across the batch — no exceptions",
        "- Tool call failed or returned unexpected results? Diagnose root cause before retrying — never blindly repeat",
      ].join("\n");

      expect(PROVIDER_HINTS.claude).toBe(expectedClaude);
      expect(PROVIDER_HINTS.glm).toBe(expectedGlm);
      expect(PROVIDER_HINTS.kimi).toBe(expectedKimi);
      expect(PROVIDER_HINTS.minimax).toBe(expectedMinimax);
      expect(PROVIDER_HINTS.qwen).toBe(expectedQwen);
      expect(readProviderHintSource("claude")).toBe(expectedClaude);
      expect(readProviderHintSource("glm")).toBe(expectedGlm);
      expect(readProviderHintSource("kimi")).toBe(expectedKimi);
      expect(readProviderHintSource("minimax")).toBe(expectedMinimax);
      expect(readProviderHintSource("qwen")).toBe(expectedQwen);
    });

    it("does not duplicate provider hints when switch and hint sections both emit", () => {
      const block = assembleSystemBlock(
        cleanInput({
          currentProviderID: "anthropic",
          state: cleanState({ lastProviderID: "openai" }),
        }),
      );
      expect(block).toContain("[ADV:PROVIDER_HINT:claude]");
      expect(block).toContain("[ADV:PROVIDER_SWITCH]");
      expect(block!.match(/<!-- PROVIDER_HINT:claude -->/g)).toHaveLength(1);
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
    it("orders sections: degraded → health → providerHint → providerSwitch → worktree → activeChange", () => {
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
        idx("[ADV:PROVIDER_HINT:claude]"),
      );
      expect(idx("[ADV:PROVIDER_HINT:claude]")).toBeLessThan(
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

// ─── Removed Trunk Guard Section ─────────────────────────────────────────

describe("trunkGuardSection", () => {
  it("does not emit trunk guard when not in worktree with active change", () => {
    const result = assembleSystemBlock(
      cleanInput({
        state: cleanState({
          isWorktree: false,
          activeChange: { id: "myChange", objective: "Build feature" },
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
          activeChange: { id: "myChange", objective: null },
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
          activeChange: { id: null, objective: null },
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
          activeChange: { id: "myChange", objective: null },
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
          activeChange: { id: "myChange", objective: null },
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
          activeChange: { id: "myChange", objective: null },
        }),
      }),
    );
    expect(result).not.toBeNull();
    expect(result).toBe("[ADV] Active change: myChange");
  });
});
