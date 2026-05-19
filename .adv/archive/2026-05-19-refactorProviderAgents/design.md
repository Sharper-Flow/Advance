# Design

## Architecture Overview

Replace the generated provider-agent architecture with one canonical `adv` agent and runtime provider-hint injection inside the existing ADV system block assembler.

Current architecture:

```text
.opencode/agents/adv.md
  ├─ sync-global.sh copies canonical body to agent-parts/advance/adv.md
  ├─ sync-global.sh copies provider hints to agent-parts/advance/providers/*.md
  ├─ sync-global.sh generates agent-parts/advance/adv-{provider}.md
  └─ sync-global.sh writes global agents/adv-{provider}.md full body copies
```

Target architecture:

```text
.opencode/agents/adv.md              # repo canonical ADV agent source
ADV_INSTRUCTIONS.md                  # protocol source scoped to ADV only
~/.config/opencode/agents/adv.md     # one synced runtime agent: canonical body + ADV_INSTRUCTIONS
.opencode/agent-parts/providers/*.md # provider hint source/reference assets
plugin/src/utils/system-block.ts     # typed runtime hint map + providerHintSection
plugin/src/index.ts                  # passes structured currentProviderID to assembler
scripts/sync-global.sh               # syncs single ADV runtime agent; removes stale generated variants
```

Provider-specific guidance moves from generated markdown agent bodies to a stable section in the single ADV system block:

```text
[ADV:PROVIDER_HINT:<provider>]
{provider-specific instruction text}
```

The section is emitted only when structured runtime context maps to a known provider hint. Unknown or missing provider/model identity emits no provider hint and leaves generic ADV behavior intact.

The single runtime `adv.md` must still include `ADV_INSTRUCTIONS.md` protocol content. This preserves the existing scoped-instruction contract: ADV protocol instructions are loaded only for ADV, not globally via `opencode.json instructions[]`, and non-ADV agents do not pay the ADV protocol prompt tax.

## Key Decisions

### Decision 1: Remove provider-specific agents entirely

`adv-claude`, `adv-gpt`, `adv-glm`, and `adv-kimi` are removed as target runtime agents. No thin aliases or compatibility agents are added in code.

Rationale:

- User explicitly chose removal over aliases.
- Aliases preserve the conceptual duplication this change is removing.
- One canonical `adv` is easier to reason about for sync, tests, docs, and future OMP routing.

Tradeoff:

- Existing user config that selects `adv-{provider}` must be manually cleaned up once. This is accepted by agreement and documented as manual migration.

### Decision 2: Generate one ADV runtime agent, not four provider agents

`sync-global.sh --fix` should assemble the global runtime `adv.md` from:

1. repo canonical `.opencode/agents/adv.md` frontmatter/body
2. repository `ADV_INSTRUCTIONS.md` protocol content

This replaces the old per-provider concatenation order:

```text
canonical ADV body + ADV_INSTRUCTIONS.md + provider hint
```

with:

```text
canonical ADV body + ADV_INSTRUCTIONS.md
```

Provider hints are appended at runtime by the plugin system-block hook.

Rationale:

- Preserves `rq-scopedAdvInstructions01` intent: ADV protocol content is scoped to ADV surfaces and absent from global `instructions[]`.
- Avoids non-ADV prompt tax.
- Avoids four generated provider-agent copies.
- Keeps the runtime ADV agent complete even when no provider hint is emitted.

### Decision 3: Runtime hints live in the system block assembler

Add a provider hint section to `plugin/src/utils/system-block.ts`, using structured runtime model context from `plugin/src/index.ts`.

Rationale:

- `system-block.ts` already owns single-system-entry prompt contributions.
- It is pure and testable.
- It already has provider-aware behavior (`providerSwitchSection`).
- It already preserves OpenAI-compatible providers by appending to `output.system[0]` instead of pushing new entries.

Design shape:

```ts
type ProviderHintKey = "claude" | "gpt" | "glm" | "kimi"

const PROVIDER_HINTS: Readonly<Record<ProviderHintKey, string>> = {
  claude: "<!-- PROVIDER_HINT:claude -->...",
  gpt: "<!-- PROVIDER_HINT:gpt -->...",
  glm: "<!-- PROVIDER_HINT:glm -->...",
  kimi: "<!-- PROVIDER_HINT:kimi -->...",
}

function resolveProviderHintKey(input: AssembleSystemBlockInput): ProviderHintKey | null {
  // Use structured provider/model fields only. No free-text guessing.
}

function providerHintSection(input: AssembleSystemBlockInput): string | null {
  const key = resolveProviderHintKey(input)
  if (!key) return null
  return `[ADV:PROVIDER_HINT:${key}]\n${PROVIDER_HINTS[key]}`
}
```

During implementation, provider identity fields must be verified against OpenCode's actual hook input. If the current hook exposes only `providerID`, some model-specific hints may not be structurally distinguishable. In that case, do not guess: inject only hints with reliable structured matches and document unsupported model-specific hints until OpenCode exposes model ID in the hook.

### Decision 4: Prefer typed/generated constants over runtime file IO

Provider hints should be available to `system-block.ts` as static TypeScript data, not read from disk inside the prompt hook.

Rationale:

- `system-block.ts` contract says pure formatter: no IO, no side effects.
- Runtime prompt hooks should not fail because a synced file is missing.
- Unit tests can enforce that constants include provider markers and expected hints.

Implementation options:

1. Manual typed constants copied from `.opencode/agent-parts/providers/*.md`.
2. Generated TypeScript module from provider hint markdown assets.

Recommended implementation: start with manual typed constants plus tests. If drift becomes painful later, add a generator in a separate change. The hint set is tiny and stable.

### Decision 5: `sync-global.sh` stops creating provider prompt artifacts

Remove the provider assembly pipeline as required runtime behavior:

- `sync_adv_prompt_parts` as a provider-prompt sync step
- `generate_concatenated_provider_prompts`
- `generate_provider_variants`
- provider prompt ref patching
- provider runtime canary for `opencode debug agent adv-{provider}`
- provider variant tool drift checks
- generic `adv` disabling tied to provider variant activation
- special skip logic that preserves generated `adv-{provider}.md` files from stale cleanup

Instead, sync should:

- write one complete global `adv.md` runtime agent containing canonical ADV body + `ADV_INSTRUCTIONS.md`
- preserve/copy normal non-ADV global agents as today
- remove stale generated `adv-{provider}.md` files from global agents during cleanup
- avoid writing `agent.adv-{provider}.prompt` keys
- avoid toggling `agent.adv.disable` because of provider variants
- keep `ADV_INSTRUCTIONS.md` absent from global `opencode.json instructions[]`
- document manual cleanup for existing config keys

### Decision 6: Manual migration, not automatic migration

No automatic mutation of user-owned `agent.adv-{provider}` config is implemented in this change.

Rationale:

- User explicitly chose one-time manual migration.
- User-owned model routing may encode preferences that the script cannot safely reinterpret.
- Avoids scope expansion into OMP/config migration logic.

Docs should instruct users to:

- remove `agent.adv-claude`, `agent.adv-gpt`, `agent.adv-glm`, and `agent.adv-kimi` entries from global `opencode.json`
- remove stale generated files from `~/.config/opencode/agents/` if present, or run updated `scripts/sync-global.sh --fix` if it performs stale-file cleanup
- ensure generic `agent.adv.disable` is not set solely because of retired provider variants
- restart OpenCode after config/agent/plugin changes

### Decision 7: OMP per-phase routing remains a future follow-up

Do not implement OMP per-phase routing here. Document the single-agent architecture as compatible with future routing because it removes provider-specific agent names from the runtime contract.

Future follow-up shape:

```yaml
adv:
  proposal: anthropic/claude-...
  discovery: openai/gpt-...
  execution: moonshotai/kimi-...
  review: z-ai/glm-...
```

This needs separate design for schema, UX, fallback, auditability, and gate/model handoff.

## ADR Drafts

No ADR drafted for this change.

Reason: the decision is important but not hard to reverse at an architectural storage/protocol level. The spec delta and provider assembly docs are sufficient durable context.

## Implementation Strategy

1. **Create one complete ADV runtime agent**
   - Update sync to write global `adv.md` with canonical `.opencode/agents/adv.md` frontmatter and body plus `ADV_INSTRUCTIONS.md` body.
   - Keep `ADV_INSTRUCTIONS.md` out of global `instructions[]`.
   - Update tests to prove global `adv.md` contains ADV protocol markers such as `## TDD Protocol (RSTC)` while non-ADV agents do not.

2. **Add runtime provider hint section**
   - Extend `AssembleSystemBlockInput` only if structured model fields are available and needed.
   - Add `PROVIDER_HINTS` or equivalent typed constants.
   - Add `providerHintSection` to stable sections. Recommended order: degraded → health → providerHint → providerSwitch → worktree → activeChange.
   - Preserve `output.system[0]` mutation only.

3. **Update system-block tests**
   - Known provider/model emits exactly one matching hint marker.
   - Missing/unknown provider emits no hint.
   - Internal calls emit no ADV block.
   - Single-system-entry behavior remains unchanged through `applyAdvSystemBlock`.
   - Provider hint section is stable and does not appear in volatile suffix.

4. **Simplify sync script**
   - Remove provider prompt-part generation and provider variant generation calls.
   - Remove prompt-ref patching for `agent.adv-{provider}`.
   - Remove provider-variant activation logic that disables generic `adv`.
   - Remove the stale cleanup exemption for generated provider variants so old generated files are deleted.
   - Keep repo-local provider hint markdown files as source/reference assets only if tests/docs still need them.

5. **Rewrite sync/overlay tests**
   - Replace “generates provider variants” assertions with “does not generate provider variants”.
   - Add stale generated file cleanup coverage.
   - Remove stale concatenated prompt tests.
   - Update prompt-only provider config tests to manual-migration expectations or delete if obsolete.
   - Keep tests protecting canonical `adv.md` visibility and ADV instruction scoping.

6. **Update provider eval metrics**
   - Replace `generated_provider_file` as a required metric with a metric showing removed/avoided duplication, canonical prompt size, ADV protocol instruction size, provider hint size, and selected runtime prompt size.
   - Keep baseline vs with-hint scoring.
   - Ensure harness does not treat generated provider files as canonical.

7. **Update docs and smoke checklist**
   - Rewrite `docs/provider-agent-assembly.md` around single-agent runtime injection.
   - Rewrite `docs/provider-adv-smoke-checklist.md` around unit/integration checks and manual migration.
   - Include restart requirement after config/agent/plugin changes.
   - Include future OMP per-phase routing note.

8. **Update specs**
   - Amend `.adv/specs/advance-meta/spec.json` and generated `docs/specs/advance-meta.md`.
   - Replace old `rq-providerAdvSkinny01` scenarios with runtime-hint/sync-simplification scenarios.
   - Amend `rq-providerAdvMetrics01` away from mandatory generated provider-file metrics.
   - Amend `rq-scopedAdvInstructions01` from “scoped to generated provider agents” to “scoped to the single ADV runtime agent”.

9. **Verify**
   - Run targeted tests first: `pnpm test -- src/utils/system-block.test.ts src/sync-global.test.ts src/overlay-sync-assets.test.ts` from `plugin/`.
   - Run `pnpm run check` from `plugin/`.
   - Run broader tests if needed after sync script/spec/doc edits.

## LBP Analysis

Single-agent runtime injection is the preferred long-term approach because:

- It aligns provider-specific behavior with actual runtime provider/model context instead of static agent names.
- It removes large generated prompt-body copies and their drift-check surface.
- It centralizes prompt augmentation in the existing single-system-block path, which already encodes OpenAI-compatible provider safety.
- It keeps ADV protocol instructions scoped to ADV without global instruction tax.
- It makes future OMP per-phase routing easier by removing provider identity from agent names.
- It preserves the canonical agent as the only user-facing ADV orchestrator.

The discarded alternatives are weaker:

- **Keep generated variants:** minimal implementation risk but fails the core objective.
- **Thin aliases:** softens migration but keeps provider-agent names and hides the architectural simplification.
- **Runtime file IO for hints:** preserves editable markdown but violates `system-block.ts` purity and adds prompt-hook failure modes.
- **Build OMP routing now:** valuable but expands scope beyond duplication removal.

## Affected Components

- `plugin/src/utils/system-block.ts`
  - Add provider hint data/section.
  - Extend tests for provider hint injection.

- `plugin/src/index.ts`
  - Verify `currentProviderID` is enough.
  - If model ID is required and unavailable, document limitation rather than adding heuristics.

- `scripts/sync-global.sh`
  - Assemble one global `adv.md` runtime file with canonical ADV body + `ADV_INSTRUCTIONS.md`.
  - Remove provider generation/prompt-ref logic.
  - Remove provider-specific generic-adv disabling logic.
  - Allow stale generated provider files to be removed.

- `plugin/src/sync-global.test.ts`
  - Rewrite structural assertions around removed provider generation and scoped single ADV runtime prompt.

- `plugin/src/overlay-sync-assets.test.ts`
  - Rewrite temp-home integration tests for no variants + stale cleanup + single ADV protocol inclusion.

- `scripts/provider-eval.ts`
  - Update prompt-size metrics and comments to reflect runtime injection.

- `docs/provider-agent-assembly.md`
  - Rewrite from generated variants to single-agent runtime hints.

- `docs/provider-adv-smoke-checklist.md`
  - Rewrite validation steps.

- `.adv/specs/advance-meta/spec.json` and `docs/specs/advance-meta.md`
  - Amend provider ADV and scoped instruction requirements/scenarios.

- `.opencode/agent-parts/providers/*.md`
  - Retain as source/reference assets unless implementation chooses to delete them after copying into typed constants.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Single `adv.md` loses `ADV_INSTRUCTIONS.md` protocol content after provider variants are removed | Sync one complete global `adv.md` containing canonical body + `ADV_INSTRUCTIONS.md`; amend `rq-scopedAdvInstructions01` accordingly. |
| Provider ID does not distinguish Kimi when routed through OpenRouter | Do not guess. Use structured data only. If model ID is unavailable, document Kimi hint limitation or defer model-aware detection to follow-up. |
| Provider hints duplicate across static prompt and runtime injection during transition | Remove generated provider variants and docs/tests that expect prompt-part injection before enabling runtime hint as the only path. |
| Stale global `adv-{provider}.md` files continue to be selected | Updated sync cleanup removes stale generated files; docs include manual config cleanup and restart instructions. |
| Existing user config breaks after provider-agent removal | Agreement accepts manual one-time migration; docs provide exact cleanup steps. |
| Runtime system hook adds multiple system messages | Keep using `applyAdvSystemBlock` mutation of `output.system[0]`; add tests. |
| Spec conflict blocks archive | Amend `advance-meta` in the same change; validation before archive catches drift. |
| Tests assert old provider architecture | Rewrite tests as part of implementation; do not preserve old assertions as compatibility requirements. |

## Validation Plan

- Unit tests for `providerHintSection` behavior through `assembleSystemBlock`/`applyAdvSystemBlock`.
- Sync script tests proving provider variants are not generated and stale generated provider files are removed.
- Sync script tests proving global `adv.md` includes ADV protocol instructions while `opencode.json instructions[]` excludes `ADV_INSTRUCTIONS.md`.
- Docs/spec tests updated for amended requirements/scenarios.
- `pnpm run check` from `plugin/`.
- Targeted `pnpm test -- src/sync-global.test.ts src/overlay-sync-assets.test.ts` plus system-block tests.

## Future Follow-up: OMP Per-Phase Routing

This design intentionally does not implement per-phase model routing. It makes that future work cleaner by collapsing ADV runtime identity to one agent.

A future OMP change would need to define:

- config schema for phase → model/provider assignment
- UX for selecting phase-specific models
- fallback behavior when assigned providers are unavailable
- audit trail for model used per gate or decision
- interaction with sub-agent model selection

That should be a separate change because it affects product behavior, not only provider prompt assembly.

## Validator Result

Verdict: CAUTION

Findings:

- Correctness: design satisfies objectives if provider hints can be mapped from structured model context.
- Simplicity: design is materially simpler than generated provider-agent copies.
- Spec-law compliance: caution because current `advance-meta` provider-agent, prompt metrics, and scoped ADV instruction requirements still encode generated provider agents. Mitigation: amend `rq-providerAdvSkinny01`, `rq-providerAdvMetrics01`, and `rq-scopedAdvInstructions01` in this change.
- Alternatives: caution that some provider/model hints may be obsolete or structurally undetectable if the hook exposes provider ID but not model ID. Mitigation: inject only structurally reliable hints; document unsupported model-specific hints instead of guessing.

Recommendation: proceed with caution. The design is sound, but make the `advance-meta` spec amendment mandatory before archive and add tests proving exactly one `output.system[0]` entry with zero extra system pushes.
