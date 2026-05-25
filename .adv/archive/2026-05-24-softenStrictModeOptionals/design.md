# Design

## Architecture Overview

Single-file source of truth: `plugin/src/utils/tool-arg-preflight.ts`. Pattern: structural policy table (P33). One pipeline:

```
rawArgs
  → applyFieldPolicies(toolName, args)
     ├─ blank: "omit" | "reject" | "allow"
     ├─ zero: "omit" | "reject" | "allow"   ← NEW
     ├─ sentinels: "omit" | "reject" | "allow"
     ├─ emptyArray: "omit" | "reject" | "allow"
     └─ recordValuesBlank: "reject" | "allow"
  → normalizedArgs
  → Zod validation (reads normalizedArgs)   ← REFACTORED
  → CROSS_FIELD_VALIDATORS (reads normalizedArgs, already does)
  → ToolArgPreflightResult { ok, missing, invalid, normalizedArgs }
```

Defense layers downstream (kept; both updated with bypass-resilience comments):
- `tool-registry.ts` passes `normalizedArgs` into `execute()` (existing, from `hardenChangeCreation`).
- `change.ts:261` `collectBlankCreateArtifactOrLinkageFields` — no-op on normalized-args path. Comment updated.
- `change.ts:286` `validateCreateOriginLinkage` — no-op on normalized-args path for blank/zero placeholders (still active for origin matrix violations a non-strict caller could make). Comment updated.
- `json.ts:619` storage-layer blank artifact rejection unchanged.

## Key Decisions

| # | Decision | Rationale |
|---|---|---|
| KD1 | Centralize policy in `FIELD_POLICIES` only — no scattered Zod `preprocess()` calls | P33 structural correctness + single source of truth |
| KD2 | Route Zod validation through `normalizedArgs` (not raw `args`) | Cleaner contract: "post-normalization is the universe"; aligns with cross-field validators already reading normalized state; lets `zero: "omit"` strip 0 before `.positive()` Zod check fails |
| KD3 | Full sweep classification rather than minimal hotfix | User decision Q2; prevents recurrence on other tools and pays the classification cost once |
| KD4 | Revise spec scenarios in place (not additive) | User decision Q1 via LBP — original intent preserved via git + `hardenChangeCreation` archive |
| KD5 | Add new `rq-toolArgBlankArtifactLinkage01.6` codifying audit-fields-stay-strict | Makes the "what stays reject" rule explicit so future maintainers don't sweep too far |
| KD6 | Keep `collectBlankCreateArtifactOrLinkageFields` AND `validateCreateOriginLinkage` in `change.ts` | Q5 LBP — defense-in-depth is cheap; removing invites the next bug if preflight policy oscillates |
| KD7 | No provider-detection branching anywhere | C1 + DONT1 + LBP — model identity is volatile and not the right policy axis; structural rule is provider-agnostic |
| KD8 | Sentinel rejection (`"none"`, `"n/a"`, `"null"`, etc.) stays even where blank flips to omit | Strict-mode providers fill blanks (`""`, `0`); they don't write the string `"none"`. Sentinels remain agent-typed mistakes, not strict-mode artifacts |
| KD9 | Amend `rq-toolArgBlankArtifactLinkage01` **body text** in lockstep with scenario revisions | Validator CAUTION D3: body says "MUST reject ... durable narrative artifacts" but revised scenarios say "normalize to omitted" — semantics would diverge if body stays |
| KD10 | Plugin-side preflight remains the right layer even when AI SDK v6 lands per-tool `strict: false` upstream | The currently-running OpenCode binary (1.15.10) and plugin SDK (1.15.5) do NOT expose `Tool.strict`; the bug is reproducible today. When upstream eventually exposes the knob, the policy table becomes belt-and-suspenders for tools where strict-mode quirks should still be handled at preflight |

## ADR Drafts

ADR rubric (hard-to-reverse / surprising-without-context / result-of-real-tradeoff): KD2 (Zod routes through normalized args) is mildly surprising-without-context but the rationale lives in code comments + spec law `rq-toolPlaceholderPolicy01.4`. No strong tradeoff. **No ADR drafted.**

## Implementation Strategy

Sequential task order (will become prep tasks):

1. **Type extension + handler** (`tool-arg-preflight.ts`)
   - Add `zero?: PlaceholderPolicyAction` to `PlaceholderFieldPolicy`.
   - Extend `applyFieldPolicies` with the `value === 0` branch matching the existing pattern.
   - Add unit tests for `zero: "omit"` / `zero: "reject"` / no-policy behavior.

2. **Zod routing refactor** (`tool-arg-preflight.ts`)
   - Change the `for (const [field, schema] of Object.entries(argsSchema))` loop to read `policyResult.normalizedArgs[field]` and check `field in policyResult.normalizedArgs`.
   - Re-derive `missing` semantics: required field is missing iff `!(field in normalizedArgs)` AND `isRequired`. Accidentally normalized-out required field surfaces as `missing` — fine.
   - Add explicit test covering "field normalized out → invisible to Zod and cross-field validators."

3. **Cross-field simplification** (`tool-arg-preflight.ts`)
   - Remove `ARTIFACT_FIELDS` blank check from `CROSS_FIELD_VALIDATORS.adv_change_create` (lines 275-292) — now owned by per-field `blank: "omit"` policies.
   - Keep origin matrix and target/source/parent mutual-exclusion checks.
   - In `CROSS_FIELD_VALIDATORS.adv_change_update`: delete blank-artifact check (lines 381-389); `at-least-one-of` and `nonEmpty.length === 0` collapse into one because post-normalization "all blanks → all omitted" naturally trips `provided.length === 0`.

4. **Full-sweep policy table classification** (`tool-arg-preflight.ts`) — per the table below (76 entries hand-classified):

   | Tool | Field | Old | New | Rationale |
   |---|---|---|---|---|
   | `adv_change_create` | `target_path` | reject | **omit** | optional cross-project hint |
   | `adv_change_create` | `source_project` | reject | **omit** | optional lineage hint |
   | `adv_change_create` | `source_change_id` | reject | **omit** | optional lineage hint |
   | `adv_change_create` | `parent_change_id` | reject | **omit** (sentinels stay reject) | optional fast-follow link |
   | `adv_change_create` | `proposal`/`problemStatement`/`agreement`/`design`/`executiveSummary` | (none) | **omit** | NEW — optional content |
   | `adv_change_create` | `origin_source_artifact` | (none) | **omit** | NEW — moved from cross-field validator |
   | `adv_change_create` | `origin_issue_number` | (none) | **zero: omit** | NEW — strict-mode fills with 0 |
   | `adv_change_list`/`show`/`task_show`/`task_list`/`task_ready`/`gate_status`/`status` | `target_path` | reject | **omit** | optional read scope |
   | `adv_change_update` | `target_path` | reject | **omit** | optional |
   | `adv_change_update` | `confirmationEvidence` | reject | **reject** | audit field |
   | `adv_change_update` | `proposal`/`problemStatement`/`agreement`/`design`/`executiveSummary` | (none) | **omit** | NEW per-field |
   | `adv_run_test` | `command` | reject | **reject** | required-when-present |
   | `adv_run_test` | `target_path` | reject | **omit** | optional |
   | `adv_run_test` | `confirmationEvidence` | reject | **reject** | audit |
   | `adv_task_update` | `target_path` | reject | **omit** | optional |
   | `adv_task_update` | `confirmationEvidence` | reject | **reject** | audit |
   | `adv_task_add` | `content` | reject | **reject** | required-when-present |
   | `adv_task_add` | `target_path` | reject | **omit** | optional |
   | `adv_task_add` | `confirmationEvidence` | reject | **reject** | audit |
   | `adv_wisdom_add` | `content` | reject | **reject** | required-when-present |
   | `adv_change_bulk_close` | `approvalEvidence` | reject | **reject** | audit |
   | `adv_change_bulk_close` | `supersededBy` | reject | **omit** | optional reference |
   | `adv_change_close` | `approvalEvidence` | reject | **reject** | audit |
   | `adv_change_close` | `supersededBy` | reject | **omit** | optional reference |
   | `adv_task_cancel` | `approvalEvidence` | reject | **reject** | audit |
   | `adv_task_cancel` | `target_path` | reject | **omit** | optional |
   | `adv_task_cancel` | `confirmationEvidence` | reject | **reject** | audit |
   | `adv_task_cancel` | `reasons` (record values) | reject | **reject** | per-task audit |
   | `adv_task_cancel` | `supersededBy` (record values) | reject | **reject** | required-when-present |
   | `adv_task_reclassify_tdd` | `reason` | reject | **reject** | audit |
   | `adv_task_reclassify_tdd` | `approvalEvidence` | reject | **reject** | audit |
   | `adv_task_reclassify_tdd` | `target_path` | reject | **omit** | optional |
   | `adv_task_reclassify_tdd` | `confirmationEvidence` | reject | **reject** | audit |
   | `adv_gate_complete` | `completedBy` | reject | **reject** | audit identity |
   | `adv_gate_complete` | `notes` | reject | **omit** | optional descriptive |
   | `adv_gate_complete` | `compatibilityReason` | reject | **omit** | optional descriptive |
   | `adv_gate_complete` | `target_path` | reject | **omit** | optional |
   | `adv_gate_complete` | `confirmationEvidence` | reject | **reject** | audit |
   | `adv_worktree_create` | `branch`/`base` | reject | **reject** | required-when-present |
   | `adv_worktree_resume` | `changeId` | reject | **reject** | required-when-present |
   | `adv_worktree_resume` | `branch`/`base` | reject | **omit** | optional (resume by changeId OR branch) |
   | `adv_worktree_delete` | `branch` | reject | **reject** | required-when-present |
   | `adv_worktree_cleanup` | `reason` | reject | **reject** | audit |
   | `adv_conformance` | `user`/`reason` | reject | **reject** | audit identity/reason |
   | `adv_conformance` | `spec`/`artifact_path` | reject | **omit** | optional per-action |
   | `adv_agenda_add` | `title` | reject | **reject** | required-when-present |
   | `adv_agenda_add` | `description`/`category` | reject | **omit** | optional |
   | `adv_agenda_complete` | `notes` | reject | **omit** | optional descriptive |
   | `adv_agenda_cancel` | `reason` | reject | **reject** | audit |
   | `adv_contract_mint` | `approvedAt` | reject | **omit** | optional ISO timestamp |
   | `adv_contract_mint` | `recoveryEvidence` | reject | **reject** | audit |
   | `adv_contract_mint` | `target_path` | reject | **omit** | optional |
   | `adv_contract_mint` | `confirmationEvidence` | reject | **reject** | audit |
   | `adv_contract_review_matrix_set` | `reviewedAt` | reject | **omit** | optional ISO timestamp |
   | `adv_contract_review_matrix_set` | `recoveryEvidence`/`confirmationEvidence` | reject | **reject** | audit |
   | `adv_contract_review_matrix_set` | `target_path` | reject | **omit** | optional |
   | `adv_temporal_register_search_attributes` | `approvalEvidence` | reject | **reject** | audit |
   | `adv_temporal_reconnect` | `target_path` | reject | **omit** | optional |
   | `adv_temporal_reconnect` | `confirmationEvidence` | reject | **reject** | audit |
   | `adv_temporal_worker_restart` | `approvalEvidence` | reject | **reject** | audit |

5. **Defensive guard comments** (`change.ts`)
   - Update comment above `collectBlankCreateArtifactOrLinkageFields` (line 261) — bypass-resilience no-op on normalized path.
   - **NEW (validator CAUTION D1):** Update comment above `validateCreateOriginLinkage` (line 286) — no-op on normalized path for blank/zero placeholders; remains active for non-strict-mode origin matrix violations.

6. **Regression tests** (`tool-arg-preflight.test.ts`) — per AC8.

7. **Spec law amendment** (`.adv/specs/advance-workflow/spec.json`)
   - **NEW (validator CAUTION D3):** Revise the `rq-toolArgBlankArtifactLinkage01` BODY text in lockstep with scenarios. Body changes from "MUST reject provided blank or whitespace-only strings for fields that write durable narrative artifacts" to "MUST normalize provided blank or whitespace-only strings to omitted for fields that write durable narrative artifacts. Required-when-present audit, evidence, and identity fields MUST still reject blank values."
   - Revise `rq-toolArgBlankArtifactLinkage01.1`/`.3`/`.5` per AC9.
   - Add `rq-toolArgBlankArtifactLinkage01.6` (audit-fields-stay-strict).
   - Add `rq-toolPlaceholderPolicy01.5` (strict-mode tolerance).
   - Bump spec version + date.
   - Run `adv_change_validate --strict` → expect NO_TASKS/NO_DELTAS only.

8. **Docs note** (`AGENTS.md` + `ADV_INSTRUCTIONS.md`) — per AC10.

## LBP Analysis

**Why this is the long-term-best approach:**

1. **Provider-agnostic structural policy** — table classifies fields by SEMANTIC role (audit vs. optional content), not by emitting model. Same policy, same outcome across all providers.
2. **Forward-compatible with SDK upgrade** — when `@opencode-ai/plugin` eventually exposes `Tool.strict` (post-1.15.5; AI SDK PR #10817 already merged upstream), the policy table remains useful as defense-in-depth. KD10 records the rationale.
3. **Single source of truth** — all placeholder semantics in one auditable table. No scattered Zod preprocess, no per-tool ad-hoc branches.
4. **Symmetric with existing pattern** — `hardenChangeCreation` established the policy-table architecture; we're refining classifications based on observed provider behavior.
5. **Audit integrity preserved** — required-when-present fields stay strict. Fix doesn't weaken security posture; removes a friction surface punishing GPT for provider quirks unrelated to agent intent.

**Alternatives rejected:** provider detection (volatile axis), `.optional()` → `.nullable()` schema rewrite (bigger blast), per-tool Zod `preprocess()` (scatters logic, validator confirmed), generic "all optional → omit" (too permissive), one-shot auto-retry (hides root cause), wait-for-SDK-upgrade (KD10 — running binary doesn't expose the knob, bug is reproducible today).

## Affected Components

| Component | Type of change | Estimated LOC |
|---|---|---|
| `plugin/src/utils/tool-arg-preflight.ts` | Type extension, handler addition, Zod loop refactor, full-sweep policy table revision, cross-field simplification | ~50 net LOC |
| `plugin/src/utils/tool-arg-preflight.test.ts` | New regression cases + assertion flips | ~70 LOC added |
| `plugin/src/tools/change.ts` | Comment updates on 2 guards | ~10 LOC comments |
| `.adv/specs/advance-workflow/spec.json` | Body revision + 3 scenarios revised + 2 new scenarios + version bump | ~80 LOC JSON |
| `AGENTS.md` | One paragraph | ~6 lines |
| `ADV_INSTRUCTIONS.md` | One paragraph | ~6 lines |

Total: ~220 LOC across 6 files.

## Phase 2.5: Design Leverage Scout

**Scout: skipped — trivially scoped policy table flip with bounded blast radius. Opportunity surface evaluated inline during proposal/discovery; 7 candidates considered, 6 rejected/deferred, 1 surfaced (full sweep, adopted). Spawning a full adv-researcher pass would add coordination overhead without uncovering new leverage.**

## Validator Result

**Verdict: VALIDATED with CAUTION** (Phase 3.6).

| # | Dimension | Level | Summary |
|---|---|---|---|
| D1 | Correctness | info | Mechanism correctly closes the strict-mode-fill bug across all four arg cases. |
| D2 | Correctness | caution | `change.ts:286 validateCreateOriginLinkage` convergence should be documented in code comment, not just `collectBlankCreateArtifactOrLinkageFields`. **Addressed in implementation step 5.** |
| D3 | Simplicity | info | Full-sweep scope and `zero: "omit"` generic policy are the boring, symmetric choices. |
| D4 | Spec-law compliance | caution | `rq-toolArgBlankArtifactLinkage01` body text contradicts the revised scenarios; AC9 only revised scenarios. **Addressed in implementation step 7 + new KD9.** |
| D5 | Key alternatives | caution | SDK PR #10817 merged Dec 3, 2025 — verify whether `@opencode-ai/plugin@1.15.7` exposes per-tool `strict: false` before committing the full sweep. **Resolved by verification: plugin SDK installed in node_modules is 1.15.5 (NOT 1.15.7 as lockfile records); `tool.d.ts` has no `strict` property; OpenCode binary 1.15.10 still triggers strict-mode bug empirically; AI SDK PR not yet reachable from running runtime. OOS1 stands. Recorded in KD10.** |
| D6 | Key alternatives | info | Other alternatives (per-schema preprocess, nullable rewrite, helper wrapper) correctly rejected or deferred. |

Recommendation: VALIDATED — both CAUTION items addressed via design update; SDK-upstream verification confirms our fix is still primary, not redundant.

## Risks / Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Field misclassified — should-stay-reject flipped to omit | Medium | High | Hand-classify with rationale in design table. Parametrized test asserts every audit field still rejects blank. AC9.6 codifies the rule. |
| R2 | Zod loop refactor breaks edge case | Low | Medium | Explicit unit tests for required-present/missing, optional-present/normalized-out, unknown-field cases. |
| R3 | Spec law amendment invalidates strict validation | Low | Low | Run `adv_change_validate --strict` post-change. |
| R4 | Cross-field validator simplification removes a still-needed check | Low | Medium | Diff-review; preserve origin matrix and target/source mutual exclusion verbatim. |
| R5 | Live deployment lag — source change requires `pnpm build` + `deploy-local.sh --fix` + session restart | Certain | Low | Archive notes repeat the caveat. |
| R6 | Future contributor reverts the omit policy | Low | Medium | KD8 + KD9 documented in code comments + spec body. Docs note in AGENTS.md/ADV_INSTRUCTIONS.md cites the AI SDK issue. |
| R7 | OpenCode binary upgrade brings SDK `strict: false` default, making our table partially redundant | Medium (timing unknown) | None (defense-in-depth has value either way) | KD10 — design assumes future redundancy is acceptable; table becomes belt-and-suspenders, not removed. |
