# Executive Summary

Fixed create-time Epic placeholder handling. `adv_change_create` now has structural preflight policies for optional Epic fields, normalizing blank/sentinel strict-mode placeholders before Zod and persistence. Partial real Epic membership is rejected with typed `INVALID_EPIC_MEMBERSHIP_SEED`, while complete valid `epic_id` + `entry_id` + `epic_title` still seeds compact `epic_membership`.

Added a narrow audited repair fallback for `adv_epic_repair_membership mode: clear_stale_projection` when the owner Epic row is missing. The fallback requires `entry_id` and `change_id`, uses the normal target_path trust path, supports dry-run, clears only exact matching child projections, and returns typed `PROJECTION_MISMATCH` on mismatch.

Verification passed: `bin/oc-test targeted -- src/utils/tool-arg-preflight.test.ts src/tools/change.test.ts src/tools/epic.test.ts` — 191 tests passed. `pnpm run typecheck` and `pnpm run format:check` passed. Acceptance reviewer verdict: READY with no findings.