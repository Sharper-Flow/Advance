# Research Pack: Change Contract Traceability

- Target: structural traceability for ADV change contracts across proposal, discovery, prep, review, and archive
- Mode: scoped
- Created: 2026-05-08
- Updated: 2026-05-08
- GitHub issue: https://github.com/Sharper-Flow/Advance/issues/99
- Status: Active brainstorm / pre-proposal research
- Linked ADV change: `addStructuralChangeContract`

## Purpose & Scope

Collect research, hypotheses, risks, and design options for making ADV prove that delivered work satisfies the original or formally-amended change contract. This pack is intentionally pre-proposal: it documents options and evidence before turning the idea into an ADV change. It does not select a final schema, mutate ADV state, or define implementation tasks.

Core thesis: review should answer **“Does delivered work satisfy the original/amended contract?”** Archive should answer **“Was that satisfaction proven, accepted, and safely finalized?”**

## Current State

### What ADV already does well

- ADV has a 7-gate lifecycle with explicit human checkpoints at proposal, agreement, acceptance, and archive sign-off.
- `/adv-proposal` confirms problem framing and success criteria.
- `/adv-discover` produces `agreement.md` and asks the user to approve objectives, constraints, avoidances, and acceptance criteria.
- `/adv-prep` creates task graph and freezes `metadata.tdd_intent`.
- `/adv-review` requires requirement traceability, emits `REVIEW_FINDINGS`, builds an acceptance summary from `agreement.md`, and asks user whether delivered work satisfies the agreement.
- `/adv-harden` and `/adv-archive` enforce production readiness, strict validation, spec deltas, and git finalization.

### Current structural gap

ADV currently relies too much on prose continuity for contract satisfaction:

- Proposal/problem/agreement details can drift unless perfectly carried forward.
- Acceptance criteria are summarized in review, but not represented as a typed, complete matrix with one row per contract obligation.
- Constraints, “don’ts,” and out-of-scope boundaries are checked by agent judgment, not durable machine-readable coverage.
- Archive validates gates/tasks/spec conformance, but does not structurally verify that review covered every original or amended contract obligation.
- `adv_change_validate` currently loads proposal text and spec context; contract-level traceability is not a first-class validation dimension.

### Local seams identified

Implementation surfaces to investigate further:

| Area | Likely files | Notes |
|---|---|---|
| Artifact schemas | `plugin/src/types/changes.ts`, `plugin/src/temporal/contracts.ts` | Add contract metadata without violating Temporal workflow safety. |
| Task schema | `plugin/src/types/tasks.ts`, `plugin/src/tools/task.ts` | Add/validate contract refs for tasks. |
| Validation | `plugin/src/validator/completeness.ts`, `plugin/src/validator/validator.ts`, `plugin/src/tools/change.ts` | Extend `adv_change_validate` or introduce `adv_contract_validate`. |
| Gate completion | `plugin/src/tools/gate.ts`, `plugin/src/types/gates.ts` | Consider artifact hashes / contract snapshot at gate completion. |
| Review workflow | `.opencode/command/adv-review.md`, `docs/checklists/review-checklist.md` | Require Contract Traceability Matrix before acceptance sign-off. |
| Archive workflow | `.opencode/command/adv-archive.md`, `plugin/src/archive/*` | Verify matrix/evidence exists; do not redo review. |
| Re-entry | `adv_change_reenter`, workflow state | Contract amendments must reset downstream proof obligations. |

Known gotchas:

- Workflow state is signal/query only; no `defineUpdate` reintroduction.
- Workflow bundle can only import workflow-safe modules.
- `ArtifactMetadata.contentHash` exists but is optional and not enough alone.
- Re-entry currently preserves artifacts; contract invalidation semantics must be explicit.
- Avoid turning ADV into heavyweight enterprise ALM. Structural proof should serve agent reliability, not bureaucracy.

## LBP / Reference Comparison

### Requirements traceability

Requirements traceability tracks a requirement’s life from origin through development, verification, deployment, and refinement. Common benefits: coverage analysis, change impact analysis, status analysis, knowledge persistence, and test optimization. Traceability matrices map identifiers across layers — requirements, design, tasks, tests, evidence — and expose gaps where a row or column has no relationship.

Applicability to ADV:

- Strong fit: ADV already has artifact layers that map naturally to traceability layers.
- Strong fit: Agent workflows need durable context; traceability counters context loss.
- Caution: classic RTM tools can become compliance busywork. ADV should use sparse, high-signal traceability only.

### BDD / Cucumber

Cucumber describes BDD as closing the gap between business and technical people by using concrete examples, then documenting examples in a form that can be automated, then implementing behavior with tests. It frames the lifecycle as Discovery → Formulation → Automation.

Applicability to ADV:

- Discovery aligns with `/adv-discover`.
- Formulation aligns with converting objectives/AC/constraints into stable contract IDs.
- Automation aligns with TDD evidence and review matrix evidence.
- Caution: not every ADV contract row should become a Cucumber scenario. Some rows are constraints or avoidances, better verified by static checks, review evidence, or negative assertions.

### GitHub Spec Kit

Spec Kit emphasizes product scenarios and predictable outcomes rather than “vibe coding.” Its templates require prioritized, independently-testable user stories, acceptance scenarios, measurable success criteria, assumptions, a plan, research, contracts, and tasks grouped by story. Tasks carry story labels for traceability.

Later ecosystem signals around Spec Kit emphasize custom presets/extensions: teams can adapt templates for organizational standards, compliance traceability, health diagnostics, Jira integration, and V-model style test traceability. The important pattern is not the exact file layout; it is that AI coding workflows are moving toward generated-but-reviewable specifications with deterministic downstream planning artifacts.

Applicability to ADV:

- Strong signal: modern AI dev tools are moving toward explicit specs, scenario slicing, independent tests, and task-to-story traceability.
- ADV can learn from story/task refs while keeping its stronger gate model and archive/release governance.
- Spec Kit’s required `FR-*` and `SC-*` identifiers support our instinct that stable IDs matter.

### BMAD Method

BMAD presents structured workflows, specialized agents, complete lifecycle coverage, and scale-adaptive planning. It positions AI as expert collaborators that guide structured process instead of doing unsupervised average work.

Additional relevant BMAD patterns:

- Git-versioned artifacts act as a continuous compliance ledger.
- Human-authored guardrails are committed before AI generation.
- Requirements tracing maps acceptance criteria to tests/evidence and reports coverage gaps.
- Risk tiers help scale rigor instead of imposing the same process on every change.

Applicability to ADV:

- Confirms direction: structured AI workflows are succeeding by preserving lifecycle state and adapting rigor to change size.
- ADV should stay scale-adaptive: small docs change should not need a huge matrix; high-risk feature should.
- Specialized review/harden dimensions fit ADV’s current sub-agent model.

## Competitors & Alternatives

| System / Pattern | What it does | Relevance to ADV | Source |
|---|---|---|---|
| Requirements Traceability Matrix | Maps requirement IDs to downstream artifacts/tests/evidence. | Core structural model for contract coverage. | `https://en.wikipedia.org/wiki/Traceability_matrix`, `https://en.wikipedia.org/wiki/Requirements_traceability` |
| BDD / Cucumber | Uses concrete examples as shared, automatable specifications. | Good model for AC rows and red/green evidence, but not all constraints. | `https://cucumber.io/docs/bdd/` |
| GitHub Spec Kit | Uses specs, plans, research, contracts, and tasks grouped by user story. | Shows AI tooling moving toward stable specs + task refs. | `https://github.com/github/spec-kit` |
| BMAD Method | Structured multi-agent lifecycle; scale-adaptive process. | Confirms value of careful planning without one-size bureaucracy. | `https://github.com/bmad-code-org/BMAD-METHOD` |
| Enterprise ALM tools (DOORS/Jama/Polarion class) | Deep lifecycle traceability, compliance reports, impact analysis. | Useful cautionary model; too heavy for ADV unless reduced to essentials. | Future research needed. |

## Emerging Patterns

### 1. AI coding is becoming spec-first

Spec Kit and BMAD both frame AI coding as a structured workflow problem. The successful direction appears to be:

1. clarify intent;
2. capture stable spec artifacts;
3. plan from those artifacts;
4. execute with task-level references;
5. verify with evidence.

ADV already does this culturally; contract traceability would make it structural.

### 2. Traceability must be bidirectional

Useful traceability needs both directions:

- Forward: every contract item maps to tasks/tests/review evidence.
- Backward: every significant task maps back to why it exists.

This matters for ADV because backward traceability can catch scope creep, while forward traceability catches missed obligations.

### 3. Negative obligations need first-class treatment

“Do not do X” and “out of scope” are not ordinary acceptance criteria. They need careful modeling:

- `DONT-*`: prohibited behavior or implementation path; verification may be negative tests, static search, review evidence, or design proof.
- `OOS-*`: boundary; verification is mostly “no task/code/spec delta crossed boundary” plus drift/re-entry checks.
- `C-*`: constraint; verification can be test, config, review, or docs evidence.

If negative obligations are forced into normal tests, agents may create brittle or fake tests. Better: each row has an evidence type.

### 4. Static sign-off is weaker than living proof

Classic sign-off creates an approved snapshot. That snapshot is useful, but brittle when requirements evolve during implementation. ADV’s re-entry model is better suited to a living-contract approach: once a contract changes materially, downstream gates and proof artifacts should be explicitly invalidated or amended.

### 5. Separate matrices rot unless generated from workflow state

Research across RTM/ALM patterns suggests standalone traceability documents are valuable for visibility but risky as source of truth. For ADV, the durable matrix should be generated from typed workflow state and evidence records; markdown reports should be projections.

## Applicability to This Repo

### Proposed principle

ADV should add a **contract spine**, not a heavyweight compliance subsystem.

The spine should be:

- **Stable**: IDs survive from discovery through archive.
- **Typed**: AC/constraint/don’t/out-of-scope are distinct.
- **Sparse**: rows only for user-visible or gate-critical obligations.
- **Evidence-backed**: each required row has concrete verification evidence.
- **Gate-aware**: contract changes route through amendment/re-entry.
- **Agent-friendly**: enough structure to prevent context loss, not so much that every task becomes clerical.

### Discovery agreement candidate

This change should aim for:

1. typed contract items as the source of truth;
2. markdown summaries as human-facing projections;
3. task refs for backward traceability;
4. review matrix for forward traceability;
5. archive validation that checks proof completeness, not product semantics from scratch;
6. re-entry/amendment semantics that invalidate stale proof;
7. scale-adaptive rigor levels so ADV stays lightweight.

### Candidate contract model

```ts
type ContractItemKind =
  | "problem"
  | "success_criterion"
  | "acceptance_criterion"
  | "constraint"
  | "avoidance"
  | "out_of_scope";

type ContractItem = {
  id: string;              // P1, SC1, AC1, C1, DONT1, OOS1
  kind: ContractItemKind;
  text: string;
  sourceArtifact: "problem-statement" | "proposal" | "agreement" | "design";
  sourceHash?: string;
  verificationRequired: boolean;
  evidencePolicy: "test" | "review" | "static_check" | "design_proof" | "not_applicable";
  status?: "draft" | "approved" | "amended" | "superseded";
};
```

### Candidate task linkage

```ts
type TaskContractRefs = {
  implements?: string[]; // AC/SC mostly
  verifies?: string[];   // AC/C/DONT where task adds tests or checks
  respects?: string[];   // C/DONT/OOS constraints the task must preserve
};
```

Rules to consider:

- Every implementation task should reference at least one `implements` or `respects` item.
- Every `AC-*` should have at least one implementing task and one evidence row.
- Every `DONT-*` / `OOS-*` should have a review/static evidence row, not necessarily an implementation task.
- Mechanical cleanup tasks can be `contract_refs.not_applicable` with reason.

### Candidate review matrix

| ID | Kind | Obligation | Evidence policy | Status | Evidence |
|---|---|---|---|---|---|
| AC1 | acceptance | User can X | test | pass/fail | `adv_run_test ...`, file refs |
| C1 | constraint | No direct state file reads | static_check | pass/fail | grep/lgrep/test evidence |
| DONT1 | avoidance | Do not add separate DB | review | respected/violated | changed files + dependency scan |
| OOS1 | out_of_scope | Do not redesign UI | review | respected/violated | touched files summary |

Archive should verify matrix completeness, not re-adjudicate each row.

### Candidate archive invariant

Archive blocks if:

- approved contract missing;
- review matrix missing;
- any required contract item lacks review status;
- any required item is `fail` / `violated` / `unknown`;
- any item was amended without gate re-entry or explicit amendment audit;
- task refs contain unknown contract IDs;
- tasks implement unapproved contract IDs.

Archive does not block on:

- out-of-scope debt documented as pre-existing and not touched;
- optional advisory contract items explicitly marked `verificationRequired: false`;
- nits or suggestions rejected with evidence.

## Design Axes to Explore

### A. Storage location

| Option | Pros | Cons |
|---|---|---|
| Markdown only in `agreement.md` | Human-readable; low schema churn | Hard to validate; prone to parsing fragility |
| Typed metadata only in `change.json` / workflow state | Strong validation; easy archive checks | Less visible to user; harder to hand-edit |
| Hybrid: markdown table + typed metadata | Best human + machine path | Need sync/invalidation rules |

Current leaning: hybrid, with typed state as source of truth after agreement approval and markdown as user-facing projection.

### B. Validator shape

| Option | Pros | Cons |
|---|---|---|
| Extend `adv_change_validate` | One validation path; archive already calls it | Risk overloading tool; contract-specific output may get noisy |
| New `adv_contract_validate` | Clear purpose; richer matrix diagnostics | More tool surface; archive/review must call both |
| Internal validator only | Smaller public API | Less inspectable for users/agents |

Current leaning: start as internal validator used by `adv_change_validate`, expose top-level contract section in output. Add separate tool only if diagnostics become too large.

### C. Rigor levels

Not every change needs same traceability burden. Candidate levels:

| Level | Trigger | Requirements |
|---|---|---|
| `minimal` | docs/trivial config | approved contract summary + acceptance note |
| `standard` | normal feature/bug | IDs + task refs + review matrix |
| `strict` | security, cross-repo, architecture, external conformance | IDs + task refs + review matrix + evidence policies + archive hard-blocks |

Open question: should rigor level be agent-selected during discovery or derived from change type/risk signals?

Possible answer: agent-selected with validator guardrails. Discovery proposes `minimal`, `standard`, or `strict`; prep/review validators can escalate when risk signals demand it (security, cross-repo, architecture, external conformance, public API, many touched files).

### D. Contract amendment

Possible amendment states:

- `superseded`: old item replaced by new item; downstream gates reset as needed.
- `waived`: item no longer required; requires user approval and reason.
- `deferred`: not satisfied now; only allowed if reclassified out of scope via user-approved re-entry/amendment.
- `clarified`: text improved without changing intent; no gate reset required.

Need avoid “accepted debt” loophole for in-scope AC failures.

## Open Questions for Research

1. How should ADV distinguish “clarification” from “contract change” structurally?
2. Should contract IDs be minted at proposal or discovery? Proposal has early problem framing; discovery has approved agreement.
3. Should `problem-statement.md` remain source for `P-*` / `SC-*`, or should discovery absorb all source obligations into `agreement.md`?
4. What evidence policies are enough for `DONT-*` and `OOS-*` without encouraging fake tests?
5. How should contract refs interact with existing `deltas.scenarios` and spec requirement IDs (`rq-*`)?
6. How should re-entry invalidate prior review matrices and task refs?
7. Should contract traceability be archived into `.adv/archive/.../CONTRACT_TRACEABILITY.md`?
8. How do we keep acceptance prompt concise while still showing full matrix evidence?
9. How should cross-project/cross-repo contract IDs be represented?
10. Can conformance verdicts reuse contract IDs, or should contract IDs map to spec `rq-*` IDs only after archive?

## Preliminary Implementation Hypotheses

These are hypotheses, not decisions:

1. Add `contract` typed field to change state and disk projection.
2. Generate contract during `/adv-discover` from approved agreement, absorbing proposal/problem obligations.
3. Require prep to attach `contract_refs` to tasks.
4. Extend `adv_change_validate strict:true` with contract coverage checks.
5. Require `/adv-review` to emit/persist review verification matrix.
6. Require `/adv-archive` to block on missing/failing matrix before spec deltas.
7. Add archive artifact `CONTRACT_TRACEABILITY.md` for durable audit.
8. Keep markdown display terse; full detail lives in tool output/artifact.

## Discovery Findings Round 2

- **Conflict scan:** no direct duplicate active change found. Related pending agenda items exist around `adv_change_validate`, declarative Zod refinements, imported assumptions, and must-not proposal sections; these are complementary and should be cited during design.
- **Local architecture:** `ChangeWorkflowState` already carries artifacts/documents and `acceptanceCriteria`; task metadata exists but no `contract_refs`; review verification exists but no contract matrix; archive copies sibling artifacts but emits no dedicated contract traceability artifact.
- **Best fit:** optional typed `contract` field on change state, plus optional `contract_refs` on tasks, plus review matrix stored under the same contract object.
- **Least disruptive validator path:** extend `adv_change_validate` with contract coverage checks when `change.contract` exists; introduce separate `adv_contract_validate` only if output becomes too large.
- **Biggest risk:** re-entry invalidation. If downstream gates reset, contract proof must become stale or amended explicitly.
- **Second risk:** trivial-change friction. Rigor levels need real effect, not just labels.
- **Third risk:** negative obligation evidence. `DONT-*` and `OOS-*` should accept static/review/design evidence; do not force executable tests for everything.

## Anti-Goals

- Do not require enterprise ALM ceremony for trivial changes.
- Do not make agents hand-maintain brittle markdown tables as the sole source of truth.
- Do not allow `accepted debt` to waive in-scope failed acceptance criteria.
- Do not force every constraint/avoidance into executable tests.
- Do not create a second, competing spec system separate from ADV specs.
- Do not bypass gate re-entry for substantive contract amendments.

## Sources

- GitHub issue: `https://github.com/Sharper-Flow/Advance/issues/99`
- Requirements traceability summary: `https://en.wikipedia.org/wiki/Requirements_traceability`
- Traceability matrix summary: `https://en.wikipedia.org/wiki/Traceability_matrix`
- Cucumber BDD docs: `https://cucumber.io/docs/bdd/`
- GitHub Spec Kit README: `https://github.com/github/spec-kit`
- GitHub Spec Kit templates: `https://raw.githubusercontent.com/github/spec-kit/main/templates/spec-template.md`, `https://raw.githubusercontent.com/github/spec-kit/main/templates/plan-template.md`, `https://raw.githubusercontent.com/github/spec-kit/main/templates/tasks-template.md`
- BMAD Method README: `https://github.com/bmad-code-org/BMAD-METHOD`
- Local ADV docs: `docs/adv-gates.md`, `.opencode/command/adv-review.md`, `.opencode/command/adv-archive.md`, `docs/checklists/review-checklist.md`, `docs/checklists/harden-checklist.md`
- External research pass: BMAD trace requirements / control-manifest patterns; Spec Kit presets/extensions and V-model traceability direction; enterprise ALM bidirectional traceability and impact-analysis patterns; Cucumber dynamic traceability/sign-off caution.
