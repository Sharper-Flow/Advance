## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |

> **Note:** The originating project should be consulted for context on why this change is needed.

# Refactor ADV prompt

## Problem

The provider-agent convergence made the single selectable `adv` agent too large by appending the full `ADV_INSTRUCTIONS.md` to a canonical `adv.md` that already contains substantial ADV protocol text.

Pre-convergence provider-specific agents were intended to be lean runtime prompts: canonical ADV body plus provider hint. During convergence, the implementation switched to `global adv.md = canonical ADV body + ADV_INSTRUCTIONS.md`, which preserved safety but introduced duplicated prompt content and excessive token load.

The goal is **not** to make ADV smaller by dropping protocol. Recent ADV behavior with the full protocol embedded has been valuable. The goal is to remove duplicate / redundant prompt load while preserving the runtime guidance, safety constraints, and workflow contracts agents rely on.

## What Changes

Refactor ADV runtime prompt assembly so the global `adv.md` stays complete and self-contained without blindly concatenating the entire `ADV_INSTRUCTIONS.md` file after a canonical agent body that already contains overlapping protocol.

Classify protocol content into:

- **Runtime-critical protocol** — retained in the `adv` runtime agent.
- **Code/spec-enforced protocol** — compressed to short pointers plus invariant/test references where safe.
- **Developer/reference material** — retained in `ADV_INSTRUCTIONS.md`, docs, specs, or command files but not repeated wholesale in the runtime prompt.

## Success Criteria

- The single global `adv` runtime agent remains self-contained and safe to run ADV workflows.
- `ADV_INSTRUCTIONS.md` remains a repo/dev/source-of-truth reference, not appended wholesale into runtime `adv.md`.
- Generated/installed `adv.md` is comparable in lean-ness to the old provider runtime prompts while preserving required invariants.
- No valuable ADV protocol is lost: every removed runtime section is either retained in lean runtime form, structurally enforced by code/tests/specs, or explicitly classified as developer/reference-only.
- Provider-specific guidance remains runtime-injected through the single-system-block path; no provider-specific selectable `adv-*` agents return.
- Sync/deploy tests prevent reintroducing full `ADV_INSTRUCTIONS.md` concatenation, provider-agent drift, or accidental protocol loss.

## Acceptance Criteria

- `scripts/deploy-local.sh --fix` writes one selectable global `adv.md` and does not append the full `ADV_INSTRUCTIONS.md` wholesale.
- Global `adv.md` contains required runtime invariants exactly once or through an equivalent compressed/pointer form: slash-command boundary, gate sequencing, HITL checkpoints, ADV state access, worktree isolation, TDD/checkpoint policy, structural correctness, command-as-contract routing, due-diligence routing, and output/handoff voice rules.
- A protocol coverage inventory maps every removed or compressed runtime section to one of: retained runtime text, code-enforced invariant, spec requirement, command contract, or reference-only material.
- Existing spec law is updated where needed, especially `advance-meta` requirements that currently describe global `adv.md` as canonical body plus `ADV_INSTRUCTIONS.md` protocol content.
- Provider-specific `adv-{provider}.md` files are not generated or required.
- Provider hints continue through runtime system-block injection and still append to `output.system[0]` only.
- Prompt-size checks cover both planes: lean `adv.md` body budget and composed runtime budget including ADV provider/status banner plus caveman voice contract when active.
- Tests cover prompt assembly, stale provider cleanup, invariant presence, protocol coverage inventory, spec/doc drift, and a reasonable prompt-size budget.
- `scripts/deploy-local.sh --check`, relevant unit/asset tests, typecheck, and local deploy verification pass.

## Scope

### In Scope

- `scripts/deploy-local.sh` ADV runtime agent assembly behavior.
- Canonical `.opencode/agents/adv.md` runtime prompt content and duplicate-protocol removal.
- `ADV_INSTRUCTIONS.md` references that describe runtime assembly responsibilities.
- Provider-agent assembly documentation, especially `docs/provider-agent-assembly.md`.
- Relevant specs, especially `advance-meta` requirements around provider ADV skinny runtime prompts and prose reduction.
- Asset/unit tests covering deploy sync, prompt composition, stale provider cleanup, invariant coverage, and prompt-size metrics.
- Local deploy verification for global `~/.config/opencode/agents/adv.md` after `scripts/deploy-local.sh --fix`.

### Out of Scope

- Redesigning the ADV 7-gate lifecycle.
- Changing gate semantics, HITL policy, worktree policy, task checkpoint policy, or TDD protocol.
- Removing required runtime protocol just to hit a smaller token target.
- Reintroducing provider-specific selectable ADV agents.
- Globalizing `ADV_INSTRUCTIONS.md` via OpenCode `instructions[]`.
- Implementing OMP phase routing.
- Changing caveman plugin behavior.

### Must Not

- Must not drop protocol that currently makes ADV reliable without a coverage-map entry and replacement enforcement/retention path.
- Must not hand-edit installed global files as the fix; fix source/generator behavior.
- Must not push additional system blocks from ADV or provider/caveman composition; runtime additions must append to `output.system[0]` per `rq-singleSystemBlock01`.
- Must not rely on heuristic prompt-size wins as correctness proof; correctness must be enforced by specs/tests/inventories.
- Must not silently weaken due diligence, ADV state access, worktree isolation, cancellation approval, gate sequencing, or checkpoint semantics.

## Error Handling / Rollback

- If `scripts/deploy-local.sh --check` detects drift after assembly changes, it must report deterministic remediation and fail safely rather than claiming sync success.
- Runtime agent assembly should keep the existing destination intact until the new composed prompt is fully written/validated, using temp-file/atomic-write behavior where practical.
- If prompt-size or invariant-coverage tests fail, deploy/check must fail before the broken prompt is treated as acceptable.
- If a local deploy writes an invalid global `adv.md`, rollback is to restore the previous global agent file or rerun the last known-good `scripts/deploy-local.sh --fix` from a clean checkout, then restart OpenCode.
- If runtime provider/status/caveman injection fails, the plugin must preserve single-system-block discipline and avoid corrupting `output.system`; errors should degrade with diagnostics, not multi-block emission.

## Spec Delta Required

Current spec law still encodes the post-convergence behavior. `advance-meta` includes `rq-providerAdvSkinny01` and `rq-scopedAdvInstructions01` scenarios that describe global `adv.md` as containing the canonical ADV body plus `ADV_INSTRUCTIONS.md` protocol content. This change must update that law to allow a lean, self-contained runtime prompt with explicit protocol coverage instead of wholesale `ADV_INSTRUCTIONS.md` concatenation.

## Discovery Agenda

- Inventory canonical `.opencode/agents/adv.md` and `ADV_INSTRUCTIONS.md` overlap by section.
- Classify each protocol section as runtime-critical, code/spec-enforced, command-contract-owned, or developer/reference-only.
- Verify which invariants are already machine-enforced by tests/specs/tools and which still require runtime prose.
- Decide final prompt-size budgets for lean `adv.md` and composed runtime `system[0]` with ADV banner plus caveman voice contract.
- Identify all docs/specs/tests that still assume full `ADV_INSTRUCTIONS.md` concatenation.
- Validate installed-agent behavior after `scripts/deploy-local.sh --fix` and OpenCode restart.

## Constraints

- Preserve single selectable `adv` agent behavior.
- Preserve provider hints through structured runtime system-block injection.
- Preserve caveman/ADV plugin composition discipline: append to `output.system[0]`; do not add separate system entries.
- Prefer structural correctness: specs, drift tests, coverage inventory, and deterministic prompt assembly over heuristic assertions that protocol was preserved.

## Impact

Expected benefit: lower ADV runtime prompt cost and less duplicate instruction noise while keeping the reliability benefits of the full protocol that has been working well recently.

Main risk: accidental protocol loss. Mitigation is a required coverage inventory plus tests/spec updates that lock retained or enforced invariants before trimming runtime prose.

## Related Repositories

- Primary repo: `advance`.
- Related context: toolbox change `injectCavemanSubagents`, which confirmed plugin voice-contract injection should append to `output.system[0]` and adds ~150 tokens to composed runtime prompts when caveman is active.

## Notes

Investigation found the current live global `adv.md` at roughly 23k tokens. The bloat comes from concatenating canonical `.opencode/agents/adv.md` with full `ADV_INSTRUCTIONS.md`; the latter is about 18k tokens. The intended fix is source/generator-level, not hand-editing installed global files.

Repo evidence confirms the assembly surface is `scripts/deploy-local.sh`, not a separate `scripts/sync-global.sh` file. Existing docs/specs currently describe `global adv.md = canonical ADV body + ADV_INSTRUCTIONS.md`, so this is a spec-law change, not just a script cleanup.

## Cross-Reference: injectCavemanSubagents (toolbox, archived 2026-05-20)

Related change in the **toolbox** project closed today. Same surface (`experimental.chat.system.transform` hook → `output.system[0]`). Relevant inputs for this refactor:

- ADV plugin's `rq-singleSystemBlock01` invariant requires single-segment system prompts.
- Plugins on `experimental.chat.system.transform` MUST append to `output.system[0]`, not `push()` new segments.
- Caveman appends a sentinel voice contract of roughly 150 tokens when active.
- Prompt-size reporting for this change should account for lean ADV static prompt, ADV dynamic banner/provider/status text, and caveman voice-contract allowance.

## Discovery Findings (2026-05-20)

### Current State

- `.opencode/agents/adv.md` is the canonical ADV body: 355 lines / 19,816 bytes / 2,409 words.
- `ADV_INSTRUCTIONS.md` is the full protocol reference: 950 lines / 77,659 bytes / 8,181 words.
- `scripts/deploy-local.sh:344-370` currently requires both files and writes `canonical_text + "\n\n" + instructions_text + "\n"` to global `adv.md`.
- `docs/provider-agent-assembly.md:9-18` documents `global adv.md = canonical ADV body + ADV_INSTRUCTIONS.md`.
- `docs/specs/advance-meta.md:286-288` and `.adv/specs/advance-meta/spec.json:1257-1261` require ADV_INSTRUCTIONS protocol content and static order.
- `plugin/src/overlay-sync-assets.test.ts:296-324` locks the current concatenation expectation by asserting generated `adv.md` contains `### TDD Protocol (RSTC)` from `ADV_INSTRUCTIONS.md`.
- `plugin/src/utils/system-block.ts:340-349` appends ADV runtime additions to `output.system[0]`; provider hints are structured constants and remain independent of static `adv.md` assembly.

### Extends

- `docs/repo-improve-prep.md`: confirms repo-internal LBP of tool registry, external state, Temporal, and 7-gate model.
- `docs/change-contract-traceability-prep.md`: confirms stable IDs and traceability prevent context loss; runtime protocol coverage should use the same principle.
- Archived `refactorProviderAgents`: established single selectable `adv` plus runtime provider hints; its spec law now over-specifies `ADV_INSTRUCTIONS.md` wholesale inclusion.
- Archived `optimizeAdvCommandTokenLoadVia`: established contract-token preservation and prose compression methods; apply the same method to runtime prompt assembly.

### Related Pattern Scan

Same-pattern assumptions found:

- `scripts/deploy-local.sh:344-370` — hardcoded concatenation of canonical body plus full `ADV_INSTRUCTIONS.md`.
- `docs/provider-agent-assembly.md:9-18` — documents full concatenation.
- `docs/specs/advance-meta.md:286-288` and `.adv/specs/advance-meta/spec.json:1257-1261` — spec-law requires full protocol content/static order.
- `plugin/src/overlay-sync-assets.test.ts:296-324` — test locks `### TDD Protocol (RSTC)` in generated global `adv.md` as proof of full instructions inclusion.
- `AGENTS.md:151-154` — developer quick-reference says `ADV_INSTRUCTIONS.md` is appended into global runtime `adv.md`.

### Draft Spec Deltas

- `rq-providerAdvSkinny01` — revise body/scenario to say global `adv.md` is complete and self-contained via lean runtime protocol coverage, not necessarily canonical body plus whole `ADV_INSTRUCTIONS.md`.
- `rq-scopedAdvInstructions01` — revise static-order scenario so ADV protocol is scoped to the ADV runtime agent via coverage-controlled lean prompt; non-ADV global instructions remain free of ADV protocol tax.
- `rq-providerAdvMetrics01` — update metrics planes to include lean static runtime prompt, full reference protocol size, provider hint size, ADV dynamic banner estimate, caveman voice-contract allowance, and composed runtime budget.
- `rq-runtimeProtocolCoverage01` (new or folded into prose-reduction requirements) — require coverage inventory for runtime prompt trimming.

### LBP Check

No external-solution check required: this is a repo-internal prompt assembly/spec/test refactor, not an external library/service decision. Long-term best practice is structural: classify prompt sections by enforcement class, preserve exact contract tokens, and prove coverage with tests/specs.

### AMBIGUITY ANALYSIS

Resolved by user question round:

- Runtime retention: trim/remove definitely duplicated instruction content; otherwise conservative.
- Prompt budget: coverage-first, not hard numeric cap.
- Validation: tests/script verification are enough; restarted OpenCode smoke is not required.

Coverage: B:C F:C S:C M:C
