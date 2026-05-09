/**
 * Roadmap-Origin Issue Body Sanitizer (rq-roadmapOriginSanitize01)
 *
 * Strips ADV-emitted scoring fields from a GitHub issue body before it's
 * used to prefill a proposal's problem statement (`/adv-proposal #N`).
 * Without this, scoring fields (Value, TimeCriticality, RROE, Effort,
 * WSJF) leak into the proposal/discovery/design context — priming the
 * agent to scale work depth to the score (low effort → shallow work,
 * high score → "important enough to spend more time"). Quality bar
 * MUST be invariant; see `enforcescoreblindproposaldesig` and
 * `rq-scoreBlindQuality01`.
 *
 * # Scope
 *
 * - Strip `<!-- adv-triage:scoring v1 ... -->` HTML-comment blocks (multiline).
 * - Strip single-line score fields at column 0:
 *   `WSJF`, `Value`, `TimeCriticality`, `RROE`, `Effort` followed by `:` or `=`.
 * - Strip trailing scoring-summary lines: `WSJF score: ...`, `Value score: ...`.
 *
 * # Known limitation (false-positive surface)
 *
 * The column-0 anchor (`^` with `m` flag) means the patterns ONLY match
 * lines where one of the score field names appears at the very start.
 * In practice, issue bodies rarely begin a line with `Value:` or
 * `WSJF=` outside of triage trailers. But:
 *
 *   - `Value: foo` at column 0 in user prose IS stripped.
 *   - `The value of X is...` mid-sentence is NOT stripped.
 *   - `  Value=8` indented (e.g., inside a bullet item) is NOT stripped.
 *
 * If user prose conflicts with the anchor (rare), the workaround is
 * to indent the line or use a different phrasing (e.g., "The value
 * proposition is..." instead of "Value: ...").
 *
 * # Warnings
 *
 * Unrecognized scoring-shaped lines (e.g., a future `Risk=high` or
 * `Confidence=low` field that ADV doesn't currently emit) are NOT
 * stripped — they're surfaced as warnings so a human can review and
 * decide. This avoids over-stripping based on guesswork.
 */

interface SanitizeResult {
  sanitized: string;
  warnings: string[];
}

// Score field names ADV currently emits via /adv-triage Phase 4
// scoring template. Lock these to the canonical set; expand only via
// rq-roadmapOriginSanitize01 amendments.
const KNOWN_SCORE_FIELDS = [
  "WSJF",
  "Value",
  "TimeCriticality",
  "RROE",
  "Effort",
] as const;

// Pattern 1: multi-line HTML-comment scoring block.
// Matches `<!-- adv-triage:scoring v1 ... -->`, including any content
// (lines, blank lines, score fields) inside the block.
const SCORING_BLOCK = /<!--\s*adv-triage:scoring\s+v\d+[\s\S]*?-->/g;

// Pattern 2: single-line score field at column 0.
// Matches `^WSJF=...$`, `^Value: ...$`, etc.
// `m` flag enables `^`/`$` per-line anchoring.
const SCORE_FIELD_LINE = new RegExp(
  `^(?:${KNOWN_SCORE_FIELDS.join("|")})\\s*[:=].*$`,
  "gm",
);

// Pattern 3: defensive trailing scoring-summary line.
// Matches `^WSJF score: ...$`, `^Value score: ...$`.
const SCORE_SUMMARY_LINE = new RegExp(
  `^(?:WSJF|Value)\\s+score\\s*[:=].*$`,
  "gm",
);

// Heuristic: detect "scoring-shaped" lines that AREN'T in the known set,
// for warnings only. Matches `^Word=...` or `^Word: ...` at column 0
// where Word is alpha and the line starts with a single capitalized
// identifier. Conservative — won't trigger on `# Heading:` or normal text.
const UNKNOWN_SCORING_SHAPE = /^([A-Z][A-Za-z]{2,15})\s*[:=]\s*\S+.*$/gm;

export function sanitizeRoadmapOrigin(body: string): SanitizeResult {
  if (!body) return { sanitized: "", warnings: [] };

  const warnings: string[] = [];

  // Step 1: detect unknown scoring-shaped markers BEFORE stripping
  // known patterns (so we don't accidentally warn on the known ones).
  // Skip lines inside the scoring block (which we'll strip wholesale).
  const bodyOutsideBlocks = body.replace(SCORING_BLOCK, "");
  const knownSet = new Set<string>(KNOWN_SCORE_FIELDS);
  const ignoredForWarnings = new Set<string>(["WSJF", "Value"]); // also covered by SCORE_SUMMARY_LINE
  for (const match of bodyOutsideBlocks.matchAll(UNKNOWN_SCORING_SHAPE)) {
    const fieldName = match[1];
    if (knownSet.has(fieldName) || ignoredForWarnings.has(fieldName)) continue;
    warnings.push(
      `Unrecognized scoring-shaped line: "${match[0]}" — not stripped (warn-only).`,
    );
  }

  // Step 2: strip the scoring patterns.
  let sanitized = body;
  sanitized = sanitized.replace(SCORING_BLOCK, "");
  sanitized = sanitized.replace(SCORE_FIELD_LINE, "");
  sanitized = sanitized.replace(SCORE_SUMMARY_LINE, "");

  // Step 3: collapse runs of 3+ blank lines down to 2 (preserves
  // intended paragraph breaks but cleans up gaps from removed lines).
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

  return { sanitized, warnings };
}
