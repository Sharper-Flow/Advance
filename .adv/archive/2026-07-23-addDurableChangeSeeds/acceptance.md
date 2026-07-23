# Acceptance

Reviewed at: 2026-07-23T17:52:09.866Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Durable context (background, references, constraints, avoidances, design direction, cross-project hints) can be captured on workflow-free primitives without spawning a Temporal workflow | pass | packet stored on shell/backlog records (workflow-free primitives); no Temporal workflow spawned for packet persistence |
| SC2 | success_criterion | Promotion carries context forward into proposal without re-derivation | pass | epic.test.ts promotion injects packet verbatim without re-derivation; 77 pass |
| SC3 | success_criterion | Future work visible in status output and CLI roadmap without forced Epic membership | pass | adv_status future_work + bin/adv roadmap project backlog items independent of Epic membership |
| AC1 | acceptance_criterion | `EpicShellEntrySchema` parses with optional `context_packet`; existing shells without packet parse unchanged | pass | types/epics.ts EpicShellEntrySchema has optional context_packet; future-work.test.ts confirms existing shells parse unchanged |
| AC2 | acceptance_criterion | `BacklogItemSchema` parses with optional `context_packet`; existing backlog items parse unchanged | pass | types/backlog.ts BacklogItemSchema has optional context_packet; future-work.test.ts confirms existing items parse unchanged |
| AC3 | acceptance_criterion | Serialized packet ≤16 KiB enforced at validation; per-field bounds (background ≤4 KiB, references ≤12, constraints/avoidances ≤12 × 512 B, design_seed ≤6 KiB) enforced | pass | context-packet-validation.test.ts: assertPacketSize 16KiB + per-field bounds; 12 pass (adv_run_test tr_mrxt15qs) |
| AC4 | acceptance_criterion | `adv_epic_promote_shell` injects packet content into generated proposal seed section verbatim, with promotion provenance (source shell entry_id + timestamp) | pass | epic.test.ts promotion injects packet into proposal seed ## Future-Work Context appendix verbatim with provenance; 77 pass (tr_mrxt1p2k) |
| AC5 | acceptance_criterion | `adv_status` MCP output includes future-work rows (shells with packet presence indicator) — additive, no breaking change to existing fields | pass | status.test.ts future_work projection additive in summary/hygiene views; 60 pass (tr_mrxt1f9b) |
| AC6 | acceptance_criterion | `bin/adv roadmap` CLI command renders future-work rows with packet summary | pass | bin/lib/roadmap.test.ts [ctx] markers + ## Backlog section; bun test bin/ 300 pass (tr_mrxt14sp) |
| AC7 | acceptance_criterion | `adv_epic_add_shell` accepts optional `context_packet` input; `adv_backlog_add` accepts optional `context_packet` input | pass | adv_epic_add_shell + adv_backlog_add accept optional context_packet; epic.test.ts + backlog-shell.test.ts 13 pass (tr_mrxt1ozq) |
| AC8 | acceptance_criterion | Backlog→change packet copy is agent-mediated: the promoting command reads the backlog item's packet and passes it to `adv_change_create`; `adv_backlog_promote` remains a pure record operation (no proposal generation) | pass | adv_backlog_promote remains pure record op (backlog-store.ts/backlog-shell.ts); packet agent-mediated via adv_change_create on promotion |
| AC9 | acceptance_criterion | Cross-project `target_path` stored in packet is never treated as authorization — promotion requires normal `target_path` confirmation/revalidation | pass | validation (parsePacket/assertPacketSize) ignores target_path; promotion requires normal target_path confirmation — never auto-authorized |
| C1 | constraint | Packet serialized size ≤16 KiB; per-Epic aggregate packet budget ≤256 KiB (protects Temporal continueAsNew ~1.8 MB hard cap) | respected | assertPacketSize 16384 + assertEpicAggregatePackets 262144 enforced at add_shell/promotion; context-packet-validation.test.ts |
| C2 | constraint | addDependencyAwareResume (Capability A) already landed on trunk — WorkNodeRefSchema, blocked_by on shells, resume projection present. This change builds additively; clean seam (B owns packet content, A owns graph topology) | respected | clean seam — packet content (this change) separate from graph topology (addDependencyAwareResume, already on trunk) |
| C3 | constraint | Backward-compatible additive field — `.optional()` with Zod; no migration needed for existing JSONL backlog or Epic projections | respected | additive .optional() Zod field; no migration; existing JSONL/Epic projections parse unchanged (AC1/AC2) |
| C4 | constraint | replaceRecoveryToolSprawl (HARD dependency) already archived 2026-07-15 — cleared | respected | replaceRecoveryToolSprawl archived 2026-07-15 (precondition cleared, not re-verified here) |
| DONT1 | avoidance | Must NOT treat a stored `cross_project_target.target_path` as authorization | respected | stored cross_project_target.target_path never treated as auth; promotion requires confirmation (AC9) |
| DONT2 | avoidance | Must NOT alter `title` or `success_hint` semantics — they stay OUTSIDE the packet | respected | title/success_hint stay outside packet; packet is a separate field, semantics untouched |
| DONT3 | avoidance | Must NOT create a unified entity merging backlog JSONL, Epic-shell projection, and active Change | respected | no unified entity; backlog JSONL, Epic-shell projection, active Change remain separate stores; packet copied on promotion |
| DONT4 | avoidance | Must NOT make Epic membership mandatory for backlog items or one-off changes | respected | Epic membership not mandatory; future_work projects backlog items independent of Epic (SC3) |
| DONT5 | avoidance | Must NOT add mutation verbs beyond `context_packet` on existing add/promote tools | respected | only context_packet added to existing add/promote tools; no new mutation verbs |

