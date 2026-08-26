# Archive: Fix change close data loss

**Change ID:** fixChangeCloseDataLoss
**Archived:** 2026-08-26T20:32:00.867Z
**Created:** 2026-08-26T04:15:37.630Z

## Tasks Completed

- ✅ Add paths.closed and the closed-bundle read primitives
- ✅ Wire closed records into both read surfaces (list and get)
- ✅ Route all closed-record cleanup through one guarded helper, and rewire close
- ⏭️ Add a typed outcome discriminant to the close response
- ⏭️ Retire the active record on both archive noOp branches
- ⏭️ Give terminal-history a closed-path source
- ⏭️ Add an idempotent legacy reconcile to the doctor CLI
- ⏭️ Correct adv-cleanup skill routing for the CLI-only purge tool

## Specs Modified

