Epic membership cannot be established through any working route, and the route
that appears to work reports success for a write that never happened.

## Observed (pokeedge, 2026-08-20)

`adv_change_create` with create-time Epic seeding (`epic_id` + `entry_id` +
`epic_title` + `epic_order`) returns a success payload carrying a fully
populated `epic_membership` block including a `linked_at` timestamp. The Epic is
never modified. Re-reading it via `adv_change_list({filter:{kind:"epic"}})`
shows `total_entries: 0`, `entries: []`, `version: 0`, and `updated_at` equal to
`created_at`.

Callers cannot distinguish a real link from a phantom one.

## Downstream damage in one project

Three of six Epics in pokeedge are corrupt, all consistent with a caller seeing
success, seeing no entry, then either retrying or moving on:

- `Establish provider identity integrity` — 0 entries, 3 orphaned changes, each
  claiming successful membership.
- `Customer lifecycle email` — 3 entries at orders 0/1/2, all titled
  `Enable welcome email sweep in production`. Orders 0 and 1 are near-identical
  duplicates; order 2 is malformed (`success_hint` degraded to the bare string
  `account-email`). The Epic narrative describes only two intended entries.
- `Deepen architecture edges` — entries e1,e2,e3,e5,e6,e7,e8. e4 is absent
  despite explicit sequencing in the narrative, with its stated precondition
  (e3) already archived.

## No recovery route exists

Structural edits on the change facade (`link_change`, `unlink_change`,
`reorder_entries`) are rejected at preflight for missing an artifact field.
Supplying an artifact field then fails with `Change not found`. The host
`adv_epic_*` tools were retired from the registry. Three attempts produced zero
side effects.

`bin/adv reconcile` does not help: its Epic recovery action only reconstructs a
*missing* Epic owner from orphaned child fragments. These Epics exist with zero
entries, which is not a detected residue class.

## Scope of exposure

Every Epic in every ADV-enabled project created through the create-time seed
path carries this risk. Membership is untrustworthy project-wide, and the
subsystem has no self-repair path.
