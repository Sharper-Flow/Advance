# Executive Summary

## Outcome

ADV preflight now tolerates provider-asymmetric strict-mode placeholder fills. GPT-family agents (and any future model exposed to OpenAI's auto-strict Responses API) can call `adv_change_create` and `adv_change_update` (and 28 other ADV mutation tools) when their tool runtime forces `""`/`0`/`[]` defaults on optional fields, without hitting `INVALID_TOOL_ARGS` retry loops. Required-when-present audit, evidence, identity, command, and content fields continue to reject blank values structurally.

## Verdict

APPROVED / RELEASE READY

## What Was Built

1. **Preflight engine extension** — Added `zero?: PlaceholderPolicyAction` axis to `PlaceholderFieldPolicy`; extended `applyFieldPolicies` with a symmetric `value === 0` branch; refactored `preflightToolArgs` Zod loop to read `policyResult.normalizedArgs` instead of raw `args`, making fields normalized out of the policy table invisible to Zod and downstream cross-field validators.
2. **Full-sweep policy table flip** — Hand-classified all 28 tool entries (76 field decisions) in `FIELD_POLICIES`. Optional content/path/lineage fields flipped to `blank: "omit"`; required-when-present audit/identity/command/content/title/branch entries kept `blank: "reject"`. Added `origin_issue_number: { zero: "omit" }` on `adv_change_create`. Added five new artifact-field entries (`proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`) on both `adv_change_create` and `adv_change_update`.
3. **Cross-field validator simplification** — Removed blank-artifact and blank-`origin_source_artifact` checks from `CROSS_FIELD_VALIDATORS.adv_change_create` (now owned by per-field policies); collapsed redundant blank/nonEmpty checks in `CROSS_FIELD_VALIDATORS.adv_change_update` into a single `at-least-one-of` guard that fires naturally when post-normalization `provided.length === 0`.
4. **Defensive guard comments** — Added bypass-resilience documentation to `collectBlankCreateArtifactOrLinkageFields` and `validateCreateOriginLinkage` in `plugin/src/tools/change.ts` marking both as no-op on the normalized-args path while preserving direct-caller bypass-resilience.
5. **Spec law amendment** — Revised `rq-toolArgBlankArtifactLinkage01` body text + scenarios `.1`/`.3`/`.5` to omit-on-blank semantics; added new scenario `.6` codifying audit-fields-stay-strict; added new `rq-toolPlaceholderPolicy01.5` codifying provider-asymmetric strict-mode tolerance; bumped spec version 1.12.0 → 1.12.1.
6. **Documentation note** — Added strict-mode tolerance paragraph to `AGENTS.md § ADV MCP tool call hygiene` and `ADV_INSTRUCTIONS.md § ADV MCP Tool Invocation` citing Vercel AI SDK issue #12200; bumped advisory line-guard 950 → 960 to accommodate the addition.
7. **Regression matrix expansion** — ~30 new test cases in `tool-arg-preflight.test.ts`: full GPT strict-mode payloads on `adv_change_create` and `adv_change_update`; mixed-blank update scenarios; 27-case parametrized audit-fields-still-reject matrix (AC12); zero-policy axis tests; Zod-via-normalizedArgs integration tests; sentinel-still-rejects regression. Existing tests updated where assertions flipped with the new semantics.

## What Was Verified

- **Verdict:** APPROVED after multi-dimensional review. Sub-Agents 1 (Traceability), 2 (Logic), 3+4 (Security+Architecture) all returned clean — 0 blockers, 0 issues, 0 suggestions, 2 nits (synthetic test-name fragility + unused `"allow"` enum branch), multiple praise notes. Sub-Agent 5 (Cross-Repo) N/A — single-repo change.
- **Independent design validation:** `adv-researcher` returned VALIDATED with two CAUTION items — both addressed via design KD9 (spec body revised in lockstep) and KD10 (SDK upgrade verification: `@opencode-ai/plugin@1.15.5` installed has no `Tool.strict`; OpenCode 1.15.10 binary still triggers the bug empirically).
- **Tests:** `pnpm test` passes 3102/3102 across 233 test files in ~63s; zero failures; zero flakes. `pnpm run check` passes typecheck + lint + format:check.
- **Validation:** `adv_change_validate --strict` clean with only the expected `NO_DELTAS` warning (this change touches code + spec + docs without formal `change.deltas` mapping; non-blocking).
- **Investment:** 6 tasks / 0 retries / 26 min active work / tier: auto. No doom-loop.
- **Contract matrix:** 42 required rows — 23 AC pass; 6 C respected; 7 DONT respected; 6 OOS not_applicable. 0 failed / violated / unknown.

## Remaining Concerns

**Runtime deployment caveat only.** Source changes require `pnpm run build` → `./scripts/deploy-local.sh --fix` → fresh OpenCode session before live deployed ADV tool behavior reflects the new policy. This is the standard ADV plugin reload pattern documented in AGENTS.md "Source-vs-Dist Reload Gotcha"; not specific to this change.

The two non-blocking nits from review are deliberately deferred: (a) the synthetic `test_no_policy_tool` name would only collide if a real tool with that exact name were ever added — vanishingly unlikely; (b) the unused `"allow"` branch in `PlaceholderPolicyAction` documents future-extensibility intent for the policy axes and costs nothing.
