# Research Pack: ADV Resume Freshness & Supersession Check

- **Target:** Resume path for ADV changes — `resume {id}`, `continue {id}`, `complete {id}`, session-reactivation, `/adv-apply` mid-execution resume
- **Mode:** scoped (concept: resume-time supersession/freshness detection)
- **Created:** 2026-07-21
- **Updated:** 2026-07-21

## Purpose & Scope

**In scope:** the default ADV resume flow as defined in `.opencode/agents/adv.md` Step 1–3 (Load State → Gate Machine), the `buildChangeContextSnapshot` formatter (`plugin/src/utils/context-snapshot.ts`), and the existing supersession-adjacent commands (`/adv-coordinate`, `/adv-cleanup`, `/adv-refactor`, `adv_change_create` duplicate-title rejection).

**Deliberate non-scope:** creation-time duplicate detection (already covered by `advance-workflow/spec.json:5509`), mid-execution task-level `scope_drift` (covered in schemas/task.schema.json during review/harden), Epic-level coordination (covered by `/adv-coordinate`). This pack is about the **per-change resume** path specifically.

**User request triggering this pack:** "whenever resuming an adv change, agent should check what has changed about the codebase or is changing (other active/in-progress/new changes) in order to clarify, align, and make sure it doesnt create something that is already superseded".

## Current State

### Reliability
- **HIGH** — `.opencode/agents/adv.md:189-200` (Step 1 intent table + Step 2 Load State): resume loads only the target change via `adv_change_show` + `adv_gate_status` + `_contextSnapshot`. No detection of codebase drift since `lastActivityAt`. *Impact: agent proceeds against stale API/code surface; tasks reference paths that may no longer exist.*
- **HIGH** — No sibling-overlap check on resume. Active changes touching the same capability/file set are invisible to a resumed change. *Impact: two parallel resumed changes can rebuild each other's work.*
- **MEDIUM** — No archived-since check. Work shipped in archives between the target change's `lastActivityAt` and now is invisible. *Impact: rebuilding already-shipped scope.*
- **MEDIUM** — `adv_change_create` rejects duplicate titles only at creation time (`.adv/specs/advance-workflow/spec.json:5509`). A change that becomes a duplicate later (because another active change narrowed onto the same scope) is never re-flagged on resume.

### Observability
- **MEDIUM** — `plugin/src/utils/context-snapshot.ts:172-204` `buildChangeContextSnapshot` emits gates/tasks/wisdom/epic but no `Drift:` / `Siblings:` / `Shipped-since:` line. The Context Snapshot box (spec: `chat-output-display/spec.json:41`) is emitted on session resume — currently carries zero freshness signal.

### Developer Experience
- **HIGH** — User must remember to manually invoke `/adv-coordinate` (Epic-scoped), `/adv-cleanup` (batch), or `/adv-refactor` (batch/single) before resuming. None fires automatically on the default resume path. Each is also heavier than what a single-change resume needs.

### Testing
- **MEDIUM** — No regression coverage exists for "resume emits supersession/freshness warning". Adding the feature safely requires tests for: stale change with archived duplicate; stale change with active sibling touching same capability; fresh change (no warning); `freshness_limited` fallback when repo evidence missing.

### Code Quality
- **LOW** — Supersession logic is scattered across at least four surfaces: title-match in `adv_change_create`, `superseded` close-reason in `adv_change_close`, bucket logic in `/adv-cleanup` (skills/adv-cleanup/SKILL.md:40), and overlap audit in `/adv-coordinate`. No unified resume-time synthesizer.

## LBP / Reference Comparison

| Area | Current | Reference | Class | Correction |
|---|---|---|---|---|
| Resume context | `.opencode/agents/adv.md:199-200` loads target state only | Conductor explicit-context-modes (accumulate/last_only/explicit); agent-session-resume "without duplicating completed work" | DRIFTED | Add Resume Freshness pre-step before Step 3 Gate Machine |
| Duplicate detection timing | spec.json:5509 — creation-time only | `/adv-cleanup` bucket #1 normalizes across active+archived anytime (skills/adv-cleanup/SKILL.md:40) | DRIFTED | Promote cleanup duplicate detection to resume-time advisory |
| Stale proposal reconciliation | `/adv-refactor` manual invocation (skills/adv-refactor/SKILL.md) | UntitledPhases/Ideate `stale_resume` fixture — deterministic on resume | DRIFTED | Add lightweight stale-resume advisory to default resume path |
| Scope-drift detection | `scope_drift` in `plugin/schemas/task.schema.json` populated during execution/review only | agent-chassis "dispatch-readiness checks" pre-run | DRIFTED | Surface drift signals at resume, not just review |
| Repo freshness audit | `/adv-coordinate` Phase 2-3 (`.opencode/command/adv-coordinate.md:70-113`) — opt-in, Epic-scoped | Same logic needed at per-change resume | SOUND (logic exists, wrong entrypoint) | Reuse Phase 2-3 engine behind a lightweight resume entrypoint |
| Overlap taxonomy | `/adv-coordinate` classifies `repo_backed_fact \| adv_backed_fact \| judgment_call \| freshness_limited` | Same taxonomy fits resume findings | SOUND (reuse directly) | Inherit the four labels verbatim |

### Corrections

**What is wrong (with local paths):**
- `.opencode/agents/adv.md:199-200` Step 2 — no freshness/sibling/archived-since comparison.
- `plugin/src/utils/context-snapshot.ts:23-58` `ContextSnapshotInput` — no freshness-related field.
- `.adv/specs/advance-workflow/spec.json:5509` — duplicate detection fires only on `adv_change_create`.

**What is correct (with source):**
- `/adv-coordinate` already classifies findings into `repo_backed_fact | adv_backed_fact | judgment_call | freshness_limited` (`.opencode/command/adv-coordinate.md:101-108`) — a proven taxonomy to inherit.
- `/adv-cleanup` already normalizes titles across active+archived (skills/adv-cleanup/SKILL.md:40,46-52) — a proven duplicate detector.
- `/adv-refactor` already runs drift scanners (EXACT/METADATA/FUZZY) against current code (skills/adv-refactor/SKILL.md:79-86) — proven drift detection.

**Minimum viable fix:**
1. Add a Resume Freshness pre-step (3–5 tool calls max) to `.opencode/agents/adv.md` Step 2.
2. Add `resumeFreshness?` optional field to `ContextSnapshotInput` in `plugin/src/utils/context-snapshot.ts`.
3. Emit a compact `Freshness:` line in the Context Snapshot box.
4. Use stable finding codes: `resume:freshness_limited`, `resume:sibling_overlap`, `resume:archived_duplicate`, `resume:codebase_drift`.

**Greenfield note:** If ADV were rebuilt today, the natural shape is one `resumeFreshness` field on `buildChangeContextSnapshot` carrying `{ lastActivityAgeMinutes, siblingOverlap[], archivedSince[], codebaseDrift, freshnessLabel }`, computed by a single resolver shared across `/adv-coordinate`, `/adv-cleanup`, `/adv-refactor`, and the default resume path. The current scattered logic is the cost of growing these commands independently.

## Competitors & Alternatives

| Name | Summary | Difference | Maturity | Source | Relevance |
|---|---|---|---|---|---|
| UntitledPhases/Ideate (agentic-sdlc) | Deterministic validator for agentic SDLC workflows with `stale_resume` fixture and stable rule IDs | Validates workflow artifacts (task graph, handoffs, resume packets) without being a runtime; fixture-driven | Early 2026, fixture-driven | https://github.com/UntitledPhases/Ideate | HIGH — closest structural analog; rule-ID pattern directly portable |
| agent-chassis | Turns agent work into durable engineering state with "drift-resistant dispatch-readiness controls" | Agents work from scoped contracts, not chat; dispatch-readiness checks before run | Active 2026 | https://github.com/agent-chassis/agent-chassis | HIGH — drift-resistance framing matches ADV's spec-driven model |
| Microsoft Conductor | Deterministic orchestration with explicit context modes (accumulate/last_only/explicit) | Topology declared, not discovered; per-agent session isolation | Microsoft-supported, May 2026 | https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/ | MEDIUM — context-flow philosophy rather than supersession detection per se |

## Emerging Patterns

1. **Resume-time drift/supersession advisory** — multiple 2026 tools converge on detecting drift *before* resuming rather than after: Ideate (`stale_resume`), hacktivist123/agent-session-resume (DONE/PARTIALLY DONE/NOT DONE classification), CaptainEv1dence/dr-context (runtime drift scanner), agent-chassis (dispatch-readiness). Pattern: a cheap pre-resume scan beats a costly mid-execution correction.
2. **Stable rule IDs for resume findings** — Ideate emits stable codes (`stale_resume`, `ownership_conflict`, `missing_review_evidence`). ADV should mirror with `resume:freshness_limited`, `resume:sibling_overlap`, `resume:archived_duplicate`, `resume:codebase_drift` so findings are machine-classifiable and testable.

Additional signal: agent-session-resume explicitly preserves user deferrals ("skip", "park", "not now") across resume — ADV should consider the same for scope rejections recorded in `/adv-refactor` intent-conflict resolution.

## Applicability to This Repo

**Applies directly:**
- Resume Freshness pre-step fits ADV's existing Step 2 → Step 3 seam in `.opencode/agents/adv.md`. No new gate required; it is a read-only advisory before the Gate Machine proceeds.
- `/adv-coordinate` Phase 2-3 logic is the natural engine to reuse — its `repo_backed_fact | adv_backed_fact | judgment_call | freshness_limited` taxonomy already exists and is spec-backed (`.adv/specs/advance-epics/spec.json:191`).
- Stable finding codes align with P33 (structural-correctness) and existing ADV conventions (`WorktreeIsolationViolation`, `CONTRACT_UNRESOLVED_WARRANT`, etc.).

**Does not apply / out of scope here:**
- Full agentic-sdlc-style artifact validation (task-graph cycle checks, least-privilege handoff, privacy boundary scans) — those are broader than the user's request. Worth a separate `/adv-audit` engagement.
- Conductor-style context-mode selection per agent — ADV's context model is already typed (Context Snapshot vs Ticker vs Cross-Repo Switch); introducing modes would be redundant.

**Local path references for implementation:**
- `plugin/src/utils/context-snapshot.ts:23-58` — `ContextSnapshotInput` interface to extend.
- `plugin/src/utils/context-snapshot.ts:172-204` — `buildChangeContextSnapshot` to thread new field through.
- `plugin/src/utils/context-snapshot.ts:319-446` — `formatContextSnapshot` to render `Freshness:` line within 10-line budget.
- `plugin/src/tools/change.ts:831-849` — `lastActivityAt` / `lastActivityAgeMinutes` already computed for `adv_change_list`; reuse for the resume resolver.
- `.opencode/command/adv-coordinate.md:70-113` — Phase 2-3 freshness + overlap audit logic to extract into a shared resolver.
- `.adv/specs/advance-workflow/spec.json:5509` — creation-time duplicate detection; resume-time advisory should reference this rule.

## Open Questions for Research

1. **Cost ceiling**: how many tool calls is the resume-freshness pre-step allowed to cost before it violates the ADV resume latency budget? Conjecture: 3–5 (one `adv_change_list` for siblings, one `adv_change_list includeArchived:true` filtered by archived-since, one `git log --since <lastActivityAt> --oneline` for codebase drift, optional one `adv_change_show` per sibling if capability overlap is non-trivial). Needs confirmation.
2. **Trigger threshold**: should the pre-step fire on every resume, or only when `lastActivityAgeMinutes` exceeds a band (e.g., >60min)? `/adv-cleanup` uses 7d; `/adv-refactor` uses hot-recency exclusion. Resume is more frequent than cleanup — likely needs a tighter band.
3. **Cross-project resume**: when a change has `target_path` / Epic membership spanning projects, does freshness check need to fan out to each target project? `/adv-coordinate` already paginates `scope: "product"`; resume probably wants a narrower default.
4. **User deferral memory**: if the user dismisses a `resume:sibling_overlap` finding ("yes, I know, proceed"), should ADV remember the dismissal for that sibling pair until the next state transition, or re-raise on every resume? Agent-session-resume preserves deferrals; ADV has no equivalent today.
5. **Mid-execution resume** (`/adv-apply` after a session restart): does the same freshness check apply, or does execution-gate resume have a different cost/benefit profile because tasks already exist and may be partially complete?
6. **Interaction with `parent_change_id` / fast-follow children**: a child change should likely skip the "archived duplicate" check against its own parent. Need to confirm inheritance rules.

## Sources

- `.opencode/agents/adv.md:180-259` — Step 1 intent table + Step 2 Load State + Step 3 Gate Machine
- `plugin/src/utils/context-snapshot.ts:23-58, 172-204, 319-446` — snapshot input, builder, formatter
- `plugin/src/tools/change.ts:831-849` — `lastActivityAt` enrichment
- `.adv/specs/advance-workflow/spec.json:5509` — creation-time duplicate rejection
- `.adv/specs/chat-output-display/spec.json:41` — Context Snapshot emission on session resume
- `.adv/specs/advance-epics/spec.json:191, 380-398` — `/adv-coordinate` freshness law + Epic membership on resume
- `.opencode/command/adv-coordinate.md:70-113` — Phase 2-3 freshness + overlap audit
- `skills/adv-cleanup/SKILL.md:40, 46-52` — duplicate/superseded bucket detection
- `skills/adv-refactor/SKILL.md:79-86` — drift scanner passes
- `.opencode/command/adv-triage.md:107` — change↔change duplicate/supersession remains `/adv-cleanup` ownership
- https://github.com/UntitledPhases/Ideate — agentic-sdlc `stale_resume` validator
- https://github.com/agent-chassis/agent-chassis — drift-resistant dispatch-readiness
- https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/ — Conductor explicit context modes
- https://github.com/hacktivist123/agent-session-resume — DONE/PARTIALLY DONE/NOT DONE classification + deferral preservation
- https://github.com/CaptainEv1dence/dr-context — runtime drift + stale instructions scanner
