# Executive Summary

Repair guard mismatch completed and independently reviewed.

ADV now classifies gates by working-tree impact: proposal/discovery/design metadata gates can complete without forcing a worktree when they only record metadata, while planning/execution/acceptance/release and task mutations remain guarded. Remediation text now points to supported worktree/session routing and avoids unsupported `workdir` or bypass-style guidance. Worktree triage and registry-dependent validators now read one Temporal-backed registry snapshot path, with explicit unavailable/warning behavior instead of silent empty retired stubs.

Verification passed:

- `pnpm run check`
- Full Vitest suite: 229 files, 2990 tests
- `adv_change_validate strict:true` passed with warning only `NO_DELTAS`
- Independent reviewer verdict: `PASS`, 15/15 contract rows satisfied

No remaining concerns identified by reviewer.