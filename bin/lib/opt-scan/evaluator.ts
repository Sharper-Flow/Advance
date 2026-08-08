/**
 * adv CLI — opt-scan deterministic detector evaluator
 *
 * Generic engine: takes a single {@link OptimizationDetector} and a repo
 * root, walks the trigger scope, applies the trigger pattern, and decides
 * whether to emit an {@link OptimizationCandidate}.
 *
 * Design invariants:
 *   - Deterministic (P33): no LLM, no random, no network. Only fs + regex.
 *   - Bounded execution: every regex run is wrapped in {@link searchBounded}
 *     with a configurable per-pattern timeout. Registry patterns are screened
 *     for catastrophic backtracking shapes by registry.test.ts.
 *   - Bounded traversal: file collection is scoped by trigger file_globs.
 *     Common build/cache/vendor directories are pruned.
 *   - Evidence-backed (P34): every candidate carries `trigger` evidence with
 *     file:line, plus supporting evidence for the family-specific guard.
 *   - Static-only V1: every emitted candidate is `signal_class: "static"`,
 *     advisory, and includes a false-positive caveat and verification step.
 *     No measured runtime impact claims are made.
 *   - Cache specificity (V1): the `cache_opportunity` detector only emits
 *     when source evidence shows immutable identity, clear ownership, AND
 *     an invalidation policy. Unclear cases are rejected.
 *   - No slop repurposing: detectors are independent of slop-scan PERF findings.
 */

import { readdir, readFile, stat } from "fs/promises";
import type { Dirent } from "fs";
import { basename, join } from "path";

import type {
  OptimizationCandidate,
  OptimizationCoverage,
  OptimizationEvidence,
} from "./schema";
import type { OptimizationDetector } from "./registry";
import { SCAN_IGNORE_DIRS } from "../scan-ignore";

export { SCAN_IGNORE_DIRS } from "../scan-ignore";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EvaluatorOptions {
  /** Absolute path to the repository root to evaluate against. */
  readonly repoRoot: string;
  /**
   * Per-pattern regex execution budget in milliseconds. When exceeded,
   * evaluation stops and the coverage entry is marked `degraded`.
   * Defaults to 5000ms.
   */
  readonly regexTimeoutMs?: number;
}

export interface EvaluationResult {
  readonly candidates: readonly OptimizationCandidate[];
  readonly coverage_entry: OptimizationCoverage;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_REGEX_TIMEOUT_MS = 5000;

const MAX_FILE_BYTES = 1_000_000;
const MAX_SCANNED_FILES = 10_000;

interface RegexHit {
  readonly index: number;
  readonly match: string;
  readonly line: number;
  readonly column: number;
}

interface SearchResult {
  readonly hits: readonly RegexHit[];
  readonly timedOut: boolean;
}

/**
 * Apply a regex against text with a per-call execution budget.
 *
 * Recreates the pattern with the global flag, precomputes line start offsets,
 * and interrupts after each match so a huge number of matches cannot run
 * forever. The registry screen prevents single-match catastrophic backtracking.
 */
function searchBounded(
  text: string,
  pattern: RegExp,
  timeoutMs: number,
): SearchResult {
  if (text.length === 0) return { hits: [], timedOut: false };

  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const localRe = new RegExp(pattern.source, flags);

  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a /* \n */) lineStarts.push(i + 1);
  }

  function locate(index: number): { line: number; column: number } {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: index - lineStarts[lo] + 1 };
  }

  const hits: RegexHit[] = [];
  const start = Date.now();
  let pos = 0;
  let m: RegExpExecArray | null;

  while (pos <= text.length) {
    localRe.lastIndex = pos;
    m = localRe.exec(text);
    if (m === null) break;
    if (m[0].length === 0) {
      pos++;
      continue;
    }
    const { line, column } = locate(m.index);
    hits.push({ index: m.index, match: m[0], line, column });
    pos = m.index + m[0].length;
    if (Date.now() - start > timeoutMs) {
      return { hits, timedOut: true };
    }
  }
  return { hits, timedOut: false };
}

/** Convert a glob pattern to a RegExp matching the full POSIX relative path. */
function globToRegex(glob: string): RegExp {
  if (glob.length === 0) return /^$/;
  let pattern = "^";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i += 2;
        if (glob[i] === "/") {
          i++;
          pattern += "(?:.*/)?";
        } else {
          pattern += ".*";
        }
      } else {
        pattern += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      pattern += "[^/]";
      i++;
    } else if (".+^$()|[]{}\\".includes(c)) {
      pattern += "\\" + c;
      i++;
    } else if (c === "/") {
      pattern += "/";
      i++;
    } else {
      pattern += c;
      i++;
    }
  }
  pattern += "$";
  return new RegExp(pattern);
}

interface FileCollection {
  readonly paths: readonly string[];
  readonly truncated: boolean;
}

/** Recursively walk `repoRoot`, returning bounded POSIX-style relative paths. */
async function walkRepo(repoRoot: string): Promise<FileCollection> {
  const out: string[] = [];

  async function visit(dirAbs: string, dirRel: string): Promise<boolean> {
    if (out.length >= MAX_SCANNED_FILES) return true;
    let entries: Dirent[];
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch {
      return false;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= MAX_SCANNED_FILES) return true;
      if (entry.isDirectory()) {
        if (SCAN_IGNORE_DIRS.has(entry.name)) continue;
        const childRel = dirRel === "" ? entry.name : `${dirRel}/${entry.name}`;
        if (await visit(join(dirAbs, entry.name), childRel)) return true;
      } else if (entry.isFile()) {
        const childRel = dirRel === "" ? entry.name : `${dirRel}/${entry.name}`;
        out.push(childRel);
      }
    }
    return false;
  }

  const truncated = await visit(repoRoot, "");
  return { paths: out, truncated };
}

const TEST_ARTIFACT_SEGMENT_RE = /(?:^|\/)__(tests|mocks)__(?:\/|$)/;
const TEST_ARTIFACT_BASENAME_RE = /\.(test|spec|itest)(\.[^./]+)?$/i;

function isTestArtifactPath(relPath: string): boolean {
  if (TEST_ARTIFACT_SEGMENT_RE.test(relPath)) return true;
  const base = basename(relPath);
  return TEST_ARTIFACT_BASENAME_RE.test(base);
}

/** Return relative paths matching any of the provided globs. */
async function collectFiles(
  globs: readonly string[],
  repoRoot: string,
): Promise<FileCollection> {
  if (globs.length === 0) return { paths: [], truncated: false };
  const matchers = globs.map(globToRegex);
  const all = await walkRepo(repoRoot);
  const result = new Set<string>();
  for (const relPath of all.paths) {
    if (isTestArtifactPath(relPath)) continue;
    if (matchers.some((re) => re.test(relPath))) {
      result.add(relPath);
    }
  }
  return { paths: [...result].sort(), truncated: all.truncated };
}

/** Read a text file, bounded in size; return undefined on failure or oversize. */
async function readTextFile(
  repoRoot: string,
  relPath: string,
): Promise<string | undefined> {
  const absPath = join(repoRoot, relPath);
  try {
    const s = await stat(absPath);
    if (!s.isFile()) return undefined;
    if (s.size > MAX_FILE_BYTES) return undefined;
  } catch {
    return undefined;
  }
  try {
    return await readFile(absPath, "utf8");
  } catch {
    return undefined;
  }
}

function makeCandidateId(detectorId: string, relPath: string, line: number): string {
  return `${detectorId}:${relPath}:${line}`;
}

function deduplicateCandidates(candidates: OptimizationCandidate[]): OptimizationCandidate[] {
  // Some detectors (collection chains, cache functions) may produce multiple
  // adjacent hits for the same logical site. Keep the first hit of any cluster
  // where hits are within the detector's proximity window.
  const PROXIMITY: Readonly<Record<string, number>> = {
    avoidable_collection_work: 2,
    cache_opportunity: 8,
  };

  const kept: OptimizationCandidate[] = [];
  const lastByFile = new Map<string, number>();

  for (const candidate of candidates) {
    const window = PROXIMITY[candidate.detector_id];
    if (window === undefined) {
      kept.push(candidate);
      continue;
    }

    const trigger = candidate.evidence.find((e) => e.role === "trigger");
    const file = trigger?.file ?? "";
    const line = trigger?.line ?? 0;
    const last = lastByFile.get(file) ?? -Infinity;
    if (line - last > window) {
      kept.push(candidate);
      lastByFile.set(file, line);
    }
  }

  return kept;
}

function triggerEvidence(relPath: string, hit: RegexHit): OptimizationEvidence {
  return {
    role: "trigger",
    file: relPath,
    line: hit.line,
    column: hit.column,
    matchedSignal: hit.match.trim().slice(0, 120),
    snippet: hit.match.trim().slice(0, 200),
  };
}

function scopeEvidence(relPath: string, line: number, snippet: string): OptimizationEvidence {
  return {
    role: "scope",
    file: relPath,
    line,
    matchedSignal: snippet.trim().slice(0, 120),
    snippet: snippet.trim().slice(0, 200),
  };
}

function rejectedScopeEvidence(
  relPath: string,
  line: number,
  reason: string,
): OptimizationEvidence {
  return {
    role: "rejected_scope",
    file: relPath,
    line,
    matchedSignal: reason.slice(0, 120),
    snippet: reason.slice(0, 200),
  };
}

// ---------------------------------------------------------------------------
// Detector-specific guards
// ---------------------------------------------------------------------------

const LOOP_KEYWORDS_RE = /\b(for|while)\s*\(|\.forEach\s*\(|\.map\s*\(|\.filter\s*\(/i;

function isRepeatedBoundaryWork(
  lines: string[],
  hitLine: number,
): { ok: true; scopeLine: number; snippet: string } | { ok: false } {
  // Look within a 5-line window on each side of the boundary call for a
  // loop construct. This is bounded and deterministic.
  const start = Math.max(0, hitLine - 5);
  const end = Math.min(lines.length, hitLine + 5);
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (LOOP_KEYWORDS_RE.test(line)) {
      return { ok: true, scopeLine: i + 1, snippet: line };
    }
  }
  return { ok: false };
}

const CHAIN_REJECTIONS = [
  /\.map\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*(filter|reduce|flat|flatMap|sort)\s*\(/is,
  /\.filter\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*(map|reduce|flat|flatMap|sort)\s*\(/is,
  /\.flatMap\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*(map|filter|reduce|sort)\s*\(/is,
  /\.sort\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*(map|filter|reduce|flat|flatMap)\s*\(/is,
];

function isAvoidableCollectionWork(lines: string[], hitLine: number): boolean {
  // Chains may span multiple lines. Join a 3-line window so simple multi-line
  // chains still match while staying bounded.
  const window = lines.slice(hitLine - 1, hitLine + 2).join(" ");
  return CHAIN_REJECTIONS.some((re) => re.test(window));
}

const STARTUP_FILE_RE = /\b(worker|server|index|main|app|entry|bootstrap|init)\b/i;

function isStartupFile(relPath: string): boolean {
  return STARTUP_FILE_RE.test(basename(relPath));
}

function topLevelBraceDepthBeforeLine(lines: string[], targetIndex: number): number {
  // Count unmatched opening braces before the target line. Strings and comments
  // are ignored only approximately; this is a bounded static heuristic.
  let depth = 0;
  for (let i = 0; i < targetIndex; i++) {
    const line = lines[i];
    let inString: string | null = null;
    let escape = false;
    for (const ch of line) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (inString) {
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{" || ch === "(") depth++;
      else if (ch === "}" || ch === ")") depth--;
    }
  }
  return depth;
}

function isWorkerStartupPressure(
  relPath: string,
  lines: string[],
  hitLine: number,
): { ok: true; reason: string } | { ok: false } {
  const isStartup = isStartupFile(relPath);
  const depth = topLevelBraceDepthBeforeLine(lines, hitLine - 1);
  // Module top level: no unmatched braces before this line and the call is not
  // inside a function/class block. We additionally require a startup-named file
  // because top-level sync I/O in library code is often intentional lazy loading.
  if (!isStartup || depth > 0) {
    return { ok: false };
  }
  return { ok: true, reason: "synchronous I/O in startup-named file" };
}

// Require a direct cache invalidation operation. Metadata such as `version`
// or a standalone TTL declaration does not prove that a cache is ever
// invalidated, so it is deliberately insufficient for an advisory candidate.
const CACHE_INVALIDATION_RE =
  /\b(?:cache|memo|lru)\s*(?:\?\.)?\.\s*(?:clear|delete|invalidate|evict|refresh)\s*\(/i;

function findCacheIdentityEvidence(
  funcBody: string,
): { ok: true; lineInBody: number; snippet: string } | { ok: false } {
  // Identity evidence: stable key derivation from parameters (e.g. args, id,
  // JSON.stringify of params, or deterministic inputs).
  const identityRe = /\b(JSON\.stringify\s*\(|args\.|params\.|input\.|key\s*=|id\s*=|\bkey\b|\bid\b)/i;
  const lines = funcBody.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (identityRe.test(lines[i])) {
      return { ok: true, lineInBody: i + 1, snippet: lines[i] };
    }
  }
  return { ok: false };
}

function findCacheOwnershipEvidence(
  fileText: string,
  funcStartLine: number,
  funcBody: string,
): { ok: true; line: number; snippet: string } | { ok: false } {
  // Ownership evidence: a cache variable/method on a class, module-level
  // cache, or an exported function with a named cache owner.
  const cacheVarRe = /\b(cache|memo|lru|memoized|cached)\s*[:=]/i;
  const classRe = /\bclass\s+\w+/;
  const exportRe = /\bexport\s+(?:default\s+)?(?:function|const|class)\s+\w+/;

  const fileLines = fileText.split("\n");
  const bodyLines = funcBody.split("\n");

  // Check inside the function body first.
  for (let i = 0; i < bodyLines.length; i++) {
    if (cacheVarRe.test(bodyLines[i])) {
      return { ok: true, line: funcStartLine + i, snippet: bodyLines[i] };
    }
  }

  // Then scan backward up to 30 lines for a cache owner declaration.
  const searchStart = Math.max(0, funcStartLine - 31);
  for (let i = funcStartLine - 2; i >= searchStart; i--) {
    if (cacheVarRe.test(fileLines[i]) || classRe.test(fileLines[i]) || exportRe.test(fileLines[i])) {
      return { ok: true, line: i + 1, snippet: fileLines[i] };
    }
  }

  return { ok: false };
}

function findCacheInvalidationEvidence(
  fileText: string,
  funcStartLine: number,
  funcBody: string,
): { ok: true; line: number; snippet: string } | { ok: false } {
  const fileLines = fileText.split("\n");
  const bodyLines = funcBody.split("\n");

  // Check inside the function body first.
  for (let i = 0; i < bodyLines.length; i++) {
    if (CACHE_INVALIDATION_RE.test(bodyLines[i])) {
      return { ok: true, line: funcStartLine + i, snippet: bodyLines[i] };
    }
  }

  // Then scan the whole file for any invalidation signal.
  for (let i = 0; i < fileLines.length; i++) {
    if (CACHE_INVALIDATION_RE.test(fileLines[i])) {
      return { ok: true, line: i + 1, snippet: fileLines[i] };
    }
  }

  return { ok: false };
}

function extractFunctionAroundLine(
  fileText: string,
  lines: string[],
  hitLine: number,
): { body: string; startLine: number } | undefined {
  // Walk backward from the hit line to find the most recent function/method
  // header, then walk forward to match braces. Deterministic and bounded.
  const headerRe = /(?:^|[^\w$])(function\s+\w+|\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{|\w+\s*=>\s*\{|async\s+\w+\s*\()/;
  let headerIndex = -1;

  for (let i = hitLine - 1; i >= 0; i--) {
    if (headerRe.test(lines[i])) {
      headerIndex = i;
      break;
    }
    if (lines[i].includes("{") && lines[i].includes("}")) continue;
    if (lines[i].includes("}")) break;
  }
  if (headerIndex === -1) return undefined;

  let braceDepth = 0;
  let started = false;
  const endIndex = Math.min(lines.length, headerIndex + 200);
  for (let i = headerIndex; i < endIndex; i++) {
    for (const ch of lines[i]) {
      if (ch === "{" || ch === "(") braceDepth++;
      else if (ch === "}" || ch === ")") braceDepth--;
      if (!started && braceDepth > 0) started = true;
    }
    if (started && braceDepth <= 0) {
      return {
        body: lines.slice(headerIndex, i + 1).join("\n"),
        startLine: headerIndex + 1,
      };
    }
  }
  return undefined;
}

function isCacheOpportunity(
  fileText: string,
  lines: string[],
  hitLine: number,
):
  | {
      ok: true;
      identity: { line: number; snippet: string };
      ownership: { line: number; snippet: string };
      invalidation: { line: number; snippet: string };
    }
  | { ok: false; reason: string } {
  const func = extractFunctionAroundLine(fileText, lines, hitLine);
  if (!func) {
    return { ok: false, reason: "no enclosing function found" };
  }

  const identity = findCacheIdentityEvidence(func.body);
  if (!identity.ok) {
    return { ok: false, reason: "missing immutable identity evidence" };
  }

  const ownership = findCacheOwnershipEvidence(fileText, func.startLine, func.body);
  if (!ownership.ok) {
    return { ok: false, reason: "missing cache ownership evidence" };
  }

  const invalidation = findCacheInvalidationEvidence(fileText, func.startLine, func.body);
  if (!invalidation.ok) {
    return { ok: false, reason: "missing cache invalidation evidence" };
  }

  return {
    ok: true,
    identity: {
      line: func.startLine + identity.lineInBody - 1,
      snippet: identity.snippet,
    },
    ownership: { line: ownership.line, snippet: ownership.snippet },
    invalidation: { line: invalidation.line, snippet: invalidation.snippet },
  };
}

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

const COST_SHAPE_BY_FAMILY: Record<
  OptimizationDetector["family"],
  { pattern: "boundary" | "collection" | "startup" | "cache_miss"; description: string }
> = {
  repeated_boundary_work: {
    pattern: "boundary",
    description: "Repeated boundary calls may dominate latency and cost.",
  },
  avoidable_collection_work: {
    pattern: "collection",
    description: "Chained collection transformations may allocate avoidable intermediates.",
  },
  worker_startup_pressure: {
    pattern: "startup",
    description: "Synchronous startup I/O or parsing may delay worker readiness.",
  },
  cache_opportunity: {
    pattern: "cache_miss",
    description: "Repeated pure computation may benefit from a cache with clear ownership and invalidation.",
  },
};

export async function evaluateDetector(
  detector: OptimizationDetector,
  options: EvaluatorOptions,
): Promise<EvaluationResult> {
  const timeoutMs = options.regexTimeoutMs ?? DEFAULT_REGEX_TIMEOUT_MS;
  const files = await collectFiles(detector.trigger.file_globs, options.repoRoot);
  if (files.truncated) {
    return {
      candidates: [],
      coverage_entry: {
        id: detector.id,
        label: detector.title,
        state: "degraded",
        reason: `scan exceeded ${MAX_SCANNED_FILES} file limit`,
        important: true,
      },
    };
  }
  const relPaths = files.paths;

  let candidates: OptimizationCandidate[] = [];
  const rejectedLines: { relPath: string; line: number; reason: string }[] = [];
  let timedOut = false;

  for (const relPath of relPaths) {
    const text = await readTextFile(options.repoRoot, relPath);
    if (text === undefined) continue;

    const lines = text.split("\n");
    const search = searchBounded(text, detector.trigger.pattern, timeoutMs);
    if (search.timedOut) {
      timedOut = true;
      break;
    }

    for (const hit of search.hits) {
      let evidence: OptimizationEvidence[] = [triggerEvidence(relPath, hit)];
      let shouldEmit = true;

      switch (detector.family) {
        case "repeated_boundary_work": {
          const boundary = isRepeatedBoundaryWork(lines, hit.line);
          if (boundary.ok) {
            evidence.push(scopeEvidence(relPath, boundary.scopeLine, boundary.snippet));
          } else {
            shouldEmit = false;
            rejectedLines.push({ relPath, line: hit.line, reason: "no surrounding loop construct" });
          }
          break;
        }

        case "avoidable_collection_work": {
          if (isAvoidableCollectionWork(lines, hit.line)) {
            evidence.push(scopeEvidence(relPath, hit.line, lines[hit.line - 1] ?? ""));
          } else {
            shouldEmit = false;
            rejectedLines.push({ relPath, line: hit.line, reason: "not a chained collection transformation" });
          }
          break;
        }

        case "worker_startup_pressure": {
          const startup = isWorkerStartupPressure(relPath, lines, hit.line);
          if (startup.ok) {
            evidence.push(scopeEvidence(relPath, hit.line, startup.reason));
          } else {
            shouldEmit = false;
            rejectedLines.push({ relPath, line: hit.line, reason: "not at module top level or in startup file" });
          }
          break;
        }

        case "cache_opportunity": {
          const cache = isCacheOpportunity(text, lines, hit.line);
          if (cache.ok) {
            evidence.push(
              scopeEvidence(relPath, cache.identity.line, cache.identity.snippet),
              {
                role: "ownership",
                file: relPath,
                line: cache.ownership.line,
                matchedSignal: cache.ownership.snippet.trim().slice(0, 120),
                snippet: cache.ownership.snippet.trim().slice(0, 200),
              },
              {
                role: "invalidation",
                file: relPath,
                line: cache.invalidation.line,
                matchedSignal: cache.invalidation.snippet.trim().slice(0, 120),
                snippet: cache.invalidation.snippet.trim().slice(0, 200),
              },
            );
          } else {
            shouldEmit = false;
            rejectedLines.push({ relPath, line: hit.line, reason: cache.reason });
          }
          break;
        }
      }

      if (shouldEmit) {
        const costShape = COST_SHAPE_BY_FAMILY[detector.family];
        candidates.push({
          id: makeCandidateId(detector.id, relPath, hit.line),
          detector_id: detector.id,
          category: "optimization-candidate",
          signal_class: detector.signal_class,
          severity: detector.severity_hint,
          confidence: detector.confidence,
          detection_method: "regex",
          description: detector.trigger.description,
          evidence,
          expected_cost_shape: {
            family: detector.family,
            pattern: costShape.pattern,
            description: costShape.description,
          },
          false_positive_caveat: detector.false_positive_caveat,
          verification_needed: detector.verification_needed,
          recommendation: `Review ${relPath}:${hit.line} and verify with a profile or benchmark before optimizing.`,
          source: "opt-scan",
        });
      }
    }
  }

  candidates = deduplicateCandidates(candidates);

  if (timedOut) {
    return {
      candidates,
      coverage_entry: {
        id: detector.id,
        label: detector.title,
        state: "timed_out",
        reason: `regex execution exceeded ${timeoutMs}ms budget`,
        important: true,
      },
    };
  }

  const state: OptimizationCoverage["state"] = "run";
  const reason =
    candidates.length > 0
      ? `emitted ${candidates.length} candidate(s)`
      : rejectedLines.length > 0
        ? `no candidates emitted; ${rejectedLines.length} trigger(s) rejected`
        : "trigger pattern did not match any trigger file";

  return {
    candidates,
    coverage_entry: {
      id: detector.id,
      label: detector.title,
      state,
      reason,
      important: true,
    },
  };
}
