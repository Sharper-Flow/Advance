# Discovery Checklist

Referenced by `/adv-discover`. Enforces rigor to prevent shallow discovery passes that rehash prior research and skip mandatory protocol steps.

> **Document-Only Enforcement**: All items are checked by the agent following `/adv-discover` command instructions. No machine-enforced validators exist for this checklist in the current version.

---

## Protocol Steps

Every discovery MUST execute each step and report results. Mark `[x]` when completed (even if no findings):

- [ ] **Phase 1.0: Cross-Project Origin Validation** — If the change has `cross_project_origin`, validate that the source project path exists, the source project name is recognizable, and the user confirms the origin context is relevant. If no origin field, mark PASS with "local change, no origin".
- [ ] **Phase 1.5: Skill Discovery** — Search trusted skill directories (`~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`), read YAML frontmatter, match keywords against change domain. Output: "Skills Considered" section listing examined skills and match results.
- [ ] **Prior Research Extension** — Search `temp/*.md`, `docs/*-prep.md` (including `/adv-improve` research packs), and archived changes for prior artifacts. Cite each in "Extends" section and add ≥1 new finding beyond what it contained. When a cited pack contains `Competitors & Alternatives` or `Emerging Patterns` sections relevant to an open design question, cite those sections explicitly in the LBP Check.
- [ ] **Conflict & Related-Work Scan** — Run `adv_change_list` (includeArchived), `adv_change_validate`, and `adv_agenda_list`. Output: "Conflict Scan" section with explicit findings or "no conflicts".
- [ ] **Edge Case Investigation** — For each gap identified, document ≥2 edge cases or failure modes. Structural gaps may be marked "N/A: structural" with rationale.
- [ ] **Design Question Depth** — Each open design question must include trust model, blast radius, and alternatives considered annotations.
- [ ] **Draft Spec Delta Shapes** — Each identified delta must have a concrete `rq-*` requirement ID and ≥1 Given/When/Then scenario. If no deltas needed, state "No spec deltas required" with rationale.
- [ ] **P25 Related-Pattern Scan** — Identify the class of bug/gap being addressed and scan for similar patterns elsewhere in the codebase. Output: "Related Pattern Scan" section with matches or "no similar patterns found".
- [ ] **LBP Check** — Verify the likely direction matches long-term best practice. Output: "LBP Check" section with direction and evidence. When the discovery agenda contains ecosystem unknowns or an open design question lists external tools/libraries/services as a realistic option, perform the External-Solution Check: consult any cited `docs/*-prep.md` pack first, and only run new Kagi queries when no relevant pack covers the question. Purely internal changes may state "No external alternatives apply" with rationale.

**Minimum**: All 8 steps must be executed. Skipping a step requires explicit justification in the Discovery Checklist output section.

---

## Edge Case Handling

Graceful degradation rules for each protocol step:

| Step              | Edge case                                            | Handling                                                                                                                                                     |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Origin Validation | No `cross_project_origin` on change                  | Mark PASS with "local change, no origin". Non-blocking.                                                                                                      |
| Origin Validation | Source project path doesn't exist or is inaccessible | Flag as blocking finding. Ask user whether to proceed or close the change.                                                                                   |
| Origin Validation | Source change ID missing                             | Non-blocking. Note "source_change_id not provided — traceability limited" in findings.                                                                       |
| Origin Validation | User rejects the origin context                      | Block agreement. Recommend closing the change or re-creating with correct origin.                                                                            |
| Skill Discovery   | No skills in trusted directories                     | Report "Skills considered: none available". Non-blocking.                                                                                                    |
| Skill Discovery   | SKILL.md has malformed YAML                          | Skip silently per ADV_INSTRUCTIONS.md protocol.                                                                                                              |
| Skill Discovery   | Multiple skills match                                | Load all matching skills, not just the first.                                                                                                                |
| Prior Research    | No prior artifacts exist                             | Report "No prior research found". Non-blocking. If discovery agenda has ecosystem unknowns, note that `/adv-improve {target}` would produce a reusable pack. |
| Prior Research    | Own proposal.md found                                | Do NOT count as "prior" (self-referential).                                                                                                                  |
| Prior Research    | Multiple artifacts in different locations            | Scan all canonical locations (`temp/`, `docs/`, archives).                                                                                                   |
| Prior Research    | `/adv-improve` research pack present                 | Cite `Competitors & Alternatives`, `Emerging Patterns`, and `Applicability to This Repo` sections when relevant; do not silently ignore them.                |
| External-Solution | Ecosystem unknowns or external-alt design question   | Required: consult cited `docs/*-prep.md` pack first, run new Kagi queries only when no relevant pack exists.                                                 |
| External-Solution | Purely internal change (refactor/bug fix/local docs) | Allow "No external alternatives apply" with rationale in LBP Check.                                                                                          |
| Conflict Scan     | `adv_change_validate` returns warnings on own change | Exclude own-change pre-prep warnings (NO_TASKS, NO_DELTAS).                                                                                                  |
| Conflict Scan     | Active changes overlap on same files                 | Surface as coordination question, do not block.                                                                                                              |
| Edge Cases        | Gap is purely structural (no logic)                  | Allow "N/A: structural" with rationale.                                                                                                                      |
| Design Questions  | Single viable direction                              | Annotate "alternatives: none viable, single direction".                                                                                                      |
| Spec Deltas       | New capability needed (no existing spec)             | Draft "rq-NEW* in new capability X".                                                                                                                         |
| P25 Scan          | Zero pattern matches                                 | State "no similar patterns found" explicitly. Do not omit.                                                                                                   |
| P25 Scan          | Many matches found                                   | Cap at top N with rationale for prioritization.                                                                                                              |

---

## Output Section Schema

Discovery output persisted via `adv_change_update` must contain these sections:

| Section                | Required content                           | Format                    |
| ---------------------- | ------------------------------------------ | ------------------------- |
| Discovery Checklist    | Each protocol step with PASS/SKIP + reason | Table                     |
| Skills Considered      | Skill name, match assessment, action taken | Table                     |
| Extends                | Cited artifact, new findings beyond it     | Prose with artifact names |
| Conflict Scan          | Tool results from 3 mandatory calls        | Prose with findings       |
| Current State          | What exists today in code/specs/docs       | Prose                     |
| Edge Cases             | ≥2 per gap (or N/A: structural)            | Table per gap             |
| Open Design Questions  | Trust model + blast radius + alternatives  | Table                     |
| Draft Spec Deltas      | `rq-*` IDs + ≥1 G/W/T per delta            | Structured list           |
| Related Pattern Scan   | Matches or "no similar patterns found"     | Prose                     |
| LBP Check              | Direction + evidence                       | Prose                     |
| Recommended Objectives | Numbered list for the agreement phase      | List                      |
| AMBIGUITY ANALYSIS     | Finding IDs (B1, F1, etc.), severity, evidence quotes, coverage report | Table + coverage line |

---

## Ambiguity Analysis Protocol

Run during `/adv-discover` Phase 2 (Discovery Analysis). Cross-references `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy` for canonical taxonomy, finding shape, severity rubric, and anti-hallucination rule.

### v1 Category Scope

- **Required (v1):** B (Boundaries), F (Functional Scope), S (Completion Signals), M (Missing Information)
- **Optional (v1):** D (Data Assumptions), X (External Dependencies), Q (Quality Attributes), I (Integration Points), E (Error Handling), C (Conformance), T (Temporal Constraints) — agent MAY emit findings; these are NOT gate-blocking in v1

Per UD2 hybrid scope: required categories MUST be scanned; optional categories are at agent discretion.

### Output Section

Emit `### AMBIGUITY ANALYSIS` containing:

1. **Finding table** — one row per finding using the canonical finding shape:
   ```
   {Letter}{N}  {SEVERITY}  {Category}  {Finding text}
     Evidence: {verbatim quote OR `(no {section} section)`}
     Reason: unclear because {X}
   ```
2. **Coverage report line** — `Coverage: B:C F:P S:M D:C X:C Q:P I:N/A E:P C:C T:C S:P M:M` (C=Clear, P=Partial, M=Missing, N/A=Not applicable)

If scan is clean (no findings), emit: `### AMBIGUITY ANALYSIS — no ambiguity findings. Coverage: B:C F:C S:C M:C`

### Trigger Evaluation Rules

After producing the AMBIGUITY ANALYSIS, evaluate findings to determine if `/adv-discover` can proceed:

| Condition | Action |
|-----------|--------|
| CRITICAL ≥ 1 | Halt discovery. Do NOT call `adv_gate_complete gateId: 'discovery'`. Output handoff: "Run `/adv-clarify {change-id}` to resolve CRITICAL findings, then rerun `/adv-discover {change-id}`." |
| HIGH ≥ 2 (no CRITICAL) | Halt discovery. Same handoff as above. |
| Single HIGH only | Warning logged inline. Continue to Phase 3 (Persist Discovery Findings). |
| All clean | Continue to Phase 3. |

Skip trigger evaluation when `clarify_enforcement: 'off'` or when discovery gate is already completed (legacy/in-flight changes).

### Resolution Log

When `/adv-clarify` resolves findings and the user reruns `/adv-discover`:

- Read `## Clarify Resolution Log` section from proposal.md (added by `/adv-clarify`)
- Previously-resolved findings (listed in the log) are excluded from the current trigger count
- Reruns capped at 2 before escalating to user via `question` tool per EC4

### Backwards-Compatibility

Skip the entire Ambiguity Analysis Protocol if the discovery gate is already completed (in-flight changes created before this rollout). Detect via gate-state check.

---

## Completeness Heuristics

Discovery analysis is complete when ALL of the following are true:

- [ ] All 9 protocol steps executed and reported (including origin validation)
- [ ] If cross-project origin exists, it has been validated and confirmed by the user
- [ ] Codebase searched for 3+ key terms from the change
- [ ] All deployed specs scanned for conflicts via `adv_spec action: "search"`
- [ ] Prior research artifacts cited and extended (or "none found")
- [ ] At least one skill discovery pass completed (or "none available")
- [ ] Conflict scan executed with all 3 mandatory tool calls
- [ ] Each identified gap has edge case coverage
- [ ] AMBIGUITY ANALYSIS section present with finding table and coverage report (or "no ambiguity findings" if scan clean)

**Gate requirement**: Discovery gate can be marked complete when all heuristics are satisfied and the agreement phase can proceed with well-formed findings.
