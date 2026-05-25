# Fix subagent context contracts

## Why

Typed sub-agent reports now require durable identity fields, but the command context packets and scanner output contracts do not consistently supply or demand those fields. That creates contract gaps where sub-agents miss `phase`, omit `attempt` from returned output, or lack a `task_id` for persisted report submission.

## What Changes

- Align `/adv-apply`, `/adv-review`, and `/adv-harden` context packets with the strict report schemas they feed.
- Clarify scanner lanes vs typed persisted worker lanes:
  - `explore` scanners return dimension-scoped analysis JSON and are not persisted typed worker reports unless explicitly wrapped or migrated.
  - `adv-engineer` and `adv-reviewer` workers receive all fields required by `ENGINEER_REPORT` / `REVIEWER_REPORT` and submit through `adv_subagent_report_submit`.
- Add structural asset/schema tests that fail when command packets, worker report schemas, and worker instructions drift apart.
- Prefer compact, low-maintenance validation over another prose-only reminder.

## Success Criteria

- SC1: Any ADV command that instructs `adv-reviewer` to submit `REVIEWER_REPORT` provides a context packet with `WORKING DIRECTORY`, `CHANGE`, `TASK`, `PHASE`, and `ATTEMPT` anchors.
- SC2: Any ADV command that instructs `adv-engineer` to submit `ENGINEER_REPORT` provides a context packet with `WORKING DIRECTORY`, `CHANGE`, `TASK`, and `ATTEMPT` anchors.
- SC3: `/adv-review` and `/adv-harden` distinguish `explore` scanner outputs from typed persisted `adv-reviewer` reports, so scanner output schemas do not imply durable persistence without required identity fields.
- SC4: Asset tests fail if required typed report fields are added or renamed without corresponding command-packet and agent-instruction coverage.
- SC5: Existing Zod ingest behavior remains strict: malformed persisted reports still fail with `INVALID_REPORT`; unsupported reserved agents still fail with `UNSUPPORTED_AGENT`.

## Affected Code

- `.opencode/command/adv-apply.md`
- `.opencode/command/adv-review.md`
- `.opencode/command/adv-harden.md`
- `.opencode/agents/adv-engineer.md`
- `.opencode/agents/adv-reviewer.md`
- `plugin/src/types/subagent-reports.ts`
- `plugin/src/types/subagent-reports.test.ts`
- `plugin/src/adv-engineer-assets.test.ts`
- `plugin/src/adv-reviewer-asset.test.ts`
- `plugin/src/subagent-reports-spec-assets.test.ts`
- Possibly `.adv/specs/subagent-reports/spec.json` and `.adv/specs/delegation-defaults/spec.json` if discovery finds spec-law updates needed.

## Related Repositories

- Current repo only: Advance OpenCode plugin.

## Constraints

- Keep correctness structural: Zod schemas, parser/asset tests, and command-contract tests own enforcement where possible.
- Do not weaken strict report validation to paper over missing fields.
- Do not convert all scanner agents to typed report persistence unless discovery shows a small, clearly better path.
- Preserve existing `explore` scanner usefulness for read-only analysis.
- Preserve `adv-engineer` / `adv-reviewer` no-nested-delegation and no-ADV-orchestration-mutation boundaries.

## Failure / Error Handling

- If a sub-agent omits a required typed-report field, `adv_subagent_report_submit` must keep returning `INVALID_REPORT`; the fix is to correct the packet/worker contract, not relax ingest.
- If asset tests detect a command-packet/report-schema mismatch, CI fails before runtime use; no runtime rollback path is needed because command docs and tests are source assets.
- If discovery finds a worker path without a stable `task_id`, that path must either remain non-persisted scanner output or introduce an explicit orchestrator-owned task identity before asking for typed report persistence.
- If a future field cannot be mapped to a context-packet anchor, the test should require an explicit exemption/rationale rather than silently passing.

## Scope

### In Scope

- Patch current context-packet / report-field gaps for apply, review, and harden.
- Add structural tests linking report schemas, agent instructions, and command context packets.
- Clarify docs/contracts enough that future report-field changes fail tests when packets are incomplete.
- Update specs if current laws under-specify `phase`, `task_id`, or scanner-vs-worker behavior.

### Out of Scope

- Full redesign of ADV delegation routing.
- Persisted report support for `adv-researcher` or `adv-tron`.
- Replacing all `explore` scanner flows with `adv-reviewer`.
- Runtime auto-generation of context packets unless discovery finds it cheaper and safer than asset tests.

### Must Not

- Must not rely on LLM-parsed prose as the only recurrence-prevention mechanism.
- Must not loosen required schema fields or accept missing `phase` / `attempt` for typed persisted reports.
- Must not introduce broad unrelated changes to review/harden verdict logic.

## Impact

- Reduces silent sub-agent context loss after typed report persistence.
- Makes future contract drift visible in tests before runtime use.
- Keeps the fix compact and maintainable by pinning existing markdown contracts against Zod schemas.

## Context

Evidence from current source:

- `BaseSubagentReportSchema` requires `change_id`, `task_id`, and `attempt`.
- `ReviewerSubagentReportSchema` requires `phase: "review" | "harden"`.
- `adv-reviewer` instructions require `phase` and `ATTEMPT`, but review/harden packets currently only expose `gate: review|release` and `ATTEMPT`.
- Review/harden scanner outputs are `explore` dimension JSON, not typed persisted `REVIEWER_REPORT`s.
- Existing asset tests only pin `ATTEMPT:` in review/harden packets, leaving `PHASE` and `TASK` unguarded.

Related active change note: `addDelegationMatrix` is in acceptance and overlaps delegation documentation broadly, but this change is narrower: typed report identity/context-contract integrity.

## Discovery Agenda

- Verify whether current command files ever spawn `adv-reviewer` without a task context.
- Decide whether review/harden scanner packets should add `PHASE`/`TASK` for consistency even when using `explore`, or only remediation worker packets need them.
- Identify the smallest structural test that derives required packet anchors from the Zod report schema or a local schema-to-anchor map.
- Check if specs need a new requirement for `PHASE` and scanner-vs-worker lane distinction.
- Confirm targeted test set for asset/schema coverage and full `pnpm run check` path.

## Discovery Findings

### Discovery Checklist

| Step | Status | Result |
|---|---:|---|
| Skill Discovery | PASS | `lgrep` loaded for local code exploration; no pending-review skill frontmatter found. |
| Prior Research Extension | PASS | `docs/repo-improve-prep.md` cited; no directly overlapping research pack found. |
| Conflict & Related-Work Scan | PASS | Related active change: `addDelegationMatrix` overlaps delegation docs broadly, not typed report packet integrity. Own NO_TASKS/NO_DELTAS warnings expected pre-prep. Pending agenda items do not overlap this change. |
| Edge Case Investigation | PASS | Failure modes captured for missing `task_id`, missing/wrong `phase`, scanner-to-submit drift, and future agent union expansion. |
| Design Question Depth | PASS | Technical questions resolved; three user-facing scope/completion questions answered. |
| Draft Spec Deltas | PASS | Add `rq-subagentReports05`; amend `rq-delDefaults05` / `rq-delDefaults06` if implementation uses matrix tests. |
| Related Pattern Scan | PASS | Same-pattern gaps found in review/harden remediation lanes and `adv-audit` prose-only fix-sub-agent mention. |
| LBP Check | PASS | Best practice is schema-derived anchor matrix + asset tests, not prose-only reminders or broad runtime generation. |

### Skills Considered

- `lgrep`: loaded. Used for local exact/source search and context mapping.
- `adv-opportunity-scout`: applied through `adv-researcher` Phase 3.5 scout.
- `adv-arch-detection`: considered; not loaded because this is a contract/test alignment issue, not architecture-inconsistency classification.
- `adv-clarify`: considered; not loaded because ambiguity was handled by discovery's built-in B/F/S/M scan and mandatory question loop.

### Extends

- `docs/repo-improve-prep.md`: not directly about sub-agent reports, but it reinforces two applicable patterns:
  - Keep Zod validation; correctness and boundary validation matter more than shaving internal validation cost.
  - Prefer correctness-safe read/projection contracts over heuristic state reads.
- New finding beyond that pack: current packet/report drift is a source-asset contract problem; lightweight schema-derived asset tests can prevent it without adding runtime complexity.

### Conflict Scan

- Related active change: `addDelegationMatrix` has broad delegation-matrix scope and is in acceptance. This change is narrower and should touch typed report packet contracts/spec anchors only.
- Related specs: `subagent-reports`, `delegation-defaults`.
- Validation: passed; pre-prep warnings `NO_TASKS` and `NO_DELTAS` are expected.
- Pending agenda: no direct overlap.

### Current State

- `plugin/src/types/subagent-reports.ts:24-31`: base report requires `change_id`, `task_id`, `attempt`, `scope`, `workdir_used`.
- `plugin/src/types/subagent-reports.ts:125-151`: reviewer report additionally requires `phase`.
- `.opencode/command/adv-apply.md:474-486`: Apply packet has `WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`; this is the reference shape.
- `.opencode/command/adv-review.md:139-160`: Review scanner packet has `WORKING DIRECTORY`, `CHANGE`, `ATTEMPT`; lacks `TASK` and `PHASE`.
- `.opencode/command/adv-review.md:234-236`: Review remediation spawns `adv-reviewer` / `adv-engineer` but defines no remediation packet with report identity fields.
- `.opencode/command/adv-harden.md:207-230`: Harden scanner packet has `WORKING DIRECTORY`, `CHANGE`, `ATTEMPT`; lacks `TASK` and `PHASE`.
- `.opencode/command/adv-harden.md:352-361`: Harden remediation lane expects persisted typed reports but has no complete worker packet.
- `.opencode/agents/adv-reviewer.md:90-99`: reviewer requires `phase`; refuses missing phase.
- `plugin/src/adv-reviewer-asset.test.ts:302-307`: current guard only checks `ATTEMPT`, not `TASK` or `PHASE`.

### Edge Cases

1. Missing `task_id`: remediation worker omits or invents task id; Zod rejects or report persists on wrong task.
2. Missing `phase`: reviewer refuses to start, or guesses `review` during harden and persists wrong-phase data.
3. Scanner-to-submit drift: future prose tells `explore` scanner to call `adv_subagent_report_submit`; scanner lacks task identity and fails at runtime.
4. Future union expansion: `plugin/src/temporal/change-state.ts:346-375` implicitly treats non-engineer reports as reviewer reports; a future supported agent could hit `blocking_findings` without an exhaustiveness guard.
5. Consumer enrichment: `consumer_warnings` are optional at ingest but server-added before persistence; re-validation of enriched reports should be pinned.

### Open Design Questions

| Question | Trust model | Blast radius | Resolution |
|---|---|---|---|
| Split scanner vs remediation packets, or add conditional fields to one packet? | Agent-owned technical | Medium: packet ambiguity can reintroduce missing identity fields | Split packets. Clearer and testable. |
| Hardcoded asset assertions or schema-derived anchor matrix? | Agent-owned technical | Medium: hardcoded lists drift when schema changes | Use a small schema-derived or schema-adjacent anchor map as single source for tests. |
| Include adjacent guardrails? | User + agent | Low/medium: may add small scope but prevents nearby same-pattern bugs | User chose: include small adjacent guards. |
| Verification level? | User + agent | Medium: weak validation misses contract drift | User chose: focused tests plus `pnpm run check`. |
| Spec updates? | User + agent | Medium: tests without spec-law may drift later | User chose: update specs now when under-specified. |

### Draft Spec Deltas

- `rq-subagentReports05` — Command context packets must supply all required persisted report identity fields.
  - Given an ADV command spawns `adv-engineer` or `adv-reviewer` for typed persisted report submission.
  - When the command packet is inspected by asset tests.
  - Then required anchors exist: `WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`; plus `PHASE` for `adv-reviewer`.
- Amend `rq-subagentReports04` — `ATTEMPT` is necessary but not sufficient; include scanner-vs-worker lane distinction and reviewer `PHASE` requirement.
- Amend `rq-delDefaults05` — delegated remediation substeps must provide a packet that satisfies target report schema fields.
- Amend `rq-delDefaults06` — tests must validate report-field-to-packet coverage and scanner/worker lane disjointness.

### Related Pattern Scan

- Similar confirmed gaps:
  - Review remediation lane lacks dedicated typed-worker packet.
  - Harden remediation lane lacks dedicated typed-worker packet.
  - `adv-audit` mentions fix sub-agents without packet contract; out of immediate scope unless implementation touches audit delegation.
- Similar non-gaps:
  - `adv-apply` Apply packet already supplies task/attempt identity.
  - `adv-slop-scan` packet is scanner-only and does not request typed persisted reports.
  - Verify-burst `general` spawn contract does not need typed report fields.

### LBP Check

- No external solution check needed; this is a local source-asset contract problem.
- Best direction: keep strict Zod ingest, add a tiny anchor matrix, split scanner/remediation packets, and pin with asset tests.
- Avoid runtime auto-generation now: higher complexity, not needed for current drift class.
- Avoid docs-only fixes: contradicts P33 structural correctness.

### Discovery Opportunity Scout

Auto-adopted:

1. Schema-derived packet anchor table for report-field coverage.
2. Scanner-vs-worker lane disjointness tests.
3. Split review/harden scanner packets from remediation packets.
4. Spec update pinning `PHASE`, `TASK`, and lane distinction.

Deferred:

- Reject sentinel `task_id` values like `<unspecified>` / `n/a` at ingest. Useful but broader than needed; lane-disjoint tests cover likely regression path.

### AMBIGUITY ANALYSIS — no blocking ambiguity findings

Coverage: B:C F:C S:C M:C

- Boundaries clear: scanner vs typed worker lanes; no broad delegation redesign.
- Functional scope clear: packet/schema/spec/test alignment.
- Completion signals clear after user answer: focused asset/schema tests plus `pnpm run check`.
- Missing information resolved: adjacent guardrails and spec updates are in scope when small/local.

### Recommended Objectives

1. Fix current review/harden remediation packet gaps by adding explicit typed-worker remediation packets with `WORKING DIRECTORY`, `CHANGE`, `TASK`, `PHASE`, and `ATTEMPT` where required.
2. Preserve scanner packets as non-persisted `explore` output contracts and test that scanner lanes do not claim `adv_subagent_report_submit` transport.
3. Add schema-adjacent anchor mapping and asset tests so report-required identity fields must be represented in command packets and agent instructions.
4. Update `subagent-reports` and `delegation-defaults` specs to make `PHASE`, `TASK`, and lane distinction part of the law.
5. Add small adjacent guardrails if implementation finds them local and low-risk: report enrichment re-validation and future-agent exhaustiveness for blocker summaries.

### User Decisions

- Include small adjacent guardrails found during discovery.
- Require focused asset/schema tests plus `pnpm run check` for acceptance evidence.
- Update specs now when they under-specify packet contracts.