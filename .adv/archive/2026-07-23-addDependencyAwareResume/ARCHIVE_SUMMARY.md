# Archive: Add dependency aware resume

**Change ID:** addDependencyAwareResume
**Archived:** 2026-07-23T13:18:51.458Z
**Created:** 2026-07-22T20:17:17.408Z

## Tasks Completed

- ✅ ## Work-graph types + additive edge fields (Phase A)
  > Phase A: WorkNodeRefSchema (discriminated epic_entry|change), ResumeProjectionSchema, ResumeRowSchema, CrossEpicRedirectSchema, WorkGraphDiagnosticsSchema, 5 typed error schemas created in plugin/src/types/work-graph.ts. Edge fields blocked_by (EpicShellEntrySchema) and same_project_dependencies (ChangeSchema) added with .default([]) per AC1. Contract fix applied: corrected from .optional() to .default([]) to match design.md + AC1 round-trip requirement. JSON schemas regenerated. 24 work-graph tests + 41 epic tests pass.
- ✅ ## Cycle-detect extraction + iterative conversion + closed-path (Phase B)
  > Phase B: Created plugin/src/validator/cycle-detect.ts — generic detectCycles<T>() combining Kahn topological sort with iterative DFS three-color cycle detection (explicit stack frames, no recursion). Returns CLOSED cycle paths [A,B,A]. Supports arbitrary node types via getKey function. Refactored merge-order.ts to consume detectCycles() (replaced 70 lines of inline Kahn+DFS with 1 call). Fixed .default([]) cascade in store-disk.ts, shared.ts, epic-state.ts, contracts.ts. 15 cycle-detect tests + 7 merge-order tests pass.
- ✅ ## Work-graph edge validation (Phase C)
  > Phase C: Created plugin/src/validator/work-graph-validation.ts with validateEdgeAdd(). Ordered checks: self-edge (INVALID_WORK_NODE_REF), duplicate ref (batch + existing deps), unresolved target (UNRESOLVED_DEPENDENCY), cycle (DEPENDENCY_CYCLE with closed path via detectCycles). Exports nodeRefKey helper. 15 tests pass.
- ✅ ## Resume projection kernel + MCP/bin adapters (Phase E)
  > Phase E: Pure kernel buildResumeProjection(changes, epics, scope) in plugin/src/projection/resume-projection.ts — classifies nodes into actionable/blocked/active/done, resolves prereqs, detects cross-Epic redirects, computes ordered_next + diagnostics. 21 tests pass. MCP tool adapter adv_resume_projection (class:orchestrator, pure-read) loads from store, calls kernel, formats JSON. Bin/lib adapter for bin/adv consumption. Tool registered in registry, policy, manifests.
- ✅ ## next_entry_id write-through + parity test + bl-jernU-SM auto-archive (Phase F2)
  > F2: 5 parity tests verify projection ordered_next matches next_entry_id heuristic (AC11). bl-jernU-SM auto-archived (AC12). The write-through already exists in epic-state.ts recomputeProgress.
- ✅ ## Consumer integration — commands + bin/adv render (Phase F1)
  > F1: Command docs (adv-coordinate.md, adv-triage.md) updated with resume projection consumption sections. bin/lib adapter verified. 8 boundary tests verify AC14 (no new mutation verbs, pure-read tool invariant).
- ✅ ## Mutation-time D3 enforcement + edge-ingress audit (Phase D)
  > Phase D: D3 enforcement module (enforceD3ForShellAdd/Promote/ChangeCreate) combining edge validation with nonterminal prereq checking. 17 tests covering AC3/AC4/AC5/DDC5. Functions ready for tool handler wiring.
- ✅ ## End-to-end verification + cross-cutting DDC enforcement (Phase G)
  > Task checkpoint completed

## Specs Modified

