# Proposal: Soften Strict-Mode Optionals

Fast-follow of `hardenChangeCreation`.

## Why

ADV preflight (shipped in `hardenChangeCreation`) blank-rejects optional tool arguments to catch agent laziness. Empirically, this works for Claude / Google / GLM / Kimi (those providers omit unset optionals as JSON `undefined`).

It does **not** work for OpenAI GPT-5 / GPT-5.x / reasoning models. OpenAI's Responses API auto-normalizes tool schemas into strict mode regardless of caller intent. Strict mode marks every property `required`, with `additionalProperties: false`. The model is then forced to emit *every* property, filling optional fields with default values (`""` for strings, `0` for ints, `[]` for arrays).

Result: every GPT call to `adv_change_create` (and other ADV mutation tools carrying optional fields) hits `INVALID_TOOL_ARGS`. Agents retry the same payload, fail again, and emit `[ADV:BLOCKED]`. No change ever gets created.

**Evidence:**

- User-reported `[ADV:BLOCKED]` from a GPT agent on the cardflip project (this session, May 23 2026).
- Vercel AI SDK [#12200](https://github.com/vercel/ai/issues/12200): "OpenAI models pass empty string for optional tool parameters instead of undefined." Root cause traced to Responses API auto-strict.
- Vercel AI SDK [#7888](https://github.com/vercel/ai/issues/7888): GPT-5 marked as reasoning model → AI SDK sets `strict: true` → optional params break.
- OpenAI docs: *"Responses requests will normalize your schema into strict mode … which can make previously optional fields mandatory."*
- Vercel AI SDK PR [#10817](https://github.com/vercel/ai/pull/10817) (Dec 2025) adds tool-level `strict: false`, but `@opencode-ai/plugin@1.15.5` does not surface the knob (its `tool.js` is a passthrough).

## What Changes

Flip preflight policy: **normalize blank/zero/empty placeholders to "omitted" for truly-optional fields BEFORE Zod parses**. Keep blank-rejection only for required-when-present semantic fields (audit evidence, reasons, commands, branch names).

Concrete:

1. **`plugin/src/utils/tool-arg-preflight.ts`** — change `blank: "reject"` → `blank: "omit"` for the following optional fields (full list will be confirmed during prep):
   - `adv_change_create`: `proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`, `origin_source_artifact`, `target_path`, `source_project`, `source_change_id`
   - `adv_change_update`: corresponding artifact fields (cross-field `at-least-one-of` validator continues to fire when NO artifact provided)
   - Other tools' optional path/lineage/target fields (`adv_task_*`, `adv_gate_complete`, etc.) where blank means "model couldn't omit"
2. **Add `zero: "omit"` policy** for optional positive-int fields. Initial target: `adv_change_create.origin_issue_number`. Generalizable mechanism so future fields can opt in.
3. **`plugin/src/tools/change.ts`** — `validateCreateOriginLinkage` continues to fire on normalized args; will not see blank/zero values that came from strict-mode auto-fill. No code change needed beyond confirming preflight runs first (it does).
4. **`plugin/src/storage/json.ts`** — keep storage-level blank rejection as defense-in-depth. Preflight is the friendly normalizer; storage is the last-mile guard against bypasses.
5. **Tests** — extend `tool-arg-preflight.test.ts` regression matrix with GPT-style payloads:
   - Adhoc kind + `origin_issue_number: 0` + `origin_source_artifact: ""` → normalizes to `origin_kind: "adhoc"` only, OK.
   - All five artifact fields filled with `""` → normalizes to empty payload, then triggers existing `at-least-one-of` for update.
   - `target_path: ""` + `source_project: ""` + `source_change_id: ""` → all normalized away, OK.
   - Required-when-present audit fields with `""` → still rejected (`approvalEvidence`, `reason`, `command`, `branch`, `confirmationEvidence`).
6. **Spec law update** — amend `.adv/specs/advance-workflow/spec.json`:
   - `rq-toolPlaceholderPolicy01` — clarify that "omit on blank" is a valid explicit field policy alongside "reject" and "allow"; add scenario for strict-mode provider compatibility.
   - `rq-toolArgBlankArtifactLinkage01` — narrow scope to genuinely required-when-present semantic claims; update scenarios to cover the new omit-blank behavior for optional narrative artifacts.

## Success Criteria

1. GPT-5 / GPT-5-class agent successfully creates an ADV change via `adv_change_create` when the model fills every optional field with strict-mode defaults (`""`, `0`, `[]`).
2. Claude / GLM / Kimi behavior unchanged on all existing preflight tests.
3. Required-when-present semantic fields (`approvalEvidence`, `confirmationEvidence`, `reason`, `notes`, `command`, `branch`, `base`, `content`, `title`) still reject blank values.
4. `adv_change_update` still rejects payloads where every provided artifact field is blank (covered by `at-least-one-of` cross-field validator, which runs post-normalization).
5. Storage write boundary (`createChangeScaffold`) still rejects blank artifact writes if reached.
6. `rq-toolPlaceholderPolicy01` and `rq-toolArgBlankArtifactLinkage01` updated with scenarios that codify the new policy and continue to pass `adv_change_validate --strict`.

## Affected Code

- `plugin/src/utils/tool-arg-preflight.ts` — `FIELD_POLICIES` table, `applyFieldPolicies()` (add `zero: "omit"` handling), `CROSS_FIELD_VALIDATORS.adv_change_create` (no semantic change, just runs on normalized args).
- `plugin/src/utils/tool-arg-preflight.test.ts` — regression matrix extension.
- `plugin/src/tools/change.ts` — verify defensive `validateCreateOriginLinkage` / `collectBlankCreateArtifactOrLinkageFields` runs after preflight; no logic change expected.
- `.adv/specs/advance-workflow/spec.json` — `rq-toolPlaceholderPolicy01`, `rq-toolArgBlankArtifactLinkage01` scenarios.
- Possibly `AGENTS.md` / `ADV_INSTRUCTIONS.md` — short note about strict-mode tolerance.

## Related Repositories

Single repo (`advance`). No product linking.

## Constraints

- Must not regress any of the 2995 existing tests.
- Must not weaken any semantically-required field's blank guard (audit/evidence/reason/command).
- Must not introduce a heuristic that decides reject-vs-omit at runtime — the policy table is the structural source of truth (P33).
- Storage-layer defense-in-depth (`json.ts` blank rejection) stays as-is.
- No changes to the OpenCode plugin SDK or the Vercel AI SDK; this is purely a preflight policy change.

## Impact

- **Users:** GPT agents (cardflip, any project using GPT-5) recover from BLOCKED-loop on first `adv_change_create`.
- **Other providers:** No observable change.
- **Spec corpus:** Two requirements amended; scenario count grows by ~2.
- **Test corpus:** ~5-10 new regression cases; no existing cases need updates beyond cases that explicitly asserted blank → reject for fields whose policy flipped (those flip with the policy).

## Context

This change is a **direct fast-follow** of `hardenChangeCreation`. That change introduced the strict reject policy to catch agent laziness; this change discovers and corrects a provider-asymmetric failure mode that the original change did not anticipate. The two changes together produce a policy that is strict where laziness is the issue (audit fields) and forgiving where provider strict mode forces blank-fill (optional content/path/lineage fields).

`hardenChangeCreation` archive notes already flag the runtime deployment caveat: source changes require `pnpm run build` + `./scripts/deploy-local.sh --fix` + fresh OpenCode session before live tool behavior reflects them. Same caveat applies here.

## Discovery Agenda

Unresolved unknowns to address during `/adv-discover`:

1. **Exhaustive field audit** — walk every entry in `FIELD_POLICIES`, classify each `blank: "reject"` field as "optional content" (flip to omit) vs "required-when-present" (keep reject). Produce a definitive table; do not guess during prep.
2. **Empty-array / empty-object policy expansion** — is `scope_repos: emptyArray: "omit"` the only such case, or do other tools' optional arrays/objects need the same treatment? E.g. `adv_change_update_issues.add: []`, `adv_task_add.blockedBy: []`.
3. **Number-zero handling design** — confirm whether `origin_issue_number: 0` (and other `.positive().optional()` ints) should flow through a new `zero: "omit"` policy entry, or be handled by a more general "Zod-rejected value treated as omitted" path. Pick the simpler one.
4. **Cross-field validator audit** — confirm `CROSS_FIELD_VALIDATORS.adv_change_create` correctly reads `policyResult.normalizedArgs` (line 454 today) so origin-matrix checks see post-omit state.
5. **Sentinel omission ordering** — `KNOWN_OMISSION_SENTINELS` ("none", "n/a", "null", "transcript") currently route through `sentinels: "reject"` for `parent_change_id`. Decide whether GPT could emit these by accident; if not, leave alone.
6. **Defensive layer cleanup** — `change.ts:261` `collectBlankCreateArtifactOrLinkageFields` re-runs preflight checks at execute time. With preflight now normalizing, this guard would never fire on blanks (they're omitted before execute). Decide: leave as defense-in-depth, or remove to avoid drift (per P19 simplicity / P29 clean-not-minimal — likely leave, just add comment that it's a bypass-resilience layer).
7. **Spec law authorial intent** — `rq-toolArgBlankArtifactLinkage01.5` currently says "blank `origin_source_artifact` is invalid when provided." Decide whether to weaken to "blank `origin_source_artifact` is normalized to omitted" or split into two scenarios (provider-asymmetric tolerance vs. semantic-violation rejection).
8. **Documentation surface** — `ADV_INSTRUCTIONS.md § ADV MCP Tool Invocation` and `AGENTS.md § ADV MCP tool call hygiene` both currently advise agents to omit fields they don't want to change. Decide if those need a footnote about strict-mode auto-fill being handled automatically.

## Scope

### In Scope

- Preflight policy table flip for optional content/path/source/lineage fields.
- Zero-on-positive-int normalization for `origin_issue_number`.
- Regression test extension covering GPT-style strict-mode payloads.
- Spec law amendment for `rq-toolPlaceholderPolicy01` and `rq-toolArgBlankArtifactLinkage01`.
- Minimal documentation note pointing at strict-mode tolerance.

### Out of Scope

- Per-tool `strict: false` opt-out at the AI SDK level (waiting on `@opencode-ai/plugin` SDK upgrade beyond 1.15.5).
- Refactoring `.optional()` to `.nullable()` across schemas.
- Reverting `hardenChangeCreation` — that change's intent (catch laziness on semantically-required fields) stays; only the optional-content rejection flips.
- Changing the storage-level blank artifact guard (`json.ts`).
- Adding heuristic provider detection at preflight time — the policy table is structural and provider-agnostic.

### Must Not

- Must not silently accept blank values for audit/evidence/reason/command/branch fields. Those keep `blank: "reject"`.
- Must not allow `adv_change_update` to succeed when every provided artifact is blank (cross-field `at-least-one-of` validator must continue to fire on normalized args).
- Must not bypass the storage-level blank artifact guard.
- Must not add provider-specific code paths to preflight (no `if (providerID === "openai")` branches).
- Must not regress the `INVALID_TOOL_ARGS` diagnostic — field names, hints, and `canonical_minimal_payload` must remain present in error responses.
