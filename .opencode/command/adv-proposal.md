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
> <UserRequest>
> $ARGUMENTS
> </UserRequest>

## Pre-flight

1. **Verify ADV tools are live** — call `adv_status` once. If it returns `ADV_PLUGIN_INIT_FAILED`, stop immediately, report the `error` + `remediation` fields verbatim, and ask the user how to proceed. × Do NOT self-block by declaring adv_* tools "unavailable" based on prior assumption — verify first.
2. Resolve summary from `$ARGUMENTS` or derive a 2-5 word summary from the conversation
3. `adv_change_list` → detect overlapping changes; reuse/reference an obvious existing match, ask only if overlap is still ambiguous
4. Read any `./temp/brainstorm-*.md` notes if present

---
## Phase 1: Problem Statement Agreement
Before creating artifacts:
1. Extract agreed facts, decisions, rejected approaches, open questions, and constraints from the conversation
2. Synthesize a concise problem statement with desired outcome and expected scope
3. Ask the user to confirm whether that framing matches the intended outcome
4. If drift is reported → revise and re-confirm; if aborted → stop with no artifacts
---

## Phase 1b: Knowledge Gap Analysis

After the problem statement is confirmed, before building the proposal:

1. Identify what you **don't know** — unknowns, missing context, assumptions being made, areas where your knowledge may be stale or incomplete
2. Surface these as an explicit list organized by category:
   - **Codebase unknowns** — relevant code paths, patterns, or conventions not yet inspected
   - **Ecosystem unknowns** — current state of tools, libraries, or approaches that may be involved; maintenance health, sentiment, LBP alternatives (per P27)
   - **Domain unknowns** — business logic, user expectations, or constraints the user hasn't stated
   - **Integration unknowns** — how this change interacts with other systems, APIs, or active changes
3. For each unknown, note whether it can be resolved now (quick check) or deferred to `/adv-discover`
4. Resolve any quick-check items inline (e.g. `lgrep` for codebase questions, `adv_spec` for spec questions)
5. Carry unresolved unknowns forward as **Discovery Agenda** items in the proposal — these become explicit inputs for `/adv-discover`

> **Principle:** Never make recommendations based on assumed context. If you haven't verified it, flag it.

---
## Phase 2: Full Proposal
After confirmation:
1. `adv_change_create` with the confirmed problem statement as `## Why`
2. Infer change type autonomously from the problem statement + current codebase
3. Use `adv_spec` list/show/search to determine affected capabilities and whether a new capability/spec is required
4. Fill proposal sections: What Changes, Success Criteria, Affected Code, Related Repositories, Constraints, Impact, Context, Discovery Agenda (unresolved unknowns from Phase 1b)
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
