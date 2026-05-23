---
name: adv-review
description: "Review code for correctness, security, and architecture; emit REVIEW_FINDINGS"
phaseGoal: "Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift."
---
<!-- manifest: adv-review · gate: acceptance · requiresChangeId: true · prereqs: [adv-apply] · scope: reads[specs, proposal, tasks, codebase] · modifies[proposal] -->
# ADV Review — Acceptance-Stage Deliverable Review
Orchestrate multi-dimensional review of the delivered work. Command is part of the acceptance stage, emits `REVIEW_FINDINGS`, and now carries the post-execution acceptance/sign-off flow directly.
## Exits
| Exit | Condition |
|------|-----------|
| ✅ APPROVED | No blockers/issues; findings emitted and ready for acceptance |
| 🔁 CHANGES_REQUESTED | Issues found → agent fixes → re-verifies |
| 🎤 BLOCKED | Blockers found → user decides |

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select or `question` tool

## Phase 0: Embedded Methodology
<!-- rq-R3v13wR1 -->

### Review Methodology

#### Purpose

Reusable code review methodology for ADV review workflows. Provides the 12-dimension framework and conventional comment labels.

**Runtime source:** this embedded section provides the review methodology needed during command execution.

#### 12-Dimension Framework

Every review must assess each dimension:

| # | Dimension | Focus |
|---|-----------|-------|
| 1 | Design | Architecture, system integration, timing |
| 2 | Functionality | Correctness, edge cases, concurrency |
| 3 | Complexity | Understandable quickly? Over-engineered? |
| 4 | Tests | Coverage adequate? Tests fail when code breaks? |
| 5 | Naming | Clear, communicative, appropriate length |
| 6 | Comments | Explain "why" not "what" |
| 7 | Style | Style guide conformance |
| 8 | Documentation | READMEs, API docs updated |
| 9 | Security | Auth, validation, secrets, OWASP top 10 |
| 10 | Performance | Degradation risks, optimization |
| 11 | Error Handling | Correct, user-friendly, debuggable |
| 12 | Consistency | Matches existing patterns |

All 12 must be checked. Skipping requires explicit justification.

#### Conventional Comment Labels

| Label | Meaning | Blocking? |
|-------|---------|-----------|
| `blocker:` | Must fix before merge | YES |
| `issue:` | Should fix, real problem | YES |
| `suggestion:` | Would improve code | NO |
| `nit:` | Minor style/preference | NO |
| `question:` | Need clarification | MAYBE |
| `praise:` | Good work worth noting | NO |

Format: `{label}: [{file}:{line}] {what}` + `Why: {why}` + `Fix: {how}` (optional).

#### Constraints

- **Read-only guidance** — this methodology block does not mutate ADV state
- **No gate completion** — command owns the review gate
- **Runtime source** — use this embedded methodology during command execution
- **No workflow sequencing** — command owns phase ordering and sub-agent orchestration

## Phase 1: Pre-flight
### Load Context
`adv_change_show changeId: <target> include: { snapshot: true }` — returns change + rendered gate snapshot in one call. Verify tasks are done — if no implementation, stop: "Run `/adv-apply` first."
### Gate Check
Read gate state from the included snapshot or inspect `gates` field on the response. If execution gate NOT complete → emit REVIEW BLOCKED banner → stop. Fall back to `adv_gate_status` only if a structured per-gate breakdown is needed.
### Cancellation & Cross-Repo Audit
**Step 1:** Check cancelled tasks for `cancellation.approved_by_user === true`. If any lack approval → REVIEW BLOCKED → stop.

**Step 2:** Check cross-repo tasks (`target_repo`/`target_path`) are `done`. If incomplete → REVIEW BLOCKED → stop.

**Step 3:** For cross-project coordination, inspect `_externalDependencyStatus` from `adv_change_show`. Unmet advisory dependencies are warnings, not blockers by themselves; block only if the agreement explicitly made a dependency mandatory or the implementation violates accepted scope.

**Step 4:** Verify target-project contribution workflow used ADV tools with `target_path`: target reads via `snapshot-ok`, target mutations via `temporal-required`, and untrusted mutations include `target_confirmed` plus `confirmationEvidence`.
### Extract Context
From change data: affected files, spec scenarios, task completion evidence, and `change.contract` if present.
### Worktree Context
`pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in every sub-agent prompt. Critical in worktrees — sub-agents inherit default project root, not worktree path.

---
## 12-Dimension Review Framework
| # | Dimension | Focus |
|---|-----------|-------|
| 1 | Design | Architecture, system integration, timing |
| 2 | Functionality | Does it work? Edge cases? Concurrency? |
| 3 | Complexity | Understandable quickly? Over-engineered? |
| 4 | Tests | Coverage, tests fail when code breaks |
| 5 | Naming | Clear, communicative, appropriate length |
| 6 | Comments | Explain "why" not "what" |
| 7 | Style | Style guide conformance |
| 8 | Documentation | READMEs, API docs updated |
| 9 | Security | Auth, validation, secrets |
| 10 | Performance | Degradation risks, optimization |
| 11 | Error Handling | Correct, user-friendly, debuggable |
| 12 | Consistency | Matches existing patterns |

---
## Conventional Comment Labels
| Label | Meaning | Blocking? |
|-------|---------|-----------|
| `blocker:` | Must fix before merge | YES |
| `issue:` | Should fix, real problem | YES |
| `suggestion:` | Would improve code | NO |
| `nit:` | Minor style/preference | NO |
| `question:` | Need clarification | MAYBE |
| `praise:` | Good work worth noting | NO |

Format: `{label}: [{file}:{line}] {what}` + `Why: {why}` + `Fix: {how}` (optional).

---
## Sub-Agent Resilience
Empty/failed result = transient failure (empty string, missing `"dimension"` key, error-only).

Protocol: retry once → if still fails → inline analysis for that dimension → never skip.
| Dimension | Inline Fallback |
|-----------|----------------|
| Requirement Traceability | Search files for scenario keywords |
| Logic & Edge Cases | Read functions, check null/off-by-one/unreachable |
| Security | Scan for hardcoded secrets, unvalidated input, injection |
| Architecture & Quality | Check function length >50, duplicated blocks, naming |
| Cross-Repo | Check target_repo tasks status === "done" |

---
## Phase 2: Spawn Analysis Sub-Agents
**Review Context Packet (inject into every sub-agent spawn prompt):**
```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title} | gate: review
ATTEMPT: {attempt-number, starting at 1 for this spawned worker}
AFFECTED FILES:
  - {file}: {one-line change summary}
  - ...
ACCEPTANCE CRITERIA:
  - AC1: {text}
  - ...
CONTRACT ITEMS:
  - {id}: {kind} | {evidencePolicy} | {text}
  - ...
TASK EVIDENCE SUMMARY:
  - {task-id}: {title} | {status} | tdd: {phase}
  - ...
EXPECTED OUTPUT: {dimension-specific JSON schema}
```
This replaces the minimal one-liner and gives explore agents grounded context without ADV tool access. Build the packet from `adv_task_list` and `adv_change_show` outputs at spawn time. Inject verbatim — do NOT give explore agents ADV tool access.

Spawn **5 sub-agents in two batches** (`subagent_type: "explore"`). Batch 1: sub-agents 1–3. Wait for completions. Batch 2: sub-agents 4–5. Each receives the Review Context Packet above plus dimension-specific instructions.
### Sub-Agent 1: Requirement Traceability
For each scenario → search files for implementation evidence → calculate coverage → flag untraced. Return: `dimension`, `coverage_percent`, `traced`, `untraced`, `issues`.
### Sub-Agent 2: Logic & Edge Cases
Check: off-by-one, null/undefined handling, boolean logic, unreachable code, edge cases (empty/zero/max), concurrency. Return: `dimension`, `issues` (label, category, file, line, what, why, fix), `edge_cases_checked`.
### Sub-Agent 3: Security
OWASP-based: A01 Broken Access Control, A02 Crypto Failures, A03 Injection, A04 Insecure Design, A05 Misconfiguration, A06 Vulnerable Components, A07 Auth Failures, A08 Data Integrity, A09 Logging Failures, A10 SSRF. Return: `dimension`, `issues`, `auth_assessment`, `secrets_scan`.
### Sub-Agent 4: Architecture & Quality
Check: pattern conformance, module boundaries, naming, complexity (>50 lines, cyclomatic >10), DRY violations, SOLID. Return: `dimension`, `issues`, `complexity_hotspots`, `praise_worthy`.
### Sub-Agent 5: Cross-Repo Verification
Verify: all target_repo/target_path tasks done, cancelled tasks have approval. Return: `dimension`, `status`, `missing_tasks`, `unapproved_cancellations`.

---
## Phase 3: Synthesis
> Anti-Loop: after sub-agents → `>>> SYNTHESIS COMPLETE <<<` → aggregate immediately.
1. Combine all issues → group by label (blocker > issue > suggestion > nit) → deduplicate
2. Cross-reference with spec scenarios
### Minimum Findings Enforcement
If <3 non-nit findings → require genuinely-clean justification with file-level evidence per the Review Methodology section above.
### Verdict
| Verdict | Criteria |
|---------|----------|
| BLOCKED | Any `blocker:` |
| CHANGES_REQUESTED | Any `issue:` (no blockers) |
| APPROVED | Only suggestion/nit/none |

Approve when change "definitely improves overall code health." Block only on: security vulns, correctness bugs, system health degradation, missing tests for risky changes. × Don't block on style preferences, minor optimizations, equivalent alternatives.

When APPROVED with unresolved `suggestion:` or `question:` findings, note in the `REVIEW_FINDINGS` block that these are deferred to `/adv-harden` for validation and implementation. The harden phase will validate each and either implement or reject with evidence before archive.

---
## Phase 4: Display Summary
Emit a CODE REVIEW report with the following shape:

### Executive Summary
One concise paragraph: overall verdict, total findings by severity, fixes applied (if remediation ran), and remaining concerns. No process mechanics — summarize outcome only.

### Verdict
State the verdict explicitly (APPROVED / CHANGES_REQUESTED / BLOCKED) on its own line.

### Findings Overview
1. **Severity breakdown**: counts per label (blockers, issues, suggestions, nits, praise).
2. **Per-dimension status**: one line per dimension with pass/flag status.
3. **Remediation summary** (if remediation ran): ordered list of fixes applied with verification status. Nest sub-details (file, what changed) under each fix.

Example shape:
```
### Executive Summary
{Verdict} with {N} findings ({B} blockers, {I} issues, {S} suggestions, {N} nits). {M} fixes applied during remediation. {Remaining concerns or "None"}.

### Verdict
{VERDICT}

### Findings Overview
1. Severity: {B} blocker(s), {I} issue(s), {S} suggestion(s), {N} nit(s), {P} praise
2. Dimensions:
   - Requirement Traceability: ✓ pass / ⚠ flagged ({n} issues)
   - Logic & Edge Cases: ✓ pass / ⚠ flagged ({n} issues)
   - Security: ✓ pass / ⚠ flagged ({n} issues)
   - Architecture & Quality: ✓ pass / ⚠ flagged ({n} issues)
   - Cross-Repo: ✓ pass / ⚠ flagged ({n} issues)
3. Remediation (if applicable):
   1. [{finding-id}] {what was fixed} — {verification status}
      - File: {file}:{line}
      - Detail: {change description}
```

---
## Phase 5: Remediation (if issues found)
<!-- rq-remediation01 -->
If APPROVED → skip to completion.

If CHANGES_REQUESTED/BLOCKED → auto-remediation is mandatory:
1. **Fix all blockers/issues** — no partial fix mode. Use the review step's conditional remediation routing; do not introduce ad-hoc workers.
   - **Scoped review-style fixes** (single file or local subsystem, no architectural risk) → spawn `adv-reviewer` sub-agent; expect persisted `REVIEWER_REPORT` state submitted via `adv_subagent_report_submit` per `.opencode/agents/adv-reviewer.md`.
   - **Primary implementation fixes** (multi-file, architectural, risky) → spawn `adv-engineer` sub-agent; expect persisted `ENGINEER_REPORT` state submitted via `adv_subagent_report_submit` per `.opencode/agents/adv-engineer.md`.
   - **Non-trivial fix research** (control flow, error handling, security code, module boundaries, 3+ files, multiple viable approaches) → spawn `adv-researcher` first, then implement through the appropriate remediation worker above.
2. **Investigate suggestions/questions** — validate against specs/tests/code → implement if validated, reject with evidence if not.

### Drift Detection Rule (CRITICAL)

Before applying ANY fix, evaluate: **"If I apply this fix, will any agreement acceptance criterion (`AC*`), constraint (`C*`), avoidance (`DONT*`), or out-of-scope boundary (`OOS*`) need to change?"**

- **NO** → auto-remediate (proceed with fix)
- **YES** → **STOP** — present the finding and proposed fix to user via `question` tool:
  - **Approve fix and update scope** — user agrees the scope should expand
  - **Skip fix, document as accepted debt** — finding is valid but out of scope
  - **Cancel review** — user wants to reconsider

This is the single declarative drift detection rule. It applies to every finding, every fix, every auto-remediation action.
3. **Cleanup pass** — remove temp artifacts, debug code, dead imports, stale comments.
4. **Verification** — re-run tests for touched areas, update finding status (fixed/unresolved).
5. **Recompute verdict** — APPROVED only when no unresolved blocker/issue remains and all validated in-scope suggestions are implemented. No future-work deferral for validated in-scope findings.
### Fix Validation Protocol
| Fix Type | Research Required? |
|----------|-------------------|
| Typos, naming, comments, dead code removal, lint fixes | No (trivial) |
| Control flow, error handling, security code, module boundaries, 3+ files, multiple viable approaches | Yes — spawn `adv-researcher` (independent validator) first |

If research reveals finding was incorrect → downgrade to `nit:` or reject with evidence.

---
## Phase 5.5: Post-Remediation Re-Verification
After remediation fixes are applied, re-verify affected dimensions before recomputing verdict:
1. For each dimension that had findings fixed, spawn a **targeted** `explore` scanner with the Review Context Packet plus:
   - `PRIOR FINDINGS: [{finding_id, original_issue, fix_applied}]`
   - `SCOPE: evaluate only whether the listed findings are resolved`
   - `EXPECTED OUTPUT: { finding_id, status: "resolved"|"unresolved", evidence }`
2. If resolved → update finding status to `fixed`.
3. If unresolved → flag for orchestrator to retry fix or escalate.
4. **New findings** discovered during re-scan → queue for next review cycle, NOT added to current verdict. This prevents scope creep in the re-verification loop.

× Do NOT re-run all 5 dimensions. Only re-scan dimensions with fixed findings.

---
## Phase 6: Final Report
<!-- rq-touchedScope01 -->
### Report
Emit a structured final report using ordered and nested lists:

1. **Verdict** — state APPROVED / CHANGES_REQUESTED / BLOCKED on its own line.
2. **Per-dimension summaries** — numbered list, one entry per dimension:
   1. Design: {pass/flag summary}
   2. Functionality: {pass/flag summary}
   3. ... (all 12 dimensions)
3. **Numbered review comments** — grouped by severity (blockers → issues → suggestions → nits), each with:
   - Label, file:line, what, why, fix
   - Nest sub-details (e.g., root cause analysis, affected callers) as indented sub-items under each finding
4. **Positive notes** — `praise:` findings listed concisely.
5. **Fixes applied** (if remediation ran) — ordered list with verification status:
   1. [{finding-id}] {what was fixed} — {verification status}
      - File: {file}:{line}
      - Change: {description of fix}

Group findings by severity tier. Within each tier, order by file path for scanability. Use nested sub-lists for multi-file findings or findings with multiple remediation steps.

### Contract Review Matrix

If `change.contract` exists, build and persist `contract.reviewMatrix` before acceptance sign-off by calling `adv_contract_review_matrix_set`. The tool validates rows against existing contract item IDs and persists through the `contractReviewMatrixSetSignal`-backed mutation path.

Rules:

- Create one row per required contract item.
- Use task verification, review findings, static checks, and design proof as evidence.
- Status values: `pass`, `fail`, `respected`, `violated`, `unknown`, `not_applicable`.
- `AC*` rows must be `pass` or `not_applicable` with rationale before acceptance.
- `C*`, `DONT*`, and `OOS*` rows must be `respected`, `pass`, or `not_applicable` with rationale.
- Any required contract item with `fail`, `violated`, `unknown`, or missing evidence blocks acceptance until remediated or formally amended/re-entered.
- Keep evidence bounded and structured; do not paste raw logs into the matrix.
- For poisoned-history recovery only, use `adv_contract_review_matrix_set recoveryMode: "poisoned_history"` with explicit `recoveryEvidence`, then complete the gate with `compatibilityReason: "..."` after the inline acceptance checkpoint when the legacy/replay rationale is valid. This repairs the disk projection only and does not heal the poisoned workflow.

The acceptance summary must include a contract proof line: required rows passed/respected, failed/violated/unknown counts, and remaining caveats.

`contract.reviewMatrix` is the authoritative acceptance proof. On gate completion, the workflow writes a generated acceptance.md projection from `ChangeContract` items and the review matrix before marking acceptance done. Do not manually edit acceptance.md as proof; fix the typed matrix or formally amend/re-enter the contract instead.

### Emit REVIEW_FINDINGS Block
Always emit regardless of verdict:
```
REVIEW_FINDINGS:
change: {change-id}
verdict: {verdict}
reviewed_at: {ISO timestamp}
findings:
  - id: {dimension}-{n}
    label: {label}
    file: {file}
    line: {N}
    what: {what}
    status: {unresolved|fixed|rejected_with_evidence}
    fix_notes: {details}
END_REVIEW_FINDINGS
```

Status rules: `unresolved` at emission time. Terminal states are `fixed` or `rejected_with_evidence`. `/adv-harden` checks task notes for fix evidence and rejection evidence. `nit:` excluded from harden blocking.

---
## Phase 7: Acceptance Sign-Off
### Pre-Acceptance Checks
- `adv_change_show`
- `adv_task_list`
- `adv_gate_status`

Verify execution work is complete enough to review. If implementation/execution work is still incomplete, stop and direct user to `/adv-apply` first.

### Build Acceptance Summary
Using `agreement.md`, produce:
1. **Delivered work summary**
2. **Acceptance Criteria checklist**
3. **Constraints respected / avoidances honored**
4. **Outstanding caveats**
5. **Investment summary** — call `adv_investment_report changeId: {id}`; include one line: `Investment: N tasks / M retries / T min / tier: {auto|escalate|hardstop}`. Informational only; not a gate.

Keep concise; user-facing.

### Persist Executive Summary

Before acceptance prompt, persist durable executive summary:

1. `adv_investment_report changeId: {id}` → task counts, elapsed time, retry density, gate durations.
2. Compose from acceptance summary + metrics:
   ```
   # Executive Summary

   ## Outcome
   {1–2 sentence narrative verdict.}

   ## Verdict
   {APPROVED | CHANGES_REQUESTED | BLOCKED}

   ## What Was Built
   1. {ordered list from change.tasks, using implementation_summary}

   ## What Was Verified
   - Verdict: {verdict} with {N} findings ({severity breakdown})
   - Tests: {pass/fail summary}
   - Investment: {N tasks / M retries / T min / tier}
   - Contract matrix: {required rows passed/respected, if contract exists}

   ## Remaining Concerns
   {open items or "None".}
   ```
3. `adv_change_update changeId: {id} executiveSummary: "{composed markdown}"`
4. Verify: `adv_change_show changeId: {id} include: { executiveSummary: true }` → `_executiveSummary` present.

After user accepts, artifact already exists. No extra acceptance-step write.

### Pre-Acceptance Contract Preflight

Before acceptance summary or **Inline Approval prompt**, load `adv_change_show`; verify:

- `change.contract` exists.
- `contract.reviewMatrix` exists when contract items require it.
- Required rows have no `fail`, `violated`, `unknown`, or missing evidence.
- Required new MCP tool is callable in current session. If source registered it but live registry lacks it, stop: tell user to build/reload plugin and open fresh OpenCode session. Do not ask for acceptance until proof path exists.

Preflight fail → surface blocker + remediation. Do not continue to acceptance checkpoint.

### Ask for Acceptance (Inline)
Emit the acceptance summary inline, followed by the **Inline Approval prompt (Tier A)** per `docs/command-voice-standard.md` § Inline Approval Voice:

```
Reply `accept` (or `approve`, `continue`, `looks good`, `lgtm`) to accept the delivered work and proceed inline to /adv-harden,
or run `/adv-harden {change-id}`.
Want fixes before acceptance? Reply with what needs adjustment.
Want to reopen an earlier gate (scope expansion)? Reply `reopen {gate-name}` (e.g. `reopen discovery`) or `/adv-clarify {change-id}` for ambiguity.
Want to split discovered scope into a fast-follow change? Reply `split` — creates a new child change linked to this one.
Want to stop here? Reply `stop` or `defer`.

See `docs/scope-discovery-protocol.md` for the full protocol on scope discovery during review.
```

**Reply parsing (Tier A):**

| Reply | Action |
|---|---|
| Tier A whitelist match | Call `adv_gate_complete gateId: 'acceptance'`, begin `/adv-harden` inline |
| `/adv-harden {change-id}` | No-op; OpenCode dispatches |
| `reopen {gate-name}` or `re-enter {gate-name}` | Invoke `adv_change_reenter fromGate: {gate-name}` (scope expansion) |
| `split` | Create new fast-follow change via `adv_change_create parent_change_id: <current>` for the discovered scope |
| Free-form text | Treat as "needs fixes before acceptance"; route back to remediation; do NOT complete gate |
| `stop` / `defer` | Halt; do not complete gate |

**Anchor phrase:** `Reply `accept``

If user identifies new objectives or AC requiring scope expansion: `reopen {gate}` triggers `adv_change_reenter` from earliest affected gate. `split` creates fast-follow child change; current change keeps momentum.

### Complete Gate
On acceptance:
`adv_gate_complete changeId: {change-id} gateId: acceptance`

`workflowGateStatus: "stuck"` → inspect `readinessBlockers` + `stuckReason`, fix missing/failing contract rows or artifact-generation failures, retry. Do not present acceptance complete until tool succeeds.

---
## Output

Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
What was reviewed and user-accepted.

## Delivered
- Verdict: {APPROVED|CHANGES_REQUESTED|BLOCKED}
- {fix_count} fixes applied
- User acceptance recorded
- {Remaining caveats, if any}

---

> **{change-id}**
> acceptance ✓ → release
>
> → `/adv-harden {change-id}`
```

**Auto-continue:** After user acceptance, immediately begin `/adv-harden` inline. Do not stop or ask "shall I proceed?" — user's acceptance is the go-ahead.
---
## Anti-Patterns
| × Anti-Pattern | ✓ Fix |
|----------------|-------|
| Perfection-seeking | Seek "better" not "perfect" |
| Style-only blocking | Only block on style guide rules |
| Missing "why" | Explain reasoning |
| Unresearched fixes | Research non-trivial fixes first |

---
## Key Tools
| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Spawn analysis | Task tool (explore) |
| Spawn research | Task tool (adv-researcher) |
| Spawn review remediation | Task tool (adv-reviewer or adv-engineer) |
| Spawn fixes | Task tool (adv-engineer) |
