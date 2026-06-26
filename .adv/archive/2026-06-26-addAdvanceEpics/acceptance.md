# Acceptance

Reviewed at: 2026-06-25T23:52:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| C1 | constraint | Epic membership is optional. | pass | ChangeSchema keeps epic_membership optional single object; non-Epic change behavior preserved. Covered by src/types/epics.test.ts and final targeted/full suites. |
| C2 | constraint | Epic order is advisory in v1 and must not become a hidden hard gate. | pass | Epic order remains display/recommendation-only; tests and docs assert advisory behavior. No gate/task blocking path added for earlier incomplete entries. |
| C3 | constraint | Shell entries require title plus rough success/AC hint, not full ADV agreement upfront. | pass | Shell entry schema/tools require title and success_hint only; promotion creates full change later. Covered by types/tools Epic tests and spec assets. |
| C4 | constraint | Correctness-critical Epic state must be structural and typed, not prose-only roadmap text. | pass | Epics implemented as typed Zod schemas, signal payload schemas, pure state reducers, per-Epic Temporal workflow, store APIs, and tests. `pnpm run check` and full suite passed. |
| C5 | constraint | Hot-path status/change-list output must remain bounded; full Epic context should be explicit or context-specific. | pass | Default Epic/change surfaces expose compact membership/member_status and bounded history/next-work rows; full context remains explicit. Reviewer READY with no bounded-output findings. |
| C6 | constraint | Temporal/search-attribute constraints must be respected, including current custom search-attribute limits. | pass | AdvEpicId implemented as single Keyword search attribute; workflow-safe import and Temporal boundary tests passed; targeted visibility/store/workflow tests and `pnpm run check` passed. |
| C7 | constraint | Multi-project Epics must respect product config and target-path trust rules; no silent mutation of untrusted projects. | pass | Cross-project Epic membership routes child projection mutation through target-path store/trust checks; reviewer praised target_path mutation trust gate and Temporal queue serviceability. Targeted Epic tools tests and check passed. |
| C8 | constraint | Retroactive linking must not rewrite historical `fast_follow_of` lineage; Epic membership is separate initiative membership, not parentage history. | pass | Retroactive link/move/unlink uses separate epic_membership projection and audit payloads; fast_follow_of is not used or rewritten. Asset/spec tests lock this requirement. |
| DONT1 | avoidance | Do not make every change belong to an Epic. | respected | Review found optional membership preserved; non-Epic changes remain valid and unchanged in rendering when no epic_membership exists. |
| DONT2 | avoidance | Do not add Jira-like assignments, estimates, boards, sprints, or ownership workflows. | respected | Spec/assets reject Jira-like fields; reviewer found no assignments, estimates, boards, sprints, or ownership workflow clone. |
| DONT3 | avoidance | Do not clone GitHub Projects. | respected | Implementation adds ADV-native Epics and compact next-work/status context only; no GitHub Projects clone semantics added. |
| DONT4 | avoidance | Do not hard-block later Epic entries solely because earlier entries are incomplete. | respected | Order remains advisory in docs/spec/tests and no hard gate/task blockers were introduced for later entries. |
| DONT5 | avoidance | Do not require shell entries to complete full ADV proposal/discovery before promotion. | respected | Shell entries remain lightweight title + success_hint rows and can be promoted later; no proposal/discovery prerequisite for shell existence. |
| DONT6 | avoidance | Do not manually edit ADV state to link or reparent changes. | respected | All membership changes go through typed MCP/store/workflow signal paths: link, unlink, move, repair. No manual ADV state edit path introduced. |
| DONT7 | avoidance | Do not overload `fast_follow_of` for retroactive Epic membership. | respected | Retrofit membership uses epic_membership and project-aware Epic entries; fast_follow_of remains creation lineage only. |
| DONT8 | avoidance | Do not require separate duplicate Epics per repository when one product Epic should own the initiative. | respected | Product Epic scope can include entries from multiple repo/project IDs in one owner Epic; no duplicate repo-local Epic required for one product initiative. |

