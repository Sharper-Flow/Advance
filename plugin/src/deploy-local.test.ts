import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "node:url";
import { SpecSchema } from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");
const PROVIDER_EVAL_PATH = join(REPO_ROOT, "scripts/provider-eval.ts");
const ADV_AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv.md");
const ADV_ATC_AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-atc.md");
const PROVIDER_ASSEMBLY_DOC_PATH = join(
  REPO_ROOT,
  "docs/provider-agent-assembly.md",
);
const PROVIDER_SMOKE_DOC_PATH = join(
  REPO_ROOT,
  "docs/provider-adv-smoke-checklist.md",
);
const RUNTIME_PROTOCOL_COVERAGE_PATH = join(
  REPO_ROOT,
  "docs/adv-runtime-protocol-coverage.md",
);
const ADVANCE_META_SPEC_PATH = join(
  REPO_ROOT,
  ".adv/specs/advance-meta/spec.json",
);
const ADVANCE_META_SPEC_DOC_PATH = join(
  REPO_ROOT,
  "docs/specs/advance-meta.md",
);
const WORKTREE_LIFECYCLE_SPEC_PATH = join(
  REPO_ROOT,
  ".adv/specs/worktree-lifecycle/spec.json",
);

function duplicateFrontmatterKeys(markdown: string) {
  const end = markdown.indexOf("\n---\n", 4);
  expect(markdown.startsWith("---\n")).toBe(true);
  expect(end).toBeGreaterThan(0);

  const seen = new Set<string>();
  const parents: Array<{ indent: number; key: string }> = [];
  const duplicates: string[] = [];

  for (const line of markdown.slice(4, end).split("\n")) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#") || stripped.startsWith("-")) {
      continue;
    }
    const match = line.match(/^\s*([A-Za-z0-9_*.-]+)\s*:/);
    if (!match) continue;

    const indent = line.length - line.trimStart().length;
    while (
      parents.length > 0 &&
      parents[parents.length - 1]!.indent >= indent
    ) {
      parents.pop();
    }

    const key = match[1]!;
    const scope = [...parents.map((parent) => parent.key), key].join(".");
    if (seen.has(scope)) duplicates.push(scope);
    seen.add(scope);

    const remainder = line.split(":", 2)[1]?.trim() ?? "";
    if (["", "|", ">", "|-", ">-"].includes(remainder)) {
      parents.push({ indent, key });
    }
  }

  return duplicates;
}

describe("deploy-local.sh", () => {
  const content = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");

  test("script exists and is non-empty", () => {
    expect(existsSync(DEPLOY_SCRIPT_PATH)).toBe(true);
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
      expect(content).toMatch(/--fix\)\s+MODE="fix"/);
    });

    test("supports --help flag", () => {
      expect(content).toMatch(/--help\s*\|\s*-h\)/);
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

    test("syncs skills to global (whole-directory copy preserves sibling docs and subdirs)", () => {
      // ADR-002: whole-directory sync preserves SKILL.md + sibling reference docs
      // (CONTEXT-FORMAT.md, LOGIC.md, UI.md, REPORT_SCHEMA.md, etc.) + subdirectories
      // (e.g. scripts/). Backward-compatible: single-file skills sync identically.
      expect(content).toContain('for skill_dir in "$REPO_SKILLS"/adv-*/; do');
      expect(content).toContain('(cd "$skill_dir" && cp -R . "$dest_dir/")');
      expect(content).toContain("ADR-002");
    });

    test("deploys runtime plugin to stable .local share path", () => {
      expect(content).toContain(
        'LOCAL_DEPLOY_ROOT="${ADV_LOCAL_DEPLOY_ROOT:-$HOME/.local/share/Advance}"',
      );
      expect(content).toContain('ADV_SOURCE_PLUGIN_PATH="$ASSET_ROOT/plugin"');
      expect(content).toContain(
        'ADV_RUNTIME_PLUGIN_PATH="$LOCAL_DEPLOY_ROOT/plugin"',
      );
      expect(content).toContain("check_rsync");
      expect(content).toContain("command -v rsync");
      expect(content).toContain(
        'rsync -a --delete "$ADV_SOURCE_PLUGIN_PATH/" "$ADV_RUNTIME_PLUGIN_PATH/"',
      );
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

    // rq-scopedAdvInstructions01: sync must scope ADV protocol body to the
    // ADV runtime agent and remove legacy global instruction registration.
    test("rejects ADV instruction in global .instructions array", () => {
      expect(content).toContain("ADV_INSTRUCTION_PATH=");
      expect(content).toContain(
        "instructions: ADV_INSTRUCTIONS.md should not be globally registered",
      );
      expect(content).toContain(
        "instructions: ADV_INSTRUCTIONS.md scoped to ADV runtime agent",
      );
      expect(content).not.toContain(
        "instructions: ADV_INSTRUCTIONS.md missing from .instructions array",
      );
    });

    test("warns about stale duplicate ADV_INSTRUCTIONS.md in global instructions", () => {
      expect(content).toContain("stale duplicate found");
      expect(content).toContain("wastes ~17K tokens");
    });

    test("validates agent frontmatter before reporting healthy sync", () => {
      expect(content).toContain("check_agent_frontmatter");
      expect(content).toContain("duplicate YAML key");
      expect(content).toContain("has unique mapping keys");
    });

    test("primary ADV agent frontmatter has no duplicate mapping keys", () => {
      expect(
        duplicateFrontmatterKeys(readFileSync(ADV_AGENT_PATH, "utf8")),
      ).toEqual([]);
      expect(
        duplicateFrontmatterKeys(readFileSync(ADV_ATC_AGENT_PATH, "utf8")),
      ).toEqual([]);
    });

    test("tool drift validation permits report-submit on primary agents", () => {
      const advAgent = readFileSync(ADV_AGENT_PATH, "utf8");
      const advAtcAgent = readFileSync(ADV_ATC_AGENT_PATH, "utf8");

      expect(advAgent).toContain("mode: primary");
      expect(advAtcAgent).toContain("mode: primary");
      expect(advAgent).toContain("  adv_subagent_report_submit: true");
      expect(advAtcAgent).toContain("  adv_subagent_report_submit: true");

      expect(content).toContain("LEAF_ONLY_TOOLS");
      expect(content).toContain('"adv_subagent_report_submit"');
      expect(content).toContain("agent_mode");
      expect(content).toContain('agent_mode == "primary"');
      expect(content).toContain("registered - primary_exemptions - allowed");
    });

    test("tool drift validation remains strict for ordinary primary-agent tools", () => {
      expect(content).toContain("primary_exemptions");
      expect(content).toContain("missing = sorted(");
      expect(content).toContain("extras = sorted(allowed - registered)");
      expect(content).not.toContain("missing = []");
      expect(content).not.toContain("registered = registered - allowed");
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
      expect(content).not.toContain('"instructions": [$instr]');
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

    test("removes canonical and stale global ADV_INSTRUCTIONS.md from instructions array", () => {
      expect(content).toContain(
        "remove globally-registered ADV_INSTRUCTIONS.md",
      );
      expect(content).toContain("remove stale instruction:");
      expect(content).toContain("instructions/ADV_INSTRUCTIONS.md");
    });

    test("does not create config backup when no patches needed", () => {
      expect(content).toContain("No patches needed");
      expect(content).toContain('if [ "$patched" -eq 0 ]; then');
      expect(content).toContain('rm -f "$tmp_json"');
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

    test("derives ADV runtime plugin path from stable local deploy root", () => {
      expect(content).not.toContain('ADV_PLUGIN_PATH="$REPO_ROOT/plugin"');
      expect(content).toContain('ADV_PLUGIN_PATH="$ADV_RUNTIME_PLUGIN_PATH"');
      expect(content).toContain(
        'ADV_INSTRUCTION_PATH="$REPO_ROOT/ADV_INSTRUCTIONS.md"',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Single ADV runtime agent (providerAdvAgentAssemblySystem retired)
  // -----------------------------------------------------------------------
  describe("single ADV runtime agent sync", () => {
    test("provider hint files exist in repo", () => {
      const providers = ["claude", "gpt", "glm", "kimi"];
      for (const p of providers) {
        const path = join(REPO_ROOT, `.opencode/agent-parts/providers/${p}.md`);
        expect(existsSync(path), `missing provider hint: ${p}.md`).toBe(true);
      }
    });

    test("sync script retains provider names only for hint assets and stale cleanup", () => {
      expect(content).toContain("PROVIDERS=(claude gpt glm kimi)");
      expect(content).toContain("remove_retired_provider_prompt_parts");
    });

    test("provider hint source follows asset root for worktree-local edits", () => {
      expect(content).toContain(
        'PROVIDER_HINT_DIR="$ASSET_ROOT/.opencode/agent-parts/providers"',
      );
    });

    test("sync script assembles one complete ADV runtime agent", () => {
      expect(content).toContain("sync_adv_runtime_agent");
      expect(content).toContain("runtime_text");
      expect(content).not.toContain("instructions_text");
      expect(content).not.toContain("canonical_text +");
      expect(content).toContain("assembled ADV runtime agent: adv.md");
    });

    test("sync script does not generate provider runtime agents or prompt refs", () => {
      expect(content).not.toContain("generate_provider_variants");
      expect(content).not.toContain("generate_concatenated_provider_prompts");
      expect(content).not.toContain("patch_provider_prompt_refs");
      expect(content).not.toContain("check_provider_runtime_canary");
      expect(content).not.toContain("check_provider_variant_drifts");
      expect(content).not.toContain("agent.adv.disable = true");
    });

    test("keeps repo-local adv.md and global adv.md visible", () => {
      expect(content).toContain("Keep repo-local adv.md in-tree");
      expect(content).not.toContain("REPO_LOCAL_ADV=");
    });
  });

  describe("provider evaluation metrics", () => {
    const providerEval = readFileSync(PROVIDER_EVAL_PATH, "utf8");

    test("provider eval reports single-agent prompt-size planes", () => {
      expect(providerEval).toContain("collectPromptSizeMetrics");
      expect(providerEval).toContain("lean_adv_runtime_prompt");
      expect(providerEval).toContain("adv_reference_protocol");
      expect(providerEval).toContain("provider_hint");
      expect(providerEval).toContain("adv_dynamic_system_block_estimate");
      expect(providerEval).toContain("caveman_voice_contract_allowance");
      expect(providerEval).toContain("selected_agent_runtime_prompt");
      expect(providerEval).toContain("avoided_provider_variant_duplication");
      expect(providerEval).toContain("Lean ADV runtime prompt");
      expect(providerEval).toContain("ADV reference protocol");
      expect(providerEval).toContain("Selected runtime prompt");
      expect(providerEval).not.toContain("adv_protocol_instructions");
    });

    test("provider eval does not use generated provider variants as canonical prompt source", () => {
      expect(providerEval).toContain("loadCanonicalAdvPrompt");
      expect(providerEval).not.toContain("global provider variant");
      expect(providerEval).not.toContain("generated_provider_file");
    });

    test("provider eval models single ADV runtime prompt plus optional hint", () => {
      expect(providerEval).toContain(
        "single ADV runtime prompt, no provider hint",
      );
      expect(providerEval).toContain("composeSystemPrompt");
      expect(providerEval).not.toContain("stripped.indexOf(endMarker)");
    });

    test("provider eval computes prompt metric planes from executable helpers", async () => {
      const { composeSystemPrompt, collectPromptSizeMetrics } = await import(
        pathToFileURL(PROVIDER_EVAL_PATH).href
      );
      const leanPrompt = "---\nname: adv\n---\n\nADV body\nline 2";
      const providerHint = "<!-- PROVIDER_HINT:gpt -->\nHint";
      const runtimePrompt = composeSystemPrompt(leanPrompt, providerHint);
      const metrics = collectPromptSizeMetrics({
        leanRuntimePrompt: leanPrompt,
        advReferenceProtocol: "Reference\nprotocol",
        providerHint,
        runtimePrompt,
        retiredGeneratedProviderPath: join(
          REPO_ROOT,
          "does-not-exist/adv-gpt.md",
        ),
      });

      expect(runtimePrompt).toBe(
        "ADV body\nline 2\n\n<!-- PROVIDER_HINT:gpt -->\nHint",
      );
      expect(metrics.lean_adv_runtime_prompt).toMatchObject({ lines: 2 });
      expect(metrics.adv_reference_protocol).toMatchObject({ lines: 2 });
      expect(metrics.provider_hint).toMatchObject({ lines: 2 });
      expect(metrics.selected_agent_runtime_prompt).toMatchObject({ lines: 5 });
      expect(metrics.avoided_provider_variant_duplication).toBeNull();
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

    test("provider docs describe single ADV runtime hints, manual migration, and metrics", () => {
      for (const required of [
        "one runtime orchestrator agent: `adv`",
        "Runtime Hint Mapping",
        "output.system[0]",
        "Manual One-Time Migration",
        "agent.adv-{provider}.prompt",
        "lean_adv_runtime_prompt",
        "adv_reference_protocol",
        "provider_hint",
        "adv_dynamic_system_block_estimate",
        "caveman_voice_contract_allowance",
        "selected_agent_runtime_prompt",
      ]) {
        expect(`${assemblyDoc}\n${smokeDoc}`).toContain(required);
      }
      expect(assemblyDoc).toContain("lean canonical runtime prompt");
      expect(assemblyDoc).not.toContain(
        "global adv.md = canonical ADV body + ADV_INSTRUCTIONS.md",
      );
    });

    test("setup docs document deploy-local jq and rsync dependencies", () => {
      const setupDoc = readFileSync(join(REPO_ROOT, "SETUP.md"), "utf8");
      const agentsDoc = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
      const projectDoc = readFileSync(join(REPO_ROOT, "project.md"), "utf8");

      expect(setupDoc).toContain("rsync");
      expect(`${agentsDoc}\n${projectDoc}`).toContain(
        "rsync` for runtime plugin deployment",
      );
      expect(setupDoc).not.toContain("generated ADV provider prompts");
    });

    test("advance-meta spec contains provider runtime and metrics requirements", () => {
      expect(requirementIds).toContain("rq-providerAdvSkinny01");
      expect(requirementIds).toContain("rq-providerAdvMetrics01");
      expect(requirementIds).toContain("rq-scopedAdvInstructions01");
      expect(scenarioIds).toContain("rq-providerAdvSkinny01.1");
      expect(scenarioIds).toContain("rq-providerAdvSkinny01.1a");
      expect(scenarioIds).toContain("rq-providerAdvSkinny01.2");
    });

    test("advance-meta markdown mirror is synced to spec metadata and new laws", () => {
      const specDoc = readFileSync(ADVANCE_META_SPEC_DOC_PATH, "utf8");

      expect(specDoc).toContain("> **Version:** 1.11.0");
      expect(specDoc).toContain("> **Updated:** 2026-05-22");
      expect(specDoc).toContain("**ID:** `rq-providerAdvSkinny01`");
      expect(specDoc).toContain("**ID:** `rq-providerAdvMetrics01`");
      expect(specDoc).toContain("**ID:** `rq-scopedAdvInstructions01`");
      expect(specDoc).toContain("**ID:** `rq-clarifyEnforcementAudit01`");
      expect(specDoc).toContain("**ID:** `rq-noSourceChecklistReads01`");
    });

    test("advance-meta spec no longer requires full ADV_INSTRUCTIONS runtime append", () => {
      const specText = readFileSync(ADVANCE_META_SPEC_PATH, "utf8");

      expect(specText).toContain("lean ADV runtime prompt");
      expect(specText).toContain("runtime protocol coverage inventory");
      expect(specText).toContain("adv_reference_protocol");
      expect(specText).toContain("caveman_voice_contract_allowance");
      expect(specText).not.toContain(
        "Global adv.md contains the canonical ADV body and ADV_INSTRUCTIONS.md protocol content",
      );
      expect(specText).not.toContain(
        "The effective static prompt order is canonical ADV body, then ADV_INSTRUCTIONS.md body",
      );
    });

    test("runtime protocol coverage inventory preserves critical ADV invariants", () => {
      const coverageDoc = readFileSync(RUNTIME_PROTOCOL_COVERAGE_PATH, "utf8");
      const advAgent = readFileSync(ADV_AGENT_PATH, "utf8");

      for (const required of [
        "slash-command boundary",
        "gate sequencing",
        "human checkpoints",
        "ADV state access",
        "worktree isolation",
        "due-diligence routing",
        "intent routing",
        "MCP tool-name contract",
        "sub-agent policy",
        "output handoff voice",
        "sign-off boundary",
        "cancellation approval",
        "TDD/completion expectations",
        "single-system-block discipline",
      ]) {
        expect(coverageDoc).toContain(required);
      }

      expect(coverageDoc).toContain("Source-of-truth coverage matrix");
      expect(coverageDoc).not.toContain("| planned |");
      expect(advAgent).toContain("## Slash Command Boundary");
      expect(advAgent).toContain("## Step 3: Gate Machine");
      expect(advAgent).toContain("### Human Checkpoints vs Auto-Continue");
      expect(advAgent).toContain("## ADV State Access Policy");
      expect(advAgent).toContain("### Worktree Isolation Routing");
    });

    test("advance-meta spec captures worker heartbeat and run-loop health requirements", () => {
      const parsed = SpecSchema.parse(spec);
      const timeoutOverride = parsed.requirements.find(
        (rq) => rq.id === "rq-toolTimeoutOverride01",
      );
      const workerSingleton = parsed.requirements.find(
        (rq) => rq.id === "rq-workerSingleton01",
      );
      const workerHealth = parsed.requirements.find(
        (rq) => rq.id === "rq-workerHealth01",
      );

      const restartScenario = timeoutOverride?.scenarios?.find(
        (s) => s.id === "rq-toolTimeoutOverride01.2",
      );
      expect(restartScenario?.title).toBe(
        "adv_temporal_worker_restart uses bounded verified recovery",
      );
      expect(restartScenario?.then.join("\n")).toContain(
        "returns success:true only when serviceability is proven",
      );
      expect(restartScenario?.then.join("\n")).toContain(
        "explicit safety-net timeout override",
      );

      expect(workerSingleton?.body).toContain("heartbeat");
      expect(workerSingleton?.body).toContain("v1 fallback");
      expect(workerSingleton?.body).toContain("serviceable queue");
      // Re-entry: body extended for fresh-v2 unserviceable suspect classification
      // and self-expiry guidance (rq-workerSingleton01.7/.8).
      expect(workerSingleton?.body).toContain("unserviceable");
      expect(workerSingleton?.body).toContain("stop renewing");
      expect(workerSingleton?.scenarios).toHaveLength(9);
      expect(scenarioIds).toContain("rq-workerSingleton01.5");
      expect(scenarioIds).toContain("rq-workerSingleton01.6");
      expect(scenarioIds).toContain("rq-workerSingleton01.7");
      expect(scenarioIds).toContain("rq-workerSingleton01.8");
      expect(scenarioIds).toContain("rq-workerSingleton01.9");
      expect(
        workerSingleton?.scenarios?.find(
          (s) => s.id === "rq-workerSingleton01.2",
        )?.given,
      ).toContain(
        "A worker.lock file exists and the recorded PID is alive (process.kill(pid, 0) succeeds or throws EPERM)",
      );
      expect(
        workerSingleton?.scenarios
          ?.find((s) => s.id === "rq-workerSingleton01.6")
          ?.then.join("\n"),
      ).toContain("explicit user approval evidence");
      expect(
        workerSingleton?.scenarios
          ?.find((s) => s.id === "rq-workerSingleton01.7")
          ?.then.join("\n"),
      ).toContain("suspect_live_unserviceable_lock");
      expect(
        workerSingleton?.scenarios
          ?.find((s) => s.id === "rq-workerSingleton01.8")
          ?.then.join("\n"),
      ).toContain("stop renewing the heartbeat");
      expect(
        workerSingleton?.scenarios
          ?.find((s) => s.id === "rq-workerSingleton01.9")
          ?.then.join("\n"),
      ).toContain("worker_role");
      expect(workerHealth?.scenarios).toHaveLength(4);
      expect(scenarioIds).toContain("rq-workerHealth01.1");
      expect(scenarioIds).toContain("rq-workerHealth01.2");
      expect(scenarioIds).toContain("rq-workerHealth01.3");
      expect(scenarioIds).toContain("rq-workerHealth01.4");
      expect(
        workerHealth?.scenarios
          ?.find((s) => s.id === "rq-workerHealth01.3")
          ?.then.join("\n"),
      ).toContain("liveness evidence only");
      expect(
        workerHealth?.scenarios
          ?.find((s) => s.id === "rq-workerHealth01.4")
          ?.then.join("\n"),
      ).toContain("STSL");
    });

    test("advance-meta spec captures stability feature-flag defaults and probe freshness", () => {
      const parsed = SpecSchema.parse(spec);
      const advConfig = parsed.requirements.find(
        (rq) => rq.id === "rq-advcfg01",
      );
      const probeCache = parsed.requirements.find(
        (rq) => rq.id === "rq-statusProbeCache01",
      );

      expect(
        advConfig?.scenarios
          ?.find((s) => s.id === "rq-advcfg01.2")
          ?.then.join("\n"),
      ).toContain("worker_singleton_enforce defaults false");
      expect(
        advConfig?.scenarios
          ?.find((s) => s.id === "rq-advcfg01.2")
          ?.then.join("\n"),
      ).toContain("worktree_guard_enforce defaults true");
      expect(probeCache).toBeDefined();
      expect(probeCache?.body).toContain("_freshness");
      expect(probeCache?.scenarios?.map((s) => s.id)).toEqual(
        expect.arrayContaining([
          "rq-statusProbeCache01.1",
          "rq-statusProbeCache01.2",
        ]),
      );
    });

    test("worktree-lifecycle spec captures ADV mutation guard", () => {
      const worktreeSpec = JSON.parse(
        readFileSync(WORKTREE_LIFECYCLE_SPEC_PATH, "utf8"),
      );
      const parsed = SpecSchema.parse(worktreeSpec);
      const guard = parsed.requirements.find(
        (rq) => rq.id === "rq-worktreeMutationGuard01",
      );

      expect(guard).toBeDefined();
      expect(guard?.body).toContain("main checkout");
      expect(guard?.body).toContain("proposal gate");
      expect(guard?.scenarios?.map((s) => s.id)).toEqual(
        expect.arrayContaining([
          "rq-worktreeMutationGuard01.1",
          "rq-worktreeMutationGuard01.2",
          "rq-worktreeMutationGuard01.3",
        ]),
      );
    });

    test("advance-meta spec captures worktree-reuse preflight requirement", () => {
      const parsed = SpecSchema.parse(spec);
      const worktreeReuse = parsed.requirements.find(
        (rq) => rq.id === "rq-worktreeReuse01",
      );
      expect(worktreeReuse).toBeDefined();
      expect(worktreeReuse?.body).toContain("reuse the existing worktree");
      expect(worktreeReuse?.body).toContain("MUST NOT recommend in-place");
      expect(worktreeReuse?.scenarios).toHaveLength(2);
      expect(scenarioIds).toContain("rq-worktreeReuse01.1");
      expect(scenarioIds).toContain("rq-worktreeReuse01.2");
    });
  });

  describe("canonical ADV prompt compression", () => {
    const advAgent = readFileSync(ADV_AGENT_PATH, "utf8");

    test("canonical ADV prompt stays under the safe compression ceiling", () => {
      const lines = advAgent.split(/\r?\n/).length;
      // Ceiling raised from 361 → 362 after adding explicit typed worker
      // packet phase mapping for adv-reviewer acceptance/release use.
      // Ceiling raised from 360 → 361 after the signal-driven workflow
      // refactor exposed `adv_worktree_resume` and we added it to the
      // canonical allowlist to clear deploy-local tool-drift checks.
      // Re-ratchet here once the prompt has been audited for excess.
      expect(lines).toBeLessThanOrEqual(362);
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
        "acceptance reviews use `review`",
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

    test("deploy-local.sh covers skills/adv-* glob", () => {
      // Pattern must match the adv-* prefix so adv-worktree (and future
      // adv-<name> skills) are picked up by the sync loop.
      expect(content).toMatch(/skills.*adv-/);
      expect(content).toContain('"$REPO_SKILLS"/adv-*/');
    });

    test("deploy-local.sh removes stale adv-* skills from global", () => {
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
