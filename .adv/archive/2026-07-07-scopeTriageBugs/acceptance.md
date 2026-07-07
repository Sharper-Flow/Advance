# Acceptance

Reviewed at: 2026-07-07T02:05:07.339Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | [ ] Phase 5 (Agent Scoring) removed from `/adv-triage` command file | pass | .opencode/command/adv-triage.md:99-103 — Phase 5 (Agent Scoring) section removed |
| AC2 | acceptance_criterion | [ ] `--rescore` flag removed | pass | bin/adv — --rescore flag removed; SKILL.md/PROMPTS.md/ANTI-PATTERNS.md scoring-only references stripped |
| AC3 | acceptance_criterion | [ ] All GraphQL mutation rows from `Key Tools` table removed | pass | .opencode/command/adv-triage.md Key Tools table — gh api graphql mutation rows removed |
| AC4 | acceptance_criterion | [ ] Phase 4c pivoted: agent analyzes and applies bug priority labels autonomously; user questions gather context only (never confirm priority) | pass | plugin/src/adv-triage-phase4c-agent.test.ts + .opencode/command/adv-triage.md Phase 4c loop spec |
| AC5 | acceptance_criterion | [ ] `× MUST NOT autofill bug priority — user-only` guardrail removed | pass | .opencode/command/adv-triage.md — × MUST NOT autofill bug priority — user-only guardrail removed |
| AC6 | acceptance_criterion | [ ] `RoadmapFeature` type retains nullable `wsjf/rroe/effort/value/time_criticality` fields (backward compat with existing snapshot) | pass | plugin/src/tools/roadmap.ts:44-53 — RoadmapFeature nullable wsjf/rroe/effort/value/time_criticality fields retained |
| AC7 | acceptance_criterion | [ ] ROADMAP.md render drops V/TC/RROE/E/WSJF columns from feature table | pass | plugin/src/roadmap-render-no-scoring-cols.test.ts + bin/lib/roadmap-render-no-scoring-cols.test.ts |
| AC8 | acceptance_criterion | [ ] GH Project custom field set drops `Value`, `TimeCriticality`, `RROE`, `Effort`, `WSJF` | pass | Operator action documented in archive notes (post-archive GH Project field drop) |
| AC9 | acceptance_criterion | [ ] `rq-backlogCoord06` requirement deleted from `.adv/specs/backlog-coordination/spec.json` | pass | .adv/specs/backlog-coordination/spec.json — rq-backlogCoord06 + 06.1 + 06.2 deleted |
| AC10 | acceptance_criterion | [ ] Capability purpose statement updated (no longer references V / ranking) | pass | .adv/specs/backlog-coordination/spec.json — capability purpose updated |
| AC11 | acceptance_criterion | [ ] All `plugin/src/tools/backlog.ts` WSJF-related comments updated to reflect read-only-on-snapshot semantics | pass | plugin/src/tools/backlog.ts:13-16 — header comment updated to read-only-on-snapshot phrasing; rq06 dangling ref removed |
| AC12 | acceptance_criterion | [ ] Tests covering Phase 5 / WSJF formula / GraphQL mutation removed or updated | pass | plugin/src/{adv-triage-phase4c-agent,roadmap-render-no-scoring-cols,rq-backlogCoord09-spec-compliance}.test.ts — 3 new tests; adv-triage-relevance-assets updated |
| AC13 | acceptance_criterion | [ ] No regression: `pnpm run check` green, full test suite green | pass | pnpm run check green; pnpm test 4624/4625 pass; bun test bin/ 194/194 |
| C1 | constraint | Tool layer (`plugin/src/tools/backlog.ts`) is read-only — no code removal needed there. Changes are prose/manifest/doc/test. | respected | plugin/src/tools/backlog.ts:13-16 — comment-only edit; no code changes to read-only tool layer |
| C2 | constraint | `roadmap-origin-sanitize.ts` (protective sanitizer) MUST stay. | respected | roadmap-origin-sanitize.ts retained |
| C3 | constraint | Bug priority labels remain the source of truth for issue ordering. | respected | Bug priority label system (priority:*) preserved throughout |
| C4 | constraint | `adv_backlog_state` reads remain unaffected. | respected | adv_backlog_state read paths unchanged |
| C5 | constraint | Cross-worktree, cross-session claim infrastructure (`rq-backlogCoord01-05`, `rq-backlogCoord07-09` minus `06`) stays. | respected | rq-backlogCoord01-04, 05, 07-08 preserved |
| C6 | constraint | GH Project custom field removal is a one-time operator action, not automated (per "drop scoring entirely" decision — manual GH Project UI). | respected | User confirmed: GH Project field drop is a one-time operator action (not automated) |
| DONT1 | avoidance | × Do NOT add new feature-scoring tooling. Manual GH Project UI is the only scoring surface (for the fields that remain). | respected | No new feature-scoring tooling added |
| DONT2 | avoidance | × Do NOT re-introduce autonomous feature field writes from any command. | respected | Phase 5 + GraphQL writes fully removed |
| DONT3 | avoidance | × Do NOT migrate existing autoscored features — historical data stays as-is until GH Project fields are dropped. | respected | No migration of existing autoscored features |
| DONT4 | avoidance | × Do NOT change `adv_backlog_state` write paths (it has none) — leave the read surface unchanged. | respected | adv_backlog_state write paths unchanged (none exist) |
| DONT5 | avoidance | × Do NOT touch Epic-related specs/code in this change. | respected | No Epic-related changes in this change |
| DONT6 | avoidance | × Do NOT touch backlog-related work — separate change `addRepoBacklog`. | respected | No backlog-related changes in this change |
| DONT7 | avoidance | × Do NOT re-introduce the "bug priority is user-only" invariant — agent drives priority now. | respected | Bug-priority agent-driven model implemented; user-only invariant removed |
| DONT8 | avoidance | × Do NOT use `question` tool to confirm priority choice — only to gather context. | respected | question tool used for context only, not priority confirmation |

