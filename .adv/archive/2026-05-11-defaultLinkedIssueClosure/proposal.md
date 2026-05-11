# Default linked issue closure on archive

## Context

After archiving `postCutoverWideSystemAudit`, the linked roadmap issue #98 remained open because `/adv-archive` currently closes linked issues only when invoked with `--close-issue`. The user observed this should be the default for roadmap-linked work.

Current contract:

- `/adv-archive --close-issue` is opt-in.
- `rq-issueChangeLinkage02` says default-off MUST NOT mutate GitHub state.
- `.opencode/command/adv-archive.md` lists auto-close without the flag as an anti-pattern.

User-requested direction: make closure default when the change has a safe upstream linkage, with explicit opt-out.

## Problem

ADV roadmap-origin and triage-origin changes already know their upstream GitHub issue via `change.origin.issue_number`. Leaving those issues open after a successfully pushed archive creates stale roadmap state and requires manual cleanup. The current default optimizes for avoiding surprise, but in practice creates friction for the normal linked-roadmap workflow.

## Scope

### In Scope

- Change the archive command contract so linked issues close by default after push verification when:
  - `origin.kind` is `roadmap` or `triage`
  - `origin.issue_number` is set
  - archive git finalization / push verification succeeded
- Add an opt-out flag such as `--no-close-issue` for the rare case where the upstream issue should remain open.
- Preserve non-fatal failure behavior: issue-close failure warns and archive remains canonical.
- Update `ADV_INSTRUCTIONS.md` active linkage requirement `rq-issueChangeLinkage02`.
- Update `.opencode/command/adv-archive.md` parse flags, Step 8.5, trigger, anti-patterns, and related docs.
- Run/adjust command/spec asset tests if the text is covered.

### Out of Scope

- Auto-closing `adhoc` or `discovery` origin issues.
- Rolling back archives when GitHub close fails.
- Changing `adv_change_archive` tool state semantics.
- Adding project-level config for close behavior.
- Regenerating roadmap snapshot in this change.

## Success Criteria

1. Archive contract says roadmap/triage linked issues close by default after verified push.
2. `--no-close-issue` opt-out is documented.
3. `--close-issue` is documented as backward-compatible explicit affirmative / no-op.
4. Failure remains non-fatal and archive state remains canonical.
5. Adhoc/discovery/no-origin changes remain no-op for issue close.
6. Relevant tests/checks pass.

## Affected Surfaces

- `ADV_INSTRUCTIONS.md`
- `.opencode/command/adv-archive.md`
- command/spec asset tests if applicable

## Discovery Agenda

- Locate all references to `--close-issue`, default-off behavior, and `rq-issueChangeLinkage02`.
- Check whether any command parser or runtime tool implements issue close behavior beyond command documentation.
- Check active changes for overlap with ADV instruction/command docs.
- Decide whether `--close-issue` remains accepted for backward compatibility.