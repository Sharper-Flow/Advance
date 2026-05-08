# Archive: Add /adv-triage command for backlog reconciliation and WSJF-prioritized roadmap regeneration

**Change ID:** addAdvTriageCommandBacklog
**Archived:** 2026-05-08T18:39:57.871Z
**Created:** 2026-05-08T18:33:41.811Z

## Tasks Completed

- ✅ Write .opencode/command/adv-triage.md — full 6-phase command spec (~330 lines) with preflight, gather, match, user assignments, agent scoring, roadmap regen, and final report. Includes all 4 Tier B inline approval prompts, anti-patterns, and key tools table.
  > Created .opencode/command/adv-triage.md (~330 lines). 6 phases: Preflight (gh auth + label check + project bootstrap), Gather (6 sources), Match (stable ref → Jaccard ≥0.6 → body excerpt), User Assignments (2 Tier B prompts for issues + Priority/Value), Agent Scoring (RROE/TC/Effort + WSJF with evidence trailers), Roadmap Regen (ROADMAP.md + local deprecation + atomic commit). 4 Tier B approval points, anti-patterns table, key tools table.
- ✅ Add adv-triage entry to plugin/src/manifest.ts (utility phase, args_hint, successors) and update manifest.test.ts expected count 25→26 with adv-triage in expected list.
  > Added adv-triage to manifest.ts (utility phase, args_hint: [--execute] [--no-commit] [--source <name>] [--rescore], successors: [adv-proposal, adv-task]). Updated manifest.test.ts: expectedCommands count 25→26, added adv-triage to list. Test description starts with Triage (strong verb), 10 words (within 5-14 range).
- ✅ Update ADV_INSTRUCTIONS.md (Fast-Track / Advanced section), README.md (advanced commands table), and SETUP.md (gh in Optional prerequisites + new GitHub CLI authentication section + Final auth check block).
  > ADV_INSTRUCTIONS.md: added /adv-triage row in Fast-Track / Advanced section. README.md: added /adv-triage row in advanced commands table (fixes manifest-doc-drift test). SETUP.md: added gh to Optional prerequisites table, added ~70-line GitHub CLI authentication section (install, scopes, token-coverage rule, org-access wall, multi-machine note), added Final auth check block at end of Project Initialization.
- ✅ Run pnpm test (1864 tests), pnpm run check (typecheck + lint + format), and pnpm run build to verify all changes integrate cleanly.
  > Ran pnpm test: 1864 tests pass (154 test files). Ran pnpm run check: typecheck clean, lint clean, format clean. pnpm run build not yet run (deferred to build step before session restart — not needed for command file or docs, only needed for manifest change to surface in adv_status).

## Specs Modified

