## Cross-Project Origin

This change was created as a follow-up from **sharperflow-security-gates**.

| Field | Value |
|-------|-------|
| Source project | sharperflow-security-gates |
| Source path | `/home/jon/dev/sharperflow-security-gates` |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Proposal: Make ADV archive release-complete mean "actually merged to main"

## Why
"Archived" must imply "shipped." Today, on protected-main repos, ADV can record `release ✓` / Phase 9 done while the change branch is only **pushed, not merged** — the code never deploys. This silently breaks the deploy contract and erodes trust in the whole lifecycle. Discovered when a pokeedge-web agent archived `parallelizeWebUnitTests` that never landed; a cross-repo audit found ~10 unmerged change branches.

## Scope (to refine in discovery/design)
1. **Reachability is the source of truth.** Release-gate completion must verify `branch reachable from main` on all repos. No direct-push assumption. (A guard `rq-releaseFinalization01` already exists in the current build — verify it's deployed everywhere and cannot be silently bypassed.)
2. **PR + auto-merge as the Phase 9 merge mechanism on protected repos.** Open the release PR, arm GitHub native auto-merge (org now has 0-review + auto-merge + auto-update-branch), and complete release only after the merge is confirmed on main.
3. **Bypass audit.** Ensure `recoveryMode: poisoned_history` / `phase9: skip` cannot mark release complete without real reachability + audited evidence.
4. **Deployed-version drift.** Confirm whether pokeedge-web/pokeedge run an older deployed ADV than security-gates; if so, redeploy. The fix is worthless if old binaries are live.
5. **Recovery tooling.** A detector + re-drive for existing "archived-but-unmerged" branches (this session's blast radius).
6. **Repo-side compounding fix (coordination, not in advance):** pokeedge Conventional Commit Check must exempt merge + ADV `Archive`/`archive(...)` commits so release PRs can auto-merge.

## Out of scope
- The actual landing of this session's stuck branches (being handled directly via PRs + auto-merge).
- pokeedge's repo CI-policy change (its own change in pokeedge).

## Acceptance (draft)
- Archiving a change on a protected-main repo results in the code on main (or a clearly-pending armed auto-merge PR) — never a silent released-without-merge.
- Release gate cannot be completed while the branch is unreachable from main, on every deployed install.
- A documented/automated way to find + re-drive archived-but-unmerged branches.