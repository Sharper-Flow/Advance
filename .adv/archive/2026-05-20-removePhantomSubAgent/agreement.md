# Agreement

## Objectives

1. Replace active `librarian` routing with `adv-researcher` for docs/API/examples research.
2. Remove active `mechanic` spawn guidance; route diagnostics inline or to supported tooling.
3. Convert `prioritizer` spawn guidance to the existing skill/inline protocol.
4. Add `adv-reviewer.md` as a supported `mode: subagent` asset for prep/planning pre-flight, review, and harden.
5. `adv-reviewer` has repo/code/docs/test write capability for scoped remediation; no nested delegation; no ADV orchestration mutations.
6. `adv-reviewer` returns a `Verdict + findings` report; stops and reports scope drift to main agent.
7. Update prep/review/harden guidance to route independent analysis to `adv-reviewer` where appropriate.
8. Add asset tests that fail on phantom sub-agent routing drift and cover `adv-reviewer` deploy/sync behavior.
9. Verify via tests + `scripts/deploy-local.sh --fix`; document OpenCode restart requirement.

## Acceptance Criteria

**AC1:** Active ADV guidance no longer routes spawnable work to `librarian`, `mechanic`, or `prioritizer`.

**AC2:** Docs/API/examples research routes to `adv-researcher`.

**AC3:** `prioritizer` appears only as skill/inline protocol, not spawnable sub-agent.

**AC4:** `adv-reviewer.md` exists as a `mode: subagent` asset with repo/code/docs/test write capability, no nested delegation, no ADV orchestration mutations.

**AC5:** `adv-reviewer` returns a `Verdict + findings` report with verdict, blocking/nonblocking findings, evidence, changes made, wisdom candidates, verification, risks, and required main-agent actions.

**AC6:** `adv-reviewer` stops and reports when a finding requires scope/AC/agreement changes.

**AC7:** Prep/review/harden guidance routes independent analysis to `adv-reviewer` where appropriate.

**AC8:** Asset tests fail on future phantom sub-agent routing drift.

**AC9:** Tests cover `adv-reviewer` deploy/sync behavior via `scripts/deploy-local.sh`.

**AC10:** Verification includes relevant tests + `scripts/deploy-local.sh --fix`.

**AC11:** Final notes include OpenCode restart requirement.

## Constraints

- **C1:** Historical changelog and archival decision-pack references are out of scope unless consumed as active guidance.
- **C2:** `adv-tron` remains supported as repo-local reconnaissance; do not remove it.
- **C3:** `adv-reviewer` deploy uses the standard path via `scripts/deploy-local.sh` (same as `adv-engineer`); no separate sync-global mechanism.
- **C4:** `adv-reviewer` report returns to the orchestrating command; the command decides where to persist findings.
- **C5:** Prep remains the orchestration owner for task creation and gap analysis; `adv-reviewer` may provide pre-flight readiness analysis but does not create tasks or complete gates.

## Avoidances

- **DONT1:** Do not rewrite historical changelog/decision-pack entries.
- **DONT2:** Do not give `adv-reviewer` ADV orchestration mutation authority (gates, tasks, changes, worktree).
- **DONT3:** Do not treat prose-only warnings as sufficient protection against roster drift — structural tests are required.
- **DONT4:** Do not remove `adv-tron` or `adv-researcher`; both are supported and shipped.

## Out-of-Scope

- **OOS1:** Historical/archival phantom references in CHANGELOG.md or archived decision packs.
- **OOS2:** Removing or restructuring `adv-tron` (repo-local by design).
- **OOS3:** Changing the `sync-global.sh` mechanism (already retired in favor of `deploy-local.sh`).

## Decisions

### User Decisions

1. **Scope boundary** — Active guidance, agent assets, tests, deploy/sync only; leave historical records untouched. Why: rewrites of archival content would create noise without reducing runtime risk.
2. **`adv-reviewer` responsibility** — Owns prep/planning pre-flight, review, and harden; returns optimal context to the main agent. Why: these phases need independent analysis with scoped remediation capability.
3. **Ship signal** — All three: structural tests, docs clarity, local deploy proof. Why: comprehensive verification prevents regressions.
4. **Access boundary** — Repo/code/docs/test writes only, no ADV orchestration mutations. Why: keeps gate/workflow authority in the main agent while enabling scoped fixes.
5. **Scope drift handling** — Stop and report to main agent. Why: prevents silent scope expansion beyond approved agreement.
6. **Report location** — Return to orchestrator; command decides persistence. Why: keeps commands in control of their own state.
7. **Deploy path** — Standard `deploy-local.sh` like all bundled agents. Why: consistent deployment, already proven pattern.

### Agent Decisions (LBP)

1. **Research routing replacement** — Use `adv-researcher` (already has Context7, Exa, webfetch, Firecrawl, searchcode, lgrep). Evidence: inspected `adv-researcher.md` tool list.
2. **Mechanic routing replacement** — Route diagnostics inline by the main ADV agent. No standalone diagnostic agent is shipped; the orchestrator handles this contextually.
3. **Prioritizer routing replacement** — Already a valid skill/inline protocol (`skill("prioritizer")`); only the sub-agent roster table contradicts this.
4. **Structural guardrails** — Asset tests should enumerate forbidden spawn routing plus expected `adv-reviewer` deploy behavior. Prose-only warnings regress when command docs or overlays are edited.
5. **`adv-reviewer` report shape** — `Verdict + findings` with structured fields: verdict, blocking/nonblocking findings, evidence, changes made, wisdom candidates, verification, risks, required main-agent actions.
6. **Prep delegation split** — Design phase should finalize which prep responsibilities (cross-cutting concern analysis, codebase impact scan, cross-spec consistency check) are delegated to `adv-reviewer` vs kept inline. Principle: delegate context-heavy read-only analysis; keep orchestration authority (task creation, sequencing, gate completion) inline.

## Deferred Questions

None — all user-facing questions resolved during clarification and discovery rounds.

## Contract

### SC (Success Criteria)

- **SC1:** Phantom sub-agent spawn routing (`librarian`, `mechanic`, `prioritizer`) eliminated from active guidance. | evidence: test
- **SC2:** Research routing uses `adv-researcher`. | evidence: test
- **SC3:** `prioritizer` only as skill/inline protocol. | evidence: static_check
- **SC4:** `adv-reviewer.md` shipped as valid `mode: subagent` with correct tool boundary. | evidence: test
- **SC5:** `adv-reviewer` returns structured verdict/findings report. | evidence: test
- **SC6:** `adv-reviewer` reports scope drift rather than applying it. | evidence: review
- **SC7:** Prep/review/harden route to `adv-reviewer`. | evidence: static_check
- **SC8:** Asset tests catch roster drift. | evidence: test
- **SC9:** `adv-reviewer` deploy/sync tested. | evidence: test
- **SC10:** End-to-end verification passes. | evidence: test
- **SC11:** OpenCode restart documented. | evidence: static_check

### AC (Acceptance Criteria)

- **AC1:** Active ADV guidance no longer routes spawnable work to `librarian`, `mechanic`, or `prioritizer`. | evidence: test
- **AC2:** Docs/API/examples research routes to `adv-researcher`. | evidence: test
- **AC3:** `prioritizer` appears only as skill/inline protocol, not spawnable sub-agent. | evidence: static_check
- **AC4:** `adv-reviewer.md` exists as a `mode: subagent` asset with repo/code/docs/test write capability, no nested delegation, no ADV orchestration mutations. | evidence: test
- **AC5:** `adv-reviewer` returns a `Verdict + findings` report with verdict, blocking/nonblocking findings, evidence, changes made, wisdom candidates, verification, risks, and required main-agent actions. | evidence: test
- **AC6:** `adv-reviewer` stops and reports when a finding requires scope/AC/agreement changes. | evidence: review
- **AC7:** Prep/review/harden guidance routes independent analysis to `adv-reviewer` where appropriate. | evidence: static_check
- **AC8:** Asset tests fail on future phantom sub-agent routing drift. | evidence: test
- **AC9:** Tests cover `adv-reviewer` deploy/sync behavior via `scripts/deploy-local.sh`. | evidence: test
- **AC10:** Verification includes relevant tests + `scripts/deploy-local.sh --fix`. | evidence: test
- **AC11:** Final notes include OpenCode restart requirement. | evidence: static_check

### C (Constraints)

- **C1:** Historical references out of scope unless active guidance. | evidence: static_check
- **C2:** `adv-tron` remains supported repo-local. | evidence: static_check
- **C3:** Standard `deploy-local.sh` deploy path. | evidence: test
- **C4:** Report returns to orchestrator. | evidence: review
- **C5:** Prep owns task creation; reviewer assists only. | evidence: review

### DONT (Avoidances)

- **DONT1:** No historical changelog/decision-pack rewrites. | evidence: static_check
- **DONT2:** No ADV orchestration mutations for `adv-reviewer`. | evidence: test
- **DONT3:** No prose-only drift protection. | evidence: test
- **DONT4:** Do not remove `adv-tron` or `adv-researcher`. | evidence: static_check

### OOS (Out-of-Scope)

- **OOS1:** Historical/archival phantom references in CHANGELOG.md or archived decision packs. | evidence: design_proof
- **OOS2:** Removing or restructuring `adv-tron`. | evidence: design_proof
- **OOS3:** Changing the `sync-global.sh` mechanism (already retired). | evidence: design_proof

## Sign-Off

Agreement approved inline by user via Tier A affirmation ("excellent!") at AC checkpoint Phase 4.5.1, following `/adv-clarify` resolution of all ambiguity findings.

Investment: 0 tasks / 0 retries / ~149 min / tier: auto
