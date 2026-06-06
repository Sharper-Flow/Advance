## Problem

Primary `adv` orchestrator runs expensive reconnaissance, audit, CI-check, and verify loops *outside* the task graph, on its premium model, with full session context.

### Evidence (7-day local usage audit)
- Primary `adv` = ~82% of reported cost and dominant token volume (~4.9B tokens) vs all subagents combined.
- Within `adv` sessions: ~10,858 read/search calls, ~7,228 shell/test calls, ~846 data/query probes, ~538 research/docs calls — much of it bulk operational work, not gate/task-graph orchestration.
- Top sessions (`ADV operational health status`, `ADV status command output`, `Programmatic CI tool audit`, `completeFleetCutover`) were dominated by reads + shell/test + CI/status probing the orchestrator could shed.

### Root cause
Advance's delegation routing (`rq-contextShed01`, Step 4.5 Context-Shed Test) is **task-graph-scoped** — it routes individual apply-phase tasks. It does NOT govern **orchestrator-session-level operational work** that never becomes a task:
- broad codebase reconnaissance (>5 reads/searches, repo-structure / same-pattern scans)
- DB/log/status/usage audits
- **GitHub CI / check-run / status investigation**
- repeated verify/test bursts

Because these are not tasks, the 4.5 routing never fires, and they run on the expensive primary model with no context shedding. The orchestrator keeps doing long recon + shell/test + CI-check loops before/around delegation.

### Why this matters now
- Cost: premium-model token burn on work cheaper context-isolated workers (`explore`, `general`, `adv-tron`) could do.
- Context hygiene: long noisy operational output pollutes the orchestrator's decision context.
- It is an instruction/spec gap, not a runtime bug — the fix belongs in Advance's durable agent prompt + spec, not a local override.