---
name: adv-problem
description: "Triage issues before fixing or drafting a proposal"
---

<!-- manifest: adv-problem · requiresChangeId: false · scope: reads[specs, codebase] -->

# ADV Problem — Collaborative Issue Triage Before Fix

Investigate a bug, failure, or confusing behavior before deciding whether it is a trivial direct fix or proposal-sized change. Fully collaborative. Read-only with respect to ADV state.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** triage summary, evidence gathered, likely hypotheses, scope assessment, spec-law impact, and a next-step recommendation.

**× MUST NOT:** create change, create tasks, complete gates, or silently turn triage into fix implementation.

**Gate:** None.

## Exit Paths

| Exit                    | Condition                                                               |
| ----------------------- | ----------------------------------------------------------------------- |
| ✅ Direct-fix candidate | Evidence suggests a trivial fix and user explicitly approves fixing now |
| ✅ Proposal candidate   | Scope looks larger, riskier, or more systemic                           |
| 🔄 Need more info       | Triage narrowed the issue, but evidence is still incomplete             |
| 🛑 Stop here            | User chooses to stop after triage                                       |

## Direct-Fix Guardrails

Only treat the outcome as a direct-fix candidate when all are true:

- no more than 2 files likely touched
- no spec changes
- no cross-repo work
- no breaking API / contract change
- no new dependency
- user explicitly approves moving from triage to fix work

If any guardrail fails, the next step is `/adv-proposal`, not direct fix.

Direct-fix outcome is a handoff outcome only. `/adv-problem` does not own the fix implementation and must not route that work into `/adv-apply`.

## Spec-Law Impact Assessment

When triage clarifies expected durable product/system behavior, the summary MUST include **Spec-law impact**:

- **Spec-law change required** — route to `/adv-proposal` with a draft spec-delta obligation.
- **No spec law update required** — direct fix remains allowed only when all direct-fix guardrails pass; state the rationale explicitly.
- **Uncertain** — When spec-law impact is uncertain, prefer proposal-sized routing via `/adv-proposal`, not direct fix.

`/adv-problem` remains read-only: it MUST NOT create changes, tasks, gates, or spec deltas directly.

---

## Phase 1: Gather Problem Signal

1. Restate reported issue.
2. Capture symptoms, observed behavior, expected behavior, frequency, environment, and known recent changes.
3. Ask for the strongest available evidence first: error text, reproduction steps, affected paths, screenshots/logs, or scope clues.

## Phase 2: Triage Loop

Use `question` tool only.

- Ask 1-2 focused questions per turn.
- Prefer narrowing questions over broad speculation.
- Summarize what is known, unknown, and ruled out.
- Use targeted local investigation when it will materially reduce uncertainty.

Useful prompts:

- "What exactly did you expect instead?"
- "Can you reproduce it reliably?"
- "What changed shortly before this started?"
- "Does this affect one path or many?"

## Phase 3: Scope Assessment

Classify the issue as one of:

- **trivial direct-fix candidate** — narrow, low-risk, guardrails satisfied
- **proposal-sized fix** — unclear root cause, wider surface area, systemic behavior, or uncertain spec-law impact
- **needs more evidence** — not enough signal yet

Do not over-call triviality. When uncertain, prefer proposal-sized fix.

## Phase 4: Next-Step Decision

When triage reaches a clear branch, ask via `question` tool:

- If trivial direct-fix candidate:
  - **Fix now (Recommended)**
  - **Write proposal instead**
  - **Stop after triage**
- If proposal-sized fix:
  - **Create proposal (Recommended)**
  - **Keep investigating**
  - **Stop after triage**

If user chooses fix-now, hand off to normal fix work outside this command. Do not create ADV artifacts unless user chooses proposal path.

## Output

Always emit a compact triage summary:

- Reported issue
- Evidence gathered
- Leading hypothesis / ruled-out paths
- Scope assessment
- Spec-law impact
- Suggested next command or action

## Anti-Patterns

- × jumping into implementation before triage outcome is clear
- × calling something trivial without checking guardrails
- × creating ADV change state during triage by default
- × routing direct-fix work into `/adv-apply`
