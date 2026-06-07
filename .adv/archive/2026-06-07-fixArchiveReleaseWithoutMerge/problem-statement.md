# Problem: ADV archive reports "released" without landing code on main

## Symptom (user-reported, reproduced)
An ADV agent in pokeedge-web archived `parallelizeWebUnitTests`:
- Release gate: ✓
- Phase 9: "done"
- Branch: pushed (`origin/change/parallelizeWebUnitTests`)
- **But: NOT merged to main.** `origin/main` does not contain the branch; the `Archive … apply spec deltas and bundle` commit sits only on the change branch.

Consequence: the change is marked **archived/released in ADV state**, but the code **never reaches main and will never deploy** (deploy pipeline only runs from main → staging → prod). A "shipped" change is silently un-shipped.

## Blast radius (cross-repo audit, this session)
Unmerged `change/*` branches that are up-to-date with main (behind 0) yet not landed — i.e. archived-but-not-shipped:
- pokeedge-web: `change/parallelizeWebUnitTests` (ahead 11 / behind 0), `change/hardenIntegrationE2eSuite` (#98).
- pokeedge: `change/integrateListingEndpoints`, `change/addCnPricechartingIdentity`.
Plus ~6 older stale branches (hundreds–thousands behind) that may be abandoned.

## Root-cause hypotheses (to confirm in discovery)
1. **Phase 9 direct-push-merge fails silently on protected main.** pokeedge/web require `Sharperflow CI Gate` via org ruleset; a direct push to main is rejected, so Phase 9 falls back to push-only but **still records release complete**.
2. **The trunk-reachability guard exists but was bypassed.** In a security-gates session this session, `adv_gate_complete release` BLOCKED with `RELEASE_REQUIRES_TRUNK_MERGE: not reachable from main` (rq-releaseFinalization01). So current ADV *does* guard this. The pokeedge-web agent got release ✓ anyway → either (a) pokeedge-web runs an **older deployed ADV** without the guard, or (b) the agent used `recoveryMode: poisoned_history` / `phase9: skip` to **force past** the guard.
3. **Even with a PR, the merge can be blocked** by pokeedge's Conventional Commit Check, which rejects ADV's own `Archive …`/`Merge branch …` commits — so ADV release PRs can't auto-land on pokeedge (separate but compounding; repo-side fix).

## Desired end-state
- ADV archive/Phase 9 must **not** report `release ✓` unless the change branch is actually reachable from main (trunk merge truly happened) — on **every** repo, protected or not.
- On protected-main repos, Phase 9 should **open a PR and arm GitHub auto-merge** (hands-off auto-merge + auto-update-branch are now enabled org-wide) rather than relying on direct push, and only complete release after the merge lands.
- If `recoveryMode`/`phase9: skip` can bypass the reachability guard, that path must require explicit, audited evidence and must not be reachable as a silent default.
- Surface a remediation/repair path for already-poisoned changes: detect "archived-but-unmerged" branches and re-drive them to a real merge.
- Coordinate the repo-side Conventional Commit Check exemption (merge + `Archive`/`archive(...)` commits) so ADV release PRs can auto-merge.