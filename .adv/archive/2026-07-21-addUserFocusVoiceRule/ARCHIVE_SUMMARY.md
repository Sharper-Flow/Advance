# Archive: Add user-focus voice rule

**Change ID:** addUserFocusVoiceRule
**Archived:** 2026-07-21T00:51:13.732Z
**Created:** 2026-07-20T23:30:32.902Z

## Tasks Completed

- ✅ Add user-focus pointer bullet to `## Voice Contract` section in deployed ADV agent source + repo overlay mirror.
  > Task checkpoint completed
- ✅ Add `## User-Focus` section to `docs/command-voice-standard.md`
  > Task checkpoint completed
- ✅ Verify no regression in voice enforcement + build/deploy sanity.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** PR #264 (Reshape /adv-triage to portfolio balance) updated `plugin/src/manifest.ts` description for /adv-triage but missed 3 downstream docs: `.opencode/command/adv-triage.md` frontmatter, `README.md` table row, `ADV_INSTRUCTIONS.md` table row. Drift detected by `plugin/src/manifest-doc-drift.test.ts` (3 failures). Fix: when updating any manifest description in `manifest.ts`, scan and update all downstream surfaces (command doc frontmatter, README, ADV_INSTRUCTIONS) in the same PR. The manifest-doc-drift test enforces this — it's not advisory.
