# Executive Summary

Implemented durable ADV ops/enabler follow-up traceability.

## What changed

- Added typed ops follow-up state to changes: child `ops_followup` profiles, parent `ops_followup_links`, source provenance, relationship, status, evidence, and release-handoff metadata.
- Added workflow signals/reducers/projections for seeding follow-up profiles, linking parent/child changes, and appending operational evidence.
- Added `adv_followup_promote` to create linked ops follow-up ADV changes from typed report/agenda/manual provenance without title matching or agenda-text authority.
- Added `adv_ops_evidence_add` to append lightweight operational evidence and update follow-up status.
- Added compact readback to `adv_change_show`, `adv_change_list`, and `adv_wip_state` so agents can discover active linked ops work structurally.
- Added release enforcement and archive/reporting support: blocking links block release; non-blocking release-first obligations survive through explicit handoff/open-obligation reporting.
- Updated specs/docs/schema artifacts and tests for provenance, promotion, evidence, release handoff, WIP visibility, and backward compatibility.

## Verification

- `bin/oc-test targeted -- src/subagent-reports-spec-assets.test.ts src/validator/clarify-readiness.e2e.test.ts` passed.
- `bin/oc-test full` passed.
- `pnpm run check` passed.
- `pnpm run build` passed.
- Independent acceptance reviewer verdict: READY, 0 blocking findings, 0 nonblocking findings; reviewer targeted 68 tests passed.

## Remaining concerns

None known.