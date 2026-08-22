# Design — raise worktree tool timeout budget

## Decision 1: use the existing override, do not special-case

The 8s budget was not a considered bound. It existed to fit under the SDK's 10s `DEFAULT_TOOL_TIMEOUT_MS`. A per-tool `timeoutMs` execute override already existed in `tool-registry.ts` and was already carried by three sibling tools — `adv_task_checkpoint` (35s), `adv_wip_state` (60s), `adv_worktree_triage` (60s).

So the fix is to use the mechanism the codebase already has, not to add a bypass, exemption, or fast path. `adv_worktree_delete` and `adv_worktree_cleanup` get `{ timeoutMs: 50_000 }`; `WORKTREE_TOOL_SAFE_TIMEOUT_MS` moves 8_000 → 45_000.

## Decision 2: keep the clamp, move only its ceiling

`rq-worktreeBoundedCleanup02` requires the tool to be bounded and to degrade into typed partial results rather than a hard timeout. That mechanism is untouched — only the number it clamps to changes. Guidance about a structural ceiling stays truthful because there is still a ceiling.

`DISCOVERY_GIT_BUDGET_CEILING_MS` (2s per git op) is unchanged. Per-op bounding keeps failures granular — one hung subprocess is killed rather than starving the pass — and is independent of the total budget.

## Decision 3: 5s spread between inner and outer budget

45s inner against a 50s outer override. The gap is the response reserve: a clamped timeout must be able to format and return a typed timeout result before the outer `safeExecute` rejects. Collapsing the gap would convert a clean typed timeout into an opaque rejection.

## Comment truthfulness

Several comments asserted the 10s SDK ceiling as the governing bound. That is no longer true for these two tools, so the constant's rationale now anchors to the 50s registry override and records the measured evidence, the `timeoutMs` arg description drops the 10s claim, and `workspace-warp.ts` references the constant instead of a hardcoded 8s.

## Test posture

Test changes are contract-value updates, not loosening. Two budget-pinning assertions move to 45_000. Five timeout-path tests that encoded 30_000-as-oversize move to 60_000 — still oversize, still clamped. Their vitest timeouts rise to 50_000 because a clamped timeout now genuinely waits 45s under real timers. The two delete tests keep their no-override shape, since `delete` exposes no `timeoutMs` arg and its budget is internal.

No assertion was deleted or weakened.
