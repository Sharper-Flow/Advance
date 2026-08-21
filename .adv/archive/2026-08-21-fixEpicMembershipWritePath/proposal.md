## Root Cause Analysis

Four reported defects resolve to two code causes, one doc-drift item, and one
missing residue class. All verified against trunk source on 2026-08-20.

### RC1 — Create-time Epic seed writes only the derived side

`plugin/src/tools/change/handlers-lifecycle.ts:352-354`

```ts
if (epicMembership) {
  initialMetadata.epic_membership = epicMembership;
}
```

The same-project create path places the membership projection into the child
change's metadata and stops. No Epic entry is written and no Epic existence
check runs.

There are three create-time Epic paths with three different behaviors:

| Path | Epic-side write | Validation |
|---|---|---|
| `parent_epic_id` | dispatches `adv_epic_link_change` (`handlers-lifecycle.ts:479-495`) | yes |
| seed + `target_path` (cross-project) | none | `validateTargetEpic` → `validateEpicInStore` (`create-clarify.ts:277-329`), requires Epic **and** entry to pre-exist |
| seed, same-project | **none** | **none** |

The cross-project path proves the intended contract: create-time seeding
attaches a child to an entry that already exists, and errors `EPIC_NOT_FOUND` /
`ENTRY_NOT_FOUND` otherwise. The same-project path never calls that validator.

`linked_at` originates at `create-clarify.ts:242` (`new Date().toISOString()`).
It is a real timestamp for the child-side write. It is fabricated only relative
to the authoritative side, which was never touched.

**Spec violation.** `.adv/specs/advance-epics` **rq-epicMembershipConvergence01**:
"Epic change entries are authoritative for membership and child epic_membership
is a derived projection." The seed path emits a derived projection with no
authority behind it — an inversion of the stated invariant, not a gap in it.

No test asserts that a same-project create-time seed produces an Epic entry.

### RC2 — The unified Epic mutation surface is unreachable at preflight

Commit `dc461d3a` (`unifyEpicsBacklogChangeType`, 2026-08-12) removed
`epicTools` from `plugin/src/tool-registry.ts` and collapsed Epic mutation onto
the change facade.

The handler landed. `handlers-lifecycle.ts:530-576` fully implements
`link_change`, `unlink_change`, and `reorder_entries`, including the
not-an-Epic guard, the Epic-not-found guard, and optimistic-concurrency
`expected_version` for reorder.

The preflight validator did not. `plugin/src/utils/tool-arg-preflight.ts:501-518`
still requires at least one member of `ARTIFACT_FIELDS`:

```ts
adv_change_update: (args) => {
  const provided = ARTIFACT_FIELDS.filter((field) => field in args);
  if (provided.length === 0) {
    return [{ field: ARTIFACT_FIELDS.join("|"),
              message: "At least one artifact field must be provided." }];
  }
  return [];
},
```

The structural arguments were never added to this validator, so the only
surviving membership-write route in the codebase is blocked before it reaches
its own implementation. This is a half-landed migration, not a design choice.

### RC3 — `Change not found` on an Epic is a misleading error, not a lookup bug

Epics resolve through `store.epics`; changes through `store.changes`. An
artifact-only `adv_change_update` against an Epic ID skips the structural branch
and reaches `runUpdate`, which calls `store.changes.get(changeId)` and correctly
finds nothing. Epics carry `narrative`, not `proposal` / `problemStatement`.

The rejection is correct. The message names the wrong cause and sends callers
hunting for an ID problem that does not exist.

### RC4 — `adv_epic_list` absence is intended; the docs are stale

The same `dc461d3a` commit retired the host `adv_epic_*` surface deliberately.
`plugin/src/mcp-server/tier4-tool-map.ts:33-52` deliberately bridges
`adv_epic_list`, `adv_epic_show`, `adv_backlog_list`, and `adv_backlog_show`
back onto the Tier-4 MCP surface, so `tools.adv.epic_list` works while the host
tool does not. That bridge is intentional; the documentation describing it is
not.

Documentation drift. No code defect.

### RC5 — No residue class covers "Epic exists, children orphaned"

`plugin/src/storage/store-residue-scan.ts:365-374` emits residue only for
`epic_membership references missing epic`. `reconcile-action-epic-recovery.ts`
consumes exactly that class and reconstructs a missing Epic owner from surviving
child fragments (`findFragments`, line 135).

An Epic that exists with zero entries and orphaned children is undetected, so
`bin/adv reconcile` is a no-op against the observed corruption.

The convergence layer cannot cover it either: `convergeEpicOnShow` early-returns
when the Epic has no change entries (`epic.ts:978-984`). Convergence repairs
entries that exist; it cannot create the missing ones.

### RC6 — Same-project entries never converge (absorbed from `fixEpicMembershipConvergence`)

`plugin/src/tools/epic.ts:992-1002`

```ts
// Skip cross-project entries (different change_ref.project_id).
if (
  entry.change_ref &&
  typeof entry.change_ref.project_id === "string" &&
  entry.change_ref.project_id !== ""
) {
  continue;
}
```

The comment declares a cross-project filter. The predicate tests "`project_id`
is a non-empty string" and never compares against the resolved owner project id.
Any entry recording its own project — including same-project entries — is
skipped permanently, leaving `membership_status: projection_pending` forever.

Downstream, entries emit `"Child projection is pending or missing; run membership
repair."`, naming a capability that does not exist in the tool catalog and that
rq-epicMembershipConvergence01 explicitly forbids introducing.

This was tracked separately as `fixEpicMembershipConvergence` (2026-08-05).
Absorbed here by user decision on 2026-08-20: it shares `epic.ts`, the same spec
requirement, and the same regression surface as RC1/RC5. Entries that are never
created and entries that never converge are one broken write-and-converge path.

---

# Discovery Findings (2026-08-20)

## Reproduction Finding Classification (rq-acWarrant01)

| Reported defect | Classification | May seed a must-work criterion |
|---|---|---|
| D1 phantom membership on create | `broken_capability` | yes |
| D2 `adv_change_update` artifact write against an Epic ID | `unwarranted_operation` | **no** — Epics carry `narrative`, not `proposal`/`problemStatement`. Only the error message is in scope. |
| D3 artifact validator blocks structural edits | `broken_capability` | yes |
| D4 `adv_epic_list` absent from host surface | `unwarranted_operation` | **no** — retired deliberately by `dc461d3a`. Only the documentation is in scope. |

## Complete write-route inventory

Every route that writes an Epic entry, and whether it also writes the child
projection. Established by exhaustive scan of `plugin/src/storage/epics-disk.ts`
(`EpicDiskMutationOps`, lines 244-666, which caps the storage-layer mutation
surface) and `plugin/src/tools/epic.ts`.

| Route | Entry write | Child projection |
|---|---|---|
| `adv_epic_link_change` (`epic.ts:1883-2302`) | yes | yes, every branch |
| `adv_epic_unlink_change` (`epic.ts:2304-2453`) | removes entry | clears first, then removes |
| `adv_epic_move_change` (`epic.ts:2455-2672`) | link target, unlink source | yes |
| `adv_epic_promote_shell` (`epic.ts:1745-1881`) | yes at `:1857-1862` | **written first** at `:1842-1852` |
| `adv_epic_add_shell` / `reorder` / `retire` | yes | n/a |
| `convergeEpicOnShow` (`epic.ts:1065-1074`) | reads entry | rebuilds projection from entry |
| `adv_change_create` + `parent_epic_id` | yes, via dispatch | yes |
| `adv_change_create` seed, cross-project | **none** | yes, after `validateEpicInStore` |
| `adv_change_create` seed, same-project | **none** | yes, unvalidated — RC1 |

Three writers of `initialMetadata.epic_membership` exist:
`handlers-lifecycle.ts:352-354` (unvalidated), `create-clarify.ts:737-746`
(validated, entry must pre-exist), `epic.ts:1842-1852` (written before its own
authoritative write). The sole-chokepoint claim for RC1's fix is verified by
this scan, not assumed.

## RC1c — Promotion writes the projection before its authority

`adv_epic_promote_shell` creates the child change carrying
`initialMetadata.epic_membership` at `epic.ts:1842-1852`, then calls
`promoteShell` at `:1857-1862`. A failure between the two leaves exactly the
phantom state RC1 produces. Reordering does not close the class — it inverts the
window into an entry with no child. Direction: create the child bare, run the
authoritative promotion, then apply the projection through the existing
`applyChildEpicMembership` (`epic.ts:875-897`). A failure then leaves a
retryable state rather than a corrupt one.

## RC7 — The repair surface is already mis-routed for cross-project fragments

Pre-existing, independent of the reported defects.

`store-residue-scan.ts:527-534` builds its `epicIds` set from **local** active
and retired Epics only. The membership predicate at `:365-374` never consults
`epic_project_id`. A healthy cross-project child written by
`create-clarify.ts:740-746` names an Epic that lives in another project, so it
is flagged `epic_owner_missing` in its own project. `findFragments`
(`reconcile-action-epic-recovery.ts:146`) matches on `epic_id` alone, and
`saveEpicOptimistic` (`:428`) would then materialize a **phantom local Epic**
duplicating a healthy remote one.

RC5's new residue class would run through the same unfiltered path and turn a
latent wrong repair into a routine one. The `epic_project_id` exemption is a
precondition for RC5, not an enhancement.

## RC8 — The storage choke point declares a concurrency guard it does not enforce

`store-types.ts:377-384` declares `setEpicMembership(expectedCurrent, setAt)`.
`store-disk.ts:693-698` ignores both and overwrites blindly. Its sibling
`clearEpicMembership` (`:700-716`) does enforce its `expected` argument, and
`applyChildEpicMembership` (`epic.ts:884-888`) already passes `expectedCurrent`
at every call site.

rq-epicMembershipConvergence01 requires: "A conflicting child projection MUST
NOT be overwritten and MUST return a typed conflict." That guarantee currently
rests on call-site discipline. Enforcing the declared arguments at the storage
boundary makes it structural (P33) with a blast radius of one call site.

## Backfill wrong-repair vectors

The existing fingerprint logic (`reconcile-action-epic-recovery.ts:153-182`)
dedupes fragments against **each other**, never against entries already present
in the Epic. Three ways RC5's backfill can produce a wrong repair:

1. A child retargeted to a new `entry_id` leaves a stale fragment; backfill
   re-adds the old entry, duplicating the change under two entry IDs.
   `epics-disk.ts:395-406` (`linkChange`) already refuses duplicate `entry_id`
   **or** `change_id` under the per-Epic lock — the backfill must route through
   that guard rather than around it.
2. `epicIds` includes retired Epics (`store-residue-scan.ts:527-534`), so
   backfill could resurrect entries into a retired or merged owner.
3. `saveEpicOptimistic` (`reconcile-apply.ts:274-317`) takes no per-Epic lock and
   skips `assertOpenForMutation`, so backfill would race concurrent Epic
   mutation and interact badly with `expected_version`.

Terminal fragments additionally need `terminal_summary` per
rq-epicTerminalChildProjection01; `childEntry` already fails closed when a
terminal fragment lacks a usable completion timestamp
(`reconcile-action-epic-recovery.ts:190-198`).

## Conflict Scan

`adv_change_list includeArchived: true` — 230 changes, complete via pagination.
Inventory state: **complete**.

- `fixEpicMembershipConvergence` — closed as superseded by this change on
  2026-08-20 with user approval. RC6 carries its defect forward.
- `fixEpicTerminalProjection`, `addEpicTimestamps`, `fixArchiveConvergence`
  (archived) — prior Epic work; none touch the create-time seed path, the
  preflight validator, or the residue scan.
- `fixArchivedMembershipDate` (draft, proposal) — archived-membership date-prefix
  matching. Adjacent but disjoint; no file overlap with this change.
- No active change touches `handlers-lifecycle.ts`, `tool-arg-preflight.ts`,
  `store-residue-scan.ts`, or `epics-disk.ts`.

Own-change `NO_TASKS` / `NO_DELTAS` warnings are pre-prep and not conflicts.

## Related Pattern Scan (P25)

**Defect class A — handler capability unreachable behind its own preflight
validator.** The cross-field validator map (`tool-arg-preflight.ts:403-519`)
contains exactly two entries. `adv_change_create`'s validator is CONSISTENT with
its handler. `adv_change_update`'s is the only divergence. The pattern does not
spread; RC2 is a single instance.

`FIELD_POLICIES` (`tool-arg-preflight.ts:87-298`) normalizes blank placeholders
rather than rejecting, so it cannot exhibit this class by construction.

**Defect class B — derived projection written without its authority.** Scanned
`epic_membership`, `fast_follow_of`, `scope_repos`, `ops_followup_links`, and
`origin`. Only `epic_membership` is spec-designated derived state. `origin`,
`scope_repos`, and `ops_followup_links` are owned by the record that carries
them. `fast_follow_of` is a child-to-parent pointer whose parent is verified by
`validateParentChange`. RC1, RC1c, and RC7 are the complete set.

**Doc-drift class.** `adv_backlog_list` / `adv_backlog_show` share RC4's
condition exactly: host-absent, MCP-bridged, documented as host tools. Same
fix, same files.

## Edge Cases

**RC1 (seed authority)**
- Epic exists, entry absent — the reported pokeedge case. Must not produce a
  membership block.
- Epic absent entirely — must fail before the change is created, not after.
- Entry exists but already references a different change — `linkChange` refuses
  duplicate `change_id`; the seed path must inherit that refusal.
- Concurrent create seeding the same `entry_id` twice.

**RC2 (preflight)**
- Zero operations — must still reject.
- Artifact fields plus a structural arg — handler branches structural-first and
  would silently discard the artifact payload; must reject.
- Two structural args in one call.
- `reorder_entries: []` — empty array is present-but-empty.

**RC5 (backfill)**
- Fragment names an entry the Epic already has — skip, not duplicate.
- Fragment names a retired or merged Epic — report, do not resurrect.
- Fragment is terminal — needs `terminal_summary` or fails closed.
- Two fragments claim the same `entry_id` with different fingerprints — existing
  logic returns `conflicting surviving fragments`; must stay refused.
- Fragment names a foreign-owner Epic — RC7 exemption.

**RC6 (convergence)**
- Genuine cross-project entry must still be skipped after the predicate change.
- Owner project id unresolvable.
- Entry whose child was archived between entry write and convergence.

## Draft Spec Deltas

**`advance-epics`**

- `rq-epicSeedAuthority01` — Create-time Epic membership seeding MUST NOT persist
  a child `epic_membership` projection unless the authoritative Epic entry exists
  or is written in the same operation.
  - *Given* a same-project create carrying `epic_id`/`entry_id`/`epic_title`,
    *when* the named Epic or entry does not exist, *then* the create fails with a
    typed error and no change is created.
  - *Given* a promotion that creates a child change, *when* the authoritative
    entry write fails, *then* no child `epic_membership` projection survives.
- `rq-epicMembershipConvergence01` — new scenario: *Given* a child projection
  that conflicts with the Epic entry, *when* `setEpicMembership` is called with a
  mismatched `expectedCurrent`, *then* the write is refused with a typed conflict
  and the existing projection is preserved.
- `rq-epicErrors01` — new scenario: *Given* an Epic ID passed to a change-artifact
  operation, *when* the operation resolves, *then* the error names the
  Epic/change distinction rather than reporting the ID as not found.

**`store-reconciliation`**

- `rq-storeReconcileOrphanEntryBackfill01` — Residue detection MUST classify a
  child `epic_membership` whose owner Epic exists but carries no matching entry,
  and backfill MUST route through the locked Epic entry-write path, dedupe
  against existing entries by `entry_id` and `change_id`, and refuse
  retired/merged owners.
  - *Given* an Epic with zero entries and three children carrying membership,
    *when* reconcile plans, *then* three backfill actions are planned and
    dry-run output matches apply.
  - *Given* a fragment whose `entry_id` already exists in the Epic, *when*
    backfill runs, *then* the fragment is skipped, not duplicated.
- `rq-epicReconstructionProvenance01` — new scenario: *Given* a child membership
  naming an Epic owned by another project, *when* residue is classified, *then*
  the record is exempted from local reconstruction and reported for the operator
  path.

## Completeness Verification

**Problem-completeness — HIGH confidence.** The reported symptom was one of six
causes. Discovery found two more the report did not reach (RC7 cross-project
mis-routing, RC8 unenforced storage guard) plus an ordering inversion in
promotion (RC1c). Two reported defects were reclassified as `unwarranted_operation`
and removed from the must-work surface.

**Solution-scope — HIGH confidence.** The write-route inventory above is
exhaustive: `EpicDiskMutationOps` caps the storage mutation surface, and all
three `initialMetadata.epic_membership` writers are enumerated.

**Sole-entry claim — VERIFIED, not blocking.** RC1's fix relies on
`buildEpicMembershipFromSeed` being the single seed-construction point. Verified
by full-repo symbol scan: two call sites, both in the create path.

**Secondary surfaces**

| Surface | Disposition |
|---|---|
| `create-clarify.ts:737-746` cross-project seed | in scope — folds into the shared validated seed helper |
| `epic.ts:1842-1862` promotion ordering | in scope — RC1c |
| `store-residue-scan.ts` foreign-owner fragments | in scope — RC7, precondition for RC5 |
| `store-disk.ts:693-698` unenforced `expectedCurrent` | in scope — RC8 |
| `adv_backlog_list` / `adv_backlog_show` doc drift | in scope — same files as RC4 |
| Change-read surfaces warning on unverifiable membership | user-facing scope question, resolved at agreement |

## LBP Check

Internal defect repair against a spec this repo owns. No external library,
service, or framework is a viable alternative, so the External-Solution Check is
skipped per rq-disc10.3.

The long-term-best-practice question is internal and structural: whether these
invariants stay enforced by call-site discipline or move to the storage
boundary. RC8 answers it — `setEpicMembership` already declares the guard, and
`clearEpicMembership` already enforces its equivalent. Enforcing the declared
contract is the smaller, more durable change than adding checks at each writer
(P33, P35).

For RC1c, replacing the pre-seed with a bare-child create is preferred over
reordering the two writes. Reordering moves the failure window rather than
closing it (P40).

## Discovery Opportunity Scout

Trigger: **run**. Candidates: 5. Auto-adopted: 2 (RC7 foreign-owner exemption,
RC8 storage-boundary enforcement). Design-around: 2 (backfill guards, bare-child
promotion). Surfaced to user: 1 (read-surface warning on unverifiable
membership). Rejected: 0.

## Extends

No prior research pack applies. `docs/*-prep.md` covers coordinate refactor
coverage, resume freshness, run-test, slop-scan, non-coding rigor, defense-in-depth
latency, and repo-improve — none touch Epic membership. `temp/` holds runtime
brainstorm, storage-backend retirement, Temporal perf, and test-fixture notes;
none apply.

New finding beyond the originating defect report: the repair surface is not
merely unreachable, it is already mis-routed for cross-project fragments (RC7),
and that vector predates this change.

## Skills Considered

`adv-opportunity-scout` — matched, loaded, used for Phase 3.5.
`adv-codebase-design` — available; not loaded, this change adjusts existing seams
rather than placing new ones.
`adv-audit`, `adv-diagnose`, `adv-triage`, `adv-clarify` — examined, not matched.
No pending-review skills. No gap detected; no skill created.

## Discovery Checklist

| # | Step | Result |
|---|---|---|
| 1 | Skill Discovery | PASS |
| 2 | Prior Research Extension | PASS — none applicable, new finding recorded |
| 3 | Conflict & Related-Work Scan | PASS — inventory complete, no conflicts |
| 4 | Edge Case Investigation | PASS — ≥2 per cause |
| 5 | Design Question Depth | PASS |
| 6 | Draft Spec Deltas | PASS — 5 deltas across 2 capabilities |
| 7 | P25 Related-Pattern Scan | PASS — 3 classes scanned |
| 8 | LBP Check | PASS — external check skipped per rq-disc10.3 |
| 9 | Completeness Verification | PASS — sole-entry claim verified |

## AMBIGUITY ANALYSIS

No blocking findings.

B1 LOW Boundaries — the global `~/.config/opencode/instructions/adv-tools.md`
carries the same stale host-tool table as `docs/runbooks/adv-mcp-code-mode.md`
but lives outside this repository.
  Evidence: `"**Out of scope:**"` section of the proposal does not name it.
  Reason: unclear because repo-local doc fixes are in scope while the downstream
  toolbox copy is not reachable from this change.

Coverage: B:C F:C S:C M:C

## Scope Boundary

**In scope:** the create-time seed authority path (same-project, cross-project,
and promotion), the `adv_change_update` preflight validator, the Epic-vs-change
error surface, storage-boundary enforcement of `setEpicMembership`, the
convergence predicate, the foreign-owner residue exemption, the orphan-entry
residue class and its guarded backfill, repo-local host-tool documentation, and
regression coverage for all of the above.

**Out of scope:**

- Reinstating the host `adv_epic_*` tool surface. `unifyEpicsBacklogChangeType`
  retired it deliberately; the facade is the intended route and this change
  makes it work rather than reverting the unification.
- Introducing a dedicated membership-repair tool.
  rq-epicMembershipConvergence01 forbids it; repair belongs in reconcile
  residue handling and direct convergence.
- Cross-project convergence routing, which remains deferred to operator paths.
- Epic ordering semantics, membership optionality, and gate semantics.
- The toolbox copy of `adv-tools.md` outside this repository.

## Risk

MEDIUM. Eight causes across six files plus a new reconcile residue class.
RC1 tightens a currently-permissive create path, so existing callers passing
seeds for nonexistent entries will begin failing — correctly, but visibly. RC8
converts silent overwrites into typed conflicts, which is the intended spec
behavior but changes an existing return shape. The backfill action writes to
Epic state and needs dry-run/apply parity plus the RC7 exemption before it is
safe to land.
