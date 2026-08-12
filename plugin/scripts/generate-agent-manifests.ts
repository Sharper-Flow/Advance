#!/usr/bin/env tsx
/**
 * Agent manifest generator.
 *
 * Rewrites the ADV-generated portion of each shipped agent's `tools:` YAML
 * frontmatter block from the single source of truth in `AGENT_TOOL_POLICY`.
 * The generator is marker-bounded: it preserves every byte outside the
 * `# >>> ADV-GENERATED ...` / `# <<< ADV-GENERATED ...` sentinel pair and
 * regenerates only the content between them.
 *
 * Usage:
 *   tsx scripts/generate-agent-manifests.ts              # write mode
 *   tsx scripts/generate-agent-manifests.ts --check      # verify, exit 1 on drift
 */

import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { AGENT_TOOL_POLICY } from "../src/tool-role-policy";

export const ADV_TOOLS_BLOCK_START =
  "  # >>> ADV-GENERATED adv_* tools (source: AGENT_TOOL_POLICY) >>>";
export const ADV_TOOLS_BLOCK_END = "  # <<< ADV-GENERATED adv_* tools <<<";

/**
 * Append this note to the hand-owned invoke-routing paragraph that follows
 * the generated block. It explains that the Tier-4 MCP read surface is also
 * reachable through Code Mode as `tools.adv.*` even when the host-plugin
 * manifest denies `adv_*`.
 */
const TIER_4_INVOKE_ROUTING_NOTE =
  " Tier-4 reads (the catalog returned by `adv_tool_catalog`) also via tools.adv.* Code Mode; invoke-only schemas are available through the invoke facade.";

const ADV_TOOL_ENTRY_RE = /^\s+(adv_[A-Za-z0-9_*]+):\s*(true|false)\s*$/;

function isAdvEntry(line: string): boolean {
  return ADV_TOOL_ENTRY_RE.test(line);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Generate the content that lives between the two sentinel markers. */
export function generateAdvToolsBlock(agent: string): string {
  const policy = AGENT_TOOL_POLICY.find((p) => p.agent === agent);
  if (!policy) {
    throw new Error(
      `No AGENT_TOOL_POLICY row for agent "${agent}". Add a row before shipping this manifest.`,
    );
  }

  const lines: string[] = [];

  if (policy.denyWildcard) {
    lines.push("  adv_*: false");
  }

  const allowed = sortedUnique(policy.allowed);
  for (const tool of allowed) {
    lines.push(`  ${tool}: true`);
  }

  const blocked = sortedUnique(policy.explicitBlocked);
  for (const tool of blocked) {
    lines.push(`  ${tool}: false`);
  }

  if (lines.length === 0) {
    return "";
  }

  return lines.join("\n") + "\n";
}

function findFirstAdvEntryLine(lines: string[]): number | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (isAdvEntry(lines[i])) {
      return i;
    }
  }
  return undefined;
}

function findLastAdvEntryLine(lines: string[]): number | undefined {
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isAdvEntry(lines[i])) {
      last = i;
    }
  }
  if (last === -1) return undefined;
  return last;
}

function findMarkerLines(lines: string[]): {
  startIndex: number;
  endIndex: number;
} | null {
  const startIndexes: number[] = [];
  const endIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === ADV_TOOLS_BLOCK_START.trim()) {
      startIndexes.push(i);
    } else if (trimmed === ADV_TOOLS_BLOCK_END.trim()) {
      endIndexes.push(i);
    }
  }

  if (startIndexes.length === 0 && endIndexes.length === 0) {
    return null;
  }

  if (startIndexes.length !== 1 || endIndexes.length !== 1) {
    throw new Error(
      `Incomplete marker pair: expected exactly one ADV-GENERATED marker pair, found ${startIndexes.length} start markers and ${endIndexes.length} end markers`,
    );
  }

  const startIndex = startIndexes[0];
  const endIndex = endIndexes[0];
  if (startIndex >= endIndex) {
    throw new Error(
      `Malformed ADV-GENERATED marker pair: start index ${startIndex} is not before end index ${endIndex}`,
    );
  }

  return { startIndex, endIndex };
}

function groupGeneratedBlock(
  generatedLines: string[],
): { commentLines: string[]; entryLine: string }[] {
  const groups: { commentLines: string[]; entryLine: string }[] = [];
  let currentComments: string[] = [];
  for (const line of generatedLines) {
    if (isAdvEntry(line)) {
      groups.push({ commentLines: currentComments, entryLine: line });
      currentComments = [];
    } else {
      currentComments.push(line);
    }
  }
  return groups;
}

const GENERATED_COMMENT_LINES = new Set([
  "  # ADV tool grants (generated from AGENT_TOOL_POLICY — do not edit by hand)",
  "  # Default-deny wildcard",
  "  # Allowed",
  "  # Explicitly blocked",
]);

function managedCommentLines(): Set<string> {
  return GENERATED_COMMENT_LINES;
}

function mergeRegionWithGenerated(
  originalRegion: string[],
  generatedBlock: string,
  agent: string,
): string[] {
  const generatedLines = generatedBlock.split("\n");
  if (
    generatedLines.length > 0 &&
    generatedLines[generatedLines.length - 1] === ""
  ) {
    generatedLines.pop();
  }
  const groups = groupGeneratedBlock(generatedLines);
  const staleComments = managedCommentLines(agent);
  let groupIndex = 0;
  const merged: string[] = [];

  for (const line of originalRegion) {
    if (isAdvEntry(line)) {
      if (groupIndex < groups.length) {
        const group = groups[groupIndex];
        merged.push(...group.commentLines, group.entryLine);
        groupIndex++;
      }
      // If the original region contains more adv_* entries than the policy
      // generates, the surplus entries are dropped so the output stays in sync
      // with AGENT_TOOL_POLICY. Any non-adv_* lines surrounding them are still
      // preserved.
    } else if (!staleComments.has(line)) {
      // Preserve hand-owned non-adv_* lines (comments, blank lines, built-in
      // tool grants, etc.) but drop stale generated comments so they are
      // refreshed from AGENT_TOOL_POLICY.
      merged.push(line);
    }
  }

  // If the original region was shorter than the generated block (e.g., a
  // first-run manifest that only listed a subset of tools), append the
  // remaining generated entries after the preserved non-adv_* lines.
  while (groupIndex < groups.length) {
    const group = groups[groupIndex];
    merged.push(...group.commentLines, group.entryLine);
    groupIndex++;
  }

  return merged;
}

/**
 * Generate the full manifest content for an agent, preserving everything
 * outside the marker pair and any hand-owned non-adv_* lines inside the
 * marker pair.
 *
 * On first-run (markers missing), the markers are inserted around the existing
 * adv_* entry region so the file can round-trip deterministically afterwards.
 */
export function generateManifestContent(
  content: string,
  agent: string,
): string {
  const lines = content.split("\n");
  const markers = findMarkerLines(lines);

  if (markers) {
    const originalRegion = lines.slice(
      markers.startIndex + 1,
      markers.endIndex,
    );
    const generated = generateAdvToolsBlock(agent);
    const merged = mergeRegionWithGenerated(originalRegion, generated, agent);
    const before = lines.slice(0, markers.startIndex + 1);
    const after = lines.slice(markers.endIndex);
    return injectTier4InvokeRoutingNote(
      [...before, ...merged, ...after].join("\n"),
    );
  }

  // First run: locate the first and last adv_* entry lines and wrap them.
  const first = findFirstAdvEntryLine(lines);
  const last = findLastAdvEntryLine(lines);
  if (first === undefined || last === undefined) {
    throw new Error(
      `Cannot locate adv_* entry region in manifest for "${agent}"; markers are missing and no adv_* entries were found`,
    );
  }

  const originalRegion = lines.slice(first, last + 1);
  const generated = generateAdvToolsBlock(agent);
  const merged = mergeRegionWithGenerated(originalRegion, generated, agent);

  const before = lines.slice(0, first);
  const after = lines.slice(last + 1);
  const result = [
    ...before,
    ADV_TOOLS_BLOCK_START,
    ...merged,
    ADV_TOOLS_BLOCK_END,
    ...after,
  ].join("\n");

  return injectTier4InvokeRoutingNote(result);
}

/**
 * Synchronise the Tier-4 Code Mode note on the hand-owned invoke-routing
 * paragraph.
 *
 * Frontmatter-aware (rq-advOwnedFrontmatterValid01): the note MUST live in
 * the prompt body (after the closing `---`), never inside frontmatter. A `>`
 * line inside YAML frontmatter is parsed as a folded-block-scalar indicator
 * with no key, which silently discards the entire `tools:` map. This function
 * detects such misplacement and relocates the note to the body.
 *
 * Idempotent: re-runs with a changed TIER_4_INVOKE_ROUTING_NOTE do not
 * accumulate duplicates.
 */
export function injectTier4InvokeRoutingNote(content: string): string {
  const lines = content.split("\n");

  // Locate the closing --- of frontmatter.
  let fmEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
  }

  // Locate the invoke-routing note line anywhere in the content.
  const noteRe = /^> \*\*Invoke routing:\*\*/;
  let noteIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (noteRe.test(lines[i])) {
      noteIdx = i;
      break;
    }
  }

  // No hand-owned note paragraph — nothing to manage.
  if (noteIdx < 0) return content;

  // Strip any previously-injected Tier-4 suffix (idempotent), keeping the
  // base paragraph up to and including the "for schemas." anchor.
  const baseNote = lines[noteIdx].replace(/(for schemas\.).*$/s, "$1");
  const fullNote = baseNote + TIER_4_INVOKE_ROUTING_NOTE;

  // If the note is inside frontmatter, relocate it to the body (after `---`).
  if (fmEnd >= 0 && noteIdx <= fmEnd) {
    const withoutNote = lines.filter((_, i) => i !== noteIdx);
    const adjustedFmEnd = noteIdx < fmEnd ? fmEnd - 1 : fmEnd;
    return [
      ...withoutNote.slice(0, adjustedFmEnd + 1),
      fullNote,
      ...withoutNote.slice(adjustedFmEnd + 1),
    ].join("\n");
  }

  // Note is already in the body — update in place.
  lines[noteIdx] = fullNote;
  return lines.join("\n");
}

function resolveAgentsDir(): string {
  // This script lives in plugin/scripts/, so the repo root is two levels up.
  const scriptDir = resolve(fileURLToPath(import.meta.url), "..");
  const repoRoot = resolve(scriptDir, "../..");
  return join(repoRoot, ".opencode/agents");
}

export interface GenerateResult {
  ok: boolean;
  diffs: string[];
}

export async function runGenerate(options: {
  check: boolean;
  agentsDir?: string;
}): Promise<GenerateResult> {
  const agentsDir = options.agentsDir ?? resolveAgentsDir();
  const diffs: string[] = [];

  for (const policy of AGENT_TOOL_POLICY) {
    const path = join(agentsDir, `${policy.agent}.md`);
    const content = readFileSync(path, "utf8");
    const generated = generateManifestContent(content, policy.agent);

    const contentChanged = generated !== content;
    const nonAdvChanged =
      nonAdvLines(content, policy.agent).join("\n") !==
      nonAdvLines(generated, policy.agent).join("\n");

    if (contentChanged || nonAdvChanged) {
      if (options.check) {
        diffs.push(` drift: ${policy.agent}.md`);
      } else {
        writeFileSync(path, generated, "utf8");
      }
    }
  }

  if (diffs.length > 0) {
    return { ok: false, diffs };
  }
  return { ok: true, diffs: [] };
}

function nonAdvLines(content: string, agent: string): string[] {
  const managed = managedCommentLines(agent);
  return content.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (trimmed === ADV_TOOLS_BLOCK_START.trim()) return false;
    if (trimmed === ADV_TOOLS_BLOCK_END.trim()) return false;
    if (isAdvEntry(line)) return false;
    return !managed.has(line);
  });
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const result = await runGenerate({ check });

  if (!result.ok) {
    console.error("Agent manifest drift detected:");
    for (const diff of result.diffs) {
      console.error(diff);
    }
    console.error(
      `Run "pnpm run generate:manifests" to regenerate the committed manifests.`,
    );
    process.exit(1);
  }

  console.log(
    check
      ? "All agent manifests match generated output."
      : "Agent manifests generated successfully.",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

// Also export a named main for testing if needed.
export { main };
