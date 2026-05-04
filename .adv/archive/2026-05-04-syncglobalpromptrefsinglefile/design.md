# Design

## Architecture Overview

Keep provider ADV assembly as a deterministic generation pipeline in `scripts/sync-global.sh`:

1. Canonical ADV body is copied from repo-local `.opencode/agents/adv.md` into global prompt part `agent-parts/advance/adv.md` with frontmatter stripped.
2. Provider hints are copied from `.opencode/agent-parts/providers/{provider}.md` into `agent-parts/advance/providers/{provider}.md`.
3. Per-provider concatenated prompt files are generated at `agent-parts/advance/adv-{provider}.md` by joining canonical body + exactly one provider hint.
4. Generated global `adv-{provider}.md` markdown agents preserve canonical frontmatter/tool allowlists and embed the same concatenated runtime body.
5. Global `opencode.json` `agent.adv-{provider}.prompt` values point to exactly one concatenated prompt file for JSON-only/future runtimes and inspection.
6. Check mode validates both static prompt-part freshness and runtime resolution when `opencode` is available.

This keeps one source of truth for prompt content while supporting current OpenCode behavior where markdown agent bodies have precedence over JSON prompt refs.

## Key Decisions

### 1. Single-file prompt refs only

Use `provider_prompt_ref()` as the sole source for prompt ref string generation:

```text
{file:./agent-parts/advance/adv-{provider}.md}
```

Rationale: official OpenCode docs document a single `prompt` value using one `{file:...}` reference. Multi-ref composition is undocumented and already treated as legacy drift by this repo.

### 2. Regenerate-and-diff freshness checks

Validate concatenated prompt files by recomputing expected content from current `adv.md` prompt part and provider hint, then comparing to disk.

Rationale: avoids sidecar hashes, keeps check deterministic, and catches canonical/hint drift after edits.

### 3. Runtime canary is additive, not mandatory when CLI is unavailable

`sync-global.sh --check` should run `opencode debug agent adv-{provider}` when available. If `opencode` is unavailable, emit a warning and continue static checks.

Rationale: fresh/test machines may run repo checks before the CLI is installed. Static checks still verify generated artifacts; runtime canary adds confidence where possible.

### 4. Prompt-only provider keys stay non-activating

Provider mode should be considered active only when provider agent config contains activation fields (`model`, `disable`, `variant`, or `color`). `prompt` alone remains sync-managed metadata.

Rationale: syncing prompt refs must not hide generic `adv` or alter user model-selection state.

### 5. Spec deltas only for uncovered law gaps

Existing `rq-providerAdvSkinny01` already expresses the main law. Implementation should only update specs if a concrete gap appears during execution.

Rationale: avoid redundant spec churn; specs remain law, not implementation notes.

## Implementation Strategy

1. Confirm current `scripts/sync-global.sh` behavior matches design:
   - `provider_prompt_ref()` emits the single-file path.
   - `patch_provider_prompt_refs()` uses it for all providers.
   - `check_provider_prompt_parts()` detects legacy multi-ref patterns and stale/missing concatenated files.
   - `check_provider_runtime_canary()` warns/skips when `opencode` is unavailable.
2. Tighten tests only where coverage is missing or too weak:
   - Unit/asset assertion for prompt-ref string shape.
   - Integration-style sync test for global `opencode.json` prompt refs.
   - Staleness/legacy-ref detection assertions.
   - Runtime canary token assertions and skip behavior if not already covered.
3. Update docs only where drift or direct contradiction exists:
   - Provider assembly doc.
   - Provider smoke checklist.
   - Generated specs docs/spec JSON only if existing text is incomplete or contradictory.
   - Adjacent developer docs only for direct provider-sync contradictions.
4. Run focused verification first, then full stack verification as needed:
   - `pnpm test -- src/sync-global.test.ts src/overlay-sync-assets.test.ts`
   - `pnpm run check`
   - `pnpm test` or narrower follow-up depending on failures.

## LBP Analysis

This design matches long-term best practice:

- Follows official OpenCode documented prompt-file shape instead of relying on undocumented multi-file prompt expansion.
- Maintains deterministic generated artifacts rather than runtime concatenation side effects.
- Keeps user-owned provider activation separate from sync-owned prompt metadata.
- Uses regenerate-and-diff checks over stale hashes or manual freshness assumptions.
- Preserves current runtime compatibility while preparing for future JSON-prompt resolution behavior.

## Affected Components

- `scripts/sync-global.sh`
  - `provider_prompt_ref`
  - `sync_adv_prompt_parts`
  - `generate_concatenated_provider_prompts`
  - `generate_provider_variants`
  - `check_provider_prompt_parts`
  - `check_provider_runtime_canary`
  - `patch_provider_prompt_refs`
  - provider activation helpers
- `plugin/src/sync-global.test.ts`
- `plugin/src/overlay-sync-assets.test.ts`
- `docs/provider-agent-assembly.md`
- `docs/provider-adv-smoke-checklist.md`
- `docs/specs/advance-meta.md` and `.adv/specs/advance-meta/spec.json` only if a gap is found
- `AGENTS.md` / `project.md` only for direct contradictions

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| `opencode` unavailable makes runtime canary impossible | Warn and continue; rely on static checks. |
| Docs drift across multiple instruction surfaces | Limit edits to direct contradictions; avoid broad rewrite overlap with adjacent instruction-cleanup change. |
| Prompt-only refs accidentally activate provider mode | Keep activation helper restricted to `model`, `disable`, `variant`, `color`; add/keep regression coverage. |
| Generated provider body and prompt ref source diverge | Use same concatenated prompt file as generation source and validate via regenerate-and-diff. |
| Existing implementation already satisfies most criteria | Prep should create verification/doc-tightening tasks rather than speculative rewrites. |

## Contract-Compromise Risk

None identified. Design preserves all approved acceptance criteria, constraints, and avoidances.

## Validator Result

Validator: clean pass ✓ (`VALIDATED`).

Findings:

- Correctness: design maps all five acceptance criteria to implemented code paths in `sync-global.sh` and tests.
- Simplicity: no materially simpler approach satisfies prompt-ref shape, freshness detection, prompt-only safety, and runtime verification.
- Spec-law compliance: design aligns with `rq-providerAdvSkinny01` and `rq-providerAdvMetrics01`; no spec conflict found.
- Alternatives: legacy multi-file prompt refs are the only significant alternative and are correctly rejected as undocumented/spec-disallowed drift.

Recommendation: proceed to prep. Minor implementation note for prep: consider adding a brief code comment near `check_provider_prompt_parts()` where `needs_parts=true` gates freshness checks on configured prompt refs, if clarity is warranted.
