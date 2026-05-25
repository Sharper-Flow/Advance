# Problem Statement

## Confirmed Problem

ADV preflight (shipped in `hardenChangeCreation`) rejects blank/zero/empty values on optional tool args. Intent: catch agent laziness. Effect: catches strict-mode placeholder fills as well, asymmetrically breaking GPT-family agents.

OpenAI's Responses API (GPT-5, GPT-5.x, o-series, reasoning models) auto-normalizes tool schemas into strict mode regardless of caller intent. Strict mode marks every property `required`, with `additionalProperties: false`. The model is forced to emit every property, filling optional fields with `""`/`0`/`[]`. Anthropic, Google, GLM, and Kimi omit unset optionals normally.

Result: every GPT call to `adv_change_create` and `adv_change_update` (and other ADV mutation tools carrying optional fields) hits `INVALID_TOOL_ARGS`. Agents retry the same payload, fail again, emit `[ADV:BLOCKED]`. No change ever gets created.

## Discovery Findings

**Source evidence (Vercel AI SDK + OpenAI docs):** confirmed Responses API auto-strict; per-tool `strict: false` exists in AI SDK PR #10817 (Dec 2025) but is not exposed by `@opencode-ai/plugin@1.15.5`.

**Codebase findings:**

1. `FIELD_POLICIES` table (`plugin/src/utils/tool-arg-preflight.ts:52`) is the structural source of truth; 28 tool entries, all using `blank: "reject"` for optional content/path/lineage fields. Fix lives in flipping selected entries.
2. `ARTIFACT_FIELDS` (`proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`) are NOT in `FIELD_POLICIES` — handled exclusively by `CROSS_FIELD_VALIDATORS`. Fix requires ADDING entries.
3. `preflightToolArgs` Zod loop reads raw `args[field]` (not `policyResult.normalizedArgs[field]`). New finding: a `zero: "omit"` policy on `origin_issue_number` would normalize out of `normalizedArgs`, but Zod `.positive()` would still fail on raw `0`. Fix: route Zod validation through `normalizedArgs`.
4. `CROSS_FIELD_VALIDATORS.adv_change_create` (line 272-367) reads from `policyResult.normalizedArgs` (line 454) — cross-field origin matrix automatically benefits from policy normalization.
5. `CROSS_FIELD_VALIDATORS.adv_change_update` (line 368-407) `at-least-one-of` artifact guard catches the "all blanks → all normalized out → nothing provided" case naturally.
6. `collectBlankCreateArtifactOrLinkageFields` (`change.ts:261`) is the execute-time defensive guard; with normalized args flowing through tool-registry post-`hardenChangeCreation`, this guard becomes a no-op on the GPT path — stays as bypass-resilience.
7. Storage-level blank artifact rejection (`json.ts:619`) unchanged.

**User decisions (Phase 4.5):**

- Spec amendment style: **revise scenarios in place** (LBP — original intent preserved via git + archive).
- Scope of policy flip: **full sweep** — hand-classify every entry in `FIELD_POLICIES`, flip optional content/path/lineage entries to `blank: "omit"`, keep required-when-present audit fields strict.
- Documentation surface: **add explainer note** to `AGENTS.md § ADV MCP tool call hygiene` and `ADV_INSTRUCTIONS.md § ADV MCP Tool Invocation`.

**Agent decisions (LBP, recorded):**

- Q4 — Zod loop refactored to read `normalizedArgs` instead of raw `args`. Cleaner contract; consistent with cross-field validator pattern.
- Q5 — Defensive `change.ts:261` guard left as-is with an updated code comment noting bypass-resilience role; not removed.

**Opportunity scout (inline, opt-out from full spawn):** 7 candidates considered; 1 surfaced (full sweep — user picked sweep); 6 rejected/deferred.

**Spec deltas drafted:** 1 new + 3 revised scenarios in `rq-toolArgBlankArtifactLinkage01`; 1 new scenario in `rq-toolPlaceholderPolicy01`.

**No conflicts** with active changes; no overlapping agenda items; no related-pattern matches elsewhere in the codebase.
