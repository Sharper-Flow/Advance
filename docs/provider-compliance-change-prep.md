# Proposal Prep: Multi-Provider Compliance, Instruction Consolidation, and ADV Hardening

## Purpose

This document is the research pack for turning the abandoned `optimizeProviderCompliance` draft into a set of focused, proposal-ready changes.

It does **not** assume the original draft should be implemented as one change. The evidence below supports splitting it into smaller changes with clearer verification and lower rollout risk.

---

## Executive Summary

The original draft identified real issues, but it bundled together three different classes of work:

1. **ADV tool-level enforcement gaps** inside the plugin
2. **Instruction stack consolidation** in global OpenCode config
3. **Provider-aware adaptation and routing** at the prompt/config layer

That combined scope is too broad for one clean proposal.

### Recommended split

| Recommended change | Purpose | Primary surface |
|---|---|---|
| `hardenAdvCompliance` | Close real tool-enforcement gaps in ADV | `plugin/src/**` |
| `consolidateInstructionStack` | Reduce always-loaded instruction overhead without losing policy | `~/.config/opencode/**` |
| `addProviderAwareAdaptation` | Use model/provider identity for small additive prompt adaptation and routing cleanup | plugin hook + global config |

### Recommended order

1. `hardenAdvCompliance`
2. `consolidateInstructionStack`
3. `addProviderAwareAdaptation`

If the goal includes **measurable** improvement across providers, consider a fourth follow-up:

4. `buildProviderEvaluationHarness`

The current repo has model-comparison scripts, but they are interactive and not suitable for CI or headless verification (`scripts/model-blind-test.ts:146-166`, `scripts/model-blind-test.sh:130-165`).

---

## Investigation Method

### Raw draft reviewed

- `.adv/changes/optimizeProviderCompliance/change.json`
- `.adv/changes/optimizeProviderCompliance/problem-statement.md`
- `.adv/changes/optimizeProviderCompliance/proposal.md`

These were read directly only after explicit user permission because ADV normally forbids raw state-file access.

### Code and config reviewed

- Global config: `~/.config/opencode/opencode.json`
- Global instructions: `~/.config/opencode/instructions/*`
- Global agents: `~/.config/opencode/agents/*`
- ADV overlays: `.opencode/overlays/*`
- Plugin code and tests under `plugin/src/**`
- Sync tooling: `scripts/sync-global.sh`
- Existing model-comparison scripts: `scripts/model-blind-test.ts`, `scripts/model-blind-test.sh`

### Targeted verification executed

- `pnpm vitest run src/tools/task.test.ts` → 53 passed
- `pnpm vitest run src/index.test.ts` → 39 passed
- `pnpm vitest run src/validator/completeness.test.ts src/validator/clarify-readiness.e2e.test.ts` → 15 passed

Total targeted slice: **107 passed, 0 failed**.

---

## Current-State Baseline

### 1. Instruction stack size is large and fragmented

From `~/.config/opencode/opencode.json:3-15`, the always-loaded stack currently contains 11 files:

- `identity.md`
- `rules.yaml`
- `shell_strategy.md`
- `test_resource_guardrails.md`
- `lbp.md`
- `temp_directory.md`
- `mcp-tools.md`
- `lgrep-tools.md`
- `morph-tools.md`
- `worktree-guide.md`
- `ADV_INSTRUCTIONS.md`

Measured total size: **49,529 bytes**.

Breakdown of likely consolidation candidates:

#### Tool-selection cluster

- `mcp-tools.md` → 5,075 bytes
- `lgrep-tools.md` → 1,974 bytes
- `morph-tools.md` → 2,336 bytes

Subtotal: **9,385 bytes**

#### Execution-safety cluster

- `shell_strategy.md` → 3,093 bytes
- `test_resource_guardrails.md` → 1,286 bytes
- `temp_directory.md` → 2,303 bytes

Subtotal: **6,682 bytes**

### 2. The instructions directory includes extra files, but they are not currently loaded

Directory listing for `~/.config/opencode/instructions/` includes 12 files, including:

- `criteria-prioritizer.md`
- `post_install_verification.md`

Important clarification:

- `criteria-prioritizer.md` is **not orphaned**. It is referenced by docs and agent guidance, and it points to the real skill at `~/.config/opencode/skills/prioritizer/SKILL.md`.
- `post_install_verification.md` is present in the directory but **not** in the `instructions[]` array.

So the sharper issue is not “orphan cleanup” in the prompt stack. It is:

> the always-loaded stack is larger than necessary, while some reference-only material already lives outside the prompt path correctly.

### 3. Agent docs are inconsistent

> **Migration note (consolidateSharedAgentsPlan):** `scout` and `refine` agents
> were consolidated into `plan` and `build` respectively. The historical analysis
> below references agent names that no longer exist as separate agents. The
> findings about structural inconsistency remain valid for the surviving agents.

The 9 shared agent files in `~/.config/opencode/agents/` total **44,875 bytes**.

Only `scout.md` has an explicit `## Anti-patterns` section (`~/.config/opencode/agents/scout.md:185-190`).

The others vary widely in structure and emphasis.

### 4. ADV overlays are small and mostly generic

Files under `.opencode/overlays/` (post-consolidation):

- `general.overlay.md`
- `adv.overlay.md`
- `plan.overlay.md`
- `build.overlay.md`

Historical note: `refine.overlay.md` and `scout.overlay.md` existed before `consolidateSharedAgentsPlan` consolidated those agents into `plan` and `build`.

They are all short and structurally similar. They encode ADV orchestration rules, not provider behavior. Example:

- `.opencode/overlays/plan.overlay.md:1-7`
- `.opencode/overlays/general.overlay.md:1-7`

### 5. `system.transform` already receives model identity

This resolves one of the draft’s major open questions.

The SDK hook shape includes `model`:

- `@opencode-ai/plugin/dist/index.d.ts:233-238`

The model includes `providerID`:

- `@opencode-ai/sdk/dist/gen/types.gen.d.ts:1278-1287`

So provider-aware adaptation does **not** need a fallback design based on “maybe the hook doesn’t know the model.”

### 6. The plugin intentionally reduced dynamic prompt injection for prompt caching

Current behavior in `plugin/src/index.ts:1245-1257`:

- worktree marker may be injected
- a one-time wisdom reminder may be injected after task completion
- dynamic task/wisdom context was removed

The code comment states why:

- `plugin/src/index.ts:1247-1248` — removed to preserve prompt caching

This is a critical design constraint. Any new `system.transform` behavior should stay **small and stable**, not reintroduce high-churn dynamic context.

### 7. TDD compliance is partly enforced late, not early

What exists now:

- `adv_task_evidence` records evidence but does **not** validate exit semantics (`plugin/src/tools/task.ts:198-255`). `adv_run_test` is the primary red/green evidence path (captures exit code + output); `adv_task_evidence` is fallback for externally captured evidence.
- `store.tasks.recordEvidence` updates `tdd_phase` based on phase presence, not pass/fail semantics (`plugin/src/storage/store.ts:1182-1214`)
- completeness validation flags missing TDD evidence on `done` tasks (`plugin/src/validator/completeness.ts:177-204`)
- `adv_task_update` / `store.tasks.update` allows `status: "done"` without checking TDD evidence (`plugin/src/tools/task.ts:106-139`, `plugin/src/storage/store.ts:1124-1143`)

So the accurate statement is:

> TDD evidence is validated later during completeness checks, but not enforced at the point where tasks are marked done.

### 8. Execution gate completion is currently under-enforced

`adv_gate_complete` enforces:

- gate ordering
- planning readiness

But it does **not** enforce that execution can only complete when tasks are done:

- `plugin/src/tools/gate.ts:299-320`

### 9. Existing model-evaluation scripts are interactive, not automation-ready

Both scripts prompt for human input:

- `scripts/model-blind-test.ts:146-166`
- `scripts/model-blind-test.sh:130-165`

This means the original success criterion “show measurable improvement in instruction adherence” currently lacks a headless harness.

### 10. Repo sync tooling does not own general global instructions

`scripts/sync-global.sh` manages:

- ADV plugin registration
- ADV instruction registration (`ADV_INSTRUCTIONS.md`)
- commands
- agents
- skills
- overlays

It does **not** manage arbitrary files under `~/.config/opencode/instructions/` beyond the ADV instruction entry.

Relevant lines:

- `scripts/sync-global.sh:85-87`
- `scripts/sync-global.sh:302-307`
- `scripts/sync-global.sh:402-421`

This matters for proposal ownership:

> instruction consolidation is currently a **user-config** change, not a repo-managed asset sync change, unless we explicitly choose to make it one.

---

## Cross-Cutting Findings That Should Shape the Proposals

### Finding A — The original draft is too broad for one proposal

It mixes:

- plugin code changes
- prompt/instruction changes
- user-config routing changes
- cross-provider behavioral evaluation

These should not share a single acceptance gate.

### Finding B — Tool enforcement and prompt adaptation should not be mixed casually

Tool enforcement changes are deterministic and unit-testable.

Prompt adaptation changes are:

- more subjective
- more provider-sensitive
- constrained by prompt caching
- harder to prove with automated tests alone

### Finding C — “Measurable improvement” is not currently proposal-ready

Without a non-interactive evaluation harness, proposal language should avoid promising measurable gains unless the proposal also includes building that harness.

### Finding D — The model-routing issue is really a config-consistency issue

`~/.config/opencode/opencode.json:525-527` configures:

- `plan` → `openai/gpt-5.4`

But the `provider.openai.models` registry in that same file only visibly defines:

- `gpt-5.1`
- `gpt-5.1-codex*`
- `gpt-5.2`
- `gpt-5.2-codex`

So the sharper proposal language is:

> audit and clean up model-routing/config consistency, rather than assuming a single invalid string bug.

---

## Recommended Proposal 1: `hardenAdvCompliance`

## Goal

Close the real tool-enforcement gaps in the ADV plugin without touching provider adaptation or broad prompt behavior.

## Why this should be first

- smallest blast radius
- strongest evidence
- easiest to test
- highest confidence of shipping cleanly

## In-scope findings

### A1. `adv_task_evidence` should validate red/green semantics

Current behavior:

- accepts any `exitCode`
- records evidence without checking whether red failed or green passed

Evidence:

- `plugin/src/tools/task.ts:215-255`
- `plugin/src/storage/store.ts:1195-1208`

### A2. `adv_gate_complete(execution)` should require all non-cancelled tasks to be done

Current behavior:

- no execution-specific task-completion check

Evidence:

- `plugin/src/tools/gate.ts:299-320`

### A3. TDD-before-`done` enforcement is a separate product decision

Current behavior:

- missing TDD evidence is caught during completeness validation
- `done` is not blocked up front

Evidence:

- `plugin/src/validator/completeness.ts:177-204`
- `plugin/src/tools/task.ts:106-139`
- `plugin/src/storage/store.ts:1124-1143`

### Recommendation on A3

Do **not** force this into the first hardening proposal unless explicitly desired.

Reason:

- it is a stronger workflow change
- it may affect many existing tests and user expectations
- it is more behaviorally disruptive than A1/A2

Treat it as either:

- an explicit optional scope item, or
- a separate follow-up proposal

## Recommended scope

### MUST include

1. Reject invalid red evidence (`phase=red` with `exitCode=0`)
2. Reject invalid green evidence (`phase=green` with non-zero `exitCode`)
3. Block execution-gate completion if any non-cancelled task is not `done`
4. Add/adjust tests for those behaviors

### SHOULD include

1. Improve error messages to explain the TDD contract clearly
2. Keep output structure compatible with existing tool consumers

### SHOULD NOT include in v1

1. provider-aware prompt injection
2. active gate context injection
3. broad task-status workflow redesign

## Verification plan

Add targeted tests for:

- red evidence with passing exit code → rejected
- green evidence with failing exit code → rejected
- execution gate with pending task → rejected
- execution gate with all tasks done/cancelled → allowed

Then run at minimum:

- `pnpm vitest run src/tools/task.test.ts src/tools/gate.test.ts`

## Proposal-ready acceptance criteria

- `adv_task_evidence` rejects semantically invalid red/green evidence
- `adv_gate_complete(execution)` rejects unfinished changes
- existing targeted task/gate/integration tests continue to pass
- no MCP API shape changes

## Suggested initial task breakdown

1. Add failing tests for invalid red/green evidence cases
2. Implement evidence-phase validation in `adv_task_evidence`
3. Add failing tests for execution-gate task-completion preconditions
4. Implement execution-gate validation in `adv_gate_complete`
5. Update docs/test fixtures as needed
6. Run targeted verification

## Proposal-ready problem statement seed

> ADV currently records TDD evidence and advances execution state without fully validating that the evidence matches the claimed phase or that execution is complete. This allows semantically invalid compliance records and premature execution-gate completion. The change should close those deterministic enforcement gaps at the tool level without expanding into provider adaptation or prompt-layer behavior.

---

## Recommended Proposal 2: `consolidateInstructionStack`

## Goal

Reduce always-loaded instruction overhead by merging redundant policy files and tightening structure without removing any rules.

## Current-state evidence

### B1. There are clear merge candidates

#### Tool-policy cluster

- `mcp-tools.md` provides cross-tool routing plus references to `lgrep-tools.md` and `morph-tools.md`
- `lgrep-tools.md` duplicates and sharpens local exploration policy
- `morph-tools.md` duplicates and sharpens edit-tool routing

Evidence:

- `~/.config/opencode/instructions/mcp-tools.md:27-35`
- `~/.config/opencode/instructions/lgrep-tools.md:6-44`
- `~/.config/opencode/instructions/morph-tools.md:10-51`

#### Execution-policy cluster

- `shell_strategy.md` defines headless shell rules
- `test_resource_guardrails.md` defines test-tier and resource policy
- `temp_directory.md` defines temp-file policy

These are distinct but all govern safe execution behavior.

Evidence:

- `~/.config/opencode/instructions/shell_strategy.md:1-80`
- `~/.config/opencode/instructions/test_resource_guardrails.md:1-29`
- `~/.config/opencode/instructions/temp_directory.md:1-52`

### B2. Some files should stay separate

Keep separate initially:

- `rules.yaml` — global priority rules
- `ADV_INSTRUCTIONS.md` — ADV-specific workflow contract
- `worktree-guide.md` — specialized workflow
- likely `identity.md` and `lbp.md`

Rationale:

- these are high-signal anchors with different semantics and lifecycles

### B3. The original draft overstated orphan issues

`criteria-prioritizer.md` is a real reference doc, not dead weight.

`post_install_verification.md` is not in the loaded stack already.

So the sharper objective is **consolidation**, not “cleanup of broken instruction loading.”

## Major architectural decision

### Decision B-arch: Is this just a user-config change, or should the repo own these instructions?

Current reality:

- the files live under `~/.config/opencode/instructions/`
- this repo’s sync tooling does not manage that whole directory

So there are two valid directions:

#### Option 1 — User-config-only proposal (recommended first)

- edit `~/.config/opencode/instructions/*`
- update `~/.config/opencode/opencode.json`
- keep repo changes minimal or none

Pros:

- smallest change
- fastest path

Cons:

- weaker repo-level reproducibility

#### Option 2 — Repo-managed instruction assets + sync support

- move canonical instruction sources into repo-managed assets
- expand `scripts/sync-global.sh` or related tooling to manage them

Pros:

- stronger reproducibility
- versioned source of truth

Cons:

- larger scope
- drifts toward infra/tooling work

### Recommendation

For the first proposal, keep this as a **user-config consolidation** change.

Do not combine it with “repo owns all global instructions now” unless you want a larger tooling proposal.

## Recommended scope

### MUST include

1. Merge tool-routing policy into one file
2. Merge execution-safety policy into one file
3. Update `opencode.json` to point at the new files
4. Preserve all critical rules from the original files
5. Document a before/after mapping

### SHOULD include

1. Standard heading structure (for example: `CRITICAL`, `IMPORTANT`, `REFERENCE`)
2. Consistent anti-pattern phrasing and examples

### SHOULD NOT include in v1

1. rewriting `rules.yaml`
2. splitting `ADV_INSTRUCTIONS.md`
3. repo-managed sync of all global instructions

## Proposal-ready acceptance criteria

- always-loaded instruction stack is smaller than 49,529 bytes
- the old tool-routing trio is replaced by one canonical file
- the old execution-safety trio is replaced by one canonical file
- `opencode.json` loads the new canonical files
- a before/after mapping shows no rule loss

## Suggested initial task breakdown

1. Create merge matrix for tool-policy files
2. Create merge matrix for execution-policy files
3. Draft consolidated `tools.md`
4. Draft consolidated `execution.md`
5. Update `opencode.json`
6. Compare byte counts before/after
7. Review merged policy for lost constraints

## Proposal-ready problem statement seed

> OpenCode currently loads 11 instruction files totaling 49,529 bytes before user input. Several of those files are fragmented by policy area rather than optimized for retrieval, especially the tool-routing and execution-safety clusters. The change should reduce the always-loaded footprint by consolidating redundant files without losing any critical policy or weakening agent behavior.

---

## Recommended Proposal 3: `addProviderAwareAdaptation`

## Goal

Use provider identity in `system.transform` to apply small additive guidance and clean up model-routing assumptions, while preserving prompt caching and Claude baseline behavior.

## Current-state evidence

### C1. Provider adaptation is feasible in-plugin

`experimental.chat.system.transform` receives a `model` object, and `model.providerID` is available.

Evidence:

- `@opencode-ai/plugin/dist/index.d.ts:233-238`
- `@opencode-ai/sdk/dist/gen/types.gen.d.ts:1278-1287`

This means provider-aware adaptation can be implemented directly in the plugin. It does not need to rely on overlay-only fallback because of missing hook data.

### C2. The plugin currently does not use model/provider identity

Current behavior in `plugin/src/index.ts:1230-1260`:

- no provider detection
- no provider-specific system additions
- only worktree and wisdom prompt logic

### C3. Prompt caching constrains what we should inject

Dynamic context injection was removed to preserve prompt caching (`plugin/src/index.ts:1247-1248`).

So this proposal should use **minimal, stable, low-cardinality** additions such as:

- provider-specific reminder blocks
- possibly active gate label if desired

and avoid:

- dynamic task lists
- dynamic wisdom summaries
- large change summaries every turn

### C4. Current model routing likely needs cleanup, but the exact bug is not fully proven

> **Migration note (consolidateSharedAgentsPlan):** `scout` and `refine` no
> longer exist as separate agents. The routing lines below are historical.
> Update routing to use `plan` (absorbed scout) and `build` (absorbed refine).

Known config:

- `build` → `anthropic/claude-opus-4-6`
- `plan` → `openai/gpt-5.4`
- `scout` → `zai-coding-plan/glm-5.1`
- `refine` → `anthropic/claude-opus-4-6`
- `librarian` → `openrouter/anthropic/claude-haiku-4.5:nitro`
- `explore` → `zai-coding-plan/glm-5-turbo`

Source:

- `~/.config/opencode/opencode.json:521-540`

At the same time, the visible `provider.openai.models` registry in that file defines 5.1/5.2 variants, not 5.4.

This suggests a routing/config consistency question worth addressing, but not yet enough evidence to claim a single invalid config string root cause.

### C5. Existing evaluation tooling is manual

Current blind-comparison scripts require interactive human choice. They are useful for ad hoc evaluation but not proposal-grade automated proof.

Evidence:

- `scripts/model-blind-test.ts:146-166`
- `scripts/model-blind-test.sh:130-165`

## Recommended scope

### MUST include

1. Detect provider using `input.model.providerID`
2. Inject small additive provider-specific guidance in `system.transform`
3. Preserve current no-dynamic-context posture for caching-sensitive content
4. Add tests for provider-specific branch behavior
5. Audit and document current agent routing decisions

### MAY include

1. active gate context injection, if kept minimal and tested carefully
2. routing cleanup for obviously inconsistent model references

### SHOULD NOT include in v1

1. broad reintroduction of dynamic context injection
2. claims of measurable adherence improvement without a harness
3. large per-agent/provider prompt rewrites

## Testing strategy

### Automated

- unit tests for provider detection using mocked `input.model.providerID`
- output assertions for provider-specific additions
- regression tests confirming no reintroduction of removed dynamic wisdom/task injection

### Manual smoke matrix

Run a small fixed prompt set against:

- Claude baseline
- GPT target
- GLM target
- Gemini target

Evaluate manually for:

- rule retention
- instruction ordering compliance
- refusal to hallucinate missing info
- correct tool-routing behavior

## Proposal-ready acceptance criteria

- provider identity is read from the hook input, not inferred from brittle string parsing
- provider-specific guidance exists for each supported target provider
- injected guidance remains small and additive
- dynamic task/wisdom injection remains absent unless explicitly reintroduced and justified
- provider branch behavior is test-covered

## Suggested initial task breakdown

1. Add failing tests for provider-aware transform behavior
2. Implement provider detection using `input.model.providerID`
3. Add minimal provider-specific guidance blocks
4. Re-run transform/integration tests
5. Audit routing config and document recommended assignments
6. Run manual provider smoke prompts

## Proposal-ready problem statement seed

> ADV currently uses the same Claude-leaning prompt behavior regardless of model provider, even though the plugin has access to provider identity inside `experimental.chat.system.transform`. The change should add minimal provider-aware guidance and clean up model-routing assumptions while preserving prompt caching and Claude baseline behavior.

---

## Optional Proposal 4: `buildProviderEvaluationHarness`

## Why this exists

The original draft wanted “measurable improvement in instruction adherence.” That goal is reasonable, but it is not proposal-ready without a repeatable harness.

## Current limitation

Existing comparison scripts are interactive and human-scored.

## Proposal direction

Build a small non-interactive harness that:

- runs fixed prompts across selected providers
- captures outputs
- scores structural compliance against a rubric
- emits reproducible artifacts for comparison

This should be a separate proposal unless the user explicitly wants evaluation tooling in scope.

---

## What Not To Put Back Into the New Proposals

Avoid these broad or fuzzy statements unless backed by specific tasks:

- “measurable improvement” without a harness
- “criteria-prioritizer might be orphaned”
- “system_transform may not know the model”
- “all of this should be one change”
- “active gate injection” inside the hardening proposal

---

## Recommended Proposal Sequence and Dependencies

| Order | Change | Depends on | Reason |
|---|---|---|---|
| 1 | `hardenAdvCompliance` | none | deterministic, local, high-confidence |
| 2 | `consolidateInstructionStack` | none | mostly config/documentation, low runtime risk |
| 3 | `addProviderAwareAdaptation` | ideally after 1 and 2 | better baseline and clearer prompt surface |
| 4 | `buildProviderEvaluationHarness` | optional after 3 | only needed if measurable adherence becomes a hard requirement |

---

## Suggested Change IDs and Summaries

### 1. `hardenAdvCompliance`

**Summary:** Close deterministic ADV compliance gaps by validating TDD evidence semantics and blocking execution-gate completion when tasks are unfinished.

### 2. `consolidateInstructionStack`

**Summary:** Reduce OpenCode’s always-loaded instruction footprint by merging redundant policy files without losing rules.

### 3. `addProviderAwareAdaptation`

**Summary:** Use provider identity in `system.transform` for minimal additive guidance and clean up routing assumptions while preserving prompt caching.

### 4. `buildProviderEvaluationHarness` (optional)

**Summary:** Add a repeatable, non-interactive harness for comparing instruction adherence across providers.

---

## Questions to Answer Before Writing the Actual Change Proposals

### For `hardenAdvCompliance`

1. Do we want to block `status: done` when TDD evidence is missing, or keep that as deferred validation?
2. Should invalid TDD evidence be hard-rejected immediately, or recorded with advisory errors first?

### For `consolidateInstructionStack`

1. Is this proposal allowed to modify only `~/.config/opencode/**`, or should it also make those instructions repo-managed?
2. Do we want to keep `identity.md` and `lbp.md` separate in v1?

### For `addProviderAwareAdaptation`

1. Which providers are in scope for v1: OpenAI, GLM/ZAI, Gemini only?
2. Should active gate context ship in this proposal, or remain out of scope?
3. Is routing cleanup limited to documentation, or does it include changing live agent-model assignments?

### For evaluation claims

1. Is manual smoke testing sufficient, or do we need headless scoring before claiming improvement?

---

## Final Recommendation

Write **three focused proposals**, not one umbrella proposal.

If only one is going forward immediately, start with:

1. `hardenAdvCompliance`

It is the strongest combination of:

- concrete evidence
- low ambiguity
- small blast radius
- clean automated verification
