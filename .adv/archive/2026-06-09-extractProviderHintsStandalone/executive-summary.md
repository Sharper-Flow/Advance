## Executive Summary

Extracted ADV's provider-specific behavioral patches (~130 lines of hint injection, provider-switch detection, fallback chain logic) into a standalone OpenCode plugin at `~/toolbox/plugins/opencode-provider-hints/`.

**Before:** ADV's system-block.ts contained 6 provider hints, fallback chain, provider-switch detection, and lastProviderID state tracking — all model-specific behavioral compensations unrelated to ADV's domain workflow.

**After:** ADV retains only its 5 domain sections (degraded, health, worktree, activeChange, wisdomPrompt). Provider hints are injected by the standalone `opencode-provider-hints` plugin via its own `experimental.chat.system.transform` hook, registered before ADV in opencode.jsonc for correct injection order.

**Impact:** ADV is ~130 lines leaner with cleaner separation of concerns. Provider hints can evolve independently without touching ADV. Both plugins append to output.system[0] without cross-plugin dependencies.

**Verification:** 3593 ADV tests pass. Plugin loads and exports ProviderHintsPlugin. Zero provider hint references remain in ADV source (system-block.ts, index.ts). Plugin registered and deployed.