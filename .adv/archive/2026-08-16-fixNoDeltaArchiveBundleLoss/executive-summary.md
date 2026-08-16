# Executive Summary: Fix no-delta archive bundle loss

## What this did, in plain terms

Archiving a change that carried no spec-law edits silently skipped writing its permanent archive record, then deleted the working record anyway. The change looked archived but was unfindable — status pages, reflection, and worktree cleanup all reported "not found". This happened to `restoreVendoredDesignSkills` earlier today, immediately after it shipped successfully.

This change removes the shortcut that caused it. Every archive now writes its durable record first, exactly as the project's own rule (`rq-archiveRetirement01`) already required. A new automated test proves the zero-delta case writes the record; it fails on the old code and passes on the fix.

It also repaired the damage: `restoreVendoredDesignSkills`'s archived record was rebuilt from the authoritative evidence captured before the loss (full gate history, all 7 task records, the executive summary), validated against the schema, and written through the system's own archive writer — no hand-edited state. Reflection and worktree/branch cleanup for that change then completed normally.

## Why it matters

- Any future archive of a docs-only or config-only change (no spec deltas) would have silently destroyed its record. That class is now closed by a test.
- The repair demonstrates a safe recovery pattern: rebuild from captured evidence, validate against the schema, write through the owning mechanism.

## What was verified

- New regression test fails pre-fix (`archiveChange` never called) and passes post-fix; the full suite shows no new failures (5126 passed; the single failure is the known pre-existing `adv-backlog` doc drift tracked elsewhere).
- `pnpm run check` exits 0.
- Live proof on the repaired record: `adv_change_show` and archived listings resolve it, `adv_reflect` persisted a reflection, and its worktree + branch cleanup completed via normal tools.

## Known losses (recorded, not hidden)

The original run's sub-agent report sidecars (4) and narrative documents other than the executive summary were not recoverable; they existed only in the destroyed record. Gate/task/release evidence — the load-bearing audit trail — was fully restored.

## Release Readiness Summary

| Category | Status | Evidence |
|---|---|---|
| Ops readiness | ready | Fix lands in plugin source; takes effect on next deploy + OpenCode restart. |
| Migration / data impact | repair done | The one destroyed record was rebuilt and verified live. |
| Collision / release risk | low | Single-file handler change + one test file; suite green. |
| Open follow-ups | one | This change must be archived only AFTER the fixed plugin is deployed and OpenCode restarted — archiving it with the pre-fix loaded plugin would repeat the same record loss. |
