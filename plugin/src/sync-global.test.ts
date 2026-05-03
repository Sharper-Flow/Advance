import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const SYNC_SCRIPT_PATH = join(REPO_ROOT, "scripts/sync-global.sh");
const PROVIDER_EVAL_PATH = join(REPO_ROOT, "scripts/provider-eval.ts");
const ADV_AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv.md");
const PROVIDER_ASSEMBLY_DOC_PATH = join(
  REPO_ROOT,
  "docs/provider-agent-assembly.md",
);
const PROVIDER_SMOKE_DOC_PATH = join(
  REPO_ROOT,
  "docs/provider-adv-smoke-checklist.md",
);
const ADVANCE_META_SPEC_PATH = join(
  REPO_ROOT,
  ".adv/specs/advance-meta/spec.json",
);

describe("sync-global.sh", () => {
  const content = readFileSync(SYNC_SCRIPT_PATH, "utf8");

  test("script exists and is non-empty", () => {
    expect(existsSync(SYNC_SCRIPT_PATH)).toBe(true);
    expect(content.length).toBeGreaterThan(100);
  });

  // -----------------------------------------------------------------------
  // Flag parsing
  // -----------------------------------------------------------------------
  describe("flag support", () => {
    test("supports --check flag", () => {
      expect(content).toContain('--check) MODE="check"');
    });

    test("supports --fix flag", () => {
      expect(content).toContain('--fix)   MODE="fix"');
    });

    test("supports --help flag", () => {
      expect(content).toContain("--help|-h)");
    });

    test("defaults to sync mode", () => {
      expect(content).toContain('MODE="sync"');
    });

    test("rejects unknown flags", () => {
      expect(content).toContain("Unknown flag:");
    });
  });

  // -----------------------------------------------------------------------
  // Asset sync (existing behavior preserved)
  // -----------------------------------------------------------------------
  describe("asset sync", () => {
    test("syncs adv-*.md commands to global", () => {
      expect(content).toContain('for src in "$REPO_COMMANDS"/adv-*.md; do');
      expect(content).toContain('dest="$GLOBAL_COMMANDS/$(basename "$src")"');
    });

    test("removes stale adv commands from global", () => {
      expect(content).toContain(
        'for global_cmd in "$GLOBAL_COMMANDS"/adv-*.md; do',
      );
      expect(content).toContain("removed stale:");
    });

    test("syncs agents to global", () => {
      expect(content).toContain('for src in "$REPO_AGENTS"/*.md; do');
      expect(content).toContain("copied agent:");
    });

    test("adv-researcher is synced globally (not repo-local)", () => {
      // adv-researcher was promoted from repo-local to bundled global specialist
      expect(content).toContain('REPO_LOCAL_ONLY="adv-tron.md"');
      expect(content).not.toMatch(/REPO_LOCAL_ONLY=.*adv-researcher/);
      // After KD16 rename, the bare "tron.md" must not appear as the REPO_LOCAL_ONLY value
      expect(content).not.toMatch(/REPO_LOCAL_ONLY="tron\.md"/);
    });

    test("adv-engineer.md is NOT in SHARED_OVERLAY_ONLY", () => {
      expect(content).not.toMatch(/SHARED_OVERLAY_ONLY=.*engineer/);
    });

    test("adv-engineer.md is NOT in REPO_LOCAL_ONLY", () => {
      expect(content).not.toMatch(/REPO_LOCAL_ONLY=.*engineer/);
    });

    test("stale cleanup keeps a single legacy filename list", () => {
      expect(content).toContain("LEGACY_STALE_AGENT_FILES=(");
      expect(content).toContain("orca.md");
      expect(content).toContain("tron.md");
      expect(content).toContain("scout.md");
      expect(content).toContain("refine.md");
      expect(content).toContain("engineer.md");
    });

    test("stale cleanup uses adv-* glob for current names", () => {
      expect(content).toContain(
        'for global_agent in "$GLOBAL_AGENTS"/adv-*.md; do',
      );
      expect(content).toContain("remove_stale_agent_if_needed");
    });

    test("legacy bare names remain for upgrade cleanup while adv-* names are handled by glob", () => {
      expect(content).toContain(
        'for legacy_name in "${LEGACY_STALE_AGENT_FILES[@]}"; do',
      );
      expect(content).toContain("pre-rename bare names");
    });

    test("skips shared agents that are overlay-managed", () => {
      expect(content).toContain(
        'SHARED_OVERLAY_ONLY="build.md general.md plan.md"',
      );
      expect(content).toContain("skipped (overlay-managed):");
      expect(content).toContain("`adv.md` is deliberately NOT in this list");
    });

    test("syncs skills to global", () => {
      expect(content).toContain('for skill_dir in "$REPO_SKILLS"/adv-*/; do');
      expect(content).toContain('cp "$skill_file" "$dest_dir/SKILL.md"');
    });

    test("removes legacy non-ADV commands", () => {
      expect(content).toContain("for stale in openprompt.md; do");
    });

    test("removes stale global ADV_INSTRUCTIONS.md copy", () => {
      expect(content).toContain("STALE_GLOBAL_INSTR=");
      expect(content).toContain("instructions/ADV_INSTRUCTIONS.md");
      expect(content).toContain("canonical is $ADV_INSTRUCTION_PATH");
    });
  });

  // -----------------------------------------------------------------------
  // Config validation
  // -----------------------------------------------------------------------
  describe("config validation", () => {
    test("requires jq for config operations", () => {
      expect(content).toContain("command -v jq");
      expect(content).toContain("jq not found");
    });

    test("checks for opencode.json existence", () => {
      expect(content).toContain('if [ ! -f "$GLOBAL_JSON" ]; then');
    });

    test("validates JSON syntax before patching", () => {
      expect(content).toContain("jsonc_to_json");
      expect(content).toContain("jq empty");
      expect(content).toContain("is not valid JSON");
    });

    test("checks for ADV plugin in .plugin array", () => {
      expect(content).toContain("ADV_PLUGIN_PATH=");
      expect(content).toContain("plugin: ADV plugin registered");
      expect(content).toContain("plugin: ADV plugin path missing");
    });

    test("checks for ADV instruction in .instructions array", () => {
      expect(content).toContain("ADV_INSTRUCTION_PATH=");
      expect(content).toContain("instructions: ADV_INSTRUCTIONS.md registered");
      expect(content).toContain("instructions: ADV_INSTRUCTIONS.md missing");
    });

    test("warns about stale duplicate ADV_INSTRUCTIONS.md in global instructions", () => {
      expect(content).toContain("stale duplicate found");
      expect(content).toContain("wastes ~7K tokens");
    });

    test("handles tilde-expanded paths in json_array_contains", () => {
      // The function should check both exact and tilde-expanded forms
      expect(content).toContain("tilde_value=");
      expect(content).toContain("${value/#$HOME/\\~}");
    });
  });

  // -----------------------------------------------------------------------
  // Config patching (--fix mode)
  // -----------------------------------------------------------------------
  describe("config patching", () => {
    test("creates backup before patching", () => {
      expect(content).toContain('backup="$GLOBAL_JSON.bak.');
      expect(content).toContain('cp "$GLOBAL_JSON" "$backup"');
    });

    test("uses atomic write via mv", () => {
      expect(content).toContain('mv "$tmp_json" "$GLOBAL_JSON"');
    });

    test("creates minimal config when file is missing", () => {
      expect(content).toContain("Created");
      expect(content).toContain('"plugin": [$plugin]');
      expect(content).toContain('"instructions": [$instr]');
    });

    test("preserves existing entries via jq unique", () => {
      // jq unique ensures no duplicates
      expect(content).toContain("| unique)");
    });

    test("uses jq --arg bindings for dynamic values", () => {
      expect(content).toContain(
        'jq --arg exact "$value" --arg tilde "$tilde_value"',
      );
      expect(content).toContain("any(. == $s1 or . == $s2)");
    });

    test("normalizes malformed plugin and instruction arrays before patching", () => {
      expect(content).toContain('if type == "array" then . else [.] end');
    });

    test("removes stale global ADV_INSTRUCTIONS.md from instructions array", () => {
      expect(content).toContain("Removed stale instruction:");
      expect(content).toContain("instructions/ADV_INSTRUCTIONS.md");
    });

    test("cleans up backup when no patches needed", () => {
      expect(content).toContain("No patches needed");
      expect(content).toContain('rm -f "$backup"');
    });

    test("skips asset sync in --check mode", () => {
      // check mode exits before asset sync
      expect(content).toContain('if [ "$MODE" = "check" ]; then');
      expect(content).toContain("exit 0");
    });
  });

  // -----------------------------------------------------------------------
  // Path derivation
  // -----------------------------------------------------------------------
  describe("path derivation", () => {
    test("derives repo root from script location", () => {
      expect(content).toContain(
        'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      );
      expect(content).toContain(
        'SCRIPT_REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"',
      );
      expect(content).toContain("resolve_canonical_repo_root() {");
      expect(content).toContain(
        'REPO_ROOT="$(resolve_canonical_repo_root "$SCRIPT_REPO_ROOT")"',
      );
    });

    test("derives ADV paths from repo root", () => {
      expect(content).toContain('ADV_PLUGIN_PATH="$REPO_ROOT/plugin"');
      expect(content).toContain(
        'ADV_INSTRUCTION_PATH="$REPO_ROOT/ADV_INSTRUCTIONS.md"',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Provider ADV variant generation (providerAdvAgentAssemblySystem)
  // -----------------------------------------------------------------------
  describe("provider variant generation", () => {
    test("provider hint files exist in repo", () => {
      const providers = ["claude", "gpt", "glm", "kimi"];
      for (const p of providers) {
        const path = join(REPO_ROOT, `.opencode/agent-parts/providers/${p}.md`);
        expect(existsSync(path), `missing provider hint: ${p}.md`).toBe(true);
      }
    });

    test("sync script references provider variant generation", () => {
      expect(content).toContain("adv-${provider}.md");
      expect(content).toContain("PROVIDERS=(claude gpt glm kimi)");
    });

    test("sync script patches frontmatter name for each variant", () => {
      expect(content).toMatch(/sed.*name:.*adv-\$\{provider\}/);
    });

    test("sync script writes provider prompt parts and runtime canary marker", () => {
      expect(content).toContain("PROVIDER_PROMPT_PARTS_DIR");
      expect(content).toContain("sync_adv_prompt_parts");
      expect(content).toContain("[ADV:PROVIDER_STUB_UNEXPANDED]");
      // Provider hints are copied to providers/ subdirectory (via variable)
      expect(content).toContain("providers/${provider}.md");
    });

    test("provider hint source follows asset root for worktree-local edits", () => {
      expect(content).toContain(
        'PROVIDER_HINT_DIR="$ASSET_ROOT/.opencode/agent-parts/providers"',
      );
    });

    test("sync script embeds concatenated runtime bodies in generated variants", () => {
      expect(content).toContain(
        'prompt_body="$PROVIDER_PROMPT_PARTS_DIR/adv-${provider}.md"',
      );
      expect(content).toContain("body = Path(body_path).read_text().rstrip()");
      expect(content).not.toContain("PROVIDER_STUB_DIAGNOSTIC");
    });

    test("sync script patches prompt refs for provider variants using single-file concatenation", () => {
      expect(content).toContain("patch_provider_prompt_refs");
      // Single-file concatenated prompt ref via printf format string
      expect(content).toContain("{file:./agent-parts/advance/adv-%s.md}");
      // Multi-file pattern must NOT appear in provider_prompt_ref function
      expect(content).not.toMatch(
        /provider_prompt_ref\(\).*\{file:.*adv\.md\}\\n\\n\{file:/s,
      );
    });

    test("sync script generates per-provider concatenated prompt files", () => {
      expect(content).toContain("generate_concatenated_provider_prompts");
      // Concatenated output path uses provider name in filename
      expect(content).toMatch(/adv-\$\{provider\}\.md/);
      // Must read from existing prompt parts (source-of-truth)
      expect(content).toContain("PROVIDER_PROMPT_PARTS_DIR/adv.md");
      expect(content).toContain("PROVIDER_PROMPT_PARTS_DIR/providers");
    });

    test("sync script validates concatenated files with regenerate-and-diff staleness", () => {
      expect(content).toContain("check_provider_prompt_parts");
      // Must detect legacy multi-ref pattern
      expect(content).toMatch(/legacy.*multi/i);
      // Must do regenerate-and-diff (no SHA256 sidecar)
      expect(content).not.toContain(".sha256");
      expect(content).toMatch(/content.*mismatch/i);
    });

    test("sync script includes runtime canary for provider prompt resolution", () => {
      expect(content).toContain("check_provider_runtime_canary");
      expect(content).toContain("opencode");
      expect(content).toContain("debug");
      expect(content).toContain("agent");
      expect(content).toContain("missing canonical ADV marker");
      expect(content).toContain("missing provider hint marker");
    });

    test("sync script extends drift checks to all provider variants", () => {
      expect(content).toContain("check_tool_drift");
      expect(content).toContain("check_provider_variant_drifts");
      expect(content).toMatch(/adv-\$\{provider\}\.md/);
    });

    test("legacy adv.md removal is gated off global opencode.json agent keys", () => {
      expect(content).toContain("agent.adv-");
      expect(content).toContain("opencode.json");
      expect(content).toMatch(/legacy.*adv\.md.*gated|gated.*legacy.*adv\.md/i);
    });

    test("prompt-only provider config keys do not activate provider mode", () => {
      expect(content).toContain("provider_adv_has_activation_fields");
      expect(content).toContain("prompt-only");
      expect(content).toContain("model");
      expect(content).toContain("disable");
      expect(content).toContain("variant");
      expect(content).toContain("color");
    });

    test("sets agent.adv.disable: true when provider variants are configured", () => {
      expect(content).toContain("agent.adv.disable = true");
      expect(content).toContain("provider variants active");
    });

    test("removes agent.adv.disable when no provider variants are configured", () => {
      expect(content).toContain("Removed agent.adv.disable");
      expect(content).toContain("no provider variants active");
    });

    test("keeps repo-local adv.md and relies on config disable for visibility", () => {
      expect(content).toContain("Keep repo-local adv.md in-tree");
      expect(content).toContain("agent.adv.disable");
      expect(content).not.toContain("REPO_LOCAL_ADV=");
    });
  });

  describe("provider evaluation metrics", () => {
    const providerEval = readFileSync(PROVIDER_EVAL_PATH, "utf8");

    test("provider eval reports generated-file and runtime-prompt metrics separately", () => {
      expect(providerEval).toContain("collectPromptSizeMetrics");
      expect(providerEval).toContain("generated_provider_file");
      expect(providerEval).toContain("selected_agent_runtime_prompt");
      expect(providerEval).toContain("Generated provider file");
      expect(providerEval).toContain("Selected-agent runtime prompt");
    });

    test("provider eval does not use generated provider variants as canonical prompt source", () => {
      expect(providerEval).toContain("loadCanonicalAdvPrompt");
      expect(providerEval).toContain("agent-parts/advance/adv.md");
      expect(providerEval).not.toContain("global provider variant");
    });

    test("provider eval models native prompt-ref concatenation order", () => {
      expect(providerEval).toContain(
        "Replicates sync-global.sh concatenated prompt file",
      );
      expect(providerEval).toContain(
        "return `${stripped}\\n\\n${hintContent}`",
      );
      expect(providerEval).not.toContain("stripped.indexOf(endMarker)");
    });
  });

  describe("provider docs and spec deltas", () => {
    const assemblyDoc = readFileSync(PROVIDER_ASSEMBLY_DOC_PATH, "utf8");
    const smokeDoc = readFileSync(PROVIDER_SMOKE_DOC_PATH, "utf8");
    const spec = JSON.parse(readFileSync(ADVANCE_META_SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; scenarios?: Array<{ id: string }> }>;
    };
    const requirementIds = spec.requirements.map((r) => r.id);
    const scenarioIds = spec.requirements.flatMap((r) =>
      (r.scenarios ?? []).map((s) => s.id),
    );

    test("provider docs describe runtime bodies, prompt parts, prompt-only config, and metrics", () => {
      for (const required of [
        "agent-parts/advance/adv.md",
        "agent-parts/advance/providers/{provider}.md",
        "runtime canary",
        "prompt-only",
        "generated_provider_file",
        "selected_agent_runtime_prompt",
      ]) {
        expect(`${assemblyDoc}\n${smokeDoc}`).toContain(required);
      }
    });

    test("advance-meta spec contains provider runtime and metrics requirements", () => {
      expect(requirementIds).toContain("rq-providerAdvSkinny01");
      expect(requirementIds).toContain("rq-providerAdvMetrics01");
      expect(scenarioIds).toContain("rq-providerAdvSkinny01.1");
      expect(scenarioIds).toContain("rq-providerAdvSkinny01.2");
    });
  });

  describe("canonical ADV prompt compression", () => {
    const advAgent = readFileSync(ADV_AGENT_PATH, "utf8");

    test("canonical ADV prompt stays under the safe compression ceiling", () => {
      const lines = advAgent.split(/\r?\n/).length;
      // Ceiling raised from 350 → 360 after adding the newly registered
      // session/worktree ADV tools to the orchestrator allowlist.
      expect(lines).toBeLessThanOrEqual(360);
    });

    test("canonical ADV prompt keeps safety-critical markers", () => {
      for (const marker of [
        "Human Checkpoints",
        "ADV State Access Policy",
        "Sign-Off Boundary",
        "TDD Protocol",
        "Worktree",
        "Doom-loop",
        "Cancellation",
        "Due diligence first",
      ]) {
        expect(advAgent).toContain(marker);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Skills sync (T33/T34 — adv-worktree skill is repo-owned)
  // -----------------------------------------------------------------------
  describe("skills sync", () => {
    test("skills/adv-worktree/SKILL.md exists in repo", () => {
      expect(
        existsSync(resolve(REPO_ROOT, "skills/adv-worktree/SKILL.md")),
      ).toBe(true);
    });

    test("sync-global.sh covers skills/adv-* glob", () => {
      // Pattern must match the adv-* prefix so adv-worktree (and future
      // adv-<name> skills) are picked up by the sync loop.
      expect(content).toMatch(/skills.*adv-/);
      expect(content).toContain('"$REPO_SKILLS"/adv-*/');
    });

    test("sync-global.sh removes stale adv-* skills from global", () => {
      expect(content).toContain('"$GLOBAL_SKILLS"/adv-*/');
      expect(content).toMatch(/removed stale skill|stale skill\(s\) removed/);
    });

    test("adv-worktree skill is multi-session-first (no concurrent-session warnings)", () => {
      const skillContent = readFileSync(
        resolve(REPO_ROOT, "skills/adv-worktree/SKILL.md"),
        "utf8",
      );
      expect(skillContent).toMatch(/multi-session/i);
      expect(skillContent).toMatch(/Multi-Session Note/);
      expect(skillContent).not.toMatch(/already in a worktree session/);
      expect(skillContent).not.toMatch(/git checkout|git switch/);
      expect(skillContent).toContain('git -C "$MAIN" merge --ff-only');
    });
  });
});
