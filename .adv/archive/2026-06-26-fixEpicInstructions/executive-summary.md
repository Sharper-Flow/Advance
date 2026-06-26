# Executive Summary

Fixed Epic cross-project guidance drift. ADV runtime instructions now state product-scoped Epics may span ADV-enabled repos/projects through typed `target_path` membership tools. The guidance documents the correct cross-project shell-shaped workflow: create or use the target-project ADV change, then link it into the owner Epic with `adv_epic_link_change target_path`; it does not claim direct cross-project `adv_epic_promote_shell` support.

Updated tool descriptions for Epic link/unlink/move to remove same-project-only wording, reconciled ADR-0004 with the current `advance-epics` spec, and added regression tests covering the instruction/tool/ADR surfaces.

Verification passed: `bin/oc-test targeted -- src/advance-epics-assets.test.ts src/tools/epic.test.ts` — 59 tests passed. Acceptance reviewer verdict: READY with no findings.