# ADV ↔ Worktree Integration Strategy

> **HISTORICAL DOCUMENT — preserved for decision context only.**
> Implemented via `cullDeadCodeFixArchive` — references retired tools and
> `ProjectWorkflowState` are historical. `unifyworktreeunderadvmultisess`
> implemented the Option B direction with Temporal as state authority,
> per-change workflow worktree state, privacy-defensive peer sessions, and
> no standalone worktree SQLite store. Current agent-facing behavior lives in
> `ADV_INSTRUCTIONS.md § Worktree Integration`,
> `.opencode/command/adv-archive.md § Phase 9`, and
> `skills/adv-worktree/SKILL.md`.

**Date:** 2026-05-02
**Status:** Superseded historical proposal — Option B shipped with updated state
authority and merge semantics
**Origin:** Multi-hour pokeedge cleanup session surfaced four classes of friction that all trace back to weak coordination between ADV and the worktree plugin: (1) concurrent-session git thrashing, (2) stale HEAD on dead branches at session start, (3) Phase 9 archive merge conflicts when parallel sessions touched same files, (4) orphan branches/worktrees with no ADV record.

---

## 1. Inventory: what exists today

### 1.1 The worktree plugin (locally maintained fork)

**Location:** `~/.config/opencode/plugin/worktree.ts` + `~/.config/opencode/plugin/worktree/{state,terminal,in-use}.ts`

| Aspect                            | Detail                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LOC**                           | 2554 (worktree.ts 975, terminal.ts 1002, state.ts 525, in-use.ts 52)                                                                                                                                                                                                                                                                                                                               |
| **Origin**                        | Inspired by `opencode-worktree-session` by Felix Anhalt (MIT). "Rewritten for OCX" — header comment says so.                                                                                                                                                                                                                                                                                       |
| **Upstream remote**               | None (`git remote -v` shows only local `home` remote). Local fork has fully diverged.                                                                                                                                                                                                                                                                                                              |
| **Recent commits (last 90 days)** | `18983ca fix(worktree): cap pending delete retries`, `e85a6b9 fix(worktree): queue pending deletes`, `77c5236 feat(worktree): add inline mode toggle, pre-allow worktree paths`, `4573c89 fix(worktree): extract isWorktreeInUse to worktree/in-use.ts`, `8e44586 fix(worktree): guard session.deleted deletion with /proc/*/cwd in-use check`, plus 3 more — active maintenance, no upstream sync |
| **Tools exposed**                 | `worktree_create`, `worktree_delete`, `worktree_cleanup` (retry queued deletions)                                                                                                                                                                                                                                                                                                                  |
| **Loaded by**                     | Auto-discovery: opencode reads `~/.config/opencode/plugin/*.ts` (NOT in `opencode.json plugin[]` array). Distinct from the user-managed plugin list.                                                                                                                                                                                                                                               |
| **State DB**                      | `~/.local/share/opencode/plugins/worktree/{project-id}.sqlite` — separate from ADV's external state                                                                                                                                                                                                                                                                                                |
| **Dependency**                    | `kdco-primitives/` sibling module (project-id, log-warn, mutex, shell, temp, terminal-detect, types, with-timeout) — also locally maintained, not external                                                                                                                                                                                                                                         |
| **Schema**                        | `sessions`, `pending_operations`, `pending_deletes` tables — knows about Session/Branch/Path tuples but NOT about ADV change IDs or gates                                                                                                                                                                                                                                                          |

### 1.2 ADV's worktree integration

| Aspect                | Detail                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Where ADV cares**   | `ADV_INSTRUCTIONS.md § Worktree Integration`, `.opencode/command/adv-archive.md § Phase 9`, `plugin/src/tools/status.ts` worktree_census |
| **What ADV reads**    | `git worktree list --porcelain` directly + folder mtime — does NOT read worktree plugin's state DB                                       |
| **What ADV writes**   | Nothing on the worktree plugin side — invokes `worktree_create`/`worktree_delete` as black-box tools                                     |
| **Branch convention** | `change/{change-id}` — enforced by ADV instruction docs but not by the plugin                                                            |
| **Coupling**          | Tool-level only: ADV calls plugin tools via MCP. No shared state, no shared types, no shared lifecycle events                            |

### 1.3 The two-state problem

Worktree state and ADV state live in **separate SQLite DBs** with **no shared identifier**:

```
~/.local/share/opencode/plugins/
├── advance/{project-id}/         ← ADV state (changes, archive, agenda, tasks, gates)
│   └── db/spec.db
└── worktree/{project-id}.sqlite  ← worktree plugin state (sessions, pending_deletes)
```

Both use the same `project-id` (root commit SHA from `kdco-primitives/get-project-id` and ADV's `utils/project-id` — independent implementations that produce the same result). But neither side reads the other.

### 1.4 Pain points observed in the 2026-05-02 session

| Symptom                                                                                                   | Root cause                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Concurrent-session git reset wiped uncommitted .adv deletions                                             | Worktree plugin is unaware of ADV-mutating ops; ADV doesn't lock against parallel sessions                      |
| Pokeedge-web HEAD stuck on dead `hotfix/release-body-file` after PR #56 merged + branch deleted on remote | No detection: neither plugin nor ADV checks "is HEAD on a still-valid branch" at session start                  |
| `improveadvfromcompresearch` — branch + worktree existed, ADV record gone                                 | Worktree plugin tracked the session in its state DB; ADV had no record. Neither side reconciles                 |
| Phase 9 archive merge conflicts on parallel work to same files (boundParent vs my repairTemporal)         | No file-level overlap detection at /adv-prep time; conflicts only surface at archive                            |
| 12 stale `change/*` session-snapshot branches accumulated in advance repo                                 | `worktree_cleanup` retries delete, but doesn't garbage-collect orphan refs whose worktrees were already removed |

---

## 2. Strategic options

### Option A — Keep separate, deepen integration via events

Worktree plugin owns lifecycle (create/delete/spawn/terminal). ADV owns change semantics (gates, branch naming, merge protocol). The two communicate through:

- **Plugin emits events** that ADV can subscribe to: `worktree.created { path, branch }`, `worktree.deleted { path, branch }`, `worktree.session_idle { path }`
- **ADV reads plugin state** read-only at session start to build a unified view (`adv_status` joins worktree census with ADV change list)
- **ADV's Phase 9 cleanup** invokes plugin tools as today, plus emits `adv.change.archived` for the plugin to clear its session entry

**Pros:**

- Plugin remains generally useful (anyone using OpenCode + git can use it without ADV)
- Separation of concerns keeps each codebase focused
- Existing tool-level contract is stable

**Cons:**

- Two state stores remain — drift risk persists
- Event schema must stay aligned across two repos
- Plugin maintenance burden continues (current pace: ~5 commits/month)
- ADV gains a hard dependency on plugin event API

**Effort:** ~1–2 weeks of design + implementation across both codebases.

### Option B — Absorb the worktree plugin into ADV

Move plugin code into ADV's plugin source tree. Drop `kdco-primitives` dependency in favor of ADV's existing utilities. Merge state DBs (worktree state becomes a table in ADV's spec.db OR a column on `change_summaries`). Tools rename to `adv_worktree_*` (or stay as-is if backward compat matters).

**Pros:**

- Single source of truth for change + worktree state
- One project-id resolution, one SQLite DB, one config
- ADV can enforce branch convention at create time (rejects non-`change/*` names by default; opt-in for free-form)
- Phase 9 logic can directly inspect plugin internals — no tool round-trips
- Unifies the maintenance burden into a single repo

**Cons:**

- Plugin loses generality — no longer useful outside ADV-managed projects
- Migration path needed for existing `~/.local/share/opencode/plugins/worktree/{project-id}.sqlite` data (not much loss; mostly ephemeral session refs)
- ADV's plugin grows by ~2500 LOC + tests
- The `worktree_create`/`worktree_delete` tool names users have learned would change (or need aliasing)
- Locks in ADV as the only coordinator — non-ADV agents using OpenCode lose worktree tools

**Effort:** ~2–3 weeks of focused work. Mostly relocation + dependency unwinding + state migration script + test consolidation.

### Option C — Extract a shared core, both consume it

Pull common primitives (project-id, shell helpers, in-use detection, mutex, terminal-detect) into a separate `kdco-primitives` (or rename) package. Both ADV and the worktree plugin import it. Each owns its own domain logic.

**Pros:**

- Cleanest separation; testable common layer
- Reusable across all your plugins (advance, worktree, claude-max, morph-fast-apply, vision)
- DRYs up duplicated project-id resolution (we have at least 2 implementations)

**Cons:**

- Most engineering work — builds + publishes a new package
- Adds a dependency tier; releases must coordinate
- Doesn't fix the two-state problem on its own (would need Option A on top)

**Effort:** ~3–4 weeks. Higher upfront, lower ongoing.

### Option D — Thin plugin, ADV owns logic

Keep the plugin file as a registration shim — actual logic lives in ADV. Plugin's role becomes: "expose `worktree_*` tools that delegate to `adv_worktree_*`". When invoked outside an ADV-managed project, tools fall back to a minimal local impl.

**Pros:**

- Backward-compat preserved (tool names unchanged)
- ADV is the source of truth
- Migration is gradual

**Cons:**

- Effectively Option B with extra complexity (the shim layer)
- Plugin still requires maintenance for the fallback path

**Effort:** ~2 weeks but with more moving parts than B.

---

## 3. Recommendation

**Option B (absorb under ADV) — sequential, with a 2-phase migration.**

Reasoning:

1. **The worktree plugin is already ADV-shaped.** Its primary value is per-change isolation; that's an ADV concept. Generic users without ADV gain less from it than ADV users.
2. **Local fork is fully diverged.** No upstream sync benefit to preserve. Recent commits all reflect ADV-driven needs (in-use detection during ADV cleanup; pending-delete retry caps for ADV's archive flow; inline mode toggle for ADV's inline worktree protocol).
3. **Two state stores will keep drifting.** Option A's event bridge is fragile; we hit drift in this very session.
4. **ADV already has the heavier infrastructure** — Temporal workflows, gates, change lifecycle, durable task-run ledger. Worktree state is a natural subordinate.
5. **The integration we keep wanting** (rebase before /adv-apply, file-overlap detection at /adv-prep, stale-HEAD detection at session start) all require ADV to know worktree state intimately. Option B makes that direct.

### Migration plan

**Phase 1 — Relocate & test (1–2 weeks):**

1. Copy `~/.config/opencode/plugin/worktree.ts` + `worktree/` into `plugin/src/tools/worktree/` in advance repo
2. Replace `kdco-primitives/get-project-id` with ADV's `utils/project-id`
3. Replace `kdco-primitives/with-timeout` etc. with equivalents already in ADV (or copy them under `utils/`)
4. Adapt state schema: drop separate SQLite DB; record session/pending-delete state in ADV's external state directory (could be a JSONL append-only log under `worktrees.jsonl` next to `agenda.jsonl`)
5. Register `worktree_create`, `worktree_delete`, `worktree_cleanup` via `tool-registry.ts` (keep the same names for backward compat; add new `adv_worktree_*` aliases later if desired)
6. Port worktree plugin's existing tests (`tests/worktree/*.test.ts`) into `plugin/src/tools/worktree/*.test.ts`
7. Stop loading the standalone plugin (rename to `~/.config/opencode/plugin/worktree.ts.disabled` after verification)

**Phase 2 — ADV-aware enhancements (1 week):**

1. `worktree_create` enforces `change/{change-id}` naming when invoked from ADV context (free-form OK from non-ADV)
2. Branch creation auto-records change-id ↔ worktree-path mapping in ADV state
3. `worktree_delete` checks ADV gate status before allowing delete (refuses if release gate not done UNLESS `force: true`)
4. `adv_status` worktree section pulls from internal state (no longer shells `git worktree list`)
5. New `adv_worktree_triage` tool: enumerates orphan worktrees (branch with no ADV change, change archived but worktree not deleted, etc.) with recommended actions
6. New session-init hook detects stale HEAD on dead branch (the pokeedge-web case) and emits `[ADV:WARN]`

---

## 4. Vertically integrated branch & merge strategy

The strategic goal: **support N concurrent ADV changes on the same project without collision, with predictable merge order and zero git surprises.**

### 4.1 Branch hierarchy

```
trunk (default)
├── change/<id-1>     (per-change worktree, owned by one ADV change)
├── change/<id-2>
├── change/<id-3>
└── (optionally) release/<version>   (collects related changes for a coordinated ship)
```

Constraints:

- One worktree per change. Branch name = `change/<change-id>` literal (not normalized).
- A change worktree is created at /adv-discover or /adv-prep (whichever first mutates) and lives until /adv-archive Phase 9 deletes it.
- `release/<version>` branches are explicit — only when a ship needs to bundle multiple changes. Out of scope for v1.

### 4.2 Concurrent-change coordination protocol

**At /adv-prep — mandatory file-overlap scan (NEW):**

1. ADV reads `touched_files` metadata from every active change's tasks
2. Computes pairwise overlap with the prepping change's planned scope (from agreement + design)
3. If overlap detected:
   - **Same file in 2 prepped changes**: surface as user-value tradeoff → user decides which proceeds first
    - **Same file in 1 prepped + 1 in-execution**: prepping change waits, or routes through PR (no local merge)
    - **Same subsystem (heuristic: same directory)**: warn but proceed
 4. Decision recorded in change's design.md as a Key Decision

**At /adv-apply — pre-execution rebase check (NEW):**

1. ADV runs `git -C <worktree> rebase --interactive --autosquash origin/trunk` (or autosquash off, just rebase)
2. If clean → proceed
3. If conflicts → STOP, surface conflicting files, ask user (route to PR vs manual resolve vs cancel)

**At /adv-archive Phase 9 — keep current logic with one addition:**

1. The existing `Step 4.5: Choose Integration Path` is sound (LOCAL_FINISH fast / reconcile / PR)
2. ADD: `Step 4.4.5 — Skip-duplicate detection`. If a commit on the change branch has identical tree to a commit already on trunk (different SHA, same content), `git rebase --skip` it automatically. This was the manual fix during this session's repairTemporal rebase.

### 4.3 Merge order & priority

When multiple changes are ready to merge simultaneously:

1. **Trivial merges first** — single-file changes with no deps merge before multi-file
2. **Same-subsystem changes serialize** — automatic queue based on directory overlap
3. **Cross-subsystem changes parallelize** — merge in any order
4. **Manual override** — user can promote any change to head of queue

``/adv-archive` Phase 9 auto-computes merge order via `computeMergeOrder`; `/adv-status` Cross-Change Health section surfaces the queue for visibility.

### 4.4 Branch deletion policy

Branch is deleted (locally + remote) when:

1. Change is archived (gates 7/7) AND
2. Branch is fully merged to trunk AND
3. Worktree has no uncommitted work

Three-condition AND prevents the orphan classes we hit:

- "Archived but worktree alive" (showtranslationpanelprice case): condition 3 catches this
- "Branch merged via PR + remote-deleted but local survived" (hotfix case): triggered by remote-deleted check at session start
- "Branch lives but ADV record gone" (improveadvfromcompresearch case): condition 1 catches this; refuses delete until user resolves

### 4.5 Stale HEAD detection at session start

New plugin-init hook:

```ts
async function detectStaleHead(
  repoRoot: string,
): Promise<StaleHeadReport | null> {
  const head = await execGit("symbolic-ref", "--short", "HEAD");
  if (!head) return null; // detached HEAD, OK
  if (head === defaultBranch) return null;

  const remoteExists =
    (await execGit("ls-remote", "--heads", "origin", head)).trim().length > 0;
  const mergedToDefault = (
    await execGit("branch", "--merged", `origin/${defaultBranch}`)
  )
    .split("\n")
    .map((l) => l.trim().replace(/^\* /, ""))
    .includes(head);

  if (!remoteExists && mergedToDefault) {
    return {
      branch: head,
      reason: "merged-and-remote-deleted",
      suggestion: `Branch ${head} was merged + remote-deleted (likely PR landed). Switch to ${defaultBranch} and delete the local branch.`,
    };
  }

  // Other patterns: branch with ADV change record still active = OK
  // Branch with no ADV change record = orphan
  const advChangeId = head.startsWith("change/") ? head.slice(7) : null;
  if (advChangeId) {
    const change = await advChangeShow({ changeId: advChangeId });
    if (!change || change.status === "archived" || change.status === "closed") {
      return {
        branch: head,
        reason: "adv-change-archived-or-missing",
        suggestion: `Switch to ${defaultBranch}.`,
      };
    }
  }

  return null;
}
```

Emit `[ADV:WARN]` with the report and the recommended fix command.

### 4.6 Cross-session coordination (the concurrent-thrashing fix)

Promote from informational warning to **soft lock**:

1. `worktree_create` claims a per-project flock at `<adv-state>/locks/worktree.lock`
2. `worktree_delete` claims same lock
3. Phase 9 archive merge claims same lock for the duration of merge + push
4. Lock has a 30s timeout; if held by another live process (PID alive check), wait OR escalate
5. `adv_status` reports lock state

This is advisory — git still works without it — but ADV's own ops won't step on each other.

---

## 5. Concrete recommendations summary

| Action                                               | Why                                                           | Effort    | Outcome                                          |
| ---------------------------------------------------- | ------------------------------------------------------------- | --------- | ------------------------------------------------ |
| **Adopt Option B** — absorb worktree plugin into ADV | Removes two-state drift; enables direct lifecycle integration | 2–3 weeks | One source of truth; ADV-aware worktree behavior |
| **Add file-overlap scan at /adv-prep**               | Catches conflicts before they cost merge time                 | 1–2 days  | Concurrent changes coordinate up-front           |
| **Add pre-execution rebase at /adv-apply**           | Surfaces drift early when trunk has moved                     | 1 day     | No surprise conflicts at archive                 |
| **Add Phase 9 skip-duplicate detection**             | Auto-resolve known-equivalent commits                         | 0.5 day   | Reduces manual rebase intervention               |
| **Stale-HEAD detection at session start**            | Solves "opencode opened to dead hotfix branch"                | 1 day     | Direct fix for user complaint                    |
| **Soft-lock for ADV-mutating ops**                   | Concurrent sessions stop wiping each other's work             | 1–2 days  | Concrete fix for git thrashing observed          |
| **`adv_worktree_triage` tool**                       | Detect + clean orphan worktrees                               | 1 day     | Hands the user a single command for cleanup      |

Total: ~3–4 weeks of focused work for a fully integrated branch + merge story.

---

## 6. What this proposal is NOT

- **Not a rewrite from scratch.** The worktree plugin code is solid; we're relocating, not redesigning.
- **Not removing the plugin from outside-ADV use.** Phase 1 keeps tool names; outside-ADV use degrades gracefully.
- **Not a new gate.** Existing 7-gate model is unchanged. We add coordination at /adv-prep and /adv-apply only.
- **Not enforcing serialization on parallel changes.** Cross-subsystem changes still run in parallel. Only same-file/same-subsystem coordinate.
- **Not a multi-machine solution.** Single workstation only for now.

---

## 7. Recommended next move

Open ADV change `unifyWorktreeUnderAdv` (or similar name) with this doc as the agreement basis. Sequence:

1. **Discovery gate:** validate Option B is the right call (or pivot to A/C/D)
2. **Design gate:** detailed migration plan with state-DB merge approach + tool-naming decision (keep `worktree_*` or move to `adv_worktree_*`)
3. **Planning gate:** ~12–15 tasks covering Phase 1 relocate + Phase 2 ADV-aware enhancements + branch/merge strategy implementations
4. **Execution gate:** TDD per task, full regression coverage
5. **Acceptance:** real-world test with 3 concurrent changes on a sample project
6. **Release:** ship as a single coordinated release

Estimated scope: ~30 tasks across 2–3 weeks. Sized similar to `repairTemporalMigrationDebt` we just shipped.

---

_Generated 2026-05-02. Authored after the multi-hour pokeedge cleanup session and the worktree-instruction audit (`docs/worktree-instruction-audit.md`)._
