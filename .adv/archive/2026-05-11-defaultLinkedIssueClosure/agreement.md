# Discovery Agreement

## Discovery Summary

Current default-off behavior is owned by command/spec contract text, not by a separate runtime tool implementation. `/adv-archive` Step 8.5 documents the `gh issue comment` + `gh issue close` sequence and requires `--close-issue`; `ADV_INSTRUCTIONS.md` catalogs `rq-issueChangeLinkage02` with opt-in/default-off language.

## Current State Evidence

- `.opencode/command/adv-archive.md` target resolution parses `--close-issue` only.
- `.opencode/command/adv-archive.md` Step 8.5 trigger requires `--close-issue` plus roadmap/triage origin, issue number, and push verification.
- `.opencode/command/adv-archive.md` anti-pattern says auto-close without `--close-issue` is default-off and a surprise bug.
- `ADV_INSTRUCTIONS.md` `rq-issueChangeLinkage02` says `/adv-archive --close-issue` MUST be opt-in and default-off MUST NOT mutate GH state.
- `plugin/src` search found origin issue handling in `change.ts` and roadmap cross-reference logic, but no archive issue-close implementation beyond command workflow instructions.

## Objectives

1. Flip `rq-issueChangeLinkage02` to default-on for safe linked origins.
2. Add `--no-close-issue` as the explicit opt-out.
3. Keep `--close-issue` accepted as backward-compatible explicit affirmative / redundant no-op.
4. Keep closure gated by roadmap/triage origin, issue number, and verified push.
5. Keep failure non-fatal; archive state remains canonical.
6. Keep discovery/adhoc/no-origin changes no-op.

## Acceptance Criteria

1. `ADV_INSTRUCTIONS.md` no longer states default-off/opt-in as the requirement.
2. `.opencode/command/adv-archive.md` parse flags include `--no-close-issue` and describe `--close-issue` compatibility.
3. Step 8.5 trigger is default-on for linked roadmap/triage changes unless `--no-close-issue` is passed.
4. Anti-patterns warn against closing unlinked origins or rolling back archives, not against default close.
5. References in `.opencode/command/adv-triage.md` are updated if needed to avoid implying `--close-issue` is required.
6. Relevant tests/checks pass.

## Ambiguity Analysis

Coverage: B:C F:C S:C M:C

No blocking ambiguity findings. Boundaries, functional scope, completion signals, and missing information are clear.