# LOC Baseline: Signal-Driven Change Workflow

> **ADV change:** `refactorChangeWorkflowsSignal`  
> **Captured:** 2026-05-06  
> **Purpose:** SC8 baseline for ≥30% `plugin/src/temporal/**/*.ts` LOC reduction

## Baseline Summary

| Area | Files | LOC |
|---|---:|---:|
| `plugin/src/temporal/**/*.ts` | 63 | 18,630 |
| Target one-shot/deletion tool files that currently exist | 2 | 554 |

SC8 requires ≥30% reduction in `plugin/src/temporal/**/*.ts`.

| Metric | LOC |
|---|---:|
| Temporal baseline | 18,630 |
| Required reduction (30%) | 5,589 |
| Maximum post-change temporal LOC | 13,041 |

## Target Tool Files

Existing at baseline:

| File | LOC |
|---|---:|
| `plugin/src/tools/change-import.ts` | 275 |
| `plugin/src/tools/migrate-cleanup.ts` | 279 |

Missing at baseline (already absent or implemented inside other files):

- `plugin/src/tools/change-diagnose.ts`
- `plugin/src/tools/archive-sweep.ts`
- `plugin/src/tools/mesh-scan.ts`
- `plugin/src/tools/task-run-status.ts`
- `plugin/src/tools/task-tdd.ts`
- `plugin/src/tools/task-evidence.ts`

## Temporal File Counts

| LOC | File |
|---:|---|
| 351 | `plugin/src/temporal/__tests__/concurrent-signaling.itest.ts` |
| 88 | `plugin/src/temporal/__tests__/fixtures/mature-project.ts` |
| 207 | `plugin/src/temporal/__tests__/mature-project-eviction.test.ts` |
| 85 | `plugin/src/temporal/__tests__/with-test-env.test.ts` |
| 69 | `plugin/src/temporal/__tests__/with-test-env.ts` |
| 99 | `plugin/src/temporal/__tests__/workflow-bundle-imports.test.ts` |
| 173 | `plugin/src/temporal/__tests__/workflow-termination.test.ts` |
| 157 | `plugin/src/temporal/activities.disk-projection.test.ts` |
| 330 | `plugin/src/temporal/activities.test.ts` |
| 771 | `plugin/src/temporal/activities.ts` |
| 223 | `plugin/src/temporal/archive-activity.test.ts` |
| 703 | `plugin/src/temporal/change-state.ts` |
| 44 | `plugin/src/temporal/client.test.ts` |
| 88 | `plugin/src/temporal/client.ts` |
| 616 | `plugin/src/temporal/contracts.ts` |
| 75 | `plugin/src/temporal/fallback-telemetry.test.ts` |
| 28 | `plugin/src/temporal/fallback-telemetry.ts` |
| 407 | `plugin/src/temporal/health-monitor.test.ts` |
| 296 | `plugin/src/temporal/health-monitor.ts` |
| 88 | `plugin/src/temporal/health-probe.ts` |
| 229 | `plugin/src/temporal/in-process-worker.ts` |
| 183 | `plugin/src/temporal/list-change-workflows.test.ts` |
| 131 | `plugin/src/temporal/list-change-workflows.ts` |
| 366 | `plugin/src/temporal/messages.ts` |
| 74 | `plugin/src/temporal/migration-barrier.test.ts` |
| 96 | `plugin/src/temporal/migration-ordering.test.ts` |
| 473 | `plugin/src/temporal/migration-replay.ts` |
| 165 | `plugin/src/temporal/migration.test.ts` |
| 194 | `plugin/src/temporal/migration.ts` |
| 199 | `plugin/src/temporal/observability.test.ts` |
| 284 | `plugin/src/temporal/observability.ts` |
| 225 | `plugin/src/temporal/out-of-process-worker.itest.ts` |
| 525 | `plugin/src/temporal/out-of-process-worker.test.ts` |
| 86 | `plugin/src/temporal/out-of-process-worker.ts` |
| 1,401 | `plugin/src/temporal/project-state.test.ts` |
| 674 | `plugin/src/temporal/project-state.ts` |
| 139 | `plugin/src/temporal/queue-serviceability.test.ts` |
| 251 | `plugin/src/temporal/queue-serviceability.ts` |
| 180 | `plugin/src/temporal/retry-wrapper.ts` |
| 167 | `plugin/src/temporal/runtime-manager.test.ts` |
| 426 | `plugin/src/temporal/runtime-manager.ts` |
| 121 | `plugin/src/temporal/search-attributes.test.ts` |
| 199 | `plugin/src/temporal/search-attributes.ts` |
| 373 | `plugin/src/temporal/service-reconnect.test.ts` |
| 768 | `plugin/src/temporal/service.test.ts` |
| 348 | `plugin/src/temporal/service.ts` |
| 54 | `plugin/src/temporal/source-mode-path.test.ts` |
| 146 | `plugin/src/temporal/spike/contracts.ts` |
| 64 | `plugin/src/temporal/spike/messages.ts` |
| 53 | `plugin/src/temporal/spike/migration.ts` |
| 389 | `plugin/src/temporal/spike/workflows.test.ts` |
| 155 | `plugin/src/temporal/spike/workflows.ts` |
| 104 | `plugin/src/temporal/worker-lock.ts` |
| 541 | `plugin/src/temporal/worker-multi.test.ts` |
| 555 | `plugin/src/temporal/worker-multi.ts` |
| 372 | `plugin/src/temporal/worker.test.ts` |
| 345 | `plugin/src/temporal/worker.ts` |
| 108 | `plugin/src/temporal/workflow-bundle-boundary.test.ts` |
| 110 | `plugin/src/temporal/workflows.projection.test.ts` |
| 184 | `plugin/src/temporal/workflows.queries.test.ts` |
| 89 | `plugin/src/temporal/workflows.search-attrs.test.ts` |
| 388 | `plugin/src/temporal/workflows.signal-handlers.test.ts` |
| 1,798 | `plugin/src/temporal/workflows.ts` |

## Verification Command

Run from repo root:

```bash
python -c 'from pathlib import Path
root=Path(".")
temporal=sorted(root.glob("plugin/src/temporal/**/*.ts"))
tool_names=["change-diagnose","archive-sweep","mesh-scan","task-run-status","task-tdd","task-evidence","change-import","migrate-cleanup"]
tools=[root/"plugin/src/tools"/(name+".ts") for name in tool_names]
def count(p): return len(p.read_text().splitlines())
print("TEMPORAL_TOTAL", sum(count(p) for p in temporal), len(temporal))
print("TARGET_TOOL_TOTAL", sum(count(p) for p in tools if p.exists()), len([p for p in tools if p.exists()]))
'
```
