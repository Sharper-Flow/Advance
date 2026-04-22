---
name: adv-proposal
description: "Extract problem statement, success criteria, and constraints without creating tasks"
phaseGoal: "Clarify the problem, user needs, and acceptance criteria scope. Establish what and why — no how."
---
<!-- manifest: adv-proposal · gate: proposal · requiresChangeId: false · scope: reads[specs] -->

# ADV Proposal — Establish the Problem Statement

Two-phase workflow: Phase 1 (problem statement agreement) → Phase 2 (full proposal with INVEST criteria and smell detection). **Fully collaborative** — the user shapes every decision.

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

### Cross-Project Follow-up Proposals

When creating a change in a **different project** (e.g. pokeedge backend creating a follow-up in pokeedge-web):

1. Pass `target_path` to `adv_change_create` with the absolute path to the target project directory
2. Optionally pass `source_project` (auto-detected from current store if omitted) and `source_change_id` to link back to the originating change
3. The tool automatically:
   - Opens a temporary store for the target project
   - Creates the change there with a `## Cross-Project Origin` section in proposal.md
   - Persists `cross_project_origin` metadata on the change for traceability
4. The change is created in the target project's ADV state — not the current project's
5. The target project's agent picks it up via `/adv-discover` and validates the origin before proceeding

**Minimum required:** `target_path`. Strongly recommended: `source_change_id` for full traceability.
---

## Step 9: Proposal Approval

Present the completed proposal summary to the user for final approval via `question` tool:

- **Approve proposal (Recommended)** — proposal is finalized; agent immediately proceeds inline to `/adv-research` (or `/adv-discover` if research was already completed) without asking for a second confirmation
- **Request changes** — user wants to adjust criteria, scope, or constraints (loop back to relevant step)
- **Cancel** — abandon the proposal

If **Request changes**: collect specific feedback → apply changes via `adv_change_update` → re-present → re-ask.

× MUST NOT mark the proposal complete without explicit user approval.

---

## Output

Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
Agreed problem framing + scope boundary.

## Delivered
- Change {change-id} created
- Problem statement confirmed
- Discovery agenda captured

---
**{change-id}** · proposal ✓ → discovery · `/adv-discover {change-id}`
```

**Auto-continue:** After user approval, immediately begin `/adv-research` (or `/adv-discover`) inline. Do not stop, do not ask "shall I proceed?" — the user's approval is the go-ahead.
