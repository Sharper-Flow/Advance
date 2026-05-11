# Design v2 (substrate-decided + validator-amended)

> **Status:** v2 — substrate decision resolved during Re-Entry Discovery. Validator pass 2 returned CAUTION (not CONFLICT); blocking-for-execution gaps folded into amendments below. Replaces v1+halt content. v1 retained in `change.reentry_history` audit trail.

## Architecture Overview

**Three-layer coordination model**, substrate finalized:

| Layer | Owner | Substrate | Canonical for |
|-------|-------|-----------|--------------|
| **Layer 1: Ranked backlog + V/WSJF** | Human | GitHub Project v2 + Issues | Value (V), priority, scoring, item identity |
| **Layer 2: Coordination state** | Agent | **Temporal search attributes on per-change workflows** (mirrors existing `AdvWorktreeBranches` / `AdvWorktreePaths` pattern) | Claims, change-origin links, cross-session visibility |
| **Layer 3: Cached projection** | Agent | `.adv/roadmap-snapshot.json` (existing) extended with TTL metadata | TTL-bounded read-only mirror of Layer 1 |

```
┌───────────────────────────────────────────────────────────────────┐
│                User                            Agent              │
│                  │                               │                │
│                  │ edits via                     │ reads via      │
│                  ▼ GH UI                         ▼ ADV tools      │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐  │
│  │ GitHub Project v2 + Issues   │←─│ adv_backlog_state         │  │
│  │ (canonical for ranking, V)   │  │ adv_wip_state             │  │
│  └──────────────┬───────────────┘  └──────────────┬────────────┘  │
│                 │                                  │               │
│        pull (5min TTL)                  Visibility query           │
│                 ▼                                  ▼               │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐   │
│  │ .adv/roadmap-snapshot.json   │  │ Temporal Visibility       │   │
│  │ (cached projection — existing│  │ AdvBacklogIssueNumber NEW │   │
│  │  pattern, extended w/TTL)    │  │ AdvAffectedProjects       │   │
│  └──────────────────────────────┘  │ AdvChangeStatus           │   │
│                                     │ AdvWorktreeBranches       │   │
│                                     │ AdvWorktreePaths          │   │
│                                     │ + session registry        │   │
│                                     └────────────┬──────────────┘   │
│                                                  │                   │
│  ┌───────────────────────────────────────────────▼──────────────┐  │
│  │ Per-change Temporal workflows (existing, signal-driven)      │  │
│  │  - ChangeSchema.origin (existing on disk)                    │  │
│  │  - NEW: ChangeWorkflowState.origin (in-flight, set from      │  │
│  │    ChangeWorkflowInput.seedState during workflow start)      │  │
│  │  - NEW: AdvBacklogIssueNumber upserted from state.origin     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

**Direction of authority:**
- GH Project → cached snapshot (pull-only, TTL 5 min)
- Change workflow (existing) → search attributes (upsert on signals via existing `applyAndUpsertSearchAttributes` path)
- All cross-session coordination reads happen via Temporal Visibility, not via shared state holder
- V field: GH only — agent never writes V

## Key Decisions (with validator-amended details)

### D1 (v2): Cross-entity coordination via Temporal search attributes

**Pattern:** A new single-value Keyword search attribute `AdvBacklogIssueNumber` is populated on each change workflow from `state.origin?.issue_number`. Visibility queries filter on this attribute to detect claim collisions and to compute active-change cross-reference.

**Validator-required prerequisite (was missing in v2 first draft):** `ChangeWorkflowState` must carry `origin` so `buildChangeSearchAttributes` can read it. `ChangeOriginSchema` exists in `plugin/src/types/changes.ts:452` but is **not** present on `ChangeWorkflowState` (`plugin/src/temporal/contracts.ts:163-194`) today. Folded into Phase A as task A0.

**Why this works (post-amendment):**
- Direct in-repo precedent: `AdvWorktreeBranches` / `AdvWorktreePaths` do exactly this for worktrees in production (`plugin/src/temporal/search-attributes.ts:21-22`)
- Matches signal-driven architecture established in `refactorChangeWorkflowsSignal` (May 7) and reaffirmed in `post-cutover-wide-system-audit` (May 11)
- Aligns with claude-tempo reference architecture cited in `docs/decisions/2026-05-04-signal-driven-change-workflows.md`
- No new long-lived workflow; no D3 antipattern revival; `no-psw-references.test.ts` passes unchanged (validator confirmed)
- Single Keyword (not KeywordList) — no slot pressure (validator confirmed: 3 KeywordList slots remain for `AdvAffectedProjects`, `AdvWorktreeBranches`, `AdvWorktreePaths`)

### D2 (v2): Change workflow IS the durable claim record

**Pattern:** When `/adv-proposal #N` invokes `adv_change_create` with `origin.kind = 'roadmap'` and `origin.issue_number = N`, that change workflow becomes the durable claim. Status `draft|pending|active` = claim held. Status `archived|closed` = claim released. No separate lease, no heartbeat, no claim primitive.

**Why this works:**
- Eliminates a whole subsystem (lease + heartbeat + claim store) by reusing existing change lifecycle semantics
- Auto-release on archive/close is structurally guaranteed (no orphan-claim cleanup needed)
- The agent already has rich tooling around changes (`adv_change_list`, `adv_change_show`, etc.); claims inherit this surface for free

### D3 (v2, amended): Atomic claim check with race-tolerant double-check

**Pattern (project-scope filter uses `AdvAffectedProjects`, not `AdvProjectId`):**

`adv_change_create` with `origin.kind = 'roadmap'` performs a Visibility query before creating the workflow:

```
AdvAffectedProjects = "{projectId}"
  AND AdvBacklogIssueNumber = "{N}"
  AND AdvChangeStatus IN ("draft", "pending", "active")
```

**Validator-required correction (F3):** Use `AdvAffectedProjects` (registered as KeywordList in `ADV_SEARCH_ATTRIBUTES`, populated by `buildChangeSearchAttributes`) instead of `AdvProjectId` (referenced in `list-change-workflows.ts:84` but not in the registered attribute table — this is a pre-existing inconsistency; out of scope to fix here, but the new code uses the correct attribute).

If any result returned → tool returns typed `CLAIM_CONFLICT` error including the existing change ID. Caller surfaces conflict to user.

**Race-tolerance via post-create double-check (validator-amended, F2):**

Temporal Visibility is eventually consistent. `plugin/src/temporal/service.ts:94-101` documents that SQLite-backed dev servers may take **up to 10s** for search-attribute propagation after registration. Upsert during workflow execution is typically faster but the v2 first-draft's 1s window had no safety margin.

**Amendment:** post-create double-check window defaults to **5 seconds** (configurable). If N > 1 changes share the same `AdvBacklogIssueNumber` within the window, surface "duplicate detected" to the user with both change IDs. Caller decides which to keep.

User confirmed this trade direction: "Acceptable — surface and let user pick." Aligns with ADV mission ("trust the agent + surface to user").

### D4 (v2): TTL-cached snapshot for backlog read path

**Pattern:** `.adv/roadmap-snapshot.json` (existing) is the cached projection. New fields:
- `last_refreshed: ISO8601 timestamp`
- `ttl_ms: number` (default 300_000 = 5 min, configurable)
- `next_refresh_after: ISO8601 timestamp` (computed: `last_refreshed + ttl_ms`)

`adv_backlog_state` checks freshness on each call. If cache stale or `forceRefresh: true`, triggers re-pull via `gh project item-list`. If cache fresh, serves from snapshot directly.

**Rationale for 5-min TTL (validator-noted):** The existing `FILE_SNAPSHOT_STALE_AFTER_MS = 2h` (`plugin/src/tools/roadmap.ts:77`) covers freshness of the snapshot's WSJF scores (which change only on user triage). The new 5-min TTL covers active-change annotations (which change every change-create / archive). Annotation freshness ≫ snapshot freshness, hence the shorter window. The 2h existing constant remains for the WSJF-content staleness check; the 5-min is for active-change annotation freshness.

Active-change annotation in `adv_backlog_state` uses a single Visibility query (`AdvBacklogIssueNumber IN [...all issue numbers in snapshot...]`), replacing the existing O(n×m) `buildActiveChangeIndex`.

### D5 (v2): Tool surface — minimum viable

**Validator finding F4 considered:** Combining `adv_backlog_state` and `adv_wip_state` was evaluated. Decision: keep them separate. Rationale: response shapes diverge substantially (backlog rows with score columns + claim annotation vs. {active_changes, worktrees, peer_sessions}); a combined tool with `detail_level` parameter would muddy the contract and bloat the largest-case response. Two tools, two clear contracts.

Three new tools, two existing tools modified:

**NEW: `adv_backlog_state`**
- Args: `{ kind?: 'bug' | 'feature' | 'all', top?: number, priority?: ..., forceRefresh?: boolean }`
- Returns: backlog items + claim annotations + freshness metadata
- Implementation: check snapshot TTL → refresh if needed → Visibility query for claims → compose response

**NEW: `adv_wip_state`**
- Args: `{}` (no parameters — always returns project-scoped view)
- Returns: `{ active_changes: [...], worktrees: [...], peer_sessions: [...] }`
- Implementation: thin aggregator over (a) Temporal Visibility for changes, (b) existing worktree state DB, (c) existing session registry

**MODIFIED: `adv_change_create`** (in `plugin/src/tools/change.ts`)
- When `origin.kind === 'roadmap'` and `origin.issue_number` present:
  1. Run Visibility query before workflow start
  2. If collision → return `CLAIM_CONFLICT` typed error
  3. Else proceed with workflow start (existing path)
  4. Pass `origin` through `ChangeWorkflowInput.seedState.origin` so workflow state carries it (amendment A0)
  5. Post-create: re-run Visibility query within 5s window; if N > 1 results, return `CLAIM_RACE_DETECTED` advisory (still keeps the new change; caller surfaces to user)

**MODIFIED: `adv_roadmap`** (in `plugin/src/tools/roadmap.ts`)
- Internal delegation to `adv_backlog_state` when Visibility reachable
- Falls back to existing snapshot read when Visibility unavailable
- `buildActiveChangeIndex` deleted (replaced by single Visibility query in `adv_backlog_state`)
- Deprecation note in tool description recommending direct use of `adv_backlog_state`

### D6 (v2): Command evolution

| Command | Change | Rationale |
|---------|--------|-----------|
| `/adv-roadmap` | Internally calls `adv_backlog_state`. Tool description marks deprecation. Removed one release cycle later. | Aligns with AC5 + AC7. |
| `/adv-triage` | Simplified to scoring, reordering, adding items. Refresh framing removed. | User-confirmed direction (Q3 of v2 round). |
| `/adv-proposal #N` | Calls `adv_change_create` with `origin.kind: 'roadmap'`, `origin.issue_number: N`. On `CLAIM_CONFLICT`: present existing change ID to user, offer (a) resume that change, (b) override and create new anyway, (c) cancel. On `CLAIM_RACE_DETECTED`: surface to user with both change IDs. | Atomic claim + race tolerance. |

### D7 (v2, amended): Schema additions

`ChangeOriginSchema` and `ChangeSchema.origin` **already exist** in code (lines 452 and 532 of `plugin/src/types/changes.ts`). No schema change to `ChangeSchema` itself.

**Validator-required addition (F1):** Extend `ChangeWorkflowState` and `ChangeWorkflowInput.seedState` to carry `origin`:

```typescript
// In plugin/src/temporal/contracts.ts
// Add to ChangeWorkflowState interface (~line 163-194)
export interface ChangeWorkflowState {
  // ... existing 25 fields ...
  origin?: ChangeOrigin;  // NEW
}

// And ChangeWorkflowInput.seedState (~line 114-159)
export interface ChangeWorkflowInput {
  // ... existing fields ...
  seedState?: {
    // ... existing seed fields ...
    origin?: ChangeOrigin;  // NEW
  };
}
```

`ChangeOrigin` type is already exported from `plugin/src/types/changes.ts:465` and importable into `contracts.ts` (which already imports from `../types` per `contracts.ts:1-6`).

**Workflow-bundle-boundary safety (validator confirmed):** `search-attributes.ts` is already imported by `workflows.ts:3` and is in the reachable workflow-safe set. Adding the `origin` field read from `state.origin?.issue_number` adds no forbidden imports. Adding `AdvBacklogIssueNumber` to `ADV_SEARCH_ATTRIBUTES` is a static constant — no new forbidden imports required.

```typescript
// In plugin/src/temporal/search-attributes.ts (lines 12-23)
export const ADV_SEARCH_ATTRIBUTES = {
  // ... existing 10 attributes ...
  AdvBacklogIssueNumber: "Keyword",  // NEW — single value
} as const;

// In buildChangeSearchAttributes (~line 166-208)
if (state.origin?.issue_number !== undefined) {
  attrs.AdvBacklogIssueNumber = [String(state.origin.issue_number)];
}
```

**New error types:**

```typescript
// In plugin/src/types/errors.ts (or co-located in tools/change.ts)
export const ClaimConflictSchema = z.object({
  code: z.literal("CLAIM_CONFLICT"),
  issue_number: z.number().int().positive(),
  existing_change_id: z.string(),
  existing_change_status: z.string(),
});

export const ClaimRaceDetectedSchema = z.object({
  code: z.literal("CLAIM_RACE_DETECTED"),
  issue_number: z.number().int().positive(),
  change_ids: z.array(z.string()).min(2),
});
```

## Implementation Strategy (amended for validator findings)

Sequenced for incremental delivery; each phase verifiable independently. Estimated 11-13 tasks total.

### Phase A: Search attribute infrastructure (3 tasks, was 2)

- **A0 (NEW per F1):** Add `origin?: ChangeOrigin` to `ChangeWorkflowState` (`plugin/src/temporal/contracts.ts`). Add to `ChangeWorkflowInput.seedState` so callers can pass origin through workflow start. Ensure `applyChangeOriginSignal` (if introduced) or direct seed-state read sets it on the workflow state.
- A1: Add `AdvBacklogIssueNumber: "Keyword"` to `ADV_SEARCH_ATTRIBUTES`; update `buildChangeSearchAttributes` to populate from `state.origin?.issue_number`
- A2: Migration: ensure `ensureAdvSearchAttributes` registers the new attribute via OperatorService on next worker init; verification test confirms registration (allow up to 10s propagation per service.ts:94-101 documentation)

### Phase B: Visibility query helpers (2 tasks)

- B1: Add `queryClaimsByIssueNumber(client, projectId, issueNumber)` helper in `plugin/src/temporal/visibility-queries.ts` (or extend existing visibility helpers). Uses `AdvAffectedProjects = pid AND AdvBacklogIssueNumber = N AND AdvChangeStatus IN ("draft","pending","active")`. Returns `Array<{ changeId, status, lastSignalAt }>`
- B2: Add `queryActiveChangesByIssueNumbers(client, projectId, issueNumbers)` for bulk lookup (used by `adv_backlog_state` for active-change annotation). Single Visibility call with `AdvBacklogIssueNumber IN [...]` clause.

### Phase C: Tools (4 tasks)

- C1: New `plugin/src/tools/backlog.ts` with `adv_backlog_state` tool — reads snapshot with TTL check, refreshes via existing `gh` CLI path, annotates with Visibility query
- C2: Add `adv_wip_state` tool to same file — aggregates Visibility + worktree state + session registry
- C3: Modify `adv_change_create` in `plugin/src/tools/change.ts` — add pre-create Visibility check (return `CLAIM_CONFLICT` on collision), pass `origin` through `seedState`, add post-create double-check (5s window, return `CLAIM_RACE_DETECTED` advisory if N > 1)
- C4: Modify `adv_roadmap` — delegate to `adv_backlog_state` when workflow reachable; mark deprecation in description; remove `buildActiveChangeIndex` in favor of single Visibility query in fallback path

### Phase D: Snapshot TTL extension (1 task)

- D1: Extend `.adv/roadmap-snapshot.json` schema with `last_refreshed`, `ttl_ms` (default 300_000), `next_refresh_after`. Update `readSnapshotFile` and `writeSnapshotFile` paths. Migration: existing snapshots without these fields default to "stale" on read (forcing refresh). Preserve existing `FILE_SNAPSHOT_STALE_AFTER_MS = 2h` constant for WSJF-content staleness (separate concern from annotation freshness).

### Phase E: Tool registry + commands (1 task)

- E1: Register new tools in `plugin/src/tool-registry.ts`. Update `.opencode/command/adv-roadmap.md` (deprecation note), `.opencode/command/adv-triage.md` (remove refresh framing), `.opencode/command/adv-proposal.md` (document CLAIM_CONFLICT and CLAIM_RACE_DETECTED handling).

### Phase F: Spec + regression coverage (2 tasks)

- F1: Create `.adv/specs/backlog-coordination.md` with rq-backlogCoord01..04 (G/W/T scenarios from discovery findings)
- F2: Add `.adv/specs/advance-workflow.md` rq-aw-backlog01 extension and regression tests for RL-1 through RL-7

## LBP Analysis

**Why this is the LBP direction (definitively, post-research + validator-confirmed):**

1. **In-repo precedent (validator-confirmed):** `AdvWorktreeBranches` / `AdvWorktreePaths` in `plugin/src/temporal/search-attributes.ts:21-22` implement exactly this pattern in production. Direct architectural template.

2. **Post-cutover audit endorsement:** `docs/post-cutover-wide-system-audit.md` (May 11, 2026): "Keep architecture; no Temporal replacement."

3. **claude-tempo reference:** `docs/decisions/2026-05-04-signal-driven-change-workflows.md` cites it as the reference for correct Temporal usage. v2 matches the pattern.

4. **Mission alignment:** "Single user, single machine, trust the agent, durable trinity" — change workflows already provide durable record.

5. **Lowest implementation cost** of surveyed substrates: ~11-13 tasks. Cost reduction comes from reusing the change workflow as the claim primitive.

6. **D3 retirement intent honored:** No project-level shared workflow. `no-psw-references.test.ts` continues passing (validator confirmed).

7. **Visibility query patterns confirmed by Temporal docs:** `IN` operator, `AND` composition, Keyword type are all standard Visibility features. No novel Temporal usage required.

## Affected Components (revised per validator)

| Component | Change | Risk |
|-----------|--------|------|
| `plugin/src/temporal/contracts.ts` | Add `origin?: ChangeOrigin` to `ChangeWorkflowState` and `ChangeWorkflowInput.seedState` (NEW per F1) | Low — additive type field |
| `plugin/src/temporal/search-attributes.ts` | Add `AdvBacklogIssueNumber: "Keyword"`; populate in `buildChangeSearchAttributes` | Low — additive, mirrors existing pattern |
| `plugin/src/temporal/visibility-queries.ts` (new or extended) | Add Visibility query helpers | Low — read-only |
| `plugin/src/tools/backlog.ts` (NEW) | New `adv_backlog_state` and `adv_wip_state` tools | Medium — new tool surface |
| `plugin/src/tools/change.ts` | `adv_change_create` adds pre/post-create claim checks for `origin.kind === 'roadmap'`; passes origin through seedState | Medium — modifies hot path; behind condition |
| `plugin/src/tools/roadmap.ts` | Delegate to new tool; remove `buildActiveChangeIndex` | Medium — replacement; deprecation note added |
| `plugin/src/tool-registry.ts` | Register new tools | Low |
| `.opencode/command/adv-roadmap.md` | Deprecation note | Low |
| `.opencode/command/adv-triage.md` | Remove "refresh state" framing | Low |
| `.opencode/command/adv-proposal.md` | Document CLAIM_CONFLICT and CLAIM_RACE_DETECTED handling for `#N` form | Medium — user-facing flow |
| `.adv/specs/backlog-coordination.md` (NEW) | New capability spec | Low |
| `.adv/specs/advance-workflow.md` | rq-aw-backlog01 extension | Low |

## Risks and Mitigations (amended)

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Visibility eventual consistency window allows race | Post-create double-check 5s window (validator-amended); user-mediated resolution (UD4 approved) |
| R2 | TTL too short → GH rate limit | 5-min default well within budget; configurable |
| R3 | TTL too long → drift | `forceRefresh` parameter; freshness metadata in response |
| R4 | Search attribute slot exhaustion | `AdvBacklogIssueNumber` is single Keyword — no pressure on 3-KeywordList limit (validator confirmed) |
| R5 | Existing changes without `origin.issue_number` | Schema is optional; Visibility query just returns no match; falls through to today's behavior |
| R6 | Workflow-bundle boundary regression | No new imports from `storage/`, `tools/`, etc. into `temporal/`; only `search-attributes.ts` + `contracts.ts` changes which are already workflow-safe (validator confirmed) |
| R7 | `gh project item-list` failures | Existing error handling; TTL freshness metadata surfaces stale state to caller |
| R8 | `adv_wip_state` aggregation slow | Three reads (Visibility, worktree DB, session registry); ~50ms typical. Acceptable for v1; can split if profiling shows hot path |
| R9 | Schema migration for existing snapshots | Default missing TTL fields to "stale" on read — forces refresh, no manual migration |
| R10 (NEW) | `seedState.origin` not propagated for existing in-flight workflows | New `origin` field is optional; existing workflows without it just emit no `AdvBacklogIssueNumber` search attribute and continue working. Backfill via signal only if needed (likely not — existing changes rarely have `origin.kind === 'roadmap'`). |
| R11 (NEW) | `AdvAffectedProjects` vs `AdvProjectId` pre-existing inconsistency | New code uses `AdvAffectedProjects` (the registered attribute). The legacy `AdvProjectId` reference in `list-change-workflows.ts:84` is out of scope but logged as an agenda follow-up. |

## Open Questions for Planning

Per agreement, only LOW-severity detail-level decisions remain. Planning should:

1. Confirm the post-create double-check timing — 5s default (validator-recommended); tune if profiling shows otherwise
2. Decide TTL config field location (recommended: `.adv/github-project.json.cache_ttl_ms`)
3. Finalize `adv_wip_state` wire format (proposed: `{ active_changes: [...], worktrees: [...], peer_sessions: [...] }`)
4. Decide whether `CLAIM_RACE_DETECTED` advisory blocks (return error) or warns (return success + warning field) — agent recommends warning
5. Decide whether to add an agenda item for fixing the `AdvProjectId` legacy reference (validator surfaced; out of scope for this change)

## Validator Result (Phase 3.5, v2)

**Verdict: CAUTION**

| Dimension | Findings |
|---|---|
| 1. Correctness | 1 conflict-level (resolved via amendment A0); 1 caution (resolved via 5s window); 1 info confirming O(1) Visibility query is achievable |
| 2. Simplicity | 1 caution (2-tool split — kept as judgment call with rationale); 1 info on 5-min TTL rationale |
| 3. Spec-law compliance | 3 info confirming KeywordList limit OK, workflow-bundle-boundary safe, no-psw passing; 1 caution on `AdvAffectedProjects` vs `AdvProjectId` (resolved by using the registered attribute) |
| 4. Key alternatives | 2 info confirming no superior alternative exists (workflow-ID-from-issue rejected; no other Temporal-native primitive better) |

**Validator recommendation (amended into design):**
- ✓ A0 — Add `origin` to `ChangeWorkflowState` + `ChangeWorkflowInput.seedState` (folded as Phase A task 0)
- ✓ 5s double-check window (was 1s)
- ✓ Use `AdvAffectedProjects` (not `AdvProjectId`) for project scoping
- ✓ Note legacy `AdvProjectId` reference as out-of-scope follow-up
- ✓ Tool count kept at 2 new (judgment-call decision; rationale recorded)

All blocking findings folded into the design above. Architecture verdict: sound.
