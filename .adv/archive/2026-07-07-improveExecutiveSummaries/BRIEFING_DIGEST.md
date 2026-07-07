# Archive Briefing Digest

**Change ID:** improveExecutiveSummaries
**Title:** Improve executive summaries
**Status:** archived
**Generated:** 2026-07-07T04:17:10.024Z

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

Showing 33 of 33 durable facts.

- **[agenda]** follow_ups: Design should decide whether the plain-English 'delivered value' lives inside the consequence-context renderer output or as a lead sentence in the executive-summary template Outcome section (or both).
- **[agenda]** follow_ups: Confirm whether the global ~/.config/opencode caveman plugin (session-visible, out of repo scope) should be noted to the user as a separate non-actionable contributor.
- **[archive_only_evidence]** sources: adv-review.md Persist Executive Summary (repo source): Current durable executive-summary template: Outcome/Verdict/What Was Built/What Was Verified/Remaining Concerns/Consequence Context. No non-technical audience directive; 'What Was Built' pulls task implementation_summary verbatim, which is where technical changelog prose enters.
- **[archive_only_evidence]** sources: command-voice-standard.md Voice Contract (repo source): Repo-internal 'caveman-full' voice contract mandates 'uniform wording-density compression: drop fluff/hedging, technical terms exact.' Applies-to list includes 'Phase summaries', 'Progress reports and gate summaries'. Does-not-apply list does NOT exempt executive summaries. This ambient directive biases the summary-composing agent toward terse, jargon-preserving prose.
- **[archive_only_evidence]** sources: advance-workflow spec rq-archiveVisibility01 (spec law): Noise-reduction slice explicitly disclaimed executive-summary ownership: 'MUST NOT absorb separate active-change scope such as first-class executive-summary ownership; those remain coordinated boundaries.' No existing spec requirement owns executive-summary audience/plain-English quality — this change is the deferred coordinated home.
- **[archive_only_evidence]** sources: Approval Consequence Context renderer (repo source): 8-category consequence context (delivered_value first) is owned by a single programmatic renderer/model, spec-enforced against duplication. Provides an existing structural surface where 'delivered value / plain-English outcome' can be strengthened rather than adding a parallel prose block.
- **[archive_only_evidence]** sources: workflow-noise-reduction-assets.test.ts (repo test): Existing test bans 'Investment:'-style investment-report noise in archive/review/voice surfaces. New plain-English requirement must not reintroduce banned marketing-report framing; the two must be reconciled, not contradicted.
- **[archive_only_evidence]** sources: Release-notes plain-language best practice (external, 3 corroborating sources): Canonical model: tiered single document, outcome-first sentence ('what can someone now do'), then layered technical detail. 'Translation is not simplification; it is reframing — technical fact stays true, frame shifts from what changed in code to what changed for the user.' Directly supports proposal's translate-and-layer direction and Must-Not against vague marketing copy.
- **[archive_only_evidence]** architecture_assessment: The reported symptom (terse technical changelog executive summaries) has TWO structural contributors, not one. (1) The adv-review Persist Executive Summary template lacks any non-technical audience/reframing directive and sources 'What Was Built' from raw task implementation_summary. (2) The repo-internal 'caveman-full' voice contract (docs/command-voice-standard.md) is an ambient compression directive whose applies-to scope covers gate/phase/progress summaries and does NOT exempt executive summaries — actively biasing the composing agent toward terse, jargon-preserving output. This is the specific caveman contribution the user asked to investigate: caveman is a real contributing pressure, but it is agent-facing runtime-prose compression, correctly aimed at handoffs/banners/verdicts; the defect is that executive summaries were never carved out as an exception. Routing: rq-archiveVisibility01 already deferred 'first-class executive-summary ownership' to a separate change (this one), so a durable advance-workflow spec requirement is the coordinated home — command-contract tests alone would leave the audience rule unlawed and re-driftable. The 8-category consequence-context renderer is the right structural anchor for 'delivered value' plain-English framing; reuse it rather than adding a parallel prose section. Note the caveman voice contract visible in THIS session's system prompt is a distinct GLOBAL user-config plugin (~/.config/opencode/instructions/caveman.md), out of repo scope; only the repo-internal command-voice-standard caveman scope is in-scope and actionable.
- **[agenda]** follow_ups: During planning, confirm manifest-doc-drift and checkpoint-surface-drift tests do not assert exact adv-review.md text that would conflict with the strengthened Persist Executive Summary template.
- **[archive_only_evidence]** sources: advance-workflow spec body boundary reservation: rq-archiveVisibility01 body reserves first-class executive-summary ownership as a coordinated boundary, not duplicate implementation. Confirms a new rq-executiveSummaryAudience01 is correct placement.
- **[archive_only_evidence]** sources: rq-approvalConsequenceContext01 single-renderer law: Category vocab/order/status/bounds MUST be owned by one programmatic renderer across acceptance, harden, archive, and executive-summary prose. Validates reject-duplication stance.
- **[archive_only_evidence]** sources: buildApprovalConsequenceContext renderer: Stable pure renderer: 8 fixed categories, finite status vocab, non-empty evidence, byte budget, no raw logs. Reuse verbatim; no modification needed.
- **[archive_only_evidence]** sources: Caveman carve-out insertion point: Voice Contract Does-not-apply-to list has no executive-summary/release-readiness line. Clean one-line structural extension point for the caveman carve-out.
- **[archive_only_evidence]** sources: Persist Executive Summary command template: Existing template already has Outcome, Verdict, What Was Built, What Was Verified, Remaining Concerns, Consequence Context sections. Hybrid-minimum-sections can strengthen this in place.
- **[archive_only_evidence]** sources: Existing executive-summary asset anchors: Asset tests already bind the Persist Executive Summary heading and its Consequence Context sub-block via substring/regex. Reusable low-brittleness anchors.
- **[archive_only_evidence]** sources: Anti-investment-report coupling test: Bans Investment: token and forces bounded nonblocking shapes on adv-review.md and voice doc. New evidence-only wording must reconcile or the asset tests conflict.
- **[archive_only_evidence]** architecture_assessment: Draft design is boring-correct and high-leverage: strengthens existing spec/command/test anchors instead of building new subsystems. Spec boundary confirmed: rq-archiveVisibility01 body already carved out first-class executive-summary ownership as a deferred boundary, so a new rq-executiveSummaryAudience01 under advance-workflow is by-the-book placement. Renderer reuse confirmed: rq-approvalConsequenceContext01 already mandates a single renderer authority spanning executive-summary prose, so refusing a parallel 8-category model is spec-required, not just simpler. Caveman carve-out is a one-line edit to an existing Does-not-apply-to list. The Persist-Executive-Summary command template and two asset tests already exist to be strengthened, not authored. Single integration hazard: the anti-investment-report asset test bans marketing tokens on the same adv-review.md surface the new plain-English requirement edits; design already names this but should treat it as a hard test-design constraint.
- **[agenda]** follow_ups: Prep: replace or drop the non-existent 'human-checkpoints-assets' regression anchor; identify the real test surface for AC5 (archive/sign-off summary-context preservation).
- **[agenda]** follow_ups: Prep: ensure the new plain-English AC1-AC3 rules are reconciled against the existing workflow-noise-reduction investment-report-removal test so they coexist without conflict.
- **[archive_only_evidence]** sources: advance-workflow spec rq-archiveVisibility01 body: Requirement body explicitly states this policy MUST NOT absorb first-class executive-summary ownership; those remain coordinated boundaries. Confirms design Decision 1: minting a separate rq-executiveSummaryAudience01 is correct, not overloading rq-archiveVisibility01.
- **[archive_only_evidence]** sources: approval-consequence-context.ts renderer: buildApprovalConsequenceContext exports stable 8-category vocabulary (delivered_value..next_action), bounded evidence (MAX_EVIDENCE_CHARS=600, DEFAULT_MAX_BYTES=4000), never emits raw logs/diffs. Confirms Decision 3 (reuse single renderer) and DDC2 (preserve 8 categories/bounds/evidence).
- **[archive_only_evidence]** sources: adv-review.md executive summary shape: Persist Executive Summary already defines hybrid sections (What Was Built, What Was Verified, Consequence Context) with all 8 categories. Confirms Decision 2: strengthen-in-place rather than new artifact.
- **[archive_only_evidence]** sources: adv-harden.md + adv-archive.md carry-forward: Harden persists Release Readiness Summary + Approval Consequence Context by reading _executiveSummary; archive renders archive-time context at Tier B. Confirms Implementation Strategy steps 3-4 target real surfaces.
- **[archive_only_evidence]** sources: workflow-noise-reduction-assets.test.ts: Existing 'investment report removal' test asserts executive-summary surfaces avoid investment-report noise. Confirms Decision 6/DDC4 anti-marketing anchor exists and must be reconciled with new plain-English rules.
- **[archive_only_evidence]** sources: command-voice-standard.md caveman policy: 'Does not apply to (keep normal)' list and 'Caveman-full composition' Safety row ('Exact contract tokens stay unchanged') are existing, natural slots for a narrow executive-summary/release-readiness carve-out. Confirms Implementation Strategy 5 and AC4/DDC3 are feasible and scoped.
- **[archive_only_evidence]** sources: Asset test file inventory (glob): approval-consequence-context-assets, workflow-noise-reduction-assets, adv-skill-backed-commands-assets EXIST. No human-checkpoints-assets.test.ts exists anywhere in plugin/src. Design names it as a candidate regression anchor; that specific anchor is unverified and must not be assumed present.
- **[archive_only_evidence]** architecture_assessment: Design is a command-contract/spec/test refinement (no runtime data migration, no schema change), which matches the agreement scope and DONT4. Its authority layering (spec law defines behavior -> command docs operationalize -> asset tests anchor -> single consequence renderer) is sound and evidence-backed. Every material claim in Key Decisions verified against source: rq-archiveVisibility01 explicitly reserves executive-summary ownership as a coordinated boundary (Decision 1 correct); buildApprovalConsequenceContext is the single 8-category bounded renderer (Decision 3/DDC2 correct); adv-review.md already carries the hybrid summary shape to strengthen in place (Decision 2 correct); harden/archive carry-forward surfaces exist (Impl 3-4 correct); the investment-report-removal test exists and must be reconciled (Decision 6/DDC4 correct); command-voice-standard.md has existing carve-out slots for a narrow caveman exemption (Impl 5/AC4 feasible). One minor accuracy defect: the design lists 'human-checkpoints-assets' as a candidate regression anchor, but no such test file exists in plugin/src; the other three named anchors do exist. This is a non-blocking planning-precision issue, not a design flaw, and the design already hedges anchors with 'where possible'/'maybe'. Simplicity is good: it rejects tests-only (too weak for durable behavior per C4), a parallel consequence block (would duplicate the renderer), global caveman changes (OOS2), and schema changes (DONT4/OOS). No materially simpler viable alternative was overlooked. No existing spec requirement is contradicted; rq-archiveVisibility01 is complemented, not violated. Anti-marketing (DONT1) and evidence-only impact (AC2/DONT2) are treated as hard constraints reconciled against the existing noise-reduction test.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/workflow-noise-reduction-assets.test.ts src/approval-consequence-context-assets.test.ts src/adv-skill-backed-commands-assets.test.ts, git diff --check $(git merge-base HEAD origin/trunk)..HEAD, git status --short results=pass — Targeted asset tests passed: 3 files, 72 tests. git diff --check produced no whitespace errors. git status --short produced no output, so worktree is clean.
- **[unresolved_action]** required_main_agent_actions: Proceed with archive/release sign-off flow; no harden remediation required.
- **[unresolved_action]** required_main_agent_actions: Do not revisit docs/spec/command/test assets for this harden pass unless new evidence appears.
- **[wisdom_candidate]** wisdom_candidates: [success] Release-readiness prose changes are safest when spec law, docs mirror, command prompts, ADV sign-off template, and asset tests all carry the same audience/impact/traceability terms; this keeps agent-side prose guidance auditable despite being partly prose-enforced.
- **[archive_only_evidence]** verification: tests_run=Path preflight: test -e for 10 changed files, git diff --check origin/trunk...HEAD, Manual harden scan of changed spec/docs/command/test assets for placeholder/slop/conflicting guidance/unsupported impact/follow-up blockers, bin/oc-test targeted -- src/workflow-noise-reduction-assets.test.ts src/approval-consequence-context-assets.test.ts src/adv-skill-backed-commands-assets.test.ts, git status --short results=pass — Initial task-scoped submit failed with INVALID_TASK_ANCHOR because packet TASK was descriptive, not an existing ADV task id; resubmitted as independent harden:release report per tool guidance. All 10 referenced changed files exist. git diff --check emitted no whitespace errors. Reviewed rq-executiveSummaryAudience01 spec and docs mirror; adv-review executive summary persistence; adv-harden Release Readiness Summary carry-forward; adv-archive Tier B sign-off context; ADV Sign-Off Boundary; and regression asset tests. No placeholder, duplicate/conflicting guidance, overbroad caveman carve-out, unsupported impact wording, hidden deploy/migration/data/frontend/ops/cleanup risk, or archive sign-off blocker found. Targeted asset tests passed: 3 files, 72 tests. Worktree clean (git status --short no output). Test output included existing warn-only advisory token-budget line ceiling warnings, not release blockers.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |

## Unresolved Actions

- Proceed with archive/release sign-off flow; no harden remediation required.
- Do not revisit docs/spec/command/test assets for this harden pass unless new evidence appears.
