# RCA — Archive Auto-Merge vs Orchestrator Merge Authority

> **Status:** DRAFT — not yet an ADV change. Written from a pokeedge-web session because
> cross-project change creation into this repo is currently broken (see the §7 note in
> `rca-temporal-stale-projection-reads.md`).
> Pick this up from an ADV session rooted at `/home/jon/dev/advance` and create the change.
>
> **Source:** pokeedge-web change `disableValueMetricSurfaces`, session of 2026-08-03.
> **Suggested change summary:** `Align archive merge authority`
> **Suggested origin:** `discovery`, source project `pokeedge-web`, source change `disableValueMetricSurfaces`.

## 1. Summary

Two rules govern whether a PR may be auto-merged, and they disagree.

The ADV orchestrator prompt states that archive sign-off does **not** grant merge authority.
`adv_change_archive` arms GitHub auto-merge as part of its normal release route.

In the observed session the outcome was correct and desired, but it was reached by the tool
doing something the orchestrator had been explicitly instructed not to do. Right result, wrong
provenance — and the discrepancy means the documented authority model does not describe actual
system behavior.

## 2. The conflict

### 2.1 What the orchestrator prompt says

From the ADV orchestrator `PR Merge Authority` section:

> An explicit user grant to merge the current change — for example `merge`, `merge and push`,
> or equivalent — creates continuing merge authority [...] **Push-only permission, generic
> Tier-A approval, or inferred archive approval does not authorize merge.**

Tier B archive sign-off (`sign off` / `approve` / `ship it`) is explicitly *not* on the list of
phrases that grant merge authority.

### 2.2 What the tool did

The user replied `approve` at the Tier B archive checkpoint. No merge grant was given at any
point in the session. `adv_change_archive` returned:

```json
"finalization": {
  "status": "pending_merge",
  "route": "pr_auto_merge",
  "prNumber": 692,
  "autoMergeArmed": true,
  "changeTipSha": "3aa03d3777de39593cdee9166b61f4dcc0b42498"
}
```

Independently confirmed on the PR: `autoMergeRequest.enabledAt: 2026-08-03T04:29:22Z`,
method `SQUASH`. The PR subsequently merged automatically once CI passed.

### 2.3 Why this matters even though the outcome was right

The orchestrator, following its instructions, did **not** arm auto-merge and would have
refused to. Had the user wanted a manual merge gate — for example to inspect the squash
result, coordinate a deploy window, or hold the change behind another merge — the documented
authority model says they had one, and they did not.

The gap is not "auto-merge is wrong". It is that **two components disagree about who owns the
merge decision**, and the component with the weaker stated authority is the one that acted.

## 3. Root cause

`adv_change_archive`'s `pr_auto_merge` route treats archive sign-off as sufficient authority to
arm auto-merge. The orchestrator prompt treats archive sign-off as explicitly insufficient.

Neither is internally inconsistent; they were specified against different assumptions about
what Tier B approval means. There is no shared, machine-checkable definition of merge
authority that both the archive tool and the orchestrator consult — so the rule exists twice,
in prose, with different content.

This is a structural-correctness gap (P33): merge authority is currently enforced by two
independent prose rules rather than one typed contract.

## 4. Secondary finding — release gate does not close on archive success

Related, surfaced in the same sequence.

`adv_change_archive` returned `success: true` and wrote the archive bundle, but
`adv_gate_status` still showed:

```json
"release": { "status": "pending" }
```

while `_directive` simultaneously reported `phase: "archived"`, `action: {"kind": "archived"}`.
The release gate row required an explicit `adv_gate_complete gateId:"release"` after
merge reachability was proven.

So the change was simultaneously "archived" by directive and "release pending" by gate row.
Either archive success should close the release gate once merge proof exists, or the
`pending_merge` → `done` transition should be documented as an explicit orchestrator
responsibility. Currently it is neither — an orchestrator that trusted `success: true` would
leave the change permanently mid-release.

## 5. Proposed scope

1. **Single source of truth for merge authority.** Define it once, typed, consulted by both
   `adv_change_archive` and the orchestrator prompt. Prose in two places with different content
   is the defect.
2. **Decide the intended semantics explicitly.** Either:
   - Tier B archive sign-off *does* authorize auto-merge — then correct the orchestrator prompt
     and stop describing archive approval as insufficient; or
   - it does *not* — then `adv_change_archive` must not arm auto-merge without a merge grant,
     and should expose a parameter for the orchestrator to pass one through.
3. **Make the archive route's merge behavior visible at the sign-off checkpoint.** The user
   approving archive should be told whether approving also merges. Currently the Tier B prompt
   does not say so, and under the orchestrator's own rules it would be wrong to imply it.
4. **Close the release-gate transition gap** described in §4.

## 6. Success criteria (draft)

1. Archive-time merge behavior is governed by one typed authority check, not two prose rules.
2. An orchestrator following its prompt and the archive tool cannot reach different conclusions
   about whether a given approval authorizes merge.
3. The Tier B sign-off prompt accurately states whether approval will also merge the PR.
4. After a successful archive with proven merge reachability, the release gate reaches `done`
   without a separate undocumented step — or that step is documented.

**Non-goals:** removing auto-merge; changing Tier B whitelist wording for archive sign-off
itself.

## 7. Provenance

- Session: pokeedge-web, change `disableValueMetricSurfaces`, 2026-08-03.
- PR #692, squash `de044101`, merged to `main` at `04:45:51Z`.
- Auto-merge armed by the archive tool at `04:29:22Z`; no merge grant was issued by the user
  at any point in the session.
- Release gate closed manually at `04:48:03Z` after merge reachability was verified.
