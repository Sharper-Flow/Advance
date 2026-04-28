# Prose-Load Inventory

> **Lifecycle:** WORKING DOC during execution → marked **POST-COMPRESSION ARCHIVE** in T9 → no maintenance owner thereafter.
>
> Durability lives in spec deltas `rq-proseReduction01`–`rq-proseReduction04`, not this file. This inventory is the audit trail for the compression passes (T2/T3/T4/T5) and the planning input for the asset-test audit (T1.5).

## Purpose

Every prose section across ADV instruction surfaces is classified into one of three enforcement classes:

| Class | Compression target |
|---|---|
| **full** | Pointer + constraint table (no paragraph) |
| **partial** | Pointer + constraint table + 1-line gap rationale |
| **inherent** | Structured table/checklist/template (no paragraphs) |

See `docs/command-voice-standard.md § Prose-Load Reduction Rules` for templates and stop condition.

## Scope

In scope (per agreement):
- `ADV_INSTRUCTIONS.md`
- `docs/command-voice-standard.md`
- `.opencode/agents/adv.md`
- `.opencode/command/adv-*.md` (25 files)
- `skills/*/SKILL.md` (6 files)

Out of scope (constraints):
- `~/.config/opencode/instructions/*.md` — user-managed
- `plugin/src/index.ts` PROVIDER_BEHAVIOR_HINTS — provider variant patches
- Manifest descriptions — governed by separate drift test

Sequencing per **UD2** (highest line-count first):

| # | Surface | Lines | Pass |
|---|---|---|---|
| 1 | `ADV_INSTRUCTIONS.md` | 817 | T2/T4/T5 |
| 2 | `docs/command-voice-standard.md` | 706 (was 659; +47 from T0a) | T3/T4/T5 |
| 3 | `.opencode/command/adv-apply.md` | 475 | T3/T4/T5 |
| 4 | `.opencode/command/adv-discover.md` | 471 | T3/T4/T5 |
| 5 | `.opencode/command/adv-research.md` | 397 | T3/T4/T5 |
| 6 | `.opencode/command/adv-prep.md` | 394 | T3/T4/T5 |
| 7 | `.opencode/command/adv-harden.md` | 394 | T3/T4/T5 |
| 8 | `.opencode/agents/adv.md` | 371 | T2/T4/T5 |
| 9 | `.opencode/command/adv-review.md` | 347 | T3/T4/T5 |
| 10 | Remaining 17 command docs | ~2,065 | T3/T4/T5 |
| 11 | 6 skill files | ~845 | (only if classified non-trivially) |

## Inventory Rows

> Rows populated by T1 (full inventory walk). Empty until then.

| Surface | Section | Lines | Class | Target Format | Code Reference | Gap Rationale | Status |
|---|---|---|---|---|---|---|---|
| _populate via T1_ | | | | | | | pending |

## Asset Test Audit

> Section populated by T1.5. Empty until then.

| Test File | Assertion | Type | Backed Spec | Migration Plan | Status |
|---|---|---|---|---|---|
| _populate via T1.5_ | | | | | pending |

## Stop Condition (UD3)

Compression halts when no remaining row in the Inventory table is classified `full` or `partial`. All remaining rows must be `inherent` (handled by re-templating, not compression).

The inventory table is the mechanical oracle for this — when its `full` and `partial` rows are all `Status: done`, T2/T3/T4 are complete. T5 then re-templates `inherent` rows.

## Provenance

| Reference | Role |
|---|---|
| `change/reducepromptloadonadvcontrol/proposal.md` | Why this work exists |
| `change/reducepromptloadonadvcontrol/agreement.md` | Locked AC + UD1–UD4 + AD1–AD5 |
| `change/reducepromptloadonadvcontrol/design.md` | KD1–KD8, including taxonomy and templates |
| `.adv/specs/advance/spec.json` § rq-proseReduction01–04 | Durable invariants (added by T0c) |
| `plugin/src/manifest-doc-drift.test.ts` | Drift enforcement (extended by T7) |
