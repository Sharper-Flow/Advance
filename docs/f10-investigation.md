# F10 — Non-LLM Tool Execution for Cross-Project ADV Ops

> **HISTORICAL DOCUMENT — preserved for decision context only.**
> Implemented via `cullDeadCodeFixArchive` — references retired tools
> (`adv_workflow_repair`) are historical.
> `rq-nonLlmToolExec01` preserves current LBP: no non-LLM ADV tool execution
> helper ships without stable structural OpenCode/runtime support.

**Status:** Investigation complete 2026-05-02. Recommendation below.
**Origin:** Deferred from change `repairTemporalMigrationDebt` (archived `2026-05-02-repairtemporalmigrationdebt`) due to plugin-boundary scope.

## 2026-05-11 revisit — #71 outcome

Issue #71 asked for ergonomic non-LLM cross-project ADV tool execution. Recheck found no stable OpenCode endpoint for tool execution:

- `/experimental/tool` is registry/list oriented, not a supported execute API.
- `opencode run` / ACP remain LLM-mediated.
- Upstream `anomalyco/opencode#25478` is still the right structural API request.

Decision: do not ship a direct helper now. Any helper that bypasses OpenCode would duplicate ADV plugin startup, STSL/Temporal access, StoreBackend lifecycle, target trust gates, and audit semantics. That violates `rq-nonLlmToolExec01` and creates second-runtime drift.

Supported paths until upstream changes:

- Open a real session in target project for >5 sequential ops.
- Use `opencode run --dir <other> --agent build ...` only for rare one-offs where 60–300s overhead is acceptable.
- Reopen helper design only when OpenCode ships stable tool execution or cross-project ADV op volume justifies a carefully pinned `/tool`-endpoint experiment.

## Problem

Cross-project ADV ops via `opencode run --dir <other> --agent build --dangerously-skip-permissions "..."` incur 60–300s LLM-loop overhead even for verification calls that just need to invoke a single MCP tool and exit. Observed during 2026-05-02 pokeedge cleanup: 8 sequential `adv_workflow_repair` calls cost ~30 minutes of agent loop time when the actual work was 8 single-tool invocations totaling <10s of compute.

## Investigation findings

### 1. `opencode serve` exists

`opencode serve` starts a headless HTTP server on a random port (defaults to 4096). Loads plugins. Suitable as a long-lived per-project daemon.

- `--port` flag accepts 0 for OS-assigned port
- `--print-logs` writes server stdout to the controlling shell
- `--cors` allows additional origins
- `--mdns` enables service discovery (useful for multi-machine setups)

### 2. HTTP API is partially documented

`GET /doc` returns OpenAPI 3.1 spec, but the spec is minimal — only `/auth/{providerID}` and `/log` endpoints are documented. Other endpoints exist but are undocumented:

- `/session`, `/session/{id}`, `/session/{id}/message` — session lifecycle
- `/agent`, `/agent/{name}` — agent registry
- `/tool`, `/tool/{name}` — tool registry (likely the F10 target)
- `/event` — server-sent events
- `/provider`, `/file`, `/project`, `/command`, `/find`, `/config`, `/app`

(Probed by direct GET requests; all return non-zero responses but content is undocumented.)

### 3. `opencode acp` exists

ACP (Agent Client Protocol) server with `--cwd` flag for per-invocation project context. Implements a documented agent protocol but invocations still flow through agent loops (LLM-mediated by design).

### 4. `opencode run --attach <url>` exists

Indicates an established client/server multiplex pattern. New `run` invocations can attach to a running server instead of starting their own.

## Options

| Option                                     | Description                                                                                                       | Risk                                                                                                 | Latency target  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| **A. Defer permanently**                   | Accept 60–300s latency for cross-project ops; document the existing `opencode run` path                           | None                                                                                                 | Status quo      |
| **B. CLI helper using `/tool` endpoint**   | New `scripts/opencode-adv.sh` that maintains a per-project `opencode serve` + POSTs to undocumented tool endpoint | Medium — undocumented endpoint may change between OpenCode versions                                  | <5s             |
| **C. Direct ADV plugin CLI**               | Build standalone CLI from `plugin/src/`; bypass OpenCode entirely                                                 | High — duplicates plugin's project resolution + Temporal connection logic; new compatibility surface | <2s             |
| **D. Upstream `opencode tool` subcommand** | Submit feature request to OpenCode for first-class single-tool invocation                                         | Low (no risk to ADV) but slow (depends on upstream timeline)                                         | <1s, eventually |

## Recommendation

**Phase 1 — Defer with documentation (immediate):** Update `ADV_INSTRUCTIONS.md` cross-project section to note: cross-project ops without a session in the target project incur LLM-loop overhead via `opencode run`; for fast verification, switch sessions instead. Mark F10 as "won't-fix unless cross-project usage volume justifies the work".

**Phase 2 — Option B if usage justifies (deferred follow-up):** If cross-project ADV ops become a hot path (>10/day across the team), implement the CLI helper using `opencode serve` + the undocumented `/tool` endpoint. Pin OpenCode version compatibility. Cite specific endpoint structure in the helper script.

**Phase 3 — Option D as upstream signal (long-term):** File OpenCode feature request for `opencode tool <name> --dir <dir> --args <json>`. This is the right architectural place for it. Track upstream progress.

## Why not Option C

Direct standalone CLI would duplicate:

- Project resolution logic (`utils/project-id.ts`, `tools/target-project.ts`)
- Temporal client lifecycle (`temporal/service.ts`)
- Storage abstraction (`storage/store.ts`)
- All tool registration + arg parsing

This is essentially building a second copy of the plugin runtime. The cost is high enough that Option B (which reuses the existing `opencode serve` runtime) is strictly better for any usage volume that's not "primary access path".

## Resolution status (2026-05-02)

| Phase                 | Status    | Reference                                                                                                                                                                                            |
| --------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 (doc update)  | ✓ Shipped | commit `beddcf5` — added LLM-overhead caveat to ADV_INSTRUCTIONS.md `target_path` matrix                                                                                                             |
| Phase 3 (upstream FR) | ✓ Filed   | [`anomalyco/opencode#25478`](https://github.com/anomalyco/opencode/issues/25478) — `opencode tool <name>` subcommand request                                                                         |
| Phase 2 (CLI helper)  | Deferred  | Tracked as agenda item. Conditional implementation: kick off if (a) issue #25478 doesn't land within ~6 months, OR (b) cross-project ADV op volume crosses ~10/day threshold. Whichever comes first. |

## Why Phase 2 deferred

Phase 2's value depends on:

1. **Upstream timeline** — if #25478 ships in OpenCode within months, Phase 2 work becomes throwaway.
2. **Usage volume** — cross-project ADV ops are currently rare enough that the 60–300s LLM-loop cost is acceptable.
3. **API stability** — the `opencode serve` `/tool` endpoint that Phase 2 would target is undocumented; building against it now risks rework when OpenCode formalizes the API (likely as part of #25478 implementation).

Phase 2 stays viable as a fast-follow if either condition (a) or (b) materializes.

## Original analysis (preserved)

If the user wants Phase 2 immediately, open `addNonLlmToolExecHelper` change (or similar) and treat as standalone work. The ADV agenda has an entry tracking the trigger conditions.
