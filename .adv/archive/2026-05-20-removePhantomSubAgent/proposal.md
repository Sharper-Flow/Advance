# Remove phantom sub-agent references and add adv-reviewer

## Intent

Remove active guidance that tells ADV agents to spawn sub-agents that are not currently shipped as supported ADV assets, and add a supported `adv-reviewer` sub-agent for independent prep pre-flight, review, and harden analysis/remediation.

## Problem Statement

ADV guidance currently references `librarian`, `mechanic`, and `prioritizer` as spawnable/common sub-agents in active orchestrator and workflow surfaces, but the repository ships only ADV specialists such as `adv-researcher`, `adv-engineer`, and repo-local `adv-tron`. This creates runtime drift: agents may follow active docs and try to delegate to unavailable or unsupported workers. Review/harden also lacks a dedicated supported reviewer specialist even though those phases rely on independent analysis and scoped remediation.

## Scope

- Active ADV guidance surfaces: `ADV_INSTRUCTIONS.md`, `.opencode/agents/adv.md`, `.opencode/agents/plan.md`, `.opencode/overlays/*.overlay.md`.
- Review/research/task workflow docs that route to phantom agents: `.opencode/command/adv-review.md`, `.opencode/command/adv-research.md`, `.opencode/command/adv-task.md`, and adjacent checklists/docs where they are active guidance.
- Prep/review/harden guidance where independent reviewer pre-flight or analysis is appropriate: `.opencode/command/adv-prep.md`, `.opencode/command/adv-review.md`, `.opencode/command/adv-harden.md`, and relevant checklists.
- Agent assets under `.opencode/agents/`, adding `adv-reviewer.md`.
- Local deploy/sync support in `scripts/deploy-local.sh` and structural asset tests under `plugin/src/*assets.test.ts` / related sync tests.
- Documentation surfaces that describe the supported roster: README/SETUP/AGENTS/project docs as needed.
- Historical changelog and archival decision-pack references are out of scope unless consumed as active guidance.

## Success Criteria

- [ ] Active ADV guidance no longer tells agents to spawn `librarian`, `mechanic`, or `prioritizer` as sub-agents.
- [ ] `adv-researcher` explicitly owns docs/API/examples research as well as architecture validation.
- [ ] `prioritizer` appears only as a skill/inline protocol, not as a spawnable sub-agent.
- [ ] `adv-reviewer` exists as a supported `mode: subagent` asset for prep/planning pre-flight, review, and harden.
- [ ] `adv-reviewer` has repo/code/docs/test write capability for scoped remediation, but no nested delegation and no ADV orchestration mutation authority: no gate completion, task creation/update/cancellation, change creation/update/archive, or worktree orchestration.
- [ ] `adv-reviewer` may read ADV state and record bounded evidence/learning where appropriate, such as `adv_run_test` and `adv_wisdom_add`, but scope drift is reported back to the main ADV agent for user approval/re-entry.
- [ ] `adv-reviewer` returns a `Verdict + findings` report structure with verdict, blocking/nonblocking findings, evidence, changes made, wisdom candidates, verification run, remaining risks, and required main-agent actions.
- [ ] Prep/review/harden routing docs use `adv-reviewer` where independent readiness/review/harden work is appropriate.
- [ ] `adv-tron` remains supported as repo-local reconnaissance unless implementation evidence changes.
- [ ] Asset tests fail on future phantom sub-agent routing drift and cover `adv-reviewer` sync/deploy behavior.
- [ ] Verification includes relevant tests and `scripts/deploy-local.sh --fix`; final notes include OpenCode restart requirement.

## Discovery Findings

### Discovery Checklist

| Step | Result | Reason |
|---|---|---|
| Skills Considered | PASS | Loaded `customize-opencode`; agent/config asset changes require schema-aware edits and restart notes. |
| Prior Research Extension | PASS | Reviewed `docs/repo-improve-prep.md` and `docs/change-contract-traceability-prep.md`; no direct roster pack exists, but both support asset tests, locality, and specialized review dimensions. |
| Conflict Scan | PASS | `adv_change_list` shows concurrent drafts but no direct roster overlap; `adv_change_validate` passes with expected pre-prep warnings `NO_TASKS`/`NO_DELTAS`; agenda items are unrelated. |
| Edge Case Investigation | PASS | Captured phantom references, historical docs boundary, overlay/global sync drift, and agent capability boundaries. |
| Design Question Depth | PASS | Open questions are technical/agent-resolved and deferred to design. |
| Draft Spec Deltas | PASS | Drafted structural guardrail requirement shapes for supported sub-agent roster and reviewer asset sync. |
| Related Pattern Scan | PASS | Similar pattern found: stale skill references are already explicitly called out in `ADV_INSTRUCTIONS.md`; current issue is the same class for sub-agents. |
| LBP Check | PASS | Structural tests + supported agent assets are the long-term fix; fallback-to-general or prose-only warnings are not sufficient. |

### Current State

- `.opencode/agents/` currently contains `adv-atc.md`, `adv-engineer.md`, `adv-researcher.md`, `adv-tron.md`, `adv.md`, `build.md`, and `plan.md`; there is no `adv-reviewer.md`.
- `adv-researcher.md` already has documentation/web/code-example research tools: Context7, Exa, webfetch, Firecrawl, searchcode, lgrep, and ADV read-only query tools. It can absorb docs/API/examples research currently assigned to `librarian`.
- `adv-engineer.md` is the pattern for a bundled global write-capable ADV sub-agent with no nested delegation and blocked gate/task orchestration tools.
- `adv-review.md` and `adv-harden.md` require scoped auto-remediation for validated in-scope findings; therefore `adv-reviewer` needs repo write/test tools, not report-only access.
- `adv-prep.md` currently says prep runs inline with no sub-agents; this change may add reviewer pre-flight only if the command remains orchestration owner and the reviewer returns a readiness report rather than owning task creation or gate completion.
- `scripts/deploy-local.sh` copies `.opencode/agents/*.md` to global agents except overlay-managed/shared exclusions and repo-local exclusions; adding a non-excluded `adv-reviewer.md` should sync globally, but tests should lock this.
- Active phantom references found in guidance include `ADV_INSTRUCTIONS.md` common sub-agent roster (`librarian`, `mechanic`, `prioritizer`), `.opencode/agents/adv.md` sub-agent table and failure handling, plan overlays using `explore + librarian`, `SETUP.md` agent table, and command docs routing research to `librarian`.
- `prioritizer` is already documented elsewhere as a skill/inline protocol; the active sub-agent roster contradicts that.

### Edge Cases

1. Historical references: changelog and archived decision packs mention old agents. These should remain unless consumed as active guidance; rewriting history would create noise.
2. Overlay drift: `.opencode/overlays/adv.overlay.md` and `plan.overlay.md` can re-inject phantom routing into global agents if not updated with source agents.
3. Sync drift: adding `adv-reviewer.md` without deploy/sync tests could leave global users without the new agent after `scripts/deploy-local.sh --fix`.
4. Capability overreach: `adv-reviewer` must not complete gates, mutate tasks, mutate changes, or spawn sub-agents. It may edit repo files and run tests within scoped review/harden responsibilities.
5. Scope drift: if a reviewer finding would change approved scope, acceptance criteria, or out-of-scope boundaries, `adv-reviewer` must stop and report to the main ADV agent rather than applying the scope change.
6. `adv-tron` false positive: it is repo-local by design and should not be removed just because it is not bundled global.
7. `prioritizer` wording: references to the skill/protocol are valid; only spawnable sub-agent routing is invalid.

### Open Design Questions

1. **Reviewer tool boundary**
   - Trust model: user-resolved during clarification.
   - Resolution: `adv-reviewer` should have repo/code/docs/test write capability for scoped fixes, ADV read/evidence/learning tools where useful, no nested delegation, and no ADV orchestration mutations.
   - Blast radius: too much ADV authority could bypass gates or mutate the plan; too little repo authority would contradict review/harden auto-remediation requirements.

2. **Reviewer report contract**
   - Trust model: user-resolved during clarification.
   - Resolution: use `Verdict + findings` as the main shape, with enough structure for the main ADV agent to continue: verdict, blocking/nonblocking findings, evidence, changes made, wisdom candidates, verification, risks, and required main-agent actions.
   - Blast radius: weak reports lose context and force the orchestrator to rediscover findings.

3. **Research routing replacement**
   - Trust model: agent-resolved.
   - Resolution: use `adv-researcher` because it already has documentation, web, and public-code search tools.
   - Blast radius: wrong replacement could lose docs/API/example research capability.

4. **Structural guardrails**
   - Trust model: agent-resolved.
   - Resolution: asset tests should enumerate forbidden spawn routing plus expected `adv-reviewer` deploy behavior.
   - Blast radius: prose-only cleanup will regress when command docs or overlays are edited.

### Draft Spec Deltas

- `rq-supportedSubagentRoster01`
  - Given active ADV guidance is inspected
  - When sub-agent routing tables or failure handling are read
  - Then only supported spawnable agents are listed, `prioritizer` appears only as a skill/inline protocol, and nonexistent `librarian`/`mechanic` spawn paths are absent.

- `rq-advReviewer01`
  - Given prep/review/harden workflows need independent analysis and scoped remediation
  - When ADV assets are synced/deployed
  - Then `adv-reviewer.md` exists as a `mode: subagent` asset, forbids nested `task`, forbids ADV orchestration mutations, has repo/code/docs/test write access, and is installed by `scripts/deploy-local.sh --fix`.

- `rq-advReviewerReport01`
  - Given `adv-reviewer` completes a prep/review/harden assignment
  - When it returns control to the main ADV agent
  - Then it emits a structured verdict/findings report with evidence, changes made, verification, wisdom candidates, drift findings, risks, and required main-agent actions.

- `rq-researchRouting01`
  - Given docs/API/examples research is needed
  - When ADV guidance selects a research specialist
  - Then `adv-researcher` is the supported specialist and its asset grants documentation, web, and public-code example tools.

### Related Pattern Scan

- Existing stale-reference class: `ADV_INSTRUCTIONS.md` already warns that deleted skills `adv-review-methodology` / `adv-harden-methodology` are stale references. This change applies the same cleanup/guardrail pattern to deleted or unsupported sub-agent names.
- Active same-pattern matches: `librarian` in orchestrator/plan/command docs, `mechanic` in orchestrator failure handling, and `prioritizer` in sub-agent roster despite valid skill-based references elsewhere.
- Deprecated/archival matches: `CHANGELOG.md` and decision packs contain historical references and should be left untouched unless active docs consume them.

### LBP Check

The best long-term direction is structural: define the supported roster in shipped agent assets, route docs/API/examples research to `adv-researcher`, add `adv-reviewer` for prep/review/harden, give it repo write/test capability for scoped remediation, keep ADV orchestration authority in the main agent, and lock the contract with asset tests. Prose-only warnings or fallbacking phantom names to `general` would preserve ambiguity and violate structural-correctness guidance.

## Clarification Results

### User Decisions

- Scope boundary: update active guidance, agent assets, tests, and deploy/sync support only; leave historical changelog and archival decision records untouched.
- `adv-reviewer` responsibility: prep/planning pre-flight, `adv-review`, and `adv-harden`; return optimal context to the main agent, including readiness verdicts, findings, changes/updates, potential wisdom adds, and verification.
- Ship signal: all acceptance signals matter — structural tests, docs clarity, and local install/deploy proof.
- Access boundary: repo/code/docs/test writes only, with ADV reads/evidence/learning where appropriate; no ADV orchestration mutations.
- Scope drift: stop and report to the main ADV agent; do not alter approved scope or acceptance criteria directly.

### Clarified Acceptance Criteria

1. Active ADV guidance no longer routes spawnable work to `librarian`, `mechanic`, or `prioritizer`.
2. Docs/API/examples research routes to `adv-researcher`.
3. `prioritizer` appears only as skill/inline protocol guidance, not as a spawnable sub-agent.
4. `adv-reviewer.md` exists as a supported `mode: subagent` asset for prep pre-flight, review, and harden.
5. `adv-reviewer` forbids nested delegation and ADV state mutation/gate/task/change orchestration.
6. `adv-reviewer` has repo/code/docs/test write capability for scoped remediation and can run verification.
7. `adv-reviewer` can read ADV state and may record bounded evidence/learning such as test evidence or wisdom where tool policy allows.
8. `adv-reviewer` stops and reports when a finding requires scope, acceptance criteria, agreement, or out-of-scope changes.
9. `adv-reviewer` returns a `Verdict + findings` report with verdict, blocking/nonblocking findings, evidence, changes made, wisdom candidates, verification run, remaining risks, and required main-agent actions.
10. Prep/review/harden guidance routes independent readiness/review/harden work to `adv-reviewer` where appropriate.
11. Asset tests fail on future phantom sub-agent routing drift.
12. Tests cover `adv-reviewer` deploy/sync behavior.
13. Verification includes relevant tests plus `scripts/deploy-local.sh --fix`.
14. Final notes include OpenCode restart requirement.

## Clarify Resolution Log

- B1 (resolved 2026-05-20T17:27:43+00:00): Active guidance/test/deploy surfaces are in scope; historical changelog and archival decision records are out of scope unless consumed as active guidance.
- F1 (resolved 2026-05-20T17:27:43+00:00): `adv-reviewer` owns prep/planning pre-flight, review, and harden support; it returns readiness/review/harden verdicts, findings, evidence, changes made, wisdom candidates, verification, risks, and next actions.
- M1 (resolved 2026-05-20T17:27:43+00:00): `adv-reviewer` should have repo/code/docs/test write capability for scoped remediation plus ADV read/evidence/learning tools where appropriate, but no nested delegation and no ADV orchestration mutations.
- S1 (resolved 2026-05-20T17:27:43+00:00): Ship requires structural roster tests, `adv-reviewer` deploy/sync coverage, relevant verification, `scripts/deploy-local.sh --fix`, documentation clarity, and OpenCode restart notes.
