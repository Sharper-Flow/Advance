---
name: adv-proposal
description: Extract problem statement and confirm with user before proceeding
---
# ADV Proposal — Establish the Problem Statement
Lead with problem statement agreement, then create the initial change scaffold. This command owns the `proposal` gate and hands off to `/adv-discover`.
## Command Boundary
**Produces:** Confirmed problem statement, initial change scaffold, and the proposal artifact needed to begin discovery.

**× MUST NOT:** Create tasks (`adv_task_add`), complete non-owned gates, make implementation decisions, or decompose work into tasks.

**Gate:** Completes `proposal`.

> **CHECKLIST**: Follow [docs/checklists/proposal-checklist.md](../../docs/checklists/proposal-checklist.md).
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Pre-flight
1. Resolve summary from `$ARGUMENTS` or derive a 2-5 word summary from the conversation
2. `adv_change_list` → detect overlapping changes; reuse/reference an obvious existing match, ask only if overlap is still ambiguous
3. Read any `./temp/brainstorm-*.md` notes if present

---
## Phase 1: Problem Statement Agreement
Before creating artifacts:
1. Extract agreed facts, decisions, rejected approaches, open questions, and constraints from the conversation
2. Synthesize a concise problem statement with desired outcome and expected scope
3. Ask the user to confirm whether that framing matches the intended outcome
4. If drift is reported → revise and re-confirm; if aborted → stop with no artifacts

---
## Phase 2: Full Proposal
After confirmation:
1. `adv_change_create` with the confirmed problem statement as `## Why`
2. Infer change type autonomously from the problem statement + current codebase
3. Use `adv_spec` list/show/search to determine affected capabilities and whether a new capability/spec is required
4. Fill proposal sections: What Changes, Success Criteria, Affected Code, Related Repositories, Constraints, Impact, Context
5. Determine cross-repo scope autonomously from code paths/interfaces/config; ask only if boundary ambiguity changes the intended outcome
6. Run the proposal checklist quality gate; refine autonomously unless refinement would change confirmed intent
7. `adv_change_update` with the completed proposal
8. `adv_gate_complete gateId: proposal`

---
## Output
Emit CHANGE CREATED with change ID, title, draft status, created artifacts, and the confirmed problem framing.
```text
/adv-proposal COMPLETE
Result: Change <change-id> created
Gate: proposal ✓
Next: /adv-discover <change-id>
```
