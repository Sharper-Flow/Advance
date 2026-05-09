## Design: verify stale push-block report and pin firewall pass-through

### Decision

Do not add a new git mutation guard. Current trunk's active enforcement surface is `plugin/src/tools/trunk-write-firewall.ts`, and it intentionally classifies only direct file-write shell patterns. Git commands, including `git push`, produce no destructive write targets and therefore pass through.

### Implementation shape

- Add targeted regression assertions in `plugin/src/tools/trunk-write-firewall.test.ts`:
  - `classifyDestructiveBash("git push origin main")` returns `[]`.
  - `checkTrunkWriteBash("git push origin main", "/repo", deps())` returns `{ decision: "ALLOW" }`.
- Keep existing tests for destructive bash blocking and worktree allow behavior unchanged.
- No production code change expected unless the test exposes a current mismatch.

### Safety properties

- No broad trunk write allowlist change.
- No heuristic git parsing added to file-write firewall.
- Existing file mutation protections remain structural: only classified target paths flow through `checkTrunkWrite(...)`.
- Canonical archive publication already has safety from workflow/gate verification and the explicit non-force `git merge --ff-only` + plain `git push` sequence.

### Validator result

Independent validator verdict: VALIDATED.

Evidence confirmed:
- Old `git-guard.ts` was deleted by prior archived change `replacegitguardwithtrunkwritef`.
- Current `trunk-write-firewall.ts` matches only file-write patterns (`>`, `>>`, `tee`, `sed -i`, `cp`, `mv`, `rm`).
- `checkTrunkWriteBash` returns `ALLOW` when classification targets are empty.
- Existing test coverage has git pull/reset/commit coverage but not `git push` specifically.

Optional follow-up, not in scope: consider deleting dead `plugin/src/guards/bash.ts` because it still classifies `git push` as mutating but has no production callers.

### Verification

- `pnpm exec vitest run src/tools/trunk-write-firewall.test.ts`
- `pnpm run check` from `plugin/`

### Follow-up

After archive, close #102 as resolved/outdated: current implementation does not contain the reported blocking path, and the regression test pins pass-through behavior.