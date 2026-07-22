# Executive Summary

## Outcome
This change removes ADV's tangled sprawl of narrow recovery tools and replaces it with self-healing normal operations plus a single diagnostic entry point (`adv_doctor`). The approver is deciding whether to release the retirement of 8 superseded recovery tools and the removal of the manual "poisoned-history" recovery ceremony from routine commands.

## Why It Matters
Operators repeatedly hit "the system is wedged" during ordinary reads, archives, and Epic work and had to choose among 10 overlapping repair tools. After this change, machine-resolvable state converges automatically, agents no longer transcribe workflow errors into recovery arguments, and unresolved infrastructure incidents route through one bounded diagnose-fix-verify tool instead of a diagnose->reconnect/restart/register decision tree. Destructive and competing-authority actions remain explicitly operator-controlled.

## Verdict
APPROVED

## What Was Built
1. Retired 8 superseded recovery tools (4 `adv_temporal_*`, `adv_archive_repair`, `adv_change_status_repair`, `adv_epic_repair_membership`, `adv_change_forget`); the dedicated repair group drops from 10 to 4 (only genuinely destructive/ambiguous controls remain).
2. Consolidated safe infrastructure recovery into one `adv_doctor` entry point (diagnose -> structurally-safe fix -> verify), which refuses unsafe actions with typed approval-required proposals.
3. Made Epic membership self-heal: `adv_epic_show` and Epic operations converge missing/stale child projections directly, with typed conflict refusal (no repair-tool selection).
4. Resolved cross-project post-commit-timeout ambiguity with a canonical request hash so a retried create cannot produce a duplicate change.
5. Removed the routine `poisoned_history` argument ceremony (`recoveryMode`/`recoveryEvidence`/`recoveryReason`) from all routine mutations; recovery is now classified from machine evidence internally.
6. Achieved zero live-usage residue of the retired surface across runtime registration, schemas, role policy, generated manifests, prompts, docs, tests, and global-spec law (14 requirements repointed via staged spec deltas; new requirements document the retirement).

## What Was Verified
- Verdict: APPROVED with 1 finding (0 blockers, 1 issue self-fixed: a dangling spec cross-reference corrected via adv_delta_amend).
- Tests: `pnpm run check` green (runId tr_mrwn29td); 117 recovery/reproduction/parity tests green (runId tr_mrwn2olz).
- Preview URL: not_applicable (internal ADV tool/workflow/spec/test behavior only; no browser-visible output; agreement `visual_surface: false`, matching contract matrix row).
- Contract matrix: 38 required rows persisted, 0 failing (all AC pass; all constraints/avoidances/out-of-scope respected or not_applicable).
- Spec residue: all 20 staged deltas read back via adv_delta_show; retired-tool names appear only descriptively/prohibitively or documenting the retirement, never as live usage.

## Remaining Concerns
None blocking. The prior-session spec-delta verification gap (deltas unreadable at the time) is fully closed by the new `adv_delta_list`/`adv_delta_show` tools used this session. Advisory only: `adv_change_validate` flags SMELL_NEGATIVE on two design-authored requirements (`rq-epicMembershipConvergence01`, `rq-provenMutationOutcome01`) that passed the design gate; not release-blocking.

## Supporting Evidence
- Tasks: tk-9d7519c9531f (Epic convergence), tk-74c358188ffb (creation-hash idempotency), tk-87c1d5115473 (internalized machine-evidence recovery), tk-dc21b6a3658d (adv_doctor), tk-0528be678596 (surface retirement + AC7 spec deltas), tk-b7112e50fc3d (end-to-end verification), tk-0aefbca1154e (bounded malformed-legacy cleanup).
- Verification run IDs: tr_mrwn29td (check), tr_mrwn2olz (117 tests).
- Guards: recovery-surface-parity.test.ts, tool-registry.surface.test.ts, spec-id-shape-invariant.test.ts, doctor.test.ts.
- HEAD 109f4e77 on change/replaceRecoveryToolSprawl (pushed); 20 staged spec deltas (adv_change_validate strict: 0 errors).

## Consequence Context
1. Delivered value: ready — self-healing recovery + single diagnostic entry point + zero retired-surface residue; verified by tests + contract matrix.
2. Enabling-only/follow-up dependency: none — this change is user-facing tool-surface simplification, not an enabler awaiting a follow-up; Epic `hardenTemporalReliability` entry 9.
3. Ops readiness: pending — harden owns release/deploy/production/docs/cleanup readiness; deploy is from merged trunk post-archive (plugin rebuild + OpenCode restart required for retired tools to leave the live registry).
4. Migration/data impact: n/a — no data migration; the one bounded malformed-legacy spec removal was hash-preconditioned with no retained artifact (source: agreement C5 + tk-0aefbca1154e).
5. Frontend/preview impact: not_applicable — no browser-visible output (agreement visual_surface: false; matching matrix row).
6. Collision/release risk: low — 7 sibling drafts overlap capabilities advance-meta/advance-workflow but no same-requirement conflict (adv_change_validate: 0 errors); archive applies deltas as sole global-spec writer.
7. Open follow-ups: none required.
8. Next action: acceptance approval proceeds inline to /adv-harden replaceRecoveryToolSprawl.