# Archive: Automate worktree usage for ADV changes — fix data locality, session handoff, and command protocol so agents reliably isolate work in git worktrees

**Change ID:** automateWorktreeUsageForAdvCha
**Archived:** 2026-02-13T20:07:44.505Z
**Created:** 2026-02-13T18:33:33.706Z

## Tasks Completed

- ✅ Design external state directory layout — define the path convention (~/.local/share/opencode/advance/{project-id}/), file structure for changes/, archive/, db/, wisdom.jsonl, agenda.jsonl, and handoff.json
- ✅ Implement getProjectId() utility — derive a stable project identifier from git root commit hash (matching kdcokenny pattern) for keying external state
- ✅ Update getProjectPaths() in json.ts — add external mutable paths alongside existing repo-relative immutable paths, with fallback to .adv/ when external dir is not configured
- ✅ Update createStore() in store.ts — resolve mutable state from external directory, keep spec reads from repo .adv/specs
- ✅ Update project-wisdom.ts — replace hardcoded ADV_DIR = ".adv" with resolved external path from store paths
- ✅ Update agenda.ts — replace hardcoded AGENDA_DIR = ".adv" with resolved external path from store paths
- ✅ Implement one-time migration routine — on first run, copy existing .adv/changes/, .adv/archive/, .adv/db/ to external directory if they exist locally but not externally
- ✅ Update plugin bootstrap (index.ts:103) — destructure both `directory` and `worktree` from SDK input, pass worktree context to store initialization
- ✅ Implement handoff.json write — when worktree_create is called during an active ADV change, persist {changeId, currentTaskId, gateStatus, objective} to external state directory
- ✅ Implement session hydration on startup — on plugin init in worktree context, read handoff.json and auto-populate PluginState.activeChange so context injection (system.transform) fires immediately
- ✅ Update system.transform hook — detect worktree session and inject [ADV:WORKTREE_SESSION] marker with change context, ensuring wisdom + TODO continuation work from first message
- ✅ Harden Phase 0 in adv-apply.md — replace advisory prose with deterministic sequence: assess file count + risk -> question tool -> worktree_create -> post-create verification checklist (verify change, verify task, verify gates) -> explicit "old session stops, new session continues" instruction
- ✅ Harden Phase 0 in adv-ralph.md — same deterministic sequence as adv-apply, with additional autonomous blast-radius safeguards (default to worktree for ralph unless explicitly declined)
- ✅ Add graceful degradation — detect whether worktree_create/worktree_delete tools are available at runtime, skip Phase 0 with informational message if not present
- ✅ Update ADV_INSTRUCTIONS.md — replace aspirational worktree docs with accurate description of new external state model, handoff protocol, and agent behavior expectations
- ✅ Write unit tests for getProjectId() — verify stable hash from git root commit, fallback for non-git directories, consistent across worktrees of same repo
- ✅ Write unit tests for getProjectPaths() — verify external paths used for mutable state, repo paths for specs, fallback when external dir not configured
- ✅ Write integration test for worktree state sharing — simulate main + worktree sessions accessing same change data through external state directory
- ✅ Run full test suite (bun run check) and fix any regressions — verify all 36 existing tools pass, existing workflows unaffected

## Specs Modified

