---
name: adv-triage
description: Triage sources, coalesce issue links, assign bug priority, and balance portfolio
---
# ADV Triage — Issue Reconciliation and Portfolio Balance

Reconcile backlog sources into GitHub issues, apply `priority:*` labels to bugs autonomously, coalesce unlinked issue↔change overlaps with explicit approval, and report what to finish, clean up, or start. GitHub Projects v2 remains canonical for issue/project membership. ADV changes and Epics remain canonical for work in progress. ROADMAP.md, `.adv/roadmap-snapshot.json`, `/adv-roadmap`, and `adv roadmap` are retired surfaces; the portfolio reader MCP tool is also retired.
<!-- rq-roadmapCliBridge01 rq-backlogCoord07 -->

> **rq-backlogCoord01 / rq-backlogCoord05 note:** Issue claims use `AdvBacklogIssueNumber` through bounded disk reads. `/adv-triage` may correlate the open issue pool with active changes, but MUST NOT perform per-change fallback reads when the bulk read is unavailable.

> **CHECKLIST**: Default execute. `--dry-run` previews without mutations. Tier B inline approval required before opening issues, mutating cleanup state, or linking coalesce pairs. Bug priority uses `priority:{critical,high,medium,low}` labels. Heuristics may nominate pairs, never authorize links or suppression (P33).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-triage")` → source enumeration, structural matching, cleanup validation, coalesce evidence tiers, approval parser, portfolio-balance schema, report template, and anti-patterns. Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).

## Parse Flags

- `--dry-run` — preview only; skip GH/link/cleanup mutations + Tier B prompts
- `--source <name>` — limit the source scan (skill § Gather Sources): `gh`/`wisdom`/`notes`/`changes`/`epics`/`todos`

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

## Phase 4: User Assignments (Tier B, batched)

### 4a. Confirm new issues

When `unrepresented[]` non-empty: emit Tier B inline approval (skill § Phase 3a). On approval: `gh issue create`, add to project, set `ADV Type`. Triage-origin tagging (rq-issueChangeLinkage01): subsequent `/adv-proposal` for promoted issue MUST pass `origin_kind: 'triage'`, `origin_source_artifact`, `origin_issue_number`.

### 4b. Relevance validation

Thin late fallback only: if a field-gap candidate was not covered by cleanup validation (skill § Source Cleanup Validation) or new evidence appears after issue creation, relevance-check before asking for bug context or applying priority. Evidence sources: issue body/comments/labels/project status, linked ADV change state, current source/docs/tests for implementation-gap claims, and user-provided context from the run. Classify each item as `relevant`, `stale/already-addressed`, `duplicate/superseded`, or `unclear`.

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
| Active Epics | `adv_change_list filter: {kind: "epic"}`, bounded `adv_change_show` |
| Wisdom | `adv_wisdom_list` |
| Local source scan | `glob`, `read`, lgrep text search |
| Bug priority loop | `gh issue edit --add-label` |


## Resume Projection Consumption

The `adv_resume_projection` tool provides structural portfolio "what to start/promote next" via `ordered_next` and `actionable[]`. Consume the projection for portfolio-balance recommendations instead of heuristic sequencing.
