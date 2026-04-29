---
name: adv-autopilot
description: Delegate routine checkpoints to the agent, stop only on safety boundaries
---
<!-- manifest: adv-autopilot · requiresChangeId: false · scope: reads[specs, proposal, codebase] modifies[proposal] gates[proposal, discovery, design, planning, acceptance] -->
# ADV Autopilot — Delegate Routine Checkpoints
Delegate all 5 routine human checkpoints (proposal, agreement, design, prep, acceptance) to the agent for a single change. Stop only on Tier B (archive sign-off, cancellation) and system-level interrupts. The invocation IS the approval.

## Command Boundary

**Produces:** Completed gates through acceptance, implementation via `/adv-apply`, review via `/adv-review`.

**Crosses boundaries intentionally** (multi-gate orchestrator): completes proposal, discovery, design, planning, and acceptance gates with `completedBy: "adv-autopilot"`.

**Stops at:** Archive sign-off (Tier B — whitelist-only, no autopilot override).

## Constraints

- × MUST NOT invoke `/adv-X` slash commands internally — execute sister command contracts inline
- × MUST NOT embed compressed phase logic — read `.opencode/command/adv-{X}.md` at invocation time
- × MUST NOT auto-archive — Tier B archive sign-off preserved verbatim
- × MUST NOT bypass cancellation approval — `adv_task_cancel approvedByUser: true` always required
- × MUST NOT suppress system-level interrupts: doom-loop, design CONFLICT, contract-compromise risk, Phase 1.5 judgment-call surfacing, drift detection
- × MUST NOT mute Phase 1.5 judgment-call surfacing — populated `judgment_calls[]` pauses per `rq-autonomy01`

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Target Resolution

| Input | Behavior |
|-------|----------|
| Change-ID matching existing change | Resume from first incomplete gate |
| String not matching any change-id | Full pipeline via `/adv-task` contract (see Phase 0A) |
| No args | Error — autopilot requires a target |

Use `adv_change_list` to check if `$ARGUMENTS` matches an existing change-id.

### Phase 0A: Idea-String Entry (Full Pipeline)

When `$ARGUMENTS` does not match an existing change-id:

1. Read `.opencode/command/adv-task.md` as the contract source
2. Execute `/adv-task` phases inline with ONE replacement:
   - **Phase 0 Quick Contract** — REPLACED by autopilot delegation. The autopilot invocation IS the contract confirmation. Synthesize Quick Contract internally from the idea string + conversation context. Do NOT emit the `question` tool prompt.
3. After `/adv-task` completes (proposal + discovery + design + planning gates done), continue to Phase 2 below

## Phase 1: Autopilot Invocation

Record the delegation on the change:

```
adv_change_update(
  changeId: <id>,
  proposal: "## Autopilot Mode\n\napproved_mode: autopilot\nautopilot_invoked_at: <ISO8601>"
)
```

This sets `approval_mode: "autopilot"` and `autopilot_invoked_at` on the change record.

## Phase 2: Gate Loop — Routine Checkpoints

For each incomplete routine gate, read the corresponding sister command file and execute its phases inline with the following replacements:

### Phase 2.1: Proposal Gate

Read `.opencode/command/adv-proposal.md`. Execute inline.

- **Phase 1 confirmation** — REPLACED by autopilot delegation. Skip the inline approval prompt. Persist the proposal.
- Complete gate: `adv_gate_complete changeId: <id> gateId: proposal completedBy: "adv-autopilot" notes: "approved via /adv-autopilot at <ISO>"`

### Phase 2.2: Discovery / Agreement Gate

Read `.opencode/command/adv-discover.md`. Execute inline.

- **Phase 4.5.1 AC checkpoint** — REPLACED by autopilot delegation. Skip the inline approval prompt.
- **Phase 4.6 Persist Agreement** — persist as written, no inline approval prompt.
- **Open questions** — proceed without prompting; record unresolved questions in proposal.md as deferred-to-prep findings.
- Complete gate: `adv_gate_complete changeId: <id> gateId: discovery completedBy: "adv-autopilot" notes: "approved via /adv-autopilot at <ISO>"`

### Phase 2.3: Design Gate

Read `.opencode/command/adv-design.md`. Execute inline.

- **Phase 3.5 validator CONFLICT** — NOT replaced. If validator returns CONFLICT, STOP and surface to user per `rq-designval03`. Autopilot does NOT override CONFLICT.
- **Phase 4 design approval** — REPLACED by autopilot delegation, BUT ONLY if no real user-value tradeoffs exist AND no contract-compromise risk is present per `rq-autonomy01.6`. If either exists, STOP and surface to user.
- Complete gate: `adv_gate_complete changeId: <id> gateId: design completedBy: "adv-autopilot" notes: "approved via /adv-autopilot at <ISO>"`

### Phase 2.4: Planning / Prep Gate

Read `.opencode/command/adv-prep.md`. Execute inline.

- **Phase 5 user approval** — REPLACED by autopilot delegation. Pass `userApproved: true` with `approvalEvidence: "autopilot delegation per /adv-autopilot invocation"`.
- Complete gate: `adv_gate_complete changeId: <id> gateId: planning userApproved: true completedBy: "adv-autopilot" notes: "approved via /adv-autopilot at <ISO>"`

## Phase 3: Execution

Read `.opencode/command/adv-apply.md`. Execute inline.

- **Phase 1.5 judgment-call surfacing** — NOT replaced. If `judgment_calls[]` is populated with unresolved entries, surface via `question` tool per `rq-autonomy01` escape clause. This is a system interrupt, not a boundary approval.
- **Doom-loop recovery** — NOT replaced. After 3 failed task attempts, STOP and escalate via `question` tool.
- **Task execution** — proceed autonomously. No "shall I continue?" prompts between tasks per `rq-autonomy01.4`.

## Phase 4: Review + Acceptance

Read `.opencode/command/adv-review.md`. Execute inline.

- **Drift detection** — NOT replaced. If auto-fix boundary is exceeded, STOP and surface to user.
- **Acceptance approval** — REPLACED by autopilot delegation. Skip the inline approval prompt.
- Complete gate: `adv_gate_complete changeId: <id> gateId: acceptance completedBy: "adv-autopilot" notes: "approved via /adv-autopilot at <ISO>"`

## Phase 5: Harden (if findings)

Read `.opencode/command/adv-harden.md`. Execute inline only if review produced findings requiring hardening.

- **Drift detection** — NOT replaced. If auto-fix boundary is exceeded, STOP and surface to user.

## Phase 6: Archive Sign-Off (STOP HERE)

The autopilot run STOPS at this point. Archive sign-off is Tier B — it requires the user's explicit whitelist reply.

Emit the standard change report and Tier B archive sign-off prompt per `docs/command-voice-standard.md` § Inline Approval Voice:

```
## Change Report: {change-id}

### Gates
[✓ proposal] [✓ discovery] [✓ design] [✓ planning]
[✓ execution] [✓ acceptance] [○ release]

### What Was Built
{Summary from proposal + implementation}

### What Was Verified
- Tests: {pass/fail summary}
- Review: {verdict, finding count}

### Remaining Concerns
{Open items, or "None"}

---

> **{change-id}**
> acceptance ✓ → release

Reply `sign off` (or `signoff`, `approve`, `confirm`, `yes`, `proceed`, `ship it`) to archive,
or `dry run` to preview the archive without applying spec deltas,
or `cancel` / `stop` / `abort` to halt.
```

**Tier B parsing rules** (whitelist-only, no LLM fallback):
- Whitelist match → execute `/adv-archive` inline
- `dry run` / `dryrun` → `adv_change_archive dryRun: true`, re-prompt
- `cancel` / `stop` / `abort` → halt
- Anything else → re-prompt with same options

## System Interrupt Handling (Summary)

| Interrupt | Source | Behavior |
|-----------|--------|----------|
| Phase 1.5 judgment calls | `/adv-apply` Phase 1.5 | Pause, surface via `question` tool |
| Design validator CONFLICT | `/adv-design` Phase 3.5 | Pause, surface to user |
| Contract-compromise risk | `/adv-design` Phase 4.1 | Pause, surface to user |
| Doom-loop (3 retries) | `/adv-apply` retry protocol | Pause, surface via `question` tool |
| Drift detection | `/adv-review`, `/adv-harden` | Pause if auto-fix boundary exceeded |
| Cost-governance hardstop | `adv_investment_report` | Advisory note, proceed |

All interrupts fire inside phase workflows. Autopilot replaces only boundary approvals. Interrupts are NOT suppressed.
