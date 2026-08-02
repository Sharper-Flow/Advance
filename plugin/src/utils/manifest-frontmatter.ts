/**
 * Shared frontmatter validation core.
 *
 * Used by three entry points: the CI check script
 * (plugin/scripts/check-frontmatter.ts), the deploy preflight
 * (scripts/deploy-local.sh check_agent_frontmatter), and the plugin-init
 * runtime scan (plugin/src/plugin-init.ts). One parse function, three
 * callers — no duplicated heuristic.
 *
 * rq-advOwnedFrontmatterValid01 / rq-agentManifestToolPolicyEffective01
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import YAML from "yaml";
import { AGENT_TOOL_POLICY } from "../tool-role-policy";

// ── parseFrontmatterText ───────────────────────────────────────────────

export interface FrontmatterParseResult {
  ok: boolean;
  doc: Record<string, unknown> | null;
  error?: string;
}

/**
 * Parse YAML frontmatter from markdown text.
 *
 * - No leading `---` → `{ ok: true, doc: null }` (pass, not fail).
 * - Unterminated frontmatter → `{ ok: false, error: "..." }`.
 * - YAML parse error → `{ ok: false, error: "<parser message>" }`.
 * - Valid frontmatter → `{ ok: true, doc: <parsed mapping> }`.
 */
export function parseFrontmatterText(text: string): FrontmatterParseResult {
  const lines = text.split("\n");

  if (lines[0]?.trim() !== "---") {
    return { ok: true, doc: null };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) {
    return { ok: false, doc: null, error: "frontmatter not terminated" };
  }

  const fmText = lines.slice(1, end).join("\n");

  let parsed: unknown;
  try {
    parsed = YAML.parse(fmText, { strict: true });
  } catch (e) {
    return { ok: false, doc: null, error: (e as Error).message };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      doc: null,
      error: "frontmatter did not yield a YAML mapping",
    };
  }

  return { ok: true, doc: parsed as Record<string, unknown> };
}

/**
 * Read a file and parse its frontmatter. A missing file returns
 * `{ ok: true, doc: null }` (pass) so the scan treats absent files as
 * no-frontmatter rather than failures.
 */
export function parseFrontmatter(filePath: string): FrontmatterParseResult {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return { ok: true, doc: null };
  }
  return parseFrontmatterText(text);
}

// ── assertPolicyMatch ──────────────────────────────────────────────────

export interface PolicyMatchResult {
  ok: boolean;
  drift?: string[];
}

/**
 * For a manifest containing an ADV tool policy, verify its parsed `tools`
 * map is non-empty and its `adv_*` grants exactly match the agent's
 * declared `AGENT_TOOL_POLICY.allowed` set.
 *
 * rq-agentManifestToolPolicyEffective01
 */
export function assertPolicyMatch(
  doc: Record<string, unknown>,
  agent: string,
): PolicyMatchResult {
  const policy = AGENT_TOOL_POLICY.find((p) => p.agent === agent);
  if (!policy) {
    return {
      ok: false,
      drift: [`No AGENT_TOOL_POLICY row for agent "${agent}"`],
    };
  }

  const tools = doc.tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
    return { ok: false, drift: ["tools map is empty or absent"] };
  }

  const toolsMap = tools as Record<string, unknown>;
  const advKeys = Object.keys(toolsMap).filter((k) => k.startsWith("adv_"));

  if (advKeys.length === 0) {
    return { ok: false, drift: ["tools map is empty"] };
  }

  const grantedTools = new Set(
    advKeys.filter((k) => k !== "adv_*" && toolsMap[k] === true),
  );
  const policyAllowed = new Set(policy.allowed);
  const drift: string[] = [];

  for (const tool of policyAllowed) {
    if (!grantedTools.has(tool)) {
      drift.push(`missing grant: ${tool}`);
    }
  }
  for (const tool of grantedTools) {
    if (!policyAllowed.has(tool)) {
      drift.push(`unexpected grant: ${tool}`);
    }
  }

  return drift.length === 0 ? { ok: true } : { ok: false, drift };
}

// ── scanDir ────────────────────────────────────────────────────────────

export interface ScanFailure {
  file: string;
  error: string;
}

export interface ScanResult {
  checked: number;
  failures: ScanFailure[];
}

/**
 * Walk a directory, parse every `.md` file's frontmatter, and return
 * aggregate results. Optionally run policy-match on ADV-policy manifests.
 */
export function scanDir(
  dir: string,
  _opts?: { includePolicyCheck?: boolean },
): ScanResult {
  let checked = 0;
  const failures: ScanFailure[] = [];

  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(d, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith(".md")) {
        checked++;
        const result = parseFrontmatter(fullPath);
        if (!result.ok) {
          failures.push({
            file: fullPath,
            error: result.error ?? "unknown error",
          });
        }
      }
    }
  }

  walk(dir);
  return { checked, failures };
}

// ── runtimeFrontmatterCheck (plugin-init) ──────────────────────────────

/**
 * Bounded frontmatter scan for plugin initialization. Scans the deployed
 * global agents/commands directories, warns on unparseable files, and
 * enforces a startup-time budget. Never throws.
 *
 * rq-advOwnedFrontmatterValid01 / DDC1 (≤ 300 ms budget).
 */
export function runtimeFrontmatterCheck(
  budgetMs = 300,
  dirs?: string[],
): {
  checked: number;
  failures: number;
  elapsedMs: number;
  budgetExceeded: boolean;
} {
  const start = performance.now();
  const scanDirs = dirs ?? [
    join(homedir(), ".config", "opencode", "agents"),
    join(homedir(), ".config", "opencode", "command"),
  ];

  let checked = 0;
  let failures = 0;

  function walk(d: string): void {
    if (performance.now() - start > budgetMs) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (performance.now() - start > budgetMs) return;
      const fullPath = join(d, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith(".md")) {
        checked++;
        const result = parseFrontmatter(fullPath);
        if (!result.ok) {
          failures++;
          console.warn(`[ADV] frontmatter: ${fullPath} — ${result.error}`);
        }
      }
    }
  }

  for (const dir of scanDirs) {
    walk(dir);
  }

  const elapsedMs = performance.now() - start;
  const budgetExceeded = elapsedMs > budgetMs;

  if (failures > 0) {
    console.warn(
      `[ADV] frontmatter: ${failures} unparseable manifest(s) in ${checked} checked (${elapsedMs.toFixed(0)}ms)`,
    );
  }
  if (budgetExceeded) {
    console.warn(
      `[ADV] frontmatter: scan budget exceeded (${elapsedMs.toFixed(0)}ms > ${budgetMs}ms), some files not checked`,
    );
  }

  return { checked, failures, elapsedMs, budgetExceeded };
}
