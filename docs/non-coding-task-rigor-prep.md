# Research Pack: Non-Coding Task Rigor

Target: large non-coding ADV work such as market research, design improvement, competitive research, writing, and analysis deliverables  
Mode: scoped  
Created: 2026-06-21  
Updated: 2026-06-21

## Purpose & Scope

This pack assesses whether ADV gives large non-coding work the same structure, durability, evidence, review, and checkpoint rigor as coding changes. Scope includes command routing, gate semantics, task modeling, research utilities, and external agent-workflow references. Deliberate non-scope: implementing a new command, creating ADV state, changing specs, or deciding the final UX.

Fallback note: `lgrep_search_semantic` timed out twice during target resolution. Local evidence was refreshed through `lgrep_search_text`, direct reads of repo-owned command/spec/docs files, and ADV read-only tools.

## Current State

### Security

- Severity: MEDIUM
  - Evidence: `.opencode/command/adv-comp-scan.md:26-53` embeds a fallback competitive-research protocol; `skills/adv-comp-research/SKILL.md:70-76` contains the stronger confidentiality/robots constraints.
  - Impact: if the skill is unavailable, the embedded fallback lacks equally explicit redaction/no-confidential-data constraints for public research.
  - Recommendation: copy minimal confidentiality/redaction constraints into the command fallback, or make a shared research-safety block mandatory for all research commands.
  - Follow-up: `/adv-proposal add research safety fallback`

### Reliability

- Severity: HIGH
  - Evidence: `.opencode/command/adv-improve.md:21-27` and `.opencode/command/adv-improve.md:90-100` explicitly avoid ADV state and persist only `docs/*-prep.md`; `README.md:217-219` says durable ADV recovery lives in Temporal-backed workflows.
  - Impact: large non-coding deliverables can be rigorous in prose but still lack durable gates, task ledgers, crash-safe resume, acceptance review, and archive lifecycle.
  - Recommendation: define a tracked path for large non-coding deliverables that uses proposal → discovery/agreement → design/research plan → planning → execution → acceptance → archive, with non-code evidence policies.
  - Follow-up: `/adv-proposal add non-coding workflow rigor`

### Testing

- Severity: MEDIUM
  - Evidence: `docs/checklists/improve-checklist.md:5` says improve checklist enforcement is document-only; `plugin/src/adv-improve-assets.test.ts:4-12` verifies command shape and boundaries, not output quality or non-coding task lifecycle invariants.
  - Impact: current tests prevent shallow command drift but do not structurally guarantee non-coding work gets tracked criteria, evidence matrices, or review proof.
  - Recommendation: add asset/spec tests for non-code task routing and contract evidence policies before implementing behavior.
  - Follow-up: `/adv-task add non-code workflow asset tests`

### Observability

- Severity: MEDIUM
  - Evidence: `.opencode/command/adv-comp-scan.md:66-73` records only count + one-line summary in project metadata; `.opencode/command/adv-improve.md:23-25` writes a research pack but no ADV state.
  - Impact: research/writing outcomes are harder to inspect from ADV status, gate status, task ledgers, and acceptance matrices than coding tasks.
  - Recommendation: when work is large and deliverable-bearing, store status/evidence in change/task surfaces; keep docs packs as citeable artifacts, not the only durable record.
  - Follow-up: `/adv-proposal make research deliverables status-visible`

### Developer Experience

- Severity: MEDIUM
  - Evidence: `.opencode/agents/adv.md:151-166` intent routing covers idea/problem/start change/small tracked change/status/roadmap/archive/pre-change investigation, but does not name large non-coding deliverables; `.opencode/command/adv-task.md:6-13` is explicitly a fast-track for small well-understood durable changes.
  - Impact: agents may route large research/writing work to utility commands or ad hoc chat instead of creating tracked change state.
  - Recommendation: add routing guidance: large non-coding deliverable = tracked ADV change unless explicitly one-off/read-only.
  - Follow-up: `/adv-proposal clarify non-coding task routing`

### Code Quality

- Severity: MEDIUM
  - Evidence: `plugin/src/types/tasks.ts:135-142` defines task types including `docs`, `research`, `approval`, and `verification`; `plugin/src/tools/task.ts:923-950` exposes `adv_task_add` fields but no explicit `type` argument.
  - Impact: model supports non-code task classes, but task creation cannot directly set them through the public tool surface; agents fall back to metadata/title/TDD intent.
  - Recommendation: either expose task type structurally or document why metadata remains authoritative; avoid relying on title heuristics for non-code correctness.
  - Follow-up: `/adv-audit task type surface`

### Dedup / Overlap

- Active overlap: `tightenAdvScopeDiscipline` covers reverse-traceability, bounded tasks, and Statement-of-Work signoff; it does not directly solve large non-coding workflow routing or non-code evidence policies.
- Agenda: pending agenda output was truncated; visible slice had no exact non-coding-workflow item. Treat dedup as partial.

## LBP / Reference Comparison

| Area | Current | Reference | Classification | Correction |
|---|---|---|---|---|
| Durable multi-step execution | ADV core changes use seven gates and Temporal-backed state (`docs/adv-gates.md:1-19`, `README.md:217-219`); utilities like improve avoid ADV state (`.opencode/command/adv-improve.md:21-27`). | Temporal TypeScript docs expose workflow signals/queries and human-approval interruption/resume patterns (`/temporalio/sdk-typescript`, `contrib/openai-agents/README.md`). | DRIFTED | Large non-coding deliverables should enter tracked workflow state; read-only utility scans can remain docs-only. Greenfield: one `work_kind` / evidence policy axis, not separate ad hoc command families. |
| Human checkpoints | Core ADV has proposal/agreement/design/planning/acceptance/release gates (`docs/adv-gates.md:48-88`). | Temporal approval workflow example pauses, accepts signal, resumes with saved state (`/temporalio/sdk-typescript`). | SOUND for core; DRIFTED for utility research | Reuse existing checkpoints for large non-code deliverables; do not invent a parallel approval model. |
| Structural contracts | ADV has ChangeContract and review matrix readiness (`plugin/src/temporal/gate-readiness.ts:827-861`). Zod is used for schema validation (`plugin/package.json:35-43`). | Zod v4 supports schema-defined input/output contracts and type inference (`/websites/zod_dev_v4`). | SOUND foundation; DRIFTED surface | Add non-code evidence policy schemas: `source_citation`, `rubric_review`, `stakeholder_acceptance`, `deliverable_artifact`, `not_applicable`. |
| Task taxonomy | Task schema includes `research` and `docs` (`plugin/src/types/tasks.ts:135-142`), but `adv_task_add` lacks `type` (`plugin/src/tools/task.ts:923-950`). | Structural correctness rule prefers typed fields over heuristics (`.opencode/agents/adv.md:115-120`). | ANTI-PATTERN | Expose/validate task type or remove dormant schema field; do not rely on task title for non-code semantics. |
| Research pipelines | `adv-improve` has a strong research-pack schema (`docs/checklists/improve-checklist.md:98-126`) but no gates. | 2026 market-research-agent references emphasize staged pipelines, structured outputs, citations, critic/review passes, and human review. | DRIFTED | Treat major research/writing as staged deliverable workflow with acceptance criteria and review rubric, not a single report command. |

## Competitors & Alternatives

1. LangGraph
   - Difference: explicit graph-based control flow, typed state/checkpointing, human-in-the-loop primitives.
   - Relevance: useful reference for representing non-code work as explicit stages, but ADV already has Temporal-backed outer workflow.
   - Source: https://www.digitalapplied.com/blog/ai-workflow-orchestration-platforms-comparison

2. CrewAI
   - Difference: role-based multi-agent teams and flows; strong rapid-prototyping ergonomics for research/writing teams.
   - Relevance: suggests specialist roles for research/review/writer, but ADV should keep orchestrator authority and typed reports.
   - Source: https://calmops.com/ai/ai-workflow-tools-comparison-complete-guide/

3. n8n / visual AI workflow automation
   - Difference: visual, integration-heavy workflow builder with AI automation and self-hosting.
   - Relevance: demonstrates non-coding workflows as first-class automations; lower fit for ADV's spec-law and codebase-local gate model.
   - Source: https://calmops.com/ai/ai-workflow-tools-comparison-complete-guide/

## Emerging Patterns

1. Durable execution for long-running agents
   - Maturity signal: multiple 2026 sources identify Temporal/Inngest/Cloudflare-style durable execution as production infrastructure for long-running, HITL agent work.
   - Why noteworthy: exactly matches ADV's crash-safe change model; gap is applying it uniformly to large non-code deliverables.
   - Sources: https://www.inngest.com/blog/durable-execution-key-to-harnessing-ai-agents, https://agentmarketcap.ai/blog/2026/04/07/durable-execution-temporal-inngest-cloudflare-workflows-agent-amnesia

2. Structured research pipelines with cited outputs and critic passes
   - Maturity signal: 2026 market-research-agent examples describe phased collection → extraction → synthesis → review with strict JSON/Markdown artifacts and citations.
   - Why noteworthy: maps directly to ADV discovery/design/review gates without requiring code changes as the deliverable.
   - Sources: https://agentiveaiagents.com/market-research-strategy-template/, https://www.olostep.com/blog/agentic-market-research-olostep

## Applicability to This Repo

- High: add routing rule in `.opencode/agents/adv.md` and `ADV_INSTRUCTIONS.md` so large non-coding work starts as a tracked change, not a utility-only scan.
- High: extend specs around `advance-workflow`, `adv-prep`, and `tdd-contract` to define non-code evidence policies and accepted verification modes.
- Medium: expose `TaskTypeSchema` through `adv_task_add` or replace it with validated metadata; current public tool surface does not structurally set task type.
- Medium: keep `adv-improve` read-only; it remains useful for pre-change research packs. Its output should feed `/adv-proposal`, not become the workflow for large deliverables.
- Low / reject: adopting external orchestration frameworks. ADV already uses Temporal; importing LangGraph/CrewAI/n8n would add conceptual weight without solving routing and evidence-policy gaps.

## Open Questions for Research

- Should the tracked path be a new command (`/adv-work` or `/adv-deliverable`) or a routing clarification that sends large non-code work through existing `/adv-proposal`?
- What minimum evidence policies are needed for research/writing deliverables: citation matrix, source audit, reviewer rubric, stakeholder acceptance, or artifact diff?
- Should `TaskTypeSchema` become an explicit `adv_task_add` argument, or should `metadata.task_type` be the stable public API?
- How should archive handle non-code outputs: specs/wisdom only, docs artifact preservation, or release-note style executive summary?
- Which parts overlap with `tightenAdvScopeDiscipline` and should wait for that change to land first?

## Sources

- `.opencode/agents/adv.md:151-166`
- `.opencode/command/adv-apply.md:10-12`, `.opencode/command/adv-apply.md:65-76`
- `.opencode/command/adv-comp-scan.md:26-73`
- `.opencode/command/adv-improve.md:21-27`, `.opencode/command/adv-improve.md:90-110`
- `.opencode/command/adv-task.md:6-13`
- `docs/adv-gates.md:1-19`, `docs/adv-gates.md:40-44`, `docs/adv-gates.md:48-88`
- `docs/checklists/improve-checklist.md:5`, `docs/checklists/improve-checklist.md:98-126`
- `plugin/src/adv-improve-assets.test.ts:4-12`
- `plugin/src/temporal/gate-readiness.ts:827-861`
- `plugin/src/tools/task.ts:923-950`
- `plugin/src/types/tasks.ts:135-142`
- `README.md:155-195`, `README.md:217-223`
- Context7: `/temporalio/sdk-typescript`
- Context7: `/websites/zod_dev_v4`
- https://www.digitalapplied.com/blog/ai-workflow-orchestration-platforms-comparison
- https://calmops.com/ai/ai-workflow-tools-comparison-complete-guide/
- https://wetheflywheel.com/en/guides/best-agent-orchestration-frameworks-2026/
- https://agentmarketcap.ai/blog/2026/04/07/durable-execution-temporal-inngest-cloudflare-workflows-agent-amnesia
- https://www.inngest.com/blog/durable-execution-key-to-harnessing-ai-agents
- https://agentiveaiagents.com/market-research-strategy-template/
- https://www.olostep.com/blog/agentic-market-research-olostep
