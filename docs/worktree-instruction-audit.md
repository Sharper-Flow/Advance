# ADV Worktree Instruction Audit

> **HISTORICAL DOCUMENT — preserved for decision context.**
> Implemented via `cullDeadCodeFixArchive` — references retired tools and
> `ProjectWorkflowState` are historical. Current behavior lives in
> `ADV_INSTRUCTIONS.md § Worktree Integration` and `skills/adv-worktree/SKILL.md`.
>
> **[CORRECTED 2026-05]** P1 (sidecar JSONL state) and P5 (soft-lock for
> ADV-mutating ops) mitigations are SUPERSEDED by the
> `unifyworktreeunderadvmultisess` change. Per-change workflow worktree state
> via Temporal search attributes is now the state authority; soft-locks for
> ADV-mutating ops are explicitly forbidden. Original diagnoses below are
> preserved as historical context.

**Date:** 2026-05-02
**Origin:** User directive after concrete worktree-related friction surfaced during multi-hour cleanup session (concurrent-session thrashing, stale HEAD on dead hotfix branch, orphan branches without ADV records, rebase conflicts during Phase 9 archive merge).

## TL;DR — top 5 changes proposed

1. **Add explicit "stale worktree triage" protocol** — agents should detect+resolve worktrees whose ADV record is gone, branches whose remote is deleted (PR merged), and worktrees on dead branches at session start.
2. **Strengthen concurrent-session coordination** — current "WARN" is insufficient; agents need a "pause git operations until peer count drops to 1" rule when other sessions hold the same project CWD.
3. **Reconcile two parallel doc surfaces** — `ADV_INSTRUCTIONS.md § Worktree Integration` and `~/.config/opencode/instructions/worktree-guide.md` have **contradictory framings** (always vs. when-needed). One needs to delegate to the other.
4. **Document Phase 9 conflict-recovery branches explicitly** — current rebase reconcile path assumes clean rebase; documented behavior on multi-conflict rebase is unclear.
5. **Populate or delete empty `skills/worktree/SKILL.md`** in this repo (global one exists and is correct; repo-local stub is empty bytes).

---

## Sources audited

| Source | Audience | Status |
|---|---|---|
| `ADV_INSTRUCTIONS.md § Worktree Integration` | ADV agents | Canonical for ADV |
| `ADV_INSTRUCTIONS.md § Concurrent Session Hazard` | All agents | Added 2026-05-02 (F6) — warning only |
| `~/.config/opencode/instructions/worktree-guide.md` | All agents (global) | Canonical for tool-level usage |
| `~/.config/opencode/skills/worktree/SKILL.md` | All agents (skill load) | Mirrors guide; correct |
| `skills/worktree/SKILL.md` | This repo | **EMPTY (0 bytes)** — broken stub |
| `.opencode/command/adv-archive.md § Phase 9` | `/adv-archive` execution | Detailed merge protocol |
| `.opencode/worktree.jsonc` | worktree-plugin config | Sync rules + inline mode |
| `AGENTS.md` | Repo developers | Brief mention of state location + census |
| `plugin/src/tools/status.ts` | Code | Emits `worktree_census` with stale detection (>7d) |

---

## Findings

### Severity classification

| Sev | Meaning |
|---|---|
| P0 | Active behavior that produced corruption / lost work in the audited session |
| P1 | Friction or contradiction agents will hit predictably |
| P2 | Documentation gap or inconsistency |
| P3 | Polish / clarity improvement |

---

### F1 — Contradictory framings between ADV_INSTRUCTIONS and worktree-guide (P1)

`ADV_INSTRUCTIONS.md`:
> ADV always isolates mutating work in per-change worktrees. **There are no exemptions or conditional skip paths.**

`~/.config/opencode/instructions/worktree-guide.md`:
> Use `worktree_create` when: Risky refactors / Parallel experiments / Feature branches / Exploratory work
> When NOT to Create a Worktree: Small, contained changes (bug fixes, config tweaks, single-file edits)

These contradict for ADV agents. The ADV-specific protocol says always; the generic guide says case-by-case. Agents reading both come away with two different rules.

**Improvement:** worktree-guide.md should explicitly carve out: "ADV agents follow `ADV_INSTRUCTIONS.md § Worktree Integration` (always isolate). The guidance below is for **non-ADV agents** (build, plan, general)." Or merge the two with a unified per-mode matrix.

### F2 — Empty skills/worktree/SKILL.md in this repo (P2)

`/home/jrede/dev/oc-plugins/advance/skills/worktree/SKILL.md` — 0 bytes. The directory exists but the SKILL file is empty.

Effect: when an agent does skill discovery via filesystem scan, this repo's skills/worktree appears with no `name`, `description`, or `keywords` frontmatter. Skill discovery protocol says: "Skip skills without frontmatter/keywords." So it's silently ignored — but the directory presence is misleading.

**Improvement:** either populate it (mirror or extend the global skill) OR delete the directory. Probably populate, since this is the reference repo for ADV.

### F3 — No stale-worktree triage protocol (P0)

This session uncovered three classes of stale worktrees:

1. **Worktree on a branch whose remote was deleted after PR merge** (`hotfix/release-body-file` in pokeedge-web). User reported "opencode immediately went to a hotfix branch" because HEAD pointed at a now-dead branch. opencode just opened to whatever HEAD was.
2. **Worktree on a branch with no ADV record** (`improveadvfromcompresearch`). 10 commits, 4 days old, ADV change deleted/never finalized. No documented detection or cleanup path.
3. **Worktree for an archived change still on disk** (`change/showtranslationpanelprice`, `change/removeLegacyCollectionEndpoint`). Phase 9 deleted them only when run; manual archives left them.

**Current state:**
- `adv_status` reports worktree census with `>7d` stale flag — exists but agents don't act on it.
- Phase 9 cleanup runs at archive time only.
- No session-start audit.

**Improvement:** Add explicit triage protocol:

```
At ADV session start, for each worktree in the census:
  1. Resolve: is the worktree on `change/<id>` where `<id>` is in `adv_change_list status: "in-flight"`?
     - YES → active. Skip.
     - NO → orphan candidate. Check sub-cases:
       a) Branch points to a dead remote (merged + remote-deleted) → propose: switch local HEAD off it; delete branch (after confirming archive)
       b) Branch has no ADV record → propose: archive/delete worktree (user choice; preserve commits as patch)
       c) Worktree mtime > 7d → propose: confirm intent, delete if abandoned

Surface as a single triage prompt at session start when N orphans found.
```

### F4 — Concurrent-session warning is too weak (P0)

> **[CORRECTED 2026-05]** This finding is SUPERSEDED. The concurrent-session warning has been DELETED entirely; soft-lock for ADV-mutating ops is explicitly forbidden. Multi-session is now the supported design center, with Temporal serializing ADV state writes and per-worktree git isolation eliminating working-tree races. See `ADV_INSTRUCTIONS.md § Multi-Session Coordination` for the current model. The diagnosis below is preserved as historical context — the proposed soft-lock improvement is NOT pursued.

`ADV_INSTRUCTIONS.md § Concurrent Session Hazard` (added 2026-05-02 F6):

> When this warning is present, **avoid git mutations** (commit, merge, branch operations) unless you have confirmed no other session is actively mutating the repo. Prefer read-only operations or coordinate with the user.

In practice during this session, the warning was emitted but **didn't prevent** another session from running `git reset` + `git checkout -- .` mid-cleanup, wiping uncommitted deletions. The warning is informational; agents see it and proceed anyway.

**Improvement:** Promote from warning to a soft lock for git-mutating ops:

```
ADV-mutating tools (anything that touches change.json, git commits, archive operations) should:
1. Re-check peer count immediately before mutation (not just at session start)
2. If peer count > 0 → escalate to user via question tool: "N peer sessions detected. Wait or proceed?"
3. Pre-mutation timestamp the working tree
4. Post-mutation, if mtime drift detected from any peer → re-verify state and re-prompt
```

Alternative: an opt-in advisory file lock (`.adv/lock` flock) for the duration of a Phase 9 archive run.

### F5 — Phase 9 conflict-recovery is underspecified for partial-success rebases (P1)

`/adv-archive` Phase 9 Step 4.6 (Compatibility Preflight):
> `git merge --no-commit --no-ff {freshness-ref}` → if clean → `git merge --abort` → continue. If conflicts → capture → abort → stop with conflicting files. **× Do NOT delete worktree**

In this session, the preflight check passed clean BUT the actual rebase in Step 4.7 hit conflicts mid-way (after applying 4 of 16 commits). The docs handle "rebase --abort" but don't say what to do when SOME conflicts resolve and some don't, or when the user wants to skip-and-continue (as I did for duplicate F4-archive-sweep + F7 commits).

**Improvement:** Add Step 4.7.1:
- "If rebase conflicts resolve cleanly with `git rebase --skip` for duplicate-content commits (verifiable: `git ls-tree origin/{default-branch} -- {touched files}` matches the to-be-skipped commit's tree), skip with a recorded reason."
- "If a conflict requires manual content merge (e.g. import block, both branches add new tools), resolve preserving both, document the merge decision in the rebase commit message."

### F6 — Worktree branch naming protocol is implicit (P2)

Branches use `change/{change-id}` where `{change-id}` is the normalized lowercase change ID. But `adv_change_create` accepts mixed-case (`boundParentProjectWorkflow`) and Temporal stores them as-given. The branch name is lowercase-normalized, leading to:
- `change/boundParentProjectWorkflow` (camelCase) on disk
- `boundparentprojectworkflow` (lowercased) in Temporal sometimes
- Confusion when grepping or listing

**Improvement:** Document explicitly in `ADV_INSTRUCTIONS.md § Worktree Integration`:
> Branch naming: `change/{change-id}` where `{change-id}` is the **literal change ID** as stored (NOT normalized). Mixed-case preserved.

Verify the actual implementation in `worktree_create` aligns with this.

### F7 — Multiple-active-worktrees scaling is undocumented (P3)

When 5–10 changes are active simultaneously, you get 5–10 worktrees. Current docs assume 1–2 at a time:
- Disk usage: each worktree is a full checkout (~100MB for ADV, ~1GB for pokeedge-web)
- Switching between worktrees: undocumented (worktree path is long, no shortcut alias)
- Coordination: when both worktrees touch related files (e.g. plugin/src/types.ts), no preflight detection

In this session, advance had 4 active worktrees (alignFrontendBackend, alignFrontendBackendFeature, improveBrandLogoContrastSystem, etc. in pokeedge-web). All sharing the same project state, all potentially conflicting on shared files.

**Improvement:** Add to ADV_INSTRUCTIONS.md:

```
### Multi-Worktree Coordination

When 3+ worktrees active simultaneously:
- `/adv-status` Cross-Change Health section auto-detects file overlap (no manual command needed)
- `adv_status` worktree_census shows all active worktrees with mtime → use to detect stale ones
- For high-overlap risk (same subsystem touched by 2+ worktrees), prefer sequential execution
```

### F8 — `adv_status worktree_census` exists but undocumented in worktree section (P3)

Found in code (`plugin/src/tools/status.ts`) and AGENTS.md mentions it briefly, but `ADV_INSTRUCTIONS.md § Worktree Integration` doesn't reference it. Agents won't know to check it.

**Improvement:** Add to ADV_INSTRUCTIONS.md:

```
### Worktree Census

`adv_status` reports `worktree_census`:
- `total`: count of active worktrees
- `worktrees[]`: { path, branch, mtime }
- `stale[]`: worktrees with mtime > 7d

Use at session start to triage orphans (see Stale-Worktree Triage above).
```

### F9 — "Hard block when worktree tools unavailable" is too rigid (P2)

`ADV_INSTRUCTIONS.md § Worktree Policy`:
> When worktree tools are unavailable → hard block with error. Do not proceed in-place

But `~/.config/opencode/instructions/worktree-guide.md`:
> If `worktree_create`/`worktree_delete` unavailable: `[ADV:INFO] Worktree tools not available — proceeding in-place.`

These contradict. Hard block vs. info banner + proceed.

**Improvement:** Pick one. ADV's strict policy makes sense for mutating phases (apply, harden), but read-only phases (review, discovery) shouldn't hard-block. Refine:

```
- mutating phases (/adv-apply, /adv-harden, /adv-archive): hard block if worktree unavailable
- read-only phases (/adv-discover, /adv-design, /adv-review observation): proceed in-place with INFO
- /adv-prep: hard block (writes vision doc + tasks)
```

### F10 — Inline-mode-only assumptions in recovery flows (P3)

`~/.config/opencode/instructions/worktree-guide.md` Step 1 (cleanup):
```bash
MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
```

This assumes you're INSIDE the worktree at cleanup time. If `worktree.jsonc` has `inline: false`, the agent is in main checkout the whole time and `$MAIN` resolution returns the wrong path.

**Improvement:** Add explicit branch:
```
If running inline (default): $MAIN resolved from current worktree's git-common-dir
If running from main checkout (inline:false in worktree.jsonc): $MAIN = pwd
```

The Phase 9 docs in adv-archive.md handle both ("$MAIN equals the current working directory and `git -C "$MAIN" ...` is a no-op prefix") but the worktree-guide doesn't.

### F11 — Stale HEAD detection at session start (P0)

The triggering complaint of this audit: user opened opencode in pokeedge-web, landed on `hotfix/release-body-file` (merged + remote-deleted). No instruction tells agents to detect this.

**Improvement:** Add to ADV plugin init (or a new utility):

```ts
async function detectStaleBranchHead(repoRoot: string): Promise<{stale: boolean; reason: string; suggestion: string}> {
  const head = await execGit("branch --show-current");
  if (!head) return { stale: false, reason: "detached HEAD", suggestion: "..." };
  if (head === defaultBranch) return { stale: false, reason: "on default", suggestion: "" };

  // Check if branch was merged
  const merged = await execGit(`branch --merged ${defaultBranch}`).includes(head);

  // Check if remote branch exists
  const remoteExists = await execGit(`ls-remote --heads origin ${head}`).trim().length > 0;

  if (merged && !remoteExists) {
    return {
      stale: true,
      reason: `${head} is merged into ${defaultBranch} and remote branch is deleted`,
      suggestion: `git switch ${defaultBranch} && git branch -d ${head}`
    };
  }
  return { stale: false, reason: "on a non-default branch with active remote", suggestion: "" };
}
```

Emit `[ADV:WARN]` at session start if stale.

### F12 — Worktree config (.opencode/worktree.jsonc) is undocumented for agents (P3)

The file controls inline mode, sync files, hooks. Agents don't know it exists or how to read it. A misconfigured one could silently break the inline assumption.

**Improvement:** ADV_INSTRUCTIONS.md should mention:

```
Worktree config: `.opencode/worktree.jsonc` controls inline mode, sync files, hooks.
- inline: true (default) → agent stays in same session, switches workdir
- inline: false → opens new tmux/terminal; agent should NOT continue inline
Read this file at session start to confirm mode.
```

---

## Recommended action

Open ADV change `optimizeWorktreeInstructions` (or similar) with these 12 findings as discovery agenda. Sequencing:

| Phase | Findings | Effort |
|---|---|---|
| P0 fixes (active corruption causes) | F3, F4, F11 | Medium — code + docs |
| P1 fixes (predictable friction) | F1, F5, F9 | Small — docs reconciliation |
| P2 fixes (gaps) | F2, F6, F12 | Trivial — small docs/file fixes |
| P3 polish | F7, F8, F10 | Small — additive docs |

Tag each fix with regression coverage requirement. Fixes are mostly documentation; the few code changes (F3 stale-worktree triage, F4 stricter concurrent lock, F11 stale HEAD detection) need new utilities + tests.

## What this audit does NOT cover

- Worktree-plugin internals (`.opencode/worktree.jsonc`, hooks) — out of ADV scope
- Multi-machine worktree behavior (mDNS, distributed)
- Performance: disk usage of N parallel worktrees on a single repo (real problem at 10+ concurrent changes)
- Windows path semantics (Linux + macOS only)

These could be a separate audit if relevant.

---

*Generated 2026-05-02. Authored after the multi-hour pokeedge cleanup session that surfaced these failure modes.*
