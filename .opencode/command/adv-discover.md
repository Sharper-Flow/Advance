---
name: adv-discover
description: Gather context, analyze current state, identify objectives, and obtain user agreement
---

<!-- manifest: adv-discover · gate: discovery · requiresChangeId: true · prereqs: [adv-proposal] · scope: reads[specs, proposal, codebase] · modifies[proposal] -->

# ADV Discover — Establish Discovery Findings

Gather current-state evidence needed to move from proposal into a shared agreement. Command completes the `discovery` gate and carries the full user-facing discovery + agreement flow. Discovery owns firming design-independent behavioral acceptance criteria and success criteria.

## Command Boundary

**Produces:** Discovery findings, current-state analysis, blocker/options summary, recommended objectives, approved acceptance criteria + success criteria, `agreement.md`, and the typed `ChangeContract` spine minted from approved agreement items.

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

#### Discovery Protocol (9 Steps)

Every `/adv-discover` invocation must execute these 9 protocol steps and emit a Discovery Checklist section summarizing their results:

| #   | Step                                               | Output section            | Required content                                                                                                                 |
| --- | -------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Skill Discovery** (Phase 1.5)                    | Skills Considered         | Examined skills + match results (or "none available")                                                                            |
| 2   | **Prior Research Extension**                       | Extends                   | Cited artifacts (including `/adv-improve` research packs under `docs/*-prep.md`) + ≥1 new finding (or "No prior research found") |
| 3   | **Conflict & Related-Work Scan** (Phase 1.6)       | Conflict Scan             | Results from `adv_change_list` (includeArchived), `adv_change_validate`, `adv_agenda_list`                                       |
| 4   | **Edge Case Investigation**                        | Edge Cases                | ≥2 edge cases per gap (or "N/A: structural" with rationale)                                                                      |
| 5   | **Design Question Depth**                          | Open Design Questions     | Each question annotated with trust model, blast radius, alternatives                                                             |
| 6   | **Draft Spec Delta Shapes**                        | Draft Spec Deltas         | `rq-*` IDs + ≥1 G/W/T per delta (or "No spec deltas required")                                                                   |
| 7   | **P25 Related-Pattern Scan** (Phase 1.7)           | Related Pattern Scan      | Similar patterns or "no similar patterns found"                                                                                  |
| 8   | **LBP Check (with gated External-Solution Check)** | LBP Check                 | Whether likely direction matches long-term best practice                                                                         |
| 9   | **Completeness Verification** (Phase 1.8)          | Completeness Verification | Always-on problem-completeness + solution-scope checks; sole-entry blocking; secondary-surface disposition                      |

After all 9 steps, emit a **Discovery Checklist** table listing each step with PASS/SKIP + reason.

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

#### Epic Membership

If `adv_change_show` reveals `epic_membership`:

1. Load compact Epic context with `adv_epic_show epic_id: {epic_id}`.
2. Record the Epic title, current entry order, and entry title in the discovery findings.
3. Use the Epic narrative to inform objectives and acceptance criteria, but do not let Epic order override user-confirmed scope.
4. Epic membership is optional; if it is missing, continue the normal flow.

> **Constraint:** Epic order is advisory. Warn if earlier entries are incomplete, but never block agreement or discovery gate completion solely because of order.

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

## **Protocol extension note:** This extends the Skill Discovery Protocol's "No matches → proceed normally" behavior. When all trigger conditions are met (core domain, no partial match), "no matches" becomes a conditional trigger for skill creation. Agents that don't implement creation still conform by reporting the gap and proceeding.

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

Per rule P25 (related-scan): identify the class of bug/gap being addressed, then scan for similar patterns elsewhere in the codebase.

**Output:** "Related Pattern Scan" section listing similar patterns with file references, or explicitly stating "no similar patterns found".

- Zero matches → state explicitly (do not silently omit the section)
- Many matches → cap at top N with rationale
- Matches in deprecated/archived code → filter and note

---

## Phase 1.8: Completeness Verification

<!-- rq-disc13 rq-disc14 -->

Always-on discipline ensuring discovery captured the **full problem** and **full intended solution scope**, not only a first-found symptom or single code path. This step runs in **every** discovery — it is not gated behind a trigger condition. Only the depth of any codebase surface scan scales to what the completeness question demands (preserving proportionality for narrow changes).

### Two always-on checks

1. **Problem-completeness check** — "Was the full problem identified, or only an observed symptom/path?" Record a rationale + confidence note. If the observed symptom may be only part of the problem, state what else could be in scope and how it was (or will be) ruled in/out.
2. **Solution-scope check** — "Is the full intended solution scoped, or only one implementation piece?" Record a rationale + confidence note, including any sole-chokepoint / single-entry / single-control-surface claims the design will rely on.

### Scan-depth scaling (proportionality)

The **check** always runs. A broad codebase surface scan (`lgrep_search_semantic` + `lgrep_search_symbols`) runs **only when the completeness question demands it** — i.e., when discovery relies on a sole-entry / single-control-surface claim for a cross-cutting operation, or when the problem spans an operation performed in multiple places. Narrow, localized changes record a lightweight rationale ("change is local to X; no cross-cutting operation claimed") and proceed without a broad scan.

### Sole-entry blocking (KD2 — reuses existing halt plumbing)

When discovery relies on a **sole-chokepoint / single-entry / single-control-surface** claim for a cross-cutting operation and that claim is **not verified** by a target-operation surface scan:

- Emit a **Boundaries (B) CRITICAL** ambiguity finding with verbatim evidence (the unverified claim text).
- The existing `rq-disc-tax2` trigger (see Phase 2.5) halts discovery and hands off to `/adv-clarify`.
- **No new halt machinery** — the block reuses the existing CRITICAL→halt→`/adv-clarify` path.
- Discovery does not complete until the claim is verified (scan proves sole entry) or downgraded (reframed as one-of-many with explicit scope).

### Secondary-surface disposition (AC4)

Any secondary surfaces found during completeness verification (parallel code paths that perform the target operation) MUST be explicitly classified **before agreement**:

- **In scope** — the change will address this surface too
- **Out of scope with rationale** — explicitly excluded and why
- **Unresolved user-facing scope question** — surfaced to the user in the agreement phase

Secondary surfaces MUST NOT be silently deferred as "future work" without explicit scope rationale.

### Reproduction Finding Classification (rq-acWarrant01)

Every reproduction-sourced finding (a symptom observed from a bug report, issue, or user-attempted operation) MUST be classified before it can seed an acceptance or success criterion:

| Classification | Meaning | May seed a "must-work" criterion? |
| --- | --- | --- |
| `broken_capability` | A capability that should work but is defective | Yes |
| `unwarranted_operation` | The user attempted an operation that does not exist or is not architecturally warranted | **No** |
| `unverified` | The finding is hedged/unconfirmed; the capability premise has not been verified against tool surface, spec, or code | **No** (until verified → reclassify) |

Rules:

- A failed reproduction attempt is **not** automatically a requirement. Classify it first.
- Findings classified `unwarranted_operation` or `unverified` MUST NOT seed a criterion asserting the capability must work. Downgrade them to an out-of-scope note or recorded rationale, or verify and reclassify as `broken_capability`.
- × Never harden a hedged/`unverified` observation into a firm criterion. This is the exact failure class `rq-acWarrant01` exists to prevent.
- Record each finding's classification in the discovery output.

### Target-operation surface scan evidence shape

When a surface scan runs, record: searched terms/symbols, found surfaces (file:line), excluded surfaces with rationale, and the final scope disposition. This evidence is carried forward so design and review can audit completeness.

### Relationship to P25 (Phase 1.7)

P25 scans for **similar bugs** after a defect class is known. Completeness verification asks a different question: **did we find the whole problem and scope the whole solution?** The two are complementary; do not merge them.

**Output:** "Completeness Verification" section with the two checks (rationale + confidence), any sole-entry claim status (verified / downgraded / blocking), and secondary-surface dispositions.

---

## Phase 2: Discovery Analysis

Build a compact discovery report. The output MUST contain these sections (order flexible):

### Required Output Sections

| Section                    | Required content                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Discovery Checklist**    | Table of all protocol steps with PASS/SKIP + reason                                                                                    |
| **Skills Considered**      | Examined skills with match assessment (from Phase 1.5)                                                                                 |
| **Extends**                | Prior research artifacts cited + ≥1 new finding per artifact (or "No prior research found")                                            |
| **Conflict Scan**          | Results from Phase 1.6 (or "no conflicts")                                                                                             |
| **Current State**          | What exists today in code/specs/docs                                                                                                   |
| **Edge Cases**             | ≥2 per identified gap (or "N/A: structural" with rationale)                                                                            |
| **Open Design Questions**  | Each with trust model + blast radius + alternatives considered                                                                         |
| **Draft Spec Deltas**      | `rq-*` IDs + ≥1 Given/When/Then per delta (or "No spec deltas required" with rationale)                                                |
| **Related Pattern Scan**   | Results from Phase 1.7                                                                                                                 |
| **Completeness Verification** | Always-on problem-completeness + solution-scope checks (rationale + confidence); sole-entry claim status; secondary-surface dispositions |
| **LBP Check**              | Whether likely direction matches long-term best practice                                                                               |
| **Recommended Objectives** | Numbered list for the agreement phase                                                                                                  |
| **AMBIGUITY ANALYSIS**     | Finding table: B/F/S/M findings (required v1) + optional D/X/Q/I/E/C/T findings; severity column; evidence quotes; coverage report row |

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
3. **Classify output noise:**

| Class                  | Condition              | Action                                                                                                                                           |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Blocking ambiguity** | CRITICAL ≥ 1           | Halt discovery. Do NOT call `adv_gate_complete gateId: 'discovery'`. Output evidence quotes and hand off to `/adv-clarify {change-id}`.          |
| **Blocking ambiguity** | HIGH ≥ 2 (no CRITICAL) | Halt discovery. Same handoff as above with evidence quotes.                                                                                      |
| **Advisory ambiguity** | Single HIGH only       | Continue to Phase 3. Log one concise advisory with finding ID, severity, and evidence quote. Do not repeat the warning in unrelated status text. |
| **Clean**              | No trigger findings    | Continue to Phase 3.                                                                                                                             |

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

Run a trigger-based Discovery Opportunity Scout pass after current-state research and before agreement formation when Trigger Conditions apply. The scout identifies missed opportunities: alternative approaches, overlooked patterns, gaps in objectives/AC, and unconsidered edge cases.

### Trigger Conditions

Run the scout for strategic, architecture, product, ecosystem, external-option, or broad objective/AC changes. Skip for narrow low-opportunity changes where the opportunity surface is likely zero and record `Scout: skipped — {rationale}`.

### Execution

1. **Evaluate Trigger Conditions** — decide `run`, `skip`, or `inconclusive` before spawning. Record rationale in the phase output.
2. **Prepare split-load contract** — orchestrator owns ScoutCandidate schema, routing taxonomy, fallback/degradation, adoption, and all ADV mutations. Do not load scout methodology into main context unless worker loading is unavailable.
3. **Prepare context** — assemble proposal summary, agreement objectives/AC/constraints/avoidances, current-state findings (Phase 2–3), and prior-consideration data from Phase 1.6 conflict scan.
4. **Spawn adv-researcher when triggered** — prompt worker to load `skill("adv-opportunity-scout")` in `discovery` mode when available; otherwise use the embedded schema/routing summary in this command. The researcher returns ≤5 structured candidates (8-field ScoutCandidate schema) and submits a compact `RESEARCHER_REPORT` before final response.
5. **Sort candidates** — by payoff/risk ratio (highest first).
6. **Route adoption** per the skill's routing taxonomy:
   - **Auto-adopt** only when: contract-tied (not "untied"), low risk, `adopt_now`/`design_around` fate, no user-value tradeoff.
   - **Surface to user** for all other candidates (untied, medium+ risk, or user-value tradeoff).
7. **Integrate adopted findings** — auto-adopted candidates are incorporated into the agreement's objectives or AC before Phase 4 agreement presentation.

### Opt-Out

The scout phase may be skipped with rationale for narrow low-opportunity changes. Record `Scout: skipped — {rationale}` in the phase output.

### Degradation

If worker skill-load is unavailable, adv-researcher spawn fails, returns empty/malformed output, or times out: record `Scout: inconclusive ({reason})` and proceed without blocking. Triggered means must attempt when applicable, not must succeed.

### Output

- "Discovery Opportunity Scout" section with: trigger decision (`run`/`skip`/`inconclusive`), candidates considered (count), auto-adopted (count + summary), surfaced to user (count + summary), inconclusive/skipped (if applicable).

### Researcher Scout Packet

Inject into the `adv-researcher` scout prompt:

```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title} | gate: discovery
SCOPE KEY: researcher:discovery-opportunity-scout
ATTEMPT: {attempt-number, starting at 1 for this researcher worker}
TASK_SCOPE: discover missed opportunities and leverage points within approved proposal scope
IN_SCOPE:
  - proposal/problem context, existing specs, adjacent implementation patterns, bounded external evidence
OUT_OF_SCOPE:
  - new product commitments, unrelated refactors, user-value tradeoffs without orchestrator synthesis
DONE_WHEN:
  - scout candidates are classified as auto-adopt, user-surface, or inconclusive
STOP_WHEN:
  - source access blocked, contract/security/release blocker, or contradictory evidence needing orchestrator decision
VERIFICATION:
  required_when_possible:
    - cite source/docs/code evidence for each surfaced candidate
  optional_additional_checks: true
EXPECTED OUTPUT: return ScoutCandidate rows and call adv_subagent_report_submit with RESEARCHER_REPORT per .opencode/agents/adv-researcher.md
```

---

## Phase 4: Present Agreement Draft + Resolve Questions

<!-- rq-disc11 -->

- Load the refreshed discovery context from proposal findings
- Extract objectives, constraints, avoidances, open questions, draft acceptance criteria, and success criteria. Proposal `## User Outcomes` may seed this work, but discovery owns making criteria design-independent, behavioral, and user-confirmed.
- Present a concise agreement view:
  - **Objectives**
  - **Acceptance Criteria**
  - **Success Criteria**
  - **Constraints**
  - **Avoidances / rejected approaches**
  - **Preview applicability** — record preview applicability as `visual_surface: true|false|unknown` plus rationale. Use `true` when the change affects front-end, browser-visible, or any visual output; `false` when no visual output can be affected; `unknown` when uncertainty remains. Also record `preview_expectation` with `exact_route_required`, `data_state_expectation` (`live|fixture_allowed|mock_allowed|not_applicable|unknown`), `viewport_expectation` (`375px|required_project_equivalent|not_applicable|unknown`), and rationale. `unknown` carries forward as an acceptance blocker until clarified.
  - **Open questions**
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

| Constraint                       | Value |
| -------------------------------- | ----- |
| Minimum rounds                   | 1     |
| Minimum questions in first round | 3     |
| Maximum rounds                   | 5     |
| Maximum questions per round      | 5     |

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

**Purpose:** Dedicated checkpoint for acceptance-criteria and success-criteria agreement before `agreement.md` persistence and before the `discovery` gate completes. This separates criteria approval from the broader agreement sign-off that follows in Phase 4.6.

**Requirements:** `rq-disc12` (Explicit Acceptance Criteria Checkpoint), `rq-stageDiscoveryFirmCriteria01` (Discovery Firms Design-Independent Criteria), `rq-stageDiscoveryImplFreeGuard01` (Discovery Criteria Implementation-Free Guard Is Advisory), `rq-inlineApproval01` (Inline Approval at Named Human Checkpoints).

**When:** After Phase 4.5 (Open Question Resolution Loop) and before Phase 4.6 (Persist Agreement).

**Protocol:**

1. Present the **draft acceptance criteria** and **draft success criteria** as focused, numbered lists. Separate them from the broader agreement view (objectives, constraints, avoidances).
2. Run the **advisory implementation-free guard** over each draft criterion:
   - If a criterion encodes a mechanism/component/library/data structure, emit an advisory finding with the exact phrase.
   - Mark it preliminary or likely design-derived; recommend revision or design review.
   - × Do NOT hard-block discovery solely because this advisory guard fired.
2b. Run the **Capability-Warrant Declaration** step (rq-acWarrant01) over each draft criterion:
   - A **capability-presuming** criterion — one asserting that a specific tool, tool argument, or spec requirement exists or must work — MUST carry a typed warrant tag appended to its text: `[warrant: <ref>]`, where ref is `tool:<name>`, `tool:<name>#<arg>`, or `spec:<rq-id>`. Comma-separate multiple refs.
   - Example: `AC2: Cross-project repair routes through the target namespace. [warrant: tool:adv_change_status_repair#target_path]`
   - At contract mint, each declared warrant is verified against the live tool surface / spec ids; an unresolved warrant fails the mint with `CONTRACT_UNRESOLVED_WARRANT`. Declaring a warrant for a surface that does not exist (the unwarranted-criterion failure class) is therefore caught structurally.
   - **Behavioral criteria** that presume no capability surface (e.g. "returns an error when input is invalid") require **no** warrant tag — do not add ceremony (proportionality, DONT4).
   - If a criterion would presume a capability that a Phase 1.8 finding classified `unwarranted_operation`/`unverified`, do not write the criterion — resolve the classification first.
3. Emit the **Inline Approval prompt (Tier A with `/adv-clarify` literal detection)** per `docs/command-voice-standard.md` § Inline Approval Voice:

   ```
   Criteria for {change-id}:

   Success Criteria:

   1. ...

   Acceptance Criteria:

   1. ...
   2. ...

   Reply:
   - `approve` (or whitelist hit: continue, go, yes, ok, proceed, lgtm) — approve criteria and proceed to agreement persistence
   - `/adv-clarify {change-id}` — halt /adv-discover; user runs /adv-clarify; rerun /adv-discover after
   - Or describe what to add/clarify — agent normalizes into revised criteria and re-runs this checkpoint
   ```

4. **Reply detection rules (in order):**

   | Reply                                                  | Action                                                                                                                                                           |
   | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Trimmed = `/adv-clarify` or `/adv-clarify {change-id}` | Halt cleanly: no `agreement.md` write, no `adv_gate_complete`, return control to user with instruction to rerun `/adv-discover {change-id}` after `/adv-clarify` |
   | Trimmed first token = `/adv-clarify`                   | Same halt branch                                                                                                                                                 |
   | Tier A whitelist match                                 | Approve criteria, proceed to Phase 4.6                                                                                                                           |
   | Anything else                                          | Treat as revision text; normalize into revised criteria bullets and re-run this checkpoint                                                                       |

   **× Do NOT** treat phrases like "I want to clarify something" or "let's clarify X" as `/adv-clarify` invocation. Only the literal slash-command form triggers the halt branch. Non-literal "clarify" intent is revision text (per `rq-disc12.2`).

> **Note:** The `/adv-clarify` halt path at Phase 4.5.1 is same mechanism as the Phase 2.5 trigger evaluation halt. Both hand off to `/adv-clarify` with same rerun instruction. Phase 2.5 catches ambiguity findings in proposal scope/User Outcomes; Phase 4.5.1 catches ambiguity introduced by criteria revision text.

5. If revised criteria still need substantial clarification after 3 re-runs, recommend the `/adv-clarify` branch instead of continuing to loop.
6. If criteria are empty or weak, keep the approve option but mark the `/adv-clarify` branch as the recommended path.
7. Do not proceed to Phase 4.6 until acceptance criteria and success criteria are approved.

**Anchor phrase:** `Reply `approve``

**× MUST NOT:** Complete `discovery` gate without criteria approval. Do not invoke `/adv-clarify` directly outside this checkpoint outcome — pause and hand off to user.

### Phase 4.6: Persist Agreement (Inline)

Once criteria are approved at Phase 4.5.1 and all open questions are resolved (or explicitly deferred), write `agreement.md` through `adv_change_update`. The Phase 4.5.1 inline approval is the sign-off — no additional `question` tool prompt.

Suggested structure:

```md
# Agreement

## Objectives

## Success Criteria

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

After Phase 4.5.1 criteria approval and before `discovery` gate completion: call `adv_contract_mint`. Tool parses approved `agreement.md`, validates `ChangeContract`, persists via `contractSetSignal`.

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
