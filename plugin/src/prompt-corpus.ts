/**
 * Active prompt corpus helpers (rq: updateCodemodeMcpContracts).
 *
 * Derives the active Advance prompt corpus from recursive deployment
 * ownership (scripts/deploy-local.sh), parses YAML frontmatter separately
 * from prompt-body prose, assembles effective agent prompts (overlay
 * semantics), and exposes the single mode-neutral external-MCP invocation
 * contract plus structural scans for one-mode invocation claims.
 *
 * Deployment ownership model (deploy-local.sh):
 *   - .opencode/agents/*.md            -> synced to global agents
 *   - .opencode/overlays/*.overlay.md  -> managed ADV_SYNC blocks spliced
 *                                         into shared agents (general/build/plan)
 *   - .opencode/command/adv-*.md       -> synced to global commands
 *   - skills/<adv-*>/ (whole dir, recursive) -> synced to global skills
 *                                         (ADR-002: SKILL.md + siblings)
 *   - ADV_INSTRUCTIONS.md, SETUP.md    -> canonical reference prose
 * `.adv/**` (archives) is never part of the active corpus.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

/**
 * The one mode-neutral external-MCP invocation contract. Canonical text is
 * fixed here; prompt assets carry it verbatim and the structural tests count
 * occurrences per effective assembled prompt.
 */
export const MCP_ACTIVE_SURFACE_CONTRACT =
  "For external MCP capabilities, use only the active tool surface. " +
  "If `execute` is exposed, follow its generated catalog and exact returned paths. " +
  "Otherwise use direct MCP callables exactly as exposed. " +
  "Never infer availability from prose or normalize identifiers; report an absent capability as unavailable.";

/** External MCP provider prefixes (built-in and ADV plugin tools excluded). */
export const EXTERNAL_MCP_PREFIXES = [
  "lgrep",
  "searchcode",
  "context7",
  "exa",
  "firecrawl",
  "vision",
] as const;

const PREFIX_ALTERNATION = EXTERNAL_MCP_PREFIXES.join("|");

/**
 * Concrete external MCP callable spellings, e.g. `searchcode_code_search`,
 * `context7_resolve-library-id`. Wildcard grants (`context7_*`) and bare
 * provider names do not match: the tail must start alphanumeric.
 */
export const CONCRETE_MCP_SPELLING = new RegExp(
  `\\b(?:${PREFIX_ALTERNATION})_[A-Za-z0-9][A-Za-z0-9._-]*`,
  "g",
);

/**
 * Unconditional one-mode invocation claims: prose asserting external MCP
 * tools are invoked through one fixed spelling regardless of session mode.
 */
export const ONE_MODE_CLAIM =
  /exact schema identifiers|exact tool names|MCP callable names are exact|Never normalize MCP names/i;

/**
 * OpenCode-generated CodeMode catalog signature prose (namespaced catalog
 * paths or catalog machinery). Advance must never duplicate the generated
 * catalog; OpenCode remains sole authority for its syntax.
 */
export const CATALOG_SIGNATURE = new RegExp(
  `\\btools\\.(?:${PREFIX_ALTERNATION})\\.|\\$codemode`,
  "i",
);

/** Backtick spans citing permission keys, e.g. `firecrawl_firecrawl_scrape: true`. */
const CONFIG_CITATION_SPAN = /`[^`\n]*:\s*(?:true|false)[^`\n]*`/g;

/** Permission-key-shaped body line, e.g. `  lgrep_search_semantic: true`. */
const PERMISSION_KEY_LINE = new RegExp(
  `^\\s*(?:${PREFIX_ALTERNATION})_\\S+:\\s*(?:true|false)\\s*$`,
);

export interface SplitPrompt {
  hasFrontmatter: boolean;
  frontmatter: string;
  body: string;
}

/**
 * Split a markdown document into YAML frontmatter and prompt body. The two
 * are structurally distinct: frontmatter carries exact permission/config
 * keys; body carries prose. Returns the whole text as body when no
 * frontmatter block is present.
 */
export function splitFrontmatter(text: string): SplitPrompt {
  if (!text.startsWith("---\n")) {
    return { hasFrontmatter: false, frontmatter: "", body: text };
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    return { hasFrontmatter: false, frontmatter: "", body: text };
  }
  return {
    hasFrontmatter: true,
    frontmatter: text.slice(4, end),
    body: text.slice(end + "\n---\n".length),
  };
}

export interface McpGrant {
  key: string;
  allowed: boolean;
}

/** External MCP permission grants declared in a frontmatter block. */
export function frontmatterMcpGrants(frontmatter: string): McpGrant[] {
  const grants: McpGrant[] = [];
  const pattern = new RegExp(
    `^\\s*((?:${PREFIX_ALTERNATION})_[A-Za-z0-9_*.-]+)\\s*:\\s*(true|false)\\s*$`,
  );
  for (const line of frontmatter.split("\n")) {
    const match = pattern.exec(line);
    if (match) {
      grants.push({ key: match[1]!, allowed: match[2] === "true" });
    }
  }
  return grants.sort((a, b) => a.key.localeCompare(b.key));
}

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function listMarkdownFlat(relativeDir: string): string[] {
  return readdirSync(join(REPO_ROOT, relativeDir))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => join(relativeDir, name));
}

function listMarkdownRecursive(relativeDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(REPO_ROOT, dir)).sort()) {
      const rel = join(dir, entry);
      const stat = statSync(join(REPO_ROOT, rel));
      if (stat.isDirectory()) {
        walk(rel);
      } else if (entry.endsWith(".md")) {
        out.push(rel);
      }
    }
  };
  walk(relativeDir);
  return out;
}

export interface CorpusFile extends SplitPrompt {
  path: string;
  kind: "agent" | "overlay" | "command" | "skill" | "reference";
}

function toCorpusFile(
  relativePath: string,
  kind: CorpusFile["kind"],
): CorpusFile {
  const split = splitFrontmatter(readRepoFile(relativePath));
  return { path: relativePath, kind, ...split };
}

/**
 * The active prompt corpus, derived from recursive deployment ownership.
 * Excludes `.adv/**` by construction (archive paths are never enumerated).
 */
export function activePromptCorpus(): CorpusFile[] {
  const corpus: CorpusFile[] = [];

  for (const path of listMarkdownFlat(".opencode/agents")) {
    corpus.push(toCorpusFile(path, "agent"));
  }
  for (const path of readdirSync(join(REPO_ROOT, ".opencode/overlays"))
    .filter((name) => name.endsWith(".overlay.md"))
    .sort()
    .map((name) => join(".opencode/overlays", name))) {
    corpus.push(toCorpusFile(path, "overlay"));
  }
  for (const path of listMarkdownFlat(".opencode/command").filter((path) =>
    /(^|\/)adv-[^/]*\.md$/.test(path),
  )) {
    corpus.push(toCorpusFile(path, "command"));
  }
  const skillsRoot = join(REPO_ROOT, "skills");
  for (const entry of readdirSync(skillsRoot).sort()) {
    if (!entry.startsWith("adv-")) continue;
    if (!statSync(join(skillsRoot, entry)).isDirectory()) continue;
    for (const path of listMarkdownRecursive(join("skills", entry))) {
      corpus.push(toCorpusFile(path, "skill"));
    }
  }
  for (const path of ["ADV_INSTRUCTIONS.md", "SETUP.md"]) {
    corpus.push(toCorpusFile(path, "reference"));
  }

  return corpus;
}

/**
 * Apply an overlay to an agent prompt using deploy-local.sh
 * `apply_overlay_block` semantics: when ADV_SYNC markers exist, the whole
 * marked region (markers inclusive) is replaced by the overlay file content;
 * otherwise the overlay is inserted directly after frontmatter.
 */
export function applyOverlay(
  agentText: string,
  overlayText: string,
  overlayName: string,
): string {
  const startMarker = `<!-- ADV_SYNC:START ${overlayName} -->`;
  const endMarker = `<!-- ADV_SYNC:END ${overlayName} -->`;
  let overlay = overlayText.replace(/\s+$/, "") + "\n";

  const start = agentText.indexOf(startMarker);
  const end = agentText.indexOf(endMarker);
  if (start !== -1 && end !== -1) {
    let regionEnd = end + endMarker.length;
    while (regionEnd < agentText.length && agentText[regionEnd] === "\n") {
      regionEnd += 1;
    }
    return agentText.slice(0, start) + overlay + agentText.slice(regionEnd);
  }

  let insertAt = 0;
  if (agentText.startsWith("---\n")) {
    const second = agentText.indexOf("\n---\n", 4);
    if (second !== -1) {
      insertAt = second + "\n---\n".length;
      if (insertAt < agentText.length && agentText[insertAt] !== "\n") {
        overlay = "\n" + overlay;
      }
    }
  }
  const spacer = insertAt && !overlay.endsWith("\n\n") ? "\n" : "";
  return (
    agentText.slice(0, insertAt) + overlay + spacer + agentText.slice(insertAt)
  );
}

export interface EffectivePrompt extends SplitPrompt {
  /** Agent name (file basename without .md) or overlay name for overlay-only surfaces. */
  name: string;
  /** Full assembled prompt text. */
  text: string;
  /** True when frontmatter grants at least one external MCP capability. */
  mcpCapable: boolean;
  /** Sorted external MCP permission grants from frontmatter. */
  mcpGrants: McpGrant[];
}

const OVERLAY_ONLY_AGENTS = ["general"] as const;
const OVERLAY_SPLICED_AGENTS = ["build", "plan"] as const;

/**
 * Effective assembled agent prompts as deployed: repo-owned agents verbatim,
 * shared agents with their ADV_SYNC managed block replaced by the canonical
 * overlay source, and overlay-only surfaces (general) represented by the
 * Advance-authored overlay itself.
 */
export function effectiveAgentPrompts(): EffectivePrompt[] {
  const prompts: EffectivePrompt[] = [];
  const overlayText = (name: string): string =>
    readRepoFile(join(".opencode/overlays", `${name}.overlay.md`));

  for (const path of listMarkdownFlat(".opencode/agents")) {
    const name = path.slice(path.lastIndexOf("/") + 1, -".md".length);
    let text = readRepoFile(path);
    if ((OVERLAY_SPLICED_AGENTS as readonly string[]).includes(name)) {
      text = applyOverlay(text, overlayText(name), name);
    }
    const split = splitFrontmatter(text);
    const grants = frontmatterMcpGrants(split.frontmatter);
    prompts.push({
      name,
      text,
      ...split,
      mcpCapable: grants.some((grant) => grant.allowed),
      mcpGrants: grants,
    });
  }

  for (const name of OVERLAY_ONLY_AGENTS) {
    const text = overlayText(name);
    const split = splitFrontmatter(text);
    const grants = frontmatterMcpGrants(split.frontmatter);
    prompts.push({
      name,
      text,
      ...split,
      mcpCapable: grants.some((grant) => grant.allowed),
      mcpGrants: grants,
    });
  }

  return prompts;
}

export interface ProseViolation {
  path: string;
  line: number;
  match: string;
}

/**
 * Scan prompt-body prose for concrete external MCP callable spellings.
 * Frontmatter is excluded by the caller (body only); backtick spans citing
 * permission keys (`key: true|false`) are config citations, not invocation.
 */
export function findConcreteSpellings(body: string): string[] {
  const prose = body.replace(CONFIG_CITATION_SPAN, "");
  return [...prose.matchAll(CONCRETE_MCP_SPELLING)].map((match) => match[0]);
}

/** Body lines shaped like YAML permission keys leaked into prompt prose. */
export function findPermissionKeyLines(body: string): string[] {
  return body
    .split("\n")
    .filter((line) => PERMISSION_KEY_LINE.test(line))
    .map((line) => line.trim());
}

/** Count non-overlapping occurrences of the canonical contract in text. */
export function countContractOccurrences(text: string): number {
  return text.split(MCP_ACTIVE_SURFACE_CONTRACT).length - 1;
}
