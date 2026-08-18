## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Fix manifest-doc-drift: adv-backlog.md description mismatch

Pre-existing suite failure (verified during tightenHandoffVoice acceptance, 2026-08-18): plugin/src/manifest-doc-drift.test.ts — .opencode/command/adv-backlog.md frontmatter description differs from command manifest entry (1 mismatch, 19 pass). Not caused by tightenHandoffVoice.

Work: align frontmatter description with manifest (or manifest with intent); rerun test to green.