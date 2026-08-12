---
name: adv-cleanup
description: Triage stale changes, drifted worktrees, merged branches, and state leaks; delete approved candidates
---
# ADV Cleanup — Hygiene Triage

Dry-run by default: scan all four ADV hygiene surfaces, bucket candidates, report actions. `--execute` applies only after per-bucket approval. Runs inline; no sub-agents.

> **CHECKLIST**: Default dry-run. Reversible closures require Tier B per-bucket approval (`rq-inlineApproval01.4`). Irreversible buckets require count-matched typed confirmation and reject `approve all` (`rq-cleanupHygieneScope01`). Deletion always delegates to the shared `adv_worktree_delete` planner/executor or `adv_worktree_cleanup` drain (`rq-terminalCleanupSafety01`). Never auto-archive; recommend `/adv-archive {id}` to preserve per-change Tier B sign-off (`rq-inlineApproval01.3`).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-cleanup")` → bucket rules, staleness heuristics, duplicate checks, approval parser, bulk-close procedure. If unavailable, use fallback below.

Fallback: use phases in this file; apply bucket precedence exactly; never mutate before strict approval.

## Parse Flags

- `--execute` — apply approved bucket actions; default dry-run.
- `--bucket <name>` — one bucket: `duplicate` / `stuck` / `abandoned` / `ready-to-archive`.
- `--age-threshold <duration>` — default `7d`; accepts `7d`, `48h`, `60m`, `7d 12h`.

Validate bucket and duration before scan; reject malformed values with example.

---

## Phase 1: Scan

Four discovery calls, one per hygiene surface. Record scanned counts per surface.

1. **Active changes** — `adv_change_list({ sort: "stalest", excludeRecencyBands: ["hot"] })`. Record scanned count + hot-excluded count.
2. **Worktree drift** — `adv_worktree_triage`.
3. **Merged archived branches** — `adv_worktree_cleanup({ mode: "archived_branches", dryRun: true })`. Discovery only; `dryRun: true` is mandatory in this phase.
4. **State leaks** — `adv_status({ view: "hygiene" })`.

> **DESTRUCTIVE DEFAULT WARNING:** Omitting `dryRun: true` here **DELETES branches instead of listing them**; `adv_worktree_cleanup` has no safe default. Use the discovery call exactly as written. The apply form belongs only in Phase 5 after typed confirmation.

A failing surface degrades that section only; report it as `unavailable: {reason}` and continue with the rest.

If all four surfaces return zero candidates → `No cleanup candidates. All hygiene surfaces are clean.` → stop.

If surface 1 returns 0 active changes, still run surfaces 2–4 — worktree, branch, and leak debt outlive their changes.

---

## Phase 2: Categorize

Use skill bucket precedence; most-specific wins:

1. **Duplicate** — normalized title match or conservative ID suffix match → explicit per-candidate `adv_change_close reason: superseded`.
2. **Stuck at proposal** — proposal pending, no tasks, stale → filter close `reason: not_planned`.
3. **Abandoned mid-flight** — proposal done, pending/in-progress tasks, stale, no recent gate → filter close `reason: cancelled`.
4. **Ready to archive** — all gates except release done, all tasks done, no unresolved review findings → recommend `/adv-archive {id}`.
5. **Healthy** — skip.

Inspect cheaply: duplicate pass over active+archived list; if hot/non-stale and not duplicate → Healthy; otherwise one `adv_change_show` per stale change. Before closure buckets, check unarchived `fast_follow_of` children; move matches to blocked sub-bucket. If `--bucket`, retain only that bucket.

This precedence orders **changes only**. Worktree, branch, and leak candidates are different entity kinds and are classified independently — a change and its worktree may legitimately appear in two sections at once. State the relationship; never suppress either.

---

## Phase 2.5: Hygiene Surfaces

Four surfaces, two reversibility classes (`rq-cleanupHygieneScope01`):

| # | Surface | Discovery | Class | Executable |
|---|---|---|---|---|
| 1 | Active-change debt | `adv_change_list` + `adv_change_show` | reversible | yes |
| 2 | Worktree drift | `adv_worktree_triage` | **irreversible** | yes |
| 3 | Merged archived `change/*` branches | `adv_worktree_cleanup mode: "archived_branches"` | **irreversible** | yes |
| 4 | Archived/closed state leaks | `adv_status view: "hygiene"` | report-only | no |

Surface 4 stays report-only: leak remediation routes to the operator command `bin/adv doctor --purge-archive`, which owns its own approval contract. Cleanup surfaces the leak and names the command; it never purges.

### Surface 2 — worktree drift groups

Classify each worktree into one of four drift groups:

| Group | Meaning |
|---|---|
| **safe** | No active sessions, not the current process CWD, eligible for cleanup |
| **blocked** | Has active sessions or is the current process CWD; skip deletion |
| **dirty/in-use** | Uncommitted changes or running processes detected; defer to user |
| **needs-investigation** | Classification ambiguous (missing registry entry, stale head, etc.) |

The `adv_worktree_triage` classes map to these groups as follows:

| `adv_worktree_triage` class | Drift group | Deletion eligible |
|---|---|---|
| `stale_head` | needs-investigation | no — classification ambiguous |
| `dirty_uncommitted_work` | dirty/in-use | **no** — force-deleting discards staged/modified/untracked work |
| `terminal_cleanup_retained` | blocked | no — cleanup already attempted and blocked; resolve the blocker first |

Any unrecognized or new `adv_worktree_triage` class MUST default to `needs-investigation` and is never eligible for deletion (fail-closed for unknown input).

Required snippet:

- Worktree drift → `Worktree drift: {safe} safe, {blocked} blocked, {dirty/in-use} dirty/in-use, {needs-investigation} needs-investigation.`

### Deletion authority

`adv_worktree_triage` output is advisory discovery and selection data — **never deletion authority** (`rq-terminalCleanupSafety01`). Every approved deletion first calls `adv_worktree_delete dryRun:true` for the exact branch and records its returned `planToken`; apply must pass that token plus nonblank `approvalEvidence`. A legacy branch-only apply returns deterministic `PLAN_REQUIRED` and performs no shell or write. `adv_worktree_delete` / `adv_worktree_cleanup` independently re-verify terminal owning-change status, branch integration, clean worktree state, no live process CWD, and squash-merge-safe tree-SHA equivalence. Their refusals are final: surface each refusal verbatim, never retry around it.

---

## Phase 3: Present Findings

Emit grouped inline report; skip Healthy. Include mode, per-surface scanned counts, hot excluded, age threshold, bucket counts, reasons, total candidates, and filtered bucket note when applicable.

Every candidate bucket carries an explicit **reversible** or **irreversible** marker. Irreversible buckets state their recovery path inline so the cost is visible before approval, not after.

| Bucket | Marker | Recovery |
|---|---|---|
| Duplicate / Stuck / Abandoned | reversible | Re-open the change; full history retained |
| Worktree deletion | irreversible | `git worktree add {path} {branch}` — branch and commits survive |
| Branch deletion | irreversible | `git reflog` → `git branch {name} {sha}` — **time-bounded ~30–90d** (`gc.reflogExpireUnreachable` 30d, `gc.reflogExpire` 90d) |

A surface with no candidates renders an explicit empty state rather than being omitted — silence is indistinguishable from a failed scan.

Required snippets:

- Ready → `→ Run /adv-archive {id} to ship.`
- Active-change empty state → `Active-change debt: none.`
- Worktree empty state → `Worktree drift: none.`
- Branch empty state → `Merged archived branches: none.`
- Leak empty state → `State leaks: none.`
- Leak present → `→ Operator runs bin/adv doctor --purge-archive for {id} (operator-only; owns its own approval).`
- Dry-run → `Re-run with --execute to apply per-bucket actions (reversible buckets need Tier B approval; irreversible buckets need typed confirmation).`
- Empty → `No cleanup candidates. All hygiene surfaces are clean.`

If `--execute`, continue to Phase 4 for Duplicate, Stuck, Abandoned (reversible) and Phase 4b for safe worktrees and merged branches (irreversible). Skip Ready-to-archive, Blocked, and state leaks.

---

## Phase 4: Reversible Bucket Approval (`--execute` only — Tier B inline)

For each non-empty closure bucket, emit separate Tier B inline prompt (cancellation approval, `rq-autonomy01` checkpoint #7, `rq-inlineApproval01.4`).

Prompt MUST include numbered candidates with reason and anchor phrase:

`Reply EXACTLY one of:`

Allowed replies (trimmed, case-insensitive regex; no LLM fallback):

| Pattern | Action |
|---|---|
| `^approve all$` | close all listed |
| `^reject all$` | skip bucket |
| `^keep ([\d,\s]+)$` | close inverse |
| `^cancel ([\d,\s]+)$` | close listed |
| `^(stop\|abort)$` | halt cleanup; close nothing else |

Anything else → re-prompt same options. **× Do NOT** invoke LLM fallback. **× Do NOT** advance.

---

## Phase 4b: Irreversible Bucket Approval (`--execute` only — typed confirmation)

Worktree deletion and branch deletion are irreversible. They use a **distinct, stronger prompt** than Phase 4 (`rq-cleanupHygieneScope01`). The two prompts never merge and the reversible parser is never weakened to accommodate this one.

Prompt MUST list every candidate numbered with its **exact worktree path or branch name** — never a count-only summary, never an abbreviated path. The user cannot consent to something they cannot see.

Prompt MUST state the irreversible marker and the recovery path, including the reflog time bound for branch deletion.

Allowed replies (trimmed, case-insensitive regex; no LLM fallback):

| Pattern | Action |
|---|---|
| `^delete all (\d+)$` | delete all listed — **only if `\d+` equals the exact listed candidate count** |
| `^delete ([\d,\s]+)$` | delete only the listed numbers |
| `^skip$` | skip bucket; delete nothing |
| `^(stop\|abort)$` | halt cleanup; delete nothing else |

`approve all` is **rejected** in this phase → re-prompt. It is the reversible-bucket token and MUST NOT carry destructive authority.

Count mismatch on `delete all N` → **re-prompt** with the same options and the correct count. Never infer intent from a near-miss.

Anything else → re-prompt same options. **× Do NOT** invoke LLM fallback. **× Do NOT** advance.

> Rationale: the count-match is the `terraform destroy` property — the confirmation cannot be produced from muscle memory, because the user must read the report to type it.

---

## Phase 5: Apply

### Reversible buckets

For each approved candidate, call `adv_change_close` with `approvedByUser: true`, `approvalEvidence`, the candidate `changeId`, reason, and `supersededBy` for Duplicate. For duplicate buckets, inspect each superseding target with `adv_change_show` before closing.

Before Duplicate apply, `adv_change_show` each `supersededBy` target. Missing target → skip only those candidates and report `skipped: missing supersededBy target`.

### Irreversible buckets

Worktree deletion → apply the exact returned `planToken` with `adv_worktree_delete` per approved branch and the count-matched `approvalEvidence`. Branch deletion → `adv_worktree_cleanup({ mode: "archived_branches", changeId: <approved candidate change ID>, approvalEvidence: <count-matched approval> })` without `dryRun`, once per approved candidate. Never issue an unscoped merged-branch cleanup apply: it would delete every currently eligible branch and bypass a subset approval.

Deletion authority belongs to those tools alone (`rq-terminalCleanupSafety01`). Never call `git worktree remove` or `git branch -d` directly. When a tool refuses, report the refusal verbatim and move on — a refusal is evidence the candidate was misclassified, not an obstacle to route around.

### Result lines

Each bucket atomic. Continue to the next bucket after a failure.

- Reversible success: `✓ {Bucket name}: closed {N} change(s) — {reason}`
- Irreversible success: `✓ {Bucket name}: deleted {N} of {M} — {name}@{sha}`
- Refusal: `⊘ {Bucket name}: {name} refused by {tool} — {verbatim refusal}`
- Failure: `✗ {Bucket name}: failed — {error message}. No changes applied in this bucket.`

Record each deleted branch SHA in the result line so the documented reflog recovery path is actually executable.

---

## Final Report

Emit closing summary. Use Gate Handoff Voice spine but omit gate footer; cleanup owns no gate.

---

## Coexistence

| Command | Relationship |
|---|---|
| `/adv-status` | Read-only overview; cleanup is actionable counterpart |
| `/adv-refactor` | Refreshes stale proposal content; cleanup closes abandoned/dead proposals |
| `/adv-archive` | Cleanup recommends only; archive owns Tier B sign-off |
| `bin/adv doctor --purge-archive` | Cleanup reports state leaks only; purge owns its own operator approval |

## Key Tools

| Purpose | Tool |
|---|---|
| Scan active changes | `adv_change_list` |
| Inspect gates/tasks | `adv_change_show` |
| Close approved candidates | `adv_change_close` in a loop |
| Discover worktree drift | `adv_worktree_triage` |
| DISCOVERY — merged archived branches (Phase 1; `dryRun: true`) | `adv_worktree_cleanup` (`mode: "archived_branches"`, `dryRun: true`) |
| Discover state leaks | `adv_status` (`view: "hygiene"`) |
| Delete a worktree | `adv_worktree_delete` |
| APPLY — delete merged archived branches (Phase 5 only, after typed confirmation) | `adv_worktree_cleanup` (`mode: "archived_branches"`) |
| RECOVERY — a prior cleanup timed out during discovery | `adv_worktree_cleanup` (`skipDiscovery: true`) — drains already-queued pending deletes without repeating the discovery scan. Worktrees mode only; ignored in `archived_branches`. Drains only entries a prior discovery already validated, so it grants no new deletion authority (`rq-terminalCleanupSafety01`). |
