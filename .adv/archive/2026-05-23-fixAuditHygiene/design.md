# Design: Fix audit hygiene

## Architecture Overview

This change fixes four agent-facing audit/hygiene defects with small structural changes in their owning subsystems:

1. Active change listing: remove the incomplete memo-only fast path and use the existing visibility+disk union plus per-change hydration.
2. Synthetic test residue: make synthetic cleanup safe across interrupted runs, bounded to ADV-owned roots and `0000000000000000*` project IDs.
3. OpenCode DB diagnostics: make `OPENCODE_DB` path resolution explicit and fall back/diagnose when a relative env path is missing.
4. Worktree WIP noise: narrow worktree-owner workflow discovery to workflows with `AdvWorktreeBranches IS NOT NULL`, preserving per-owner poisoned-history evidence.

## Key Decisions

### D1 — Delete the active-list memo fast path

Decision: remove the early return. Always compute candidate IDs from memo + Temporal visibility + disk, then hydrate through the existing per-change loader. Memo remains useful as a per-change cache, but not as a completeness authority.

### D2 — Synthetic cleanup uses structural ownership

Cleanup remains confined to ADV-owned roots and `0000000000000000*`; preserve current-run marker mismatches and real project IDs.

### D3 — OpenCode DB env handling is explicit

Absolute `OPENCODE_DB` wins. A missing relative `OPENCODE_DB` falls back to canonical `~/.local/share/opencode/opencode.db` when present, with diagnostic.

### D4 — Worktree WIP discovery queries worktree owners only

Append `AND AdvWorktreeBranches IS NOT NULL` to the active-worktree visibility query; keep existing per-workflow poison classification for the narrowed owner set.

## Implementation Strategy

1. Add failing tests for list completeness/task counts.
2. Remove memo-only early return.
3. Add failing tests for synthetic stale cleanup.
4. Harden synthetic cleanup/global setup.
5. Add failing tests for relative `OPENCODE_DB`.
6. Implement DB resolution/fallback diagnostics.
7. Add failing tests for worktree visibility narrowing.
8. Implement `AdvWorktreeBranches IS NOT NULL` query narrowing.
9. Run targeted and full verification.

## Validator Result

Validator verdict: CAUTION, accepted after tightening the design to choose the simple structural options above.
