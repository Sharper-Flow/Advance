# Agreement

## Objectives

1. **Vendor 4 Pocock skills** into `skills/` with MIT attribution: `adv-diagnose` (with `scripts/hitl-loop.template.sh`), `adv-zoom-out` (single file), `adv-prototype` (with `LOGIC.md` + `UI.md` supporting docs), `adv-skill-author` (renamed from `write-a-skill`). All vendored skills get `adv-` prefix to match `scripts/sync-global.sh` glob and existing skill-naming convention.
2. **Define CONTEXT.md + docs/adr/ as ADV-consumed domain artifacts** via a new capability spec covering format, location, and which phases read/write them.
3. **Content-split the 5 largest >150-line adv-* skills** to progressive-disclosure authoring. Initial target list: `adv-triage` (638), `adv-ci-release` (388), `adv-slop-detection` (230), `adv-backend-stack-eval` (199), `adv-audit` (189). Each gets SKILL.md as index + core protocol; deep-dive content moves to sibling reference docs per natural domain.
4. **Wire diagnose skill into Doom Loop Detection** as a documented protocol: `ADV_INSTRUCTIONS.md § Doom Loop Detection` references the diagnose skill's Phase 1 (feedback-loop construction) as the recommended pre-escalation step. No structural change to the existing 3-failure → `[ADV:BLOCKED]` → user-question trigger.
5. **Document ADR-sparingly rubric in `/adv-design`** — extend `.opencode/command/adv-design.md` Phase 2 to reference the 3-criteria rubric (hard-to-reverse + surprising-without-context + result-of-real-tradeoff) and emit an ADR draft when criteria met.
6. **Document the exclusion list** with rationale in `ADV_INSTRUCTIONS.md` Skill Discovery Protocol section: `grill-me`, `grill-with-docs`, `to-prd`, `to-issues`, `triage`, `tdd` are out-of-scope because their ADV equivalents are gate-bound and machine-enforced.

## Acceptance Criteria

- **AC1** After `./scripts/sync-global.sh --fix`: `ls ~/.config/opencode/skills/` contains `adv-diagnose`, `adv-zoom-out`, `adv-prototype`, `adv-skill-author`. Each retains its source files (e.g. adv-diagnose's `scripts/hitl-loop.template.sh`, adv-prototype's `LOGIC.md` and `UI.md`). LICENSE attribution recorded in `LICENSE-THIRD-PARTY.md`.
- **AC2** New capability spec `domain-context` exists at `.adv/specs/domain-context/spec.json` with at minimum `rq-domainContext01` (CONTEXT.md format + consumers) and `rq-domainContextADR01` (docs/adr/ format + consumers). Spec passes `adv_spec list` and shows ≥2 requirements.
- **AC3** All 5 target skills content-split to progressive-disclosure form: SKILL.md becomes index + core protocol; deep-dive content moves to sibling reference docs per natural domain. SKILL.md first-load target: ≤150 lines for skills with 3+ natural domains (adv-triage, adv-ci-release, adv-slop-detection, adv-backend-stack-eval); ≤200 lines for cohesive skills (adv-audit). No arbitrary line cap — split is driven by domain cohesion. All existing references to those skills (commands, instructions, other skills) still resolve. Sync extension (ADR-002) ensures sibling docs reach `~/.config/opencode/skills/`.
- **AC4** `ADV_INSTRUCTIONS.md § Doom Loop Detection` references `skill("adv-diagnose")` as the recommended Phase-1 protocol before user-escalation. Reference appears as a documented "see also" link, not a behavioral change.
- **AC5** `.opencode/command/adv-design.md` Phase 2 (or new sub-phase) describes the ADR-sparingly rubric and how to draft an ADR when met. Reference to `ADR-FORMAT.md` (vendored alongside `domain-context` spec docs).
- **AC6** `ADV_INSTRUCTIONS.md § Skill Discovery Protocol` (or adjacent section) lists the 6 excluded Pocock skills with one-line rationale per skill.
- **AC7** Full test suite passes (`pnpm test` from `plugin/`). `pnpm run check` passes. No regression in existing adv-* command files.
- **AC8** `docs/prose-load-inventory.md` updated per `rq-proseReduction03` to reflect the new file structure for the 5 content-split skills. Per refactor: surface, section, line count, enforcement class (full/partial/inherent), code reference, gap rationale, status.

## Constraints

- **MIT license compliance** — preserve copyright header in each vendored skill SKILL.md. Add `LICENSE-THIRD-PARTY.md` at repo root crediting `mattpocock/skills`.
- **No process duplication** — exclusion list is binding. If a future change wants to adopt an excluded skill, it must justify against ADV equivalents in its own proposal.
- **No machine-enforced TDD outside RSTC** — diagnose skill stays advisory; it does not block any ADV gate.
- **No command-file behavior changes** — existing adv-* command files referenced by their backing skill names must continue to work. Skill content-splits move content to sibling docs but don't rename SKILL.md or remove the skill directory.
- **CONTEXT.md + ADR are advisory artifacts** — they don't gate-block any phase until explicit spec promotion in a future change.
- **Lazy creation only** — no scripts auto-scaffold CONTEXT.md or first ADR for existing repos.
- **Sync extension is whole-directory** — ADR-002 changes sync to copy entire skill dir, not just SKILL.md. Existing skills not affected (their dirs only contain SKILL.md, so new sync is a no-op for them).

## Scope (resolves clarify-readiness warning)

**Affected files:**
- `skills/adv-diagnose/`, `skills/adv-zoom-out/`, `skills/adv-prototype/`, `skills/adv-skill-author/` (new directories with vendored content)
- `skills/adv-triage/`, `skills/adv-ci-release/`, `skills/adv-slop-detection/`, `skills/adv-backend-stack-eval/`, `skills/adv-audit/` (content-split: SKILL.md trimmed, new sibling `*.md` reference docs added)
- `.adv/specs/domain-context/spec.json` (new capability spec)
- `ADV_INSTRUCTIONS.md` (Doom Loop Detection See-also link; Skill Discovery Protocol exclusion list)
- `.opencode/command/adv-design.md` (Phase 2 ADR-sparingly rubric reference; Phase 3 optional ADR Drafts section)
- `LICENSE-THIRD-PARTY.md` (new attribution file at repo root)
- `docs/prose-load-inventory.md` (inventory rows updated for the 5 content-split skills per `rq-proseReduction03`)
- `scripts/sync-global.sh` (skill-copy block: single-file → whole-directory, ~4 lines changed)
- `docs/adr/0001-adv-prefix-vendored-skills.md`, `docs/adr/0002-skill-sync-whole-directory.md` (dogfood ADRs for the 2 design decisions)
- Tests: existing asset/command/skill tests verified; new asset test for `domain-context` spec presence

**Not affected:**
- Plugin runtime code (`plugin/src/tools/`, `plugin/src/storage/`, etc.)
- Existing adv-* command files (`.opencode/command/adv-*.md`) except `adv-design.md`
- Validator code (`plugin/src/validator/`)
- ADV gate machine, Temporal workflows, all tool implementations
- Other existing skills not in the 5-content-split target list

## Error Handling & Rollback (resolves clarify-readiness warning)

**Failure modes:**
1. **Vendored skill name collision** — verified: no existing adv-diagnose/adv-zoom-out/adv-prototype/adv-skill-author. If introduced post-discovery by a peer session, halt and rename.
2. **Sync extension breaks existing skill installs** — additive change only (copies more files, never fewer). Test via `--dry-run --diff` before commit. Existing skills with only SKILL.md remain unaffected.
3. **Content-split breaks references** — covered by AC7 test suite + manual grep audit. If a command file references skill content that moves to a sibling doc, update the reference in the same task.
4. **New `domain-context` spec causes `adv_change_validate` failure** — spec uses `should` priority, not `must`. Verify with `adv_change_validate` during P7.
5. **Doom Loop Detection wording drift** — text change is additive only (a "See also" link). Existing 3-fail trigger remains.
6. **Inventory update misses a skill** — AC8 audit step verifies all 5 refactored skills appear with `rq-proseReduction03`-compliant rows.

**Rollback:**
- All changes confined to skills/, specs/, docs/, instructions, sync-global.sh. No runtime code touched. Rollback = git revert of the change branch before merge to trunk. No data migration needed.
- Spec rollback: removing `.adv/specs/domain-context/spec.json` returns the project to current behavior. CONTEXT.md and docs/adr/ artifacts (if any users created) remain on disk but become uncovered by spec — harmless.
- Sync rollback: revert `scripts/sync-global.sh` to single-file copy. Sibling docs created in content-split would no longer reach global skills dir, but repo content remains.

## Avoidances

- × Replacing any ADV-gate-bound workflow (`/adv-clarify`, `/adv-proposal`, `/adv-triage`, `/adv-prep`, RSTC TDD Protocol)
- × Forking or vendoring the entire mattpocock/skills repo
- × Modifying current adv-* command behavior beyond `/adv-design` ADR rubric addition
- × Migration tooling for users with pre-existing CONTEXT.md / docs/adr/ in non-ADV format
- × Auto-scaffolding domain artifacts; lazy creation only
- × Promoting Pocock's installer (`npx skills@latest`) as an ADV-recommended path
- × Adopting overlap skills (`grill-me`, `grill-with-docs`, `to-prd`, `to-issues`, `triage`, `tdd`)
- × Adding gate-blocking behavior to CONTEXT.md / ADR presence
- × Machine-enforced TDD outside the existing RSTC protocol
- × Arbitrary line caps on SKILL.md — splits driven by domain cohesion, not numeric targets

## Resolved Ambiguities

| ID | Question | Resolution |
|---|---|---|
| **F1** | Wiring depth of diagnose skill into Doom Loop Detection — doc reference vs structural escalation hook? | **Doc reference.** ADV_INSTRUCTIONS.md gains a "See also" link to `skill("adv-diagnose")` as the Phase-1 protocol before the existing 3-fail → user-question escalation. No new behavioral trigger. |
| **S1** | Which 5 of 11 candidate >150-line skills get refactored? | **Top 5 by size**: `adv-triage` (638), `adv-ci-release` (388), `adv-slop-detection` (230), `adv-backend-stack-eval` (199), `adv-audit` (189). Each skill verified to have ≥3 natural split domains during design. Remaining 6 candidates (adv-reflect 181, adv-improve 181, adv-cleanup 172, adv-user-intuit 155, adv-refactor 155, adv-clarify 145) deferred to a future change. |

## Design Compromise (appended after design analysis)

During `/adv-design` Phase 3.5 validation and follow-up audit, two issues surfaced that required AC3 reframing:

1. **`rq-skillProseCompression01` already applied (T6 pass).** All 5 target skills appear in `docs/prose-load-inventory.md` with `status: done` for the enforcement-class prose compression pass. They're classified `inherent` (structured tables) or `partial` (template + pointer). Further prose compression would damage signal.

2. **AC3's "≤100 lines" cap was conceptually wrong.** It conflated two distinct compression frameworks: ADV's enforcement-class prose-reduction (already done) vs. Pocock's content-splitting (orthogonal, what this change actually adopts). The skills aren't bloated prose — they hold structured content (rubrics, schemas, prompts) that's already at compression target.

**Amendment to AC3:** Replaced the `≤100` arbitrary cap with cohesion-driven content-splitting targets (`≤150` for skills with 3+ natural domains; `≤200` for cohesive skills). All 5 skills remain in scope. The refactor splits single-file skills into SKILL.md (index + core protocol) + sibling reference docs (one per natural domain).

**Amendment to objectives:** New AC8 added — `docs/prose-load-inventory.md` updated per `rq-proseReduction03` to reflect new file structure. The 5 refactored skills need new inventory rows.

**Approval evidence:** User reply "i like your revisions. continue." (Tier A inline approval on the revised compromise) on 2026-05-11. Initial 5→2 drop was correctly challenged by user; subsequent per-skill cohesion analysis restored all 5 to scope.

**Why this isn't a scope reduction:** Same 4 phases. Same 5 skills. Same 4 vendored skills. Same domain-context spec. Same exclusion list. Only the AC3 framing changed (line cap → cohesion-driven split) and inventory-update sub-task was added.

## Confidence

**High** — change is documentation + skill-content reorganization + new advisory spec + sync-script extension. No runtime code touched. Failure surface is narrow and bounded by AC7 (test suite). Pocock library is MIT-licensed, attribution-trackable. Design phase validator (CAUTION verdict) findings incorporated. Two ADRs (ADR-001 prefix, ADR-002 sync) record the structural decisions for posterity.