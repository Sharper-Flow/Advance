# Design

## Architecture Overview

This is a command/spec contract update. The linked issue close operation is performed by the `/adv-archive` workflow after archive git finalization, not by `adv_change_archive` itself. The change therefore updates the workflow instructions and requirement catalog, preserving the same gh CLI sequence and failure handling.

## Key Decisions

1. **Default-on only for structurally linked origins.**
   - Auto-close runs only when `origin.kind` is `roadmap` or `triage` and `origin.issue_number` is a positive integer.
   - `discovery`, `adhoc`, and missing-origin changes remain no-op.

2. **Push verification remains the safety gate.**
   - Issue close happens only after archive branch commits are reachable from default branch and push verification succeeds.
   - No close on dry-run, failed merge, failed push, or unverified finalization.

3. **`--no-close-issue` is the opt-out.**
   - Users can keep linked issues open intentionally.
   - `--close-issue` remains accepted as backward-compatible explicit affirmative / redundant no-op so old commands do not fail.

4. **Failure is non-fatal.**
   - Keep existing exit-code-only `gh` handling.
   - Close/comment failure emits `[ADV:ATTN]`; archive state is canonical and no rollback occurs.

5. **No runtime tool change.**
   - `adv_change_archive` stays focused on ADV archive state/spec promotion.
   - GitHub issue mutation remains in the command workflow after push verification.

## Implementation Strategy

1. Update `ADV_INSTRUCTIONS.md` `rq-issueChangeLinkage02` from opt-in/default-off to default-on-for-linked-origins with `--no-close-issue` opt-out.
2. Update `.opencode/command/adv-archive.md`:
   - Parse flags: add `--no-close-issue`; keep `--close-issue` as backward-compatible explicit affirmative.
   - Rename Step 8.5 from optional close to linked issue close.
   - Trigger: run when linked roadmap/triage origin + issue number + push verified + not `--no-close-issue`.
   - Anti-patterns: remove default-off warning; add warnings for closing unlinked origins, closing before push verification, matching stderr, and rollback.
3. Update `.opencode/command/adv-triage.md` wording if it implies `--close-issue` is required.
4. Optionally update stale implementation comments in `plugin/src/tools/change.ts` that still say auto-close behavior will land in a follow-up change, without changing runtime behavior.
5. Search for remaining default-off/opt-in references outside archived bundles.
6. Run targeted asset tests if present, then `pnpm run check`.

## LBP Analysis

Default-on is the better long-term behavior because `origin.kind='roadmap'|'triage'` plus `origin.issue_number` is structural linkage. Once archive push is verified, the upstream issue is completed by definition. The safety boundary is not the flag; it is the origin kind, issue number, and push verification. `--no-close-issue` preserves user control for exceptional cases.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Surprise close for non-roadmap work | Only close roadmap/triage origin with issue number |
| Close before code is actually shipped | Require Step 6 push verification first |
| GitHub close fails | Warn only; archive remains canonical |
| Old scripts still pass `--close-issue` | Keep accepted as explicit affirmative/no-op |
| ROADMAP stale after close | Existing triage/roadmap refresh flow handles mirror regeneration |

## Validator Result

VERDICT: VALIDATED

Validator found the design correct, simple, and spec-compliant. Current `rq-issueChangeLinkage02` is the requirement being amended, not an external constraint. Command/spec-only update is sufficient because no runtime issue-close parser exists in `plugin/src`; issue close is an agent-interpreted archive workflow step. Project-config default was rejected as unnecessary complexity.