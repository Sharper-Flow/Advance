# Agreement

## Objectives

- **SC1** GPT-family agents (GPT-5 / GPT-5.x / o-series / reasoning models) can successfully call `adv_change_create` and `adv_change_update` when their tool runtime auto-applies OpenAI Responses-API strict mode and fills optional fields with blank/zero/empty defaults.
- **SC2** Provider-asymmetric correctness: same preflight code path, same outcome for Claude, Google, GLM, Kimi. No provider-specific branching.
- **SC3** Audit-integrity preservation: required-when-present semantic fields (audit evidence, reasons, commands, branch names, titles, user identities) continue to reject blank values.
- **SC4** Codified policy: spec law reflects the omit-on-blank semantics for optional content/lineage fields and the reject-on-blank semantics for required-when-present audit fields. Spec law passes `adv_change_validate --strict`.

## Acceptance Criteria

- **AC1** `FIELD_POLICIES` in `plugin/src/utils/tool-arg-preflight.ts` is updated via a hand-classified full sweep. Every optional content/path/lineage entry flips to `blank: "omit"` (and `zero: "omit"` for `origin_issue_number`). Every required-when-present audit/evidence/reason/command/branch entry keeps `blank: "reject"`.
- **AC2** A new `zero?: PlaceholderPolicyAction` member is added to the `PlaceholderFieldPolicy` type. `applyFieldPolicies` handles `value === 0` per the field's `zero` policy (omit / reject / allow).
- **AC3** `preflightToolArgs` is refactored so that Zod validation reads from `policyResult.normalizedArgs` instead of raw `args`. Fields normalized out of the policy table are invisible to Zod and to cross-field validators.
- **AC4** `CROSS_FIELD_VALIDATORS.adv_change_create` is simplified: blank-artifact and blank-`origin_source_artifact` checks are removed (now owned by `FIELD_POLICIES`). The origin matrix and target/source/parent mutual-exclusion checks continue using normalized args.
- **AC5** `CROSS_FIELD_VALIDATORS.adv_change_update` `at-least-one-of` guard continues to fire on normalized args. An all-blanks GPT payload normalizes to empty, triggering "At least one artifact field must be provided."
- **AC6** `collectBlankCreateArtifactOrLinkageFields` in `plugin/src/tools/change.ts` is kept as a bypass-resilience layer. The code comment is updated to mark it as no-op on the normalized-args path.
- **AC7** Storage-level blank artifact rejection in `plugin/src/storage/json.ts` is unchanged.
- **AC8** Regression tests added to `plugin/src/utils/tool-arg-preflight.test.ts` covering:
  - Full GPT strict-mode `adv_change_create` payload (every optional filled with `""`/`0`/`[]`) normalizes to the minimal valid payload, returns `ok: true`.
  - Full GPT strict-mode `adv_change_update` payload (all five artifact fields blank) normalizes to empty, returns `ok: false` with the `at-least-one-of` cross-field error.
  - Mixed GPT `adv_change_update` payload (`{proposal: "real", design: ""}`) normalizes `design` out, returns `ok: true` with `normalizedArgs: {changeId, proposal: "real"}`.
  - Audit-field rejection still fires for blank `approvalEvidence`, `confirmationEvidence`, `reason`, `command`, `branch`, `content`, `title`, `user`, `completedBy`, `recoveryEvidence`.
  - Sentinel rejection: `parent_change_id: "none"` (and other `KNOWN_OMISSION_SENTINELS`) still rejected.
  - `zero: "omit"` only applies to fields whose policy declares it; other zero-valued fields are not stripped.
- **AC9** Spec law `.adv/specs/advance-workflow/spec.json` updated **in place**:
  - `rq-toolPlaceholderPolicy01.5` (new) — provider-asymmetric strict-mode tolerance scenario.
  - `rq-toolArgBlankArtifactLinkage01.1` — revised to "Mixed update payload normalizes blank field to omitted; only writes provided non-blank artifacts."
  - `rq-toolArgBlankArtifactLinkage01.3` — revised to "Create normalizes blank provided narrative artifacts to omitted."
  - `rq-toolArgBlankArtifactLinkage01.5` — revised to "Blank origin source artifact is normalized to omitted."
  - `rq-toolArgBlankArtifactLinkage01.6` (new) — required-when-present audit fields still reject blank.
  - `adv_change_validate --strict` passes with only the expected pre-prep `NO_TASKS` / `NO_DELTAS` warnings.
- **AC10** `AGENTS.md § ADV MCP tool call hygiene` and `ADV_INSTRUCTIONS.md § ADV MCP Tool Invocation` each gain one short paragraph explaining strict-mode tolerance, citing Vercel AI SDK issue #12200, and reminding agents to still aim to omit fields they do not intend to set.
- **AC11** `pnpm run check` passes. All ~2995 existing tests still pass. New regression tests pass. No flake.

## Constraints

- **C1** No heuristic provider detection or model-family branching in preflight code (P33 structural correctness).
- **C2** No regression of any required-when-present field's blank rejection.
- **C3** Storage-level blank artifact rejection in `json.ts` stays as defense-in-depth.
- **C4** No changes to the OpenCode plugin SDK (`@opencode-ai/plugin`) or the underlying Vercel AI SDK. This is purely an ADV-side preflight policy change.
- **C5** Canonical error response shape preserved: `INVALID_TOOL_ARGS` code, `missing` / `invalid` field lists with names + messages, `canonical_minimal_payload` block, redacted `received_args`.
- **C6** Policy table remains the single structural source of truth; no scattered Zod `preprocess()` or per-tool ad-hoc normalization.

## Avoidances

- **DONT1** Don't add provider-specific code paths (e.g. `if (providerID === "openai")`) anywhere in preflight or tool registry.
- **DONT2** Don't weaken any required-when-present field's blank rejection. Specifically: `approvalEvidence`, `confirmationEvidence`, `recoveryEvidence`, `reason`, `notes` on `adv_agenda_cancel`/`adv_worktree_cleanup`, `command`, `branch` on `adv_worktree_create`/`adv_worktree_delete`, `base` on `adv_worktree_create`, `content`, `title`, `user`, `completedBy` stay strict.
- **DONT3** Don't refactor `.optional()` → `.nullable()` at the Zod schema level — out of scope.
- **DONT4** Don't add a one-shot auto-retry that strips blanks and resubmits — that hides the underlying issue and prevents the agent from learning.
- **DONT5** Don't remove the storage-level blank artifact guard in `json.ts` — it's defense-in-depth against direct callers that bypass preflight.
- **DONT6** Don't remove the `collectBlankCreateArtifactOrLinkageFields` defensive guard in `change.ts` — it stays as a bypass-resilience layer.
- **DONT7** Don't oscillate the policy: once flipped, fields stay omit-on-blank unless a future bug demonstrates a real audit-integrity violation.

## Decisions

### User Decisions

- **Q1 (spec amendment style)** — User picked LBP recommendation: **revise scenarios in place**. Original strict-reject intent preserved via git history + `hardenChangeCreation` archive notes.
- **Q2 (scope of policy flip)** — User picked **full sweep**: hand-classify every entry in `FIELD_POLICIES`, flip optional content/path/lineage entries to `blank: "omit"`, keep required-when-present audit fields strict.
- **Q3 (documentation surface)** — User picked **add explainer note** to `AGENTS.md § ADV MCP tool call hygiene` and `ADV_INSTRUCTIONS.md § ADV MCP Tool Invocation`.

### Agent Decisions (LBP)

- **Q4 (Zod validation routing)** — Resolved autonomously: route Zod validation through `normalizedArgs`. Cleaner contract, consistent with cross-field validator pattern, single source of truth for post-normalization state.
- **Q5 (defensive layer in `change.ts`)** — Resolved autonomously: leave as-is with an updated code comment marking the bypass-resilience role. Defense-in-depth is cheap; removing it would invite the next bug if preflight changes again.
- **Opportunity scout** — 7 candidates considered inline (bounded change, opt-out from full adv-researcher spawn). 6 rejected/deferred; 1 surfaced to user (full sweep — adopted via Q2).

## Deferred Questions

None.

## Out of Scope

- **OOS1** Per-tool `strict: false` opt-out at the AI SDK level (waiting on `@opencode-ai/plugin` SDK upgrade beyond 1.15.5).
- **OOS2** Refactoring schemas to use `.nullable()` instead of `.optional()`.
- **OOS3** Reverting `hardenChangeCreation`. Only the optional-content reject policy flips; the catch-laziness-on-audit-fields intent stays.
- **OOS4** Changing the storage-level blank artifact guard in `json.ts`.
- **OOS5** Adding provider-detection or model-family branching anywhere in ADV.
- **OOS6** Changing the OpenCode plugin SDK passthrough behavior in `@opencode-ai/plugin@1.15.5`.

## Sign-Off

AC approved by user via inline reply: `approve` (Tier A whitelist).
Discovery gate ready for completion after contract mint.
