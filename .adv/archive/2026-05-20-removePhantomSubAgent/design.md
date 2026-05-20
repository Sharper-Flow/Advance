# Design

## Architecture Overview

Two parallel tracks, both touching only `.opencode/`, `plugin/src/*assets.test.ts`, and existing documentation surfaces:

1. **Phantom-routing cleanup** — Replace `librarian`/`mechanic`/`prioritizer` references in active spawnable guidance with shipped equivalents or inline patterns.
2. **`adv-reviewer` introduction** — Add a new `.opencode/agents/adv-reviewer.md` bundled-global subagent; route prep pre-flight, review, and harden to it; lock the contract with asset tests.

No plugin code changes, no new MCP tools, no new gates, no Temporal/workflow changes. The change is asset edits + asset tests + agent prompt.

```
.opencode/agents/
├── adv-engineer.md      (existing — pattern source)
├── adv-researcher.md    (existing — absorbs `librarian` research role)
├── adv-tron.md          (existing — repo-local, unchanged)
├── adv-reviewer.md      (NEW — bundled global, mirrors adv-engineer shape)
├── adv.md               (edit: Sub-Agent Policy table)
├── plan.md              (edit: subagent + research tool tables)
└── build.md             (no change — overlay-managed)

.opencode/command/
├── adv-research.md      (edit: librarian flow → adv-researcher single-agent)
├── adv-review.md        (edit: spawn adv-reviewer; existing explore agents stay)
├── adv-harden.md        (edit: spawn adv-reviewer; existing explore agents stay)
└── adv-prep.md          (edit: optional adv-reviewer pre-flight advisory)

ADV_INSTRUCTIONS.md      (edit: subagent classification)
SETUP.md                 (edit: agent table — replace librarian/mechanic rows)

plugin/src/
├── phantom-subagent-roster.test.ts   (NEW asset test)
├── adv-reviewer-asset.test.ts        (NEW asset test)
└── deploy-local-exclusion.test.ts    (NEW asset test; or extend existing)
```

## Key Decisions

### 1. `adv-reviewer` tool boundary mirrors `adv-engineer`

`adv-reviewer.md` frontmatter is structurally identical to `adv-engineer.md` with one delta: review-specific ADV reads + bounded evidence tools are enabled; everything else stays blocked.

| Tool family | adv-engineer | adv-reviewer | Why |
|---|---|---|---|
| Repo writes (`write`, `edit`, `morph_edit`, `patch`, `bash`) | true | true | scoped remediation in review/harden |
| Local code intelligence (`lgrep_*`, `read`, `glob`, `grep`) | true | true | analysis |
| Web research (`context7_*`, `exa_*`, `searchcode_*`, `firecrawl_*`, `webfetch`) | true | true | verifying findings against authoritative sources |
| ADV reads (`adv_change_show`, `adv_task_list`, `adv_spec`, `adv_status`, `adv_gate_status`, `adv_wisdom_list`) | true | true | context loading |
| Evidence (`adv_run_test`) | true | true | verification |
| Wisdom emission (`adv_wisdom_add`) | true | true | candidate learnings |
| ADV orchestration mutations (`adv_change_*` mutators, `adv_task_add/update/cancel/reclassify_tdd/checkpoint`, `adv_gate_complete`, `adv_change_archive/reenter/close`) | false | false | main agent owns orchestration |
| Worktree mutations (`worktree_*`, `adv_worktree_*` mutators) | false | false | orchestrator territory |
| Nested delegation (`task`) | false | false | depth ≤ 1 |
| Agenda mutations | false | false | orchestrator territory |

This shape is the structural enforcement of agreement AC4, AC6, C5, and DONT2.

### 1a. Why a separate `adv-reviewer` agent (not absorbed into `adv-engineer`, not read-only)

Validator's caution flagged two viable alternatives. Rationale for the chosen separation:

**Alternative (a) — phase-aware `adv-engineer`:** Merge reviewer behavior into `adv-engineer` with a `phase` field on `ENGINEER_REPORT` to switch framing. Rejected for three reasons: (1) the system prompt for an analyst+remediator is materially different from a scope-locked executor — scope-lock semantics, drift detection thresholds, report shape, and prune-first emphasis diverge; a single agent forced to switch behavior on a prompt field hides this contract; (2) asset tests can pin a single agent's invariants cleanly, but pinning two distinct behavioral contracts inside one agent file creates fragile coupled tests; (3) when a downstream change wants to harden one role independently (e.g., tighten reviewer's drift triggers without touching apply behavior), separation makes the change local.

**Alternative (b) — read-only reviewer + `adv-engineer` for fixes:** Reviewer analyzes; orchestrator spawns `adv-engineer` for each fix batch. Rejected for two reasons: (1) extra orchestration round-trips per fix batch cost context — the user's matrix-evaluation guidance explicitly favors keeping context out of the main agent; making the orchestrator the bus between two agents reverses that intent; (2) review/harden auto-remediation per existing command contracts (`adv-review.md` Phase 5, `adv-harden.md` Phase 3) is already "fix all blockers/issues, no partial fix mode" — a write-capable reviewer fits that contract directly. For complex multi-file fixes during review remediation, the reviewer MAY still spawn `adv-engineer` — except sub-agents cannot nest. So in practice, complex remediation in review remains the orchestrator's job; the reviewer handles scoped local fixes within its own session.

Net: separation gives one agent per behavioral contract, with clean asset tests and minimum context bouncing.

### 2. Phantom routing replacement table

| Phantom name | Active surfaces | Replacement | Why |
|---|---|---|---|
| `librarian` | `adv.md` Sub-Agent table; `plan.md` subagent table + Web Research; `adv-research.md` Phase 3 + librarian prompt; `adv-review.md` Phase 5 research routing; `SETUP.md` agent table; `ADV_INSTRUCTIONS.md` | `adv-researcher` | Already has Context7, Exa, webfetch, Firecrawl, searchcode, lgrep, arxiv (verified in `.opencode/agents/adv-researcher.md` lines 24-32) |
| `mechanic` | `adv.md` Sub-Agent table; `adv.md` Failure Handling table; `SETUP.md` agent table | Inline by main ADV agent | No shipped substitute. Diagnostics are contextual to the failure that produced them. The main orchestrator handles or surfaces to user. |
| `prioritizer` | `adv.md` Sub-Agent table | `skill("prioritizer")` inline | Already documented in `adv.md` (line 285) as a skill alternative; only the spawnable row contradicts this. |

### 3. `adv-reviewer` system prompt structure (REVIEWER_REPORT shape)

The agent must return a fenced `REVIEWER_REPORT` JSON block at exit, structurally similar to `adv-engineer`'s `ENGINEER_REPORT`:

```
REVIEWER_REPORT:
{
  "agent": "adv-reviewer",
  "phase": "prep" | "review" | "harden",
  "verdict": "READY" | "NEEDS_WORK" | "BLOCKED" | "CONFLICT",
  "blocking_findings": [
    { "id": "...", "label": "blocker|issue", "file": "...", "line": N, "what": "...", "why": "...", "fix": "..." }
  ],
  "nonblocking_findings": [
    { "id": "...", "label": "suggestion|nit|question|praise", "file": "...", "line": N, "what": "...", "why": "..." }
  ],
  "changes_made": [
    { "file": "...", "summary": "...", "verification": "..." }
  ],
  "wisdom_candidates": [
    { "type": "pattern|success|failure|gotcha|convention", "content": "..." }
  ],
  "verification": {
    "tests_run": ["..."],
    "results": "pass|fail|n/a",
    "evidence": "..."
  },
  "scope_drift": null | {
    "items": ["AC#", "C#", "DONT#", "OOS#"],
    "details": "...",
    "recommendation": "stop_and_report"
  },
  "risks": ["..."],
  "required_main_agent_actions": ["..."],
  "workdir_used": "/absolute/path"
}
END_REVIEWER_REPORT
```

Phase value reflects which command spawned the reviewer. `verdict: CONFLICT` only fires when `scope_drift` is non-null. Main agent reads the report and decides next action (resume prep with findings, route fixes back through review/harden, escalate scope drift to user).

### 3a. Scope-discovery escalation contract (rq-scopeDiscoveryProtocol01)

Per validator caution: `adv-reviewer` is a subagent and cannot issue Tier A inline approval prompts. The orchestrator (`adv`) owns the inline-approval surface. The `REVIEWER_REPORT` fields that wire scope-discovery escalation:

| Field | Role in escalation |
|---|---|
| `verdict: "CONFLICT"` | Signals scope drift detected; main agent must pause before continuing |
| `scope_drift.items` | Cites the exact agreement IDs (`AC#`, `C#`, `DONT#`, `OOS#`) that would be violated |
| `scope_drift.details` | Concrete description of the drift |
| `scope_drift.recommendation: "stop_and_report"` | Explicit instruction to the orchestrator |
| `required_main_agent_actions` | Enumerates the orchestrator's next steps, e.g. `["Present scope-drift findings to user via Tier A inline approval per docs/scope-discovery-protocol.md", "On approve: reenter from earliest affected gate", "On split: create fast-follow change"]` |

System prompt for `adv-reviewer` includes the explicit instruction: "When a finding would change agreement.md (any AC/C/DONT/OOS item), set verdict=CONFLICT, populate scope_drift, do NOT apply the change, and list the orchestrator's required actions in `required_main_agent_actions`. Per `docs/scope-discovery-protocol.md`, only the orchestrator can issue Tier A inline approval prompts."

### 4. Asset test architecture

Three new test files, each ~30-80 lines following the pattern of `plugin/src/scope-discovery-assets.test.ts`:

**`plugin/src/phantom-subagent-roster.test.ts`** — Forbids active spawnable references to phantom names in active guidance surfaces. Uses targeted regex, not blanket grep:

```ts
const FORBIDDEN_PATTERNS = [
  { pattern: /subagent_type:\s*["']librarian["']/i, name: "librarian spawn" },
  { pattern: /subagent_type:\s*["']mechanic["']/i, name: "mechanic spawn" },
  { pattern: /subagent_type:\s*["']prioritizer["']/i, name: "prioritizer spawn" },
  { pattern: /\bspawn\s+`?librarian`?/i, name: "spawn librarian prose" },
  // ... matched targeted prose patterns for sub-agent table rows
];
const ACTIVE_SURFACES = [
  "ADV_INSTRUCTIONS.md",
  "SETUP.md",
  ".opencode/agents/adv.md",
  ".opencode/agents/plan.md",
  ".opencode/command/adv-research.md",
  ".opencode/command/adv-review.md",
  ".opencode/command/adv-harden.md",
  ".opencode/command/adv-prep.md",
  ".opencode/command/adv-task.md",
];
// CHANGELOG.md, docs/archive/, .adv/specs/_archive/ explicitly excluded
```

**`plugin/src/adv-reviewer-asset.test.ts`** — Verifies:
- `.opencode/agents/adv-reviewer.md` exists
- Frontmatter has `mode: subagent`, `hidden: true`, and read/write/edit/bash/morph_edit allowed
- Frontmatter explicitly sets `task: false` (no nested delegation)
- Frontmatter explicitly sets ADV orchestration mutators to false: `adv_change_create`, `adv_change_update`, `adv_change_archive`, `adv_change_reenter`, `adv_change_close`, `adv_task_add`, `adv_task_update`, `adv_task_cancel`, `adv_task_reclassify_tdd`, `adv_task_checkpoint`, `adv_gate_complete`, `adv_agenda_*`, `worktree_*`
- Body contains anchor strings: "REVIEWER_REPORT", "scope_drift", "no nested delegation", "no ADV orchestration mutations", "required_main_agent_actions"

**`plugin/src/deploy-local-exclusion.test.ts`** — Verifies `scripts/deploy-local.sh` exclusion lists are correct:
- `REPO_LOCAL_ONLY` contains `adv-tron.md` and not `adv-reviewer.md`
- `SHARED_OVERLAY_ONLY` does not contain `adv-reviewer.md`
- Pattern: read deploy-local.sh, grep the literal `REPO_LOCAL_ONLY=` and `SHARED_OVERLAY_ONLY=` assignments, assert membership

### 5. Prep delegation split — minimal scope, principled

Per user's matrix-evaluation guidance (agreement Agent Decision #6), the prep gate's high-context responsibilities that are pure read-only analysis (cross-cutting concerns scan, codebase impact scan, cross-spec consistency scan) are good candidates for `adv-reviewer`. But `/adv-prep` currently runs fully inline with no sub-agents and remains the sole pre-implementation task creator (`rq-prep-out1`).

**Decision for this change:** Add an _optional advisory paragraph_ to `.opencode/command/adv-prep.md` indicating prep MAY spawn `adv-reviewer` for read-only pre-flight (cross-cutting/cross-spec/codebase-impact scans) when context is heavy, with prep retaining task creation/sequencing/gate completion authority. Do NOT force prep to spawn the reviewer. Reason: minimum viable scope ships the agent and unblocks review/harden routing; prep workflow refinements can land in a follow-up change once `adv-reviewer` has real prep usage data.

This honors:
- AC7 ("routes independent analysis to `adv-reviewer` where appropriate")
- C5 ("Prep remains the orchestration owner")
- Agreement Agent Decision #6 ("Design phase should finalize... Principle: delegate context-heavy read-only analysis; keep orchestration authority inline")

### 6. Deploy path — no script changes

Adding `.opencode/agents/adv-reviewer.md` is sufficient. `scripts/deploy-local.sh` lines 934-957 iterate `.opencode/agents/*.md` and copy any not in `REPO_LOCAL_ONLY` or `SHARED_OVERLAY_ONLY`. `adv-reviewer.md` matches neither list, so it is auto-deployed by the existing loop. The asset test in Decision 4 pins this contract: any future regression that adds `adv-reviewer.md` to either exclusion list breaks the test.

### 7. Documentation surfaces — `SETUP.md` table rewrite

`SETUP.md` lines 281-285 currently list `librarian` and `mechanic` as external shared agents that "fall back to inline execution or generic explore." Rewrite:

| Agent (after) | Used by | What it does |
|---|---|---|
| `explore` | `/adv-review`, `/adv-harden`, `/adv-audit`, `/adv-slop-scan`, `/adv-refactor` | Codebase navigation, finding usages |
| `adv-researcher` | `/adv-discover`, `/adv-design`, `/adv-research`, `/adv-task`, `/adv-review` | Documentation, API, and code-example research (Context7, Exa, searchcode, webfetch) |
| `general` | `/adv-review` (cross-cutting), overlay-managed | Multi-step verification |
| `adv-engineer` | `/adv-apply` code-writing, `/adv-review` remediation | Structured ENGINEER_REPORT payload |
| `adv-reviewer` | `/adv-prep` pre-flight (optional), `/adv-review`, `/adv-harden` | Independent review/harden analysis with scoped remediation, structured REVIEWER_REPORT |

`mechanic` and `librarian` rows removed. The MCP-server table beneath (lines 295-302) is unchanged.

## ADR Drafts

3-criteria rubric check (hard-to-reverse, surprising-without-context, real-tradeoff):

| Decision | Hard-to-reverse? | Surprising? | Real tradeoff? | ADR? |
|---|---|---|---|---|
| Tool boundary mirroring `adv-engineer` | No (asset file) | No (mirrors existing) | No (clarification-driven) | No |
| `librarian`→`adv-researcher` redirect | No | No | No | No |
| `adv-reviewer` write capability vs read-only | No | Slight | Yes — addressed in Decision 1a | No (rationale in Decision 1a) |
| Asset-test enforcement of forbidden routing | No | No (matches scope-discovery-assets pattern) | No | No |
| Deploy via existing loop, no script edits | No | No (consistent w/ other bundled agents) | No | No |

None of the decisions meet all three criteria. No ADR drafts produced.

## Implementation Strategy

Sequenced for low-risk TDD:

1. **Failing asset tests first** (RED):
   - Write `phantom-subagent-roster.test.ts`, `adv-reviewer-asset.test.ts`, `deploy-local-exclusion.test.ts`. All fail because `adv-reviewer.md` doesn't exist yet and phantom routing still present.

2. **Create `.opencode/agents/adv-reviewer.md`** (GREEN for adv-reviewer-asset.test):
   - Frontmatter mirrors `adv-engineer.md` with deltas per Decision 1.
   - Body defines: scope lock, working-directory lock, iteration loop, prune-first heuristic, scope drift detection (`stop_and_report`), REVIEWER_REPORT schema with required fields, scope-discovery escalation contract per Decision 3a.

3. **Update `.opencode/agents/adv.md`** Sub-Agent Policy table (GREEN for phantom-roster.test relevant rows):
   - Remove `librarian`, `mechanic`, `prioritizer` rows.
   - Add `adv-reviewer` row.
   - Update Failure Handling table: `MCP/tool failure` → "inline diagnose; surface to user when context-bound" (no `mechanic` spawn).
   - Update Skill alternatives block: keep existing `skill("prioritizer")` reference (already there).

4. **Update `.opencode/agents/plan.md`** subagent + Web Research tables:
   - Replace `librarian` references with `adv-researcher` in subagent table (lines 191-196).
   - Web Research Tools table (lines 178-184): "Delegate to `adv-researcher`" replaces "Delegate to `librarian`".

5. **Update `.opencode/command/adv-research.md`** Phase 3:
   - Remove the "librarian + adv-researcher in parallel" orchestrator pattern.
   - Single-agent flow with `adv-researcher` doing docs + architecture + examples (already has the tools).
   - Remove standalone Librarian Prompt block.
   - Keep Explore Fallback Template unchanged.

6. **Update `.opencode/command/adv-review.md`**:
   - Phase 5 fix delegation: "spawn `adv-engineer` or `adv-reviewer`" — `adv-reviewer` for review-style findings with scoped fixes, `adv-engineer` for primary implementation work.
   - Sub-agent prompts: replace "librarian/independent validator" with "`adv-researcher` (independent validator)".

7. **Update `.opencode/command/adv-harden.md`**:
   - Sub-agent dimensions remain on `explore` (these are scoped scans); add note: complex remediation fixes route to `adv-reviewer` (write capable) or `adv-engineer`.

8. **Update `.opencode/command/adv-prep.md`**:
   - Add a short advisory paragraph in Phase 1 or Phase 2: "When pre-flight readiness analysis would shed context (cross-cutting concern scan, codebase impact scan, cross-spec consistency scan), `/adv-prep` MAY spawn `adv-reviewer` for read-only analysis and incorporate the REVIEWER_REPORT findings into the task graph. `/adv-prep` retains sole authority over task creation, sequencing, and planning gate completion."

9. **Update `ADV_INSTRUCTIONS.md`**:
   - Sub-agent classification table (around line 880) — no roster mention by name there; check for any inline references in HITL section.
   - Add note in Sub-Agent / Skill classification: `adv-reviewer` is a command-supporting agent used by `/adv-prep`, `/adv-review`, `/adv-harden`.

10. **Update `SETUP.md`** agent table per Decision 7.

11. **Run verification** (final GREEN):
    - `cd plugin && pnpm test -- phantom-subagent-roster adv-reviewer-asset deploy-local-exclusion` — three new files pass
    - `cd plugin && pnpm run check` — typecheck/lint/format clean
    - `cd plugin && pnpm test` — full suite green (no regressions in existing asset tests)
    - `scripts/deploy-local.sh --dry-run --diff` — confirms `adv-reviewer.md` would deploy to global
    - `scripts/deploy-local.sh --fix` — actual deploy

12. **Archive notes record OpenCode restart requirement** (AC11):
    - "Restart OpenCode session after deploy to pick up the new `adv-reviewer` agent. Agent loading is config-time only."

## Affected Components

Single-table summary for prep input:

| Component | Kind | Change |
|---|---|---|
| `.opencode/agents/adv-reviewer.md` | new asset | Create — bundled global subagent |
| `.opencode/agents/adv.md` | edit | Sub-Agent table + Failure Handling table |
| `.opencode/agents/plan.md` | edit | Subagent + Web Research tables |
| `.opencode/command/adv-research.md` | edit | Phase 3 librarian → adv-researcher |
| `.opencode/command/adv-review.md` | edit | Phase 5 sub-agent routing, library research wording |
| `.opencode/command/adv-harden.md` | edit | Remediation routing note |
| `.opencode/command/adv-prep.md` | edit | Optional reviewer pre-flight advisory |
| `ADV_INSTRUCTIONS.md` | edit | Sub-agent classification |
| `SETUP.md` | edit | Agent table |
| `plugin/src/phantom-subagent-roster.test.ts` | new test | Forbidden routing patterns |
| `plugin/src/adv-reviewer-asset.test.ts` | new test | Reviewer frontmatter + body anchors |
| `plugin/src/deploy-local-exclusion.test.ts` | new test | Deploy exclusion list lock |
| `scripts/deploy-local.sh` | unchanged | Existing loop deploys new agent automatically |
| `plugin/src/manifest.ts` | unchanged | Command-to-gate manifest unaffected |

## LBP Analysis

**Why this is the long-term-best approach:**

1. **Structural over heuristic (P33)** — Asset tests enumerate forbidden routing patterns and required agent assets. The same pattern (`scope-discovery-assets.test.ts`) already protects sibling concerns. Prose-only warnings have demonstrated regression risk: `adv-review-methodology`/`adv-harden-methodology` skills were deleted with prose-only stale-reference notes that still appear in `ADV_INSTRUCTIONS.md` line 886 today.

2. **Locality of behavior (P04)** — `adv-reviewer.md` lives alongside `adv-engineer.md` and `adv-researcher.md`. Deploy contract stays in `scripts/deploy-local.sh`. Tests live in `plugin/src/`. No cross-cutting refactor.

3. **Boring/proven pattern** — `adv-reviewer` is a structural copy of `adv-engineer` with read/evidence additions. No new architecture, no new MCP, no new gate.

4. **Reversible** — Pure asset additions/edits. Rollback = `git revert` + redeploy.

5. **Single source of truth respected** — Agent tool boundary lives in the agent's frontmatter (one place). Roster appears in `adv.md` Sub-Agent Policy table (one place). Tests pin both.

**Alternatives considered and rejected:**

| Alternative | Rejected because |
|---|---|
| Prose-only warnings against phantom names | P33 violation; demonstrated regression risk for stale-skill case |
| New "reviewer" gate or workflow | Adds state; prep/review/harden already exist; user's matrix evaluation does not require new gates |
| Reviewer as a skill (read-only) | Skills can't run tests or edit files; review/harden auto-remediation requires write capability |
| Reviewer with ADV mutation authority (gates/tasks/changes) | User rejected at clarification (Access Boundary) — keeps orchestration in main agent |
| Phase-aware adv-engineer (merge reviewer behavior) | Rejected per Decision 1a — couples two distinct behavioral contracts in one file, breaks asset-test pinning |
| Read-only adv-reviewer + adv-engineer for fixes | Rejected per Decision 1a — extra round-trips reverse the context-shedding intent of the matrix evaluation |
| Force prep to delegate cross-cutting analysis to adv-reviewer | Increases change scope; defer to follow-up after real usage data |

## Risks / Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Asset test regex too aggressive — fails on legitimate doc mentions | Medium | Medium (test fragility) | Use targeted patterns: `subagent_type:\s*["']<name>["']`, explicit "spawn `<name>`" prose; exclude `CHANGELOG.md`, `docs/archive/`, `.adv/specs/_archive/` |
| `adv-reviewer` system prompt drifts from `adv-engineer` and loses scope lock | Low | Medium | Asset test pins required body anchor strings: "REVIEWER_REPORT", "scope_drift", "no nested delegation", "no ADV orchestration mutations", "required_main_agent_actions" |
| `adv-prep` advisory paragraph spawns unwanted complexity if misread by agents | Low | Low | Use explicit MAY (not MUST); preserve sole-task-creator language; commit message records minimal-scope intent |
| Restart requirement forgotten | Medium | Low | AC11 + archive notes (per `/adv-archive` template); CHANGELOG entry includes "Restart OpenCode" note |
| Phantom-routing test passes locally but fails in CI due to file-path differences | Low | Medium | Tests use `resolve(__dirname, "../..")` pattern, same as `scope-discovery-assets.test.ts` (already CI-green) |
| `mechanic` references remain in `adv.md` Failure Handling table after edit | Medium | Low | Failure Handling table is one of the test surfaces; phantom-roster test catches |
| Researcher absorbing librarian's role exceeds researcher's "validation" scope description | Low | Low | `adv-researcher.md` description already includes "research" — no edit needed; system prompt already covers docs/web/code-examples per its tool grants |
| Cross-project users with their own phantom routing get broken | N/A | N/A | Out of scope per agreement DONT1; this change covers this repo only |
| Scope drift detected by adv-reviewer mid-remediation but orchestrator misses it | Low | High | Per Decision 3a: `verdict: CONFLICT` + non-null `scope_drift` + `required_main_agent_actions` are all mandatory when drift detected; orchestrator policy: any `verdict: CONFLICT` triggers Tier A inline approval prompt per `docs/scope-discovery-protocol.md` |

## Design Validation

**Validator:** adv-researcher (Phase 3.5)
**Verdict:** CAUTION
**Findings addressed:**

| Caution | Resolution |
|---|---|
| "Document rationale for separate adv-reviewer over phase-aware adv-engineer or read-only reviewer" | Added Decision 1a explicitly addressing both alternatives. |
| "Document required_main_agent_actions as the scope-discovery escalation mechanism" | Added Decision 3a with explicit mapping of REVIEWER_REPORT fields to rq-scopeDiscoveryProtocol01 compliance. |

**Informational findings (no design change required):**
- Phantom routing removal scope is correct and complete (18 refs across the surfaces in scope).
- Three asset test files is the right granularity (independent concerns).
- No spec-law conflict: rq-prep-out1 (sole task creator), sub-agent nesting depth, and rq-R3v13wR1 (adversarial review) all preserved.
- adv-tron and adv-researcher correctly preserved per DONT4.
- Alternative (c) — keeping phantoms as documented inline patterns — would not solve the routing ambiguity and is correctly rejected.

Validator recommendation honored: both clarifications added inline. No structural design change required.
