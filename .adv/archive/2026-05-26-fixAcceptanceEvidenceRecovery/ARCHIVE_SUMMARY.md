# Archive: Fix acceptance evidence recovery

**Change ID:** fixAcceptanceEvidenceRecovery
**Archived:** 2026-05-26T17:09:49.545Z
**Created:** 2026-05-26T13:59:25.565Z

## Tasks Completed

- ✅ Update acceptance evidence specs and /adv-review command contract
  > Added rq-acceptanceEvidenceTiming01 and rq-acceptanceRecovery01; amended artifact enforcement/audit/projection requirements for workflow-visible executive-summary proof and post-approval late-write rejection. Updated docs/adv-gates and /adv-review to require matrix + acceptance projection + executive-summary proof before the acceptance prompt. Added asset test assertions and requirement citations.
- ✅ Add executive-summary artifact metadata hashing and inspection support
  > Added SHA-256 contentHash calculation in store-temporal artifact metadata signals, including executiveSummary. Extended Temporal disk-artifact activities to support executive-summary.md for read/inspect paths. Added regression tests proving executiveSummary metadata carries a hash and executive-summary artifacts inspect with hash/nonblank metadata. Applied Prettier remediation for files reported by format:check.
- ✅ Enforce acceptance readiness and healthy gate completion proof
  > Added pure readiness blockers for missing executiveSummary artifact metadata and missing contentHash. Extended acceptance gate completion to generate acceptance.md, inspect executive-summary.md, enforce readability/substantive size, and compare inspected hash to workflow metadata before marking acceptance done. Updated workflow tests for healthy acceptance projection and stale executive-summary hash blockers, plus gate-readiness unit coverage.
- ✅ Add audited recovery for executive summary, review matrix, and acceptance gate
  > Added disk-direct saveRecoveredArtifactMetadata with required recovery authorization. Added adv_change_update recovery args/path for executiveSummary metadata repair on completed/poisoned workflow signal failure. Tightened contract review matrix recovery to require recoveryReason and priorApprovalEvidence and pass authorization into disk recovery. Tightened acceptance gate recovery to require prior user approval evidence, rerun deterministic readiness, generate acceptance.md, inspect executive-summary.md, and verify hash freshness before disk recovery completion. Added targeted recovery tests.
- ✅ Add cross-path regression coverage for no-late-homework acceptance proof
  > Regression coverage now spans artifact metadata hashing, executive-summary disk inspection, acceptance readiness blockers, workflow healthy/stale acceptance paths, audited artifact/review/gate recovery, change/contract/gate tool paths, /adv-review command assets, and spec citation invariant. No new code was needed in this task because coverage was added during the preceding implementation tasks; this task verified the combined cross-path suite.
- ✅ Run final verification and acceptance-evidence coordination checks
  > Ran final validation, then acceptance reviewer validated the change and tightened acceptance gate recovery audit fields plus /adv-review instructions. Post-reviewer verification passed: targeted gate/contract/change/recovery tests, pnpm run check, pnpm run build, and pnpm test.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When adding new spec-law requirement IDs, add command/code citations in the same task (e.g. `<!-- rq-newId -->`) because `spec-citation-invariant` runs with broad test selection and will fail uncited requirements even when targeted asset tests are requested.
- **[gotcha]** Artifact naming is split by boundary: disk-artifact activities use filename-oriented kebab kinds like `executive-summary`, while workflow artifact metadata uses camelCase `executiveSummary`. Tests should cover both boundaries so support is not added to one map only.
- **[gotcha]** When extending Temporal activity inputs used by workflows, update both the activity implementation type and the workflow `proxyActivities`-style local interface in `workflows.ts`; tests may pass while `tsc --noEmit` catches the narrower workflow proxy union.
- **[gotcha]** Recovery audit fields can be misapplied when shared helpers validate multiple tools. If recoveryReason/priorApprovalEvidence apply only to review-matrix or acceptance recovery, place validation in that specific execute path, not a shared recoveryEvidence helper used by contract minting.
- **[gotcha]** When adding recovery arguments to one acceptance evidence repair tool, check peer recovery paths for the same audit fields. Gate recovery can otherwise fabricate recovery evidence from caught errors while matrix/artifact recovery correctly requires caller-supplied rationale and prior approval.
