## Cross-Project Origin

This change was created as a follow-up from **opencode-model-routing**.

| Field | Value |
|-------|-------|
| Source project | opencode-model-routing |
| Source path | `/home/jon/dev/opencode-model-routing` |

> **Note:** The originating project should be consulted for context on why this change is needed.


## Proposal: Orchestrator Operational Delegation

Add a durable, spec-backed "operational delegation" best-practice that complements (does not replace) the existing task-level Context-Shed routing.

### Scope boundary (what stays vs sheds)

Primary `adv` KEEPS inline (authority, never delegated):
- gate transitions and `adv_gate_complete`
- task-graph mutation (add/update/cancel/checkpoint/reclassify)
- checkpoint / archive / sign-off authority
- scope-drift, contract-compromise, safety, release decisions
- user-facing synthesis at checkpoints and final reports

Primary `adv` SHEDS sooner (operational, context+cost isolation):
| Trigger | Worker |
|---|---|
| >5 file reads/searches expected | `explore` |
| repo structure / dependency map / same-pattern scan | `explore` or `adv-tron` |
| DB/log/status/usage audit | `general` |
| **GitHub CI / check-run / status investigation** | `general` |
| repeated verify/test bursts | `general` |
| code edits after task scope known | `adv-engineer` |
| frontend/component edits | `adv-designer` |
| docs/source research first-pass | `general`; `adv-researcher` when sourced architecture authority needed |

### Surface placement (respect existing spec law)
Advance deliberately keeps `adv.md` Context-Optimal Execution **prose-only** (`rq-contextShed02`; drift tests forbid table pipes there) and puts routing **tables** on `ADV_INSTRUCTIONS.md` / `adv-apply.md`.

This proposal honors that split:
1. `adv.md` — add operational-delegation criteria as **prose bullets** (no table), including the CI/check trigger and the "don't run a second recon/shell/test/CI-check cycle on the orchestrator before delegating" rule.
2. `ADV_INSTRUCTIONS.md` / `adv-apply.md` — add the trigger **table** above (tables are spec-allowed there), framed as orchestrator-session operational routing, distinct from the per-task Step 4.5 table.
3. `adv-atc.md` — mirror the same prose (shares `adv` behavior minus `question`).

### Spec + tests
- New requirement `rq-orchestratorOpsDelegation01` in `advance-meta`: defines the authority boundary + operational triggers, with scenarios and drift assertions.
- Keep `rq-contextShed01` (task-level 4.5) and `rq-contextShed02` (prose-only + P23 diff-scan) intact; new requirement is additive and consistent.
- Drift tests: assert `adv.md` carries operational-delegation prose tokens (still no table pipes in that section), and the table-surfaces carry the operational trigger table including the GitHub-CI token.

### Explicitly out of scope
- OMR / model-routing config (local toolbox concern; downstream of this).
- Runtime enforcement — consistent with existing self-enforced sub-agent policy, this stays instruction/spec-level.
- Changing the task-level 4.5 routing semantics.

### Why this shape is the long-term-correct one
The local stopgap (a routing table pasted into `adv.md`) violates `rq-contextShed02` and the drift suite. The durable form is prose in `adv.md` + table on the table-surfaces + a governing spec requirement — exactly how Advance already models the task-level context-shed split.