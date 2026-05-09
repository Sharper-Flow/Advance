# Agreement

## Objectives
1. Make score-blindness formal ADV invariant.
2. Make ROADMAP.md rank-only and score-free.
3. Keep GH Project v2 and snapshot score-rich for sequencing commands.
4. Mark `/adv-roadmap` sequencing-only side quest.
5. Define future issue-import sanitizer contract.
6. Add structural tests.

## Acceptance Criteria
1. ROADMAP.md has ranked features and no V/TC/RROE/E/WSJF columns.
2. ROADMAP.md has no score-summary wording like `WSJF computed this run`.
3. GH Project v2 and `.adv/roadmap-snapshot.json` keep score fields.
4. `/adv-roadmap` keeps score-visible output but marks it sequencing-only.
5. `ADV_INSTRUCTIONS.md` defines invariant covering research, edge cases, tests, design, related-scan, review/harden strictness.
6. `/adv-proposal`, `/adv-discover`, `/adv-design`, `/adv-prep` reference invariant.
7. Future roadmap-origin imports define sanitizer contract.
8. Tests prove ROADMAP.md score-free layout and invariant presence while preserving `adv_roadmap` sorting.
9. `pnpm run check` passes.

## Constraints
No WSJF formula/schema/tool-shape changes. No scores in `change.origin`. No retroactive issue/archive scrub.

## Avoidances
No prose-only enforcement. No score-aware quality scaling. No hiding scores from triage/roadmap.

## Decisions
User chose: rank-only ROADMAP.md; invariant applies to all quality gates except triage/roadmap; sanitize future imports only.

## Contract Spine
SC1: WSJF sequencing-only. SC2: quality gates stay LBP/P31/P25 regardless of score. SC3: ROADMAP.md no numeric score exposure.

AC1-AC9 match Acceptance Criteria above. C1-C4 preserve scoring logic, `adv_roadmap`, GH fields, and score-free `change.origin`. DONT1-DONT4 forbid prose-only ignores, score removal from sequencing surfaces, score-as-quality-budget, and retroactive scrub. OOS1-OOS5 exclude WSJF methodology, GH schema, `adv_roadmap` API, `/adv-proposal #N` implementation, and retroactive cleanup.