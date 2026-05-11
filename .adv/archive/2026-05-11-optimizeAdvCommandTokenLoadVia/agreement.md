# Agreement

## Objectives

1. Extract methodology from 8 commands into dedicated skills (7 new + 1 deepened)
2. Re-apply caveman-full compression across all 27 command files and new/modified skill files
3. Update ADV_INSTRUCTIONS.md § Command vs Skill Boundaries classification table
4. Add spec deltas for skill file compression and classification tracking

## Acceptance Criteria

1. **AC1:** All 8 target commands have `skills/adv-{domain}/SKILL.md` synced by `scripts/sync-global.sh --check`
2. **AC2:** Each thin command ≤ 120 lines; adv-slop-scan ≤ 120 lines post-deepening
3. **AC3:** Each thin command has Phase 0/1 `skill("adv-{domain}")` load + inline fallback stub
4. **AC4:** Contract tokens (tool names, gate IDs, MUST/NEVER, slash commands, code blocks, status markers) preserved verbatim across all modified files — verified by automated grep
5. **AC5:** `scripts/sync-global.sh --check` reports clean after all extractions
6. **AC6:** ADV_INSTRUCTIONS.md § Command vs Skill Boundaries table lists all 8 commands under "Dedicated skill" or "Shared skill" (slop-scan remains shared)
7. **AC7:** Total command-surface line reduction ≥ 30% across the 8 affected files
8. **AC8:** No behavioral regression — every Phase/Step/Gate from original commands preserved in skill files

## Constraints

- **C1:** Skills MUST NOT mutate ADV state (no adv_change_create, adv_task_add, adv_gate_complete in skill content)
- **C2:** Commands MUST remain functional if skill unavailable (fallback stub mandatory)
- **C3:** Skill naming must be `adv-{domain}` for sync-global.sh compatibility
- **C4:** High-frequency workflow commands stay inline-heavy — compression only
- **C5:** Enforcement-class framework governs compression boundaries (full/partial/inherent)
- **C6:** Extract first, compress after (order of operations)

## Avoidances

- **DONT1:** Do NOT modify plugin source code (`plugin/src/`)
- **DONT2:** Do NOT modify `scripts/sync-global.sh`
- **DONT3:** Do NOT create new commands or remove existing ones
- **DONT4:** Do NOT extract high-frequency workflow commands into skills
- **DONT5:** Do NOT change any command's behavioral workflow (phases, gates, tool calls)

## Decisions

### User Decisions

- **UD1:** Caveman intensity = full (not lite or ultra)
- **UD2:** Single ADV change (not split)
- **UD3:** Fold `updateAdvTriagePhase3bUse` into this change
- **UD4:** All small commands (clarify/audit/refactor) get extracted (consistency over marginal savings)
- **UD5:** One commit per command extraction (atomic, reviewable)
- **UD6:** Skip agent-created metadata in skill frontmatter — standard frontmatter only
- **UD7:** No subcategory in classification table — keep 5-class model

### Agent Decisions (LBP)

- **AD1:** Skill naming = `adv-{command}` (same as command identifier)
- **AD2:** Fallback stub = orchestration skeleton (phase headers + constraints + tool table), no methodology duplication
- **AD3:** adv-slop-scan deepened (not deferred) — 256L inconsistent with other skill-backed commands
- **AD4:** adv-roadmap excluded from extraction (136L, borderline)
- **AD5:** Extract first, compress after — avoids wasting compression work on restructured files
- **AD6:** Verification = contract-token grep + line-count delta + sync-global.sh --check

## Deferred Questions

None — all discovery agenda items resolved.

## Sign-Off

AC approved by user at Phase 4.5.1 (Tier A whitelist match: "approve").