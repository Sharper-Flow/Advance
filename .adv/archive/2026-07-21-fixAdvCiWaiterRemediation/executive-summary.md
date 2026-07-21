# Executive Summary: Fix adv-ci-waiter remediation policy

## Outcome

adv-ci-waiter no longer pretends to remediate CI failures. The agent always had `edit: deny` / `morph_edit: deny` / `task: deny` tool grants, but the spec + host instruction implied it had a "bounded remediation attempt budget." That contradiction caused parents (including me on PR #269) to hand off remediation to a worker that couldn't act.

After this change, all five policy surfaces align: **waiter polls and reports; parent owns remediation.**

## Why it matters

Pre-fix behavior: parent spawns waiter with remediation expectations; waiter has no edit tools; either the waiter spins trying, or the parent waits for a result that can't come. Observed instance: PR #269 had red CI; I spawned adv-ci-waiter with a remediation prompt; user had to cancel and direct me to fix it myself.

Post-fix behavior: on red CI, the waiter stops polling immediately, classifies the failing checks (name + URL + log excerpt), returns to the parent with that classification. The parent reads it, inspects logs/artifacts, fixes in the PR worktree, pushes, and re-spawns the waiter for the next run.

## What was delivered

- **`.opencode/agents/adv-ci-waiter.md`** gains a dedicated "On red CI: return, do not remediate" section between "CI success is not PR MERGED" and "Bounded output". Section explicitly references the waiter's deny grants and assigns remediation to the parent orchestrator.
- **`.adv/specs/advance-workflow/spec.json`** `rq-releaseFinalization04.2` scenario rewritten: removed "waiter's bounded attempt budget" wording; new text assigns remediation to parent and notes the waiter has `edit: deny`.
- **`docs/specs/advance-workflow.md`** mirrored identically.
- **`.opencode/command/adv-archive.md`** spawn language clarified: "waiter polls and reports only... Do not ask the waiter to remediate."
- **`~/.config/opencode/instructions/oc-ci-wait.md`** (host config, out-of-repo) line 27 rewritten: parent classifies and remediates; waiter has `edit: deny`.
- 3 new test assertions across `adv-ci-waiter-assets.test.ts` + `archive-release-finalization-assets.test.ts`.

## Verification

- 13/13 adv-ci-waiter-assets tests pass.
- 5/5 archive-release-finalization tests pass.
- Mode-guidance byte budget test passes (after baseline bump for adv-ci-waiter.md +837 bytes).
- Pre-existing trunk failures (ADV_INSTRUCTIONS.md adv_roadmap ref + 3 spec-citation-invariant rq IDs) remain red. These are addressed by the parallel unmerged PR #269 (fixPacketDefectWorkDiscard); they will resolve after that PR merges and this branch rebases.

## Risks / follow-ups

- **Existing in-flight PRs** spawned before this change deploy will still see old behavior until OpenCode host restarts with the new bundle.
- **Host config edit** is not version-controlled; users running their own OpenCode install must apply the `oc-ci-wait.md` line 27 change manually if they want the host-instruction layer to match.
- **Spawn-time structural validation** (rejecting waiter spawn prompts that contain remediation instructions) remains out of scope.

## Release readiness

- Safe to merge any time. No migration, no data impact, no frontend impact, no ops readiness requirements.
- Branch will need rebase after PR #269 merges to clear pre-existing CI failures.