## Why

Token economics: every line in a command file enters context whenever that command's domain is touched. Skills load on-demand only when `skill()` fires.

Command file sizes today (6409 total lines across 27 files):
- High-frequency workflow commands (apply/review/harden/archive/prep/discover/design/proposal/research) — methodology correctly absorbed inline per existing pattern.
- Low-frequency / user-triggered commands carry inline methodology that pays full token cost on every session: adv-triage (737), adv-cleanup (244), adv-reflect (230), adv-improve (171), adv-clarify (123), adv-audit (100), adv-refactor (88).
- All command bodies previously compressed by `reducepromptloadonadvcontrol` (T2–T5 passes) but have grown since. Maintenance pass needed on delta.
- adv-slop-scan (256L) has a skill but still carries heavy inline methodology.

Existing thin-command reference: `adv-tron` (61L) → `skill("adv-tron")` → "If the skill is unavailable, continue with the embedded protocol in this command file." Pattern confirmed across adv-comp-scan and adv-arch-scan.

## What Changes

Two-dimensional optimization:

**Structural (skill extraction):** Extract methodology from 7 low-frequency commands + deepen extraction of adv-slop-scan. New `skills/adv-{domain}/SKILL.md` files. Command files become thin orchestration shells (~60-100L). Inline fallback stub preserved per existing pattern. Targets:
- adv-triage (737L) — biggest win
- adv-cleanup (244L)
- adv-reflect (230L)
- adv-improve (171L)
- adv-clarify (123L)
- adv-audit (100L)
- adv-refactor (88L)
- adv-slop-scan (256L) — deepen existing skill extraction

**Compression (caveman-full maintenance pass per P34):** Re-apply caveman-full across all 27 command files + new skill files. Previous compression pass (T2–T5) covered these files but they've grown since. Apply within existing enforcement-class framework (full/partial/inherent per `docs/prose-load-inventory.md`).

**Folded scope:** `updateAdvTriagePhase3bUse` — closed as superseded. Phase 3b question-tool intent carried forward in adv-triage skill extraction.

**Infrastructure:** Update `ADV_INSTRUCTIONS.md § Command vs Skill Boundaries` classification table.

## Discovery Findings

### Key Decisions (Agent-Resolved)

| Agenda Item | Decision | Rationale |
|---|---|---|
| Naming convention | `adv-{command}` (same name for command and skill) | Matches adv-tron pattern; simpler agent discovery |
| Fallback stub depth | Orchestration skeleton (phase headers + constraints + tool table); no methodology duplication | adv-tron proves this pattern works |
| Caveman boundary | Apply within existing enforcement-class framework | Framework already defines preserved vs compressible tokens |
| Small commands (clarify/audit/refactor) | Extract all three | Consistency > marginal savings |
| Existing skill-backed audit | comp-scan, arch-scan: no further extraction. slop-scan: deepen extraction | slop-scan at 256L is inconsistent with other skill-backed commands |
| Order of operations | Extract first, compress after | Compression work not thrown away during restructuring |
| adv-roadmap | Out of scope (136L, compression only) | Close to thin threshold; not worth skill creation |
| Verification | Automated contract-token grep + line-count delta + sync-global.sh --check | Three-layer verification |
| Caveman for skill files | Same caveman-full as commands | P34 applies uniformly to instruction files |

### Spec Deltas

- `rq-proseReduction05` — skill files must comply with enforcement-class compression framework
- `rq-skillClassification01` — classification table must reflect extracted commands

## Success Criteria

1. All 8 target commands have a matching `skills/adv-{domain}/SKILL.md` file synced via `scripts/sync-global.sh`
2. Each thin command file ≤ 120 lines (reference: adv-tron 61L, adv-arch-scan 109L)
3. Each thin command preserves inline fallback stub per existing pattern
4. All 27 command files pass caveman-full maintenance compression with technical accuracy verified
5. Contract tokens preserved verbatim across all compressed files (tool names, gate IDs, MUST/NEVER, slash commands, code blocks, status markers)
6. `scripts/sync-global.sh --check` reports clean (skills synced, no drift)
7. `updateAdvTriagePhase3bUse` intent carried forward in adv-triage skill content
8. adv-slop-scan deepened to ≤ 120 lines with residual methodology in existing `adv-slop-detection` skill
9. Total command-surface line reduction ≥ 30% across affected files
10. No regression in any command's documented workflow — every Phase / Step / Gate behavior preserved
11. ADV_INSTRUCTIONS.md § Command vs Skill Boundaries classification table updated to reflect all extractions

## Affected Code

- `.opencode/command/adv-*.md` — all 27 command files (extraction + compression)
- `skills/adv-{domain}/SKILL.md` — 7 new skill files + update to `skills/adv-slop-detection/SKILL.md`
- `~/.config/opencode/skills/adv-*/` — global sync target (managed by sync-global.sh)
- `ADV_INSTRUCTIONS.md § Command vs Skill Boundaries` — classification table update
- `.adv/specs/advance-meta/spec.json` — spec deltas rq-proseReduction05, rq-skillClassification01

## Related Repositories

Single-repo. No cross-repo scope.

## Constraints

- P34 (caveman-instructions): compression must preserve intent + technical accuracy; comment escapes where compression would lose meaning
- Enforcement-class framework: `full` → pointer+table, `partial` → pointer+table+1-line gap, `inherent` → structured form
- Skills MUST NOT mutate ADV state; commands MUST remain functional if skill missing (fallback stub mandatory)
- Skills must be named `adv-{domain}` to match sync-global.sh hard-coded prefix
- Contract tokens non-negotiable: tool names, gate IDs, enum values, MUST/NEVER, slash commands, quoted errors, JSON examples, code blocks
- High-frequency workflow commands stay inline-heavy per existing rationale; compression only

## Impact

**Performance:** Lower default context load. Methodology lives in skills, only paid when command fires.

**Maintenance:** Skills become reusable; methodology updates land in one place instead of duplicated across commands.

**Risk:** Skill load failures fall back to inline stub. Caveman compression risks introducing ambiguity if applied carelessly to contract-bearing prose — mitigated by enforcement-class framework + contract-token grep verification.

**Compatibility:** No behavioral changes to any command's workflow. Tool calls, gate transitions, state mutations unchanged.

## Context

- Active change `fixForcedWorktreeDelete` (design gate) — no file overlap, safe parallel
- Prior compression pass: `reducepromptloadonadvcontrol` (archived) — T2–T5 done, inventory at `docs/prose-load-inventory.md`
- Reference thin-commands: adv-tron (61L), adv-comp-scan (86L), adv-arch-scan (109L)
- Existing skills: 8 in `skills/`, all `adv-` prefixed for sync

## Scope

### In Scope

- 7 new skill extractions: adv-triage, adv-reflect, adv-cleanup, adv-improve, adv-clarify, adv-audit, adv-refactor
- Deepen extraction of adv-slop-scan
- Caveman-full maintenance compression of all 27 command files + all new/modified skill files
- ADV_INSTRUCTIONS.md § Command vs Skill Boundaries classification table update
- Spec deltas rq-proseReduction05, rq-skillClassification01
- Verification: contract-token grep, line-count delta, sync-global.sh --check

### Out of Scope

- High-frequency workflow command behavior changes (apply/review/harden/archive/prep/discover/design/proposal/research) — compression only, no extraction
- Modifying `scripts/sync-global.sh` (verify only)
- Creating new commands or removing existing commands
- Changes to ADV plugin source code (`plugin/src/`)
- Changes to skill loading mechanism in OpenCode itself
- Cross-repo work
- adv-status (73L), adv-validate (46L), adv-atc (36L), adv-tron (61L), adv-idea (97L), adv-roadmap (136L), adv-proposal (174L), adv-task (122L), adv-problem (112L) — compression only, no extraction
- Performance benchmarking
- Reflection-protocol tool changes