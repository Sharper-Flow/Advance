/**
 * rq-recoverySurfaceParity01 (tk-0528be678596, design D6 / DDC7 / AC7)
 *
 * Removal-parity test: the four adv_temporal_* operator tools are retired
 * because adv_doctor (added in tk-dc21b6a3658d) consolidates their safe
 * subset into a single diagnose→safe-fix→verify entry point.
 *
 * Scope: this test guards the RUNTIME surface — the files that actually
 * control tool availability and behavior (registry bindings, role policy,
 * arg preflight, catalog entries, hint refs in production tool code). The
 * documentation/spec asset cascade (agent .md files, docs/tool-ownership.md,
 * spec.json rq-toolOwnership01 body) is a separate spec-evolution follow-up
 * tracked in ws-REMAINING; it requires careful spec-law edits, not just
 * deletion, and is excluded here to keep this guard focused on the
 * availability surface an operator/agent actually touches.
 *
 * All eight superseded recovery tools are now retired and consolidated
 * into adv_doctor (design D6 / rq-recoverySurfaceParity01). adv_change_forget
 * is replaced by adv_doctor's phantom_pointer safe-fix (option B): a
 * tri-state probe clears the session pointer only on confirmed-absent
 * evidence and refuses on indeterminate. The poisoned_history public-arg
 * removal is tracked separately.
 */
import { describe, test } from "vitest";
import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { readdirSync, statSync } from "node:fs";

const SRC_ROOT = join(__dirname, "..");

const RETIRED_TOOLS = [
  "adv_temporal_diagnose",
  "adv_temporal_reconnect",
  "adv_temporal_register_search_attributes",
  "adv_temporal_worker_restart",
  "adv_archive_repair",
  "adv_change_status_repair",
  "adv_epic_repair_membership",
  "adv_change_forget",
] as const;

/**
 * Files where references to retired tools are still allowed at this stage.
 * Each entry must cite the legitimate reason.
 */
const ALLOWED_REFERENCE_FILES: Record<string, string> = {
  "recovery-surface-parity.test.ts":
    "this test defines the retired set — self-reference is unavoidable",
  "doctor.ts": "doctor handler remains available to the CLI entry point",
  "doctor.test.ts":
    "doctor handler tests reference the diagnostics behavior by name for clarity",
  "tool-registry.inventory.test.ts":
    "CONTRACTED_PUBLIC_REMOVALS lists the retired names to keep the canonical public-tool count pinned; the names are data, not active surface",
};

/**
 * File-prefix patterns for documentation / asset / spec files that are
 * excluded from runtime parity. These files describe the tool surface in
 * prose/spec form and require coordinated spec evolution tracked separately.
 */
const ASSET_DOC_SPEC_PATTERNS: Array<RegExp> = [
  /assets?\.test\.ts$/,
  /docs\/tool-ownership\.md$/,
  /\.adv\/specs\/.*\/spec\.json$/,
  // Agent definition markdown files (e.g., adv-temporal-repair.md) carry
  // tool grants for the documented tool surface; their update is bundled
  // with the agent-definition revision, not this runtime retirement.
  /\.opencode\/agents\/.*\.md$/,
  // deploy-local asserts the deploy script's description string carries
  // bounded-recovery language; that asset-string update ships with the
  // release-notes revision, not this runtime retirement.
  /deploy-local\.test\.ts$/,
];

function isExempt(path: string): boolean {
  const filename = basename(path);
  if (Object.prototype.hasOwnProperty.call(ALLOWED_REFERENCE_FILES, filename)) {
    return true;
  }
  return ASSET_DOC_SPEC_PATTERNS.some((re) => re.test(path));
}

function* walkTs(dir: string, root: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip asset/doc/spec trees from the walk entirely — they're exempt
      // by pattern, but skipping also speeds the scan.
      if (full.includes("node_modules")) continue;
      yield* walkTs(full, root);
    } else if (extname(full) === ".ts") {
      yield full;
    }
  }
}

function activeReferenceCount(content: string, tool: string): number {
  let count = 0;
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes(tool)) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    count++;
  }
  return count;
}

describe("recovery surface parity — adv_temporal_* runtime retirements (rq-recoverySurfaceParity01)", () => {
  test("retired tool names are not present in runtime code (registry/policy/preflight/catalog/hints)", () => {
    const violations: Array<{
      file: string;
      tool: string;
      count: number;
    }> = [];

    for (const file of walkTs(SRC_ROOT, SRC_ROOT)) {
      if (isExempt(file)) continue;
      const content = readFileSync(file, "utf8");
      for (const tool of RETIRED_TOOLS) {
        const count = activeReferenceCount(content, tool);
        if (count > 0) {
          violations.push({ file, tool, count });
        }
      }
    }

    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `  ${v.file}: ${v.tool} × ${v.count}`)
        .join("\n");
      throw new Error(
        `Active runtime references to retired adv_temporal_* tools found:\n${formatted}\n\n` +
          `These tools were consolidated into adv_doctor (tk-dc21b6a3658d). ` +
          `Remove the runtime surface or update the reference to point at adv_doctor.`,
      );
    }
  });
});
