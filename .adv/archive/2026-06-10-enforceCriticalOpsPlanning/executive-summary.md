# Executive Summary: Enforce Critical Ops Planning

## Problem
Required critical-ops obligations (correctness and release-safety items) were silently deferred into generic medium-priority backlog flow. No structural enforcement prevented shipping with unresolved required obligations or silently burying them in agenda items.

## Solution
Added a **structural required-critical-ops classification boundary** with enforcement at four pipeline points:

### 1. Typed Classification Model
- `ContractItemSchema.requiredCritical: boolean` — optional field marking correctness/release-safety obligations
- `RequiredFollowUpSchema` — typed carrier for sub-agent reports with `obligation_class` and `severity` fields
- `required_follow_ups` array on engineer/reviewer report schemas — separate typed channel from advisory `follow_ups`

### 2. Planning Readiness Enforcement
- `checkCriticalOpsCoverage()` in prep-readiness pipeline — blocks planning when `requiredCritical` items lack task coverage
- `CRITICAL_OPS_UNCOVERED` error code — must-failure that prevents prep gate completion
- `notRequiredReason` serves as policy-approved alternate route exemption

### 3. Report Ingestion Preservation
- `consumeRequiredFollowUps()` in subagent-report.ts — creates agenda items with preserved priority (not hardcoded medium)
- `obligation_class: "required_critical"` → `priority: "critical"` mapping
- Category `"required-obligation"` distinct from advisory `"subagent-followup"`

### 4. Release Safety Enforcement
- `checkRequiredObligationReleaseBlockers()` — blocks release when `requiredCritical` items have failing review status
- `checkRequiredObligationRouting()` — blocks release when `requiredCritical` items are silently deferred (no coverage, no routing)
- Remediation directs to `adv_change_reenter` or fast-follow split

## Verification
- **3664 tests pass** across 270 test files (full suite)
- **31 regression tests** in `required-obligation-regression.test.ts` covering full pipeline, negative paths, edge cases
- **Check suite green**: schemas:check, typecheck, lint, format:check
- **16/16 contract items pass** review matrix (3 success criteria, 6 acceptance criteria, 4 constraints, 3 avoidances)

## Specs Updated
- `prep-readiness` v1.4.0 — rq-PR007coc (Critical Operations Coverage)
- `subagent-reports` v1.1.0 — rq-subagentReports14 (Required Follow-Up Preservation)
- `advance-workflow` v1.16.0 — rq-requiredObligation01 (Release Block), rq-requiredObligation02 (Explicit Routing)

## Backward Compatibility
All new fields are optional. Existing contracts without `requiredCritical` parse unchanged. Existing `follow_ups` path remains advisory with medium priority. No breaking changes to report ingestion or gate completion flows.