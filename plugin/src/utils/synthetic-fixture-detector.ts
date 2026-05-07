/**
 * Synthetic Validation Draft Detector
 *
 * Shared predicate that matches change IDs / summaries used by ADV's
 * own automated validation, parity, latency, and roundtrip workflows.
 *
 * Background: pre-cull integration tests created changes with these
 * predictable patterns and never cleaned up after themselves. Result:
 * ~600 stale records leaked across 16 ADV project directories. The
 * leak was reaped manually (see audit 2026-05-07), and the
 * adv_change_create tool now rejects these patterns at change-creation
 * time. This module re-exports that predicate so the lower-level
 * storage save path can apply the same guard, catching any code path
 * (legacy tools, test harnesses, manual disk writes) that bypasses
 * adv_change_create and would otherwise re-introduce the leak.
 *
 * Spec ref: rq-synthstate01 (Synthetic Validation Draft Isolation)
 *
 * Taxonomy of recognized synthetic patterns:
 *
 *   1. Roundtrip validation — patterns: "change roundtrip",
 *      "changeRoundtrip", "changeRoundtripN".
 *   2. Per-subsystem parity runs — patterns: task/gate/wisdom/reentry
 *      parity (with or without space, with or without N suffix), and
 *      bracket-prefix markers like "[parity:legacy]" / "[parity:temporal]".
 *   3. Latency benchmark runs — patterns: "latency legacy",
 *      "latencyLegacy", "latencyLegacyN".
 *   4. Harness cleanup artifacts — pattern: "cleanupParityHarnessLeak".
 *   5. Comparison protocol iterations — pattern:
 *      "userIntuitComparisonProtocol".
 */

const SYNTHETIC_PATTERNS: RegExp[] = [
  // Bracket-prefix parity markers
  /^\[parity:(legacy|temporal)\]\s+/i,
  // Explicit parity-prefix markers
  /^parity(Legacy|Temporal)\w*\d*$/i,
  // Roundtrip validation
  /^change\s+roundtrip\d*$/i,
  /^changeRoundtrip\d*$/i,
  // Per-subsystem parity runs
  /^task\s+parity\d*$/i,
  /^taskParity\d*$/i,
  /^gate\s+parity\d*$/i,
  /^gateParity\d*$/i,
  /^wisdom\s+parity\d*$/i,
  /^wisdomParity\d*$/i,
  /^reentry\s+parity\d*$/i,
  /^reentryParity\d*$/i,
  // Latency benchmark runs
  /^latency\s*legacy\d*$/i,
  /^latencyLegacy\d*$/i,
  // Harness cleanup artifacts
  /^cleanupParityHarnessLeak\d*$/i,
  // Comparison protocol iterations
  /^userIntuitComparisonProtocol\d*$/i,
];

/**
 * Returns true when the input string matches a known synthetic
 * validation/parity/latency/roundtrip pattern.
 *
 * Used by:
 *   - adv_change_create (input: change summary, pre-creation)
 *   - storage/json.ts saveChange (input: change.id, defense-in-depth at
 *     write time)
 *
 * The single function works on both summaries and IDs because IDs are
 * camelCase slugifications of summaries, so the same regex patterns
 * match both whitespace-separated summaries (e.g. "change roundtrip")
 * and their slugified IDs (e.g. "changeRoundtrip").
 */
export function isSyntheticValidationDraftPattern(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  return SYNTHETIC_PATTERNS.some((pattern) => pattern.test(trimmed));
}
