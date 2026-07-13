## Executive Summary: Fix change status honesty

### Outcome
The ADV change-status surface now tells the truth. Previously, every open change reported `status: "draft"` for its entire life — a never-started proposal and a fully-shipped change were indistinguishable, and `adv_change_list status:"active"` silently returned zero rows while open changes existed (making `/adv-cleanup` blind). All three defects are fixed.

### Value / why it matters
Humans and tooling can now trust the status surface. `adv_change_list` rows carry a derived `phase` (proposal→discovery→…→release→released/archived/closed) sourced from gate progress + lifecycle — no more permanent `draft`. The `active`/`pending` filter footgun is structurally eliminated: those values are rejected at the schema boundary with an actionable hint. The `ChangeStatus` enum no longer carries lifecycle-unreachable values (`pending`/`active` removed; stored set is now draft/archived/closed). A load-path normalizer ensures legacy disk records with those values migrate safely to `draft`.

### What was built
- **T1 — Derived `phase` field** (`tools/change.ts` row builder + `store-types.ts firstOpenGate` helper): additive `phase` on every list row, plumbed through `ChangeListResponse` at all 6 projection sites (store-temporal ×5 incl. memo path, store-disk ×1). `status` retained for compat.
- **T2 — Fail-closed filter rejection** (`types/changes.ts` superRefine + `tools/change.ts` boundary check): `status:"active"|"pending"` rejected with a hint pointing at `in-flight`/`archived`/`closed`. Consistent across warm `listSummary` and cold Visibility paths.
- **T3 — Legacy-status load normalizer** (`storage/json.ts:143`): maps on-disk `active`/`pending` → `draft` before `ChangeSchema.parse`; byStatus counters finite-safe (`??0`); seedState normalized.
- **T4 — Enum cleanup** (`types/changes.ts`): `ChangeStatusSchema` narrowed to draft/archived/closed; `LEGACY_OPEN_STATUSES` + in-flight Set narrowed to `["draft"]`; 8 typecheck ripples + 21 source/test files fixed; public schema regenerated.
- **T5 — Spec delta + docs** (`.adv/specs/advance-workflow/spec.json` rq-changeLifecycleState01): records the reachable set law; docs mirror + `ADV_INSTRUCTIONS.md` prose updated.

### Verification
- `pnpm run check` green (schemas + typecheck + isolation + lockfile + lint + format).
- Full suite 5038 tests green (T4, at 19c9cd4); AC5 authority suite 261 tests green on final HEAD (tr_mrjsqjta).
- Independent adv-reviewer verdict: **READY** — no blocking findings; all 6 projection sites consistent; normalizer precedes parse; open scans use `AdvLifecycleState`+`ExecutionStatus`; replay-safe.
- Contract review matrix: 9/9 items pass/respected.

### Constraints honored
- `AdvLifecycleState = "open" AND ExecutionStatus = "Running"` remains the sole open-claim authority; `AdvChangeStatus` stays read-model (C1, AC5).
- Temporal replay determinism preserved; `AdvChangeStatus` stays `Keyword` (C2).
- No archive terminal-projection change (C3) — that wedge was unwedged separately before this change.
- Backward-compatible: `in-flight`/`archived`/`closed`/default callers unchanged; legacy records load via normalizer (C4).

### Risks / follow-ups
- `active`/`pending` as filter values now produce a structured rejection instead of a silent empty list — strictly better, but technically a contract change for any caller that passed those values (none found in-repo).
- Agent follow-up `ag-bBsmZyfw`: `search-attributes.ts` has a private `currentGate()` duplicating `firstOpenGate` semantics — dedup candidate, intentionally left untouched (out of scope).
- Agent follow-up: no agent-accessible mechanism exists to declare `Change.deltas` post-creation (seed-only field); the spec law was applied directly to `spec.json` and ships via the branch.