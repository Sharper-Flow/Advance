---
name: adv-triage
description: Triage backlog sources, reconcile into GH issues, apply bug priority labels, regenerate ROADMAP.md
---
<!-- manifest: adv-triage · requiresChangeId: false -->
# ADV Triage — Backlog Reconciliation, Bug Priority, Roadmap Regen

Reconcile backlog sources into GH issues, apply `priority:*` labels to bugs autonomously, and regenerate `ROADMAP.md`. Roadmap issue flow uses GH Projects v2 as truth. `ROADMAP.md` = generated mirror, committed and pushed at end. User questions gather bug context only; the agent owns priority assignment.

> **rq-backlogCoord01 / AC7 note:** After the agentic-backlog-coordination cutover, `/adv-triage` focuses on **reconciling, prioritizing bugs, and adding items**. Active-change annotation freshness is no longer this command's responsibility — `adv_backlog_state` derives it on demand via Temporal Visibility (`AdvBacklogIssueNumber`) under a TTL-bounded contract (default 5 min). Routine "is the backlog fresh?" use no longer requires running `/adv-triage`.

> **CHECKLIST**: Default execute. `--dry-run` previews without mutations. Tier B inline approval required before opening issues, before writing/pushing ROADMAP.md, before deprecating local sources — gates run in execute mode regardless of invocation. Bug priority via `priority:{critical,high,medium,low}` labels. Scoring fields on features are read-only on snapshot; GH Project remains canonical for any remaining numeric data.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-triage")` → bootstrap rules, source enumeration, match algorithm, prompt templates, ROADMAP layout, commit sequence, echo format, report template, anti-patterns. If unavailable, continue with embedded protocol.

## Parse Flags

- `--dry-run` — preview only; skip GH/file/git mutations + Tier B prompts
- `--no-commit` — write ROADMAP.md but skip commit/push (ignored when `--dry-run`)
- `--source <name>` — limit Phase 2 scan: `gh`/`agenda`/`wisdom`/`notes`/`changes`/`todos`

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

Inline parallel reads (I/O bound, no sub-agents). 7 sources: GH issues, GH Projects items, ADV changes, agenda, wisdom, cross-session notes, TODO/FIXMEs. Cap each 100; overflow → recency sort + "(N more not shown)". Build inventory records with `kind_hint` heuristic (advisory only, P33). See skill § Phase 1.

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
- Agenda: `duplicate/superseded` and `should-merge` resolve through `adv_agenda_complete` with a note referencing the survivor/source; stale/not-planned uses agenda cancellation only after approval.

MUST NOT create or open issue candidates before cleanup validation completes for the source pool. MUST NOT apply bug priority labels before cleanup validation completes. Title similarity and agent inference are advisory only (P33): they may flag cleanup candidates, never mutate, close, suppress, or remove without structural evidence and explicit approval. See skill § Source cleanup validation.

If `unrepresented[]` is empty, represented issues have required fields, and cleanup validation has completed with no unresolved cleanup/clarification actions → skip to Phase 5 ("No new issues, no label gaps.").

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
- **Bounded context budget** — ask the user at most 2 focused questions per bug to gather missing context (impact, frequency, workaround). Questions gather context only; do NOT ask the user to confirm or choose the priority.
- **Default tier** — if context is still insufficient after 2 questions, assign `priority:medium` and add a `context_insufficient` label.
- **Rationale trailer** — after each assignment, emit `<issue#>: priority=<tier> :: <rationale>` in chat output only. Never post rationale as an issue comment.
- **Apply** — use `gh issue edit <num> --add-label priority:<tier>` (and `--add-label context_insufficient` when defaulted).

If `--dry-run`, emit the planned assignments and rationale trailers instead of mutating labels.

---

## Phase 5: Generate ROADMAP.md

Fresh `gh project item-list` read (do NOT reuse Phase 2 caches). Apply `repository_filter` server-side scoping (rq-repoFilter01). Emit BOTH `ROADMAP.md` (repo root) AND `.adv/roadmap-snapshot.json` (programmatic mirror). Sort features issue # asc when all scoring fields are null; bugs by priority tier. Local source deprecation Tier B prompt. ROADMAP commit Tier B prompt. `commit and push` runs on default branch only (P32). See skill § Phase 5.

---

## Phase 5.5: Roadmap Echo (mandatory)

After ROADMAP.md written: agent MUST emit full content as fenced markdown in chat. NOT optional. NOT replaceable by pointer or top-N truncation. See skill § Phase 5.5.

---

## Phase 6: Final Report

Emit structured report: sources scanned, issues created/updated/prioritized/deferred/skipped, roadmap counts, local sources deprecated, file written. See skill § Phase 6. If `--dry-run`: append `Re-run without --dry-run to apply mutations.`

---

## Constraints

- × MUST NOT auto-create GH issues without Tier B approval
- × MUST NOT write feature scoring fields from this command
- × MUST NOT write `priority:*` labels to non-bug issues
- × MUST NOT skip Phase 5.5 echo or replace with truncation
- × MUST NOT commit ROADMAP.md from non-default branch (P32)
- × MUST NOT use `git add -A` for roadmap commit — explicit paths
- × MUST NOT post priority rationale as issue comments
- × MUST NOT use `question` tool to confirm priority choice — only to gather context

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
| Active ADV changes | `adv_change_list status: 'in-flight'` |
| Agenda | `adv_agenda_list`, `adv_agenda_complete`, `adv_agenda_cancel` |
| Wisdom | `adv_wisdom_list` |
| Local source scan | `glob`, `read`, `lgrep_search_text` |
| Bug priority loop | `gh issue edit --add-label` |
| Roadmap write | `write` (whole file, deterministic from project state) |
| Git ops | `bash` (`git status`, `git add ROADMAP.md`, `git commit`, `git pull --rebase`, `git push`) |
