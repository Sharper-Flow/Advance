# Archive: Add preview URLs

**Change ID:** addPreviewUrls
**Archived:** 2026-05-24T22:34:57.610Z
**Created:** 2026-05-24T21:48:49.748Z

## Tasks Completed

- ✅ Add preview URL contract asset coverage
  > Added asset test `acceptance preview URL contract is wired across discovery, review, and specs` covering spec/docs, `/adv-discover` visual_surface applicability, `/adv-review` Preview URL states, reachability evidence, no fabricated/bare URL, and ordering before Inline Approval prompt. RED run fails on missing `rq-acceptancePreviewUrl01`, as intended.
- ✅ Encode preview URL workflow spec law and docs mirror
  > Updated `advance-workflow` to v1.13.0 with new `rq-acceptancePreviewUrl01` covering discovery applicability, reachable preview proof, blocked applicable previews, and non-visual `not_applicable`. Mirrored the requirement in `docs/specs/advance-workflow.md`.
- ✅ Add preview applicability to discovery agreement
  > Updated `/adv-discover` agreement flow to include `Preview applicability` and a mandatory `visual_surface: true|false|unknown` value with rationale in persisted agreements. `unknown` is explicitly carried forward as an acceptance blocker until clarified.
- ✅ Add preview proof to review acceptance flow
  > Updated `/adv-review` Phase 7 with Preview URL Proof before acceptance, tri-state `live`/`not_applicable`/`blocked` behavior, reachability evidence requirements, matrix-backed proof, explicit no-fabrication/no-bare-URL rules, acceptance summary line, and executive-summary evidence line.
- ✅ Verify preview URL acceptance contract
  > Verified preview URL acceptance contract. After review findings, strengthened URL security/sanitization, visual-surface drift handling, `unknown` handling, blocked-summary behavior, and asset-test assertions. Final verification: targeted asset test passed and `pnpm run check` passed.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For workflow-contract changes, `plugin/src/adv-skill-backed-commands-assets.test.ts` is the right asset-test surface to pin command/spec strings and ordering before checkpoint prompts; existing tests use `indexOf(...)` ordering checks that are easy to extend for new preflight-before-approval requirements.
- **[gotcha]** When editing markdown code blocks inside command docs, watch indentation after list/code-block patches: added bullets inside fenced templates can accidentally gain an extra leading space while still passing string-based asset tests. Format/check pass should catch if markdown formatting is enforced.
- **[gotcha]** String-order asset tests can use generic anchors like `Inline Approval prompt`; adding the same phrase earlier in command docs can break unrelated ordering assertions. Prefer alternate wording before the canonical checkpoint anchor unless the new section is meant to become the ordering target.
