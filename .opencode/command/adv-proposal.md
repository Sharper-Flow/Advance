---
name: adv-proposal
description: "Extract problem statement, user outcomes, and constraints without creating tasks"
phaseGoal: "Clarify the problem, user needs, and high-level user outcomes. Establish what and why — no engineering AC and no how."
---

# ADV Proposal — Establish the Problem Statement

Two-phase workflow: Phase 1 (problem statement agreement) → Phase 2 (full proposal with implementation-free User Outcomes and ambiguity scan). **Fully collaborative** — user shapes every decision. Proposal does NOT require testable success criteria; discovery firms engineering AC/SC.

## Command Boundary

**Produces:** Confirmed problem statement, initial change scaffold, and proposal artifact needed to begin discovery.

**× MUST NOT:** Create tasks (`adv_task_add`), complete non-owned gates, make implementation decisions, or decompose work into tasks.

**Gate:** Completes `proposal`.

> <UserRequest>
> $ARGUMENTS
> </UserRequest>

## Pre-flight

1. **Verify ADV tools are live** — call `adv_status` once. If it returns `ADV_PLUGIN_INIT_FAILED`, stop immediately, report the `error` + `remediation` fields verbatim, and ask user how to proceed. × Do NOT self-block by declaring adv\_\* tools "unavailable" based on prior assumption — verify first.
2. **Resolve summary from `$ARGUMENTS`**:
   - **Issue-origin path (`#N` positional)** — if the first token in `$ARGUMENTS` matches `/^#(\d+)\b/` (rq-issueChangeLinkage01):
      - Run `gh issue view <N> --json title,body,labels,number,state`. On non-zero exit, abort with the exact stderr + hint to run `gh auth status` and verify the issue exists. Do **not** create a partial change.
      - Use the issue title as change summary if no other summary was supplied. Use the issue body as the basis for the Phase 1 problem statement synthesis.
      - At Phase 2 `adv_change_create`, pass `origin_kind: 'triage'` and `origin_issue_number: N`. The created change is now linked to issue `#N` via `change.origin.issue_number`. (Note: `origin_kind: 'roadmap'` is retired for new writes; preserved only as readable legacy provenance for archived changes.)
      - **rq-backlogCoord02 / rq-backlogCoord03 — Claim handling:** `adv_change_create` performs a pre-create disk read of active changes (`listIssueClaims`) filtered by `origin.issue_number`. On an existing claim it returns `CLAIM_CONFLICT` with `existing_change_id` / `existing_change_status`. Surface the conflict to the user and offer: (a) resume the existing change via `/adv-apply <existing_change_id>`, (b) omit `origin_issue_number` to create independently, or (c) cancel. A post-create re-check after ~5s emits `warning: CLAIM_RACE_DETECTED` with `race_change_ids`; it is best-effort and does not roll back.
      - Surface issue title + labels + state in the resulting change context output.
   - **Standard path** — otherwise derive a 2-5 word summary from `$ARGUMENTS` or the conversation. No origin set (legacy / `adhoc` semantics).
   - **Epic shell path** — if the user asks to promote a shell entry from an existing Epic, use `adv_change_update` to transition the shell to an active change after Phase 2 change creation, replacing the shell row with exactly one linked change row. The new change carries the shell's title and success hint as promotion provenance; set `origin.kind` as appropriate for the resulting change. Shell entries do not need full ADV proposal/discovery before promotion.
3. `adv_change_list` → detect overlapping changes; reuse/reference an obvious existing match, ask only if overlap is still ambiguous
4. Read any `./temp/brainstorm-*.md` notes if present
5. **Defect-origin detection (rq-defectOriginRca01)** — classify the request origin before Phase 1:
   - **Defect triggers** (route to `/adv-problem` first OR attach RCA inline): "fix X", "X is broken", "X fails when", "X doesn't work", "bug in X", "error in X", "regression in X", "X crashes", "X is wrong", "defect in X"
   - **Non-defect triggers** (proceed normally): "add X", "build X", "support X", "refactor X", "improve X", "optimize X", "migrate X", "create X", "design X"
   - **Fallback rule:** unintended behavior → defect; desired new behavior → not defect; ambiguous → default to defect (conservative routing per rq-defectOriginRca01.3)
   - **If origin = defect:** the proposal MUST carry a `## Root Cause Analysis` section in the proposal artifact (`change.documents.proposal`) before the proposal gate completes. Persist it with `adv_change_update proposal`. RCA shape (reuses `/adv-problem` output):
     ```md
     ## Root Cause Analysis

     **Defect origin:** {brief description of unintended behavior}

     **Evidence gathered:**
     - Tier 1 (local): {findings}
     - Tier 2 (external): {findings or "not applicable"}

     **Leading hypothesis:** {root cause}
     **Ruled-out paths:** {alternatives considered and rejected}

     **Spec-law impact:** {per /adv-problem Phase 5 assessment}

     —

     **Bypass rationale (if RCA produced inline rather than via /adv-problem):**
     {one sentence explaining why /adv-problem was not used}
     ```
   - **If origin = non-defect:** proceed normally; RCA not required.
   - Enforcement is advisory (matches rq-problemSpecLaw01 tier; no runtime hard-block).

### Product-linked preflight

If `project.json` has `product`, mention product-linked context in proposal: current repo id, primary repo id, likely affected repos, and legacy state behavior. Do not choose `scope_repos` yet unless user already gave explicit repo scope; carry repo-scope uncertainty into discovery.

---

## Phase 1: Problem Statement Agreement

Before creating artifacts:

1. Extract agreed facts, decisions, rejected approaches, open questions, and constraints from the conversation
2. Synthesize a concise problem statement with desired outcome and expected scope
3. Ask the user to confirm whether that framing matches the intended outcome
4. If drift is reported → revise and re-confirm; if aborted → stop with no artifacts

---

## Phase 1b: Knowledge Gap Analysis

After the problem statement is confirmed, before building proposal:

1. Identify what you **don't know** — unknowns, missing context, assumptions being made, areas where your knowledge may be stale or incomplete
2. Surface these as an explicit list organized by category:
   - **Codebase unknowns** — relevant code paths, patterns, or conventions not yet inspected
   - **Ecosystem unknowns** — current state of tools, libraries, or approaches that may be involved; maintenance health, sentiment, LBP alternatives (per P27)
   - **Domain unknowns** — business logic, user expectations, or constraints user hasn't stated
   - **Integration unknowns** — how this change interacts with other systems, APIs, or active changes
3. For each unknown, note whether it can be resolved now (quick check) or deferred to `/adv-discover`
4. Resolve any quick-check items inline (e.g. `lgrep` for codebase questions, `adv_spec` for spec questions)
5. Carry unresolved unknowns forward as **Discovery Agenda** items in proposal — these become explicit inputs for `/adv-discover`

> **Principle:** Never make recommendations based on assumed context. If you haven't verified it, flag it.

---

## Phase 2: Full Proposal

After confirmation:

1. `adv_change_create` with the confirmed problem statement as `## Why`
2. Infer change type autonomously from the problem statement + current codebase
3. Use `adv_spec` list/show/search to determine affected capabilities and whether a new capability/spec is required
4. Fill proposal sections: What Changes, User Outcomes, Affected Code, Related Repositories, Constraints, Impact, Context, Discovery Agenda (unresolved unknowns from Phase 1b)
   - `## User Outcomes` captures high-level user-perspective outcomes only: what the user needs delivered, stated implementation-free.
   - × Do NOT write engineering acceptance criteria or testable success criteria here. Defer AC/SC firming to `/adv-discover`.
5. Determine cross-repo scope autonomously from code paths/interfaces/config; ask only if boundary ambiguity changes the intended outcome
6. Run proposal checklist quality gate; refine autonomously unless refinement would change confirmed intent
7. **Phase 2.5: Build Scope Section** — Build `## Scope` section in the proposal artifact (`change.documents.proposal`) with `### In Scope`, `### Out of Scope`, and `### Must Not` subsections, persisting via `adv_change_update proposal`. Must Not captures negative constraints — things the implementation must actively avoid even within scope. `"None identified"` is valid content. Surface to user inline if In Scope or Out of Scope are empty or missing — block gate completion until populated. Missing Must Not produces HIGH finding but does NOT block gate. Backwards-compat: if proposal gate already done (re-entry case), skip rebuilding (treat as legacy).
8. **Phase 2.6: Run B/F/S Ambiguity Scan** — Read full proposal content via `adv_change_show include.proposal`. Apply 3-category scan per `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy`:
   - B (Boundaries) — check for `### Out of Scope` content and `### Must Not` subsection. Missing Must Not → HIGH finding (does NOT block gate). `"None identified"` accepted as valid content.
   - F (Functional Scope) — check that `## User Outcomes` exists and is implementation-free; this does NOT require testable success criteria
   - S (Completion Signals) — check for vague/unmeasurable language in the proposal and Discovery Agenda
   - Emit findings inline in proposal output (not persisted as section unless any CRITICAL)
   - × MUST NOT call `adv_gate_complete gateId: 'proposal'` if any CRITICAL B/F/S finding exists (agent honor-system rule per KD1; v2 may add machine enforcement)
   - × MUST NOT fabricate evidence quotes — every finding cites verbatim text from the proposal content returned as `_proposal` or `(no {section} section)`
   - Skip scan if `clarify_enforcement: 'off'`

   See `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy` for finding shape, severity rules, and trigger threshold.

9. `adv_change_update` with the completed proposal
10. `adv_gate_complete gateId: proposal`

### Cross-Project Follow-up Proposals

When creating change in a **different project** (e.g. example-product backend creating a follow-up in example-web):

1. Pass `target_path` to `adv_change_create` with the absolute path to target project directory
2. Optionally pass `source_project` (auto-detected from current store if omitted) and `source_change_id` to link back to the originating change
3. The tool automatically:
   - Opens a temporary store for target project
   - Creates change there with a `## Cross-Project Origin` section in the proposal artifact (`change.documents.proposal`)
   - Persists `cross_project_origin` metadata on change for traceability
4. Change is created in target project's ADV state — not current project's
5. Target project's agent picks it up via `/adv-discover` and validates the origin before proceeding

## **Minimum required:** `target_path`. Strongly recommended: `source_change_id` for full traceability.

## Step 9: Proposal Approval (Inline)

Present the completed proposal summary, then emit the **Inline Approval prompt (Tier A)** per `docs/command-voice-standard.md` § Inline Approval Voice. The Gate Handoff Voice spine footer extends with reply instructions — no `question` tool popup.

After the spine footer line:

```
Reply `continue` to proceed, or reply with what to adjust.
```

**Reply parsing (Tier A):**

| Reply                  | Action                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| Tier A whitelist match | Proceed inline immediately to next stage                                       |
| `/adv-X` slash command | No-op for this agent — OpenCode dispatches                                     |
| Free-form text         | Treat as revision request; collect feedback → `adv_change_update` → re-present |
| `stop` / `defer`       | Halt; do not advance gate                                                      |
| Ambiguous              | LLM judgment classifies into approve / revise / redirect / stop / unclear      |

× MUST NOT mark proposal complete without an explicit user reply matching the Tier A whitelist or LLM-classified `approve`. Invocation is NOT implicit approval.

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
- User Outcomes captured
- Discovery agenda captured

---

> **{change-id}**
> proposal ✓ → discovery
>
> → `/adv-discover {change-id}`
```

**Auto-continue:** After user reply matches the Tier A whitelist (or LLM classifies as `approve`), immediately begin `/adv-research` (or `/adv-discover`) inline. Do not stop, do not ask "shall I proceed?" — the inline approval is the go-ahead.
