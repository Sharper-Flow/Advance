# Design

## Architecture Overview

The change applies a **two-layer pattern** to ADV command files:

```
┌─────────────────────────────────────────────────────────┐
│ Command file (.opencode/command/adv-{name}.md)           │
│ - Frontmatter, manifest, UserRequest                     │
│ - Phase orchestration (headers + tool calls)             │
│ - Constraints + Tool table                               │
│ - "Phase 0/1: Load Skill" → skill("adv-{name}")          │
│ - Inline fallback stub (orchestration only, no methodology)│
│ Target: ≤120 lines (caveman-full compressed) — KD8 escape ≤150L ACTIVE │
└─────────────────────────────────────────────────────────┘
                            ↓ loads on-demand
┌─────────────────────────────────────────────────────────┐
│ Skill file (skills/adv-{name}/SKILL.md)                  │
│ - YAML frontmatter: name, description, keywords          │
│ - Purpose / scope                                        │
│ - Methodology (rubrics, criteria, templates, examples)   │
│ - Edge cases / graceful degradation                      │
│ - Output schemas / report formats                        │
│ - Anti-patterns                                          │
│ Target: ≤300 lines soft-target (caveman-full compressed) │
└─────────────────────────────────────────────────────────┘
```

The pattern is proven by `adv-tron` (61L command + 138L skill), `adv-comp-scan` (86L + 76L), `adv-arch-scan` (109L + 102L), and `adv-slop-scan/harden → adv-slop-detection` (256L+442L + 143L).

`scripts/sync-global.sh` syncs `skills/adv-*/SKILL.md` → `~/.config/opencode/skills/adv-*/SKILL.md` (hard-coded `adv-` prefix at line 1323).

## Key Decisions

### KD1: Split boundary = "What" vs "How"

| Layer | Owns |
|---|---|
| Command | Phase sequencing, tool calls, gate completions, status markers, user-facing prompts, target resolution |
| Skill | Detection rubrics, scoring formulas, output templates, edge case handling, anti-patterns, examples |

Test: if removing content from the command file would make the agent unable to know *which tool to call next*, it belongs in the command. If removing it would make the agent unable to know *how to interpret the result*, it belongs in the skill.

### KD2: Skill naming = same as command identifier

All 7 new skills: `adv-triage`, `adv-reflect`, `adv-cleanup`, `adv-improve`, `adv-clarify`, `adv-audit`, `adv-refactor`. Matches adv-tron precedent. Existing divergent-name skills (slop-detection, comp-research, arch-detection) are NOT renamed (out of scope).

### KD3: Fallback stub depth = orchestration skeleton only

Thin command contains: phase headers with one-line tool-call summary, constraints, key tools table. Does NOT contain methodology, rubrics, examples, anti-patterns. Fallback "Continue with embedded protocol" = agent executes orchestration with degraded methodology, surfacing the limitation.

### KD4: Compression operates within enforcement-class framework

Per `docs/prose-load-inventory.md`:
- `full` class → pointer + constraint table (no paragraph)
- `partial` class → pointer + constraint table + 1-line gap rationale
- `inherent` class → structured table/checklist/template (no paragraphs)

Caveman-full is the *wording-density layer* applied to compressible prose. Contract tokens (tool names, gate IDs, MUST/NEVER, slash commands, code blocks, JSON examples, quoted errors, enum values, status markers) are never compressed.

### KD5: Extraction order = heaviest-first within atomic commits

Per UD5 (one commit per extraction):
1. adv-triage (737L) — biggest win, highest risk
2. adv-slop-scan (256L) — deepen existing skill
3. adv-cleanup (244L)
4. adv-reflect (230L)
5. adv-improve (171L)
6. adv-clarify (123L)
7. adv-audit (100L)
8. adv-refactor (88L)

Then: 9. Compression maintenance pass + inventory update 10. Classification table update 11. Spec deltas

### KD6: Skill file caveman-full compression

New skill files compressed by same caveman-full standard as commands. Governed by spec delta `rq-proseReduction05`. Existing skills NOT retroactively compressed.

### KD7: adv-slop-scan deepening strategy

Remove methodology already in `adv-slop-detection` skill from command file. Command keeps: Phase 0 skill load, Pre-flight, Phase 1/2 orchestration headers, Output assembly, Constraints. Target: ≤120L. Shared skill updated to absorb anything moved that's not already there.

### KD8: adv-triage validation gate (validator recommendation)

Validator recommended verifying adv-triage extraction end-to-end (AC1-AC8) before proceeding to commits 2-8. If 120L proves structurally unachievable for adv-triage, apply ≤150L escape hatch **uniformly** to all 8 extractions rather than per-command — keeps the AC consistent.

**Decision:** First extraction (commit 1, adv-triage) runs the full AC1-AC8 verification before commit 2 starts. If AC2 fails at 120L, raise the target to 150L for all extractions, document in design notes, and proceed.

**KD8 ACTIVATION (2026-05-11):** adv-triage extraction complete at **129 lines** with all 11 phases preserved, all contract tokens preserved, and skill load + fallback stub in place. 120L target structurally unachievable due to required content (frontmatter + manifest + intro + UserRequest + Parse Flags + 7 phase sections + Constraints + 17-row Key Tools table = ~110L minimum + separators). **≤150L target activated uniformly for remaining 7 extractions.** All AC1, AC3, AC4, AC8 verifications PASS for adv-triage; AC2 PASS under escape hatch (129 ≤ 150). Command-surface reduction for adv-triage: 737L → 129L = **82.5%** reduction (well above AC7's ≥30% threshold).

### KD9: Prose-load inventory update (validator finding)

`rq-proseReduction03` requires an inventory document for prose-reduction changes. Commit 9 (maintenance pass) MUST update `docs/prose-load-inventory.md` to:
- Add 7 new skill files to inventory scope
- Update the `adv-slop-detection` skill row (modified)
- Mark all command rows as re-compressed (new pass column)
- Add the 19 compression-only commands' updated state

This is an additional task added to commit 9, not a separate commit.

## Implementation Strategy

### Sequencing (11 atomic commits + verification)

| # | Commit | Files | Verification |
|---|---|---|---|
| 1 | Extract adv-triage | command file + new skill | **Full AC1-AC8 verification gate** (KD8). Result: 129L → KD8 escape activated, ≤150L uniform |
| 2 | Deepen adv-slop-scan | command file + existing skill (update) | Existing skill receives migrated content; no behavioral change |
| 3 | Extract adv-cleanup | command file + new skill | Phase headers preserved |
| 4 | Extract adv-reflect | command file + new skill | Phase headers preserved |
| 5 | Extract adv-improve | command file + new skill | Phase headers preserved |
| 6 | Extract adv-clarify | command file + new skill | Phase headers preserved |
| 7 | Extract adv-audit | command file + new skill | Phase headers preserved |
| 8 | Extract adv-refactor | command file + new skill | Phase headers preserved |
| 9 | Caveman-full maintenance pass + inventory update | all 27 command files + new/modified skills + docs/prose-load-inventory.md | Contract token grep clean; inventory updated per rq-proseReduction03 (KD9) |
| 10 | Update classification table | ADV_INSTRUCTIONS.md | Table reflects 8 extractions |
| 11 | Add spec deltas | `.adv/specs/advance-meta/spec.json` | rq-proseReduction05 + rq-skillClassification01 |

### Per-Extraction Procedure

For each of commits 1–8:

1. **Read source command file**
2. **Classify content** — for each H2/H3 section, label as `orchestration` (stays in command) or `methodology` (moves to skill)
3. **Draft new skill file** with frontmatter + methodology sections
4. **Draft thin command file** with phase headers (one-line tool-call summary), constraints, tool table, and Phase 0/1 skill-load directive
5. **Apply caveman-full** to both files within enforcement-class framework
6. **Verify line counts** — command ≤150L (KD8 escape active); skill ≤300L soft-target
7. **Verify contract-token preservation** — grep for tool names, gate IDs, MUST/NEVER, slash commands. Compare before/after.
8. **Verify phase preservation** — every Phase header from original command exists in either the thin command (orchestration) or the skill (methodology)
9. **Commit** with conventional message: `refactor(commands): extract adv-{name} methodology to skill`

### Verification Procedure (AC4, AC5, AC7, AC8)

| AC | Check | Tool |
|---|---|---|
| AC1 | Skill file synced to global | `scripts/sync-global.sh --check` |
| AC2 | Command line counts | `wc -l .opencode/command/adv-*.md` (≤150L under KD8 escape) |
| AC3 | Skill-load directive present | `grep -L 'skill("adv-' .opencode/command/{extracted}.md` |
| AC4 | Contract token preservation | Pre-extraction snapshot of tokens; post-extraction grep -h diff |
| AC5 | Global sync clean | `scripts/sync-global.sh --check` exit 0 |
| AC6 | Classification table updated | `grep -A20 "Command vs Skill Boundaries" ADV_INSTRUCTIONS.md` |
| AC7 | Line reduction ≥30% | `wc -l` delta report across 8 commands |
| AC8 | Phase preservation | Per-file diff: every original H2 phase exists in command or skill |

Contract-token grep pattern (use `-h` to suppress filename):
```bash
grep -hoE "MUST NOT|MUST|adv_[a-z_]+|skill\(|\[ADV:[A-Z_]+\]|/adv-[a-z-]+" {files}
```

## LBP Analysis

**Pattern:** Lazy-loaded methodology modules for agent instruction surfaces.

**Why LBP:**
1. Proven internally — adv-tron, adv-comp-scan, adv-arch-scan, adv-slop-detection all use this pattern successfully.
2. Aligned with software architecture norms — lazy loading, plugin pattern, code splitting.
3. Aligns with skill discovery protocol — `skill()` tool is canonical in ADV_INSTRUCTIONS.md.
4. Reversible — content can be re-inlined and skill deleted if problematic.

**Alternatives considered:**

| Alternative | Verdict |
|---|---|
| Keep methodology inline; rely solely on caveman compression | Rejected — saves ~20-30%. Skill extraction saves ~50-70%. |
| Move methodology to docs/ instead of skills/ | Rejected — docs/ not loaded by `skill()`. Loses on-demand. |
| Single mega-skill with all command methodologies | Rejected — defeats lazy loading. |
| Use overlays instead of skills | Rejected — sync-time injection, not on-demand. Wrong mechanism. |
| Defer until pattern more battle-tested | Rejected — already production-proven across 4 commands. |

## Affected Components

### Modified files (8 commands + 1 shared skill update)

- `.opencode/command/adv-triage.md` (737L → 129L ACTUAL)
- `.opencode/command/adv-slop-scan.md` (256L → ≤150L)
- `.opencode/command/adv-cleanup.md` (244L → ≤150L)
- `.opencode/command/adv-reflect.md` (230L → ≤150L)
- `.opencode/command/adv-improve.md` (171L → ≤150L)
- `.opencode/command/adv-clarify.md` (123L → ≤150L)
- `.opencode/command/adv-audit.md` (100L → ≤150L)
- `.opencode/command/adv-refactor.md` (88L → ≤150L)
- `skills/adv-slop-detection/SKILL.md` (143L → grows to absorb slop-scan migration)

### New files (7 skills)

- `skills/adv-triage/SKILL.md` (638L ACTUAL — exceeds 300L soft-target; methodology-rich command requires it)
- `skills/adv-cleanup/SKILL.md`
- `skills/adv-reflect/SKILL.md`
- `skills/adv-improve/SKILL.md`
- `skills/adv-clarify/SKILL.md`
- `skills/adv-audit/SKILL.md`
- `skills/adv-refactor/SKILL.md`

### Compression-only files (remaining 19 commands)

All `.opencode/command/adv-*.md` not in extraction list. Maintenance pass only.

### Infrastructure

- `ADV_INSTRUCTIONS.md § Command vs Skill Boundaries` — classification table update
- `.adv/specs/advance-meta/spec.json` — rq-proseReduction05, rq-skillClassification01
- `docs/prose-load-inventory.md` — inventory update for KD9 / rq-proseReduction03 compliance
- `~/.config/opencode/skills/adv-*/` — populated by sync-global.sh (no manual edits)

### Out of scope (verified unchanged)

- `plugin/src/` — no source code changes (DONT1)
- `scripts/sync-global.sh` — verify only (DONT2)
- Existing skill content (adv-tron, adv-comp-research, adv-arch-detection, adv-user-intuit, adv-worktree, adv-backend-stack-eval, adv-ci-release) — no retroactive compression
- High-frequency workflow commands — compression-only via maintenance pass

## Risks / Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| adv-triage extraction loses Phase 3b question-tool intent | Low | Medium | Phase 3b content carried verbatim into skill |
| Skill load fails at runtime; fallback stub insufficient | Low | Low | Fallback stub orchestration skeleton; surfaces degraded-mode status |
| Caveman compression breaks contract token | Medium | High | Pre/post grep diff of contract tokens (use `-h` flag to suppress filename prefix) |
| Per-extraction commits make review tedious (8+ commits) | High | Low | Conventional commit messages; UD5 explicit choice |
| AC2 (≤120 lines) unachievable for adv-triage | Medium → ACTUAL | Medium | KD8 escape activated (≤150L uniform). adv-triage at 129L. |
| Spec delta rq-proseReduction05 conflicts with existing spec | Low | Low | Verified additive (no existing rq covers skill files) |
| `sync-global.sh --check` fails on new skill | Low | Medium | New skills in repo before sync runs; dry-run test first |
| Compression maintenance pass introduces regression | Medium | Medium | Isolated commit; automated grep against pre-compression snapshot |
| Total work scope >40 tasks for /adv-prep | Medium | Low | Per-extraction ~5 tasks × 8 + 3 maintenance + 2 spec = ~45 tasks. Within tolerance. |
| rq-proseReduction03 inventory obligation missed (validator finding) | Low | Medium | KD9 explicitly adds inventory update to commit 9 |

## Validator Result

**Verdict:** VALIDATED

**Findings:**
- Dim 1 (Correctness): clean — pattern logically sound, line counts verified, per-extraction procedure thorough
- Dim 2 (Simplicity): clean — no materially simpler alternative; pattern already proven across 4 commands
- Dim 3 (Spec-Law Compliance): clean — rq-proseReduction05 and rq-skillClassification01 are additive. **Info note:** rq-proseReduction03 requires inventory update for prose-reduction work → incorporated as KD9
- Dim 4 (Key Alternatives): **caution** — recommended verifying adv-triage extraction end-to-end before commits 2-8 → incorporated as KD8

**Recommendation:** Design approved. Two refinements incorporated:
1. KD9: prose-load-inventory.md update added to commit 9 scope
2. KD8: full AC1-AC8 verification gate after commit 1 (adv-triage); uniform 150L escape hatch if needed (NOW ACTIVATED — see KD8 § ACTIVATION)

No CONFLICT findings. No contract-compromise risk identified.

## KD8 Activation Record (2026-05-11)

**Trigger:** adv-triage thin command settled at 129L after compression, exceeding the 120L AC2 target by 9 lines but well under the 150L KD8 escape threshold.

**Root cause:** Structural minimum (~110L) for an 8-phase command with frontmatter, manifest, UserRequest block, Parse Flags table, 7 phase descriptions, Constraints, and 17-row Key Tools table — plus separators and skill-load directive. The 120L target was aspirational; the structural floor is closer to 130L for command files of this complexity.

**Action:** ≤150L target now applies uniformly to all 8 extractions (commits 2-8). Remaining extractions (adv-slop-scan, adv-cleanup, adv-reflect, adv-improve, adv-clarify, adv-audit, adv-refactor) targeting ≤150L per task graph (tasks already reference "≤120L or KD8-active ≤150L").

**adv-triage extraction results:**
- 737L command + 0L skill → 129L thin command + 638L skill
- Command-surface always-loaded reduction: 737 → 129 = **82.5%**
- Total file weight (cmd + skill): 737 → 767 (+30L) — but skill is on-demand, default-context cost is the 129L command only
- All 11 original H2 phases preserved across command + skill (verified)
- All baseline contract tokens preserved (verified via `grep -h` diff)
- AC1, AC3, AC4, AC8 all PASS; AC2 PASS under escape (129 ≤ 150)