# Archive: Fix opencode debt

**Change ID:** fixOpencodeDebt
**Archived:** 2026-05-26T02:12:38.430Z
**Created:** 2026-05-25T21:03:10.999Z

## Tasks Completed

- ✅ Extend session-debt model and classifier for stale tool parts
  > Extended opencode-session-debt with ToolPartRow, classification buckets/counts, stale tool-part SQL, normalizer, repairable ID helper, and scanner output. Preserved blank assistant behavior and added tests for stale tool parts, live exclusion, sample counts, scanner integration, and doctor temp DB behavior.
- ✅ Extend opencode-session-doctor dry-run/apply repair for stale tool parts
  > Extended opencode-session-doctor with tool-part dry-run counts, backup-gated apply, OpenCode schema validation, WAL checkpoint before backup, busy_timeout on write connections, transaction-backed blank deletion and in-place stale tool-part repair, interrupted metadata/time.end, and conditional parent completion only when all children terminal.
- ✅ Extend adv_status session-debt output for stale tool parts
  > Extended adv_status projection/recommendation to include repairable stale tool parts and updated formatter input/output with compact blank/tool/live/idle debt counts. Added/updated formatter/status tests for OpenCode session debt output.
- ✅ Update OpenCode session-debt specs and docs for tool-part repair
  > Extended rq-opencodeDebt01 in docs and spec JSON to cover stale tool-part detection, live exclusion, backup-gated repair, metadata.interrupted/time end, and partial parent safety. Updated opencode-session-doctor docs to describe tool-part repair behavior.
- ✅ Run final targeted validation and cleanup for OpenCode session-debt repair
  > Final validation plus harden remediation: verified integrated session-debt repair and corrected docs/spec drift found during hardening. Ready for release/archive sign-off.

## Specs Modified

