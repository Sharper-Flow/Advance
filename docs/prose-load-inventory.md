# Prose-Load Inventory

> **Lifecycle:** **POST-COMPRESSION ARCHIVE** (compression complete). No maintenance owner. Durable invariants live in `.adv/specs/advance-meta/spec.json` § rq-proseReduction01–04 and `plugin/src/manifest-doc-drift.test.ts` drift assertions.
>
> Durability lives in spec deltas `rq-proseReduction01`–`rq-proseReduction04`, not this file. This inventory is the audit trail for the compression passes (T2/T3/T4/T5) and the planning input for the asset-test audit (T1.5).

## Purpose

Every prose section across ADV instruction surfaces is classified into one of three enforcement classes:

| Class        | Compression target                                  |
| ------------ | --------------------------------------------------- |
| **full**     | Pointer + constraint table (no paragraph)           |
| **partial**  | Pointer + constraint table + 1-line gap rationale   |
| **inherent** | Structured table/checklist/template (no paragraphs) |

See `docs/command-voice-standard.md § Prose-Load Reduction Rules` for templates and stop condition.

## Scope

In scope:

- `ADV_INSTRUCTIONS.md` (817 lines)
- `docs/command-voice-standard.md` (706 lines, post-T0a)
- `.opencode/agents/adv.md` (371 lines)
- `.opencode/command/adv-*.md` (25 files, ~5,043 lines)
- `skills/*/SKILL.md` (6 files, ~845 lines)

Out of scope (constraints):

- `~/.config/opencode/instructions/*.md` — user-managed
- `plugin/src/index.ts PROVIDER_BEHAVIOR_HINTS` — provider variant patches
- Manifest descriptions — governed by separate drift test

## Classification Granularity

Inventory rows are at H2-section granularity. Within each section, T2/T3/T4/T5 decide paragraph-level compression guided by the assigned class. Critical Protocols (the largest H2 in `ADV_INSTRUCTIONS.md` at 295 lines) is broken out at H3 because its sub-sections span all three classes.

Canonical columns: `| Section | Lines | Class | Code Reference | Gap Rationale | Pass | Status |`

---

## Inventory: ADV_INSTRUCTIONS.md (817 lines)

| Section                                             | Lines | Class    | Code Reference                                                                                                        | Gap Rationale                                                                              | Pass | Status                                                                                                                                                       |
| --------------------------------------------------- | ----- | -------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ## Notation (5–8)                                   | 4     | inherent | —                                                                                                                     | (legend table; already minimal)                                                            | T5   | done                                                                                                                                                         |
| ## Core Decision Rules (9–20)                       | 11    | inherent | —                                                                                                                     | (when/then table; already minimal)                                                         | T5   | done                                                                                                                                                         |
| ## HITL Boundary Model (21–83)                      | 62    | partial  | `plugin/src/tools/gate.ts` `handlePlanningGateCompletion`                                                             | Planning gate machine-enforces userApproved; other gate pauses rely on agent prose         | T4   | done                                                                                                                                                         |
| ## Phase Goals (84–98)                              | 14    | inherent | `plugin/src/manifest.ts` (phaseGoal field)                                                                            | Goals reside in manifest, but agent self-checks via prose                                  | T5   | done                                                                                                                                                         |
| ## Commands (99–145)                                | 46    | inherent | —                                                                                                                     | (reference table — kept as catalog)                                                        | T5   | done                                                                                                                                                         |
| ## Command Boundaries (146–160)                     | 14    | inherent | —                                                                                                                     | (boundary table — already in target form)                                                  | T5   | done                                                                                                                                                         |
| ## Status Markers (161–186)                         | 25    | partial  | `plugin/src/utils/banner.ts`, `plugin/src/events/`                                                                    | Format partially encoded; agent decides when to emit                                       | T4   | done                                                                                                                                                         |
| ### Context Snapshot (177–186)                      | 9     | full     | `plugin/src/utils/context-snapshot.ts`                                                                                | —                                                                                          | T2   | already-compliant (9 lines, pointer + bullet summary)                                                                                                        |
| ### ADV State Access (189–207)                      | 18    | full     | (× direct-read forbidden — runtime guard absent; prose-only enforcement)                                              | NOTE: re-classify to `partial` — table mapping is enforceable but read-prevention is prose | T4   | done                                                                                                                                                         |
| ### ADV MCP Tool Invocation (P1.12) (209–219)       | 10    | partial  | `plugin/src/tools/*.ts` arg validators (Zod)                                                                          | Schema enforces required args; relational constraints partly enforced via runtime checks   | T4   | done                                                                                                                                                         |
| ### Question Tool UX (221–230)                      | 9     | inherent | (P26 in rules.yaml — user-managed)                                                                                    | Agent-side judgment                                                                        | T5   | done                                                                                                                                                         |
| ### Tradeoff Prioritizer Protocol (231–240)         | 9     | inherent | —                                                                                                                     | Agent process                                                                              | T5   | done                                                                                                                                                         |
| ### Context Freshness (241–247)                     | 6     | full     | `plugin/src/utils/context-snapshot.ts` (auto-emission triggers)                                                       | —                                                                                          | T2   | done                                                                                                                                                         |
| ### TDD Protocol (RSTC) (248–258)                   | 10    | inherent | `adv_run_test`                                                                                                        | Process is agent-driven; tool records evidence                                             | T5   | done                                                                                                                                                         |
| ### Reflection Protocol (259–280)                   | 21    | partial  | `adv_reflect` tool                                                                                                    | Tool records report; agent decides when/how to interpret                                   | T4   | done                                                                                                                                                         |
| ### Task Checkpoint Commits (281–323)               | 42    | full     | `adv_task_checkpoint`, `plugin/src/checkpoint-surface-drift.test.ts`                                                  | —                                                                                          | T2   | already-compliant (mostly tabular: apply-loop table + failure classification table; anti-patterns are V phrases asserted by `adv-checkpoint-assets.test.ts`) |
| ### Doom Loop Detection (324–339)                   | 15    | partial  | `plugin/src/utils/tool-formatters.ts` (formatDoomLoopDiagnostics)                                                     | Format encoded; retry budget is convention                                                 | T4   | done                                                                                                                                                         |
| ### Investment Check-In (340–343)                   | 3     | full     | `adv_investment_report`, `skills/adv-cost-governance-methodology`                                                     | —                                                                                          | T2   | already-compliant (3 lines, already minimal)                                                                                                                 |
| ### Cross-Repo Execution (344–362)                  | 18    | inherent | (workdir param exists; routing is judgment)                                                                           | Agent decides when to switch                                                               | T5   | done                                                                                                                                                         |
| ### Cancellation Policy (363–368)                   | 5     | full     | `adv_task_cancel` (requires approvedByUser)                                                                           | —                                                                                          | T2   | already-compliant (5 lines, already minimal)                                                                                                                 |
| ### Large-Scope Validity (369–388)                  | 19    | inherent | —                                                                                                                     | Pure agent judgment                                                                        | T5   | done                                                                                                                                                         |
| ### Task Status Report (389–392)                    | 3     | inherent | —                                                                                                                     | Pure agent emission                                                                        | T5   | done                                                                                                                                                         |
| ### Post-Remediation Re-Verification (393–396)      | 3     | inherent | —                                                                                                                     | Agent process                                                                              | T5   | done                                                                                                                                                         |
| ### Validated In-Scope Remediation Policy (397–400) | 3     | inherent | —                                                                                                                     | Agent judgment                                                                             | T5   | done                                                                                                                                                         |
| ### Touched-Scope Quality Ownership (401–410)       | 9     | inherent | —                                                                                                                     | Agent judgment (P23 + P25 in rules.yaml)                                                   | T5   | done                                                                                                                                                         |
| ### Ambiguity Taxonomy (411–481)                    | 70    | partial  | `plugin/src/validator/clarify-readiness.ts` (6 of 11 categories)                                                      | clarify-readiness covers smell detection; full taxonomy is agent classification            | T4   | done                                                                                                                                                         |
| ## 7-Gate Quality Checklist (482–501)               | 19    | full     | `adv_gate_complete` (sequential enforcement), `plugin/src/types.ts` GATE_ORDER                                        | —                                                                                          | T2   | already-compliant                                                                                                                                            |
| ## Command Execution Model (502–579)                | 77    | partial  | `plugin/src/guards/task.ts` (depth=1)                                                                                 | Guard enforces nesting; rest is agent process                                              | T4   | done                                                                                                                                                         |
| ## Sub-Agent Selection (580–608)                    | 28    | full     | `plugin/src/guards/task.ts` (enforceTaskPolicy), `adv-command-routing-assets.test.ts` (V phrases: tier↔agent mapping) | —                                                                                          | T2   | already-compliant (tables ARE the constraint; only prose blockquotes compressible)                                                                           |
| ## Skill Discovery Protocol (609–628)               | 19    | inherent | —                                                                                                                     | Agent file-system search behavior                                                          | T5   | done                                                                                                                                                         |
| ## Skill Creation Protocol (629–695)                | 66    | inherent | —                                                                                                                     | Agent assembly process; template only                                                      | T5   | done                                                                                                                                                         |
| ## Command vs Skill Boundaries (696–753)            | 57    | inherent | —                                                                                                                     | Architecture documentation; classification table                                           | T5   | done                                                                                                                                                         |
| ## Worktree Integration (754–813)                   | 59    | partial  | `worktree_create`/`worktree_delete` tools                                                                             | Tools enforce creation/deletion; reuse policy is agent process                             | T4   | done                                                                                                                                                         |
| ## When to Use ADV (814–817)                        | 3     | inherent | —                                                                                                                     | Use-case guidance                                                                          | T5   | done                                                                                                                                                         |

---

## Inventory: docs/command-voice-standard.md (706 lines, post-T0a)

| Section                                          | Lines | Class    | Code Reference                                                                          | Gap Rationale                                                                                           | Pass                          | Status |
| ------------------------------------------------ | ----- | -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| ## Core Rules (5–14)                             | 9     | inherent | —                                                                                       | Voice rule catalog                                                                                      | T5                            | done   |
| ## Manifest Description Rules (15–35)            | 20    | full     | `plugin/src/manifest-doc-drift.test.ts`                                                 | —                                                                                                       | T3                            | done   |
| ## Protocol Section Rules (36–121)               | 85    | inherent | —                                                                                       | Style canon for protocol sections                                                                       | T5                            | done   |
| ## Command Doc Template (122–151)                | 29    | inherent | —                                                                                       | Template form                                                                                           | T5                            | done   |
| ## Frontmatter Contract (152–155)                | 3     | full     | `plugin/src/manifest-doc-drift.test.ts` (single-line YAML check)                        | —                                                                                                       | T3                            | done   |
| ## Voice Contract (runtime prose) (156–204)      | 48    | partial  | `plugin/src/index.ts` PROVIDER_BEHAVIOR_HINTS                                           | Provider hints set tone; specific phrasing is agent-driven                                              | T4                            | done   |
| ## Prose-Load Reduction Rules (205–251, NEW T0a) | 47    | full     | `plugin/src/manifest-doc-drift.test.ts` (extended T7)                                   | —                                                                                                       | (own-section; verified by T7) | done   |
| ## Gate Handoff Voice (252–503)                  | 251   | full     | `plugin/src/handoff-footer-drift.test.ts`                                               | —                                                                                                       | T3                            | done   |
| ## Inline Approval Voice (504–700)               | 196   | partial  | `adv_gate_complete` (planning-gate userApproved enforcement); regex parsing in commands | Tier A LLM fallback is agent judgment; Tier B regex is documented but not machine-enforced beyond prose | T4                            | done   |
| ## Enforcement (701–706)                         | 5     | full     | (cross-references all drift tests)                                                      | —                                                                                                       | T3                            | done   |

---

## Inventory: .opencode/agents/adv.md (371 lines)

| Section                                | Lines | Class    | Code Reference                                      | Gap Rationale                                                     | Pass | Status                                                                                                                                                             |
| -------------------------------------- | ----- | -------- | --------------------------------------------------- | ----------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (frontmatter, 1–104)                   | 104   | —        | —                                                   | (config block; not subject to compression)                        | —    | n/a                                                                                                                                                                |
| ## ADV Overlay (105–110)               | 5     | full     | `plugin/src/guards/task.ts` (depth ≤ 1)             | —                                                                 | T2   | already-compliant (5 lines, bullets)                                                                                                                               |
| ## Voice Contract (111–116)            | 5     | partial  | `plugin/src/index.ts` PROVIDER_BEHAVIOR_HINTS       | Provider hints; agent applies                                     | T4   | done                                                                                                                                                               |
| ## Scope Validity (117–124)            | 7     | inherent | —                                                   | Agent rule (post-prep no-split)                                   | T5   | done                                                                                                                                                               |
| ## Collaborative Workflow (125–134)    | 9     | partial  | `adv_gate_complete` (machine-enforced for planning) | Other gates rely on agent                                         | T4   | done                                                                                                                                                               |
| ## Slash Command Boundary (135–141)    | 6     | inherent | —                                                   | Agent-side principle                                              | T5   | done                                                                                                                                                               |
| ## Step 1: Understand Intent (142–158) | 16    | inherent | —                                                   | Routing table; agent decides                                      | T5   | done                                                                                                                                                               |
| ## Step 2: Load State (159–167)        | 8     | full     | `adv_change_show`, `adv_gate_status`                | —                                                                 | T2   | already-compliant (8 lines, pointer + numbered list)                                                                                                               |
| ## Step 3: Gate Machine (168–224)      | 56    | full     | `adv_gate_complete` (sequence enforcement)          | —                                                                 | T2   | already-compliant (gate table + Human Checkpoints V-phrases asserted by `adv-autonomy-quality-assets.test.ts`; rules are bullets, paragraph notes carry V anchors) |
| ## Change Report (225–260)             | 35    | inherent | —                                                   | Acceptance/release report template                                | T5   | done                                                                                                                                                               |
| ## Context-Optimal Execution (261–284) | 23    | inherent | —                                                   | Agent judgment                                                    | T5   | done                                                                                                                                                               |
| ## Sub-Agent Policy (285–322)          | 37    | full     | `plugin/src/guards/task.ts` (enforceTaskPolicy)     | —                                                                 | T2   | done (compressed, commit b0d7f3a)                                                                                                                                  |
| ## Output Contract (323–346)           | 23    | full     | `plugin/src/handoff-footer-drift.test.ts`           | —                                                                 | T2   | already-compliant (template code-block + 1 line; format enforced by drift test)                                                                                    |
| ## ADV State Access Policy (347–371)   | 24    | partial  | (× direct-read prose-only; tools listed)            | No runtime guard against direct file read; prose-only enforcement | T4   | done                                                                                                                                                               |

---

## Inventory: .opencode/command/adv-\*.md (25 files, ~5,043 lines)

> Per-file granularity. Each command doc has its own structure but shares common patterns: frontmatter + Command Boundary + Phase blocks + Output. Compression in T3/T4/T5 visits each file individually but applies the same templates.

| File                | Lines      | Dominant Class | Code Reference                                                       | Gap Rationale                                                       | Pass  | Status |
| ------------------- | ---------- | -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ----- | ------ |
| adv-apply.md        | 475        | partial        | `adv_run_test`, `adv_task_checkpoint`, manifest entry                | Phase loop is agent-driven; tools record state                      | T3+T4 | done   |
| adv-discover.md     | 471        | partial        | `adv_change_validate`, `clarify-readiness.ts`                        | Discovery protocol agent-driven; trigger thresholds machine-checked | T3+T4 | done   |
| adv-research.md     | 397        | inherent       | —                                                                    | Research methodology; agent process                                 | T5    | done   |
| adv-prep.md         | 394        | partial        | `adv_gate_complete` (planning userApproved), `prep-readiness.ts`     | Planning machine-enforced; gap analysis agent-driven                | T3+T4 | done   |
| adv-harden.md       | 394        | partial        | `adv_change_validate`, `slop-detection` skill                        | Auto-fix scope is agent judgment                                    | T3+T4 | done   |
| adv-review.md       | 347        | partial        | `adv_change_validate`                                                | Review dimensions agent-driven                                      | T3+T4 | done   |
| adv-cleanup.md      | 291        | partial        | `adv_change_bulk_close`, `adv_change_close`                          | Triage agent judgment                                               | T3+T4 | done   |
| adv-archive.md      | 263        | full           | `adv_change_archive`, `adv_gate_complete release`                    | —                                                                   | T3    | done   |
| adv-design.md       | 234        | partial        | (validator subagent), `adv_change_update`                            | Design judgment is agent-driven                                     | T3+T4 | done   |
| adv-reflect.md      | 230        | full           | `adv_reflect` tool                                                   | —                                                                   | T3    | done   |
| adv-improve.md      | 183        | inherent       | —                                                                    | Research/improvement methodology                                    | T5    | done   |
| adv-slop-scan.md    | 163        | inherent       | `slop-detection` skill                                               | Methodology in skill                                                | T5    | done   |
| adv-proposal.md     | 147        | partial        | `adv_change_create` (problemStatement param), `clarify-readiness.ts` | Synthesis is agent-driven                                           | T3+T4 | done   |
| adv-clarify.md      | 127        | inherent       | —                                                                    | Socratic methodology; agent-driven                                  | T5    | done   |
| adv-task.md         | 122        | partial        | `adv_change_create` + bundled gate completions                       | Bundling is agent-driven                                            | T3+T4 | done   |
| adv-problem.md      | 116        | inherent       | —                                                                    | Triage methodology                                                  | T5    | done   |
| adv-audit.md        | 105        | inherent       | —                                                                    | Audit methodology                                                   | T5    | done   |
| adv-idea.md         | 101        | inherent       | —                                                                    | Triage methodology                                                  | T5    | done   |
| adv-arch-scan.md    | 100        | inherent       | `arch-detection` skill                                               | Methodology in skill                                                | T5    | done   |
| adv-refactor.md     | 92         | inherent       | —                                                                    | Refresh methodology                                                 | T5    | done   |
| adv-comp-scan.md    | 91         | inherent       | `comp-research` skill                                                | Methodology in skill                                                | T5    | done   |
| adv-tron.md         | 61         | full           | `tron` skill, `adv-tron` agent                                       | —                                                                   | T3    | done   |
| adv-tron.md → SKILL | (in skill) | inherent       | —                                                                    | Investigation methodology                                           | T5    | done   |
| adv-validate.md     | 50         | full           | `adv_change_validate`                                                | —                                                                   | T3    | done   |
| adv-status.md       | 46         | full           | `adv_status`                                                         | —                                                                   | T3    | done   |
| ~~adv-coordinate.md~~ | ~~43~~     | ~~removed~~    | —                                                                    | Functionality integrated into /adv-archive, /adv-status, /adv-apply | T5    | done   |

---

## Inventory: skills/\*/SKILL.md (6 files, ~845 lines)

| File                            | Lines | Dominant Class | Code Reference          | Gap Rationale                                                | Pass | Status |
| ------------------------------- | ----- | -------------- | ----------------------- | ------------------------------------------------------------ | ---- | ------ |
| adv-cost-governance-methodology | 291   | partial        | `adv_investment_report` | Methodology + worked example; tool exists for thresholds     | T4   | done   |
| adv-user-intuit                 | 155   | inherent       | —                       | Comparison protocol; agent-driven                            | T5   | done   |
| adv-tron                        | 138   | inherent       | —                       | Investigation methodology                                    | T5   | done   |
| adv-arch-detection              | 95    | inherent       | —                       | Detection methodology                                        | T5   | done   |
| adv-slop-detection              | 90    | partial        | `adv_slop_scan` tool    | Tool implements detection; methodology is selection criteria | T4   | done   |
| adv-comp-research               | 76    | inherent       | —                       | Research methodology                                         | T5   | done   |

---

## Asset Test Audit (T1.5)

### Audit Methodology

Per KD4: every assertion in each `*-assets.test.ts` file is classified as:

- **prose-duplicating** — wording mirrors code-enforced behavior with no spec backing → safe to remove (UD4)
- **spec-enforcing** — backs an `rq-*` scenario → migrate or retain

### Audit Result Summary

**Conclusion:** Validator C1 was correct on the macro level. But mid-T2 user refinement clarified the criterion: distinguish **value-enforcing** assertions (must keep) from **heuristic drift** assertions (removable).

| Class               | Definition                                                                                                                                                                   | Action       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **value-enforcing** | Asserts specific anti-patterns, named citations, schema enums, config values, or canonical-list members. Loss = behavioral regression or spec-anchor loss.                   | KEEP         |
| **heuristic drift** | Asserts heading exact-text, topic-presence (e.g., section discusses X), or paragraph-theme. Loss = no behavioral impact; assertion is just a "did the doc change?" tripwire. | REMOVE in T6 |

**Per-file value-vs-heuristic estimate** (sampled from `adv-autonomy-quality-assets.test.ts`, 138 expects):

- Value-enforcing: ~70% (~95 expects) — anti-patterns, named-7-checkpoints, verdict labels, config values, schema enums, escape-clause citations
- Heuristic drift: ~30% (~43 expects) — exact heading text, topic-coverage checks, vague regex matches like `[Vv]alid`

T6 performed targeted cleanup where the audit proved safe: `adv-autonomy-quality-assets.test.ts` was consolidated (414 → 376 lines) and one `adv-improve-assets.test.ts` regex was broadened after COMPLETE trailer removal. Remaining asset-test files were retained because their assertions are value-enforcing or already spec-backed.

### Per-File Audit

| Test File                                            | Lines          | Assertion Density | Backing Spec(s)                                                                                                                                                                                                               | Dominant Class                          | Migration Plan                                                                                                                               | Status   |
| ---------------------------------------------------- | -------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `adv-autonomy-quality-assets.test.ts`                | 414            | 138 expects       | `rq-autonomy01.4` (post-approval auto-continue, doom-loop), `rq-remediation01` (validated in-scope), `rq-touchedScope01` (touched-scope ownership), design-validation requirements, cost-governance scenarios in advance-meta | spec-enforcing                          | **TARGETED CLEANUP** — H-class heading/topic checks removed where safe; value-enforcing assertions retained.                                 | done     |
| `adv-checkpoint-assets.test.ts`                      | (45 expects)   | spec-enforcing    | `rq-cc01`–`rq-cc05` (checkpoint contract in advance-delivery)                                                                                                                                                                 | spec-enforcing                          | **RETAIN** — checkpoint surface protected by separate drift test (`checkpoint-surface-drift.test.ts`); these asset assertions complement it. | retained |
| `adv-command-routing-assets.test.ts`                 | (121 expects)  | spec-enforcing    | manifest entries (governed by `manifest-doc-drift.test.ts`)                                                                                                                                                                   | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `adv-engineer-assets.test.ts`                        | (17 expects)   | spec-enforcing    | engineer subagent contract                                                                                                                                                                                                    | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `adv-improve-assets.test.ts`                         | (48 expects)   | spec-enforcing    | `/adv-improve` methodology spec                                                                                                                                                                                               | spec-enforcing                          | **TARGETED UPDATE** — regex broadened after COMPLETE trailer removal; value assertion retained.                                              | done     |
| `adv-skill-backed-commands-assets.test.ts`           | (62 expects)   | spec-enforcing    | command↔skill loading contract                                                                                                                                                                                                | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `adv-slop-scan-assets.test.ts`                       | (6 expects)    | spec-enforcing    | `rq-ss001`–`rq-ss004` (slop-scan; legacy `rq-slopscan01`)                                                                                                                                                                     | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `adv-tron-assets.test.ts`                            | (13 expects)   | spec-enforcing    | adv-tron command/skill pairing                                                                                                                                                                                                | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `commands-spine-assets.test.ts`                      | (8 expects)    | spec-enforcing    | manifest spine                                                                                                                                                                                                                | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `overlay-sync-assets.test.ts`                        | (40 expects)   | spec-enforcing    | sync-global.sh behavior                                                                                                                                                                                                       | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `scope-discovery-assets.test.ts`                     | (5 expects)    | spec-enforcing    | scope-discovery protocol                                                                                                                                                                                                      | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `__tests__/human-checkpoints-assets.test.ts`         | (38 expects)   | spec-enforcing    | `rq-autonomy01` (human checkpoints)                                                                                                                                                                                           | spec-enforcing                          | **RETAIN**                                                                                                                                   | retained |
| `__tests__/preserved-narrative-rules-assets.test.ts` | 59 (8 expects) | already-migrated  | `rq-largeScopeValidity01`, `rq-dueDiligence01`                                                                                                                                                                                | spec-asset (asserts spec.json directly) | **RETAIN** — already in target form (assertions against spec.json, not prose)                                                                | retained |

### Per-Assertion Classification: `adv-autonomy-quality-assets.test.ts`

Refined classification per user direction. Format: `line:NN type [V/H] — assertion description`.

#### Block 1: Human checkpoint and auto-continue (lines 18-50)

- L21 H — heading exact `### Human Checkpoints (Pause Required)`
- L26-32 V — 7 named checkpoints (Proposal/Agreement/Design/Acceptance/Archive/Cancellation/Doom-loop) — canonical list
- L37 H — heading exact `### Post-Approval Auto-Continue`
- L38 V — anti-pattern `No "shall I proceed?"`
- L43 H — heading exact `Human Checkpoints vs Auto-Continue`
- L44-48 V — 5 checkpoint names + auto-continue phrase in adv.md (canonical-list members)

#### Block 2: Validated in-scope remediation (lines 56-100)

- L59 H — heading exact `### Validated In-Scope Remediation Policy`
- L60 V — anti-pattern `No report-only`
- L61 V — anti-pattern `future-work`
- L67 V — anti-pattern × `Report only`
- L72-74 V — anti-pattern × accepted debt (3 forms)
- L76 V — exact policy phrase `No report-only, future-work, or accepted-debt path`
- L82 V — positive policy `fix all validated in-scope findings`
- L87 V — anti-pattern `no future-work deferral`
- L92 H — topic check `validated in-scope`
- L97 V — anti-pattern × `accepted_debt`
- L98 V — schema enum `rejected_with_evidence`

#### Block 3: Touched-scope quality ownership (lines 106-151)

- L109 H — heading exact `### Touched-Scope Quality Ownership`
- L110-112 V — 3 named scope categories (canonical list)
- L117 H — heading exact `Touched-Scope Quality Ownership` (in adv-prep.md)
- L118-119 V — 2 named scope categories
- L124 H — topic check `touched-scope`
- L131 V — anti-pattern × `Shall I continue`
- L137 V — anti-pattern × `Task N of M complete...continue`
- L144 V — positive policy `MUST continue|MUST NOT pause`
- L149 V — boundary phrase `Do NOT expand into implicit repo-wide refactors`

#### Block 4: Design validation policy (lines 157-208)

- L160 H — name reference `adv-researcher`
- L161 H — vague regex `[Vv]alid`
- L163 V — capability framing `independent.*valid`
- L168-171 V — 4 verdict labels (canonical enum)
- L172 H — tool reference `adv_change_update`
- L177 H — vague regex `[Vv]alidator`
- L179 V — verdict labels in display
- L181 V — display rule `No validation data.*omit section silently`
- L182 V — pause rule `CONFLICT.*pause`
- L183 V — risk concept `contract[- ]compromise risk`
- L184-186 V — 4 inline reply choices (canonical list)
- L191 V — phase reference `Phase 4.1|contract-compromise risk assessment`
- L193 V — agreement-tie `acceptance criteria.*explicit constraints.*stated avoidances`
- L195 V — amendment procedure `agreement.md.*amend`
- L200 H — vague regex `design.*validator|validator.*design`
- L205-206 V — anti-pattern × passive validation guidance (2 forms)

#### Block 5: Investment Check-In (lines 222-413)

- L225 H — file existence (truthy)
- L231 H — YAML structure
- L233-236 V — threshold tier names (canonical config keys)
- L238-243 V — specific threshold values (config invariants — agreement UD #1)
- L248 V — skill path reference (architectural)
- L253 V — scope ADV-only (architectural)
- L259-261 V — 3 in-scope category names (canonical enum)
- L267-269 V — 3 out-of-scope category names (canonical enum)
- L274-277 H — phase labels (heuristic — protocol structure)
- L282-284 V — escape-clause citation `rq-autonomy01` + `unresolved user-value tradeoff`
- L290-295 V — hard-stop semantics + `rq-scopeReentry01` (architectural anchor)
- L300-301 V — doom-loop supersede rule
- L306 H — heading `### Investment Check-In`
- L311-313 V — escape-clause citation
- L318-322 V — hard-stop advisory language
- L327 V — doom-loop supersede rule
- L332-335 H — phase + label + skill reference (heuristic — topic coverage)
- L340-346 H — phase reference + skill + topic words (heuristic)
- L352 H — `adv_investment_report` reference (heuristic — topic coverage in 3 files)
- L358-362 V — git command specifics (architectural — exact reconcile flow)
- L367-369 V — git rebase abort + worktree safety
- L374-378 V — P28 documentation specifics (config invariants)
- L386-399 V — P28 YAML schema fields (config invariants)
- L407-411 V — anti-pattern × INVESTMENT_CHECKIN injection (architectural)

**Counts:** ~95 V (value-enforcing, ~70%), ~43 H (heuristic drift, ~30%)

### Phrases to Preserve (asserted by `adv-autonomy-quality-assets.test.ts` — VALUE only)

Compression passes preserve these phrases verbatim. Heuristic-drift heading checks (e.g., exact `### Human Checkpoints (Pause Required)`) are **NOT** in this list — they will be removed in T6 along with their assertions.

#### `ADV_INSTRUCTIONS.md`

- `### Human Checkpoints (Pause Required)` (heading, exact match)
- "Proposal confirmation", "Agreement sign-off", "Design approval", "Acceptance", "Archive sign-off", "Cancellation approval", "Doom-loop recovery"
- `### Post-Approval Auto-Continue` (heading)
- `No "shall I proceed?"` (regex)
- `### Validated In-Scope Remediation Policy` (heading)
- `No report-only`, `future-work`
- `### Touched-Scope Quality Ownership` (heading)
- `Directly touched implementation files`, `Adjacent tests and docs`, `Same-pattern local subsystem issues`
- `Do NOT expand into implicit repo-wide refactors`
- `### Investment Check-In` (heading)
- `rq-autonomy01`, `escape clause`, `unresolved user-value tradeoff`
- `Hard-stop`, `advisory`, `does NOT.*adv_change_reenter` (regex)
- `Doom-loop supersede` or `supersede.*doom-loop` (regex)
- `design.*validator|validator.*design` (regex)

#### `.opencode/agents/adv.md`

- `Human Checkpoints vs Auto-Continue` (heading)
- `Proposal confirmation`, `Agreement sign-off`, `Cancellation approval`, `Doom-loop recovery`, `Post-approval auto-continue`

#### `.opencode/command/adv-harden.md`

- `No report-only, future-work, or accepted-debt path` (regex)
- `fix all validated in-scope findings` (regex)
- × MUST NOT contain: `Report only`, `documented as accepted debt`, `accepted debt:`, `fix or document as accepted debt`

#### `.opencode/command/adv-review.md`

- `no future-work deferral` (regex)
- `validated in-scope` (regex)
- `rejected_with_evidence`
- × MUST NOT contain: `accepted_debt`

#### `.opencode/command/adv-prep.md`

- `Touched-Scope Quality Ownership` (heading)
- `Adjacent tests and docs`, `Same-pattern local subsystem issues`
- `Phase J`, `Identify Judgment Calls`, `adv-cost-governance-methodology`

#### `.opencode/command/adv-apply.md`

- `touched-scope` (regex)
- `MUST continue|MUST NOT pause` (regex)
- `Phase 1.5`, `Investment Check-In Preamble`, `adv-cost-governance-methodology`
- `Doom-loop`, `Hard-stop`
- × MUST NOT contain: `Shall I continue` (regex), `Task N of M complete[^\n]*continue` (regex)

#### `.opencode/command/adv-design.md`

- `adv-researcher` (regex)
- `[Vv]alid` (regex)
- `independent.*valid|valid.*independent` (regex)
- `VALIDATED`, `CAUTION`, `CONFLICT`, `INCONCLUSIVE`
- `adv_change_update` (regex)
- `No validation data.*omit section silently` (regex)
- `CONFLICT.*pause` (regex)
- `contract[- ]compromise risk` (regex)
- `keep.*compromise|revise.*design|revisit.*agreement|defer` (regex)
- `Phase 4\\.1|contract-compromise risk assessment` (regex)
- `acceptance criteria.*explicit constraints.*stated avoidances|written agreement` (regex)
- `agreement\\.md.*amend|amend.*agreement` (regex)
- × MUST NOT contain: `inform the user.*additional frontier model` (regex), `have an additional frontier model` (regex)

#### `.opencode/command/adv-discover.md`, `adv-review.md`, `adv-archive.md`

- `adv_investment_report` (regex)

#### `.opencode/command/adv-archive.md`

- `Refresh Merge Basis`, `git fetch origin {default-branch}`, `git merge --ff-only change/{change-id}`, `git rebase {freshness-ref}`, `PR workflow path`
- `git rebase --abort`, `do NOT delete worktree`, `conflicting files`

### Implication for T2/T3/T4/T5

Compression of these sections must be **phrase-preserving**: the surrounding paragraph prose can be removed/restructured, but the asserted phrases (heading text, exact strings, regex anchors) must remain intact within the compressed section. The compression templates in KD2 accommodate this — pointer + table format can carry asserted phrases as table values or bullet items within the section.

If a compression pass would unavoidably remove an asserted phrase, the affected section is excluded from that pass and re-classified `inherent` (kept in scannable structured form, no compression applied to the asserted lines).

### Implication for T6 (Asset-Test Cleanup)

Per UD4 ("remove prose-asserting asset tests"), the original intent assumed many assertions would be prose-duplicating. Audit shows nearly all are spec-enforcing. T6 scope therefore stayed **targeted**:

- Keep all spec-enforcing assertions in place
- Remove only heuristic-drift assertions proven safe in `adv-autonomy-quality-assets.test.ts`
- Broaden one affected `adv-improve-assets.test.ts` value assertion after COMPLETE trailer removal
- Use T7 structural assertions to supplement, not replace, retained asset tests

This honors UD4's spirit (eliminate prose-policing maintenance burden) while protecting spec enforcement (validator C1).

---

## Summary (revised post-execution)

| Class                               | Section count | Total lines | Pass owner                                           | Realistic yield                                                                                     |
| ----------------------------------- | ------------- | ----------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **full** (pointer + table)          | 22            | ~700        | T2 (ADV_INSTR + adv.md), T3 (voice canon + commands) | LOW — most ADV_INSTR `full` sections already KD2-compliant; main wins in voice canon + command docs |
| **partial** (pointer + table + gap) | 18            | ~1,400      | T4 (all surfaces)                                    | MEDIUM — paragraph explanations around tables can compress                                          |
| **inherent** (structured template)  | 35            | ~1,800      | T5 (all surfaces)                                    | HIGH — paragraph-heavy sections (TDD protocol, worktree, skill discovery) re-template to tables     |
| frontmatter / out-of-scope          | —             | ~3,800      | n/a                                                  | —                                                                                                   |

Total in-scope content: ~3,900 lines across ~75 sections.

**Practical compression yield (post-T1.5 audit + T2 reality check):**

| Pass      | Original estimate | Revised yield                                                      |
| --------- | ----------------- | ------------------------------------------------------------------ |
| T2        | ~150 lines        | ~30-50 (most full sections already compliant)                      |
| T3        | ~200 lines        | ~150-200 (commands docs vary; voice canon has prose around tables) |
| T4        | ~300 lines        | ~150-200 (paragraph compression with V-phrase preservation)        |
| T5        | ~150 lines        | ~150-250 (inherent has the largest re-template wins)               |
| **Total** | **~800 lines**    | **~480-700 lines**                                                 |

Plus ~165 H assertions (~30% of asset tests) removed in T6.

## Stop Condition (UD3)

Compression halts when no remaining row is classified `full` or `partial`. All remaining rows must be `inherent` (handled by re-templating, not compression).

The inventory table is the mechanical oracle for this — when its `full` and `partial` rows are all `Status: done`, T2/T3/T4 are complete. T5 then re-templates `inherent` rows.

## Provenance

| Reference                                                    | Role                                      |
| ------------------------------------------------------------ | ----------------------------------------- |
| `change/reducepromptloadonadvcontrol/proposal.md`            | Why this work exists                      |
| `change/reducepromptloadonadvcontrol/agreement.md`           | Locked AC + UD1–UD4 + AD1–AD5             |
| `change/reducepromptloadonadvcontrol/design.md`              | KD1–KD8, including taxonomy and templates |
| `.adv/specs/advance-meta/spec.json` § rq-proseReduction01–04 | Durable invariants (added by T0c)         |
| `plugin/src/manifest-doc-drift.test.ts`                      | Drift enforcement (extended by T7)        |
