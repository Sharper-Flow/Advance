# Executive Summary

## Outcome

The trunk-write firewall is now project-agnostic: it protects EVERY repository's default-branch checkout, not just the current session's project. Cross-project agent workflows (target_path checkpoints, artifact mutations, queue readiness) are now structurally safe.

## Value

Closes the documented gap where a session in repo A could silently write into repo B's trunk (the `trunk-worktree-isolation` instruction's known "structural guard status" hole). Also fixes three real cross-project bugs from GitHub issues #205/#192/#132: wrong-worktree checkpoint commits, misrouted target artifact/close operations, and unready-target-queue mutations.

## Delivered

- **Target-relative firewall:** foreign default-branch main checkouts block with worktree remediation; non-prunable linked worktrees allow; exact 4 root artifacts (ROADMAP.md, CHANGELOG.md, .adv/github-project.json, .adv/roadmap-snapshot.json) allowed relative to the TARGET root only — nested lookalikes and other .adv paths block; unknown default branch fails closed; missing-parent targets classified by nearest existing ancestor; direct-write/Bash parity; same-project behavior byte-for-byte unchanged
- **Checkpoint routing:** explicit target worktree `workdir` wins; blank/unrelated workdirs reject before any Git or task-state mutation; recovery markers (merge/rebase/cherry-pick/revert) checked before detached-HEAD classification
- **Target queue readiness:** register-or-verify with per-queue liveness; typed refusal (queue, status, confidence, blockers, remediation) before mutation
- **Identity proofs:** workflow ID + store project ID pinned to resolved target project, with negative source-identity guards; snapshot reads self-identify as non-authoritative
- **rq-delDefaults10 repair (re-entry):** Designer-Direct Frontend Dispatch law/mirror/citation aligned with executable routing
- Spec delta `rq-crossProjectTrunkFirewall01` recorded for archive

## Verification

- Independent reviewer: READY, 0 findings; contract matrix 29/29
- Durable runs on the trunk-merged tree: 123 firewall/integration + 207 checkpoint/target/change + 64 delegation/citation tests + full `pnpm run check` — all green; red-first TDD evidence on core tasks
- Ops note: this change's Temporal workflow was poisoned by mid-flight worker redeploys (TMPRL1100) and recovered via user-approved reset with signal reapply — state rebuilt cleanly and validated

## Risks / follow-ups

- Non-blocking consistency note: `adv_gate_complete` recomputes target ID from store root instead of consuming `projectContext.projectId` (recorded follow-up)
- Firewall activates for sessions after deploy + restart