# Discovery Checklist

Referenced by `/adv-discover`. Enforces rigor to prevent shallow discovery passes that rehash prior research and skip mandatory protocol steps.

> **Document-Only Enforcement**: All items are checked by the agent following `/adv-discover` command instructions. No machine-enforced validators exist for this checklist in the current version.

---

## Protocol Steps

Every discovery MUST execute each step and report results. Mark `[x]` when completed (even if no findings):

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
| Recommended Objectives | Numbered list for `/adv-agree`             | List                      |

---

## Completeness Heuristics

Discovery analysis is complete when ALL of the following are true:

- [ ] All 8 protocol steps executed and reported
- [ ] Codebase searched for 3+ key terms from the change
- [ ] All deployed specs scanned for conflicts via `adv_spec action: "search"`
- [ ] Prior research artifacts cited and extended (or "none found")
- [ ] At least one skill discovery pass completed (or "none available")
- [ ] Conflict scan executed with all 3 mandatory tool calls
- [ ] Each identified gap has edge case coverage

**Gate requirement**: Discovery gate can be marked complete when all heuristics are satisfied and `/adv-agree` can proceed with well-formed findings.
