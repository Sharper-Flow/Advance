# Executive Summary

## Outcome

ADV now derives a strict, versioned `PhasePlan` from durable workflow state. Current ADV consumers can read it through an opt-in projection while existing directive behavior remains compatible.

## Value

Agents receive one bounded current action with provenance, blockers, and failure-safe diagnostics instead of reconstructing workflow position from prose. Read failures cannot invent a route or mutate a workflow.

## Delivered

- Canonical PhasePlan with six discriminated outcomes and a legacy directive adapter.
- Read-only Temporal query and opt-in `adv_change_show` projection.
- Table-driven parity coverage across gates, terminal/recovery states, mapping drift, and orientation consumers.
- Structural full-machine cutover receipt: immutable build identity, process/session/project inventory, replay validation, rollback-by-disable, and routing-only degradation.
- Credential-free prompt metrics mode for durable baseline recording.

## Verification

- Acceptance reviewer: READY; no scoped fixes required.
- PhasePlan/replay/migration focused suite: 266 passing tests.
- Full suite: 378 files, 5,848 tests passing.
- `pnpm run check` and `pnpm run build` passing.
- Contract review matrix: 29/29 rows passing or respected.

## Release Readiness Summary

- Migration cutover is intentionally inactive until deployed-build identity and complete local project/process/session proof pass.
- After activation, degraded plans stop only plan-dependent routing; Temporal workflows remain running and recoverable.
- External MCP read-surface work remains deferred to Epic entry 4.

## Risks and Follow-Ups

- Operator must deploy the bridge build, restart sessions, then activate the receipt against the deployed plugin root.
- Generated workflow documentation and authoritative `adv_spec` directive-reference discrepancy remains recorded for subsequent spec reconciliation; no unsafe spec-law inference was made.