# Archive: Allow fast-forward push from default branch in git mutation guard

**Change ID:** allowFastForwardPushDefault
**Archived:** 2026-05-08T23:16:37.605Z
**Created:** 2026-05-08T23:08:08.559Z

## Tasks Completed

- ✅ Add extractPushFlags helper to git-guard.ts: parses command for --force/-f, --force-with-lease, and refspec args. Returns PushFlags interface with force/forceWithLease/hasRefspec booleans.
  > Task completed
- ✅ Update evaluateDecision to accept optional pushFlags parameter and replace unconditional push block with flag-aware logic: allow plain push from default branch (canonical archive path), block force/forceWithLease/refspec variants with specific reason messages.
  > Task completed
- ✅ Wire push flag extraction into checkBashCommand and add integration tests covering all push variants from default branch (plain → ALLOW, --force → BLOCK, -f → BLOCK, --force-with-lease → BLOCK, refspec → BLOCK).
  > Task completed

## Specs Modified

