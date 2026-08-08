/**
 * adv CLI — arch-scan capability-consistency evaluator
 *
 * Generic engine: takes a single {@link CapabilityRelationship} and a repo
 * root, walks the trigger scope, applies the trigger pattern, and decides
 * whether to emit a {@link CapabilityFinding} based on whether any
 * acceptable counterpart or exception signal matches in their declared
 * scopes.
 *
 * Design invariants:
 *   - Deterministic (P33): no LLM, no random, no network. Only fs + regex.
 *   - Bounded execution: every regex run is wrapped in {@link searchBounded}
 *     with a configurable per-pattern timeout. Patterns themselves are
 *     bounded by the registry's ReDoS heuristic screen.
 *   - Bounded traversal: file collection is scoped by trigger/counterpart/
 *     exception `file_globs`. Common build/cache dirs are pruned.
 *   - Evidence-backed (P34): every finding carries a `trigger` evidence
 *     entry with file:line, plus a `searched_scope` entry recording the
 *     repo root that was scanned for counterparts. `absence_proof` records
 *     searched roots, included/excluded globs, and parse failures.
 *   - Phase 3 intent gate: when a relationship declares `intent_required`
 *     at the entry level AND runs in detection_phase 3, the rule does not
 *     fire unless at least one declared intent string is present verbatim
 *     in any in-scope repo file. This is the deterministic, machine-
 *     checkable interpretation of "intent evidence present".
 */

import { readdir, stat, readFile } from "fs/promises";
import type { Dirent } from "fs";
import { join } from "path";

import type {
  AbsenceProof,
  CapabilityDetectionMethod,
  CapabilityEvidence,
  CapabilityFinding,
  CapabilitySeverity,
} from "./schema";
import type { CapabilityRelationship } from "./registry";
import { scanDebtMarkers } from "./helpers/debt-marker";
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
  readonly findings: readonly CapabilityFinding[];
  readonly coverage_entry: {
    readonly id: string;
    readonly state: "applied" | "skipped" | "degraded";
    readonly reason: string;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_REGEX_TIMEOUT_MS = 5000;

/**
 * Window (lines on each side of a trigger hit) used by the debt-marker
 * helper when scanning escalate-mode rules for nearby TODO/FIXME/HACK/XXX
 * comments. Mirrors the helper's own default but pinned here so the
 * evaluator's contract does not silently drift if the helper default
 * changes.
 */
const DEBT_MARKER_WINDOW_LINES = 20;

/**
 * Severity escalation order — ascending severity. The escalate-mode branch
 * boosts a finding's severity by one step along this ordering, capped at
 * `"blocker"`. (P33: deterministic, table-driven escalation.)
 */
const SEVERITY_ESCALATION_ORDER: readonly CapabilitySeverity[] = [
  "nit",
  "minor",
  "major",
  "blocker",
];

/**
 * Boost a severity by one level along {@link SEVERITY_ESCALATION_ORDER},
 * capped at `"blocker"`. Unknown severities pass through unchanged.
 */
function escalateSeverity(s: CapabilitySeverity): CapabilitySeverity {
  const idx = SEVERITY_ESCALATION_ORDER.indexOf(s);
  if (idx === -1) return s;
  return SEVERITY_ESCALATION_ORDER[
    Math.min(idx + 1, SEVERITY_ESCALATION_ORDER.length - 1)
  ];
}

/**
 * Files above this size are skipped during intent declaration scans to keep
 * the search bounded. 1 MiB.
 */
const INTENT_SCAN_MAX_BYTES = 1_000_000;

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
 * The registry's patterns may carry the global (`g`) flag for documentation
 * purposes; here we recreate the pattern without `g` and iterate matches
 * manually so we can interrupt after each match. We precompute the start
 * offset of every line for O(log L) line/column resolution per hit.
 *
 * This wrapper protects against pathological pattern+input combinations
 * where the number of matches is very large; it cannot interrupt a single
 * catastrophic backtracking match, but the registry's ReDoS screen
 * (registry.test.ts) forbids nested-quantifier shapes that produce such
 * matches.
 */
function searchBounded(
  text: string,
  pattern: RegExp,
  timeoutMs: number,
): SearchResult {
  if (text.length === 0) return { hits: [], timedOut: false };

  // Force the global flag so `lastIndex` advances after each match; without
  // `g`, `exec` ignores `lastIndex` and would loop forever on the first
  // match. Preserve any other flags (`i`, `m`, `s`, `u`).
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const localRe = new RegExp(pattern.source, flags);

  // Precompute line start offsets for binary-search line/column lookup.
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
      // Zero-width match — advance by one to avoid an infinite loop.
      pos++;
      continue;
    }
    const { line, column } = locate(m.index);
    hits.push({
      index: m.index,
      match: m[0],
      line,
      column,
    });
    pos = m.index + m[0].length;
    if (Date.now() - start > timeoutMs) {
      return { hits, timedOut: true };
    }
  }
  return { hits, timedOut: false };
}

/**
 * Traverse `repoRoot` and return POSIX-style relative paths matching any of
 * the provided globs. Build/cache/vendor directories are pruned. Returns
 * a de-duplicated, sorted list.
 */
async function collectFiles(
  globs: readonly string[],
  repoRoot: string,
): Promise<readonly string[]> {
  if (globs.length === 0) return [];
  const matchers = globs.map(globToRegex);
  const all = await walkRepo(repoRoot);
  const result = new Set<string>();
  for (const relPath of all) {
    if (matchers.some((re) => re.test(relPath))) {
      result.add(relPath);
    }
  }
  return [...result].sort();
}

/**
 * Recursively walk `repoRoot`, returning POSIX-style relative file paths.
 * Prunes directories listed in {@link SCAN_IGNORE_DIRS}. Used by both
 * {@link collectFiles} and the intent-declaration scan.
 */
async function walkRepo(repoRoot: string): Promise<readonly string[]> {
  const out: string[] = [];

  async function visit(dirAbs: string, dirRel: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SCAN_IGNORE_DIRS.has(entry.name)) continue;
        const childRel = dirRel === "" ? entry.name : `${dirRel}/${entry.name}`;
        await visit(join(dirAbs, entry.name), childRel);
      } else if (entry.isFile()) {
        const childRel = dirRel === "" ? entry.name : `${dirRel}/${entry.name}`;
        out.push(childRel);
      }
    }
  }

  await visit(repoRoot, "");
  return out;
}

/**
 * Convert a glob pattern to a RegExp that matches the full POSIX-style
 * relative path. Supports the subset used by the registry. The supported
 * shapes are: double-star-slash (matches zero or more leading directories),
 * double-star (matches anything including path separators), single-star
 * (matches anything except slash), and single-question-mark (matches a
 * single non-slash character). Literal characters are escaped.
 *
 * This is intentionally minimal — no brace expansion, no character-class
 * negation. The registry's file_globs only use the four shapes above.
 */
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
    } else {
      pattern += c;
      i++;
    }
  }
  pattern += "$";
  return new RegExp(pattern);
}

/** True iff any path segment is in {@link SCAN_IGNORE_DIRS}. */
function isIgnoredPath(relPath: string): boolean {
  const segments = relPath.split("/");
  for (const seg of segments) {
    if (SCAN_IGNORE_DIRS.has(seg)) return true;
  }
  return false;
}

/** Read a file as UTF-8 text. Returns null text and an error message on failure. */
async function readFileText(
  absPath: string,
): Promise<{ text: string | null; error: string | null }> {
  try {
    const text = await readFile(absPath, "utf8");
    return { text, error: null };
  } catch (err) {
    return {
      text: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Scan all in-scope repo files for a literal occurrence of any of the
 * provided intent declaration strings. Returns true on the first hit.
 *
 * The intent_required list contains human-readable declarations (e.g.
 * "workbox dependency in package.json"). The deterministic check is:
 * does any of those strings appear verbatim in any non-ignored repo file?
 * Rule authors who want to mark intent drop the declaration string into a
 * README, AGENTS.md, or similar.
 */
async function intentDeclared(
  declarations: readonly string[],
  repoRoot: string,
): Promise<boolean> {
  if (declarations.length === 0) return true;

  const candidates = await walkRepo(repoRoot);
  for (const relPath of candidates) {
    if (isIgnoredPath(relPath)) continue;
    const abs = join(repoRoot, relPath);
    const info = await stat(abs).catch(() => null);
    if (!info?.isFile()) continue;
    if (info.size > INTENT_SCAN_MAX_BYTES) continue;
    const { text } = await readFileText(abs);
    if (text === null) continue;
    for (const decl of declarations) {
      if (text.includes(decl)) return true;
    }
  }
  return false;
}

interface SignalMatch {
  readonly evidence: CapabilityEvidence;
}

/**
 * Search each acceptable counterpart's declared scope once. The returned map is
 * then filtered per trigger by `trigger_pattern`, so repeated trigger hits do
 * not cause another full repository traversal or read of counterpart files.
 */
async function collectCounterpartMatches(
  relationship: CapabilityRelationship,
  repoRoot: string,
  timeoutMs: number,
  parseFailures: string[],
): Promise<
  ReadonlyMap<
    CapabilityRelationship["acceptable_counterparts"][number],
    SignalMatch | null
  >
> {
  const matches = new Map<
    CapabilityRelationship["acceptable_counterparts"][number],
    SignalMatch | null
  >();
  for (const counterpart of relationship.acceptable_counterparts) {
    const files = await collectFiles(counterpart.file_globs, repoRoot);
    let match: SignalMatch | null = null;
    for (const relPath of files) {
      const { text, error } = await readFileText(join(repoRoot, relPath));
      if (error || text === null) {
        parseFailures.push(`${relPath}: ${error ?? "unreadable"}`);
        continue;
      }
      const { hits } = searchBounded(text, counterpart.pattern, timeoutMs);
      if (hits.length > 0) {
        const hit = hits[0];
        match = {
          evidence: {
            role: "counterpart",
            file: relPath,
            line: hit.line,
            column: hit.column,
            matchedSignal: hit.match,
          },
        };
        break;
      }
    }
    matches.set(counterpart, match);
  }
  return matches;
}

/** Return the first precomputed counterpart eligible for this trigger hit. */
function findCounterpart(
  relationship: CapabilityRelationship,
  triggerMatch: string,
  counterpartMatches: ReadonlyMap<
    CapabilityRelationship["acceptable_counterparts"][number],
    SignalMatch | null
  >,
): SignalMatch | null {
  for (const counterpart of relationship.acceptable_counterparts) {
    if (
      counterpart.trigger_pattern !== undefined &&
      !counterpart.trigger_pattern.test(triggerMatch)
    ) {
      continue;
    }
    const match = counterpartMatches.get(counterpart);
    if (match !== undefined && match !== null) return match;
  }
  return null;
}

/**
 * Search every exception signal's declared scope. Returns the first match.
 */
async function findException(
  relationship: CapabilityRelationship,
  repoRoot: string,
  timeoutMs: number,
  parseFailures: string[],
): Promise<SignalMatch | null> {
  for (const signal of relationship.exception_signals) {
    const files = await collectFiles(signal.file_globs, repoRoot);
    for (const relPath of files) {
      const { text, error } = await readFileText(join(repoRoot, relPath));
      if (error || text === null) {
        parseFailures.push(`${relPath}: ${error ?? "unreadable"}`);
        continue;
      }
      const { hits } = searchBounded(text, signal.pattern, timeoutMs);
      if (hits.length > 0) {
        const hit = hits[0];
        return {
          evidence: {
            role: "exception",
            file: relPath,
            line: hit.line,
            column: hit.column,
            matchedSignal: hit.match,
          },
        };
      }
    }
  }
  return null;
}

/** Build the structured absence proof for a finding. */
function buildAbsenceProof(
  relationship: CapabilityRelationship,
  parseFailures: readonly string[],
): AbsenceProof {
  const includedGlobs = Array.from(
    new Set(
      relationship.acceptable_counterparts.flatMap((c) => c.file_globs),
    ),
  ).sort();
  return {
    searchedRoots: ["."],
    includedGlobs,
    excludedGlobs: [...SCAN_IGNORE_DIRS].sort(),
    parseFailures,
  };
}

/** Build the structured evidence array for a finding at the given hit. */
function buildEvidence(
  triggerPath: string,
  hit: RegexHit,
  exceptionEvidence?: CapabilityEvidence,
): CapabilityEvidence[] {
  const evidence: CapabilityEvidence[] = [
    {
      role: "trigger",
      file: triggerPath,
      line: hit.line,
      column: hit.column,
      matchedSignal: hit.match,
    },
    {
      role: "searched_scope",
      file: ".",
      line: null,
    },
  ];
  if (exceptionEvidence !== undefined) {
    evidence.push(exceptionEvidence);
  }
  return evidence;
}

/**
 * Find the chronologically closest debt marker (by absolute line distance)
 * to `aroundLine`. Ties broken by source order (earliest marker wins).
 * Returns `null` when the input array is empty.
 */
function pickClosestDebtMarker<
  T extends { readonly line: number },
>(markers: readonly T[], aroundLine: number): T | null {
  if (markers.length === 0) return null;
  let best = markers[0];
  let bestDelta = Math.abs(best.line - aroundLine);
  for (let i = 1; i < markers.length; i++) {
    const delta = Math.abs(markers[i].line - aroundLine);
    if (delta < bestDelta) {
      best = markers[i];
      bestDelta = delta;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate a single capability relationship against a repo.
 *
 * Algorithm:
 *   1. (Phase 3 + entry-level `intent_required`) scan the repo for any of
 *      the declared intent strings. If none are present, the rule does not
 *      fire — return no findings and `coverage_entry.state = "skipped"`.
 *   2. Collect trigger files via `trigger.file_globs`. If none match, the
 *      rule is `skipped` with reason "no trigger files in scope".
 *   3. Search acceptable counterparts across their declared globs. If any
 *      matches, the rule is satisfied — return no findings and
 *      `coverage_entry.state = "applied"`.
 *   4. Search exception signals across their declared globs. The matched
 *      signal's effect is selected by `relationship.exception_semantics`:
 *        - `"suppress"` (default): every trigger hit is suppressed.
 *        - `"escalate"`: trigger hits still fire; severity is boosted one
 *          level (capped at `"blocker"`) when the signal is present, and
 *          the signal is attached as `exception` evidence. Escalate mode
 *          additionally uses the `scanDebtMarkers` helper to detect
 *          nearby TODO/FIXME/HACK/XXX comments (within ~20 lines of each
 *          trigger hit) as a secondary exception source.
 *   5. Walk trigger files. For each trigger-pattern hit, emit a finding
 *      with structured evidence (trigger + searched_scope; plus `exception`
 *      evidence under escalate semantics when a signal matched) and
 *      absence_proof.
 *
 * If any per-pattern regex budget is exceeded during trigger scanning, the
 * coverage entry is returned as `degraded` with whatever partial findings
 * were collected before the timeout.
 */
export async function evaluateRelationship(
  relationship: CapabilityRelationship,
  options: EvaluatorOptions,
): Promise<EvaluationResult> {
  const timeoutMs = options.regexTimeoutMs ?? DEFAULT_REGEX_TIMEOUT_MS;
  const id = relationship.id;
  const parseFailures: string[] = [];
  const escalate = relationship.exception_semantics === "escalate";
  // Detection method is derived from the relationship's declared phase so
  // the finding contract matches the AC / severity rubric in
  // skills/adv-arch-detection/SKILL.md: Phase 1 deterministic rules emit
  // "regex"; Phase 3 heuristic rules emit "heuristic". (Phases 2/4 — AST
  // and tool-backed — are reserved by the schema union but not yet wired
  // to this engine; the fallback stays "regex" for any future phase
  // number rather than throwing.)
  const detectionMethod: CapabilityDetectionMethod =
    relationship.detection_phase === 3 ? "heuristic" : "regex";

  // Step 1 — Phase 3 intent gate.
  if (
    relationship.detection_phase === 3 &&
    relationship.intent_required !== undefined &&
    relationship.intent_required.length > 0
  ) {
    const hasIntent = await intentDeclared(
      relationship.intent_required,
      options.repoRoot,
    );
    if (!hasIntent) {
      return {
        findings: [],
        coverage_entry: {
          id,
          state: "skipped",
          reason: "intent evidence not present",
        },
      };
    }
  }

  // Step 2 — collect trigger files.
  const triggerFiles = await collectFiles(
    relationship.trigger.file_globs,
    options.repoRoot,
  );
  if (triggerFiles.length === 0) {
    return {
      findings: [],
      coverage_entry: {
        id,
        state: "skipped",
        reason: "no trigger files in scope",
      },
    };
  }

  // Step 3 — repo-wide exception-signal check.
  //   - Suppress mode: a non-null match silences every trigger hit.
  //   - Escalate mode: a non-null match is the primary exception evidence
  //     source (the debt-marker helper is the secondary, per-trigger-file
  //     source consulted in Step 5).
  const declaredExceptionMatch = await findException(
    relationship,
    options.repoRoot,
    timeoutMs,
    parseFailures,
  );
  const counterpartMatches = await collectCounterpartMatches(
    relationship,
    options.repoRoot,
    timeoutMs,
    parseFailures,
  );

  // Step 4 — walk trigger files and emit findings for each hit.
  const findings: CapabilityFinding[] = [];
  let triggerMatchCount = 0;
  let suppressedCount = 0;
  let escalatedCount = 0;
  let counterpartSatisfiedSignal: string | null = null;
  let timedOut = false;

  for (const relPath of triggerFiles) {
    const { text, error } = await readFileText(join(options.repoRoot, relPath));
    if (error || text === null) {
      parseFailures.push(`${relPath}: ${error ?? "unreadable"}`);
      continue;
    }
    const { hits, timedOut: didTimeOut } = searchBounded(
      text,
      relationship.trigger.pattern,
      timeoutMs,
    );
    if (didTimeOut) timedOut = true;

    for (const hit of hits) {
      triggerMatchCount++;

      // A counterpart may be scoped to this specific trigger hit. This is
      // required for relationships that bundle several ownership mappings
      // (for example knip config → knip dependency and prettier config →
      // prettier dependency) without allowing one mapping to satisfy another.
      const counterpartMatch = findCounterpart(
        relationship,
        hit.match,
        counterpartMatches,
      );
      if (counterpartMatch !== null) {
        counterpartSatisfiedSignal =
          counterpartMatch.evidence.matchedSignal ?? "";
        continue;
      }

      // --- Suppress mode (default): mirror pre-existing behavior. ---
      if (!escalate) {
        if (declaredExceptionMatch !== null) {
          suppressedCount++;
          continue;
        }
        const evidence = buildEvidence(relPath, hit);
        findings.push({
          id: `${id}#${triggerMatchCount}`,
          relationship_id: id,
          category: "capability-consistency",
          severity: relationship.severity_hint,
          confidence: relationship.confidence,
          detection_method: detectionMethod,
          description: relationship.trigger.description,
          evidence,
          absence_proof: buildAbsenceProof(relationship, parseFailures),
          recommendation: `Add an acceptable counterpart: ${relationship.acceptable_counterparts
            .map((c) => c.description)
            .join("; ")}`,
          source: "arch-scan",
        });
        continue;
      }

      // --- Escalate mode: rule always fires; severity may boost. ---
      // Primary exception source: registry-declared signals (already
      // resolved repo-wide). Secondary source: per-trigger-file debt
      // markers within DEBT_MARKER_WINDOW_LINES of the trigger hit.
      let exceptionEvidence: CapabilityEvidence | undefined;
      if (declaredExceptionMatch !== null) {
        exceptionEvidence = declaredExceptionMatch.evidence;
      } else {
        const debt = scanDebtMarkers(text, hit.line, {
          windowLines: DEBT_MARKER_WINDOW_LINES,
        });
        const closest = pickClosestDebtMarker(debt.markers, hit.line);
        if (closest !== null) {
          exceptionEvidence = {
            role: "exception",
            file: relPath,
            line: closest.line,
            matchedSignal: closest.match,
          };
        }
      }

      const escalated = exceptionEvidence !== undefined;
      if (escalated) escalatedCount++;
      const severity = escalated
        ? escalateSeverity(relationship.severity_hint)
        : relationship.severity_hint;
      const evidence = buildEvidence(relPath, hit, exceptionEvidence);
      findings.push({
        id: `${id}#${triggerMatchCount}`,
        relationship_id: id,
        category: "capability-consistency",
        severity,
        confidence: relationship.confidence,
        detection_method: detectionMethod,
        description: escalated
          ? `${relationship.trigger.description} (severity escalated: nearby deferred-enforcement marker)`
          : relationship.trigger.description,
        evidence,
        absence_proof: buildAbsenceProof(relationship, parseFailures),
        recommendation: `Add an acceptable counterpart: ${relationship.acceptable_counterparts
          .map((c) => c.description)
          .join("; ")}`,
        source: "arch-scan",
      });
    }

    if (timedOut) break;
  }

  if (timedOut) {
    return {
      findings,
      coverage_entry: {
        id,
        state: "degraded",
        reason: escalate
          ? `regex execution exceeded timeout (partial results; ${findings.length} finding(s), ${escalatedCount} escalated)`
          : `regex execution exceeded timeout (partial results; ${findings.length} finding(s), ${suppressedCount} suppressed)`,
      },
    };
  }

  if (!escalate && declaredExceptionMatch !== null && triggerMatchCount > 0) {
    return {
      findings,
      coverage_entry: {
        id,
        state: "applied",
        reason: `exception signal suppressed ${suppressedCount} trigger match(es)`,
      },
    };
  }

  return {
    findings,
    coverage_entry: {
      id,
      state: "applied",
      reason:
        triggerMatchCount === 0
          ? "trigger pattern did not match any trigger file"
          : findings.length === 0 && counterpartSatisfiedSignal !== null
            ? `counterpart satisfied: ${counterpartSatisfiedSignal}`.trim()
          : escalate && escalatedCount > 0
            ? `emitted ${findings.length} finding(s); ${escalatedCount} escalated`
            : `emitted ${findings.length} finding(s)`,
    },
  };
}
