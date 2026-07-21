# Archive Briefing Digest

**Change ID:** addResumeFreshnessAdvisory
**Title:** Add resume freshness advisory
**Status:** archived
**Generated:** 2026-07-21T15:41:35.747Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 18 of 18 durable facts.

- **[report_follow_up]** follow_ups: WORKING DIRECTORY: /home/jon/dev/advance
CHANGE: addResumeFreshnessAdvisory | Add resume freshness advisory
SCOPE KEY: researcher:design-leverage-scout
ATTEMPT: 1
TASK_SCOPE: identify leverage points — shortcuts, reusable components, parallelism opportunities, simplification paths, cross-cutting improvements — for the design phase.
IN_SCOPE:
  - inline proposal/agreement content below
  - existing ADV codebase primitives (lgrep/read OK)
  - existing ADV commands (`/adv-coordinate`, `/adv-cleanup`, `/adv-refactor`) and skills
  - existing patterns in `plugin/src/storage/`, `plugin/src/utils/context-snapshot.ts`, `plugin/src/tools/status-enrich.ts`
  - bounded external evidence (Context7 / Exa) when relevant
OUT_OF_SCOPE:
  - rewriting the design (this is a scout, not authorship)
  - adding unapproved scope or new user-value tradeoffs
  - touching files
DONE_WHEN:
  - scout candidates are classified as auto-adopt, user-surface, or inconclusive
  - ≤5 candidates returned, sorted by payoff/risk ratio (highest first)
STOP_WHEN:
  - source access blocked, contract/security/release blocker, or contradictory evidence needing orchestrator decision
VERIFICATION:
  required_when_possible:
    - cite source/docs/code evidence (file:line) for each surfaced candidate
  optional_additional_checks: true
- **[report_follow_up]** follow_ups: Episode advisory recall unavailable: execute failed session initialization before an Episode callable path could be used. Local source evidence and official Git docs used.
- **[report_follow_up]** follow_ups: Targeted permitted glob did not surface requested command files, so command prose was not used as authoritative evidence.
- **[research_citation]** sources: File-overlap validator: Typed overlap result, injected dependencies, file intersection, and unavailable fallback. (plugin/src/validator/file-overlap.ts:18-110)
- **[research_citation]** sources: Merge-order validator: Reads archived summaries and calculates touched-file overlap from archived_at metadata. (plugin/src/validator/merge-order.ts:35-106,121-137)
- **[research_citation]** sources: Status recommendation protocol: Existing typed recommendation carrier, append helper, and closed kind/source vocabulary. (plugin/src/tools/status-enrich.ts:45-67,324-377; plugin/src/tools/status-recommendations.ts:3-38)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: ScoutCandidate 1 — Reuse typed status-recommendation plumbing without a new builder interface | domain: status enrichment/D8 | payoff: high | risk: low | fate: auto-adopt | routing: use appendResumeFreshnessRecommendation → pushStatusRecommendation; existing cleanup kind plus recency source avoids a new protocol | evidence: plugin/src/tools/status-enrich.ts:45-67,324-377; plugin/src/tools/status-recommendations.ts:3-38; plugin/src/tools/status.test.ts:554-583.

ScoutCandidate 2 — Compose existing overlap primitives; do not duplicate archived file-intersection logic | domain: sibling/archived overlap D2-D4 | payoff: high | risk: low | fate: auto-adopt | routing: compose/extract a tiny pure intersection helper while retaining resolver-specific archived-since policy | evidence: plugin/src/validator/file-overlap.ts:18-110; plugin/src/validator/merge-order.ts:98-137; plugin/src/validator/file-overlap.test.ts:15-129; plugin/src/validator/merge-order.test.ts:15-100. Do not call scanFileOverlaps unchanged because it skips archived entries at file-overlap.ts:91-99.

ScoutCandidate 3 — Use shared bounded execGit for codebase drift; reject mtime cache | domain: drift D5-D7 | payoff: medium | risk: low | fate: auto-adopt | routing: execGit(['log','--since',lastActivityAt,'--name-only','--',...touchedFiles], root), mapping failure/timeout to freshness_limited | evidence: plugin/src/utils/git.ts:3-32; plugin/src/tools/change/create-clarify.ts:1113-1135; https://git-scm.com/docs/git-log.

ScoutCandidate 4 — Keep formatter change data-driven; extend staged budget tests, not a new budget helper | domain: snapshot D6,D9-D10 | payoff: medium | risk: low | fate: auto-adopt | routing: add resumeFreshness formatter input, alter local precedence, table-test freshness alone and with directive/wisdom/current | evidence: plugin/src/utils/context-snapshot.ts:374-425; plugin/src/utils/context-snapshot.test.ts:75-90,182-213,562-609. No extracted budget/property helper surfaced; file-local baseInput is at context-snapshot.test.ts:22-38.

ScoutCandidate 5 — Keep close+supersede advisory non-executable until explicit user approval | domain: D8 safety | payoff: high | risk: medium | fate: user-surface | routing: describe close flow and approval next action; do not present a one-click/copy-paste close call as executable without approval workflow | evidence: plugin/src/tools/change.ts:2220-2308; plugin/src/tools/status-recommendations.ts:27-38.
- **[report_follow_up]** follow_ups: Packet anchors were present, but the report transport schema rejects their literal fields; required identity values are preserved in change_id, attempt, workdir_used, and scope.scope_key.
- **[report_follow_up]** follow_ups: After remediation, verify all seven direct buildChangeContextSnapshot emit sites either receive the same optional result or explicitly document why they are non-resume emissions; current direct callers include change, gate, recovery, and status paths.
- **[report_follow_up]** follow_ups: Context7 resolve/query and Exa repository discovery were unavailable (initialization/quota/API-key failures); no unverified claims from those sources were used.
- **[research_citation]** sources: Chat Output Display law: rq-ctxsnap1 requires Context Snapshots to fit within 10 lines; rq-ctxformat requires deterministic, non-blocking display. (https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/chat-output-display/spec.json)
- **[research_citation]** sources: Current snapshot formatter: Current formatter starts with six content rows, adds directive/wisdom/current optional rows, sheds Outcomes at two optional rows and Current at three, then adds Workdir; no four-optional-row rule exists. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/utils/context-snapshot.ts#L374-L445)
- **[research_citation]** sources: Current snapshot emission paths: Status enrichment builds a snapshot directly. Other direct formatter callers exist in change.ts, gate.ts, and change/recovery.ts, rather than through fetchChangeContextSnapshot. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/status-enrich.ts#L222-L290)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Two in-scope correctness blockers remain. First, proposed Freshness addition lacks a complete four-optional-row shedding rule and therefore can render 11 lines. Second, resolver placement in per-candidate status enrichment repeats expensive archived and git scans for every stale status candidate, violating the stated per-resume cost ceiling and conflicting with the existing bounded status architecture. The layer split, pure formatter boundary, typed stable findings, and explicit close approval are otherwise aligned with current code and laws.
- **[unresolved_action]** validation.blockers: D6 cannot preserve the 10-line snapshot budget in its stated worst case. Current formatter has six initial content rows before optional data, then appends Workdir. With directive, wisdom, current task, and new Freshness all present, D6 removes Outcomes and Current only, leaving nine content rows plus two borders (11 lines). No stated fourth-optional-row rule fixes this. This conflicts with the 10-line law and AC10/C6/DONT6.
- **[unresolved_action]** validation.blockers: D4/D5 resolver work is proposed inside status enrichment, but adv_status iterates recent changes serially (or every health candidate). Each stale candidate would independently perform active/archive list scans and a git scan. This makes work proportional to stale candidates rather than the promised ~3–5 calls per resumed change and can exceed the existing health request cutoff.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |

## Unresolved Actions

- D6 cannot preserve the 10-line snapshot budget in its stated worst case. Current formatter has six initial content rows before optional data, then appends Workdir. With directive, wisdom, current task, and new Freshness all present, D6 removes Outcomes and Current only, leaving nine content rows plus two borders (11 lines). No stated fourth-optional-row rule fixes this. This conflicts with the 10-line law and AC10/C6/DONT6.
- D4/D5 resolver work is proposed inside status enrichment, but adv_status iterates recent changes serially (or every health candidate). Each stale candidate would independently perform active/archive list scans and a git scan. This makes work proportional to stale candidates rather than the promised ~3–5 calls per resumed change and can exceed the existing health request cutoff.
