## Why

Backlog and WIP state is fragmented across four surfaces — GitHub Project v2, the `ROADMAP.md` snapshot, in-flight ADV changes, and individual agent sessions — and they drift. In a single-developer-multi-agent workflow, agents and the user operate on stale or conflicting views, which breaks coordination: agents pick already-claimed work, miss recent priority shifts, or duplicate effort. Current `/adv-triage` + `/adv-roadmap` + GitHub Issues flow papers over this with batch syncs and file snapshots rather than solving the root cause. Downstream triage UX brittleness (limited write-in coverage, no batching, sequential question fatigue) compounds the friction but is a symptom, not the disease.

## Desired Outcome

A coordination model where ADV maintains a single, always-fresh, multi-participant view of backlog and WIP state — readable by every agent session and the user without manual refresh, writeable through a consistent agent-native interface, and resistant to drift. **Architecture grounded after Re-Entry Discovery v2** in the existing Temporal-native pattern (per-entity workflows + cross-entity visibility via Temporal search attributes), aligned with ADV's mission ("single user, single machine, trust the agent, durable trinity") and the post-cutover architectural baseline ("Keep architecture; no Temporal replacement").

The model must preserve human value assignment and the WSJF ranking model. Triage UX improvements (write-in coverage, batching, context carry-forward) follow from the coordination fix.

## What Changes

Final shape after Re-Entry Discovery v2:

- **No new long-lived shared workflow.** Cross-entity coordination uses Temporal search attributes on per-change workflows — the same pattern already in production for `AdvWorktreeBranches` / `AdvWorktreePaths`.
- **The change workflow IS the claim.** When `/adv-proposal #N` creates a change with `origin.issue_number = N`, that change is the durable claim record. No separate claim primitive needed.
- **New search attribute:** `AdvBacklogIssueNumber: Keyword` (single value per change) — enables `AdvAffectedProjects = "{pid}" AND AdvBacklogIssueNumber = "{N}" AND AdvChangeStatus IN ("draft","pending","active")` Visibility queries to detect duplicate claims and to compute the active-change cross-reference in O(1) instead of O(n×m).
- **Backlog ranking + V/WSJF stays in GH Project.** Local cache (`.adv/roadmap-snapshot.json`) already exists with TTL freshness; extend with explicit `last_refreshed`, force-refresh, and Visibility-derived active-change annotation.
- **`adv_change_create` adds atomic claim check:** before creating, Visibility-query for any existing change with same `origin.issue_number` in non-terminal status. If found, surface conflict; if clear, proceed atomically.
- **Single-call WIP visibility** = tool-layer aggregation over Temporal Visibility (changes), worktree state, and session registry. No new substrate.
- **Origin field on `ChangeSchema` already exists in code** (confirmed lines 452 + 532 of `plugin/src/types/changes.ts`). The remaining work is `AdvBacklogIssueNumber` search attribute + atomic create-time claim check + replacing O(n×m) active-change index with Visibility query.

## Success Criteria

The change is successful when all of the following are observable:

- Any agent session, on any tool invocation that surfaces backlog state, sees the same priority order and item set as the user's GH Project view, with drift bounded by a documented freshness window (default 5 min, configurable, `forceRefresh` available)
- An agent can register a backlog claim atomically via `adv_change_create` with `origin.issue_number = N`; a peer session attempting the same gets a typed conflict response with the existing change ID
- WIP state (active changes + worktrees + peer-session pickups) is queryable via a single ADV tool call that aggregates Temporal Visibility + worktree state + session registry
- `/adv-triage` no longer requires manual invocation to keep backlog and ADV change state consistent; consistency is intrinsic via search-attribute-derived annotation
- Human value (V) assignment workflow is preserved unchanged; the agent never writes the V field autonomously
- WSJF ranking formula is unchanged
- Active-change cross-reference moves from O(n×m) reads to O(1) Visibility query
- An enumerated regression list (RL-1 through RL-7), built during discovery from current pain points, covers all known multi-agent coordination failures and each is verified resolved by acceptance

## Affected Code

Settled list (based on v2 substrate decision):

- `plugin/src/temporal/search-attributes.ts` — add `AdvBacklogIssueNumber: "Keyword"` to `ADV_SEARCH_ATTRIBUTES`; populate from `state.origin?.issue_number` in `buildChangeSearchAttributes`
- `plugin/src/tools/change.ts` — `adv_change_create` adds pre-create Visibility query for claim collision; returns typed conflict response
- `plugin/src/tools/roadmap.ts` — `buildActiveChangeIndex` replaced with single Visibility query; deprecation marker on `adv_roadmap` recommending new `adv_backlog_state`
- `plugin/src/tools/backlog.ts` (NEW) — `adv_backlog_state` (aggregated read of GH cache + claims via Visibility), `adv_wip_state` (Visibility + worktrees + sessions aggregation). No claim/release tools needed — change creation IS the claim.
- `plugin/src/temporal/observability.ts` — small extension for new search attribute build path
- `.opencode/command/adv-roadmap.md` — note recommended migration to `adv_backlog_state`
- `.opencode/command/adv-triage.md` — remove "refresh state" framing; scoring + reordering only
- `.opencode/command/adv-proposal.md` — `#N` form now calls atomic-claim path
- `.adv/specs/backlog-coordination.md` (NEW) — capability spec
- `.adv/specs/advance-workflow.md` — `rq-aw-backlog01` extension (7-gate lifecycle unchanged; coordination orthogonal)

## Related Repositories

None. Single-repo change.

## Constraints

- Single-developer-multi-agent scope only; not multi-tenant, not shared-team, not shared-CI
- Must preserve human value (V) assignment; no auto-ranking
- WSJF formula unchanged
- Must not require removing GitHub Issues/Projects as a human collaboration surface
- Must align with Temporal-only runtime storage model
- Must preserve the 7-gate lifecycle and change-as-contract semantics
- Must not break existing changes during cutover
- **(NEW after v2):** Must not reintroduce a project-level shared workflow (D3 retirement intent; `no-psw-references.test.ts` denylist enforced)
- **(NEW after v2):** Must respect Temporal dev-server search-attribute limit (3 KeywordList per namespace, currently fully allocated to `AdvAffectedProjects`, `AdvWorktreeBranches`, `AdvWorktreePaths`); `AdvBacklogIssueNumber` is a single Keyword (no slot pressure)

## Impact

- **Behavior:** Eliminates drift-induced coordination failures via Temporal Visibility queries. Atomic claim resolves RL-1 directly. O(1) cross-reference resolves RL-4.
- **Cost:** Significantly lower than v1 design estimates because no new long-lived workflow, no new state slots in workflow state, no new continue-as-new logic. Estimated ~10-12 tasks (vs v1's 18-24 for Option A or 12-16 for Option B).
- **Risk:** Lowest of the substrate options surveyed — uses an in-repo precedent already in production for worktree visibility; no novel infrastructure. The post-cutover audit (2026-05-11) explicitly endorses the current architecture.
- **Migration:** Strictly additive — new search attribute, new tool, deprecation note on existing `adv_roadmap`. Existing `github_issues` URL array preserved. Existing changes without `origin.issue_number` continue working (Visibility query just returns no claim, falls through to today's behavior).

## Context

Established baseline (from v1 + v2 discovery):

- `projectWorkflow` was retired in change `refactorChangeWorkflowsSignal` (May 7, 2026) and the implementation completed via `cullDeadCodeFixArchive`. Rationale: "Temporal as a database" was the wrong fit for ADV's actual workload. Reference architecture: [claude-tempo](https://github.com/vinceblank/claude-tempo) — same library, correct usage.
- `no-psw-references.test.ts` (289 lines) actively blocks reintroduction of PSW symbols. The blocklist exists because the same antipattern keeps trying to come back.
- Post-cutover audit (May 11, 2026) explicitly states: "Keep architecture; no Temporal replacement. Per-change workflows, signal-driven mutations, query reads, workflow-bundle boundary tests."
- `ChangeOriginSchema` and `origin: ChangeOriginSchema.optional()` already exist in `ChangeSchema` (lines 452 and 532). The schema work mostly done; what remains is the search-attribute population and atomic create-time check.
- `AdvWorktreeBranches` / `AdvWorktreePaths` already implement the exact cross-entity-visibility-via-search-attributes pattern this design needs. Direct precedent for `AdvBacklogIssueNumber`.
- ADV mission tagline: "ADV gives human orchestrators maximum power over their agentic workflows." Single user, single machine. Durable trinity = specs + wisdom + summaries are git-tracked durable; everything else is working memory.

## Discovery Findings (v1 retained, v2 additions below)

### Discovery Checklist v2

| # | Step | Result | Notes |
|---|------|--------|-------|
| 1 | Skill Discovery | SKIP | Same as v1 — no skill matches; not a repeatable methodology |
| 2 | Prior Research Extension | PASS | New cited: `docs/decisions/2026-05-04-signal-driven-change-workflows.md` (770-line architectural decision record); `.adv/archive/2026-05-07-refactorChangeWorkflowsSignal/{proposal,design}.md`; `.adv/archive/2026-05-09-verifyFixFalseProjectworkflow/ARCHIVE_SUMMARY.md`; `docs/post-cutover-wide-system-audit.md`. **New finding:** the architectural pattern needed for backlog coordination already exists in production (search-attribute-based cross-entity visibility). |
| 3 | Conflict & Related-Work Scan | PASS | v1 scan results unchanged. No new conflicts surfaced. |
| 4 | Edge Case Investigation | PASS | v1 cases preserved; new claim-collision edge cases added below. |
| 5 | Design Question Depth | PASS | DQ1 (substrate), DQ4 (command evolution), DQ5 (WIP scope) all RESOLVED by v2 discovery; new DQ6 (search attribute slot management) added. |
| 6 | Draft Spec Deltas | PASS | Reduced from 2 large deltas to 1 focused delta + 1 extension. |
| 7 | P25 Related-Pattern Scan | PASS | Found: `AdvWorktreeBranches` / `AdvWorktreePaths` precedent in `plugin/src/temporal/search-attributes.ts:21-22` and `buildChangeSearchAttributes` lines 191-200. Direct architectural template. |
| 8 | LBP Check (with External-Solution Check) | PASS | LBP direction confirmed by in-repo precedent + claude-tempo reference + post-cutover audit. External-solution check satisfied by `docs/decisions/2026-05-04-signal-driven-change-workflows.md` which already covers prior-art comparison (claude-tempo, Field Journal queue research). |

### Resolutions to v1 Deferred Decisions

**UD1 (Substrate direction) — RESOLVED**

Substrate is Temporal-native via search attributes on per-entity workflows. Specifically:
- The change workflow itself acts as the durable claim record (no new workflow type)
- A new single-value Keyword search attribute `AdvBacklogIssueNumber` enables cross-session claim visibility
- Backlog ranking and V/WSJF stay in GitHub Project (no change to user-facing surface)
- Local TTL-cached projection in `.adv/roadmap-snapshot.json` (already exists) handles the "fresh enough" read path
- Active-change cross-reference moves from O(n×m) (`buildActiveChangeIndex`) to O(1) Visibility query

Why this works:
1. In-repo precedent: `AdvWorktreeBranches` does exactly this pattern in production today
2. Mission alignment: respects "single user, single machine, trust the agent, durable trinity" — change workflows already provide durable record; no separate state needed
3. Post-cutover audit endorses "keep architecture; no Temporal replacement"
4. claude-tempo reference architecture confirms this is the Temporal-native pattern
5. No new long-lived workflow → no D3 antipattern reintroduction → no `no-psw-references.test.ts` modification → no governance concern

**UD2 (Bug/feature split) — RESOLVED**

Unified surface. With the search-attribute approach, bug/feature distinction is just a queryable label, not an architectural boundary. Both have the same `origin.issue_number` path. Splitting would add complexity without value.

**UD3 (Command evolution) — RESOLVED**

- `/adv-roadmap` — internally delegates to new `adv_backlog_state` tool when Visibility is reachable; falls back to existing snapshot read when not. Marked for deprecation but kept for one release cycle.
- `/adv-triage` — simplified. Removes "refresh state" framing entirely. Focuses on bulk re-scoring, adding items, manual reordering. State refresh is automatic via TTL + Visibility annotation.
- `/adv-proposal #N` — adds atomic claim check via Visibility query before `adv_change_create`. If existing non-terminal change has same `origin.issue_number`, surface conflict to user (with the existing change ID and a recommendation to resume or override).
- No new user-facing command needed. The architecture absorbs the claim semantics into existing flows.

**DQ5 (WIP scope) — RESOLVED**

v1 WIP unification (worktrees + sessions in addition to backlog claims) is feasible in v1 because the substrate decision removes the implementation cost barrier. The new `adv_wip_state` tool is a thin aggregator over three existing data sources (Visibility, worktree state, session registry); no coordination workflow needed.

### New DQ from v2 Research

**DQ6: Search-attribute slot management**

- Trust model: Joint (Temporal dev server has hard limits; future capacity decisions affect user)
- Blast radius: Low for this change (`AdvBacklogIssueNumber` is single Keyword, not KeywordList; no slot pressure today)
- Alternatives: (A) Single Keyword (recommended, used here), (B) Append to existing KeywordList (would consume a precious slot), (C) Encode multiple values into a joined Keyword string (rejected — defeats indexed query semantics)

### New Edge Cases (claim collision paths)

**Gap CC1: Two sessions race on `/adv-proposal #N`**
- EC-CC1a: Both sessions run Visibility query simultaneously, both see "no existing claim," both call `adv_change_create`. Mitigation: Temporal Visibility eventual consistency window (~milliseconds); second create succeeds at workflow start but subsequent Visibility query (e.g., by tool-layer post-create check) surfaces the collision. Tool-layer follow-up resolution: if N changes created for same issue within 1s of each other, surface to user as "duplicate detected — keep change X or change Y?"
- EC-CC1b: One session creates change, user pauses for confirmation; second session races in. Mitigation: change is created BEFORE user confirmation in current `/adv-proposal` flow — race window closes at the create call, not at user approval. No regression in current behavior.

**Gap CC2: Issue closed between Visibility query and `/adv-proposal` confirmation**
- EC-CC2a: User invokes `/adv-proposal #51`; agent runs Visibility query showing no claim; user clicks away; another agent or human closes issue #51 in GH; first user returns and confirms. Mitigation: refresh on confirm (cheap), or accept the eventual-consistency cost (worst case: change created against closed issue; archive cleans up).
- EC-CC2b: Visibility query returns stale (Temporal eventual consistency). Mitigation: Visibility staleness is typically <1s; for higher-fidelity check, fall back to direct workflow query on the suspected colliding change ID.

### Updated LBP Check

**External-Solution Check (gated):**

Two prior-art sources cited:

1. **`docs/decisions/2026-05-04-signal-driven-change-workflows.md`** — comprehensive architectural decision record covering: workflow-as-state-holder vs workflow-as-database, signal-driven mutations, query-based reads, search attributes for cross-entity visibility, durable trinity contract, claude-tempo reference architecture, ~17 prior issues that motivated the cutover.

2. **`docs/decisions/temporal-readiness-decision.md`** + **`docs/decisions/storage-direction-report.md`** — Temporal-only migration rationale.

**LBP recommendation:** Use the existing in-repo pattern (search attributes on per-entity workflows for cross-entity visibility). This is not a hypothesis — it's the production pattern already serving `AdvWorktreeBranches` / `AdvWorktreePaths`. Direct architectural template.

No external research needed; the prior-art question was settled by the May-2026 cutover decision record. New external research would be duplicative.

### Updated Spec Deltas

**Delta 1 (revised): New capability spec `backlog-coordination`**
- `rq-backlogCoord01` — Cross-session claim visibility via `AdvBacklogIssueNumber` search attribute
  - Given: an agent session creates a change with `origin.kind === 'roadmap'` and `origin.issue_number = N`
  - When: a peer agent session queries Temporal Visibility for `AdvBacklogIssueNumber = N` AND `AdvChangeStatus IN ("draft","pending","active")`
  - Then: the response includes the existing change ID with non-terminal status
- `rq-backlogCoord02` — Atomic claim check at change-create time
  - Given: `adv_change_create` is called with `origin.kind === 'roadmap'` and `origin.issue_number = N`
  - When: a Visibility query finds an existing non-terminal change with the same `origin.issue_number`
  - Then: the tool returns a typed `CLAIM_CONFLICT` error including the existing change ID, allowing the calling agent to surface the conflict to the user
- `rq-backlogCoord03` — Single-call WIP visibility aggregator
  - Given: an ADV project with multiple in-flight changes, active worktrees, and peer sessions
  - When: `adv_wip_state` is called
  - Then: the response includes (a) active changes from Temporal Visibility, (b) worktree state, (c) peer session list, composed in a single tool call with a single round trip per data source
- `rq-backlogCoord04` — Active-change cross-reference uses Visibility, not workflow gets
  - Given: a backlog snapshot is being rendered
  - When: the active-change index is computed
  - Then: the implementation uses a Temporal Visibility query (`AdvBacklogIssueNumber IN [...]`) and not N × `store.changes.get()` calls

**Delta 2 (unchanged): Extension to `advance-workflow`**
- `rq-aw-backlog01` — 7-gate lifecycle is orthogonal to backlog coordination
  - Given: a change progressing through the 7 gates
  - When: gate transitions occur
  - Then: search attributes are upserted reflecting the new gate; backlog coordination state is unaffected by gate semantics

### Updated Regression List

RL-1 through RL-7 from v1 unchanged. Mapping to v2 substrate:

| RL | Mechanism resolved by v2 design |
|---|---|
| RL-1 (duplicate work) | Atomic claim check at `adv_change_create` via Visibility query |
| RL-2 (stale priorities) | TTL refresh on `.adv/roadmap-snapshot.json` (existing pattern, extended) |
| RL-3 (orphaned claims) | Change workflow IS the claim; archived/closed status = released claim automatically |
| RL-4 (missing active-change annotation) | O(1) Visibility query replaces O(n×m) `buildActiveChangeIndex` |
| RL-5 (snapshot drift) | Snapshot remains TTL-cached; Visibility annotation guarantees freshness independent of snapshot |
| RL-6 (unbounded triage) | `/adv-triage` no longer responsible for state refresh |
| RL-7 (cross-session blindness) | Visibility queries surface all peer-session claims |

### AMBIGUITY ANALYSIS v2

```
B1  LOW  Boundaries  Some implementation details still TBD at design (atomicity window tolerance, conflict-surface UX)
  Evidence: proposal.md:What Changes "Visibility-query for any existing change with same origin.issue_number"
  Reason: unclear because Visibility eventual-consistency window is documented but not yet quantified — acceptable to resolve in design

F1  LOW  Functional Scope  "5 min default" TTL not yet codified as configuration field
  Evidence: proposal.md:Success Criteria "drift bounded by a documented freshness window (default 5 min, configurable, forceRefresh available)"
  Reason: design needs to specify the config field; acceptable design-phase detail

S1  LOW  Completion Signals  No vague language remains in v2 success criteria — each is operationally testable
```

Coverage: `B:C F:C S:C M:C`

**Threshold check:** 0 CRITICAL, 0 HIGH, 2 LOW (cosmetic detail-deferral, not vague language). → Trigger NOT met → continue.

## Scope (unchanged)

### In Scope

- Backlog state (the ranked list of unstarted work)
- WIP state coordination (which changes are in-flight, which agent session is working what, worktree-to-change mapping)
- Sync model between whatever surface holds the backlog and ADV changes
- `change.origin` typed linkage utilization (schema already exists; remaining work is search-attribute population + atomic check)
- `/adv-triage` and `/adv-roadmap` command surfaces (modified, not replaced)
- Multi-session coordination signals related to backlog/WIP
- New capability spec covering the chosen coordination model

### Out of Scope

- Removing GitHub Issues/Projects entirely as a product surface
- Auto-assigning value scores (V); human keeps that step
- Redesigning the WSJF formula
- Multi-tenant, shared-team, or shared-CI coordination
- Reflection / wisdom / agenda primitives that do not relate to backlog or WIP
- Spec lifecycle changes (specs remain in-repo, branch-local per current model)
- Changes to the 7-gate sequence or gate semantics
- Deployment / CI / release pipeline changes
- **(NEW after v2):** Reintroducing any long-lived shared workflow (project-level state holder); the search-attribute pattern replaces this need
