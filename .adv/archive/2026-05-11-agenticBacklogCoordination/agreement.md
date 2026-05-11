# Agreement (v2 — post-substrate-decision)

> **Note:** This supersedes the v1 agreement (2026-05-11) where substrate, command evolution, and bug/feature split were deferred to `/adv-design`. After re-entering discovery with the user's directive to incorporate `/adv-improve`-style research inline, all three deferred decisions resolved during v2 discovery.

## Objectives

1. Design and implement a coordination model for ADV backlog state that eliminates drift between the agent view and the user view in single-developer-multi-agent workflows.
2. Establish a typed, queryable backlog interface (Zod schemas, ADV tool calls) that any agent session can read without manual snapshot refresh.
3. Use Temporal search attributes on per-entity workflows for cross-session claim visibility (matching the existing `AdvWorktreeBranches` / `AdvWorktreePaths` precedent).
4. Make the change workflow itself the durable claim record (no separate claim primitive, no project-level shared workflow).
5. Make `/adv-triage` optional for state refresh; consistency intrinsic via TTL + Visibility annotation.

## Acceptance Criteria

1. **AC1 — Consistent backlog reads:** Any agent session calling `adv_backlog_state` sees the same item set and priority order as the user's GH Project view, with drift bounded by a documented freshness window (default 5 min, configurable, `forceRefresh` available).
2. **AC2 — Atomic claim via change creation:** `adv_change_create` with `origin.kind === 'roadmap'` and `origin.issue_number = N` performs a Visibility query before creation; if an existing non-terminal change has the same `origin.issue_number`, returns a typed `CLAIM_CONFLICT` error including the existing change ID. The change workflow itself becomes the durable claim record.
3. **AC3 — Post-create collision handling:** When eventual-consistency allows two simultaneous creates to succeed, a post-create double-check (within 1s window) surfaces the duplicate to the user with both change IDs; user picks which to keep.
4. **AC4 — Cross-session claim visibility:** Temporal search attribute `AdvBacklogIssueNumber: Keyword` is populated on every change with `origin.issue_number`. Visibility queries filtering on this attribute return all in-flight claims across peer sessions.
5. **AC5 — Single-call WIP visibility:** `adv_wip_state` returns aggregated view of (a) active changes from Temporal Visibility, (b) worktree state, (c) peer session list, in one tool call per agent session.
6. **AC6 — Active-change index O(1):** `buildActiveChangeIndex` in `plugin/src/tools/roadmap.ts` is replaced with a single Temporal Visibility query (no per-change `store.changes.get()` loop).
7. **AC7 — `/adv-triage` simplified:** `/adv-triage` focuses on scoring, reordering, and adding items. It no longer carries "refresh state" responsibility.
8. **AC8 — Human V preserved:** Agent never writes the Value (V) field autonomously; human value assignment workflow unchanged.
9. **AC9 — WSJF unchanged:** Ranking formula (V × TC × RROE / E) unchanged; scoring fields map 1:1 to existing GH Project fields.
10. **AC10 — Regression list verified:** All 7 items in the regression list (RL-1 through RL-7) are verified resolved by acceptance tests, mapped to their v2 mechanism in proposal.md.
11. **AC11 — Backward compat:** Existing changes with `github_issues` URL array linkage continue to function. Existing changes without `origin.issue_number` continue to load and operate — Visibility query just returns no claim and falls through to today's behavior.
12. **AC12 — No project-level workflow introduced:** Implementation does not add, reintroduce, or modify any project-level shared Temporal workflow. The `no-psw-references.test.ts` denylist test continues to pass without modification.

## Constraints

- Single-developer-multi-agent scope only; not multi-tenant, not shared-team, not shared-CI.
- Must align with Temporal-only runtime storage and the post-cutover signal-driven architecture.
- Must preserve 7-gate lifecycle and change-as-contract semantics.
- Must not remove GitHub Issues/Projects as a human collaboration surface.
- Must not break existing `github_issues` linkage during cutover.
- Must not reintroduce a project-level shared workflow (D3 retirement intent; `no-psw-references.test.ts` denylist enforced).
- Must respect Temporal dev-server search-attribute limit (3 KeywordList per namespace, fully allocated today; `AdvBacklogIssueNumber` is single Keyword, no slot pressure).

## Avoidances

- Replacing GitHub Issues/Projects entirely as a product surface.
- Auto-assigning value scores; human keeps Value (V) ownership.
- Multi-tenant, shared-team, or shared-CI coordination.
- Redesigning the WSJF formula or any ranking math.
- Changes to the 7-gate sequence or gate semantics.
- Reintroducing a project-level shared Temporal workflow under any name.
- Stronger atomicity via workflow-ID-from-issue-number — keeps `/adv-proposal` flexibility; user-mediated resolution is acceptable.

## Decisions

### User Decisions (v2 round)

- **UD1 (resolved) — Substrate direction:** Temporal search attributes on per-entity workflows. User confirmed: "Yes — ship this direction." The change workflow itself serves as the durable claim record; no new shared workflow, no project-level state holder.
- **UD2 (resolved) — Bug/feature split:** Unified surface. Bug/feature is a queryable label, not an architectural boundary. (Resolved by v2 substrate consequence; no separate question needed.)
- **UD3 (resolved) — Command evolution:** `/adv-triage` → score + reorder only. User confirmed via Q3 selection. `/adv-roadmap` delegates internally to new `adv_backlog_state` tool, deprecation note added, kept for one release cycle.
- **UD4 (v2-new) — Claim-race tolerance:** Post-create double-check + user-mediated resolution. User confirmed: "Acceptable — surface and let user pick." Aligns with mission stance "trust the agent + surface to user."

### Agent Decisions (LBP, v2 round)

- **AD1 (v1 preserved) — Prior art survey:** 12 systems analyzed in v1. Meta-finding still holds: ADV's use case is genuinely novel for cross-agent backlog coordination.
- **AD2 (v2-revised) — Freshness window:** 5-min TTL default. Specific value chosen during v2 discovery research. Configurable via `.adv/github-project.json`. `forceRefresh` parameter available.
- **AD3 (v2-revised) — Claims mechanism:** Change workflow IS the claim. No separate lease/heartbeat primitive needed; `change.status` IN ("draft","pending","active") is the claim's "live" state; archive/closure is the natural release event.
- **AD4 (v2-revised) — WIP scope:** Full WIP unification in v1 (not phased). Substrate decision removed the implementation cost barrier; `adv_wip_state` is a thin aggregator over three existing data sources.
- **AD5 (v2-confirmed) — Origin field already in code:** `ChangeOriginSchema` and `ChangeSchema.origin` already exist (lines 452 and 532 of `plugin/src/types/changes.ts`). v1's Phase A schema work is largely done. Remaining work: populate the new `AdvBacklogIssueNumber` search attribute and add atomic create-time check.
- **AD6 (v2-new) — In-repo precedent:** `AdvWorktreeBranches` / `AdvWorktreePaths` in `plugin/src/temporal/search-attributes.ts` is the direct architectural template. No new pattern needed.

## Deferred Questions

None for design. All v1 deferrals resolved during v2 discovery.

The only LOW-severity items remaining are detail-level decisions appropriate to resolve during `/adv-prep`:
- Exact Visibility-query timing for the post-create double-check (1s default; tuneable)
- TTL config field name and default location (recommend `.adv/github-project.json.cache_ttl_ms`)
- `adv_wip_state` exact wire format (fields and groupings)

## Re-Entry History

- 2026-05-11T02:21:19Z — Change created via `/adv-proposal`
- 2026-05-11T02:22:28Z — Proposal gate completed
- 2026-05-11T02:47:08Z — Discovery gate completed (v1)
- 2026-05-11T02:48Z (approx) — `/adv-design` exposed substrate decision problem (validator CONFLICT on D1 / projectWorkflow retirement)
- 2026-05-11T03:14:51Z — Discovery gate re-opened via `adv_change_reenter` (preserves audit trail; documented in `change.reentry_history`)
- 2026-05-11T03:1?Z — v2 discovery: D3 retirement archives + post-cutover audit + in-repo search-attribute precedent located, substrate decision grounded
- 2026-05-11T03:??Z — v2 acceptance criteria approved by user (this agreement)

## Sign-Off

- Acceptance criteria v2 approved by user: 2026-05-11
- Method: Inline approval (Tier A whitelist match: `approve`)
- Discovery findings v2 persisted in `proposal.md`
- Substrate decision grounded in: in-repo precedent (search attributes), prior architectural decision record (`docs/decisions/2026-05-04-signal-driven-change-workflows.md`), post-cutover audit (May 11), claude-tempo reference architecture, and user's substrate-alignment confirmation
- Wisdom captured: Temporal antipattern (gotcha, promoted) + stale-lgrep-architectural-claim (failure, promoted)
- Open questions resolved in v2 round; none deferred to design
