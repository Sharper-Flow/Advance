# Archive: Fix Epic instructions

**Change ID:** fixEpicInstructions
**Archived:** 2026-06-26T04:47:51.151Z
**Created:** 2026-06-26T03:50:10.857Z

## Tasks Completed

- ✅ Add cross-project Epic guidance regression tests
  > Added asset tests that reject current-repo-only Epic guidance, require product-scoped target_path membership workflow documentation, validate target_path-aware Epic tool descriptions, and prevent ADR-0004 from contradicting cross-project Epic support. The green checkpoint also contains the small surface updates needed to satisfy the new tests.
- ✅ Align Epic cross-project instruction and tool surfaces
  > Updated ADV runtime guidance to describe product-scoped cross-project Epic membership through target_path; documented target-project change -> adv_epic_link_change target_path workflow for cross-project shell-shaped work; updated ADV_INSTRUCTIONS.md and ADR-0004; corrected Epic link/unlink/move tool descriptions to remove same-project-only wording. Verified with targeted asset/unit tests.

## Specs Modified

