# Structural Correctness Boundary (`QUAL-012`)

<!-- rq-ss009 -->

Report `QUAL-012 structural_correctness_bypass` when heuristic inference owns correctness, security, persistence, workflow state, gate completion, or spec compliance.

## Look for

- Fuzzy/title/Jaccard/similarity matches suppressing or mutating records without exact refs or explicit user confirmation.
- Regex/prose parsing as sole authority where schema/parser/typed fields/validator/state machine should own boundary.
- LLM/agent judgment deciding compliance, gate completion, persistence, or security without validator/tool evidence.
- Untrusted input reaching business logic before parser/schema/allowlist recognition and normalization.
- Title/body heuristics used despite typed metadata or schema fields.

## False-positive controls

- Advisory heuristics for discovery/ranking/triage are allowed.
- Legacy fallback allowed when typed metadata/schema precedence is explicit.
- User-confirmed candidate actions allowed when heuristic output is not authority.
- Low confidence stays non-blocking unless structural-boundary ownership is proven.

## Context boundary

<!-- rq-ss008 -->

Scanner context packets are orientation only, not finding locations. Do not report findings against ADV change summaries, task evidence, examples, or fixture descriptions unless same issue exists in target source.

## Source evidence requirement

Every finding must cite target source file via `file:line` or scoped source evidence. If evidence unavailable, omit or return low confidence.

## Low-confidence grouping

Low-confidence findings are non-blocking by default. Preserve for JSON/audit output, but separate from actionable findings in text reports.
