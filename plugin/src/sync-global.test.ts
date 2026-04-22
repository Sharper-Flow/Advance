import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const SYNC_SCRIPT_PATH = join(REPO_ROOT, "scripts/sync-global.sh");

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

    test("adv-engineer.md is explicitly named in stale-agent cleanup glob", () => {
      expect(content).toContain('"$GLOBAL_AGENTS"/adv-engineer.md');
      // Legacy bare "engineer.md" path must no longer appear in the cleanup glob
      expect(content).not.toMatch(/"\$GLOBAL_AGENTS"\/engineer\.md/);
    });

    test("adv-tron.md is explicitly named in stale-agent cleanup glob", () => {
      expect(content).toContain('"$GLOBAL_AGENTS"/adv-tron.md');
      // Legacy bare "tron.md" path must no longer appear in the cleanup glob
      expect(content).not.toMatch(/"\$GLOBAL_AGENTS"\/tron\.md/);
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
});
