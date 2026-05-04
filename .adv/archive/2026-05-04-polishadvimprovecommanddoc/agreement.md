## Agreement

### Objectives

Resolve 4 audit findings in `/adv-improve` doc + manifest entry without behavioral changes.

### Discovery Findings

**Evidence already gathered (audit pass):**

| Finding | Location | Evidence |
|---|---|---|
| H1 | `.opencode/command/adv-improve.md:173-175` | Empty `## Output` heading after `---` separator |
| M1 | `.opencode/command/adv-improve.md:75,80` | Two contradictory fallback statements for "Context7 unavailable" |
| M2 | `plugin/src/manifest.ts:389` | `successors: ["adv-proposal"]` only |
| M3 | `.opencode/command/adv-improve.md:88` vs `docs/checklists/improve-checklist.md:73` | `{year}` vs `{current-year}` mismatch |

**Prior Research Extension:** No `docs/*-prep.md` artifacts exist in tree. No prior research to extend. Audit notes themselves serve as the source.

**LBP Check:** Pattern A (no `## Output` heading) is locked-in best practice — verified against `/adv-tron`, the closest peer (read-only utility, no gate). No external alternatives apply (purely internal doc cleanup).

**Consumer impact:**
- `/adv-discover` consumes `docs/*-prep.md` artifacts — unchanged by this work.
- `adv-improve-assets.test.ts` (28 assertions) — verified all assertions still pass after changes:
  - Line 39 `Gate:**\s*None` — preserved
  - Line 41 `no ADV state mutation` — preserved (line 153 of doc)
  - Line 47-48 `docs/*-prep.md` + "research pack" — preserved
  - Lines 56-62 Exits (Report/Clarify/Partial) — preserved
  - Line 77-78 CHECKLIST + improve-checklist.md — preserved
  - Lines 84-93 external landscape + caps — preserved
  - Line 98 fallback wording — preserved (M1 strengthens it)
  - Lines 103-115 ADV-mutation-tool absence — preserved
  - Line 121 `Nn]o (ADV )?state mutation` — matches "No ADV state mutation" at line 153 — preserved
  - Lines 129-130 Persist phase — preserved
  - Lines 134-138 path format — preserved
  - Lines 141-145 broad/scoped naming — preserved
  - Lines 147-152 forbidden-write wording — preserved
  - Lines 154-161 mandatory artifact sections — preserved

**Risk assessment:** Zero behavioral risk. Pure doc + 1-line manifest change. No tests need rewriting.

### Acceptance

(See proposal § Acceptance Criteria — 7 items, unchanged.)