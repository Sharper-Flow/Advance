# Executive Summary

## Outcome

`adv_change_set_worker_bundle_impact` now accepts `target_path` /
`target_confirmed` / `confirmationEvidence` and routes through the target
project's store + Temporal workflow when invoked cross-project. The bug that
blocked cross-project worker-bundle impact declarations (which I hit at the end
of `addDurableAdvAdvanceMcp` earlier in this session) is fixed at the source.

## Correction from the original 2026-07-25 proposal

The original proposal (from pokeedge-web) claimed the tool was missing from the
deployed catalog. Verification in this session (`adv_tool_catalog` showed it
listed with `argKeys:[changeId,kind,rationale]`; source grep found it at
`plugin/src/tools/change.ts:2682`) proved that premise wrong. The real gap was
the missing `target_path` cross-project routing that every peer mutation tool
already exposes.

## Why It Matters

Without this fix, any ADV session in project A trying to declare worker-bundle
impact on a change in project B fails with `WorkflowNotFoundError` because the
workflow handle is built from the SESSION project ID, not the target's. The
release-gate projection then refuses to converge, producing the symptom I
observed on `addDurableAdvAdvanceMcp` (finalization.status=shipped but release
gate never marked done). Cross-project ADV work — including any future Concord
coordination and the `registerAdvAdvanceMcpServer` bridge — hits this same gap.

## What was built

- **`plugin/src/tools/change.ts`** — `adv_change_set_worker_bundle_impact`
  refactored: schema +3 fields (spread from shared `targetPathSchema.shape`);
  body wrapped in `runSetImpact(activeStore, projectContext?)` inner function;
  `withTargetPathStore` wrapper when `target_path` is set; project ID resolution
  via `projectContext?.projectId ?? getProjectId(activeStore.paths.root)`.
- **`plugin/src/tools/change.worker-bundle.test.ts`** — 3 new tests: schema
  exposure check, cross-project success (target store/handle/context), and
  untrusted-target refusal (no save, no signal).

## Pattern source

Copied verbatim from `adv_change_close` (change.ts:2761-3091). No new helpers,
no new modules, no spec deltas.

## Verification

- `bin/oc-test targeted -- src/tools/change.worker-bundle.test.ts` → 10/10 pass
  (7 existing + 3 new).
- `pnpm run check` (typecheck, schemas:check, generate:manifests:check,
  test-isolation, lockfile-policy, lint, format:check) all green.
- TDD red `tr_ms3ww3yf` proves pre-change source had 0 target_path references
  in the tool.
- TDD green `tr_ms3wwde8` runs all 10 tests passing.
- Contract review matrix: 26/26 rows passing or respected; 0 failures.

## Release Readiness Summary

Tool-surface change to `plugin/src/tools/change.ts` (single tool refactored) +
3 new tests. No spec deltas, no workflow code change, no signal shape change.
Replay-determinism is unaffected because workflow code paths and signal
payloads are unchanged. The worker-bundle impact classification for THIS change
is `not_applicable` (rationale: tool definition is host-side, executes in
opencode; the signal it fires is unchanged; the workflow signal handler is
unchanged; only host-side routing logic was added).

## Remaining Risks and Follow-ups

- **Self-deployment chicken-and-egg**: this change fixes the tool needed to
  declare its OWN worker-bundle impact cross-project. Until the fix is deployed,
  the worker-bundle impact declaration on this change must be made either
  same-project (from an advance ADV session) or accepted via the same
  finalization-shipped-but-projection-inconsistent path observed on
  addDurableAdvAdvanceMcp.
- **Catalog readback**: AC7 verification (adv_tool_catalog lists 3 new argKeys)
  is deferred to post-deploy smoke.
- **P25 related-scan**: `adv_change_update_issues` and `adv_conformance` also
  lack target_path routing. Separate change.
- **Original `pinBuildkitImage` trigger**: the 2026-07-25 pokeedge-web premise
  was misdiagnosed. Operator should re-verify whether pinBuildkitImage still has
  any release-gate block after this fix lands.
