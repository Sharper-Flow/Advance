---
name: adv-apply-methodology
description: "TDD work loop, retry protocol, context freshness, and task completion rules for implementation"
keywords: ["apply", "implementation", "tdd", "retry", "execution", "testing", "work-loop"]
metadata:
  priority: high
  source: ADV_INSTRUCTIONS.md
---

# Apply Methodology Skill

## Purpose

Reusable implementation methodology for ADV apply workflows. Provides the TDD work loop shape, retry protocol, context freshness rules, and task completion criteria.

**Canonical sources:**
- `ADV_INSTRUCTIONS.md § Context Freshness` — two-tier context loading protocol
- `ADV_INSTRUCTIONS.md § TDD Protocol (RSTC)` — red/green/trivial phases
- `ADV_INSTRUCTIONS.md § Doom Loop Detection` — retry budget and escalation
- `ADV_INSTRUCTIONS.md § Cross-Repo Execution` — workdir switching protocol

## TDD Work Loop

| Phase | Action | Evidence |
|-------|--------|----------|
| Red | Write failing test → run → show failure | Test output with exit code ≠ 0 |
| Green | Implement → run → show pass | Test output with exit code 0 |
| Trivial | Set `tdd_intent: "not_applicable"` | Rationale in task notes |

## Retry Protocol

| Error type | Examples | Action |
|------------|----------|--------|
| SEMANTIC | Type errors, test failures, logic bugs | Diagnose → Fix → Retry (3×) |
| TRANSIENT | Network timeout, flaky test | Wait 5s → Retry once |
| ENVIRONMENTAL | Missing dep, config not found | Escalate immediately |

Before any retry: emit diagnosis with root cause analysis and planned approach. Each attempt must have a different strategy.

## Task Completion Rules

- Verify build/tests/lint pass after each task
- Mark done only after incremental verification passes
- Use `adv_task_show` for per-task context refresh (not `adv_change_show`)
- Use task IDs only in TodoWrite

See `ADV_INSTRUCTIONS.md` for the full context freshness, TDD, retry, and cross-repo protocols.

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns the execution gate
- **Canonical sources** — defer to `ADV_INSTRUCTIONS.md` for detailed protocol rules
- **No workflow sequencing** — the command owns phase ordering and task loop
