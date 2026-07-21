---
name: adv-triage
description: Triage sources, coalesce issue links, assign bug priority, and balance portfolio
---
# ADV Triage — Issue Reconciliation and Portfolio Balance

Reconcile backlog sources into GitHub issues, apply `priority:*` labels to bugs autonomously, coalesce unlinked issue↔change overlaps with explicit approval, and report what to finish, clean up, or start. GitHub Projects v2 remains canonical for issue/project membership. Temporal-backed ADV changes and Epics remain canonical for work in progress. ROADMAP.md, `.adv/roadmap-snapshot.json`, `/adv-roadmap`, and `adv roadmap` are retired surfaces; the portfolio reader MCP tool is also retired.

> **rq-backlogCoord01 / rq-backlogCoord05 note:** Issue claims use `AdvBacklogIssueNumber` through bounded Temporal Visibility reads. `/adv-triage` may correlate the open issue pool with active changes, but MUST NOT perform per-change fallback reads when Visibility is unavailable.

> **CHECKLIST**: Default execute. `--dry-run` previews without mutations. Tier B inline approval required before opening issues, mutating cleanup state, or linking coalesce pairs. Bug priority uses `priority:{critical,high,medium,low}` labels. Heuristics may nominate pairs, never authorize links or suppression (P33).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-triage")` → source enumeration, structural matching, cleanup validation, coalesce evidence tiers, approval parser, portfolio-balance schema, report template, and anti-patterns. If unavailable, continue with this embedded protocol.

## Parse Flags

- `--dry-run` — preview only; skip GH/link/cleanup mutations + Tier B prompts
- `--source <name>` — limit Phase 2 scan: `gh`/`wisdom`/`notes`/`changes`/`epics`/`todos`

Reject unknown flags: single-line error + valid list.

---

## Phase 1: Preflight

| # | Check | Failure |
|---|---|---------|
| 1 | `gh auth status` authenticated | "Run `gh auth login`." |
| 2 | Token scopes include `project`, `repo` | "Run `gh auth refresh -s project,repo`." |
| 3 | `git rev-parse --show-toplevel` resolves | "Not a git repo." |
| 4 | `gh repo view --json nameWithOwner` resolves | "No GitHub remote." |
| 5 | Required labels exist: `bug`, `feature`, `priority:{critical,high,medium,low}` | Auto-create via `gh label create` (idempotent); log creations |

Any failure → `[ADV:BLOCKED]` + cause, stop. Resolve project handle, ensure custom fields, apply repository-filter auto-detect (first-run only), persist metadata. See skill § Phase 0.

---

## Phase 2: Gather Sources

Inline parallel reads (I/O bound, no sub-agents). 7 sources: open GH issues, GH Projects items, active ADV changes, active ADV Epics, wisdom, cross-session notes, TODO/FIXMEs. Cap each 100; overflow → recency sort + `(N more not shown)`. Build inventory records with stable refs, linkage fields, optional Epic membership, and advisory `kind_hint`. Use `adv_change_list status:'in-flight'`, `adv_epic_list`, and bounded `adv_epic_show` only for plausible relevant Epics. See skill § Phase 1.

---

## Phase 3: Match + Identify Gaps

Structural-first match (stable ref → body excerpt → title similarity). Build `represented[]` + `unrepresented[]`. Title-similarity is heuristic-only — stays in user-confirmation list, never auto-suppresses. See skill § Phase 2.

## Phase 3.5: Source Cleanup Validation (Tier B, batched)

After `represented[]` / `unrepresented[]` are built and before any issue creation or bug priority assignment, validate the whole source pool for cleanup decisions. Build command-local `cleanup_decisions[]` with source, stable ref, classification, evidence, proposed action, survivor/source when applicable, and source/reason approval group. Classifications: `relevant`, `stale/already-addressed`, `duplicate/superseded`, `should-merge`, `unclear`.

- `relevant` → may proceed to Phase 4 issue creation or bug priority assignment.
- `stale/already-addressed` / `duplicate/superseded` / `should-merge` → surface source, reason, evidence, survivor/source, and proposed action; mutate/suppress only after explicit Tier B approval batched by source/reason.
- `unclear` → ask focused relevance clarification before issue creation or priority assignment; unresolved items stay visible and are not silently suppressed.

Source-specific actions after approval:

- ADV changes: recommend `/adv-archive` for completed/ready work; close duplicate/superseded/not-planned/cancelled only through ADV close tools with approval evidence.
- GitHub issues: capability-detect duplicate close support via `gh issue close --help`. If `--duplicate-of` is available, use native duplicate close. If unavailable, use documented `Duplicate of #N` comment semantics plus supported close reasons only.

MUST NOT create or open issue candidates before cleanup validation completes for the source pool. MUST NOT apply bug priority labels before cleanup validation completes. Title similarity and agent inference are advisory only (P33): they may flag cleanup candidates, never mutate, close, suppress, or remove without structural evidence and explicit approval. See skill § Source cleanup validation.

If `unrepresented[]` is empty, represented issues have required fields, and cleanup validation has completed with no unresolved cleanup/clarification actions: `No new issues, no label gaps.` Skip Phase 4a issue creation, then continue through Phase 5 coalesce and Phase 6 portfolio balance.

---

## Phase 4: User Assignments (Tier B, batched)

### 4a. Confirm new issues

When `unrepresented[]` non-empty: emit Tier B inline approval (skill § Phase 3a). On approval: `gh issue create`, add to project, set `ADV Type`. Triage-origin tagging (rq-issueChangeLinkage01): subsequent `/adv-proposal` for promoted issue MUST pass `origin_kind: 'triage'`, `origin_source_artifact`, `origin_issue_number`.

### 4b. Relevance validation

Thin late fallback only: if a field-gap candidate was not covered by Phase 3.5 cleanup validation or new evidence appears after issue creation, relevance-check before asking for bug context or applying priority. Evidence sources: issue body/comments/labels/project status, linked ADV change state, current source/docs/tests for implementation-gap claims, and user-provided context from the run. Classify each item as `relevant`, `stale/already-addressed`, `duplicate/superseded`, or `unclear`.

- `relevant` → include in the Phase 4c bug priority loop.
- `stale/already-addressed` or `duplicate/superseded` → surface evidence and get explicit user approval before closing/removing/deprioritizing.
- `unclear` → ask a focused relevance question before any priority question.

MUST NOT apply bug priority labels before relevance validation completes for that item. Relevance heuristics are advisory only (P33): they may rank or flag, never close or suppress without the required user approval path. See skill § Phase 3b.

### 4c. Bug priority loop (agent-driven)

For each bug lacking a `priority:*` label (or where the existing label is ambiguous), the agent applies the priority autonomously.

Rules:
- **Idempotent** — skip any bug that already has exactly one `priority:{critical,high,medium,low}` label.
- **Partial-apply safe** — if one assignment fails, log the error and continue with the next bug. Never roll back prior successful assignments.
- **Bounded context budget** — ask the user at most 2 focused questions per bug to gather missing context (impact, frequency, workaround). MUST NOT use `question` tool to confirm priority choice; use it only to gather context.
- **Default tier** — if context is still insufficient after 2 questions, assign `priority:medium` and add a `context_insufficient` label.
- **Rationale trailer** — after each assignment, emit `<issue#>: priority=<tier> :: <rationale>` in chat output only. Never post rationale as an issue comment.
- **Apply** — use `gh issue edit <num> --add-label priority:<tier>` (and `--add-label context_insufficient` when defaulted).

If `--dry-run`, emit the planned assignments and rationale trailers instead of mutating labels.

---

## Phase 5: Coalesce Unlinked Changes ↔ Issues (Tier B)

Build candidates only between **active ADV changes and open GitHub issues**. Change↔change duplicate/supersession remains `/adv-cleanup` ownership. Epic state supplies context, not an implicit link authority.

### 5a. Existing-link exclusion

Skip pairs already linked by any structural source:
- `change.origin.issue_number`
- linked issue URL in `change.issues`
- stable issue reference in a typed Epic entry or explicit Epic membership metadata

Never propose a second link for an already-linked pair.

### 5b. Evidence tiers

| Tier | Evidence | Treatment |
|---|---|---|
| `structural` | stable `#N` / `closes #N` / issue URL in proposal or problem statement; exact distinctive body excerpt | show as strong candidate |
| `heuristic` | normalized title/token similarity only | show as advisory candidate; never auto-link |

Each displayed pair includes: numbered index, change ID/title, issue number/title, evidence tier, verbatim bounded evidence, and Epic context (`epic_id`, entry order/title) when present.

### 5c. Approval parser

Display at most 20 pairs per batch. Hidden overflow is never authorized by a response to the displayed batch.

Reply grammar (exact, no LLM fallback):
- `approve all` — link all DISPLAYED pairs only
- `reject all` — skip displayed pairs
- `link N` / `link N,M` — link only numbered pairs
- `skip N` / `skip N,M` — link every displayed pair except numbered pairs
- `stop` / `abort` — halt without linking

Anything else → re-prompt. On approval, call `adv_change_update_issues changeId:<id> add:[<issue-url>]` per approved pair. Partial failure is safe: retain successful links, report failed pairs with exact retry calls, continue only when failure does not corrupt linkage authority. `--dry-run` emits candidates and proposed calls without prompting or mutating.

---

## Phase 6: Portfolio-Balance Report

Emit exactly three sections. Cap each section at 10 rows and append `(N more not shown)` when truncated. No chat popup and no file write.

### Important to complete

Rank active changes by existing signals only:
1. linked issue priority (`critical` → `high` → `medium` → `low` → none),
2. gate proximity to release (release/acceptance/execution before earlier gates),
3. recent activity as deterministic tie-breaker.

Each row includes change ID/title, current gate, task progress, last activity, linked issue + priority, and optional Epic ID/title/order. Epic order is advisory: warn when earlier entries remain incomplete, never block work solely due to order. Resume pointer: `→ /adv-apply {change-id}`.

### Cleanup needed

Report counts + top IDs for `/adv-cleanup` buckets: ready-to-archive, stuck-at-proposal, abandoned-mid-flight, duplicate/superseded. Include stale Epic-entry projection warnings when found, but route repair through typed Epic repair tools or `/adv-cleanup`; `/adv-triage` MUST NOT close/cancel/archive changes or mutate Epic membership in this section.

Pointer: `→ /adv-cleanup`.

### Open issues worth solving

List open issues with no linked active ADV change after Phase 5, sorted by `priority:*` then recency. Annotate related Epic shell/entry context when structurally present. Pointer: `→ /adv-proposal #N` (new issue-linked changes use `origin_kind:'triage'`). Never silently suppress overflow or heuristic overlaps.

---

## Phase 7: Final Report

Emit: sources scanned, issues created, priorities assigned, coalesce pairs proposed/linked/rejected/failed, active Epics inspected, and three portfolio-balance counts. If `--dry-run`, append `Re-run without --dry-run to apply mutations.`

---

## Constraints

- × MUST NOT auto-create GH issues without Tier B approval
- × MUST NOT auto-link a coalesce pair without approval covering that displayed pair
- × MUST NOT let `approve all` authorize hidden overflow pairs
- × MUST NOT use heuristic similarity as linkage, cleanup, gate, or suppression authority (P33)
- × MUST NOT own change closure or Epic repair from the portfolio report; delegate to typed paths
- × MUST NOT write feature scoring fields from this command
- × MUST NOT write `priority:*` labels to non-bug issues
- × MUST NOT generate, echo, stage, commit, or push ROADMAP.md or `.adv/roadmap-snapshot.json`
- × MUST NOT post priority rationale as issue comments
- × MUST NOT use `question` to confirm priority choice — only gather bounded context

---

## Key Tools

| Purpose | Tool |
|---|---|
| Skill | `skill("adv-triage")` |
| List open issues | `gh issue list --state open --json …` |
| Create issue | `gh issue create` |
| Edit labels | `gh issue edit <num> --add-label / --remove-label` |
| List project items | `gh project item-list <N> --owner <owner> --format json` |
| Add to project | `gh project item-add` |
| Project metadata | `adv_project_metadata` (read/write `github_project`) |
| Active ADV changes | `adv_change_list status:'in-flight'` |
| Change detail/linkage | `adv_change_show`, `adv_change_update_issues` |
| Active Epics | `adv_epic_list`, bounded `adv_epic_show` |
| Wisdom | `adv_wisdom_list` |
| Local source scan | `glob`, `read`, lgrep text search |
| Bug priority loop | `gh issue edit --add-label` |
