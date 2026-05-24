---
name: adv-discover
description: Gather context, analyze current state, identify objectives, and obtain user agreement
---
<!-- manifest: adv-discover · gate: discovery · requiresChangeId: true · prereqs: [adv-proposal] · scope: reads[specs, proposal, codebase] · modifies[proposal] -->

# ADV Discover — Establish Discovery Findings

Gather current-state evidence needed to move from proposal into a shared agreement. Command completes the `discovery` gate and carries the full user-facing discovery + agreement flow.

## Command Boundary

**Produces:** Discovery findings, current-state analysis, blocker/options summary, recommended objectives for agreement, `agreement.md`, and the typed `ChangeContract` spine minted from approved agreement items.

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

<!-- rq-noSourceChecklistReads01 -->

Embedded protocol below owns discovery step rules, edge cases, and output sections. This command owns orchestration.

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
<!-- rq-disc01 -->

#### Constraints

- **Read-only guidance** — this methodology block does not mutate ADV state
- **No gate completion** — command owns the discovery gate
- **Runtime source** — use this embedded methodology during command execution
- **No workflow sequencing** — command owns phase ordering
- **No architecture decisions** — those belong in `/adv-design`
---

## Phase 1: Load Context

- `adv_change_show changeId: <target> include: { snapshot: true }` — single call returns change + rendered gate snapshot (replaces separate `adv_gate_status` round trip)
- `adv_spec action: "list"` and `adv_spec action: "show"` for affected capabilities
- Use `lgrep`/`read` to inspect the relevant code paths, interfaces, and constraints
- Product-linked projects: capture product id, current repo id, primary repo id, related repo registry, existing `scope_repos`, and legacy state location. Agreement must say whether work is current-repo scoped or product-wide.

If proposal gate is still pending → stop and direct user to `/adv-proposal` first.

### Phase 1.0: Lineage Validation

Validate any lineage attached to change before proceeding to agreement.

#### Cross-Project Origin (`cross_project_origin`)

If `adv_change_show` reveals a `cross_project_origin` field:

1. **Confirm the origin is valid** — verify that `source_path` points to a real project and `source_project` matches a known project
2. **Trace the source change** — if `source_change_id` is set, report it to user so they can confirm the originating context is relevant
3. **Present origin summary** — surface the origin details to user for confirmation:
   - "This change was created as a follow-up from **{source_project}** (change: {source_change_id}). Does this context match your expectations?"
4. **If origin is invalid or unexpected** → flag as a blocking finding; the agent should not proceed with agreement until user confirms

#### Same-Project Fast Follow (`fast_follow_of`)

If `adv_change_show` reveals a `fast_follow_of` field:

1. **Confirm the parent exists** — call `adv_change_show changeId: {parent_change_id}` to validate the parent change exists in current project (archived or closed parents are valid)
2. **Surface parent context** — present to user:
   - "This change is a fast-follow of **{parent_change_id}**. Parent status: {parent_status}. Does this lineage match your expectations?"
3. **If parent not found** → flag as blocking finding; user must confirm or correct the parent reference
4. **If both `cross_project_origin` AND `fast_follow_of` present** → surface as blocking finding (mutual-exclusion at create time should prevent this; defensive validation here)

#### No Lineage

If neither field is present → skip this phase (local change, normal flow).

> **Gate requirement:** Lineage MUST be validated and confirmed by user before proceeding to agreement. This prevents stale or misdirected follow-up changes from being adopted blindly.

---
## Phase 1.5: Skill Discovery + Gap-Triggered Creation
<!-- rq-disc02 -->

Execute skill discovery protocol from `ADV_INSTRUCTIONS.md § Skill Discovery Protocol`, then check for skill gaps and pending reviews.

### Step 1: Pending-Review Scan

Before keyword matching, scan the global skills dir (`~/.config/opencode/skills/*/SKILL.md`) for skills with `metadata.review_status: "pending"`:

1. Read each SKILL.md frontmatter in the global dir
2. If any skill has `review_status: "pending"` → surface to user via `question` tool:
   - Present skill name, domain, and description
   - Options: **Confirm** (update `review_status` to `"reviewed"`), **Reject** (delete skill file), **Skip** (leave pending)
3. Process user response before continuing

### Step 2: Skill Search (existing behavior)

Search trusted skill directories → match `keywords` against tech stack/domain → load via `skill("{name}")` → apply guidance.

### Step 3: Gap Detection + Creation
<!-- rq-sc01 -->

If no matching skill was found for a domain clearly relevant to change's **core problem** (not tangential), the agent MAY create a skill on demand. See `ADV_INSTRUCTIONS.md § Skill Creation Protocol` for the full trigger conditions, naming convention, assembly template, and creation flow.

**Creation sub-flow (only if gap detected):**
<!-- rq-sc02 -->
1. Research domain using Context7, Exa, and searchcode. Use Exa for candidate repo discovery, then `searchcode_code_search` / `searchcode_code_get_file` for in-repo implementation evidence.
2. Assemble SKILL.md using the template from `ADV_INSTRUCTIONS.md § Skill Creation Protocol`
3. Write atomically to `~/.config/opencode/skills/agent-{domain}/SKILL.md`
4. Skip if file already exists → report "skill already exists: agent-{domain}"
5. Load via `skill("agent-{domain}")` and apply guidance in current workflow
6. Emit `[ADV:SKILL_CREATED]` with skill name, domain, and brief description
<!-- rq-sc03 -->

**Output:** "Skills Considered" section listing each examined skill, match assessment, action taken, and any gap detection/creation results.

**Graceful degradation:**
- No skills in trusted directories → report "Skills considered: none available" (non-blocking)
- Malformed YAML frontmatter → skip silently
- Multiple matches → load all matching skills
- No matches for tangential domain → proceed normally, report "no skills matched"
- No matches for core domain → gap detected, proceed to creation sub-flow

**Protocol extension note:** This extends the Skill Discovery Protocol's "No matches → proceed normally" behavior. When all trigger conditions are met (core domain, no partial match), "no matches" becomes a conditional trigger for skill creation. Agents that don't implement creation still conform by reporting the gap and proceeding.
---

## Phase 1.6: Conflict & Related-Work Scan
<!-- rq-disc04 -->

Execute all three tools and report findings in a "Conflict Scan" section:

1. `adv_change_list includeArchived: true` → surface related active and archived changes
2. `adv_change_validate` on target change → note that own-change pre-prep warnings (NO_TASKS, NO_DELTAS) are expected and should NOT be reported as conflicts
3. `adv_agenda_list` → check for overlapping agenda items

For relevant archived changes, use `adv_change_show` to inspect their tasks and decisions. Prior work may inform or constrain current proposal.

---
## Phase 1.7: P25 Related-Pattern Scan
<!-- rq-disc08 -->
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
| **AMBIGUITY ANALYSIS** | Finding table: B/F/S/M findings (required v1) + optional D/X/Q/I/E/C/T findings; severity column; evidence quotes; coverage report row |

<!-- rq-disc07 -->

### Ambiguity Analysis

Run a structured ambiguity scan using the taxonomy from `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy`:

- **v1 required categories:** B (Boundaries), F (Functional Scope), S (Completion Signals), M (Missing Information) — MUST be scanned
- **v1 optional categories:** D/X/Q/I/E/C/T — agent MAY emit findings; optional means scan-optional, not ignored if emitted
- Per UD2 hybrid scope: required categories MUST appear in every discovery; optional categories are at agent discretion. Any emitted optional-category CRITICAL/HIGH findings still participate in trigger evaluation.

**Finding shape** (from `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy`):
```
{Letter}{N}  {SEVERITY}  {Category}  {Finding text}
  Evidence: {verbatim quote OR `(no {section} section)`}
  Reason: unclear because {X}
```

**Coverage report format:** `Coverage: B:C F:P S:M M:C` (C=Clear, P=Partial, M=Missing, N/A=Not applicable)

**Anti-hallucination rule:** × MUST NOT fabricate evidence quotes — every finding cites verbatim text from proposal.md or `(no {section} section)`.

If scan is clean: emit `### AMBIGUITY ANALYSIS — no ambiguity findings. Coverage: B:C F:C S:C M:C`

### Prior Research Extension
<!-- rq-disc03 -->

Search these locations for prior artifacts:

- `temp/*.md` — brainstorm or prep documents
- `docs/*-prep.md` — research packs (including `/adv-improve` output). These contain pre-vetted competitors, alternatives, and emerging patterns that MUST be cited before running any new external searches on same domain.
- Archived changes — `adv_change_list includeArchived: true` → inspect relevant archives

**Rules:**

- Cite each found artifact in the "Extends" section
- For `/adv-improve`-style research packs, explicitly cite the `Competitors & Alternatives`, `Emerging Patterns`, and `Applicability to This Repo` sections when they are relevant to the discovery's open design questions
- Add ≥1 new finding not present in the cited artifact
- Do NOT count change's own `proposal.md` as "prior research" (self-referential)
- No prior artifacts → report "No prior research found" (non-blocking). If the discovery agenda includes ecosystem unknowns or viable external alternatives, note that running `/adv-improve {target}` first would produce a reusable research pack.

### Edge Case Investigation
<!-- rq-disc05 -->

For each gap identified:

- Document ≥2 edge cases or failure modes
- Consider: null/undefined traps, type coercion, error paths, concurrency, boundary conditions
- Structural gaps (no logic) may be marked "Edge cases: N/A — structural" with rationale

### Design Question Depth
<!-- rq-disc06 -->

Each open design question MUST include:

| Annotation       | Description                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| **Trust model**  | Agent-only, user-only, or joint?                                        |
| **Blast radius** | What breaks or changes if chosen wrong?                                 |
| **Alternatives** | Viable options with recommendation (or "none viable, single direction") |

### LBP and Tradeoffs

If 2+ viable approaches have user-value tradeoffs, run the inline Tradeoff Prioritizer Protocol from `ADV_INSTRUCTIONS.md` and produce criteria-based comparison before asking the user. If only one viable approach remains after evidence, record why.

### External-Solution Check (gated)
<!-- rq-disc10 -->

Required when proposal's Discovery Agenda contains ecosystem unknowns OR an open design question lists external tools / libraries / services as a realistic option.

1. First consult any `docs/*-prep.md` research pack cited in the Extends section. If it already answers the question, summarise it in the LBP Check and cite the specific sections (`Competitors & Alternatives`, `Emerging Patterns`, `Applicability to This Repo`).
2. If no relevant pack exists OR the cited pack is stale relative to current question:
   - Run `exa_web_search_exa` queries: `["{domain} alternatives {year}", "{domain} emerging patterns {year}"]`
   - Record top-3 competitors/alternatives and up to 2 emerging patterns with source URLs
   - Evaluate applicability to this repo with file-path references
3. Emit findings inline in the LBP Check section. Recommend `/adv-improve {target}` as a follow-up to persist the findings as a durable research pack when the discovery agenda will need them repeatedly.

Skip this step for purely internal changes (refactors, bug fixes, local doc/test fixes) where no external alternative is viable — say so explicitly in the LBP Check.

---
## Phase 2.5: Trigger Evaluation

After producing the AMBIGUITY ANALYSIS, evaluate findings before proceeding to Phase 3:

1. **Count findings** — count CRITICAL findings + count HIGH findings across all categories (required AND optional)
2. **Resolution log check** — read `## Clarify Resolution Log` section from proposal.md if present; previously-resolved findings are excluded from current trigger count
3. **Evaluate threshold:**

| Condition | Action |
|-----------|--------|
| CRITICAL ≥ 1 | Halt discovery. Do NOT call `adv_gate_complete gateId: 'discovery'`. Do NOT proceed to Phase 3. Output: "AMBIGUITY CRITICAL finding(s) detected. Run `/adv-clarify {change-id}` to resolve, then rerun `/adv-discover {change-id}`." |
| HIGH ≥ 2 (no CRITICAL) | Halt discovery. Same handoff as above. |
| Single HIGH only | Warning logged inline. Continue to Phase 3. |
| All clean | Continue to Phase 3. |

4. **Skip trigger evaluation** when `clarify_enforcement: 'off'` or when discovery gate is already completed (legacy/in-flight changes)
5. **Rerun cap:** After `/adv-clarify` resolves findings and user reruns `/adv-discover`, cap at 2 reruns before escalating to user via `question` tool per EC4

---
## Phase 3: Persist Discovery Findings
Update proposal artifact with the discovery findings so the sign-off flow can present them cleanly.
- Use `adv_change_update` to refine proposal content
- Keep findings concise and decision-oriented
- Do not create `agreement.md` here
---

## Phase 3.5: Discovery Opportunity Scout
<!-- rq-discOpportunityScout01 -->

Run a mandatory bounded opportunity-scout pass after current-state research and before agreement formation. The scout identifies missed opportunities: alternative approaches, overlooked patterns, gaps in objectives/AC, and unconsidered edge cases.

### Execution

1. **Prepare split-load contract** — orchestrator owns ScoutCandidate schema, routing taxonomy, fallback/degradation, adoption, and all ADV mutations. Do not load scout methodology into main context unless worker loading is unavailable.
2. **Prepare context** — assemble proposal summary, agreement objectives/AC/constraints/avoidances, current-state findings (Phase 2–3), and prior-consideration data from Phase 1.6 conflict scan.
3. **Spawn adv-researcher** — prompt worker to load `skill("adv-opportunity-scout")` in `discovery` mode when available; otherwise use the embedded schema/routing summary in this command. The researcher returns ≤5 structured candidates (8-field ScoutCandidate schema).
4. **Sort candidates** — by payoff/risk ratio (highest first).
5. **Route adoption** per the skill's routing taxonomy:
   - **Auto-adopt** only when: contract-tied (not "untied"), low risk, `adopt_now`/`design_around` fate, no user-value tradeoff.
   - **Surface to user** for all other candidates (untied, medium+ risk, or user-value tradeoff).
6. **Integrate adopted findings** — auto-adopted candidates are incorporated into the agreement's objectives or AC before Phase 4 agreement presentation.

### Opt-Out

The scout phase may be skipped with rationale for trivially scoped changes where the opportunity surface is likely zero. Record "Scout: skipped — {rationale}" in the phase output.

### Degradation

If worker skill-load is unavailable, adv-researcher spawn fails, returns empty/malformed output, or times out: record "Scout: inconclusive ({reason})" and proceed without blocking. Mandatory means "must attempt," not "must succeed."

### Output

- "Discovery Opportunity Scout" section with: candidates considered (count), auto-adopted (count + summary), surfaced to user (count + summary), inconclusive/skipped (if applicable).

---

## Phase 4: Present Agreement Draft + Resolve Questions
<!-- rq-disc11 -->
- Load the refreshed discovery context from proposal findings
- Extract objectives, constraints, avoidances, open questions, and draft acceptance criteria
- Present a concise agreement view:
  - **Objectives**
  - **Acceptance Criteria**
  - **Constraints**
  - **Avoidances / rejected approaches**
  - **Preview applicability** — record `visual_surface: true|false|unknown` plus rationale. Use `true` when the change affects front-end, browser-visible, or any visual output; `false` when no visual output can be affected; `unknown` when uncertainty remains. `unknown` carries forward as an acceptance blocker until clarified.
  - **Open questions**
  - **Investment snapshot** — call `adv_investment_report changeId: {id}` and include a one-line summary: `Investment: N tasks / M retries / T min / tier: {auto|escalate|hardstop}`. Purely informational; does not gate agreement.
- Agreement sign-off uses the **Inline Approval prompt (Tier A)** at Phase 4.5.1 (AC checkpoint) and Phase 4.6 (Persist Agreement). Phase 4.5 (Open Question Resolution Loop) keeps the `question` tool — that is a non-checkpoint clarification round.

### Phase 4.5: Open Question Resolution Loop
**× MUST NOT skip this phase.** Open questions that require user input must be resolved before `agreement.md` is finalized.

#### Question Triage
Before presenting questions to user, classify each open question from discovery:
| Category | Action | Example |
|----------|--------|---------|
| **Technical / implementation** | Agent resolves via LBP research | "Which hashing algorithm?", "SQL vs NoSQL?", "Middleware vs decorator pattern?" |
| **User-facing outcome** | **Ask user** | "What should happen when X fails?", "Which matters more: speed or completeness?", "Should this be opt-in or opt-out?" |

**Ask user about:**
- Weighing competing priorities
- Choosing between acceptable downsides
- Clarifying expected behavior
- Defining acceptance boundaries
- Scoping intent
- Preference on UX/workflow

**× Do NOT ask user about:**
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

Stop the loop when: all user-facing questions are resolved, user signals satisfaction, or the 5-round cap is reached.

#### Protocol
1. **Collect** all open questions from discovery findings
2. **Triage** each question per the table above
3. **Resolve technical questions** autonomously and record decisions
4. **Round 1 (mandatory):** Present at least 3 user-facing questions
5. **Subsequent rounds (as needed):** present up to 5 questions per round
6. **Loop** until all user-facing questions have a user-provided answer or an explicit user deferral, or the 5-round cap is reached
7. **Summarize** all resolutions (user-resolved and agent-resolved) before proceeding

#### Deferral Rules
- If user chooses to defer → record it as `Deferred by user: {reason}` in the agreement
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
- Unrelated questions should be separate prompts within same round

### Phase 4.5.1: Acceptance Criteria Checkpoint (Inline)

**Purpose:** Dedicated checkpoint for acceptance-criteria agreement before `agreement.md` persistence and before the `discovery` gate completes. This separates AC approval from the broader agreement sign-off that follows in Phase 4.6.

**Requirements:** `rq-disc12` (Explicit Acceptance Criteria Checkpoint), `rq-inlineApproval01` (Inline Approval at Named Human Checkpoints).

**When:** After Phase 4.5 (Open Question Resolution Loop) and before Phase 4.6 (Persist Agreement).

**Protocol:**

1. Present the **draft acceptance criteria** as a focused, numbered list. Separate this from the broader agreement view (objectives, constraints, avoidances).
2. Emit the **Inline Approval prompt (Tier A with `/adv-clarify` literal detection)** per `docs/command-voice-standard.md` § Inline Approval Voice:

   ```
   Acceptance Criteria for {change-id}:

   1. ...
   2. ...

   Reply:
   - `approve` (or whitelist hit: continue, go, yes, ok, proceed, lgtm) — approve AC and proceed to agreement persistence
   - `/adv-clarify {change-id}` — halt /adv-discover; user runs /adv-clarify; rerun /adv-discover after
   - Or describe what to add/clarify — agent normalizes into revised AC and re-runs this checkpoint
   ```

3. **Reply detection rules (in order):**

   | Reply | Action |
   |---|---|
   | Trimmed = `/adv-clarify` or `/adv-clarify {change-id}` | Halt cleanly: no `agreement.md` write, no `adv_gate_complete`, return control to user with instruction to rerun `/adv-discover {change-id}` after `/adv-clarify` |
   | Trimmed first token = `/adv-clarify` | Same halt branch |
    | Tier A whitelist match | Approve AC, proceed to Phase 4.6 |
    | Anything else | Treat as revision text; normalize into revised AC bullets and re-run this checkpoint |

   **× Do NOT** treat phrases like "I want to clarify something" or "let's clarify X" as `/adv-clarify` invocation. Only the literal slash-command form triggers the halt branch. Non-literal "clarify" intent is revision text (per `rq-disc12.2`).

> **Note:** The `/adv-clarify` halt path at Phase 4.5.1 is same mechanism as the Phase 2.5 trigger evaluation halt. Both hand off to `/adv-clarify` with same rerun instruction. Phase 2.5 catches ambiguity findings in proposal's scope/success criteria; Phase 4.5.1 catches ambiguity introduced by AC revision text.

4. If revised AC still need substantial clarification after 3 re-runs, recommend the `/adv-clarify` branch instead of continuing to loop.
5. If AC are empty or weak, keep the approve option but mark the `/adv-clarify` branch as the recommended path.
6. Do not proceed to Phase 4.6 until AC are approved.

**Anchor phrase:** `Reply `approve``

**× MUST NOT:** Complete `discovery` gate without AC approval. Do not invoke `/adv-clarify` directly outside this checkpoint outcome — pause and hand off to user.

### Phase 4.6: Persist Agreement (Inline)
Once AC are approved at Phase 4.5.1 and all open questions are resolved (or explicitly deferred), write `agreement.md` through `adv_change_update`. The Phase 4.5.1 inline approval is the sign-off — no additional `question` tool prompt.

Suggested structure:
```md
# Agreement
## Objectives
## Acceptance Criteria
## Constraints
## Avoidances
## Preview Applicability
## Decisions
### User Decisions
### Agent Decisions (LBP)
## Deferred Questions
## Sign-Off
```
- **User Decisions** — questions user answered, each with the question, user's choice, and why it matters
- **Agent Decisions (LBP)** — technical questions resolved autonomously
- **Preview Applicability** — mandatory `visual_surface: true|false|unknown` value plus rationale. `visual_surface: unknown` is allowed only when uncertainty is explicit and MUST be treated as blocking during `/adv-review` before acceptance.
- **Deferred Questions** — only questions user explicitly chose to defer
- × Do NOT include a generic "Open Questions" section

### Contract Minting

After Phase 4.5.1 AC approval and before `discovery` gate completion: call `adv_contract_mint`. Tool parses approved `agreement.md`, validates `ChangeContract`, persists via `contractSetSignal`.

Contract rules:

- Source after mint: `ChangeContract.items`.
- Legacy `acceptanceCriteria`: backward-compatible projection from `AC*` only.
- Stable IDs from approved agreement text:
  - `SC1..n` — success criteria / desired outcomes.
  - `AC1..n` — approved acceptance criteria.
  - `C1..n` — constraints.
  - `DONT1..n` — rejected approaches / explicit avoidances.
  - `OOS1..n` — out-of-scope boundaries.
- Initial items use `sourceArtifact: "agreement"`.
- Evidence policies: `SC*` → `review`; `AC*` → `test`; `C*` → `static_check`; `DONT*` → `review`; `OOS*` → `not_applicable`.
- Poisoned-history repair only: `adv_contract_mint recoveryMode: "poisoned_history"` + explicit `recoveryEvidence`. Repairs disk projection only; does not heal workflow history.

Discovery completion blocked when approved agreement lacks contract spine or projected `acceptanceCriteria` drifts from approved `AC*` items.

If `adv_gate_complete changeId: {change-id} gateId: discovery` returns `DISCOVERY_CONTRACT_MISSING`: run `adv_contract_mint`, fix parser/schema failures in approved agreement, retry gate.

---
## Phase 5: Complete Gate

`adv_gate_complete changeId: {change-id} gateId: discovery`

If gate cannot be completed, surface the blocking reason and stop.

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

---

> **{change-id}**
> discovery ✓ → design
>
> → `/adv-design {change-id}`
```

**Auto-continue:** After user approves AC + agreement, begin `/adv-design` inline. Do not ask "shall I proceed?" Approval is go-ahead.
