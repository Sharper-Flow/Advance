# Prose-Load Inventory

> **Lifecycle:** WORKING DOC during execution → marked **POST-COMPRESSION ARCHIVE** in T9 → no maintenance owner thereafter.
>
> Durability lives in spec deltas `rq-proseReduction01`–`rq-proseReduction04`, not this file. This inventory is the audit trail for the compression passes (T2/T3/T4/T5) and the planning input for the asset-test audit (T1.5).

## Purpose

Every prose section across ADV instruction surfaces is classified into one of three enforcement classes:

| Class | Compression target |
|---|---|
| **full** | Pointer + constraint table (no paragraph) |
| **partial** | Pointer + constraint table + 1-line gap rationale |
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

---

## Inventory: ADV_INSTRUCTIONS.md (817 lines)

| Section | Lines | Class | Code Reference | Gap Rationale | Pass | Status |
|---|---|---|---|---|---|---|
| ## Notation (5–8) | 4 | inherent | — | (legend table; already minimal) | T5 | pending |
| ## Core Decision Rules (9–20) | 11 | inherent | — | (when/then table; already minimal) | T5 | pending |
| ## HITL Boundary Model (21–83) | 62 | partial | `plugin/src/tools/gate.ts` `handlePlanningGateCompletion` | Planning gate machine-enforces userApproved; other gate pauses rely on agent prose | T4 | pending |
| ## Phase Goals (84–98) | 14 | inherent | `plugin/src/manifest.ts` (phaseGoal field) | Goals reside in manifest, but agent self-checks via prose | T5 | pending |
| ## Commands (99–145) | 46 | inherent | — | (reference table — kept as catalog) | T5 | pending |
| ## Command Boundaries (146–160) | 14 | inherent | — | (boundary table — already in target form) | T5 | pending |
| ## Status Markers (161–186) | 25 | partial | `plugin/src/utils/banner.ts`, `plugin/src/events/` | Format partially encoded; agent decides when to emit | T4 | pending |
| ### Context Snapshot (177–186) | 9 | full | `plugin/src/utils/context-snapshot.ts` | — | T2 | pending |
| ### ADV State Access (189–207) | 18 | full | (× direct-read forbidden — runtime guard absent; prose-only enforcement) | NOTE: re-classify to `partial` — table mapping is enforceable but read-prevention is prose | T4 | pending |
| ### ADV MCP Tool Invocation (P1.12) (209–219) | 10 | partial | `plugin/src/tools/*.ts` arg validators (Zod) | Schema enforces required args; relational constraints partly enforced via runtime checks | T4 | pending |
| ### Question Tool UX (221–230) | 9 | inherent | (P26 in rules.yaml — user-managed) | Agent-side judgment | T5 | pending |
| ### Tradeoff Prioritizer Protocol (231–240) | 9 | inherent | — | Agent process | T5 | pending |
| ### Context Freshness (241–247) | 6 | full | `plugin/src/utils/context-snapshot.ts` (auto-emission triggers) | — | T2 | pending |
| ### TDD Protocol (RSTC) (248–258) | 10 | inherent | `adv_run_test`, `adv_task_evidence` | Process is agent-driven; tools record evidence | T5 | pending |
| ### Reflection Protocol (259–280) | 21 | partial | `adv_reflect` tool | Tool records report; agent decides when/how to interpret | T4 | pending |
| ### Task Checkpoint Commits (281–323) | 42 | full | `adv_task_checkpoint`, `plugin/src/checkpoint-surface-drift.test.ts` | — | T2 | pending |
| ### Doom Loop Detection (324–339) | 15 | partial | `plugin/src/utils/tool-formatters.ts` (formatDoomLoopDiagnostics) | Format encoded; retry budget is convention | T4 | pending |
| ### Investment Check-In (340–343) | 3 | full | `adv_investment_report`, `skills/adv-cost-governance-methodology` | — | T2 | pending |
| ### Cross-Repo Execution (344–362) | 18 | inherent | (workdir param exists; routing is judgment) | Agent decides when to switch | T5 | pending |
| ### Cancellation Policy (363–368) | 5 | full | `adv_task_cancel` (requires approvedByUser) | — | T2 | pending |
| ### Large-Scope Validity (369–388) | 19 | inherent | — | Pure agent judgment | T5 | pending |
| ### Task Status Report (389–392) | 3 | inherent | — | Pure agent emission | T5 | pending |
| ### Post-Remediation Re-Verification (393–396) | 3 | inherent | — | Agent process | T5 | pending |
| ### Validated In-Scope Remediation Policy (397–400) | 3 | inherent | — | Agent judgment | T5 | pending |
| ### Touched-Scope Quality Ownership (401–410) | 9 | inherent | — | Agent judgment (P23 + P25 in rules.yaml) | T5 | pending |
| ### Ambiguity Taxonomy (411–481) | 70 | partial | `plugin/src/validator/clarify-readiness.ts` (6 of 11 categories) | clarify-readiness covers smell detection; full taxonomy is agent classification | T4 | pending |
| ## 7-Gate Quality Checklist (482–501) | 19 | full | `adv_gate_complete` (sequential enforcement), `plugin/src/types.ts` GATE_ORDER | — | T2 | pending |
| ## Command Execution Model (502–579) | 77 | partial | `plugin/src/guards/task.ts` (depth=1) | Guard enforces nesting; rest is agent process | T4 | pending |
| ## Sub-Agent Selection (580–608) | 28 | full | `plugin/src/guards/task.ts` (enforceTaskPolicy) | — | T2 | pending |
| ## Skill Discovery Protocol (609–628) | 19 | inherent | — | Agent file-system search behavior | T5 | pending |
| ## Skill Creation Protocol (629–695) | 66 | inherent | — | Agent assembly process; template only | T5 | pending |
| ## Command vs Skill Boundaries (696–753) | 57 | inherent | — | Architecture documentation; classification table | T5 | pending |
| ## Worktree Integration (754–813) | 59 | partial | `worktree_create`/`worktree_delete` tools | Tools enforce creation/deletion; reuse policy is agent process | T4 | pending |
| ## When to Use ADV (814–817) | 3 | inherent | — | Use-case guidance | T5 | pending |

---

## Inventory: docs/command-voice-standard.md (706 lines, post-T0a)

| Section | Lines | Class | Code Reference | Gap Rationale | Pass | Status |
|---|---|---|---|---|---|---|
| ## Core Rules (5–14) | 9 | inherent | — | Voice rule catalog | T5 | pending |
| ## Manifest Description Rules (15–35) | 20 | full | `plugin/src/manifest-doc-drift.test.ts` | — | T3 | pending |
| ## Protocol Section Rules (36–121) | 85 | inherent | — | Style canon for protocol sections | T5 | pending |
| ## Command Doc Template (122–151) | 29 | inherent | — | Template form | T5 | pending |
| ## Frontmatter Contract (152–155) | 3 | full | `plugin/src/manifest-doc-drift.test.ts` (single-line YAML check) | — | T3 | pending |
| ## Voice Contract (runtime prose) (156–204) | 48 | partial | `plugin/src/index.ts` PROVIDER_BEHAVIOR_HINTS | Provider hints set tone; specific phrasing is agent-driven | T4 | pending |
| ## Prose-Load Reduction Rules (205–251, NEW T0a) | 47 | full | `plugin/src/manifest-doc-drift.test.ts` (extended T7) | — | (own-section; verified by T7) | done |
| ## Gate Handoff Voice (252–503) | 251 | full | `plugin/src/handoff-footer-drift.test.ts` | — | T3 | pending |
| ## Inline Approval Voice (504–700) | 196 | partial | `adv_gate_complete` (planning-gate userApproved enforcement); regex parsing in commands | Tier A LLM fallback is agent judgment; Tier B regex is documented but not machine-enforced beyond prose | T4 | pending |
| ## Enforcement (701–706) | 5 | full | (cross-references all drift tests) | — | T3 | pending |

---

## Inventory: .opencode/agents/adv.md (371 lines)

| Section | Lines | Class | Code Reference | Gap Rationale | Pass | Status |
|---|---|---|---|---|---|---|
| (frontmatter, 1–104) | 104 | — | — | (config block; not subject to compression) | — | n/a |
| ## ADV Overlay (105–110) | 5 | full | `plugin/src/guards/task.ts` (depth ≤ 1) | — | T2 | pending |
| ## Voice Contract (111–116) | 5 | partial | `plugin/src/index.ts` PROVIDER_BEHAVIOR_HINTS | Provider hints; agent applies | T4 | pending |
| ## Scope Validity (117–124) | 7 | inherent | — | Agent rule (post-prep no-split) | T5 | pending |
| ## Collaborative Workflow (125–134) | 9 | partial | `adv_gate_complete` (machine-enforced for planning) | Other gates rely on agent | T4 | pending |
| ## Slash Command Boundary (135–141) | 6 | inherent | — | Agent-side principle | T5 | pending |
| ## Step 1: Understand Intent (142–158) | 16 | inherent | — | Routing table; agent decides | T5 | pending |
| ## Step 2: Load State (159–167) | 8 | full | `adv_change_show`, `adv_gate_status` | — | T2 | pending |
| ## Step 3: Gate Machine (168–224) | 56 | full | `adv_gate_complete` (sequence enforcement) | — | T2 | pending |
| ## Change Report (225–260) | 35 | inherent | — | Acceptance/release report template | T5 | pending |
| ## Context-Optimal Execution (261–284) | 23 | inherent | — | Agent judgment | T5 | pending |
| ## Sub-Agent Policy (285–322) | 37 | full | `plugin/src/guards/task.ts` (enforceTaskPolicy) | — | T2 | pending |
| ## Output Contract (323–346) | 23 | full | `plugin/src/handoff-footer-drift.test.ts` | — | T2 | pending |
| ## ADV State Access Policy (347–371) | 24 | partial | (× direct-read prose-only; tools listed) | No runtime guard against direct file read; prose-only enforcement | T4 | pending |

---

## Inventory: .opencode/command/adv-*.md (25 files, ~5,043 lines)

> Per-file granularity. Each command doc has its own structure but shares common patterns: frontmatter + Command Boundary + Phase blocks + Output. Compression in T3/T4/T5 visits each file individually but applies the same templates.

| File | Lines | Dominant Class | Code Reference | Gap Rationale | Pass | Status |
|---|---|---|---|---|---|---|
| adv-apply.md | 475 | partial | `adv_run_test`, `adv_task_checkpoint`, manifest entry | Phase loop is agent-driven; tools record state | T3+T4 | pending |
| adv-discover.md | 471 | partial | `adv_change_validate`, `clarify-readiness.ts` | Discovery protocol agent-driven; trigger thresholds machine-checked | T3+T4 | pending |
| adv-research.md | 397 | inherent | — | Research methodology; agent process | T5 | pending |
| adv-prep.md | 394 | partial | `adv_gate_complete` (planning userApproved), `prep-readiness.ts` | Planning machine-enforced; gap analysis agent-driven | T3+T4 | pending |
| adv-harden.md | 394 | partial | `adv_change_validate`, `slop-detection` skill | Auto-fix scope is agent judgment | T3+T4 | pending |
| adv-review.md | 347 | partial | `adv_change_validate` | Review dimensions agent-driven | T3+T4 | pending |
| adv-cleanup.md | 291 | partial | `adv_change_bulk_close`, `adv_change_close` | Triage agent judgment | T3+T4 | pending |
| adv-archive.md | 263 | full | `adv_change_archive`, `adv_gate_complete release` | — | T3 | pending |
| adv-design.md | 234 | partial | (validator subagent), `adv_change_update` | Design judgment is agent-driven | T3+T4 | pending |
| adv-reflect.md | 230 | full | `adv_reflect` tool | — | T3 | pending |
| adv-improve.md | 183 | inherent | — | Research/improvement methodology | T5 | pending |
| adv-slop-scan.md | 163 | inherent | `slop-detection` skill | Methodology in skill | T5 | pending |
| adv-proposal.md | 147 | partial | `adv_change_create` (problemStatement param), `clarify-readiness.ts` | Synthesis is agent-driven | T3+T4 | pending |
| adv-clarify.md | 127 | inherent | — | Socratic methodology; agent-driven | T5 | pending |
| adv-task.md | 122 | partial | `adv_change_create` + bundled gate completions | Bundling is agent-driven | T3+T4 | pending |
| adv-problem.md | 116 | inherent | — | Triage methodology | T5 | pending |
| adv-audit.md | 105 | inherent | — | Audit methodology | T5 | pending |
| adv-idea.md | 101 | inherent | — | Triage methodology | T5 | pending |
| adv-arch-scan.md | 100 | inherent | `arch-detection` skill | Methodology in skill | T5 | pending |
| adv-refactor.md | 92 | inherent | — | Refresh methodology | T5 | pending |
| adv-comp-scan.md | 91 | inherent | `comp-research` skill | Methodology in skill | T5 | pending |
| adv-tron.md | 61 | full | `tron` skill, `adv-tron` agent | — | T3 | pending |
| adv-tron.md → SKILL | (in skill) | inherent | — | Investigation methodology | T5 | pending |
| adv-validate.md | 50 | full | `adv_change_validate` | — | T3 | pending |
| adv-status.md | 46 | full | `adv_status` | — | T3 | pending |
| adv-coordinate.md | 43 | inherent | — | Coordination methodology | T5 | pending |

---

## Inventory: skills/*/SKILL.md (6 files, ~845 lines)

| File | Lines | Dominant Class | Code Reference | Gap Rationale | Pass | Status |
|---|---|---|---|---|---|---|
| adv-cost-governance-methodology | 291 | partial | `adv_investment_report` | Methodology + worked example; tool exists for thresholds | T4 | pending |
| adv-user-intuit | 155 | inherent | — | Comparison protocol; agent-driven | T5 | pending |
| adv-tron | 138 | inherent | — | Investigation methodology | T5 | pending |
| adv-arch-detection | 95 | inherent | — | Detection methodology | T5 | pending |
| adv-slop-detection | 90 | partial | `adv_slop_scan` tool | Tool implements detection; methodology is selection criteria | T4 | pending |
| adv-comp-research | 76 | inherent | — | Research methodology | T5 | pending |

---

## Asset Test Audit

> Section populated by T1.5. Empty until then.

| Test File | Assertion | Type | Backed Spec | Migration Plan | Status |
|---|---|---|---|---|---|
| _populate via T1.5_ | | | | | pending |

---

## Summary

| Class | Section count (approx) | Total lines | Pass owner |
|---|---|---|---|
| **full** (pointer + table) | 22 | ~700 | T2 (ADV_INSTR + adv.md), T3 (voice canon + commands) |
| **partial** (pointer + table + gap) | 18 | ~1,400 | T4 (all surfaces) |
| **inherent** (structured template) | 35 | ~1,800 | T5 (all surfaces) |
| frontmatter / out-of-scope | — | ~3,800 | n/a |

Total in-scope content: ~3,900 lines across ~75 sections. Compression target: pointer-line + table for `full` sections (typically 30→8 lines), pointer + table + gap for `partial` (typically 50→12 lines), structured template for `inherent` (typically 40→25 lines).

## Stop Condition (UD3)

Compression halts when no remaining row is classified `full` or `partial`. All remaining rows must be `inherent` (handled by re-templating, not compression).

The inventory table is the mechanical oracle for this — when its `full` and `partial` rows are all `Status: done`, T2/T3/T4 are complete. T5 then re-templates `inherent` rows.

## Provenance

| Reference | Role |
|---|---|
| `change/reducepromptloadonadvcontrol/proposal.md` | Why this work exists |
| `change/reducepromptloadonadvcontrol/agreement.md` | Locked AC + UD1–UD4 + AD1–AD5 |
| `change/reducepromptloadonadvcontrol/design.md` | KD1–KD8, including taxonomy and templates |
| `.adv/specs/advance-meta/spec.json` § rq-proseReduction01–04 | Durable invariants (added by T0c) |
| `plugin/src/manifest-doc-drift.test.ts` | Drift enforcement (extended by T7) |
