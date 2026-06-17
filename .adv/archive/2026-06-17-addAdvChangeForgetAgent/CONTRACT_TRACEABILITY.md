# Contract Traceability

**Change ID:** addAdvChangeForgetAgent
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-17T21:59:55.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | grep PRESENT: adv_change_forget: true in .opencode/agents/adv.md (after status_repair) and .opencode/agents/adv-atc.md (after reenter). |
| AC2 | acceptance_criterion | pass | test | deploy --check: ✓ tool drift adv.md (56 tools), ✓ tool drift adv-atc.md (56 tools) — zero drift both directions (run tr_mqim3ylt). |
| AC3 | acceptance_criterion | pass | test | git diff = exactly two allowlist lines; tool-registry.ts, schema-registry.ts, FIELD_POLICIES, change.ts unchanged. |
| AC4 | acceptance_criterion | pass | test | pnpm run check exit 0 (schemas:check/typecheck/check-test-isolation/check-lockfile-policy/lint/format:check all green, run tr_mqim59sv). |
| C1 | constraint | respected | static_check | Only allowlist entries added; no tool-registry/schema/code changes (git diff confirms). |
| C2 | constraint | respected | static_check | Implemented in change/addAdvChangeForgetAgent worktree (trunk firewall honored). |
| DONT1 | avoidance | respected | review | adv_change_forget registration/implementation untouched (tool-registry.ts:329 unchanged). |
| DONT2 | avoidance | respected | review | Only the two intended allowlist lines; no other allowlist cleanup expanded into. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-155e3eadb59c |  | AC1, AC2, AC3, AC4 | C1, C2 |  |
