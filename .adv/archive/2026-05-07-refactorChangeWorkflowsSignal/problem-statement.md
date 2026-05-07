# Problem Statement

## Symptom

ADV's Temporal-backed workflows fail in concurrent multi-session scenarios with opaque `Workflow Update failed` errors. Recovery paths (`adv_workflow_repair`, `adv_change_diagnose`, worker restart, full session restart) often fail to recover. The bug pattern has produced ~17 closed issues since the Temporal cutover and ~4 still open (#33, #39, #46, #48).

## Root Cause

ADV uses Temporal as a synchronous database where every state mutation is a workflow update with strict validation, dual-writing to disk and to Temporal. This produces:

1. **Update collisions under concurrency** — multiple agents signaling the same change workflow trigger update validation rejections that surface as opaque `Workflow Update failed`.
2. **Disk-vs-Temporal drift** — the dual-write authority creates divergence; tools like `adv_workflow_repair`, `adv_change_diagnose`, `adv_change_import`, `adv_orphan_sweep` exist solely to manage this drift, and don't always succeed.
3. **Single-poller-per-project topology** — Temporal task queues by design serve one worker; multi-session same-project produces peer-owned worker confusion (#33, #34, #35).
4. **Replay determinism footguns** — `new Date()` in update handlers (#46) is one instance of a class of bugs that exists only because of how we use Temporal.
5. **Domain error opacity** — `retry-wrapper.ts` collapses Temporal `ApplicationFailure` detail to generic strings, making recovery impossible to automate.

## Why This Matters

Comparison with `claude-tempo` (a multi-session Claude Code coordination tool that uses Temporal natively):

- claude-tempo uses long-lived workflows with signal-driven mutations and exhibits zero of ADV's failure modes
- claude-tempo's session.ts is 1,876 lines of rich domain logic
- ADV's `temporal/` directory is 18,551 lines, most of it infrastructure to bridge "disk authoritative" and "workflow authoritative"
- The bug class is structural, not implementation-quality.

## Mission Alignment

ADV's mission is to give human orchestrators maximum power over their agentic workflows on a single user's machine. The current architecture optimizes for distributed audit/compliance (which we don't need) at the expense of the orchestration responsiveness we do need.

## Scope of the Problem

This problem statement covers the architectural refactor needed to fix the bug class structurally. Out of scope: changes to the 7-gate sequence, slash commands, skills, sub-agents, or worktree management as a concept. The refactor preserves all user-facing surface while replacing the Temporal usage pattern from "workflow as database" to "workflow as state holder with signal-driven mutation."
