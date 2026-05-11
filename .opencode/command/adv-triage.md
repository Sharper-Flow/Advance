---
name: adv-triage
description: Triage all backlog sources, score features with WSJF, regenerate ROADMAP.md
---
<!-- manifest: adv-triage · requiresChangeId: false -->
# ADV Triage — Backlog Reconciliation, WSJF Scoring, Roadmap Regen

Reconcile backlog sources into GH Issues, score features with WSJF, regenerate `ROADMAP.md`. Roadmap issue flow uses GH Projects v2 (typed NUMBER fields) as truth. ROADMAP.md = generated mirror, committed and pushed at end. Hybrid HITL: agent fills RROE/TimeCriticality/Effort autonomously; pauses for user-only bug Priority + feature Value.

> **CHECKLIST**: Default execute. `--dry-run` previews without mutations. Tier B inline approval required before opening issues, before writing/pushing ROADMAP.md, before deprecating local sources — gates run in execute mode regardless of invocation. Bug priority via `priority:{critical,high,medium,low}` labels; features via Projects v2 number fields. WSJF = `(Value + TimeCriticality + RROE) / Effort`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-triage")` → bootstrap rules, source enumeration, match algorithm, prompt templates, scoring rubrics, ROADMAP layout, commit sequence, echo format, report template, anti-patterns. If unavailable, continue with embedded protocol.

## Parse Flags

- `--dry-run` — preview only; skip GH/file/git mutations + Tier B prompts
- `--no-commit` — write ROADMAP.md but skip commit/push (ignored when `--dry-run`)
- `--source <name>` — limit Phase 2 scan: `gh`/`agenda`/`wisdom`/`notes`/`changes`/`todos`
- `--rescore` — recompute WSJF for all features (else only fill missing)

Reject unknown flags: single-line error + valid list.

---

## Phase 1: Preflight

| # | Check | Failure |
|---|-------|---------|
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

If `unrepresented[]` empty AND represented have required fields → skip to Phase 7 ("No new issues, no field gaps.").

---

## Phase 4: User Assignments (Tier B, batched)

### 4a. Confirm new issues

When `unrepresented[]` non-empty: emit Tier B inline approval (skill § Phase 3a). On approval: `gh issue create`, add to project, set `ADV Type`. Triage-origin tagging (rq-issueChangeLinkage01): subsequent `/adv-proposal` for promoted issue MUST pass `origin_kind: 'triage'`, `origin_source_artifact`, `origin_issue_number`.

### 4b. Field assignments

Build matrix (bug priority labels, feature Value). If non-empty: `question` tool — **never plain-text chat**. Stage 1 batch control → Stage 2 per-item loop (bugs first, features after). Apply via `gh issue edit --add-label` or `gh api graphql`. GraphQL budget gate before writes. See skill § Phase 3b.

---

## Phase 5: Agent Scoring (autonomous)

For features with `Value` set but missing `TimeCriticality`/`RROE`/`Effort` (or all when `--rescore`): assign `[1,13]` per modified-Fibonacci rubric. `WSJF = (Value + TimeCriticality + RROE) / Effort` rounded 1 decimal. Batched 4-field GraphQL mutation. Sequential paced writes (1s sleep, `x-ratelimit-remaining` check). Idempotent resume from cached `project_items`. Evidence trailer mandatory. See skill § Phase 4.

Bugs: NO numeric fields. `priority:*` labels only.

---

## Phase 6: Generate ROADMAP.md

Fresh `gh project item-list` read (do NOT reuse Phase 2/5 caches). Apply `repository_filter` server-side scoping (rq-repoFilter01). Emit BOTH `ROADMAP.md` (repo root) AND `.adv/roadmap-snapshot.json` (programmatic mirror). Sort features WSJF desc (ties: Value desc, issue # asc); bugs by priority tier. Local source deprecation Tier B prompt. ROADMAP commit Tier B prompt. `commit and push` runs on default branch only (P32). See skill § Phase 5.

---

## Phase 6.5: Roadmap Echo (mandatory)

After ROADMAP.md written: agent MUST emit full content as fenced markdown in chat. NOT optional. NOT replaceable by pointer or top-N truncation. See skill § Phase 5.5.

---

## Phase 7: Final Report

Emit structured report: sources scanned, issues created/updated/autofilled/deferred/skipped, roadmap counts, local sources deprecated, file written, API budget. See skill § Phase 6. If `--dry-run`: append `Re-run without --dry-run to apply mutations.`

---

## Constraints

- × MUST NOT auto-create GH issues without Tier B approval
- × MUST NOT assign Value autonomously — user-only
- × MUST NOT write WSJF/TC/RROE/Effort for bugs — `priority:*` only
- × MUST NOT skip Phase 6.5 echo or replace with truncation
- × MUST NOT commit ROADMAP.md from non-default branch (P32)
- × MUST NOT use `git add -A` for roadmap commit — explicit paths
- × MUST NOT use plain-text chat for Phase 4b — `question` tool required
- × MUST NOT autofill bug `priority:*` — user-only

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
| Edit project field (batch 4) | `gh api graphql --include -f query='mutation { tc: ... rroe: ... effort: ... wsjf: ... }'` |
| GraphQL budget | `gh api graphql -f query='{ rateLimit { remaining resetAt } }'` + `x-ratelimit-remaining` header |
| Project metadata | `adv_project_metadata` (read/write `github_project`) |
| Active ADV changes | `adv_change_list status: 'in-flight'` |
| Agenda | `adv_agenda_list`, `adv_agenda_complete` |
| Wisdom | `adv_wisdom_list` |
| Local source scan | `glob`, `read`, `lgrep_search_text` |
| Phase 4b assignments | `question` tool (batch control + per-item) |
| Roadmap write | `write` (whole file, deterministic from project state) |
| Git ops | `bash` (`git status`, `git add ROADMAP.md`, `git commit`, `git pull --rebase`, `git push`) |
