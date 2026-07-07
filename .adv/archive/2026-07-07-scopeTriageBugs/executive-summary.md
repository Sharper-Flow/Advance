# Executive Summary — scopeTriageBugs

## Outcome
`/adv-triage` is now bugs-only with agent-driven priority assignment. All 7 tasks complete; CI green (4624/4625 tests pass; 1 pre-existing unrelated tool-name-assets failure documented as out-of-scope).

## Verdict
APPROVED

## What Was Built
1. **Update `.opencode/command/adv-triage.md`** — Phase 5 (Agent Scoring) removed; `--rescore` flag removed; `gh api graphql` mutation rows removed from Key Tools; Phase 4c reframed as agent-driven priority loop (idempotent via existing `priority:*` label skip, partial-apply safe with log+continue, 2-question bug budget, default `medium` + `context_insufficient` flag if exhausted, rationale trailer `<issue#>: priority=<tier> :: <rationale>` in chat output only — never issue comments). H1 + description updated.
2. **Strip scoring from skill files** — 6 files updated: SKILL.md (drop `wsjf,scoring` keywords + step 7 + Quick Formulas), WSJF.md (keep Match algorithm only; strip Agent scoring + GraphQL writes + Idempotent resume + Evidence block), SCHEMA.md (drop V/TC/RROE/E/WSJF columns; issue#-asc fallback), PROMPTS.md (remove Autofill + Feature Value options), BOOTSTRAP.md (drop scoring fields from required custom fields), ANTI-PATTERNS.md (remove scoring-only rows).
3. **Comment-only edit on `plugin/src/tools/backlog.ts`** — header L13-16 references updated; rq-backlogCoord06 dangling ref removed; "all scoring fields may be null; tool is read-only on snapshot". No code changes; C1 invariant preserved.
4. **Drop `--rescore` from `bin/adv` CLI** — flag removed; WSJF-column help text removed.
5. **Rewrite `.adv/specs/backlog-coordination/spec.json`** — `rq-backlogCoord06` + 06.1 + 06.2 deleted; `rq-backlogCoord09` body (L370) + scenarios 09.1 (L383) + 09.4 (L422) rewritten to "agent-driven bounded-autonomous priority (max 2 question-budget per bug, default `medium` + `context_insufficient`); user questions gather context only — never confirm priority"; capability `purpose` updated (no longer references V / ranking).
6. **Add/modify tests** — `adv-triage-phase4c-agent.test.ts` (idempotent + partial-apply + 2-question budget + rationale trailer chat-only), `roadmap-render-no-scoring-cols.test.ts` (drops V/TC/RROE/E/WSJF columns), `rq-backlogCoord09-spec-compliance.test.ts` (rewritten spec body matches agent-driven model); `adv-triage-relevance-assets.test.ts` updated to remove Phase 5 assertions.
7. **Sync skill mirror + CI gate** — `./scripts/deploy-local.sh --fix` ran (23 skills synced); `pnpm run check` green; `bun test bin/` 194/194; `pnpm test` 4624/4625 pass.

## What Was Verified
- **Verdict:** APPROVED. 13/13 ACs pass, 6/6 Cs respected, 8/8 DONTs respected (per contract.reviewMatrix).
- **Tests:** 4624/4625 pass. 1 pre-existing unrelated failure in `src/tool-name-assets.test.ts` (flags `adv-coordinate.md: adv_backed_fact`); documented in recent archives as out-of-scope.
- **Preview URL:** not_applicable. No visual surface; CLI tool + command file + spec changes only.
- **Contract matrix:** All required rows pass/respected; no fail/violated/unknown.

## Remaining Concerns
- **Pre-existing `src/tool-name-assets.test.ts` failure** (adv-coordinate.md hyphenation): scope-unrelated; flagged as fast-follow candidate. Documented in `2026-07-05-updateCoordinateFreshness` and `2026-07-06-autoDrivePrArchiveCompletion` archives.
- **GH Project field removal** (Value/TimeCriticality/RROE/Effort/WSJF): operator action documented in archive notes — to be executed post-archive.

## Consequence Context

| # | Category | Status | Source / Evidence |
|---|---|---|---|
| 1 | Delivered value | ready | Bugs-only `/adv-triage`; agent-driven priority with bounded-autonomous rationale; manual GH Project UI for any remaining feature fields. |
| 2 | Enabling-only / follow-up dependency | n/a | No upstream dependents; this change consumes the existing bug-priority label system. |
| 3 | Ops readiness | pending | Harden owns release/deploy/production/docs/cleanup readiness. |
| 4 | Migration / data impact | n/a | No migration. Existing 25 autoscored features stay as-is until GH Project fields are dropped post-archive. |
| 5 | Frontend / preview impact | not_applicable | No visual surface; CLI + command file + spec changes only. |
| 6 | Collision / release risk | low | No other change touches `/adv-triage`. Single-change release. |
| 7 | Open follow-ups | tracked | `src/tool-name-assets.test.ts` pre-existing failure (out of scope, fast-follow). GH Project field deletion (operator action, post-archive). |
| 8 | Next action | inline | User acceptance → `/adv-harden scopeTriageBugs` → release gate. |