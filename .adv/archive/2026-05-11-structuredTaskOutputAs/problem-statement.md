## Problem

Agent task results are prose. When `/adv-apply` completes a task, the agent fills in `implementation_summary` and `notes` fields as free text. This means:

- `/adv-review` can't programmatically check what changed — it must re-read prose and infer
- `/adv-archive` can't aggregate "what was built" from structured data — only prose summaries
- Reflections (`/adv-reflect`) work with prose, not facts
- Future audits (counting files touched, tests added, decisions made) require LLM re-parsing of prose

Useful task-level facts the agent already knows when completing work are lost to prose:
- Files touched (paths, line counts)
- Tests added/modified
- Decisions made and why
- Follow-ups identified
- Verification evidence (command output, test results)

Inspired by Sandcastle's `Output.object({ tag, schema })` pattern, but reframed: the consumer is the next ADV phase (review, archive, reflect), not external code.

## Impact

- Review/archive/reflect must re-parse prose to extract facts the agent already knew
- No way to query "all tasks in change X that touched file Y"
- No way to aggregate "total files changed across change" without LLM parsing
- Reflections work with vibes instead of evidence
- Verification claims live in `taskCompletedSignal.verification` as opaque strings — not queryable structure

## Success Criteria

- Agent can emit structured output alongside prose during task completion
- Structured output is validated against a schema before storage
- Structured output stored as queryable metadata on the task, not lost
- `/adv-review` and `/adv-archive` can read structured output without LLM parsing
- Extraction failure throws typed error with recovery context (does not lose the completed work)
- Backward compatible — tasks without structured output continue to work unchanged