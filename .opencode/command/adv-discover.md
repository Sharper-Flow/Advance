---
name: adv-discover
description: Gather context, analyze current state, and identify objectives
---

# ADV Discover — Establish Discovery Findings

Gather the current-state evidence needed to move from proposal into a shared agreement. This command completes the `discovery` gate and prepares `/adv-agree`.

> **CHECKLIST**: Follow [docs/checklists/discover-checklist.md](../../docs/checklists/discover-checklist.md).

## Command Boundary

**Produces:** Discovery findings, current-state analysis, blocker/options summary, recommended objectives for agreement.

**× MUST NOT:** Create tasks, complete non-discovery gates, skip LBP validation when multiple viable directions exist.

**Gate:** Completes `discovery`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → select via `question` tool
3. If none exist → stop and suggest `/adv-proposal`

---

## Phase 0: Load Skill

`skill("adv-discover-methodology")` → provides 9-step analysis protocol, output schema, edge case handling, and graceful degradation rules. If the skill is unavailable, continue with the embedded protocol in this command file.

---

## Phase 1: Load Context

- `adv_change_show` for the target change
- `adv_gate_status` to confirm proposal is already complete
- `adv_spec action: "list"` and `adv_spec action: "show"` for affected capabilities
- Use `lgrep`/`read` to inspect the relevant code paths, interfaces, and constraints

If the proposal gate is still pending → stop and direct the user to `/adv-proposal` first.

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

| Section | Required content |
|---------|-----------------|
| **Discovery Checklist** | Table of all protocol steps with PASS/SKIP + reason |
| **Skills Considered** | Examined skills with match assessment (from Phase 1.5) |
| **Extends** | Prior research artifacts cited + ≥1 new finding per artifact (or "No prior research found") |
| **Conflict Scan** | Results from Phase 1.6 (or "no conflicts") |
| **Current State** | What exists today in code/specs/docs |
| **Edge Cases** | ≥2 per identified gap (or "N/A: structural" with rationale) |
| **Open Design Questions** | Each with trust model + blast radius + alternatives considered |
| **Draft Spec Deltas** | `rq-*` IDs + ≥1 Given/When/Then per delta (or "No spec deltas required" with rationale) |
| **Related Pattern Scan** | Results from Phase 1.7 |
| **LBP Check** | Whether likely direction matches long-term best practice |
| **Recommended Objectives** | Numbered list for `/adv-agree` |

### Prior Research Extension

Search these locations for prior artifacts:
- `temp/*.md` — brainstorm or prep documents
- `docs/*-prep.md` — research preparation documents
- Archived changes — `adv_change_list includeArchived: true` → inspect relevant archives

**Rules:**
- Cite each found artifact in the "Extends" section
- Add ≥1 new finding not present in the cited artifact
- Do NOT count the change's own `proposal.md` as "prior research" (self-referential)
- No prior artifacts → report "No prior research found" (non-blocking)

### Edge Case Investigation

For each gap identified:
- Document ≥2 edge cases or failure modes
- Consider: null/undefined traps, type coercion, error paths, concurrency, boundary conditions
- Structural gaps (no logic) may be marked "Edge cases: N/A — structural" with rationale

### Design Question Depth

Each open design question MUST include:

| Annotation | Description |
|-----------|-------------|
| **Trust model** | Agent-only, user-only, or joint? |
| **Blast radius** | What breaks or changes if chosen wrong? |
| **Alternatives** | Viable options with recommendation (or "none viable, single direction") |

### LBP and Tradeoffs

If there are 2+ viable approaches with user-value tradeoffs, use the prioritizer workflow before asking questions.

---

## Phase 3: Persist Discovery Findings

Update the proposal artifact with the discovery findings so `/adv-agree` can present them cleanly.

- Use `adv_change_update` to refine proposal content
- Keep findings concise and decision-oriented
- Do not create `agreement.md` here

---

## Phase 4: Complete Gate

`adv_gate_complete changeId: {change-id} gateId: discovery`

If the gate cannot be completed, surface the blocking reason and stop.

---

## Output

Emit DISCOVERY COMPLETE with:

- target change
- current-state summary
- objectives
- constraints
- open blockers/questions for `/adv-agree`

```
/adv-discover {change-id} COMPLETE
Result: discovery findings recorded
Discovery Gate: MARKED COMPLETE
Next: /adv-agree {change-id}
```
