---
name: adv-discover
description: Gather context, analyze current state, identify objectives, and obtain user agreement
---

# ADV Discover — Establish Discovery Findings

Gather the current-state evidence needed to move from proposal into a shared agreement. This command completes the `discovery` gate and carries the full user-facing discovery + agreement flow.

> **CHECKLIST**: Follow [docs/checklists/discover-checklist.md](../../docs/checklists/discover-checklist.md).

## Command Boundary

**Produces:** Discovery findings, current-state analysis, blocker/options summary, recommended objectives for agreement, and `agreement.md`.

**× MUST NOT:** Create tasks, complete non-discovery gates, skip LBP validation when multiple viable directions exist.

**Gate:** Completes `discovery`.
<UserRequest>
$ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain
3. If none exist → stop and suggest `/adv-proposal`

---
## Phase 0: Embedded Methodology

### Discover Methodology

#### Purpose

Reusable discovery methodology for ADV discover workflows. Provides the protocol step overview and constraints.

**Canonical source:** `docs/checklists/discover-checklist.md` — see that checklist for detailed rules per step, edge case handling, and output section schema. Do not duplicate its content here.

#### Discovery Protocol (8 Steps)

Every `/adv-discover` invocation must execute these 8 protocol steps and emit a Discovery Checklist section summarizing their results:

| # | Step | Output section | Required content |
| - | ---- | -------------- | ---------------- |
| 1 | **Skill Discovery** (Phase 1.5) | Skills Considered | Examined skills + match results (or "none available") |
| 2 | **Prior Research Extension** | Extends | Cited artifacts (including `/adv-improve` research packs under `docs/*-prep.md`) + ≥1 new finding (or "No prior research found") |
| 3 | **Conflict & Related-Work Scan** (Phase 1.6) | Conflict Scan | Results from `adv_change_list` (includeArchived), `adv_change_validate`, `adv_agenda_list` |
| 4 | **Edge Case Investigation** | Edge Cases | ≥2 edge cases per gap (or "N/A: structural" with rationale) |
| 5 | **Design Question Depth** | Open Design Questions | Each question annotated with trust model, blast radius, alternatives |
| 6 | **Draft Spec Delta Shapes** | Draft Spec Deltas | `rq-*` IDs + ≥1 G/W/T per delta (or "No spec deltas required") |
| 7 | **P25 Related-Pattern Scan** (Phase 1.7) | Related Pattern Scan | Similar patterns or "no similar patterns found" |
| 8 | **LBP Check (with gated External-Solution Check)** | LBP Check | Whether likely direction matches long-term best practice |

After all 8 steps, emit a **Discovery Checklist** table listing each step with PASS/SKIP + reason.

#### Constraints

- **Read-only guidance** — this methodology block does not mutate ADV state
- **No gate completion** — the command owns the discovery gate
- **Canonical source** — defer to `docs/checklists/discover-checklist.md` for detailed rules
- **No workflow sequencing** — the command owns phase ordering
- **No architecture decisions** — those belong in `/adv-design`
---

## Phase 1: Load Context

- `adv_change_show` for the target change
- `adv_gate_status` to confirm proposal is already complete
- `adv_spec action: "list"` and `adv_spec action: "show"` for affected capabilities
- Use `lgrep`/`read` to inspect the relevant code paths, interfaces, and constraints

If the proposal gate is still pending → stop and direct the user to `/adv-proposal` first.

### Phase 1.0: Cross-Project Origin Validation

If `adv_change_show` reveals a `cross_project_origin` field on the change:

1. **Confirm the origin is valid** — verify that `source_path` points to a real project and `source_project` matches a known project
2. **Trace the source change** — if `source_change_id` is set, report it to the user so they can confirm the originating context is relevant
3. **Present origin summary** — surface the origin details to the user for confirmation:
   - "This change was created as a follow-up from **{source_project}** (change: {source_change_id}). Does this context match your expectations?"
4. **If origin is invalid or unexpected** → flag as a blocking finding; the agent should not proceed with agreement until the user confirms
5. **If no origin** → skip this phase (local change, normal flow)

> **Gate requirement:** Cross-project origin MUST be validated and confirmed by the user before proceeding to agreement. This prevents stale or misdirected follow-up changes from being adopted blindly.

---
## Phase 1.5: Skill Discovery
Execute the skill discovery protocol from `ADV_INSTRUCTIONS.md § Skill Discovery Protocol`:
1. Search trusted skill directories: `~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`
2. Read YAML frontmatter from each `SKILL.md`
3. Match `keywords` against the change's tech stack and domain
4. Load matching skills via `skill("{name}")`
5. Apply guidance from loaded skills

**Output:** "Skills Considered" section listing each examined skill, match assessment, and action taken.

**Graceful degradation:**
- No skills in trusted directories → report "Skills considered: none available" (non-blocking)
- Malformed YAML frontmatter → skip silently
- Multiple matches → load all matching skills
- No matches → proceed normally, report "no skills matched"
---

## Phase 1.6: Conflict & Related-Work Scan

Execute all three tools and report findings in a "Conflict Scan" section:

1. `adv_change_list includeArchived: true` → surface related active and archived changes
2. `adv_change_validate` on the target change → note that own-change pre-prep warnings (NO_TASKS, NO_DELTAS) are expected and should NOT be reported as conflicts
3. `adv_agenda_list` → check for overlapping agenda items

For relevant archived changes, use `adv_change_show` to inspect their tasks and decisions. Prior work may inform or constrain the current proposal.

---
## Phase 1.7: P25 Related-Pattern Scan
Per rule P25 (related-scan): identify the class of bug or gap being addressed, then scan for similar patterns elsewhere in the codebase.

**Output:** "Related Pattern Scan" section listing similar patterns with file references, or explicitly stating "no similar patterns found".
- Zero matches → state explicitly (do not silently omit the section)
- Many matches → cap at top N with rationale
- Matches in deprecated/archived code → filter and note
---

## Phase 2: Discovery Analysis

Build a compact discovery report. The output MUST contain these sections (order flexible):

### Required Output Sections

| Section                    | Required content                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| **Discovery Checklist**    | Table of all protocol steps with PASS/SKIP + reason                                         |
| **Skills Considered**      | Examined skills with match assessment (from Phase 1.5)                                      |
| **Extends**                | Prior research artifacts cited + ≥1 new finding per artifact (or "No prior research found") |
| **Conflict Scan**          | Results from Phase 1.6 (or "no conflicts")                                                  |
| **Current State**          | What exists today in code/specs/docs                                                        |
| **Edge Cases**             | ≥2 per identified gap (or "N/A: structural" with rationale)                                 |
| **Open Design Questions**  | Each with trust model + blast radius + alternatives considered                              |
| **Draft Spec Deltas**      | `rq-*` IDs + ≥1 Given/When/Then per delta (or "No spec deltas required" with rationale)     |
| **Related Pattern Scan**   | Results from Phase 1.7                                                                      |
| **LBP Check**              | Whether likely direction matches long-term best practice                                    |
| **Recommended Objectives** | Numbered list for the agreement phase                                                       |

### Prior Research Extension

Search these locations for prior artifacts:

- `temp/*.md` — brainstorm or prep documents
- `docs/*-prep.md` — research packs (including `/adv-improve` output). These contain pre-vetted competitors, alternatives, and emerging patterns that MUST be cited before running any new external searches on the same domain.
- Archived changes — `adv_change_list includeArchived: true` → inspect relevant archives

**Rules:**

- Cite each found artifact in the "Extends" section
- For `/adv-improve`-style research packs, explicitly cite the `Competitors & Alternatives`, `Emerging Patterns`, and `Applicability to This Repo` sections when they are relevant to the discovery's open design questions
- Add ≥1 new finding not present in the cited artifact
- Do NOT count the change's own `proposal.md` as "prior research" (self-referential)
- No prior artifacts → report "No prior research found" (non-blocking). If the discovery agenda includes ecosystem unknowns or viable external alternatives, note that running `/adv-improve {target}` first would produce a reusable research pack.

### Edge Case Investigation

For each gap identified:

- Document ≥2 edge cases or failure modes
- Consider: null/undefined traps, type coercion, error paths, concurrency, boundary conditions
- Structural gaps (no logic) may be marked "Edge cases: N/A — structural" with rationale

### Design Question Depth

Each open design question MUST include:

| Annotation       | Description                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| **Trust model**  | Agent-only, user-only, or joint?                                        |
| **Blast radius** | What breaks or changes if chosen wrong?                                 |
| **Alternatives** | Viable options with recommendation (or "none viable, single direction") |

### LBP and Tradeoffs

If there are 2+ viable approaches with user-value tradeoffs, load `skill("prioritizer")` and apply the criteria-based tradeoff analysis workflow. If the skill is unavailable, continue with the existing inline prioritizer workflow before asking questions.

### External-Solution Check (gated)

Required when the proposal's Discovery Agenda contains ecosystem unknowns OR an open design question lists external tools / libraries / services as a realistic option.

1. First consult any `docs/*-prep.md` research pack cited in the Extends section. If it already answers the question, summarise it in the LBP Check and cite the specific sections (`Competitors & Alternatives`, `Emerging Patterns`, `Applicability to This Repo`).
2. If no relevant pack exists OR the cited pack is stale relative to the current question:
   - Run `kagi_search_fetch queries: ["{domain} alternatives {year}", "{domain} emerging patterns {year}"]`
   - Record top-3 competitors/alternatives and up to 2 emerging patterns with source URLs
   - Evaluate applicability to this repo with file-path references
3. Emit findings inline in the LBP Check section. Recommend `/adv-improve {target}` as a follow-up to persist the findings as a durable research pack when the discovery agenda will need them repeatedly.

Skip this step for purely internal changes (refactors, bug fixes, local doc/test fixes) where no external alternative is viable — say so explicitly in the LBP Check.

---
## Phase 3: Persist Discovery Findings
Update the proposal artifact with the discovery findings so the sign-off flow can present them cleanly.
- Use `adv_change_update` to refine proposal content
- Keep findings concise and decision-oriented
- Do not create `agreement.md` here
---

## Phase 4: Present Agreement Draft + Resolve Questions
- Load the refreshed discovery context from the proposal findings
- Extract objectives, constraints, avoidances, open questions, and draft acceptance criteria
- Present a concise agreement view:
  - **Objectives**
  - **Acceptance Criteria**
  - **Constraints**
  - **Avoidances / rejected approaches**
  - **Open questions**
  - **Investment snapshot** — call `adv_investment_report changeId: {id}` and include a one-line summary: `Investment: N tasks / M retries / T min / tier: {auto|escalate|hardstop}`. Purely informational; does not gate agreement.
- Ask for explicit user confirmation or edits using the `question` tool.

### Phase 4.5: Open Question Resolution Loop
**× MUST NOT skip this phase.** Open questions that require user input must be resolved before `agreement.md` is finalized.

#### Question Triage
Before presenting questions to the user, classify each open question from discovery:
| Category | Action | Example |
|----------|--------|---------|
| **Technical / implementation** | Agent resolves via LBP research | "Which hashing algorithm?", "SQL vs NoSQL?", "Middleware vs decorator pattern?" |
| **User-facing outcome** | **Ask the user** | "What should happen when X fails?", "Which matters more: speed or completeness?", "Should this be opt-in or opt-out?" |

**Ask the user about:**
- Weighing competing priorities
- Choosing between acceptable downsides
- Clarifying expected behavior
- Defining acceptance boundaries
- Scoping intent
- Preference on UX/workflow

**× Do NOT ask the user about:**
- Which technology, library, or pattern to use
- Implementation strategy (option A vs B)
- Internal architecture
- Questions the agent can answer from specs, codebase, or documentation

Technical questions that were open during discovery should be resolved autonomously and recorded as agent-resolved decisions in the agreement.

#### Minimum Engagement Rule
The agent **MUST** always conduct at least **1 round of 3 clarifying questions**, even if discovery surfaced zero open questions. The agent **MAY** conduct up to **5 rounds** total, with up to **5 questions per round**.

| Constraint | Value |
|------------|-------|
| Minimum rounds | 1 |
| Minimum questions in first round | 3 |
| Maximum rounds | 5 |
| Maximum questions per round | 5 |

Stop the loop when: all user-facing questions are resolved, the user signals satisfaction, or the 5-round cap is reached.

#### Protocol
1. **Collect** all open questions from discovery findings
2. **Triage** each question per the table above
3. **Resolve technical questions** autonomously and record decisions
4. **Round 1 (mandatory):** Present at least 3 user-facing questions
5. **Subsequent rounds (as needed):** present up to 5 questions per round
6. **Loop** until all user-facing questions have a user-provided answer or an explicit user deferral, or the 5-round cap is reached
7. **Summarize** all resolutions (user-resolved and agent-resolved) before proceeding

#### Deferral Rules
- If the user chooses to defer → record it as `Deferred by user: {reason}` in the agreement
- Deferred questions carry forward as constraints for `/adv-design`
- × NEVER silently defer a question or assume "no preference"

#### Question Presentation
For each user-facing question, provide:
| Element | Required |
|---------|----------|
| The question, framed as outcome/behavior/priority | Yes |
| Why it matters | Yes |
| Agent's recommended answer, if one exists | When applicable |
| Concrete options framed as tradeoffs, not tech choices | When enumerable |
| Visual comparison block before `question` | When side-by-side context materially helps |
| Write-in option | Always |

Visual comparison blocks are supplementary context, not a replacement for the `question` tool.

#### Batch Guidance
- Group related questions
- Up to 5 questions per round via the `question` tool
- Unrelated questions should be separate prompts within the same round

### Phase 4.5.1: Acceptance Criteria Checkpoint

**Purpose:** Dedicated checkpoint for acceptance-criteria agreement before `agreement.md` persistence and before the `discovery` gate completes. This separates AC approval from the broader agreement sign-off that follows in Phase 4.6.

**Requirement:** `rq-disc12` — Explicit Acceptance Criteria Checkpoint.

**When:** After Phase 4.5 (Open Question Resolution Loop) and before Phase 4.6 (Persist Agreement).

**Protocol:**
1. Present the **draft acceptance criteria** as a focused, numbered list. Separate this from the broader agreement view (objectives, constraints, avoidances).
2. Use the `question` tool with these outcomes. Keep custom input enabled so the third outcome remains the contextual write-in required by P26:
   - **Approve acceptance criteria (Recommended)** — proceed to Phase 4.6
   - **Start /adv-clarify** — stop `/adv-discover` immediately; do not persist `agreement.md`; do not call `adv_gate_complete`; **STOP HERE and return control to the user**; instruct the user to run `/adv-clarify {change-id}` and then rerun `/adv-discover {change-id}`
   - **Add or clarify acceptance criteria** — capture user input, normalize into revised AC bullets, and re-run this checkpoint
3. If revised AC still need substantial clarification after a re-run, recommend the `/adv-clarify` branch instead of continuing to loop inside Phase 4.5.1.
4. If AC are empty or weak, keep the approve option but remove the "(Recommended)" suffix and make `/adv-clarify` the recommended path.
5. Do not proceed to Phase 4.6 until AC are approved.

**× MUST NOT:** Complete `discovery` gate without AC approval. Do not invoke `/adv-clarify` directly outside this checkpoint outcome — pause and hand off to the user.

### Phase 4.6: Persist Agreement
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
- **Agent Decisions (LBP)** — technical questions resolved autonomously
- **Deferred Questions** — only questions the user explicitly chose to defer
- × Do NOT include a generic "Open Questions" section

---
## Phase 5: Complete Gate

`adv_gate_complete changeId: {change-id} gateId: discovery`

If the gate cannot be completed, surface the blocking reason and stop.

---

## Output

Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
Agreed objectives + constraints + user decisions.

## Delivered
- Discovery findings recorded
- agreement.md captured
- Open design questions for /adv-design

## Next stage
Design.

## Next
`/adv-design {change-id}`
```
