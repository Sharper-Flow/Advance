# Archive: enhanceAdvSelfUpdateRuntimeProvenance

**Change ID:** enhanceadvselfupdateruntimepro
**Archived:** 2026-05-08T18:01:35.034Z
**Created:** 2026-05-08T16:40:49.432Z

## Tasks Completed

- ✅ Extend PluginRuntimeInfo types and add freshness/cwd helpers.
  > Task checkpoint completed
- ✅ Add async git probe and integrate into getPluginRuntimeInfo.
  > Task checkpoint completed
- ✅ Surface freshness in formatted healthSection of adv_status.
  > Task checkpoint completed
- ✅ Add rq-runtimeProvenance01 to advance-delivery spec.
  > Task checkpoint completed
- ✅ Full verification pass.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Self-modifying plugin diagnostic surface: when the agent fixes its own tool code, three timing relationships matter — source mtime, dist mtime, process_started_at. Equal-mtime cases must explicitly fold into the "fresh" verdict (sourceMtime <= distMtime AND distMtime <= processStartedAt) to avoid false alarms on same-millisecond rebuilds. Recovery hints must be structured ({ action, commands[], paths }) not freeform strings, so callers can render verbatim OR extract individual commands programmatically. Filesystem stat failures and git probe failures must degrade to null with a "unknown" verdict — never throw — because diagnostic surfaces are called by status tools that must keep working even when filesystem/git are unavailable.
- **[convention]** Async git probe pattern: use `promisify(execFile)` with explicit `timeout: <ms>` option and `env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }`. Never use shell-form spawn for git args — pass arg array to execFile. Bound timeout to ~1s for diagnostic probes (longer for actual operations like execGit at 5s in project-id.ts). Wrap in try/catch returning null/null on any failure; never propagate git errors to diagnostic tool consumers.
- **[gotcha]** Cross-repo ownership boundary for self-update workflow (Advance #40 / OCA #9): Advance owns runtime PROVENANCE diagnostics — what is loaded, what is fresh, what is git HEAD. OCA owns rebuild ORCHESTRATION — invoking pnpm run build, opening new session, switching worktrees. Don't let advance creep into rebuild orchestration even though the symptom (cached dist) screams for it. The split is deliberate: advance can ship the diagnostic in isolation, OCA can ship orchestration on its own cadence, and consumer setups that haven't installed OCA still get useful provenance information.
