/**
 * Bun tests for provider-eval configuration alignment
 *
 * Run with: bun test scripts/provider-eval.test.ts
 *
 * Contract: each provider must have the exact OpenRouter model_id and
 * display name specified. Prompt files and hint files must be preserved.
 */

import { describe, test, expect } from "bun:test";
import { PROVIDERS } from "./provider-eval";

describe("PROVIDERS configuration", () => {
  test("has exactly four providers: glm, kimi, claude, gpt", () => {
    const keys = Object.keys(PROVIDERS).sort();
    expect(keys).toEqual(["claude", "glm", "gpt", "kimi"]);
  });

  test("GPT uses openai/gpt-5.6-terra with label GPT-5.6 Terra", () => {
    expect(PROVIDERS.gpt.model_id).toBe("openai/gpt-5.6-terra");
    expect(PROVIDERS.gpt.name).toBe("GPT-5.6 Terra");
  });

  test("GLM uses z-ai/glm-5.2 with label GLM-5.2", () => {
    expect(PROVIDERS.glm.model_id).toBe("z-ai/glm-5.2");
    expect(PROVIDERS.glm.name).toBe("GLM-5.2");
  });

  test("Kimi uses moonshotai/kimi-k2.7-code with label Kimi K2.7 Code", () => {
    expect(PROVIDERS.kimi.model_id).toBe("moonshotai/kimi-k2.7-code");
    expect(PROVIDERS.kimi.name).toBe("Kimi K2.7 Code");
  });

  test("Claude uses anthropic/claude-opus-4.8 with label Claude Opus 4.8", () => {
    expect(PROVIDERS.claude.model_id).toBe("anthropic/claude-opus-4.8");
    expect(PROVIDERS.claude.name).toBe("Claude Opus 4.8");
  });

  test("each provider preserves its prompt_files", () => {
    expect(PROVIDERS.gpt.prompt_files).toEqual(["shared.yaml", "gpt.yaml"]);
    expect(PROVIDERS.glm.prompt_files).toEqual(["shared.yaml", "glm.yaml"]);
    expect(PROVIDERS.kimi.prompt_files).toEqual(["shared.yaml", "kimi.yaml"]);
    expect(PROVIDERS.claude.prompt_files).toEqual([
      "shared.yaml",
      "claude.yaml",
    ]);
  });

  test("each provider has a hint_file path", () => {
    for (const key of Object.keys(PROVIDERS)) {
      expect(PROVIDERS[key].hint_file).toBeTruthy();
      expect(PROVIDERS[key].hint_file).toContain("providers/");
      expect(PROVIDERS[key].hint_file).toEndWith(".md");
    }
  });

  test("no second GPT target exists", () => {
    const gptKeys = Object.keys(PROVIDERS).filter(
      (k) => k === "gpt" || k.startsWith("gpt"),
    );
    expect(gptKeys).toEqual(["gpt"]);
  });
});
