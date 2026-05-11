# Proposal: Adopt mattpocock/skills methodology

## Summary

Adopt mattpocock/skills methodology in four phases:
1. Vendor 4 standalone skills (diagnose, zoom-out, prototype, adv-skill-author)
2. Introduce CONTEXT.md + docs/adr/ as ADV-consumed domain artifacts
3. Refactor existing adv-* skills to progressive-disclosure authoring style
4. Explicitly exclude overlap skills (grill-*, to-prd, to-issues, triage, tdd)

## Success Criteria

- **SC1** Four new skills available globally after `sync-global.sh --fix`: `diagnose`, `zoom-out`, `prototype`, `adv-skill-author`. Each SKILL.md ≤100 lines, MIT attribution preserved.
- **SC2** `CONTEXT.md` and `docs/adr/NNNN-*.md` defined as first-class ADV-consumed artifacts with a backing capability spec covering which gates read/write them.
- **SC3** Diagnose skill wired into `ADV_INSTRUCTIONS.md` Doom Loop Detection section as escalation reference.
- **SC4** ADR-sparingly rubric (hard-to-reverse + surprising-without-context + result-of-real-tradeoff) documented as `/adv-design` decision rubric.
- **SC5** ≥5 existing adv-* skills with >150-line SKILL.md refactored to `<what-to-do>` / `<supporting-info>` split. SKILL.md size reduced ≥40% per refactored skill via offloading content to sibling reference docs.
- **SC6** Exclusion list (grill-*, to-prd, to-issues, triage, tdd) documented with rationale in skill-registry doc or ADV_INSTRUCTIONS.md Skill Discovery section.

## Acceptance Criteria

- **AC1** `ls ~/.config/opencode/skills/` shows `diagnose`, `zoom-out`, `prototype`, `adv-skill-author` after `sync-global.sh --fix`.
- **AC2** New requirement (e.g. `rq-domainContext01`) exists in `.adv/specs/` defining CONTEXT.md format expectations and which ADV phases consume it.
- **AC3** `ADV_INSTRUCTIONS.md` Doom Loop Detection section references diagnose skill phase 1 (feedback-loop construction) as escalation path.
- **AC4** `.opencode/command/adv-design.md` references ADR-sparingly rubric and emits ADR draft when criteria met.
- **AC5** Each refactored existing skill: `wc -l SKILL.md` ≤100 lines; overflow content in sibling `*.md` files (REFERENCE.md, EXAMPLES.md, or domain-named).
- **AC6** Exclusion rationale visible to agents at skill-selection time (registry doc or instructions).
- **AC7** All existing test suites pass; no behavior regression in current adv-* commands.

## Out of Scope

- Replacing `/adv-clarify`, `/adv-proposal`, `/adv-triage`, `/adv-prep` clarification, TDD Protocol, or any gate-bound ADV workflow with Pocock equivalents
- Forking or vendoring the entire mattpocock/skills repo
- Modifying current adv-* command behavior — only their backing skills' authoring style
- Migration tooling for users with pre-existing CONTEXT.md/docs/adr/ in non-ADV format
- Auto-creating CONTEXT.md or first ADR for existing repos — lazy creation only
- Promoting Pocock's installer (`npx skills@latest`) as an ADV-recommended path
- Adopting Pocock skills currently classified as overlap (grill-*, to-prd, to-issues, triage, tdd)

## Constraints

- MIT license inherits; attribution preserved in vendored skills (header comment + attribution in skill README)
- No process duplication — exclusion list is binding
- No machine-enforced TDD outside existing RSTC protocol
- Existing adv-* skill rename/refactor must not break command files that reference them by current name
- CONTEXT.md + ADR are advisory artifacts; they don't gate-block until explicit spec promotion in a future change

## Open Ambiguities (MEDIUM, non-blocking)

- **F1** Wiring depth of diagnose skill into Doom Loop Detection (doc reference vs structural escalation hook)
- **S1** Which 5 of 11 candidate >150-line adv-* skills get refactored (agent choice vs user-prescribed list)

Resolve in `/adv-discover` or via `/adv-clarify`.