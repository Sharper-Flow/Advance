---
name: adv-accept
description: Present deliverable summary and acceptance criteria checklist to user
---
# ADV Accept — Obtain Post-Execution Acceptance
Present the delivered work against the confirmed agreement and gather explicit user acceptance. This command completes the `acceptance` gate.
## Command Boundary
**Produces:** Acceptance decision, acceptance checklist results, and any requested follow-up before release hardening.

**× MUST NOT:** Complete non-owned gates, skip verification evidence, or bypass unresolved acceptance failures.

**Gate:** Completes `acceptance`.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---
## Phase 1: Pre-Acceptance Checks
- `adv_change_show`
- `adv_task_list`
- `adv_gate_status`

Verify execution work is complete enough to review. If implementation/execution work is still incomplete, stop and direct the user to `/adv-apply` first.

---
## Phase 2: Build Acceptance Summary
Using `agreement.md`, produce:
1. **Delivered work summary**
2. **Acceptance Criteria checklist**
3. **Constraints respected / avoidances honored**
4. **Outstanding caveats**
5. **Investment summary** (informational) — call `adv_investment_report changeId: {id}` and include a one-line summary: `Investment: N tasks / M retries / T min / tier: {auto|escalate|hardstop}`. Purely informational; does not gate acceptance.

Keep the summary concise and user-facing.

---
## Phase 3: Ask for Acceptance
Use the `question` tool to ask whether the delivered work satisfies the agreement.

Recommended options:
- Accept and continue (Recommended)
- Needs fixes before acceptance
- Re-open earlier gates via `adv_change_reenter` (scope expansion)

If the user requests fixes, do not complete the gate; route back to the appropriate workflow. If the user identifies new objectives or acceptance criteria that require scope expansion, use `adv_change_reenter` to reopen from the earliest affected gate before proceeding.

---
## Phase 4: Complete Gate
On acceptance:

`adv_gate_complete changeId: {change-id} gateId: acceptance`

---
## Output
Emit ACCEPTANCE COMPLETE with:
- target change
- accepted AC count
- remaining caveats, if any
```
/adv-accept {change-id} COMPLETE
Result: user acceptance recorded
Acceptance Gate: MARKED COMPLETE
Next: /adv-harden {change-id}
```
