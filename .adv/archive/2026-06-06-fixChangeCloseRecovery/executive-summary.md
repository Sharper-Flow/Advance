# Executive Summary

`adv_change_close` and `adv_change_bulk_close` now have an explicit, audited completed-workflow recovery path. Normal close remains signal-first. Recovery is opt-in via `recoveryMode: 'poisoned_history'`, requires precise `recoveryEvidence`, and only disk-projects a closed status after the normal signal path fails with completed-workflow evidence.

The bulk close path applies recovery per selected change without short-circuiting siblings, preserves dry-run no-write behavior, and treats recovery-closed items as successful for cleanup. Strict-mode placeholder policy now normalizes blank recovery fields for close tools while preserving non-blank approval evidence requirements.

Verification passed: targeted close/preflight tests, typecheck, lint, format check, and reviewer schemas check. The stale `renameAdvWorktreeNamespace` close cannot be completed from this current OpenCode session because the live tool schema is cached; after archive/deploy and a fresh OpenCode session, close it with the new recovery arguments and completed-workflow evidence.