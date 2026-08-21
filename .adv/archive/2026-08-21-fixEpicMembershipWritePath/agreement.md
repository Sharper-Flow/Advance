# Agreement

## Objectives

1. Make the create-time Epic seed path consistent with the two create paths that already work, so no ADV operation can persist a child membership projection without its authoritative Epic entry.
2. Restore a working route for linking, unlinking, and reordering Epic membership through the change facade that `unifyEpicsBacklogChangeType` established.
3. Make the Epic-membership invariant enforceable at the storage boundary rather than by call-site discipline.
4. Give already-corrupted Epics a guarded repair path through reconcile that refuses ambiguous reconstructions instead of guessing.
5. Make unverified membership visible on the surfaces agents actually read.
6. Correct repo-local documentation that presents MCP-only reads as host tools.

## Success Criteria

1. A caller can link a change into an Epic and confirm the link persisted, using tools that exist.
2. No ADV operation reports Epic membership the Epic itself does not record.
3. Epics already corrupted by the phantom-write path are repairable without hand-editing ADV state.
4. An agent reading a change can tell whether its Epic membership is verified or unproven.

## Acceptance Criteria

1. Given a same-project `adv_change_create` carrying `epic_id`/`entry_id`/`epic_title`, when the named Epic or entry does not exist, then the create fails with a typed error naming `parent_epic_id` as the entry-creating route, and no change is created. [warrant: tool:adv_change_create#epic_id]
2. Given the named Epic entry exists, when the create succeeds, then the persisted child `epic_membership` matches the Epic entry field for field.
3. Given `adv_epic_promote_shell`, when the authoritative promotion write fails, then no child `epic_membership` projection survives the failure.
4. Given `adv_change_update`, when arguments carry exactly one of {artifact set, `link_change`, `unlink_change`, `reorder_entries`}, then preflight admits the call; zero operations and any artifact-plus-structural mix are rejected with typed errors. [warrant: tool:adv_change_update#link_change]
5. Given an Epic and an unlinked change, when `adv_change_update link_change` runs, then the Epic gains the entry, the child gains matching membership, and a subsequent read shows both. [warrant: tool:adv_change_update#link_change]
6. Given an Epic ID passed with artifact fields, when the call resolves, then the error names the Epic/change distinction and does not report the ID as not found. [warrant: spec:rq-epicErrors01]
7. Given a child projection that conflicts with `expectedCurrent`, when `setEpicMembership` is called, then the write is refused with a typed conflict and the existing projection is preserved. [warrant: spec:rq-epicMembershipConvergence01]
8. Given an Epic entry recording its own project id, when convergence runs, then the entry converges; a genuine cross-project entry is still skipped.
9. Given a child membership naming an Epic owned by another project, when residue is classified, then the record is exempt from local reconstruction and reported for the operator path, and no local Epic is materialized.
10. Given an Epic that exists with no matching entry and children carrying complete membership fragments, when reconcile applies, then entries are backfilled through the locked entry-write path and dry-run output matches apply. [warrant: spec:rq-epicReconstructionProvenance01]
11. Given conflicting or incomplete fragments, an `entry_id` or `change_id` already present in the Epic, or a retired or merged owner, when backfill runs, then the fragment is refused with a specific reason and nothing is written.
12. Given a terminal child fragment, when backfill writes its entry, then the entry carries `terminal_summary`; a terminal fragment lacking a usable completion timestamp is refused. [warrant: spec:rq-epicTerminalChildProjection01]
13. Given a change whose `epic_membership` names an Epic with no matching entry, when `adv_change_show`, the context snapshot, or a briefing packet renders it, then membership is marked unverified and points at reconcile. [warrant: tool:adv_change_show]
14. Given the repo-local documentation set, when host-tool tables are checked, then `adv_epic_list`, `adv_epic_show`, `adv_backlog_list`, and `adv_backlog_show` no longer appear as host tools.

## Constraints

1. Must route every Epic entry write through the existing locked `store.epics` mutation ops.
2. Must preserve optional Epic membership and advisory Epic order.
3. Must not write outside this repository.

## Avoidances

1. No host `adv_epic_*` tool surface reinstatement. `unifyEpicsBacklogChangeType` retired it deliberately; the facade is the intended route.
2. No dedicated membership-repair tool. rq-epicMembershipConvergence01 forbids it.
3. No deprecation window or warn-then-refuse transition for the seed tightening.
4. No heuristic dedupe of ambiguous fragments, and no fabrication of entry fields a fragment does not carry.
5. No reordering of promotion's two writes as the fix — remove the pre-seed instead.

## Out of Scope

1. Cross-project convergence routing, which remains deferred to operator paths.
2. Epic ordering semantics, membership optionality, and gate semantics.
3. The toolbox copy of `adv-tools.md` at `~/.config/opencode/instructions/`, outside this repository.

## Preview Applicability

- `visual_surface: false`
- `preview_expectation.exact_route_required: not_applicable`
- `preview_expectation.data_state_expectation: not_applicable`
- `preview_expectation.viewport_expectation: not_applicable`
- Rationale: the change touches ADV plugin internals, tool argument preflight, disk-backed storage, and reconcile actions. Its entire output surface is JSON tool responses and CLI text. No browser-visible or rendered surface can be affected.

## Decisions

### User Decisions

**Seed behavior — refuse, matching cross-project.** When a same-project seed names an Epic or entry that does not exist, the create fails before anything is written. Matters because it makes all three create paths state one contract: seeding attaches a child to an entry that already exists, and `parent_epic_id` is the route that creates one. The alternative — creating the entry on demand — would give callers two differently-shaped routes into the same authoritative write.

**Transition — immediate refusal, no deprecation window.** The permissive path produces corrupt state on every use, so there is no version of it worth preserving. Every call surviving a warning window would add another orphaned fragment to repair. Failures are typed and name the correct alternative.

**Backfill autonomy — auto-backfill clean cases, refuse ambiguous ones.** Fragments with complete, non-conflicting evidence are backfilled under the existing dry-run plus `plan_hash` approval gate. Conflicting or incomplete fragments are reported unrepairable with a specific reason. Matters because guessing is what produced the `Customer lifecycle email` duplicates in the first place; this preserves the fail-closed posture already present in `reconcile-action-epic-recovery.ts` and required by rq-epicReconstructionProvenance01.

**Read-surface warning — yes, mark unverified membership on reads.** `adv_change_show`, the context snapshot, and briefing packets flag membership whose Epic has no matching entry. Matters because it closes the detection gap for corruption that already exists and for anything that slips past the write-path fixes. Costs one Epic lookup per change read carrying membership.

**Documentation scope — fix repo docs, report the external file.** The four repo-local sources are corrected here. The archive report states that `~/.config/opencode/instructions/adv-tools.md` needs the same edit and includes the corrected table. Matters because writing outside the repository would put the edit beyond this repo's tests, review, and CI, and beyond the change's own diff.

### Agent Decisions (LBP)

**Enforce the invariant at the storage boundary, not per writer.** `store-types.ts:377-384` already declares `setEpicMembership(expectedCurrent, setAt)`; `store-disk.ts:693-698` ignores both. Its sibling `clearEpicMembership` enforces its equivalent, and `applyChildEpicMembership` already passes `expectedCurrent` at every call site. Enforcing the declared contract is smaller and more durable than adding a check at each writer (P33, P35).

**Fix promotion by removing the pre-seed, not by reordering.** `epic.ts:1842-1862` writes the child projection before its authoritative entry. Reordering moves the failure window rather than closing it. Creating the child bare, promoting, then applying the projection through `applyChildEpicMembership` leaves a retryable state on failure instead of a corrupt one (P40).

**Fold the three `initialMetadata.epic_membership` writers into one validated seed helper** reusing the existing `validateEpicInStore` (`create-clarify.ts:249-275`), rather than duplicating validation at each site.

**Route backfill through the locked `linkChange` path, not `saveEpicOptimistic`.** `epics-disk.ts:395-406` already refuses duplicate `entry_id` or `change_id` under the per-Epic lock. `reconcile-apply.ts:274-317` takes no lock and skips `assertOpenForMutation`, so backfilling through it would race concurrent Epic mutation and interact badly with `expected_version`.

**Treat the foreign-owner residue exemption as a precondition, not an enhancement.** `store-residue-scan.ts:527-534` builds `epicIds` from local Epics only and `:365-374` never consults `epic_project_id`, so a healthy cross-project child is already flagged `epic_owner_missing` and would be reconstructed as a phantom local Epic. The new residue class would run the same unfiltered path and convert a latent wrong repair into a routine one.

**Skip the External-Solution Check.** Internal defect repair against a spec this repo owns; no external library, service, or framework is a viable alternative (rq-disc10.3).

**Reclassify two reported defects as `unwarranted_operation`** under rq-acWarrant01. `adv_epic_list` was retired deliberately by `dc461d3a`; Epics carry `narrative`, not `proposal`/`problemStatement`. Neither may seed a must-work criterion. Only the error message and the documentation are in scope.

## Deferred Questions

None. All open questions were resolved at discovery.

## Sign-Off

Criteria approved inline by the user on 2026-08-20 at the acceptance-criteria checkpoint (reply: `continue`). Prior scoping decisions approved the same day: absorb `fixEpicMembershipConvergence` into this change, and exempt structural Epic edits from the artifact-field validator with exactly-one-operation semantics.
