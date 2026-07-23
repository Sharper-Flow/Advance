# Executive Summary — Add durable change seeds

## Outcome
ADV change seeds (Epic shells, backlog items) carry a durable, size-bounded **context packet** (structured background) injected into the generated proposal on promotion.

## Value / why it matters
Capture background once; every proposal from that seed inherits it, bounded + validated. Reduces rework/drift. Future-work inventory surfaced in `adv_status` + `bin/adv roadmap`.

## What was verified
- `pnpm run check` green; `bun test bin/` 300 pass; full vitest 7156 pass.
- Bounds enforced at every entry point (add_shell, backlog_add, promotion). Optional everywhere. Presence-only projection.

## Risks / follow-ups
- ADV per-change worktree instability (separate defect; work done in manual ad-hoc worktree).
- `legacy-copoll.itest.ts` environmental flake (unrelated, passes in isolation).
- Entangled commit attribution → squash-merge recommended.

## Release Readiness Summary
Deliverable complete (7 tasks, 9 AC/3 SC/4 C/5 DONT met, review ACCEPT). Standard plugin build+deploy from merged trunk; no migration/data/frontend impact.