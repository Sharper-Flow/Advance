---
name: adv-agree
description: Present objectives and constraints for user acceptance
---
# ADV Agree — Confirm Shared Objectives
Present the discovery output back to the user and turn confirmed objectives, constraints, avoidances, and acceptance criteria into `agreement.md`. This command is part of the discovery stage; the `discovery` gate is completed by `/adv-discover`.
## Command Boundary
**Produces:** `agreement.md` with shared objectives, AC, constraints, avoidances, and user sign-off.

**× MUST NOT:** Create tasks, complete gates, or introduce new architecture decisions that belong in `/adv-design`.

**Gate:** None — `/adv-discover` owns `discovery`.

**Human checkpoint:** This command pauses for user-facing outcome questions only (priorities, behavior, downsides, AC boundaries). Technical/implementation questions are resolved autonomously via LBP research. See § Phase 2.5 for triage rules.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---
## Phase 1: Load Discovery Context
- `adv_change_show`
- confirm discovery findings exist and are current
- extract objectives, constraints, avoidances, open questions, and draft acceptance criteria

If discovery work is missing or obviously stale → stop and run `/adv-discover` first.

---
## Phase 2: Present Agreement Draft
Present a concise agreement view:
- **Objectives**
- **Acceptance Criteria**
- **Constraints**
- **Avoidances / rejected approaches**
- **Open questions** (listed explicitly — these will be resolved in Phase 2.5)
- **Investment snapshot** (informational) — call `adv_investment_report changeId: {id}` and include a one-line summary: `Investment: N tasks / M retries / T min / tier: {auto|escalate|hardstop}`. Purely informational; does not gate agreement.

Ask for explicit user confirmation or edits using the `question` tool.

Recommended options:
- Confirm agreement
- Revise objectives/criteria
- Revise constraints/avoidances

---
## Phase 2.5: Open Question Resolution Loop
**× MUST NOT skip this phase.** Open questions that require user input must be resolved before the agreement is finalized. Do not assume the user has no preference — ask.
### Question Triage
Before presenting questions to the user, classify each open question from discovery:
| Category | Action | Example |
|----------|--------|---------|
| **Technical / implementation** | Agent resolves via LBP research | "Which hashing algorithm?", "SQL vs NoSQL?", "Middleware vs decorator pattern?" |
| **User-facing outcome** | **Ask the user** | "What should happen when X fails?", "Which matters more: speed or completeness?", "Should this be opt-in or opt-out?" |

**Ask the user about:**
- Weighing competing priorities ("Fast iteration vs. comprehensive coverage?")
- Choosing between acceptable downsides ("Slightly slower but safer, or faster with manual fallback?")
- Clarifying expected behavior ("What should the user see when…?")
- Defining acceptance boundaries ("How many is 'too many'? What latency is acceptable?")
- Scoping intent ("Should this cover edge case X, or is that out of scope?")
- Preference on UX/workflow ("Should this prompt for confirmation, or act immediately?")

**× Do NOT ask the user about:**
- Which technology, library, or pattern to use — research and decide via LBP
- Implementation strategy (option A vs B) — choose the objectively better approach
- Internal architecture — that's `/adv-design`'s job
- Questions the agent can answer from specs, codebase, or documentation

Technical questions that were open during discovery should be resolved autonomously by the agent (via Context7, lgrep, Kagi, specs, codebase inspection) and recorded as agent-resolved decisions in the agreement. If a technical question has genuine LBP ambiguity with user-value tradeoffs, reframe it as the downstream outcome question instead of the technical choice (e.g., not "REST vs GraphQL?" but "Do you need clients to fetch partial data, or is full-resource fetching fine?").
### Minimum Engagement Rule
The agent **MUST** always conduct at least **1 round of 3 clarifying questions**, even if discovery surfaced zero open questions. There are always assumptions to validate, edge cases to probe, and acceptance boundaries to sharpen. If discovery was thorough, the first round focuses on confirming and tightening — not rehashing.

The agent **MAY** conduct up to **5 rounds** total, with up to **5 questions per round**.
| Constraint | Value |
|------------|-------|
| Minimum rounds | 1 |
| Minimum questions in first round | 3 |
| Maximum rounds | 5 |
| Maximum questions per round | 5 |

Stop the loop when: all user-facing questions are resolved, the user signals satisfaction, or the 5-round cap is reached.
### Protocol
1. **Collect** all open questions from discovery findings (Phase 1 extraction)
2. **Triage** each question per the table above
3. **Resolve technical questions** autonomously — research LBP answers, record decisions
4. **Round 1 (mandatory):** Present at least 3 user-facing questions. If discovery produced fewer than 3 user-facing questions, the agent must generate additional clarifying questions by probing assumptions, edge cases, or acceptance boundaries from the proposal and discovery findings.
5. **Subsequent rounds (as needed):** For each remaining user-facing question, or new questions surfaced by prior answers, present up to 5 questions per round.
   - Present questions framed around outcomes, behavior, or priorities — not technical internals
   - Use the `question` tool with concrete options where possible, always with write-in enabled
   - Record the user's answer
6. **Loop** until all user-facing questions have a user-provided answer or an explicit user deferral, or the 5-round cap is reached
7. **Summarize** all resolutions (both agent-resolved and user-resolved) back to the user before proceeding
### Deferral Rules
A user may explicitly defer a question — but deferral must be an active choice, never a default:
- If the user chooses to defer → record it as "Deferred by user: {reason}" in the agreement
- Deferred questions carry forward as constraints for `/adv-design` (the design phase must either resolve them or propose a design that works regardless of the answer)
- × NEVER silently defer a question or assume "no preference" without asking
### Question Presentation
For each user-facing question, provide:
| Element | Required |
|---------|----------|
| The question, framed as outcome/behavior/priority | Yes |
| Why it matters (impact on what the user will experience) | Yes |
| Agent's recommended answer, if one exists | When applicable |
| Concrete options framed as tradeoffs, not tech choices | When the question has enumerable answers |
| Visual comparison block before `question` | When side-by-side context materially helps user judgment |
| Write-in option | Always (per P26) |

Visual comparison blocks are supplementary context, not a replacement for the `question` tool. Use text-first formats (tables, boxed comparisons, lightweight text wireframes), keep screenshots optional with text fallback, and keep the displayed option set aligned with the final `question` options.
### Batch Guidance
- Group related questions (e.g., two questions about the same user-facing behavior)
- Up to 5 questions per round via the `question` tool (multiple questions in a single invocation are fine)
- Unrelated questions should be separate prompts within the same round
- For layout / workflow / tradeoff questions that are hard to judge from prose alone, show a compact comparison block before asking the `question`

---
## Phase 3: Persist Agreement
Once confirmed and all open questions are resolved (or explicitly deferred), write `agreement.md` through `adv_change_update`.

Suggested structure:
```md
# Agreement
## Objectives
## Acceptance Criteria
## Constraints
## Avoidances
## Decisions
### User Decisions
### Agent Decisions (LBP)
## Deferred Questions
## Sign-Off
```
- **User Decisions** — questions the user answered, each with the question, the user's choice, and why it matters
- **Agent Decisions (LBP)** — technical questions the agent resolved autonomously via research, each with the question, chosen answer, and rationale
- **Deferred Questions** — only questions the user explicitly chose to defer, with stated reason and design-phase implications
- If no questions were deferred, omit the "Deferred Questions" section
- × Do NOT include a generic "Open Questions" section — every question must be categorized as user-decided, agent-decided, or explicitly deferred

Do not complete any gate here.

---
## Output
Emit AGREEMENT RECORDED with:
- target change
- confirmed objectives
- AC count
- user decisions count
- agent decisions count
- deferred count (if any)
```
/adv-agree {change-id} COMPLETE
Result: agreement.md recorded ({N} user decisions, {M} agent decisions, {K} deferred)
Next: /adv-design {change-id}
```
