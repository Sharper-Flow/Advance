# Design

## Architecture Overview

One invariant, stated by `rq-epicMembershipConvergence01`: the Epic entry is authoritative, the child `epic_membership` is derived. Eight causes are eight places that invariant is not held. They group into three mechanisms:

1. **Write authority** — every path that persists a child projection must derive it from its Epic entry, and that entry must exist first. Fixed at the create handler, the promotion path, and the storage boundary.
2. **Reachability** — the facade route that writes Epic entries must survive its own preflight, and the errors it emits must name real causes.
3. **Detection and repair** — reads must distinguish a verified link from an unproven one, and reconcile must be able to rebuild entries from orphaned fragments without guessing.

The change adds no new tool, no new store, and no new repair surface. It enforces contracts that are already declared, and extends one residue class family that already exists.

## Key Decisions

### D0 — One exported entry matcher, one derived-projection builder

Three of the decisions below need to answer "does this Epic hold an entry for this child?", and three need to build a child projection from an entry. Both answers already exist in the codebase, with drifting semantics:

- `findChangeEntry` (`epic.ts:907-919`) matches on `entry_id` **or** `change_id`, filtered to `kind === "change"` at `:912`.
- `validateEpicInStore` (`create-clarify.ts:249-275`) matches on `entry_id` only at `:263-265`, with **no** `kind` filter — so a shell entry sharing an ID would satisfy it.
- `membershipFromChangeEntry` (`epic.ts:935-957`) is the canonical entry→projection builder.

**Decision.** Export a generalization of `findChangeEntry` with an explicit match mode, and route D1, D7, D8, and D9 through it rather than growing more private matchers. The `kind === "change"` filter at `:912` is preserved in every mode — that filter is why the exported helper is the generalization of `findChangeEntry` and not of `validateEpicInStore`.

- D1 uses **entry_id-only** matching, so AC2's field-for-field guarantee is not silently loosened to OR semantics.
- D7, D8, and D9 use **entry_id-or-change_id**, matching what `linkChange` already refuses on.

D1, D2, and D8 build their projections with `membershipFromChangeEntry`. The invariant says the projection derives from the entry; using the builder that already does that is how the design stops asserting the invariant and starts computing it.

### D1 — Validate the seed, then derive the projection from the entry

**Lever.** `handlers-lifecycle.ts:363` — `store.changes.create(summary, { … initialMetadata })`. That call site is where `initialMetadata.epic_membership` becomes durable; everything before it is in-memory. The gate is inserted in the local branch, after the `target_path` early return at `:296-317` and before `:363`.

**Preemption check.** `buildEpicMembershipFromSeed` (`create-clarify.ts:206-247`) is pure and returns before any I/O; it is a builder, not a lever. The cross-project branch returns at `:296` and reaches `validateTargetEpic` on its own path, so the new local gate cannot double-validate. No earlier stage short-circuits a seeded local create.

**Decision, part 1 — existence.** Call the existing `validateEpicInStore` (`create-clarify.ts:249-275`) for local seeds. It already returns `EPIC_NOT_FOUND` and `ENTRY_NOT_FOUND`, which is exactly the contract the cross-project path enforces. Export it rather than write a second validator, and route its entry lookup through D0's matcher in entry_id-only mode so it inherits the `kind === "change"` filter it currently lacks.

**Decision, part 2 — derivation.** Existence validation alone does not deliver AC2. `buildEpicMembershipFromSeed` constructs the persisted projection from **caller** input at `:235-244`: `order: epic_order ?? 0`, `title: epic_title`, `linked_at: new Date()`. None of those are read from the entry, so a caller passing a stale title or a wrong order would persist a projection that validates as existing yet does not match the entry field for field. `linked_at` in particular can never match, because it is generated at create time.

So the seed fields become **selectors, not content**. Once `epic_id` + `entry_id` resolve to an entry, the persisted projection is built by `membershipFromChangeEntry` from that entry, discarding caller-supplied `epic_title` and `epic_order`. `epic_title` remains required at the argument level — the existing all-or-nothing seed check at `create-clarify.ts:214-234` is unchanged — but it is validated against the entry rather than written from.

The same substitution applies to the cross-project write at `create-clarify.ts:740-746`, which persists the same caller-built fields today.

The error adds one field the cross-project variant does not need: a hint naming `parent_epic_id` as the argument that creates an entry. The seed path attaches; `parent_epic_id` creates. Stating that at the point of failure is what turns a break into a migration.

### D2 — Promotion creates a bare child, then projects

**Lever.** `epic.ts:1842-1852` builds `initialMetadata.epic_membership` from shell fields and `:1857-1862` calls `promoteShell`. The projection is written first, so a failure at `:1857` leaves the phantom state this change exists to remove.

**Decision.** Drop the `initialMetadata.epic_membership` seed. Create the child bare, call `promoteShell`, then build the projection with `membershipFromChangeEntry` and apply it through `applyChildEpicMembership` (`epic.ts:875-897`).

`promoteShell` returns `{ entryId, changeId }`, not the entry itself (`epics-disk.ts:389`), so this costs one Epic re-read to resolve the promoted entry through D0's matcher. That read is the price of deriving rather than re-computing, and it is on a path that already performs multiple store round trips.

Reordering the two existing writes was rejected. It inverts the window into an entry pointing at a change that may not exist, which is a harder state to detect and a harder one to retry. A bare child with a completed promotion is retryable by re-running promotion against the known `change_id`; a bare child with a failed promotion is a normal unlinked change, which is a valid state. Neither is corrupt. (P40 — repair the mechanism, do not relocate the window.)

This also removes the third writer of `initialMetadata.epic_membership`; the two that remain both derive from entries after D1.

### D3 — Preflight counts operations instead of requiring artifacts

**Lever.** `tool-arg-preflight.ts:570` — `CROSS_FIELD_VALIDATORS[toolName]?.(policyResult.normalizedArgs)`. The validator body at `:501-518` is the declaration; `:570` is where it takes effect.

**Preemption check.** `FIELD_POLICIES` (`:87-298`) runs before `:570` and normalizes placeholder values to omitted. It blank-omits `link_change` and `unlink_change` at `:140-141`, so `link_change: ""` arrives already absent and correctly counts as zero operations. It does **not** normalize `reorder_entries`, and an empty array is truthy at the facade branch (`handlers-lifecycle.ts:530`) — so `reorder_entries: []` would count as one operation and dispatch `adv_epic_reorder` with `entry_ids: []`. The policy stage does not preempt the count; it feeds it, and it currently feeds it wrong for one field.

**Decision.**

1. Add `reorder_entries: { emptyArray: "omit" }` to `FIELD_POLICIES.adv_change_update`, mirroring `scope_repos` at `:104`. This closes AC4's zero-operation rejection for the one shape that would slip through.
2. Replace the artifact-presence check with an operation count:
   - `artifactOps` = 1 when any member of `ARTIFACT_FIELDS` is present, else 0. Multiple artifacts in one call remain one operation — that behavior is relied on and does not change.
   - `structuralOps` = count of present members of a new `STRUCTURAL_FIELDS = ["link_change", "unlink_change", "reorder_entries"]`.
   - Reject `total === 0` with the existing "at least one" shape.
   - Reject `total > 1` with a new typed error naming which operations collided.

Rejecting the mix is not conservatism. `advChangeUpdateHandler` branches structural-first at `:530` and returns before reaching `runUpdate`, so an artifact payload sent alongside `link_change` is silently discarded today. Admitting that call would make the preflight complicit in data loss.

### D4 — Epic IDs get a typed error, not a not-found

**Lever.** `handlers-lifecycle.ts:629-634` — the `!existing.data` branch in `runUpdate`, after `activeStore.changes.get(changeId)` at `:622`.

**Decision.** Before returning `Change '{id}' not found.`, consult `activeStore.epics.get(changeId)`. On a hit, return a typed `EPIC_ARTIFACTS_UNSUPPORTED` naming the Epic/change distinction and pointing at `narrative`. On a miss, the existing error is unchanged.

The structural branch of the same handler already carries the inverse precedent — `EPIC_REQUIRED` at `:533-536` when a change ID reaches an Epic operation. This is that guard's mirror, and it uses the same typed-code shape rather than inventing one.

The lookup costs one Epic read on a path that is already returning an error, so it is off the success path entirely.

### D5 — The storage boundary enforces the guard it declares

**Lever.** `store-disk.ts:693-698`. The disk implementation destructures `{ membership }` and discards `expectedCurrent` and `setAt`, both of which `store-types.ts:377-384` declares. Its sibling `clearEpicMembership` at `:700-716` does enforce its `expected` argument.

**Decision.** Honor both declared arguments, with the edge semantics pinned here rather than left to the implementer:

| Condition | Behavior |
|---|---|
| `expectedCurrent` absent | Unconditional write. Preserves today's behavior. |
| `expectedCurrent` present, no current projection | **Write.** An absent projection is not a conflicting one. Refusing here would break fresh links and move-after-clear. |
| `expectedCurrent` present, current mismatches `epic_id` + `entry_id` | Typed conflict, no write. |
| `setAt` strictly older than current `linked_at` | Typed stale-write refusal. |
| `setAt` equal to current `linked_at` | Write. Idempotent convergence re-runs must not be refused. |

**Call-site audit.** Four sites, three states:

- `epic.ts:884` (`applyChildEpicMembership`) passes `expectedCurrent` conditionally — unchanged.
- `epic.ts:2623` (move) passes the old membership as `expectedCurrent` — already correct.
- `epic.ts:2055` (link-existing) passes none — gains it, since the entry it links from is known.
- `epic.ts:1065` (convergence) passes neither and **stays unconditional**. Convergence exists to overwrite a stale or missing projection from the authoritative entry; requiring it to predict the current value would contradict `rq-epicMembershipConvergence01.1`. Its `setAt` derives from `last_checked_at`, which defaults to now (`epic-convergence.ts:139`), so the strictly-older refusal cannot starve it.

`setAt` currently carries a value at `epic.ts:887` and is discarded, so it has no meaning at all today. Giving it last-write-wins semantics is what closes the convergence-race class rather than leaving it to call ordering.

**Why opt-in by argument presence.** Making `expectedCurrent` mandatory would change all four call sites in one step and couple this repair to a signature migration — and `epic.ts:1065` must not have it at all. Enforcing what is passed, plus the audit above, gets the guarantee with a blast radius of one function. (P33 — move the check to the boundary; P35 — change the owning mechanism, not each caller.)

`clearEpicMembership` throws a bare `Error` on mismatch rather than a typed conflict. That is adjacent and inconsistent with the spec's typed-conflict language; it is fixed in the same edit as a same-pattern local issue (P23), not expanded beyond.

### D6 — Convergence compares against the owner project, not against emptiness

**Lever.** `epic.ts:994-1002`. The predicate tests `change_ref.project_id !== ""`; the comment claims it tests for a different project.

**Preemption check.** `convergeEpicOnShow` early-returns at `:982-984` when the Epic has no `kind: "change"` entries. That return preempts this predicate entirely for entry-less Epics, which is why D6 alone cannot repair the reported pokeedge state and why D7/D8 are separate mechanisms rather than an extension of convergence. Stated here so the design does not rest on convergence covering ground it structurally cannot reach.

**Decision.** Resolve the owner project id from `ownerStore.paths.root` and compare. Delete the `run membership repair` guidance string, which names a capability `rq-epicMembershipConvergence01` forbids creating. It occurs twice — `epic.ts:428` and `:434` — and both go.

### D7 — The residue scan gains an Epic entry index and two classes

**Lever.** `store-residue-scan.ts:527-534` builds `epicIds` as a `Set<string>` from `listActiveEpicProjections` and `listRetiredEpicProjections`. Both return full `Epic[]` objects (`epic-projection.ts:156-219`, retired via `epic_snapshot`) and the code discards everything but `.id`. `:365-374` is the membership predicate that consumes the set, and it never consults `epic_project_id`.

**Decision.** Widen the set to a `Map<string, { entries, retired }>` built from the same two reads. No additional I/O: the entries are already in memory and thrown away.

Two classes join `epic_owner_missing`:

- **`epic_owner_foreign`** — `membership.epic_project_id` is present and names a project other than the local one. Report-only, no action. This is a **correction to existing behavior**, not an addition: today a healthy cross-project child written by `create-clarify.ts:740-746` is classified `epic_owner_missing`, and `reconstruct_from_child_fragments` (`reconcile-action-epic-recovery.ts:146`, `:428`) would materialize a phantom local Epic duplicating a healthy remote one. `findFragments` matches on `epic_id` alone and must gain the same exemption.
- **`epic_entry_missing`** — the owner Epic exists locally and active, and D0's matcher finds no entry for the fragment's `entry_id` or the child's `change_id`. This is the reported corruption.

`reconcile-plan.ts:12-32` (`actionForClass`) and the discriminated union at `:37-77` gain matching members. The union is the reason a new class cannot be added loosely — the plan schema will not compile without an explicit action list.

### D8 — Backfill routes through the locked entry write

**Lever.** `epics-disk.ts:392-431` — `linkChange` runs inside `mutateEpic`, which acquires a per-Epic file lock (`mutateEpic` → `withEpicLock` → `acquireFileLock`, `epics-disk.ts:173-200`). It refuses a duplicate `entry_id` **or** `change_id` at `:395-406` with a typed `entry_already_exists`, then bumps version at `:429`.

**Decision.** The backfill action calls `linkChange`. It does not call `saveEpicOptimistic` (`reconcile-apply.ts:274-317`), which takes no per-Epic lock and skips `assertOpenForMutation`, and would therefore race concurrent Epic mutation and desynchronize `expected_version`.

Routing through `linkChange` means the wrong-repair vectors are refused by machinery that already exists rather than by new checks:

| Vector | Refused by |
|---|---|
| Child retargeted, stale fragment re-adds the old entry | `linkChange` duplicate `change_id` check, `:399` |
| Fragment duplicates an entry already present | `linkChange` duplicate `entry_id` check, `:398` |
| Concurrent Epic mutation during backfill | `mutateEpic` per-Epic lock, `:173-200` |
| Resurrection into a retired or merged owner | D7's index carries `retired`; the action refuses before calling |

`linkChange` hardcodes `linked_at: new Date().toISOString()` at `:424`. Backfill must preserve the fragment's original timestamp, so `linkChange` gains an optional `linkedAt` input defaulting to the current behavior. Additive, one field, no existing caller affected.

Terminal fragments carry `terminal_summary` per `rq-epicTerminalChildProjection01`; `childEntry` (`reconcile-action-epic-recovery.ts:190-198`) already fails closed when a terminal fragment lacks a usable completion timestamp, and that logic is reused rather than duplicated.

Ambiguous fragments are refused with the specific reason, never merged. `fragmentFailureReason` (`:153-182`) already distinguishes `duplicate surviving fragments` from `conflicting surviving fragments`; both remain refusals.

**Constraint-1 scope.** The agreement's Constraint 1 requires every Epic entry write to route through the locked `store.epics` mutation ops. The pre-existing `reconstruct_from_child_fragments` action writes a whole reconstructed Epic — entries included — through `saveEpicOptimistic` at `:428`. That path fires only when no local owner exists (`:389-428`), so there is no Epic to take a per-Epic lock on, and `mutateEpic` requires an existing record. Migrating it to `create()` + `linkChange` was considered and rejected: `epics-disk.ts:251-289` shows `create()` cannot carry the reconstruction provenance `rq-epicReconstructionProvenance01` requires.

Constraint 1 is therefore read as governing entry writes into **existing** Epics, which is exactly what D8 does. The concurrent-reconstruction race `saveEpicOptimistic` leaves open is recorded as a risk below rather than silently inherited. This reading is surfaced for explicit confirmation at design review rather than assumed.

### D9 — Membership verification is a typed field, not a rendering decision

**Lever.** The change-read projection assembly, consumed by `adv_change_show`, `context-snapshot.ts:230`, and the briefing packet renderer.

**Decision.** Compute a typed `epic_membership_verification` alongside `epic_membership`, using D0's matcher in entry_id-or-change_id mode:

| Value | Meaning |
|---|---|
| `verified` | Owner Epic exists locally and holds a matching entry |
| `entry_missing` | Owner exists, no matching entry — the phantom state |
| `owner_foreign` | `epic_project_id` names another project; not locally verifiable, not an error |
| `owner_missing` | Owner Epic absent locally and no foreign owner declared. A retired owner also lands here — a change pointing at a retired Epic is unverifiable in the sense AC13 cares about |
| `unknown` | Verification could not run |

A typed enum rather than a rendered warning string means every surface derives its own presentation from one classification, and reviewers can assert on it (P33). `owner_foreign` being distinct from `entry_missing` is what keeps legitimate cross-project membership from reading as corruption. `unknown` exists because verification reads fail open rather than blocking a change read.

Changes without `epic_membership` are untouched and pay nothing.

### D10 — Documentation drift gets a test

**Lever.** `docs/runbooks/adv-mcp-code-mode.md:79-80`, `docs/tool-ownership.md:113-115`, `skills/adv-triage/BOOTSTRAP.md:46`, `docs/checklists/improve-checklist.md:13`. `docs/cli-surface-matrix.md:139-140` is already correct and is the model.

**Decision.** Correct all four to state that `adv_epic_list`, `adv_epic_show`, `adv_backlog_list`, and `adv_backlog_show` are MCP-Tier-4 reads bridged by `tier4-tool-map.ts:33-52`, not host tools.

The assertion extends an existing harness rather than adding one: `tool-role-policy.test.ts:117-138` already reads `docs/tool-ownership.md` and asserts against it with `line.includes(tool)`, and `cli-surface-matrix.test.ts:7,22` does the same for the matrix. Prose alone is what let this drift survive `dc461d3a`.

The toolbox copy at `~/.config/opencode/instructions/adv-tools.md` is out of scope per the agreement and is reported at archive with the corrected table.

## Implementation Strategy

Five groups. Logical dependencies are narrow; **file collisions are not**, so the two are stated separately.

| Group | Work | Logical dependency | Shares files with |
|---|---|---|---|
| A | D3 preflight count + `reorder_entries` policy, D4 typed Epic error, D10 docs + test | — | B (`handlers-lifecycle.ts`) |
| B | D0 exported matcher, D1 seed validation + derivation, D2 bare-child promotion | D0 before D1/D2 | A (`handlers-lifecycle.ts`), C (`epic.ts`) |
| C | D5 storage guard + call-site audit, D6 convergence predicate | — | B (`epic.ts`) |
| D | D7 Epic index + two residue classes | D0 | B (`epic.ts` matcher export) |
| E | D8 guarded backfill, D9 read-surface verification | D0, D7 | — |

The groups do not touch disjoint files. A and B both edit `handlers-lifecycle.ts` (D4 at `:629-634`, D1 at `:352-363`); B and C both edit `epic.ts` (D2 at `:1842-1862`, D5's audit at `:884`/`:1065`/`:2055`/`:2623`, D6 at `:994-1002`). The edits sit in disjoint functions, so they are logically independent, but executing A and B — or B and C — on parallel branches produces merge conflicts.

Practical order: **D0 first** (four groups consume it), then A and C in either order, then B, then D, then E. D8 lands with dry-run/apply parity coverage before it is allowed to write, per the existing `plan_hash` approval gate.

## Affected Components

| File | Change |
|---|---|
| `plugin/src/tools/epic.ts` | D0 export matcher; D2 bare-child promotion; D5 call-site audit; D6 predicate + two guidance strings |
| `plugin/src/tools/change/handlers-lifecycle.ts` | D1 local seed gate + entry derivation; D4 Epic-aware not-found branch |
| `plugin/src/tools/change/create-clarify.ts` | export `validateEpicInStore`; route match through D0; derive cross-project projection from entry |
| `plugin/src/utils/tool-arg-preflight.ts` | D3 `reorder_entries` policy + `STRUCTURAL_FIELDS` operation count |
| `plugin/src/storage/store-disk.ts` | D5 `setEpicMembership` guard, `clearEpicMembership` typed conflict |
| `plugin/src/storage/epics-disk.ts` | D8 optional `linkedAt` on `linkChange` |
| `plugin/src/storage/store-residue-scan.ts` | D7 Epic index, foreign exemption, new class |
| `plugin/src/storage/reconcile-plan.ts` | D7 action map + union members |
| `plugin/src/storage/reconcile-action-epic-recovery.ts` | D7 `findFragments` exemption; D8 backfill action |
| `plugin/src/utils/context-snapshot.ts`, briefing packet renderer, change-read projection | D9 |
| `plugin/src/tool-role-policy.test.ts`, `cli-surface-matrix.test.ts` | D10 assertions |
| `.adv/specs/advance-epics/spec.json`, `.adv/specs/store-reconciliation/spec.json` | spec deltas from discovery |
| 4 doc files | D10 |

## Design-Derived Criteria

1. The Epic entry index adds no I/O beyond the two projection lists already read at `store-residue-scan.ts:527-534`.
2. Read-surface verification adds at most one Epic-index lookup per change read that carries `epic_membership`; reads without membership are byte-identical to today.
3. Backfill preserves dry-run/apply parity under the existing `plan_hash` gate — a planned action and its applied result must not diverge.
4. `setEpicMembership`'s guard is opt-in by argument presence; an absent current projection is never a conflict; `epic.ts:1065` stays unconditional.
5. `linkChange`'s new `linkedAt` defaults to current behavior, so link, move, and promote are unaffected.
6. D0's matcher exposes an explicit match mode and preserves the `kind === "change"` filter in every mode; no call site inherits `entry_id`-vs-`change_id` semantics implicitly.
7. Create-time seed fields are selectors, not content: `epic_title` and `epic_order` are validated against the resolved entry and never persisted from caller input.

## Design Leverage Scout

Candidates considered: 5. Auto-adopted as design edits: 3 — D0's shared matcher and derived-projection builder, the `reorder_entries` empty-array policy in D3, and building D2's post-promotion projection with `membershipFromChangeEntry`. Corrected without adoption: 1 — the Implementation Strategy's false disjoint-files claim. Surfaced to user: 1 — Constraint-1 scope for the pre-existing unlocked reconstruction save (recorded inline in D8). Rejected: 0. The scout confirmed every lever cited in D1–D10 exists at its cited line and is not preempted.

## Validation Result

Independent validator (`adv-researcher`, `researcher:design-validation`, attempt 1): **caution**, confidence high, risk medium. Every load-bearing source claim verified: D5's discarded arguments, D7's zero-added-I/O widening, D8's per-Epic lock chain, D3's missing `reorder_entries` policy, and D6's duplicated guidance strings. No spec contradictions found across `advance-epics` and `store-reconciliation`; the validator read D5 as implementing `rq-epicMembershipConvergence01` scenario .3 and D6 as removing forbidden guidance.

One blocker, now closed: **AC2 had no delivering decision.** D1 as originally written validated entry existence only, while the persisted projection was still built from caller fields at `create-clarify.ts:235-244` — with `linked_at` generated at create time, "matches the Epic entry field for field" was unachievable. D1 part 2 above closes it by making seed fields selectors and deriving the persisted projection from the resolved entry, applied to the cross-project write as well.

Four pin-level corrections adopted from validator notes: absent-current is not a conflict (D5); `epic.ts:1065` stays unconditional or convergence breaks (D5); `promoteShell` returns `{entryId, changeId}` and needs one re-read (D2); D0's matcher must carry the `kind === "change"` filter that `validateEpicInStore` currently lacks (D0).

Validator concurs with D8's Constraint-1 reading and recommends explicit user confirmation, which is requested at design review.

Two surface defects observed during validation, unrelated to this change's causes and not absorbed into it: `adv_spec` search returns empty for all queries, and the change's contract registry reads as empty after discovery gate completion.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| `setAt` staleness refusal starves convergence | Convergence's `setAt` derives from `last_checked_at`, defaulting to now (`epic-convergence.ts:139`); equal timestamps write |
| `expectedCurrent` refusal breaks fresh links or move-after-clear | Absent current projection is an explicit write case, pinned in D5's table |
| `linkChange` is a hot path shared by link, move, and promote | `linkedAt` is optional with the existing default; no signature break |
| Seed tightening breaks existing callers | Accepted at agreement — no transition window. The error names `parent_epic_id` so the migration is one argument |
| Discarding caller `epic_title`/`epic_order` silently changes what a seeded create persists | Intended and asserted by AC2; the seed check still requires the fields, so no caller silently loses an argument |
| Read-surface verification warns on legitimate cross-project membership | `owner_foreign` is a distinct, non-alarming classification, not a warning |
| New residue class plans an action apply cannot execute | The discriminated union in `reconcile-plan.ts:37-77` will not compile without an explicit action list; parity coverage is a landing precondition for D8 |
| Backfill resurrects entries into a retired Epic | D7's index carries `retired`; D8 refuses before calling `linkChange` |
| D0's shared matcher loosens D1's seed match to OR semantics | Explicit match mode; D1 pins entry_id-only, asserted by AC2 coverage |
| Concurrent reconstruction through the unlocked `saveEpicOptimistic` (`reconcile-apply.ts:274-317`) | Pre-existing, outside Constraint 1's scope per D8, bounded by the single-operator `plan_hash` gate. Owned here as a recorded risk. If design review reads Constraint 1 as covering it, D8 expands to migrate that save onto a locked create-or-mutate path that preserves reconstruction provenance |

## LBP Analysis

The durable question is whether these invariants stay enforced by call-site discipline or move to the mechanisms that own them.

Two of the eight causes exist because a declared contract was not enforced — `setEpicMembership`'s ignored arguments, and a predicate whose comment and behavior disagreed. Two more exist because a migration landed a handler without its validator, and a doc table without a test. The pattern across all four is the same: prose or a type signature asserted something no executable check held.

So the design fixes each at the narrowest owning mechanism rather than adding checks at each consumer: the storage boundary for the projection guard, the preflight validator for the reachability rule, `linkChange` for entry-write safety, a typed enum for read-surface classification, and a contract test for the documentation. Each is smaller than the alternative and each fails loudly on regression (P33, P35).

D0 and D1's derivation rule are the same argument applied to this change's own footprint. Adding a third private entry matcher, or leaving the seed path to construct a projection it was supposed to be reading, would reproduce inside the repair exactly the drift the repair exists to remove.

The one place the design deliberately does not generalize is repair. `rq-epicMembershipConvergence01` forbids a membership-repair tool, and `convergeEpicOnShow` structurally cannot reach entry-less Epics. Repair therefore stays in reconcile residue handling, which already has a dry-run gate, an approval hash, and a no-fabrication rule. Building a second repair surface would be the accretion the spec was written to prevent.
