## Cross-Project Origin

This change was created as a follow-up from **pokeedge-web**.

| Field | Value |
|-------|-------|
| Source project | pokeedge-web |
| Source path | `/home/jon/dev/pokeedge-web` |
| Source change | fixPokedexFirstLoadSprite |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Proposal

## Intent
Restore `adv_followup_promote` to the canonical ADV tool surface so orchestrators can create typed linked ops follow-ups before recording production run evidence.

## Root Cause Analysis

### Observed behavior
`adv_ops_run_upsert` returns `NO_OPS_FOLLOWUP_PROFILE` for a delivery change with an approved production ops task. `adv_tool_catalog` omits `adv_followup_promote`, and `adv_tool_invoke` returns `TOOL_NOT_FOUND` for that tool.

### Causal path
1. `adv_ops_run_upsert` correctly requires an existing child `ops_followup` profile.
2. `adv_followup_promote` is the source-owned mechanism that creates the child change, seeds that profile, and links it to the delivery change.
3. Commit `dc461d3a` removed `followupTools` from `createToolMap`, `PUBLIC_TOOL_GROUPS`, and `TOOL_ROLE_POLICY` during Epic/backlog/change unification.
4. The follow-up implementation, tests, command contracts, and durable workflow law remained and still require this path.
5. The removal therefore made valid production ops plans impossible to execute without prohibited direct state mutation.

### Root cause
A broad tool-surface subtraction removed an independent ops-follow-up capability with the retired Epic/backlog tools, without a replacement profile-seeding path or a regression guard.

## Scope
- Restore `followupTools` in the runtime registry and canonical public group list.
- Restore orchestrator role policy for `adv_followup_promote`.
- Add deterministic registration, catalog, role, and invoke-path regression coverage.
- Regenerate derived manifests only if the role-policy generator requires changes.

## User Outcomes
- An orchestrator can discover and invoke `adv_followup_promote`.
- An approved production ops task can create a typed child profile and then use `adv_ops_run_upsert`.
- No direct ADV state edit or alternate profile-seeding path is needed.

## Spec-Law Impact
No spec law update required. Existing workflow law already requires `adv_followup_promote`; this change restores implementation conformance.

## Avoidances
- Do not let `adv_ops_run_upsert` create self-referential profiles.
- Do not bypass child-link provenance.
- Do not restore retired Epic or backlog tools.
- Do not change follow-up semantics beyond runtime registration.