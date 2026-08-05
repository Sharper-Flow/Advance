# Executive Summary — Fix ADV state authority

## Outcome (what changed for the user)

ADV now answers "which changes are active?" consistently across every surface. Before this change, an archived change could appear as a draft `in-flight` on one surface and `archived` on another — so two agents looking at the same project would disagree about what work was open, leading to duplicate effort, phantom bugs, and abandoned workflows accumulating in the Temporal backend. After this change, every read surface (list, summary, single-change get, snapshot, launcher) agrees on terminal status, and the underlying record is durably corrected when a change is archived.

The machine-wide ADV state was also cleaned: 13,035 orphan/malformed identity stores removed, 22 abandoned running workflows cleared, 91 stale summary shards rewritten to their true terminal status, and a bundle-identity guard added so a stale plugin can no longer silently serve traffic from superseded code.

## Why it matters

State authority is the foundation every ADV gate and every agent decision rests on. If "is this change done?" has two answers, acceptance, release, and cleanup decisions all corrupt. This change makes the answer trustworthy and self-correcting, and it adds the structural invariants (a cross-surface property test, a fail-closed identity resolver, a bundle-generation guard) that prevent the defect class from recurring silently.

## Verification

- **Cross-surface terminality invariant** (`cross-surface-terminality.invariant.test.ts`): a change with an archive bundle returns terminal on list, listSummary, get, and snapshot regardless of a stale shard.
- **Write-side root cause repaired during acceptance review**: `archiveChangeSignal` now persists terminal status at signal time (matching every sibling terminal signal), patch-gated for replay safety. Proven by a projection-count test (archived: 2 projections = signal-time + exit-time; closed: 1) plus a structural assertion.
- **Per-ID archive dominance** over summary rows; degradation surfaced regardless of query kind.
- **Bundle-identity guard**: a loaded bundle whose generation differs from the deployed manifest refuses ADV traffic with a typed error and a recovery hint naming the correct process (OpenCode host restart vs Vision `adv-advance` restart).
- **Identity repair**: non-40-hex identities fail closed; test-mode stores redirect outside the production data home.
- typecheck, lint, `build:worker`, and the targeted Temporal integration suite all green at commit `721692d9`.

## Known limitations and follow-ups (carry into release planning)

- **AC1 / AC15 verify post-deploy.** Live `adv_change_list` agreement and the census store dimensions cannot hold until this change is merged, rebuilt, and deployed from the default branch — concurrent sessions still running the stale deployed bundle keep re-minting orphan stores. This is recorded as Design Compromise 3.
- **186 foreign-project closure candidates blocked.** Closing ADV changes in other repos from a single host session is architecturally blocked (`projectId`-mismatch invariant; wisdom `ws-K2rf4C`). Needs either a session rooted in each target repo or an SDK change adding per-project Temporal write support.
- **AC5 launcher coverage is vacuous by design and accepted.** The launcher projection is active-only and intentionally omits archived rows, so the cross-surface invariant's launcher assertion is satisfied by omission. Recorded as an accepted review finding (user decision), not a defect.
- **AC4 helper-extraction debt.** Six inlined dominance sites do not share a shape; uniformity is enforced behaviorally (build-time invariant) rather than structurally. Design Compromise 1.
- **TMPRL1100 poisoned histories** (7 toolbox workflows) were terminated, not root-caused — recorded but not chased, per user direction.
- **327 machine-wide COMPLETE_UNARCHIVED changes** route to archive campaigns (not closure) and are out of scope for this change.

## Risks

The dominant residual risk is operational, not code: until merge + rebuild + deploy, the stale deployed bundle continues to serve and re-mint state. The change is correct on its branch; the production artifact must catch up before the census dimensions and live list agreement can be re-verified.