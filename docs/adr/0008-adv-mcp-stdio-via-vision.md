# ADR 0008: ADV MCP read surface via stdio subprocess under Vision HTTP termination

- **Status:** Proposed (pending archive of `addAdvMcpReadSurface`)
- **Date:** 2026-07-21
- **Associated change:** `addAdvMcpReadSurface` (Epic: `systemizeAdvOrchestration`)
- **Supersedes:** none
- **Related:** ADR 0001 (adv prefix), scout SCOUT-1..4

## Context

The ADV plugin registers 83 unique `adv_*` tools that load as top-level plugin tools in every OpenCode Code Mode prompt. Tool-schema weight is the #1 cause of ADV workflow feeling "heavier and slower." OpenCode 1.18.4 CodeMode only defers **MCP server tools**; plugin tools are exempt.

To move ~13 Tier-4 read-only tools out of every prompt and into on-demand `tools.adv.*` discovery, we need a managed MCP server that:

1. Speaks the Model Context Protocol
2. Shares ADV internals (storage reads, project-id resolver, tool handlers)
3. Stays strictly read-only (no mutation/approval/operator paths)
4. Isolates failure (MCP crash never disables plugin)
5. Survives across OpenCode session restarts
6. Resolves project identity structurally (no per-call override)

Three transport topology options were considered:

- **(a) HTTP child** — ADV subprocess speaks HTTP/SSE directly
- **(b) Per-session OpenCode local stdio** — OpenCode spawns stdio child per session
- **(c) Stdio subprocess under Vision HTTP termination** — Vision spawns stdio child, terminates HTTP, supervises lifecycle

## Decision

**Option (c): stdio subprocess under Vision HTTP termination.**

The ADV MCP server is a Node stdio process (`plugin/dist/mcp-server.js`) using `@modelcontextprotocol/sdk` v1.x (`McpServer` + `StdioServerTransport`). Vision spawns one subprocess per ADV-enabled repo, terminates HTTP on a localhost port (6298+ range), bridges HTTP↔stdio, and provides lifecycle supervision (`restart_policy: on-failure`, `max_restarts: 5`, `health_check_interval: 30s`). OpenCode connects via `mcp.adv: { type: "remote", url: "http://localhost:<port>/mcp" }`.

Each ADV-enabled repo gets its own Vision entry + dedicated port + project-pinned cwd. The Vision entry's `cwd:` field is the **single source of truth** for project identity; no `ADV_MCP_PROJECT_ROOT` env var.

### Tier-4 catalog (13 tools, AC2')

| # | Tool name | Source tool | Classification |
|---|---|---|---|
| 1 | `status` | `adv_status` | needs-temporal + needs-host-probe |
| 2 | `spec` | `adv_spec` | needs-context |
| 3 | `wisdom_list` | `adv_wisdom_list` | needs-context |
| 4 | `reflection_list` | `adv_reflection_list` | needs-context |
| 5 | `project_context` | `adv_project_context` | pure |
| 6 | `backlog_list` | `adv_backlog_list` | needs-context |
| 7 | `backlog_show` | `adv_backlog_show` | needs-context |
| 8 | `epic_list` | `adv_epic_list` | needs-temporal |
| 9 | `epic_show` | `adv_epic_show` | needs-temporal |
| 10 | `wip_state` | `adv_wip_state` | needs-temporal |
| 11 | `worktree_triage` | `adv_worktree_triage` | needs-host-git |
| 12 | `tool_catalog` | `adv_tool_catalog` | pure |
| 13 | `tool_describe` | `adv_tool_describe` | pure |

Five tools were removed from the original 18-tool proposal:
- `adv_reflect` (pure write, violates DONT1)
- `adv_project_metadata` (`action: read|write|list`, mutates)
- `adv_conformance` (`action: status|init|lock|unlock|override|run`, mutates)
- `adv_session_list` (host PID ACL tied to OpenCode's own process)

## Rationale

### Pattern fit (5 of 9 production MCP servers use this exact topology)

Vision-managed stdio subprocess is the established long-term pattern for Node-based MCP servers in this user's stack: lgrep, context7, exa, svelte, notion (verified by reading `~/.config/vision/servers.yaml:11-62,108-123`). Only playwright uses `transport: managed-http` because the Playwright subprocess itself speaks HTTP. Episode is a Rust MCP server (`rmcp = "2.2.0"` with `transport-io`) — also stdio under Vision, same topology different language.

### Resolves prior validator blockers

- **Shared `process.cwd()` cannot vary by workspace** → resolved by per-project Vision entries pinning cwd at spawn
- **DNS rebinding on loopback** → moot; subprocess has no network listener

### SDK choice

`@modelcontextprotocol/sdk` v1.x (production-supported). v2 beta explicitly avoided per researcher guidance (KD5).

The MCP server uses **`McpServer` (high-level)** rather than the low-level `Server` class. `registerTool` is the API for schema-validated tool registration. The skeleton smoke test (`plugin/src/mcp-server/sdk-exports.test.ts`) verifies actual v1.29.0 exports.

### SDK-free catalog module (KD2, AMEND-3)

Original KD2 plan: extract `PUBLIC_TOOL_ENTRIES` + `ADV_TOOL_METADATA` into an SDK-free canonical module (`plugin/src/tool-catalog-entries.ts`).

**Discovery during execution:** `PUBLIC_TOOL_ENTRIES` is derived from `PUBLIC_TOOL_GROUPS` which imports 30+ SDK-coupled tool-group modules (`tools/spec.ts`, `tools/change.ts`, etc.). Full extraction would require refactoring all tool-group modules to be data-only — too invasive.

**Resolution (AMEND-3):** Extract only types + pure functions + derivation tables to `plugin/src/tool-catalog-entries.ts` (shipped in task `tk-9ad1a04909a2`). Runtime data access via dynamic import (`await import("../tool-registry.js")`); matches the existing `adv_contract_mint` pattern at `tool-registry.ts:1330-1332`. KD2 intent preserved: MCP descriptors depend on SDK-free module only; MCP rebuilds stay decoupled from SDK changes.

### Capability/version handshake (KD7, AMEND-4)

`serverInfo` carries only MCP-standard `name` + `version` (per MCP spec). ADV-specific compatibility metadata (`tier4_tools`, `adv_contract_version`) is exposed via the `adv_handshake` meta-tool — `serverInfo.capabilities` is reserved for protocol-level declarations (sampling/roots/etc.), not arbitrary metadata bags.

`ADV_CONTRACT_VERSION = 1` tracks the **handshake schema shape** (not plugin version, not SDK version). Bump on breaking changes to `HandshakeResult` (tool removed from `tier4_tools`, field renamed, semantic redefined).

## Consequences

### Positive

- **83% prompt-weight reduction** (combined with sibling `slimMutationToolSurface`): 83 → 14 top-level tools
- **Read-only isolation** (DONT1): no mutation path opens through MCP
- **Failure isolation** (SC4): MCP crash never disables plugin or mutates ADV state
- **Per-project isolation** (KD8): one Vision entry per repo = one cwd = one project id
- **Reversibility**: falling back to per-session OpenCode stdio spawn is one OpenCode config change (no ADV code change)
- **Cross-MCP compatibility verified**: episode (Rust), lgrep (TS), context7/exa/svelte/time/notion (TS remote) all structurally isolated — distinct namespaces, ports, storage, code

### Negative

- **Operator deploy burden**: each ADV-enabled repo requires a Vision entry + OpenCode config snippet (documented below)
- **No CI coverage of live deploy**: post-deploy smoke (task `tk-6705bb3ceaf0`) was cancelled; requires operator verification per the runbook below
- **Dynamic import overhead**: MCP server pays one-time dynamic-import cost for `tool-registry.js` (~50ms measured) on first tool call

### Neutral

- **Port allocation**: 6298+ sequential per ADV project (episode=6297, lgrep=6278 — no collision)

## Alternatives considered

### (a) HTTP child — rejected

ADV subprocess would speak HTTP/SSE directly. Rejected because:
- Duplicates HTTP/session code already in Vision
- Exposes DNS rebinding surface on loopback (validator blocker PB2)
- No lifecycle supervision without separate wrapper
- Counter to user's established pattern (no production HTTP-child MCP server in stack)

### (b) Per-session OpenCode local stdio — rejected

OpenCode spawns a stdio child per session via `mcp.adv: { type: "local", command: "node", args: ["dist/mcp-server.js"] }`. Rejected because:
- OpenCode does not auto-restart crashed children (verified at `opencode/src/mcp/index.ts#L212-L236`)
- Per-session spawn wastes resources (one subprocess per session vs one per project)
- No cross-session state sharing
- No health checks

## Operator deployment runbook

### Per-project setup

For each ADV-enabled repo:

#### 1. Add Vision entry (`~/.config/vision/servers.yaml`)

```yaml
adv-<project-slug>:
  port: <next-free, 6298+>  # avoid episode=6297, lgrep=6278
  command: /home/jon/.local/share/fnm/fnm
  args:
    - exec
    - --using=24.15.0
    - --
    - node
    - /home/jon/.local/share/Advance/plugin/dist/mcp-server.js
  cwd: "<project-path>"  # single source of truth for project identity; NO env var
  autostart: true
  restart_policy: on-failure
  max_restarts: 5
  health_check_interval: 30s
  session_timeout: 30m
  max_sessions: 20
```

#### 2. Add OpenCode config (`~/.config/opencode/opencode.jsonc`, per-project section)

```jsonc
{
  "mcp": {
    "adv": {
      "type": "remote",
      "url": "http://localhost:<project-port>/mcp",
      "enabled": true
    }
  }
}
```

#### 3. Restart services

```bash
vision daemon reload          # picks up new servers.yaml entry
# Restart OpenCode to pick up new mcp.adv config (NO live reload for plugin config)
```

### Post-deploy verification (deferred from task `tk-6705bb3ceaf0`)

```bash
# 1. Confirm Vision entry is running
vision daemon status | grep adv-<project-slug>

# 2. Confirm MCP server responds (health probe)
curl -s http://localhost:<port>/mcp | head

# 3. From a fresh OpenCode session, call the handshake tool
# In OpenCode agent:
#   const r = await tools.adv.adv_handshake({});
#   console.log(r);  // expect {tier4_tools:[...13 names...], adv_contract_version:1}

# 4. Verify tool catalog
#   const cat = await tools.adv.tool_catalog({});
#   expect 13 Tier-4 entries + adv_handshake

# 5. Verify degradation tagging (when Temporal is down)
#   const s = await tools.adv.status({});
#   expect s to contain degraded:true, source:"disk_projection" or "host_probe_unavailable_in_mcp"
```

### Fresh-session caveat

Source edits and `dist/` builds do NOT update the current OpenCode tool registry. Adding `mcp.adv` to `opencode.jsonc` requires an OpenCode restart before agents can call `tools.adv.*`. Plugin-side code changes (e.g., to `tool-catalog-entries.ts`) require: rebuild → redeploy → restart Vision subprocess → restart OpenCode (if config changed).

### Release gate (constraint C1)

This change MUST NOT release before sibling `slimMutationToolSurface` ships. Verify:

```bash
./scripts/check-release-gate.sh slimMutationToolSurface addAdvMcpReadSurface
# Expect: exit 0 (OK) only after slimMutationToolSurface is archived
```

## References

- Proposal: `addAdvMcpReadSurface` proposal.md (scope-refreshed 2026-07-20)
- Design: `addAdvMcpReadSurface` design.md (10 KDs, 7 DDCs, 12 risks, AMEND-1..4)
- Sibling: `slimMutationToolSurface` (Tier-3 mutation tools → `adv_tool_invoke` routing)
- Scout: SCOUT-1 (Vision stdio topology), SCOUT-2 (pure descriptors), SCOUT-3 (parity harness), SCOUT-4 (bundle manifest)
- Validator: Round-1 FAIL (HTTP-child draft), Round-2 CONFLICT (resolved by UD-V1/V2/V3 user decisions)
- MCP SDK: `@modelcontextprotocol/sdk@1.29.0` — `McpServer`, `StdioServerTransport`, `registerTool`
- Existing pattern: `adv_contract_mint` dynamic-import pattern at `tool-registry.ts:1330-1332`
