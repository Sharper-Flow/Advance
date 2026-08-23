# Advance Meta

> **Version:** 1.35.1
> **Updated:** 2026-08-16

## Purpose

Capability: Cross-cutting ADV concerns — config diagnostics, metadata filters, shutdown lifecycle, due-diligence routing, and synthetic-state guards. Split from `advance` capability.

## Requirements

### Synthetic Validation Draft Isolation

**ID:** `rq-synthstate01` | **Priority:** **[MUST]**

Supported internal validation or parity flows must not leave synthetic draft changes in live ADV project state. Protection must preserve legitimate user-created drafts and keep draft/status surfaces focused on real changes.

#### Scenarios

**Synthetic validation families blocked on supported create path** (`rq-synthstate01.1`)

**Given:**
- A supported internal validation or parity flow attempts to create a synthetic draft change matching a reserved parity-validation family on live ADV state

**When:** The create path executes

**Then:**
- The synthetic draft is not persisted to the live project state
- The caller receives a clear error or bounded degraded outcome directing synthetic activity to isolated temp/test storage

**Legitimate parity wording remains allowed** (`rq-synthstate01.2`)

**Given:**
- A normal user-driven change proposal uses benign wording that mentions parity but does not match a reserved synthetic family

**When:** The change is created

**Then:**
- The draft change is persisted normally
- The protection does not block or rename the legitimate draft

**Draft and status surfaces stay clear after validation activity** (`rq-synthstate01.3`)

**Given:**
- Supported internal validation activity has run

**When:** adv_change_list with status draft or adv_status is executed on the live project

**Then:**
- Stale synthetic parity-validation drafts are absent from live draft results
- Real user-authored drafts remain visible

---

### Status Config Diagnostics and Feature Flags

**ID:** `rq-advcfg01` | **Priority:** **[MUST]**

adv_status must surface project.json diagnostics and include parsed feature flag values so agents can see config health and runtime policy settings without opening files.

#### Scenarios

**Invalid project config is surfaced** (`rq-advcfg01.1`)

**Given:**
- project.json is malformed or schema-invalid

**When:** adv_status is executed

**Then:**
- Output includes a config error or warning recommendation
- The command does not fail hard due to config parse issues

**Feature flags are visible in status output** (`rq-advcfg01.2`)

**Given:**
- project.json parses successfully

**When:** adv_status is executed

**Then:**
- Output includes feature_flags values
- Defaults are applied when flags are omitted
- worker_singleton_enforce defaults false when omitted
- worktree_guard_enforce defaults true when omitted

---

### Live Status Slash Command Uses CLI Bridge

**ID:** `rq-statusCliBridge01` | **Priority:** **[MUST]**

The default /adv-status slash command must remain a thin OpenCode shell-output bridge over `adv status --no-color`. The CLI status command is live disk-backed by default for active change rows: it must query live ADV state before rendering, must fail closed when live state is unavailable, and must not silently render stale disk projections as current active changes. The command file must not instruct the agent to call ADV MCP status/list/show/spec tools, synthesize cross-change health, read roadmap freshness, or add recommendations. Remediation for disk/server/worker failures belongs in CLI stdout/stderr or JSON output, not in the slash-command prompt.

**Tags:** `status`, `command`, `cli`, `no-fanout`

#### Scenarios

**Default slash command runs live CLI table** (`rq-statusCliBridge01.1`)

**Given:**
- A user invokes /adv-status
- The installed `adv` CLI is available on PATH

**When:** The OpenCode command template is processed

**Then:**
- The command template injects shell output from `adv status --no-color`
- The default output is the live disk-backed CLI status table plus active/archived/closed counts
- ANSI color/control output is disabled for stable command-template rendering

**Default slash command forbids agent fanout** (`rq-statusCliBridge01.2`)

**Given:**
- The /adv-status command file is inspected

**When:** Its default body is evaluated for status work instructions

**Then:**
- It does not instruct the agent to call adv_status, adv_change_list, adv_change_show, adv_gate_status, or adv_spec
- It does not instruct the agent to build cross-change health, roadmap freshness, per-spec listings, or synthesized recommendations
- It tells the agent to return the command output verbatim without analysis

**Live CLI failure fails closed without stale active fallback** (`rq-statusCliBridge01.3`)

**Given:**
- The /adv-status command template runs `adv status --no-color`
- disk connection, projection lookup listing, or change projection query is unavailable or times out

**When:** The default /adv-status path handles that result

**Then:**
- The CLI exits non-zero and surfaces remediation in stdout/stderr or JSON
- Disk projections are not used as a substitute source for active rows
- The failure is not silently rendered as a current status table
- No fallback path instructs the agent to call ADV MCP status/list/show/spec tools
- Detailed health diagnostics remain an explicit opt-in action

---

### Managed Local ADV CLI Install

**ID:** `rq-advCliLocalInstall01` | **Priority:** **[MUST]**

`scripts/deploy-local.sh` must own the local `adv` CLI install. It must deploy the whole CLI payload to `$HOME/.local/share/Advance/bin`, expose it via `$HOME/.local/bin/adv`, detect missing, stale, wrong-target, unsafe, or PATH-shadowed installs, and verify installed status JSON is live-status metadata (`source: "disk"` on success or fail-closed live error metadata) rather than stale disk-only `schema_version: 1` output. The installer must not add CLI mutation authority or silently overwrite unrelated user files.

**Tags:** `install`, `cli`, `deploy-local`, `status`

#### Scenarios

**Deploy-local owns stable CLI payload and entrypoint** (`rq-advCliLocalInstall01.1`)

**Given:**
- A user runs `scripts/deploy-local.sh --fix` from a source checkout or release artifact

**When:** The local CLI install is repaired

**Then:**
- The whole `bin/` tree is deployed to `$HOME/.local/share/Advance/bin`
- `$HOME/.local/bin/adv` points at the stable deployed `bin/adv` entrypoint
- The entrypoint does not point at a temporary release extraction directory
- The install preserves `bin/adv` sibling module imports and deployed plugin-relative imports

**Check reports install drift and PATH shadowing** (`rq-advCliLocalInstall01.2`)

**Given:**
- The local `adv` target is missing, stale, points at the wrong target, or PATH resolves another `adv` first

**When:** `scripts/deploy-local.sh --check` runs

**Then:**
- The check exits non-zero
- The output identifies the exact missing, stale, wrong-target, or shadowed condition
- PATH shadowing includes remediation for putting `$HOME/.local/bin/adv` first

**Fix repairs only recognized ADV CLI artifacts** (`rq-advCliLocalInstall01.3`)

**Given:**
- `$HOME/.local/bin/adv` already exists

**When:** `scripts/deploy-local.sh --fix` decides whether to replace it

**Then:**
- Recognized Advance CLI symlinks or regular files may be replaced
- Unrelated file content is refused with manual remediation
- No unrelated local executable is overwritten silently

**Installed status JSON proves live source-current behavior** (`rq-advCliLocalInstall01.4`)

**Given:**
- The local CLI install has been repaired

**When:** The installed `adv status --json` command is verified

**Then:**
- The JSON contains live-status metadata such as `source: "disk"` on success or fail-closed live error metadata
- The JSON does not use stale disk-only `schema_version: 1` as readiness proof
- The installed CLI exposes no mutation subcommands

---

### Root CLI Uses Explicit Plugin Source Boundaries

**ID:** `rq-cliSourceBoundary01` | **Priority:** **[MUST]**

Root `bin/adv` CLI source may import plugin source only through explicit CLI-safe boundary modules. The allowed plugin-source crossings are the pure CLI projection surface and a named live disk CLI boundary (or an equivalent explicitly documented CLI-safe adapter). Broad plugin internals such as storage, tools, tool registry, plugin init, plugin index, and unlisted `plugin/src` paths must be rejected by deterministic boundary tests. The boundary must preserve deployed sibling-module imports, live disk fail-closed status/Epic behavior, and must not introduce stale disk active-state fallback.

**Tags:** `cli`, `source-boundary`, `import-boundary`, `disk`

#### Scenarios

**Root CLI imports only approved plugin source surfaces** (`rq-cliSourceBoundary01.1`)

**Given:**
- Root `bin/adv` or `bin/lib/*` source imports from `plugin/src`

**When:** The CLI source-boundary tests run

**Then:**
- Imports are limited to the pure CLI projection surface and the named live disk CLI boundary or equivalent explicitly documented CLI-safe adapter
- Any import into unlisted `plugin/src` paths fails the structural test
- Same-tier root CLI imports remain allowed

**Broad plugin internals stay out of the root CLI graph** (`rq-cliSourceBoundary01.2`)

**Given:**
- A root CLI source file or CLI-safe boundary module attempts to import plugin storage, tools, tool registry, plugin init, plugin index, or another forbidden plugin runtime surface

**When:** Boundary tests inspect the direct or transitive CLI boundary import graph

**Then:**
- The test fails with the forbidden import path identified
- The CLI boundary remains enforced by deterministic tests rather than prose-only guidance

**Live disk CLI behavior is preserved** (`rq-cliSourceBoundary01.3`)

**Given:**
- The root CLI reads active change rows or Epic IDs through the approved disk CLI boundary

**When:** disk is reachable or unavailable

**Then:**
- Reachable disk reads keep live status/Epic behavior compatible with existing CLI contracts
- Unavailable disk still fails closed with live error metadata
- Disk projections are not used as a substitute source for active rows

**Local install preserves CLI-safe plugin-relative imports** (`rq-cliSourceBoundary01.4`)

**Given:**
- The local `adv` CLI payload has been deployed by `scripts/deploy-local.sh` or release packaging

**When:** The installed CLI resolves its sibling modules and approved plugin-source boundaries

**Then:**
- The deployed CLI entrypoint continues to resolve sibling `bin/` modules
- Approved plugin-relative CLI-safe boundary imports remain resolvable
- No unrelated public package API is implied by the internal boundary module

---

### CLI Status Reads Durable Change Projections

**ID:** `rq-statusCliWorkerFree01` | **Priority:** **[MUST]**

The `adv status` default table MUST build active-change rows from durable change projections and bounded summary shards, not from per-change runtime hydration. The read MUST remain disk-backed and fail closed with explicit degraded metadata when projection reads fail. Lifecycle state, compatibility status/bucket, and current gate MUST remain distinguishable in JSON summaries; terminal-complete or non-open lifecycle changes are excluded from active rows.

**Tags:** `status`, `cli`, `projection`, `disk-backed`

#### Scenarios

**Inactive project returns current rows from projections** (`rq-statusCliWorkerFree01.1`)

**Given:**
- A project has non-archived change projections
- The durable projection store is reachable

**When:** `adv status --json` runs for that project

**Then:**
- The payload identifies the disk projection source without claiming runtime authority
- Each running open-lifecycle change yields one row built from its projection
- Each row exposes lifecycleState separately from status and firstIncompleteGate
- `gateProgressStr` and `firstIncompleteGate` are synthesized from `AdvCurrentGate`
- No per-change runtime hydration is issued for the default table

**Projection unavailable still fails closed** (`rq-statusCliWorkerFree01.2`)

**Given:**
- The durable projection read fails or times out

**When:** `adv status --json` handles that result

**Then:**
- The payload is degraded with an error and remediation
- Zero active rows are returned
- Disk projections are not used as a substitute source for active rows

---

### Local Dashboard Routine Refresh Is Disk-Backed and Read-Only

**ID:** `rq-dashboardWorkerFree01` | **Priority:** **[MUST]**

The local `adv dashboard` routine `/api/state` refresh MUST build ADV summary cards from durable disk projections and summary shards, not from per-change runtime hydration. Routine refresh MUST remain read-only, bounded, cached/coalesced, and explicit about source degradation. Optional detail enrichment may run only after explicit user navigation to a single-change detail route, must be one-change scoped and bounded, and must degrade independently from `/api/state`.

**Tags:** `dashboard`, `projection`, `disk-backed`, `read-only`, `no-fanout`

#### Scenarios

**Routine dashboard state uses projection lookup without per-change queries** (`rq-dashboardWorkerFree01.1`)

**Given:**
- The local dashboard serves `/api/state`
- The durable projection store is reachable for the configured ADV project

**When:** The dashboard builds ADV summary cards for routine refresh

**Then:**
- ADV summary cards are built from projection data
- The routine refresh does not issue per-change runtime hydration
- The routine refresh remains read-only and does not mutate, update, start, cancel, archive, merge, deploy, or rerun anything

**Worktree branch and path metadata comes from projection lookup** (`rq-dashboardWorkerFree01.2`)

**Given:**
- A change projection contains branch or path metadata

**When:** The dashboard builds ADV summaries from projection lookup

**Then:**
- All non-blank branch values are decoded without collapsing the stored collection
- All non-blank path values are decoded without requiring runtime hydration
- Missing attributes yield empty metadata rather than fuzzy inference

**Optional enrichment degrades without hiding base cards** (`rq-dashboardWorkerFree01.3`)

**Given:**
- Optional enrichment such as ops, head SHA, GitHub, or detail data is unavailable or times out

**When:** The routine dashboard refresh renders `/api/state`

**Then:**
- Base ADV summary cards remain visible when projection lookup data is available
- Unavailable optional data is omitted or represented as bounded degradation
- The routine refresh does not fall back to per-change query fan-out

**Detail route is explicit, bounded, and read-only** (`rq-dashboardWorkerFree01.4`)

**Given:**
- A user explicitly opens a local ADV change detail route from the dashboard

**When:** The detail route needs richer state than projection lookup provides

**Then:**
- At most one change is read for that request
- The read is bounded and failure degrades the detail view only
- The detail route exposes no mutation controls, no secrets, and no raw ADV state-file links

---

### Roadmap CLI and slash-command surfaces are retired

**ID:** `rq-roadmapCliBridge01` | **Priority:** **[MUST]**

The /adv-roadmap command, adv roadmap CLI subcommand, adv_roadmap MCP tool, and bin/lib/roadmap implementation are retired and MUST remain absent. What's-next and portfolio-balancing requests route to /adv-triage, which uses typed ADV state plus current GitHub issue/project data.

**Tags:** `roadmap`, `command`, `cli`, `no-fanout`

#### Scenarios

**Retired surfaces are absent** (`rq-roadmapCliBridge01.1`)

**Given:**
- The command, CLI, and MCP inventories are inspected

**When:** Roadmap retirement conformance runs

**Then:**
- .opencode/command/adv-roadmap.md is absent
- bin/adv does not dispatch roadmap
- adv_roadmap is absent from the registry and manifests
- bin/lib/roadmap.ts is absent

**Portfolio requests route to triage** (`rq-roadmapCliBridge01.2`)

**Given:**
- A user asks what to finish, clean up, or start

**When:** ADV intent routing evaluates the request

**Then:**
- The request routes to /adv-triage
- No removed roadmap surface is recommended

---

### Bounded Cached Health Probes

**ID:** `rq-statusProbeCache01` | **Priority:** **[MUST]**

ADV health and recovery diagnostics that probe disk, mutation paths, worker diagnostics, projection fields health, snapshot health, or worktree census must use bounded cached probes. Cached probe responses must surface _freshness metadata with cached_at, stale, age_ms, ttl_ms, and optional error. Status-facing health diagnostics must expose an advisory forceRefresh path that bypasses fresh cached probe entries only for the selected health probes and never for gate, task, change, contract, archive, or release truth. Probe fetchers that receive an AbortMutation must either forward it into cancellable underlying work or explicitly classify the operation as bounded/non-cancellable at the nearest owned adapter. Stale probe data may inform recommendations but must not authorize safety-critical mutations such as worker-lock reclaim, restart success, override, unlock, gate completion, task truth, change lifecycle truth, or archive decisions.

**Tags:** `diagnostics`, `disk`, `cache`, `health`

#### Scenarios

**Status health probes are coalesced and freshened** (`rq-statusProbeCache01.1`)

**Given:**
- Multiple adv_status view:health calls request disk health, queue serviceability, projection fields health, snapshot health, or worktree census within the probe TTL

**When:** The probes execute

**Then:**
- Concurrent same-key probes are coalesced
- Repeated calls within TTL return cached values
- The health response includes _freshness metadata for each cached probe with cached_at, stale, age_ms, ttl_ms, and optional error
- age_ms is non-negative and ttl_ms identifies the probe cache TTL
- Existing health fields remain present for legacy consumers

**Stale probe data is diagnostic-only for recovery safety** (`rq-statusProbeCache01.2`)

**Given:**
- A cached disk or worker-serviceability probe is stale because refresh aborted, timed out, or failed

**When:** A diagnostic or recovery tool builds recommendations

**Then:**
- The stale value may be returned with _freshness.stale=true, age_ms, ttl_ms, and an error summary
- The stale value must not be treated as proof of worker serviceability
- The stale value must not authorize worker-lock reclaim, restart success, override, unlock, gate completion, task truth, change lifecycle truth, or archive decisions

**Status force refresh is advisory-only** (`rq-statusProbeCache01.4`)

**Given:**
- adv_status is called with forceRefresh:true and a view that requests advisory health probes
- Fresh cached values already exist for one or more selected probes

**When:** The status read executes

**Then:**
- The selected advisory probe caches attempt fresh fetches instead of reusing fresh cached entries
- The response freshness metadata still reports cached_at, stale, age_ms, ttl_ms, and optional error for each returned probe
- forceRefresh does not bypass or cache gate, task, change, contract, archive, or release truth
- Default summary output remains lightweight and does not expose detailed _freshness payloads

**Probe timeout bounds underlying work or reports non-cancellable classification** (`rq-statusProbeCache01.3`)

**Given:**
- A cached status probe fetch receives an AbortMutation from the probe cache timeout path

**When:** The probe implementation invokes its underlying operation

**Then:**
- The AbortMutation is forwarded into cancellable underlying work when the underlying operation accepts cancellation
- Non-cancellable operations are explicitly bounded elsewhere or classified as non-cancellable diagnostic work
- Non-cancellable expensive probes are not required for adv_status view: "summary" unless independently bounded and covered by tests

---

### Lean adv_status Summary Execution

**ID:** `rq-statusSummaryLazy01` | **Priority:** **[MUST]**

adv_status view: "summary" must execute a summary-specific read plan instead of paying for health/hygiene-only diagnostics and cleanup work before projection. The summary plan must preserve active/recent orientation, bounded recommendations, and explicit degraded/freshness markers. Detailed health, hygiene, archived/closed leak archaeology, snapshot-health scanning, worktree cleanup retry/discovery, and similar expensive diagnostics belong in explicit health/hygiene views or dedicated tools unless proven bounded and required for summary orientation. Summary/cache/projection lookup data must not authorize gate completion, archive, recovery, repair, task mutation, contract proof, unlock, override, or other safety-critical decisions.

**Tags:** `status`, `latency`, `diagnostics`

#### Scenarios

**Summary skips health and hygiene-only providers by default** (`rq-statusSummaryLazy01.1`)

**Given:**
- adv_status is called with view: "summary"

**When:** The status read plan executes

**Then:**
- Snapshot-health scanning, archived/closed leak archaeology, and worktree cleanup retry/discovery are not executed by the default summary plan
- The response still includes active/recent orientation, bounded recommendations, and any degraded/freshness markers for data that was actually consulted
- The response points operators to view: "health" or view: "hygiene" for omitted diagnostic detail

**Detailed views retain diagnostics omitted by summary** (`rq-statusSummaryLazy01.2`)

**Given:**
- adv_status is called with view: "health" or view: "hygiene"

**When:** The status read plan executes

**Then:**
- Detailed diagnostics that were omitted from summary remain available in the appropriate explicit view
- Existing freshness metadata and legacy health fields remain present for consumers of detailed views

**Summary projections remain advisory** (`rq-statusSummaryLazy01.3`)

**Given:**
- adv_status view: "summary" uses summary, cached, or projection lookup-derived data

**When:** A safety-critical mutation, gate, archive, recovery, repair, unlock, override, or contract proof decision is evaluated

**Then:**
- The decision does not rely on the summary projection as authority
- Authoritative change projection state is queried through the owning full-state path

---

### OpenCode Session Debt Diagnostics

**ID:** `rq-opencodeDebt01` | **Priority:** **[MUST]**

ADV diagnostics must safely detect stale blank assistant messages and stale `running`/`pending` tool parts in the shared OpenCode session database, distinguish live in-flight rows, idle active-session rows, and orphan-ghost repair candidates, and require dry-run plus backup before any repair deletes rows or marks tool parts interrupted.

**Tags:** `diagnostics`, `opencode`, `session-debt`, `doctor`

#### Scenarios

**Status reports stale OpenCode session debt read-only** (`rq-opencodeDebt01.1`)

**Given:**
- The OpenCode database contains assistant messages with finish null and zero parts older than the stale threshold
- The database also contains tool parts with `state.status` of `running` or `pending` older than the stale threshold

**When:** adv_status or an ADV doctor diagnostic is executed

**Then:**
- The diagnostic opens the OpenCode database read-only
- The output reports the count and bounded samples of stale blank assistant messages and stale tool parts with session/tool/context details
- A doctor recommendation is surfaced without modifying the database

**Live in-flight rows are excluded from repairable debt** (`rq-opencodeDebt01.2`)

**Given:**
- The OpenCode database contains assistant messages with finish null and zero parts younger than the stale threshold
- The database contains `running`/`pending` tool parts whose row or session activity is younger than the stale threshold

**When:** OpenCode session-debt classification runs

**Then:**
- Younger blank assistant and tool-part rows are classified as live or in-flight
- Older rows attached to sessions without orphan proof are classified as idle active-session debt
- Only orphan-ghost blank assistants and stale orphan tool parts are counted as repairable debt
- No repair recommendation is emitted solely because of younger rows

**Repair requires dry-run and backup** (`rq-opencodeDebt01.3`)

**Given:**
- A repair utility is invoked against the OpenCode database

**When:** Deletion or tool-part repair is requested

**Then:**
- The utility refuses deletion unless apply mode is explicit
- The utility refuses mutation unless a backup destination is provided and populated before deletion or repair
- Only assistant messages with finish null, zero parts, age at or above the stale threshold, and orphan-ghost liveness are deleted
- Only tool parts with `state.status` running/pending, age at or above the stale threshold, and orphan-ghost liveness are updated to terminal `error` with `metadata.interrupted=true` and an end time
- Parent assistant messages are marked complete only when all child parts are terminal; mixed live/stale parents are left open

**Unavailable database degrades safely** (`rq-opencodeDebt01.4`)

**Given:**
- The OpenCode database is missing, inaccessible, or the SQLite runtime is unavailable

**When:** The session-debt diagnostic runs

**Then:**
- The diagnostic returns an unavailable/degraded result
- adv_status continues to complete
- No destructive operation is attempted

---

### Task Metadata Filter Semantics

**ID:** `rq-advmeta01` | **Priority:** **[MUST]**

Tasks may include optional metadata key/value pairs. adv_task_list must support has_metadata_key:<key> and metadata:<key>=<value> filters with behavior aligned between workflow-owned source-of-truth state and any derived query or index surface.

#### Scenarios

**Filter by metadata key** (`rq-advmeta01.1`)

**Given:**
- A change with tasks containing metadata keys

**When:** adv_task_list is called with filter has_metadata_key:<key>

**Then:**
- Only tasks containing that metadata key are returned

**Filter by metadata key/value** (`rq-advmeta01.2`)

**Given:**
- A change with tasks containing metadata key/value pairs

**When:** adv_task_list is called with filter metadata:<key>=<value>

**Then:**
- Only tasks matching both key and value are returned

---

### Bounded Signal Flush on Shutdown

**ID:** `rq-advshut1` | **Priority:** **[MUST]**

On SIGINT/SIGTERM, the plugin must run a bounded flush path before close, with idempotent/reentrant handling so duplicate signals cannot trigger multiple concurrent flush sequences.

#### Scenarios

**Signal performs bounded flush** (`rq-advshut1.1`)

**Given:**
- The process receives SIGINT or SIGTERM

**When:** Shutdown handling begins

**Then:**
- store.flush is attempted before store.close
- A hard timeout bounds flush duration

**Duplicate signals are idempotent** (`rq-advshut1.2`)

**Given:**
- A shutdown flush is already in progress

**When:** A second SIGINT/SIGTERM is received

**Then:**
- No second flush path starts
- Shutdown remains deterministic

---

### Source-Appropriate Due Diligence for Unknown Capability Questions

**ID:** `rq-dueDiligence01` | **Priority:** **[MUST]**

ADV-managed guidance (orchestrator agent text, synced overlays, and accompanying drift tests) must require source-appropriate due diligence before answering, recommending, or deciding on unknown platform, architecture, or capability questions. Diligence may use any appropriate mix of evidence sources (local code via lgrep/read, repo history or repo examples, GitHub examples, official docs, web research, or similar); the evidence bar is not a fixed source stack. Requests like "quick answer", "from your knowledge", or "don't research" may change response brevity only and must not lower the evidence bar. If required diligence cannot be completed, the response must stop and surface the blockage instead of presenting an unverified recommendation as settled.

**Tags:** `research`, `due-diligence`, `routing`, `guidance`

#### Scenarios

**Unknown capability question triggers source-appropriate diligence** (`rq-dueDiligence01.1`)

**Given:**
- An unknown platform, architecture, or capability question is posed to an ADV-managed agent

**When:** The agent prepares an answer, recommendation, or decision

**Then:**
- The agent gathers source-appropriate evidence before answering
- Evidence may come from local code inspection, repo history or repo examples, GitHub examples, official docs, web research, or other relevant sources chosen to fit the question
- No carve-out permits skipping diligence on the basis that the question is local, short, or familiar

**Quick-answer requests change brevity only** (`rq-dueDiligence01.2`)

**Given:**
- The user requests a "quick answer", asks "from your knowledge", or says "don't research"
- The question still requires due diligence under rq-dueDiligence01.1

**When:** The agent responds

**Then:**
- The response may be shortened or compressed
- The evidence bar is not lowered; diligence is still performed before recommending or deciding

**Blocked diligence stops and surfaces the blockage** (`rq-dueDiligence01.3`)

**Given:**
- Required diligence cannot be completed (for example: docs, research tools, or evidence sources are unavailable)

**When:** The agent would otherwise present a directional answer or recommendation

**Then:**
- The agent stops instead of presenting an unverified direction as settled
- The response surfaces the specific blockage or missing evidence
- No carve-out permits proceeding with an unverified recommendation

**Guidance surfaces and drift tests encode the rule** (`rq-dueDiligence01.4`)

**Given:**
- The repo contains ADV orchestrator agent text, synced overlays, and routing asset tests

**When:** Those surfaces are inspected

**Then:**
- The ADV agent and plan agent sources describe due-diligence-first routing for unknown capability questions
- The synced overlays (adv.overlay.md, plan.overlay.md) carry the same rule
- Regression tests fail if the legacy carve-out-first wording returns

---

### Code-Enforced Prose Deduplication

**ID:** `rq-proseReduction01` | **Priority:** **[MUST]**

ADV instruction surfaces (ADV_INSTRUCTIONS.md, docs/command-voice-standard.md, .opencode/agents/adv.md, .opencode/command/adv-*.md) MUST classify each section by enforcement class (fully-enforced, partially-enforced, inherently-prose) and apply the matching compression template defined in docs/command-voice-standard.md § Prose-Load Reduction Rules. Sections whose behavior is fully or partially enforced by code MUST NOT contain paragraph explanations duplicating the enforced behavior; they MUST use a pointer line + constraint table format.

**Tags:** `prose-reduction`, `instruction-surfaces`, `compression`

#### Scenarios

**Fully-enforced section uses pointer + table** (`rq-proseReduction01.1`)

**Given:**
- A section in an ADV instruction surface describes behavior that is fully enforced by code (drift test, runtime guard, schema validation, tool formatter, or runtime tool requiring approval params)

**When:** The section is inspected

**Then:**
- The section opens with a pointer line referencing the enforcing code path
- The section contains a constraint table summarizing the rule
- The section does NOT contain paragraph explanations duplicating the enforced behavior

**Partially-enforced section adds gap rationale** (`rq-proseReduction01.2`)

**Given:**
- A section describes behavior that is partially enforced by code (some aspects machine-checked, others rely on agent behavior)

**When:** The section is inspected

**Then:**
- The section uses the fully-enforced template (pointer + constraint table)
- The section additionally contains a single line marked 'Agent-side gap:' describing what the code does NOT enforce

---

### Single ADV Runtime Agent with Provider Hints

**ID:** `rq-providerAdvSkinny01` | **Priority:** **[MUST]**

ADV must expose one canonical lean ADV runtime prompt while preserving provider-specific guidance through runtime system-block hint injection. deploy-local.sh must not append the full ADV_INSTRUCTIONS.md protocol reference into global adv.md, require generated adv-{provider}.md runtime agents, or create concatenated provider prompt files. Provider hints must be selected from structured provider/model context and emitted through the existing single-system-entry system block path.

**Tags:** `provider-adv`, `prompt-parts`, `sync`

#### Scenarios

**Single ADV runtime agent is complete without generated provider variants** (`rq-providerAdvSkinny01.1`)

**Given:**
- scripts/deploy-local.sh --fix runs with canonical ADV and provider hint assets present

**When:** ADV runtime assets are synced

**Then:**
- Global adv.md is the complete lean runtime ADV agent
- Global adv.md is assembled from the canonical runtime agent source without wholesale ADV_INSTRUCTIONS.md append
- Runtime-critical protocol removed or compressed from global adv.md is covered by a runtime protocol coverage inventory, retained runtime text, code/spec enforcement, or command-contract ownership
- Global adv-{provider}.md files are not generated as required runtime artifacts
- Concatenated provider prompt files are not generated as required runtime artifacts at agent-parts/advance/adv-{provider}.md
- agent.adv-{provider}.prompt refs are not written by deploy-local.sh
- Generic adv visibility is not disabled because of retired provider variants

**Stale generated provider artifacts are removed or reported** (`rq-providerAdvSkinny01.1a`)

**Given:**
- A stale generated adv-{provider}.md file or concatenated provider prompt file exists from the retired provider-variant architecture

**When:** scripts/deploy-local.sh --fix runs

**Then:**
- Stale generated provider agent files are removed from the global agents directory
- Stale concatenated provider prompt files are removed or reported as retired artifacts with deterministic remediation
- Running --fix is idempotent and does not recreate retired provider artifacts

**Runtime provider hints use structured context and one system entry** (`rq-providerAdvSkinny01.2`)

**Given:**
- The ADV plugin system prompt transform runs for a model with structured provider or model identity

**When:** The ADV system block is assembled

**Then:**
- A known provider or model identity emits exactly one matching provider hint
- An unknown or missing provider/model identity emits no provider hint
- Provider hints are appended through output.system[0] and no additional system entry is pushed
- No heuristic free-text provider guessing is required for correctness

---

### Provider ADV Prompt Size Metrics

**ID:** `rq-providerAdvMetrics01` | **Priority:** **[MUST]**

Provider ADV evaluation must report prompt-size planes for the single-agent architecture: lean ADV runtime prompt size, ADV reference protocol size, provider hint size, dynamic ADV system-block estimate, global voice-contract allowance, selected runtime prompt size, and removed or avoided provider-variant duplication. Metrics must be coverage-first reporting and must not require generated adv-{provider}.md files as canonical inputs or impose a hard prompt-size cap as correctness proof.

**Tags:** `provider-adv`, `metrics`, `prompt-size`

#### Scenarios

**Provider eval reports single-agent prompt-size planes** (`rq-providerAdvMetrics01.1`)

**Given:**
- Provider ADV hint assets and the canonical ADV runtime prompt sources exist

**When:** The provider evaluation harness reports prompt size metrics

**Then:**
- Metrics include lean_adv_runtime_prompt bytes and lines
- Metrics include adv_reference_protocol bytes and lines
- Metrics include provider hint bytes and lines
- Metrics include adv_dynamic_system_block_estimate bytes and lines
- Metrics include voice_contract_allowance bytes and lines
- Metrics include selected_agent_runtime_prompt bytes and lines for the composed single ADV prompt plus one runtime provider hint
- Metrics include removed or avoided provider-variant duplication when measurable
- The harness does not require generated provider variant files as canonical prompt sources

---

### Drift Test Coverage for Compressed Prose

**ID:** `rq-proseReduction02` | **Priority:** **[MUST]**

plugin/src/manifest-doc-drift.test.ts MUST contain structural assertions that verify compressed sections in ADV instruction surfaces conform to the enforcement-class templates. Assertions MUST be structural (line caps per class, presence of code-path reference in pointer line) and MUST NOT assert specific wording.

**Tags:** `prose-reduction`, `drift-test`, `structural`

#### Scenarios

**Drift test enforces line caps per class** (`rq-proseReduction02.1`)

**Given:**
- manifest-doc-drift.test.ts is inspected

**When:** The structural-assertions block is read

**Then:**
- An assertion verifies fully-enforced sections do not exceed the documented line cap
- An assertion verifies partially-enforced sections do not exceed the documented line cap
- An assertion verifies inherently-prose template sections do not exceed the documented line cap

**Drift test enforces code-path reference** (`rq-proseReduction02.2`)

**Given:**
- A section is classified fully-enforced or partially-enforced

**When:** The drift test inspects the section

**Then:**
- The pointer line MUST contain a backtick-wrapped code-path reference matching `.+\.(ts|md|json)`
- The assertion is structural; no specific wording is required

---

### Category Classification Source of Truth

**ID:** `rq-proseReduction03` | **Priority:** **[MUST]**

Prose-load reduction work MUST classify instruction sections by enforcement class using this spec and docs/command-voice-standard.md as the source of truth. Long-lived inventory or audit-trail documents are not required; durable invariants live in specs, tests, command contracts, and the voice standard.

**Tags:** `prose-reduction`, `source-of-truth`, `classification`

#### Scenarios

**Classification uses canonical framework** (`rq-proseReduction03.1`)

**Given:**
- A change executes prose-load reduction work

**When:** The edited instruction surface is inspected

**Then:**
- Every edited section follows the full, partial, or inherent enforcement-class framework
- Fully and partially enforced sections cite code/spec/test anchors when applicable
- Partially enforced sections state the agent-side gap when prose remains necessary

**No standing audit inventory required** (`rq-proseReduction03.2`)

**Given:**
- A prose-reduction change has completed

**When:** The repository documentation is inspected

**Then:**
- No repository doc is required solely to preserve the change's audit trail
- Current behavior is recoverable from specs, tests, command contracts, and source comments

---

### Inherently-Prose Constraint Templates

**ID:** `rq-proseReduction04` | **Priority:** **[MUST]**

Sections classified inherently-prose (agent-side judgment, narration, or domain context that cannot be structurally enforced) MUST use a structured template (table, checklist, or trigger/action grid) and MUST NOT use paragraph prose. The structured template is the canonical scannable form for inherently-prose categories.

**Tags:** `prose-reduction`, `inherently-prose`, `structured-template`

#### Scenarios

**Inherently-prose section uses structured template** (`rq-proseReduction04.1`)

**Given:**
- A section is classified inherently-prose

**When:** The section is inspected

**Then:**
- The section opens with a one-line purpose statement
- The section content uses a table, checklist, or trigger/action grid
- The section does NOT contain paragraph prose explaining the rule

**Inherently-prose template excludes mandatory pointer** (`rq-proseReduction04.2`)

**Given:**
- A section is classified inherently-prose (no code mechanism to point to)

**When:** The section is inspected

**Then:**
- The section MAY omit a code-path reference
- The structural template is the only required form

---

### Skill File Prose Compression

**ID:** `rq-skillProseCompression01` | **Priority:** **[MUST]**

Skill files under skills/*/SKILL.md MUST use the same enforcement-class compression framework as command files. New or modified skills must follow the full, partial, or inherent class rules in docs/command-voice-standard.md and keep durable invariants in specs, tests, or command contracts rather than standing audit inventories.

**Tags:** `prose-reduction`, `skills`, `compression`

#### Scenarios

**Modified skill follows enforcement-class compression** (`rq-skillProseCompression01.1`)

**Given:**
- A skill file in skills/*/SKILL.md is created or modified

**When:** The skill file is prepared for archive

**Then:**
- The skill is compressed per the same enforcement-class framework as command files
- The applicable class is full, partial, or inherent per docs/command-voice-standard.md
- Contract tokens, code blocks, tool names, enum values, and quoted errors remain intact

---

### Command Skill Classification Tracking

**ID:** `rq-skillClassification01` | **Priority:** **[MUST]**

Commands backed by dedicated or shared skills MUST be listed in ADV_INSTRUCTIONS.md § Command vs Skill Boundaries so command/skill ownership stays explicit and drift is reviewable.

**Tags:** `skills`, `classification`, `instructions`

#### Scenarios

**Extracted command appears in skill classification table** (`rq-skillClassification01.1`)

**Given:**
- A command has a dedicated skill or shared skill after extraction

**When:** Extraction is complete

**Then:**
- ADV_INSTRUCTIONS.md § Command vs Skill Boundaries lists the command under Dedicated skill or Shared skill
- The row includes the skill identifier
- The command is not listed as Command-only

---

### Runtime Commands Avoid Source Checklist Reads

**ID:** `rq-noSourceChecklistReads01` | **Priority:** **[MUST]**

ADV runtime command guidance MUST NOT require agents to read Advance source or install-tree checklist files for reusable methodology. Runtime methodology must be available through embedded command guidance or loaded trusted skills, while docs/checklists/* remains maintainer/reference documentation only.

**Tags:** `commands`, `skills`, `runtime-guidance`, `checklists`

#### Scenarios

**Runtime command uses embedded guidance or skill** (`rq-noSourceChecklistReads01.1`)

**Given:**
- A synced ADV runtime command needs reusable methodology during execution

**When:** The command is invoked from a repository that is not the Advance source checkout

**Then:**
- The command provides the methodology through embedded runtime guidance or a loaded trusted skill
- The command does not instruct the agent to read docs/checklists/* files
- The command does not instruct the agent to search or read ~/.local/share/Advance/** for methodology

**Checklist docs remain maintainer references** (`rq-noSourceChecklistReads01.2`)

**Given:**
- Maintainer-facing docs/checklists/* files exist in the Advance repository

**When:** Runtime command guidance is authored or synced

**Then:**
- The docs may remain available for maintainer reference
- Runtime command prose does not present those docs as the execution-time source of methodology
- Structural drift tests fail if runtime command files reintroduce source or install-tree checklist-read directives

---

### Context-Shed Delegation Heuristic for Routing Tables

**ID:** `rq-contextShed01` | **Priority:** **[MUST]**

Delegation routing tables in ADV_INSTRUCTIONS.md and adv-apply.md MUST include step 4.5 (Context-Shed Test) between risk-signal check (step 4) and default fallback (step 5). The test is a 4-question AND-conjunctive heuristic: (1) orchestrator already made design/architectural decisions for this task, (2) task's HOW does not feed into a downstream task's decisions, (3) acceptance criteria are fully defined before delegation, (4) task is mechanical implementation of a decided plan. All four must pass for delegate_allowed. Gated by floor: ~5 files touched OR ~50 lines changed. Conservative bias: when uncertain, default to inline_required. Step 4.5 MUST NOT override step 1 (human delegation_hint) or step 4 (risk signals).

**Tags:** `delegation`, `routing`, `context-shed`, `orchestrator`

#### Scenarios

**Step 4.5 inserted between step 4 and step 5 in both routing tables** (`rq-contextShed01.1`)

**Given:**
- ADV_INSTRUCTIONS.md contains the Delegation Routing table
- adv-apply.md contains the Delegation Routing table

**When:** The routing tables are inspected

**Then:**
- Both tables contain a step 4.5 row between step 4 (risk signals) and step 5 (default)
- Step 4.5 result is delegate_allowed when all four questions pass AND floor is met
- Step 4.5 result is inline_required when any question fails or floor is not met
- Step 1 (delegation_hint) and step 4 (risk signals) are unchanged

**Floor prevents micro-task delegation** (`rq-contextShed01.2`)

**Given:**
- A task touches fewer than ~5 files AND fewer than ~50 lines
- All four context-shed questions pass

**When:** Step 4.5 evaluates the task

**Then:**
- The floor check fails
- Result is inline_required regardless of question answers

**AND-conjunction requires all four questions** (`rq-contextShed01.3`)

**Given:**
- A task passes 3 of 4 context-shed questions and meets the floor

**When:** Step 4.5 evaluates the task

**Then:**
- Result is inline_required
- Conservative bias preserves orchestrator context for borderline tasks

**Step 4.5 does not override human hint or risk signals** (`rq-contextShed01.4`)

**Given:**
- A task has metadata.delegation_hint set to inline_required
- The context-shed test passes for the task

**When:** Delegation routing evaluates

**Then:**
- Step 1 returns inline_required
- Step 4.5 is never reached

---

### Context-Shed Prose in Orchestrator Agent and Post-Delegation P23 Scan

**ID:** `rq-contextShed02` | **Priority:** **[MUST]**

The adv.md orchestrator agent's Context-Optimal Execution section MUST include context-shed delegation criteria as prose bullets (NOT a routing table). Wording must reference the 4-question AND test and floor threshold. Additionally, adv-apply.md Task Flow MUST include a post-delegation P23 campsite-rule diff-scan step that checks same-pattern local subsystem issues after a delegated task returns, applying small/safe/local fixes inline and documenting scope-expanding findings as follow-ups without auto-fixing.

**Tags:** `delegation`, `orchestrator`, `campsite-rule`, `context-shed`

#### Scenarios

**adv.md contains context-shed prose bullets not table** (`rq-contextShed02.1`)

**Given:**
- The adv.md Context-Optimal Execution section is inspected

**When:** The delegation criteria are checked

**Then:**
- The section contains context-shed delegation criteria as prose bullets
- The section does NOT contain a markdown routing table (no | pipe characters in table format)
- The criteria reference the 4-question AND test and floor threshold

**adv-apply.md contains post-delegation P23 diff-scan step** (`rq-contextShed02.2`)

**Given:**
- The adv-apply.md Task Flow is inspected

**When:** Post-delegation steps are checked

**Then:**
- A step after delegation spawn and before task completion performs a P23 campsite-rule diff-scan
- The step diffs the sub-agent's touched files against pre-delegation baseline
- Small/safe/local same-pattern fixes are applied inline
- Scope-expanding findings are documented as follow-ups, not auto-fixed

**Drift tests enforce prose-only on adv.md and table on other surfaces** (`rq-contextShed02.3`)

**Given:**
- The drift test suite runs

**When:** Context-shed assertions are evaluated

**Then:**
- ADV_INSTRUCTIONS.md and adv-apply.md delegation tables contain step 4.5 with matching wording
- adv.md Context-Optimal Execution section contains context-shed tokens without table pipe characters
- adv-apply.md contains P23 diff-scan step tokens

---

### Orchestrator-Session Operational Delegation

**ID:** `rq-orchestratorOpsDelegation01` | **Priority:** **[MUST]**

The primary adv orchestrator SHOULD delegate broad operational work before repeating expensive primary-context cycles, while retaining all ADV authority boundaries. Operational work includes expected >5 file reads/searches, repo structure/dependency/same-pattern scans, DB/log/status/usage audits, GitHub CI/check-run/status investigation, repeated verify/test bursts, local verification bursts, CI/check-run failures, and known-scope code edits. Repeated local verification bursts and CI/check-run failures should route through structured verification triage before a second primary digest cycle when the next step is authority-free; local verify-only bursts route to adv-verifier with general fallback only when adv-verifier is unavailable. The no second primary-cycle rule applies when another recon/shell/test/CI-check cycle is needed and the next step is authority-free. Delegation guidance is instruction/spec/test-level only: adv.md Context-Optimal Execution carries prose-only guidance, ADV_INSTRUCTIONS.md carries the single orchestrator-session operational routing table, and adv-apply.md task-level Step 4.5 routing remains unchanged. The primary adv must keep gate completion, task-graph mutation, checkpoint/archive/sign-off, scope-drift, contract-compromise, safety, release, and user-facing synthesis authority. Operational routing must not make general the ADV code-writing default; code-edit rows route to adv-engineer or adv-designer by scope.

**Tags:** `delegation`, `orchestrator`, `operations`, `context-shed`

#### Scenarios

**Primary orchestrator retains authority boundary** (`rq-orchestratorOpsDelegation01.1`)

**Given:**
- The primary adv delegates operational work to a worker

**When:** The worker returns findings or verification output

**Then:**
- Primary adv retains gate completion authority
- Primary adv retains task-graph mutation authority
- Primary adv retains checkpoint, archive, sign-off, scope-drift, contract-compromise, safety, release, and user-facing synthesis authority
- Worker output is advisory evidence, not an ADV state mutation or gate decision

**Operational triggers map to bounded workers** (`rq-orchestratorOpsDelegation01.2`)

**Given:**
- The primary adv expects broad operational work outside a task graph item

**When:** The work matches a routing trigger in ADV_INSTRUCTIONS.md

**Then:**
- >5 file reads/searches routes to explore
- Repo structure, dependency map, or same-pattern scan routes to explore or adv-tron
- DB/log/status/usage audit routes to general
- GitHub CI / check-run / status investigation routes to general
- Repeated verify/test bursts route to adv-verifier, with general fallback only when adv-verifier is unavailable
- Code edits after task scope is known route to adv-engineer, or adv-designer for frontend/component scope

**No second primary operational cycle before delegation** (`rq-orchestratorOpsDelegation01.3`)

**Given:**
- The primary adv has already run one recon, shell/test, status, or CI-check cycle for an operational question
- More work of the same operational class is needed
- The next step does not require ADV authority or user-facing synthesis

**When:** The primary adv chooses whether to continue inline or delegate

**Then:**
- The primary adv delegates the next operational cycle to the mapped worker
- The primary adv does not run a second primary recon/shell/test/CI-check cycle before delegating
- The primary adv resumes inline for synthesis, decisions, and ADV state mutation after worker output

**adv.md carries operational delegation prose only** (`rq-orchestratorOpsDelegation01.4`)

**Given:**
- The adv.md Context-Optimal Execution section is inspected

**When:** Operational delegation guidance is checked

**Then:**
- The section includes operational delegation prose tokens including GitHub CI, check-run, reads/searches, second, and general
- The section contains no markdown routing table
- The section contains no pipe characters

**ADV_INSTRUCTIONS.md owns the operational routing table** (`rq-orchestratorOpsDelegation01.5`)

**Given:**
- ADV_INSTRUCTIONS.md is inspected

**When:** Operational delegation routing guidance is checked

**Then:**
- ADV_INSTRUCTIONS.md contains a clearly labeled Orchestrator-Session Operational Routing table
- The table contains a GitHub CI / check-run / status investigation row mapped to general
- The table routes code-edit rows to adv-engineer or adv-designer, not general
- adv-apply.md does not duplicate the operational routing table

---

### adv_archive_purge tool

**ID:** `rq-archivePurge01` | **Priority:** **[MUST]**

ADV must provide an explicit user-side lever to purge an archived change's archive bundle and disk projection. The on-disk archive bundle is preserved by default; destructive disk removal requires opt-in. A purge that does not include disk removal leaves the projection readable, while an approved disk purge removes the archived change from read surfaces.

#### Scenarios

**Default purge preserves disk bundle** (`rq-archivePurge01.1`)

**Given:**
- An archived change with an existing archive/<id>/change.json bundle on disk

**When:** adv_archive_purge changeId: <id> is invoked without includeDiskBundle

**Then:**
- The on-disk archive bundle is preserved
- adv_change_show for the changeId returns content from the on-disk projection

**Opt-in includeDiskBundle removes disk artifacts** (`rq-archivePurge01.2`)

**Given:**
- An archived change with a disk bundle

**When:** adv_archive_purge changeId: <id> includeDiskBundle: true is invoked

**Then:**
- The archive/<id>/ directory is recursively removed from disk
- Subsequent adv_change_show returns the existing not-found error path

**Refuses non-archived or unknown changes** (`rq-archivePurge01.3`)

**Given:**
- A change in active status, OR a changeId that does not exist in the archive

**When:** adv_archive_purge is invoked

**Then:**
- The tool returns a structured error and makes no state mutations

---

### Per-tool safety-net timeout overrides

**ID:** `rq-toolTimeoutOverride01` | **Priority:** **[MUST]**

The plugin's safety-net wrapper has a default 10s timeout (DEFAULT_TOOL_TIMEOUT_MS in safe-execute.ts). Tools whose execute body legitimately exceeds 10s on a mature project MUST declare an explicit timeoutMs override at registration time, with a code comment citing the inner-budget rationale. The default value remains 10s; raising the global default is not permitted.

#### Scenarios

**Long-running tools declare an explicit override** (`rq-toolTimeoutOverride01.1`)

**Given:**
- A tool whose execute body wraps a subprocess or bounded disk operation that legitimately exceeds 10s

**When:** The tool is registered in tool-registry.ts

**Then:**
- The registration uses safeExecute with an explicit { timeoutMs: N } where N is sufficient for the inner budget plus modest headroom
- A code comment cites the inner-budget rationale and references this requirement

**adv_doctor disk recovery uses bounded verified recovery** (`rq-toolTimeoutOverride01.2`)

**Given:**
- A bounded disk recovery is requested for the current project

**When:** adv_doctor applies a safe disk fix

**Then:**
- The tool waits up to the configured verification budget (default 10s) for the expected disk condition to become verifiable
- The tool returns success:true only when the post-fix disk condition is proven by bounded readback evidence
- The tool returns success:false with structured diagnostics when verification times out or evidence is unavailable or negative
- The tool is registered with an explicit safety-net timeout override that exceeds the verification budget with modest headroom

---

### adv_change_bulk_close composes disk sweep

**ID:** `rq-bulkCloseDiskSweep01` | **Priority:** **[MUST]**

After a successful adv_change_bulk_close, both workflow state and the on-disk change projection (changes/<id>/change.json) MUST be removed in the same call for changes whose individual close succeeded. Per-id outcomes are reported in diskRemoved and diskFailed arrays in the response. Mid-flight workflow-close failure preserves source dirs as the orphan-sweep recovery path.

#### Scenarios

**Successful bulk-close removes disk artifacts and reports per-id results** (`rq-bulkCloseDiskSweep01.1`)

**Given:**
- Multiple draft changes selected for closure with explicit user approval

**When:** adv_change_bulk_close is invoked and the underlying closeBatch succeeds

**Then:**
- Each closed change's source directory is removed via sweepClosedChangesFromDisk
- The response includes diskRemoved and diskFailed arrays per changeId
- Idempotency guarantees of the helper apply (already-missing dirs are reported as removed)

**Partial workflow-close failure preserves source dirs** (`rq-bulkCloseDiskSweep01.2`)

**Given:**
- A bulk-close where the overall closeBatch reports success:false (one or more closures failed)

**When:** The tool returns

**Then:**
- Source dirs for failed closures are NOT removed
- Failed source dirs are reported separately and may be retried via subsequent bulk-close runs

---

### Test-mode synthetic project_id guardrail

**ID:** `rq-testFixtureProjectId01` | **Priority:** **[MUST]**

During vitest runs (process.env.VITEST === 'true' or process.env.ADV_TEST_MODE === '1'), getProjectId MUST NOT resolve to a real git root commit SHA from a fixture path. For a real-git directory it returns a path-derived synthetic ID with a recognizable prefix; for a non-git fixture it returns null (preserving the legacy in-repo path fallback). This prevents test fixtures from leaking state into a real ADV project's external state directory.

#### Scenarios

**Vitest run resolves to a synthetic ID with the SYNTHETIC_TEST_PROJECT_ID_PREFIX** (`rq-testFixtureProjectId01.1`)

**Given:**
- process.env.VITEST is 'true' and the directory is a real git repo

**When:** getProjectId(directory) is called

**Then:**
- The returned ID is 40 hex chars
- The ID starts with SYNTHETIC_TEST_PROJECT_ID_PREFIX (16 leading zeros)
- Distinct directories produce distinct synthetic IDs (cross-project test isolation)

**Vitest run on a non-git directory returns null** (`rq-testFixtureProjectId01.2`)

**Given:**
- process.env.VITEST is 'true' and the directory is not a git repo (e.g. a createTestProject fixture with a stub .git and no commits)

**When:** getProjectId(directory) is called

**Then:**
- The function returns null
- Callers fall back to legacy in-repo paths via their existing 'targetProjectId ? getExternalRoot(...) : undefined' patterns

**Hard-fail guardrail asserts override is active during test runs** (`rq-testFixtureProjectId01.3`)

**Given:**
- The vitest test suite runs in the plugin checkout

**When:** The project-id guardrail test executes

**Then:**
- process.env.VITEST is 'true'
- getProjectId(process.cwd()) returns a synthetic ID, not the real root commit SHA
- Resolving a real git SHA from this code path is a hard test failure

---

### Multi-Session-Safe ADV State Writes via Per-Change Projection Locks

**ID:** `rq-multiSessionCoordination01` | **Priority:** **[MUST]**

Multi-session state writes against the same change MUST serialize through commitChangeProjection’s per-change lock and conditional revision/readback proof. Different changes remain unconstrained by one another, and the separate git-worktree lock remains scoped to worktree operations. A mutation MUST return a typed verified, stale_revision, or operator_required outcome; an unverified write MUST NOT be reported as success.

**Tags:** `multi-session`, `disk`, `coordination`, `state-authority`

#### Scenarios

**Concurrent state writes from peer sessions are serialized via change projection mutations** (`rq-multiSessionCoordination01.1`)

**Given:**
- Two or more OpenCode sessions sharing the same ADV project are active
- Each session issues an ADV-mutating tool call (for example adv_change_update or adv_task_update) against the same change concurrently

**When:** The plugin processes the concurrent updates

**Then:**
- Each update enters commitChangeProjection for the same change
- The per-change lock and expected revision serialize competing writes
- A stale revision returns stale_revision or operator_required rather than silently overwriting state
- A verified final projection reflects every mutation that successfully committed

**Change projection readback reproduces multi-session state deterministically** (`rq-multiSessionCoordination01.2`)

**Given:**
- A change projection has accumulated mutations from multiple sessions
- The projection is read back after each conditional commit

**When:** readback executes the recorded mutation events

**Then:**
- The read-back final state matches the last verified projection revision
- Mutation commits preserve deterministic revision and operation identity ordering
- No mutator depends on Date.now(), floating-point math, or process-local state

**ADV-mutating tools must not use client-side soft locks for cross-session coordination** (`rq-multiSessionCoordination01.3`)

**Given:**
- The set of ADV tools whose execution mode is authoritative is inspected

**When:** Their implementation is reviewed

**Then:**
- No ADV-mutating tool uses an unscoped JSONL sidecar lock or process-local mutex as a substitute for the projection authority
- The per-change advisory lock is used only inside commitChangeProjection; git-worktree locking remains separate
- All cross-session coordination flows through verified disk projection commits

---

### Worktree State Authority Lives in Durable Change Projections

**ID:** `rq-worktreeRegistry01` | **Priority:** **[MUST]**

Worktree state for ADV-managed worktrees MUST live inside durable change projections and be available through the bounded worktree registry read model. Sidecar SQLite databases or JSONL files MUST NOT be the authoritative source for worktree state. Cross-session reads MUST observe the same registry contents.

**Tags:** `worktree`, `registry`, `state-authority`, `disk`

#### Scenarios

**Worktree create persists state into change change projection worktree state** (`rq-worktreeRegistry01.1`)

**Given:**
- A session invokes adv_worktree_create with a branch name

**When:** The create flow completes successfully

**Then:**
- A worktree record is added to change-change projection worktree state via the worktreeCreatedMutation
- The record contains branch, path, baseRef, headSha, and createdAt fields
- No row is written to a sidecar SQLite database or JSONL file as the authoritative state

**Peer session sees the same worktree registry contents** (`rq-worktreeRegistry01.2`)

**Given:**
- Session A has created a worktree and the worktreeCreatedMutation has applied
- Session B in the same project queries worktree state

**When:** Session B reads worktree state via the change change projection (via AdvWorktreeBranches/AdvWorktreePaths projection fields for cross-change aggregation)

**Then:**
- Session B observes the worktree created by session A
- The observed record fields match what session A wrote
- No additional cross-process synchronization step is required

**No SQLite or sidecar JSONL is required to read worktree state** (`rq-worktreeRegistry01.3`)

**Given:**
- The set of code paths that read worktree state is inspected
- The legacy worktree plugin SQLite at ~/.local/share/opencode/plugins/worktree/{pid}.sqlite has been migrated

**When:** The reads execute against a project with no legacy SQLite present

**Then:**
- All reads succeed using only the per-change change projection state, disk visibility projection fields, and git census
- No code path requires a sidecar SQLite or JSONL worktree-state file to function
- Migrations from any legacy SQLite are idempotent and reversible

---

### adv_worktree_create reuses existing change worktree before create

**ID:** `rq-worktreeReuse01` | **Priority:** **[MUST]**

When adv_worktree_create is invoked for a branch that already has a registered git worktree (canonically `change/<change-id>`), the tool MUST detect and reuse the existing worktree before invoking `git worktree add`. If the branch record exists in git but the on-disk path is missing, the tool MUST prune the stale git worktree metadata before creating a fresh worktree. The tool MUST NOT recommend in-place edits as a fallback path; missing workflow access surfaces as a structured failure with a recommended next action.

**Tags:** `worktree`, `reuse`, `preflight`, `recovery`

#### Scenarios

**Existing change worktree is reused without invoking recovery** (`rq-worktreeReuse01.1`)

**Given:**
- A git worktree already exists for the requested branch (for example refs/heads/change/<change-id>)
- The on-disk worktree path is present

**When:** adv_worktree_create is invoked for that branch

**Then:**
- The tool returns success with the existing path, branch, baseRef, and headSha
- The output marks the result as reused so callers can distinguish reuse from fresh create
- No per-change runtime recovery is required — durable worktree state survives in disk projections
- No `git worktree add` is invoked

**Stale git worktree metadata is pruned before fresh create** (`rq-worktreeReuse01.2`)

**Given:**
- A git worktree branch entry exists for the requested branch
- The on-disk worktree path is missing

**When:** adv_worktree_create is invoked for that branch

**Then:**
- The tool prunes the stale git worktree metadata (`git worktree prune` or equivalent)
- The tool proceeds to bounded fresh-create instead of an in-place fallback
- No in-place edit recommendation is surfaced to the caller

---

### Concurrent-Session Hazard Framing Removed in Favor of Multi-Session Coordination

**ID:** `rq-multiSessionFraming01` | **Priority:** **[MUST]**

Production ADV code and ADV-managed instruction surfaces must frame multi-session as a supported design center, not as a hazard. The legacy [ADV:WARN] Concurrent OpenCode sessions detected warning is forbidden in production code. ADV_INSTRUCTIONS.md must contain the Multi-Session Coordination section, and the canonical status-marker table must list [ADV:PEER_SESSIONS].

**Tags:** `multi-session`, `framing`, `instruction-surfaces`, `status-markers`

#### Scenarios

**Plugin emits informational marker, not concurrent-session warning** (`rq-multiSessionFraming01.1`)

**Given:**
- Plugin init detects N peer sessions in the same project, where N is greater than zero

**When:** The plugin emits the peer-sessions diagnostic

**Then:**
- The diagnostic uses the [ADV:PEER_SESSIONS] informational marker
- The diagnostic does not use the [ADV:WARN] Concurrent OpenCode sessions detected wording
- The wording does not describe multi-session as a hazard or race condition

**ADV_INSTRUCTIONS contains Multi-Session Coordination, not Concurrent Session Hazard** (`rq-multiSessionFraming01.2`)

**Given:**
- ADV_INSTRUCTIONS.md is inspected

**When:** The relevant section is read

**Then:**
- A section titled Multi-Session Coordination is present
- No section titled Concurrent Session Hazard is present
- The Multi-Session Coordination section describes per-change projection locks and per-worktree git isolation

**Status-marker table lists [ADV:PEER_SESSIONS] as informational** (`rq-multiSessionFraming01.3`)

**Given:**
- The canonical status-marker table in ADV_INSTRUCTIONS.md is inspected

**When:** The table rows are read

**Then:**
- A row for [ADV:PEER_SESSIONS] is present
- The row classifies the marker as informational, not as an attention or blocked marker
- Drift tests fail if the row is removed or reclassified

---

### ADV Protocol Instructions Are Scoped to the ADV Runtime Agent

**ID:** `rq-scopedAdvInstructions01` | **Priority:** **[MUST]**

ADV protocol must be scoped to the single ADV runtime agent without globally registering ADV_INSTRUCTIONS.md in opencode.json instructions[]. The runtime prompt must stay complete through a lean ADV runtime prompt plus runtime protocol coverage inventory, retained text, code/spec enforcement, and command-contract ownership rather than wholesale ADV_INSTRUCTIONS.md concatenation. Sync and setup flows must preserve unrelated global instructions while removing legacy ADV_INSTRUCTIONS.md entries so non-ADV agents avoid ADV protocol prompt tax.

**Tags:** `instructions`, `deploy-local`, `prompt-scope`, `provider-agents`

#### Scenarios

**Single ADV runtime prompt preserves ADV protocol coverage without wholesale reference append** (`rq-scopedAdvInstructions01.1`)

**Given:**
- scripts/deploy-local.sh --fix syncs the global ADV runtime agent

**When:** The global adv.md runtime prompt content is inspected

**Then:**
- The content is the complete lean ADV runtime prompt
- The content does not include a wholesale ADV_INSTRUCTIONS.md protocol-reference append
- Removed or compressed runtime protocol is mapped in a runtime protocol coverage inventory to retained runtime text, code/spec enforcement, command contracts, or reference-only material
- The content does not include provider-specific runtime hints
- Provider hints are supplied only by the runtime system-block injection path
- The effective static prompt is the canonical lean ADV runtime prompt; ADV_INSTRUCTIONS.md remains the full repo/dev reference source

**Global config excludes ADV_INSTRUCTIONS.md** (`rq-scopedAdvInstructions01.2`)

**Given:**
- scripts/deploy-local.sh --fix manages a global opencode.json config

**When:** The config is created or repaired

**Then:**
- The plugin path remains registered in plugin[]
- The repository ADV_INSTRUCTIONS.md path is absent from instructions[]
- Any stale global-copy ADV_INSTRUCTIONS.md path is absent from instructions[]
- scripts/deploy-local.sh --check treats ADV_INSTRUCTIONS.md presence in instructions[] as drift

**Non-ADV prompt surfaces do not carry ADV protocol markers** (`rq-scopedAdvInstructions01.3`)

**Given:**
- Non-ADV agents or generic global instruction surfaces are inspected after sync

**When:** Their prompt or instruction content is checked for ADV protocol-only markers

**Then:**
- Markers unique to ADV_INSTRUCTIONS.md such as ## TDD Protocol (RSTC) or ## Critical Protocols are absent
- Non-ADV prompts remain self-contained for any rules they reference
- No non-ADV agent depends on hidden ADV_INSTRUCTIONS.md sections for correctness

**Unrelated global instructions are preserved during migration** (`rq-scopedAdvInstructions01.4`)

**Given:**
- opencode.json instructions[] contains unrelated user or organization instruction files alongside a legacy ADV_INSTRUCTIONS.md entry

**When:** scripts/deploy-local.sh --fix runs

**Then:**
- Only ADV_INSTRUCTIONS.md entries managed by ADV are removed from instructions[]
- Unrelated instruction entries remain in their existing order
- The resulting config remains valid JSON and is accepted by check mode

---

### Trunk Write Firewall

**ID:** `rq-twf01` | **Priority:** **[MUST]**

When features.worktree_guard_enforce is true (default) or omitted, the plugin MUST intercept direct file-write tool calls and known destructive bash write patterns via the tool.execute.before hook and block writes into the trunk checkout when HEAD is the default branch. When features.worktree_guard_enforce is explicitly false, the trunk write firewall MUST allow direct file-write tools and known destructive bash write patterns in the trunk checkout (legacy escape hatch). In strict mode, the firewall MUST allow writes inside ADV worktrees, outside git checkouts, and during explicit git recovery states (merge, rebase, cherry-pick, revert). Trunk evaluation is target-relative: each write target MUST be evaluated against the git worktree topology of the repository that owns the target, so a foreign repository's main (non-linked) checkout on its own default branch MUST be blocked exactly like the session project's trunk checkout, and a linked, non-prunable worktree of any repository MUST be allowed. Foreign-target defaults are conservative: when the target repository's worktree topology cannot be probed, the resolved git root MUST be evaluated as its own main checkout, and stale (prunable) worktree topology entries MUST NOT confer worktree eligibility on write targets. A narrow allowlist of ADV-generated trunk artifacts (ROADMAP.md, CHANGELOG.md, .adv/github-project.json, .adv/roadmap-snapshot.json) MAY bypass the block only as exact root-relative paths at the target repository's main checkout root; nested paths are never exempt. Git commands MUST NOT be classified or blocked by this firewall; P32 is enforced by where files are edited, not by restricting git operations. Shell indirection and script-internal writes are accepted residual risk documented in ADV instructions.

**Tags:** `git`, `worktree`, `firewall`, `trunk`, `safety`

#### Scenarios

**Explicit-false trunk file writes allowed on default branch** (`rq-twf01.1`)

**Given:**
- features.worktree_guard_enforce is explicitly false
- A tool call targets a path inside the trunk checkout
- HEAD is on the default branch
- No git recovery state is active

**When:** A write, edit, morph_edit, or known destructive bash write pattern is intercepted

**Then:**
- The tool execution is allowed by the trunk write firewall
- No trunk write firewall blocking error is thrown

**Strict trunk file write blocked on default branch** (`rq-twf01.1a`)

**Given:**
- features.worktree_guard_enforce is true (default) or explicitly set true
- A tool call targets a path inside the trunk checkout
- HEAD is on the default branch
- No git recovery state is active

**When:** A write, edit, morph_edit, or known destructive bash write pattern is intercepted

**Then:**
- The tool execution is blocked with an actionable error message
- The error message directs the agent to create or use an ADV worktree
- No file write is performed

**Strict worktree file write allowed** (`rq-twf01.2`)

**Given:**
- features.worktree_guard_enforce is true
- A tool call targets a path inside an active ADV worktree

**When:** A write, edit, morph_edit, or known destructive bash write pattern is intercepted

**Then:**
- The tool execution is allowed
- No blocking error is thrown

**Strict git recovery states allow trunk edits** (`rq-twf01.3`)

**Given:**
- features.worktree_guard_enforce is true
- The trunk checkout is on the default branch
- A merge, rebase, cherry-pick, or revert recovery state is active

**When:** A file-write tool call targets a trunk-checkout path

**Then:**
- The tool execution is allowed
- The recovery edit is not blocked by the trunk write firewall

**Strict known destructive bash writes blocked on trunk** (`rq-twf01.4`)

**Given:**
- features.worktree_guard_enforce is true
- A bash command writes to a trunk-checkout path on the default branch via redirect, tee, sed -i, cp, mv, or rm
- No git recovery state is active

**When:** The tool.execute.before hook analyzes the bash command string

**Then:**
- The tool execution is blocked with an actionable error message
- The destructive write target is surfaced in the reason

**Git commands unrestricted by write firewall** (`rq-twf01.5`)

**Given:**
- A bash command contains any git subcommand, including commit, merge, pull, push, reset, read-tree, update-ref, or other plumbing

**When:** The tool.execute.before hook analyzes the bash command string

**Then:**
- The command is not classified as a git mutation by ADV
- The trunk write firewall does not block the command merely because it invokes git
- Any safety enforcement for remote publication remains outside this firewall

**Outside-repo paths allowed** (`rq-twf01.6`)

**Given:**
- A tool call targets a path outside any git checkout

**When:** The trunk write firewall cannot resolve a git root for the target path

**Then:**
- The tool execution is allowed
- The firewall does not apply trunk-checkout rules to non-repo paths

**Residual risk documented for shell indirection** (`rq-twf01.7`)

**Given:**
- A bash command writes via shell-variable indirection, shell aliases, functions, or external scripts

**When:** The trunk write firewall analyzes the command string

**Then:**
- The firewall may not detect the indirect write target
- This limitation is documented in ADV_INSTRUCTIONS.md as accepted residual risk
- ADV instruction surfaces still prohibit intentional trunk-checkout file writes outside worktrees

**Foreign main checkout blocked on its own default branch** (`rq-twf01.8`)

**Given:**
- features.worktree_guard_enforce is true (default) or omitted
- A tool call targets a path inside the main (non-linked) checkout of a repository other than the session project
- That repository's HEAD is on its own default branch
- No git recovery state is active in the target repository

**When:** A write, edit, morph_edit, or known destructive bash write pattern is intercepted

**Then:**
- The tool execution is blocked with an actionable error message
- Trunk-ness is decided by the repository that owns the target, not by the session project
- A linked, non-prunable worktree of the same foreign repository is allowed instead

**Unprobed foreign topology fails closed to main-checkout evaluation** (`rq-twf01.9`)

**Given:**
- features.worktree_guard_enforce is true (default) or omitted
- A tool call targets a path whose git root resolves outside the session project
- The target repository's worktree topology cannot be probed (git worktree list fails or returns no records)

**When:** The trunk write firewall evaluates the target

**Then:**
- The resolved git root is evaluated as its own main checkout
- A default-branch HEAD blocks the write
- The firewall does not assume worktree eligibility it cannot prove

**Prunable worktree entries do not confer worktree eligibility** (`rq-twf01.10`)

**Given:**
- features.worktree_guard_enforce is true (default) or omitted
- The target repository's worktree topology lists the containing checkout as prunable (stale administrative data)

**When:** The trunk write firewall evaluates a write target inside that checkout

**Then:**
- The prunable entry does not confer worktree eligibility
- The target is evaluated on its own merits against its resolved git root
- A default-branch HEAD in that checkout blocks the write

**ADV-generated artifacts allowed only as exact target-root paths** (`rq-twf01.11`)

**Given:**
- features.worktree_guard_enforce is true (default) or omitted
- A write targets ROADMAP.md, CHANGELOG.md, .adv/github-project.json, or .adv/roadmap-snapshot.json
- The target repository's main checkout is on its default branch

**When:** The trunk write firewall evaluates the target path

**Then:**
- The write is allowed only when the path matches exactly at the target repository's main checkout root
- Nested or otherwise non-exact paths (for example docs/ROADMAP.md) are not exempt
- The allowlist applies identically to file-write tools and known destructive bash write patterns

---

### clarify_enforcement flag extends to /adv-audit ambiguity detection

**ID:** `rq-clarifyEnforcementAudit01` | **Priority:** **[MUST]**

The clarify_enforcement configuration flag (off | advisory | strict) MUST extend to /adv-audit ambiguity detection. When off, ambiguity detection is skipped. When advisory, findings are informational only and do not affect quality gates. When strict, ambiguity findings participate in quality gate evaluation and health status promotion. Cross-reference: advance-workflow rq-ambiguityScan01..rq-ambiguityScan05.

**Tags:** `audit`, `ambiguity`, `clarify`, `configuration`

#### Scenarios

**off mode skips ambiguity detection in audit** (`rq-clarifyEnforcementAudit01.1`)

**Given:**
- clarify_enforcement is set to 'off' in project configuration

**When:** /adv-audit executes Phase 3 Synthesis

**Then:**
- runSpecAmbiguityChecks is NOT invoked
- No ambiguity findings appear in the audit report
- Quality gate evaluation ignores ambiguity thresholds

**advisory mode includes findings without gate enforcement** (`rq-clarifyEnforcementAudit01.2`)

**Given:**
- clarify_enforcement is set to 'advisory'

**When:** /adv-audit completes and applies quality gates

**Then:**
- Ambiguity findings appear in the report's ambiguity section
- Ambiguity findings do NOT promote health status
- Quality gate table shows ambiguity metrics as informational (not pass/fail)

**strict mode enforces ambiguity gates** (`rq-clarifyEnforcementAudit01.3`)

**Given:**
- clarify_enforcement is set to 'strict'

**When:** /adv-audit applies quality gates

**Then:**
- CRITICAL ambiguity ≥ 1 promotes health to MAJOR_DRIFT
- HIGH ambiguity > 3 (standard) or any HIGH (strict) promotes to DRIFT_DETECTED
- Ambiguity thresholds appear in the quality gate table with pass/fail status

---

### adv_status lazy view planning

**ID:** `rq-advStatusLazyView01` | **Priority:** **[MUST]**

`adv_status` MUST execute only the provider groups required by the selected `view`. `view: "summary"` MUST NOT invoke detailed-only providers (worktree cleanup, worktree census, OpenCode session-debt scan, snapshot-health scan, plugin-runtime provenance, project-metadata read, external-state hygiene), and the formatted output for `view: "summary"` MUST NOT carry health/worktree/session-debt/peer detail sections. Detailed views remain free to invoke their providers. The recommendation-list `_contextSnapshot` emission (chat-output-display `rq-ctxticker2.5` — advisory multi-change display) MUST be preserved across all views. The default-OFF opt-in behavior of `rq-ctxsnap2` and `rq-ctxticker2` (applied to mutation/ready tools) does NOT affect `adv_status` recommendation-list snapshots.

**Tags:** `adv_status`, `latency`

#### Scenarios

**Summary skips detailed providers but preserves recommendation-list snapshots** (`rq-advStatusLazyView01.1`)

**Given:**
- adv_status is called with view: "summary"

**When:** The tool builds output

**Then:**
- Detailed-only providers are not invoked
- Formatted summary omits health/worktree/session-debt/peer detail sections
- Recommendation-list `_contextSnapshot` per `rq-ctxticker2.5` is still emitted (advisory multi-change display, MCP-contract-bound)

**Detailed views retain their providers** (`rq-advStatusLazyView01.2`)

**Given:**
- adv_status is called with view: "health" or view: "hygiene"

**When:** The tool builds output

**Then:**
- The corresponding detailed providers run
- The detailed payload exposes the required diagnostic fields

---

### adv_status Summary Output Is Bounded Before Enrichment

**ID:** `rq-advStatusBoundedSummary01` | **Priority:** **[MUST]**

`adv_status view: "summary"` MUST keep both compute and output bounded for large WIP projects. The summary view MUST cap recent changes before any per-change enrichment, artifact reads, or recommendation generation that depends on the recent-change list. It MUST cap summary recommendations to a small fixed window and include omitted-count metadata or an omitted-count marker when truncation occurs. Detailed views (`changes`, `hygiene`, and `health`) remain explicit drilldowns for fuller diagnostics and MUST NOT be used as implicit default fanout.

**Tags:** `adv_status`, `latency`, `summary`, `bounded-output`

#### Scenarios

**Summary caps recent changes before enrichment** (`rq-advStatusBoundedSummary01.1`)

**Given:**
- A project has more active or recent changes than the summary recent-change limit

**When:** adv_status is called with view: "summary"

**Then:**
- The recent-change list is sliced to the fixed summary limit before per-change enrichment runs
- Per-change enrichment, artifact reads, and recommendation generation are not run for omitted recent changes
- The response reports how many recent changes were omitted

**Summary caps recommendations with omitted marker** (`rq-advStatusBoundedSummary01.2`)

**Given:**
- Summary recommendation generation produces more entries than the summary recommendation limit

**When:** adv_status builds the summary response

**Then:**
- Only the fixed recommendation window is returned
- An omitted-count marker or metadata reports how many recommendations were omitted
- The marker directs callers to explicit detailed views for full diagnostics

**Detailed views remain explicit drilldowns** (`rq-advStatusBoundedSummary01.3`)

**Given:**
- A caller requests view: "changes", view: "hygiene", or view: "health"

**When:** adv_status builds the selected detailed view

**Then:**
- The detailed view may expose fuller diagnostics required by that view
- The detailed view is not invoked by default summary routing
- Detailed output remains bounded or paginated when exposing large collections

---

### Correctness-safe summary read model for default list/status

**ID:** `rq-changeSummaryReadModel01` | **Priority:** **[MUST]**

Default `adv_change_list` and warm `adv_status` read paths MUST avoid per-change full hydration when summary data already satisfies the response contract. The disk store MUST expose a summary listing surface (`Store.changes.listSummary`) that serves rows from `ChangeSummaryMemo` or `changeCache` when available, hydrates only IDs missing summary proof, and falls back to the authoritative `listResolvedChanges`/`changes.get` path for archived/closed callers, content filters, and any path whose correctness requires full state. Summary/cache data MUST NOT authorize gates, archive, worker-lock recovery, claims, task completion, or contract evidence.

**Tags:** `adv_change_list`, `adv_status`, `latency`, `cache`

#### Scenarios

**Memo-served warm list skips per-change hydration** (`rq-changeSummaryReadModel01.1`)

**Given:**
- ChangeSummaryMemo holds complete summaries for the requested IDs

**When:** Default adv_change_list is served via listSummary

**Then:**
- Per-change full hydration is not invoked for memo-served IDs
- Response shape matches the legacy list projection
- Hydration statistics report fromMemo > 0 and fromHydration === 0 for the warm-only case

**Authoritative fallback for terminal or filtered callers** (`rq-changeSummaryReadModel01.2`)

**Given:**
- Caller requests archived/closed inclusion, prefix/title/created filters, or any path requiring full state

**When:** listSummary executes

**Then:**
- The authoritative listResolvedChanges path runs
- Terminal status records are reconciled via disk/archive instead of memo
- Summary/cache data does not authorize gate completion, archive, claim, recovery, or task completion

---

### Always-on ADV latency telemetry

**ID:** `rq-advLatencyTelemetry01` | **Priority:** **[MUST]**

ADV tool execution MUST record duration telemetry to an in-memory rollup surfaced via `adv_status view: "health"`. Per-tool aggregates MUST include count, total_ms, last_ms, max_ms, and error_count. Named phase/substep durations (e.g. `adv_status` providers, `adv_run_test` substeps) MUST be retained in a bounded recent-phase ring so operators can diagnose substep overhead without enabling `ADV_PROFILE` file logging. Error paths MUST preserve their error class and still record duration.

**Tags:** `telemetry`, `metrics`, `latency`

#### Scenarios

**Per-tool duration rollup is always recorded** (`rq-advLatencyTelemetry01.1`)

**Given:**
- safeExecute wraps an adv_* tool invocation

**When:** The tool succeeds or fails

**Then:**
- adv_tool_durations records count, total_ms, last_ms, max_ms for the tool name
- Error outcomes additionally increment error_count without losing duration
- wall_time_ms accumulates the measured duration

**Named phase/substep ring surfaces in health view** (`rq-advLatencyTelemetry01.2`)

**Given:**
- adv_status and adv_run_test invoke withRecordedPhase for their named phases

**When:** adv_status view: "health" is read

**Then:**
- metrics.recent_phase_durations exposes the named samples bounded by RECENT_PHASE_BUFFER_LIMIT
- Each sample carries tool, phase, duration_ms, outcome, and ISO timestamp

---

### Documented latency benchmark harness

**ID:** `rq-advLatencyBench01` | **Priority:** **[MUST]**

`plugin/scripts/bench-adv-latency.ts` MUST initialize under the disk-only store contract. Default mode (`--mode disk`) MUST use a documented isolated substitute backed by `createDiskStore` so the harness runs without a live disk worker; samples MUST include `adv_status view: "summary"`, `adv_status view: "health"`, `adv_change_list`, `adv_change_show`, a disk-store task list fallback, and `adv_run_test` echo/no-op. `--mode disk` MUST require a real disk-backed setup or fail closed with remediation; it MUST NOT fabricate a DiskProjectionStoreBundle or silently substitute disk numbers. Every report MUST label mode and runtime context and include operation name, iterations, warmup, min, p50, p95, max, and avg so disk-substitute results cannot be confused with live disk latency evidence.

**Tags:** `benchmark`, `latency`

#### Scenarios

**Default disk substitute initializes and reports** (`rq-advLatencyBench01.1`)

**Given:**
- No disk worker is running

**When:** Operator runs the bench in default mode against an existing change

**Then:**
- The harness initializes via createDiskStore
- Markdown report includes metadata (mode, substitute, change id, iterations) and per-operation stats
- Sample operations include both summary and health adv_status views

**disk mode refuses to silently substitute** (`rq-advLatencyBench01.2`)

**Given:**
- Operator passes --mode disk without providing a DiskProjectionStoreBundle

**When:** The bench attempts to build the store

**Then:**
- The script exits non-zero with an explicit refusal message
- The script does not emit disk-substitute measurements under a disk-mode label

**Reports label mode and latency statistics** (`rq-advLatencyBench01.3`)

**Given:**
- A latency benchmark run completes in disk or disk mode

**When:** The report is rendered

**Then:**
- The report includes mode, runtime context, change id, iterations, and warmup metadata
- Each operation row includes min, p50, p95, max, and avg statistics
- Disk-substitute measurements are not compared against live disk thresholds

---

### adv_run_test hot-path latency preserves correctness

**ID:** `rq-advRunTestLatency01` | **Priority:** **[MUST]**

`adv_run_test` latency improvements MUST preserve the existing tool contract: task validation, shell-command execution semantics, timeout/max-buffer classification, exit-code reporting, and output shaping. Every invocation MUST execute the supplied command fresh; the tool MUST NOT cache, skip, or fabricate command results. The public result contract MUST include typed fields `passed`, `classification`, `durationMs`, `outputBytesSeen`, `outputBytesRetained`, `outputTruncated`, `executionMode`, a typed evidence-recording status, and compact `evidence.schema_version='adv_run_test.v1'` while legacy fields remain available. Telemetry MUST record duration for substeps `targetRouting`, `taskLookup`, `commandExecution`, and `outputShaping` so operators can diagnose hot-path overhead without changing the tool contract. Subprocess implementation changes are allowed only when compatibility tests cover shell metacharacters/pipelines/redirects, timeout/kill classification, max-buffer classification, stdout/stderr capture, non-zero exit reporting, and output shaping.

**Tags:** `adv_run_test`, `latency`, `tdd`

#### Scenarios

**Substep telemetry surfaces without altering contract** (`rq-advRunTestLatency01.1`)

**Given:**
- adv_run_test is invoked with a valid task and shell command

**When:** The tool completes successfully or with non-zero exit

**Then:**
- Recent phase samples include taskLookup, commandExecution, and outputShaping for tool adv_run_test
- commandExecution outcome reflects the exit code (success on 0, error on non-zero)
- Task validation, timeout, max-buffer, and output shaping classifications are unchanged

**Per-call fresh execution** (`rq-advRunTestLatency01.2`)

**Given:**
- adv_run_test is invoked twice with the same task and command

**When:** Both invocations complete

**Then:**
- Each invocation runs the supplied command in a fresh subprocess
- Task lookup runs on every call and is not served from a cache that bypasses validation

**Typed result contract remains backward compatible** (`rq-advRunTestLatency01.3`)

**Given:**
- adv_run_test completes with pass, failure, timeout, or output-limit classification

**When:** The tool response is returned

**Then:**
- Typed fields include `passed`, `classification`, `durationMs`, `outputBytesSeen`, `outputBytesRetained`, `outputTruncated`, and `executionMode`
- The compact evidence block uses schema_version `adv_run_test.v1`
- The legacy fields remain available: `success`, `exitCode`, `output`, `command`, `timedOut`, `maxBufferExceeded`, and `timeoutMs` when applicable

**Evidence recording degradation is explicit and bounded** (`rq-advRunTestLatency01.4`)

**Given:**
- adv_run_test has completed the supplied shell command
- The best-effort testRunRecordedSignal cannot be recorded before the bounded recording wait expires or fails

**When:** The tool response is returned

**Then:**
- The command result fields still report the actual command execution result
- A typed evidence-recording status reports recorded, degraded, or not_applicable
- Recording failure is not swallowed silently and does not fabricate a successful durable record

---

### Session Active-Change Pointer Hygiene

**ID:** `rq-activeChangePointer01` | **Priority:** **[MUST]**

The session active-change pointer and status mirror MUST not retain phantom references to change IDs whose workflow is unreachable and whose durable projection is absent. Pointer validity MUST be checked and stale pointers cleared automatically at session/read boundaries; terminal transitions clear matching pointers after verified success; cross-project operations never alter the caller-project pointer. All pointer mutations remain in plugin index hooks and tools MUST NOT directly mutate the pointer. A dedicated pointer-forget recovery tool, tombstone, or compatibility record is not required.

**Tags:** `pointer`, `session`, `phantom`, `recovery`, `lifecycle`, `handleToolExecuteBefore`

#### Scenarios

**Phantom active pointer clears automatically** (`rq-activeChangePointer01.1`)

**Given:**
- A session active-change pointer references change X
- X has no reachable workflow and no durable projection

**When:** The pointer is validated during session or active-context read handling

**Then:**
- The pointer and status mirror are cleared
- A bounded internal audit entry records the stale-pointer clear
- No dedicated recovery tool is required

**Reachable or durable pointer remains** (`rq-activeChangePointer01.2`)

**Given:**
- A session pointer references a change with reachable workflow or valid durable projection

**When:** Pointer validation runs

**Then:**
- The pointer remains unchanged
- Temporary source degradation does not clear a valid pointer without structural absence proof

**Terminal transitions clear matching active pointer** (`rq-activeChangePointer01.3`)

**Given:**
- A session pointer references change X

**When:** Verified close or archive succeeds for X

**Then:**
- The pointer and status mirror clear after terminal success
- Partial failure or terminal success for another change does not clear X

**Unknown tool target does not re-point session** (`rq-activeChangePointer01.4`)

**Given:**
- A tool call references non-existent change Y while pointer X is active

**When:** The tool-execute-before hook validates Y

**Then:**
- The pointer remains X
- The tool returns its normal not-found result
- No phantom pointer is created

**Cross-project operations preserve caller pointer** (`rq-activeChangePointer01.5`)

**Given:**
- Project A has active pointer X
- A tool operates on project B via target_path

**When:** Before/after hooks process the call

**Then:**
- Project A pointer remains X
- Target-project terminal operations do not clear or replace caller pointer

---

### Shallow-Repo Project Identity Refusal

**ID:** `rq-projectIdentityStability01` | **Priority:** **[MUST]**

ADV project identity is derived from the repository root commit. In a shallow clone, `git rev-list --max-parents=0 HEAD` returns the moving `.git/shallow` graft boundary as a fake root, and commit grafts rewrite parentage the same way. ADV MUST NOT mint external disk state under such an unstable pseudo-root identity: identity resolution must structurally detect shallow and grafted repositories and refuse with a typed, actionable error. Full clones, partial clones with complete root history (for example `--filter=blob:none`), and multi-root repositories must resolve exactly as before — the guard must never false-trip on stable histories.

**Tags:** `identity`, `git`, `stability`, `guard`

#### Scenarios

**Shallow clone refuses identity minting with unshallow guidance** (`rq-projectIdentityStability01.1`)

**Given:**
- A repository where `git rev-parse --is-shallow-repository` reports true

**When:** ADV resolves the project identity to initialize or mutate state

**Then:**
- Resolution returns an unstable-identity refusal instead of the shallow graft-boundary SHA
- The raised `UnstableIdentityError` names the repository path and the exact remediation command `git fetch --unshallow`
- No external disk-state directory or change projection is created under the unstable identity

**Grafted repository refuses with graft remediation** (`rq-projectIdentityStability01.2`)

**Given:**
- A repository with `.git/info/grafts` present

**When:** ADV resolves the project identity

**Then:**
- Resolution returns an unstable-identity refusal with reason `graft`
- The error guidance directs removal of `.git/info/grafts` (or `git replace` migration) plus `git fetch --unshallow` when the repo is also shallow

**Partial clone with full root history does not trip the guard** (`rq-projectIdentityStability01.3`)

**Given:**
- A partial clone created with `--filter=blob:none` (no `.git/shallow` file)

**When:** ADV resolves the project identity

**Then:**
- The guard does not trip
- Identity resolves to the true root commit exactly as in a full clone

**Multi-root and non-git directories keep legacy resolution behavior** (`rq-projectIdentityStability01.4`)

**Given:**
- A repository with multiple root commits and complete history, or a directory that is not a git repository

**When:** ADV resolves the project identity

**Then:**
- A multi-root repository resolves deterministically to the lexicographically first root commit
- A non-git directory resolves to a not-git outcome (legacy null/fallback behavior), never an unstable-identity refusal

---

### Tool Ownership and Reachability Matrix

**ID:** `rq-toolOwnership01` | **Priority:** **[MUST]**

Every registered ADV tool must have an explicit ownership/reachability classification—orchestrator, operator-only, or dual—recorded in the git-tracked matrix at docs/tool-ownership.md. Machine-resolvable recovery belongs in normal operations and MUST NOT remain as routine operator-only repair tools. The operator repair group contains only genuine operator boundaries: adv_archive_purge, adv_doctor, and adv_store_cleanup. Deleted workflow-termination and identity-consolidation tools MUST NOT remain in the matrix or repair group. Intent-bearing origin, legacy-store, and worktree maintenance may remain separately classified outside the repair group. Operator-only destructive actions require explicit instruction and approval evidence. The matrix is enforced by static tests against the canonical registry.

**Tags:** `tool-surface`, `ownership`, `operator-only`, `docs`

#### Scenarios

**Matrix document covers every registered tool** (`rq-toolOwnership01.1`)

**Given:**
- The canonical set of registered ADV tool names

**When:** The tool-ownership static-check test runs

**Then:**
- docs/tool-ownership.md contains a classification row for every registered tool
- A tool added or renamed without a matrix row fails CI

**Repair group is limited to genuine operator boundaries** (`rq-toolOwnership01.2`)

**Given:**
- Normal operations directly converge machine-resolvable state

**When:** Tool ownership and grouping are inspected

**Then:**
- The repair group contains no more than adv_archive_purge, adv_doctor, and adv_store_cleanup
- Superseded diagnose, reconnect, restart, registration, status-repair, archive-repair, membership-repair, and pointer-forget tools are absent
- Destructive actions retain explicit approval requirements

**Dual tools split read and mutate reachability** (`rq-toolOwnership01.3`)

**Given:**
- A dual-classified tool exposes read and mutation behavior

**When:** An agent uses the tool

**Then:**
- Read actions are agent-reachable
- Intent-bearing or destructive mutation remains operator-owned
- Automatic internal convergence is limited by typed structural preconditions and does not consume operator authority

---

### Target-Relative Cross-Project Trunk Write Firewall

**ID:** `rq-crossProjectTrunkFirewall01` | **Priority:** **[MUST]**

When the session project enables worktree_guard_enforce, the trunk write firewall must classify every intercepted direct file-write and recognized destructive Bash target against the target repository’s own topology. It must block default-branch main-checkout writes for foreign repositories, allow eligible target linked worktrees and the established non-Git/recovery exceptions, evaluate only explicit generated artifacts relative to the target main root, and block target main-checkout writes when the default branch cannot be verified. Target topology resolution must be bounded to one hook invocation and must not treat prunable worktree records as writable linked worktrees.

**Tags:** `trunk-write-firewall`, `cross-project`, `worktree`, `safety`

#### Scenarios

**Foreign default-branch main checkout blocks** (`rq-crossProjectTrunkFirewall01.1`)

**Given:**
- worktree_guard_enforce is enabled for the session project
- A direct file write or recognized destructive Bash target is inside another repository’s default-branch main checkout

**When:** The firewall evaluates the target repository context

**Then:**
- The operation is blocked with worktree remediation
- The target is not allowed merely because it is outside the session project root

**Eligible foreign linked worktree allows** (`rq-crossProjectTrunkFirewall01.2`)

**Given:**
- A target is inside a non-prunable linked worktree registered by its repository
- The target repository is on its default branch

**When:** The firewall evaluates a direct file write or recognized destructive Bash target

**Then:**
- The operation is allowed
- The main checkout remains protected

**Target-root artifact and uncertainty boundaries remain narrow** (`rq-crossProjectTrunkFirewall01.3`)

**Given:**
- A target is in a foreign repository’s main checkout

**When:** The target is one of the four explicit root artifacts, a nested lookalike, another .adv path, or a repository with unknown default branch

**Then:**
- Only the exact target-root artifact is allowed
- Nested and unrelated artifact paths are blocked
- Unknown-default main-checkout writes are blocked with remediation

**Missing-parent and prunable topology are safe** (`rq-crossProjectTrunkFirewall01.4`)

**Given:**
- A target has missing nested parent directories or lies under a prunable worktree record

**When:** The firewall resolves target topology

**Then:**
- The nearest existing ancestor is used for classification
- A prunable record does not grant linked-worktree allowance

---

### Health Providers Return Typed Partial Outcomes

**ID:** `rq-statusHealthTypedDegradation01` | **Priority:** **[MUST]**

Every provider admitted by `adv_status view:health` MUST produce a discriminated outcome of `ok`, `stale`, `timeout`, `error`, `unavailable`, or `not_admitted`. Completed sections MUST remain available when another provider degrades. Existing required response fields and freshness metadata MUST remain compatible. Cached or stale provider evidence is advisory only and MUST NOT independently establish authoritative completeness or authorize mutation. Request-aborted force-refresh work MUST NOT publish late request-scoped cache state.

**Tags:** `status`, `health`, `degradation`, `cache`

#### Scenarios

**Slow provider degrades without whole-result failure** (`rq-statusHealthTypedDegradation01.1`)

**Given:**
- One health provider exceeds its bounded allowance
- Other providers have completed

**When:** Health output is composed

**Then:**
- The slow source reports timeout
- Completed diagnostic sections remain present
- Overall completeness is degraded rather than falsely complete

**Every incomplete source is explicit** (`rq-statusHealthTypedDegradation01.2`)

**Given:**
- A provider errors, is unavailable, is stale, or is not admitted

**When:** Health renders execution metadata

**Then:**
- The source has the matching discriminated outcome
- Evidence is bounded and secret-safe
- No omission is silent

**Aborted refresh cannot publish late state** (`rq-statusHealthTypedDegradation01.3`)

**Given:**
- A force-refresh fetch is aborted by the request deadline

**When:** Its underlying non-cancellable work settles later

**Then:**
- The completed request output is unchanged
- Request-scoped cache publication does not occur
- Cached data cannot establish authoritative truth

---

### Structural Session Principal and Orphan Visibility

**ID:** `rq-sessionPrincipal01` | **Priority:** **[MUST]**

ADV MUST derive root versus descendant session authority from bounded OpenCode parentID ancestry, never first-caller order or caller-supplied role. Root-only mutations fail closed when ancestry is unresolved. Cross-session work projections MAY emit bounded warning-only orphan-task diagnostics from privacy-safe live session IDs, but MUST NOT mutate task state or expose peer PID/full working directory.

**Tags:** `sessions`, `role-firewall`, `privacy`, `tasks`

#### Scenarios

**Root and descendant derive structurally** (`rq-sessionPrincipal01.1`)

**Given:**
- A root OpenCode session and a descendant session exist

**When:** Each calls a root-only ADV tool before any system transform ordering guarantee

**Then:**
- The root is allowed
- The descendant is blocked
- Caller arguments cannot elevate the descendant

**Unresolved ancestry fails closed** (`rq-sessionPrincipal01.2`)

**Given:**
- Session lookup is missing, malformed, cyclic, over depth, or unavailable

**When:** A root-only tool is called

**Then:**
- The mutation is blocked
- Union-floor reads remain available

**Orphan diagnostics are warning-only and private** (`rq-sessionPrincipal01.3`)

**Given:**
- An in-progress task assignment is absent from the live privacy-safe session set

**When:** WIP state is projected

**Then:**
- A bounded warning identifies task and change
- No task mutation occurs
- Peer PID and full working directory are omitted

---

### Recovery Surface Contains Only Intent-Bearing Controls

**ID:** `rq-recoverySurfaceRetirement01` | **Priority:** **[MUST]**

Once normal operations directly handle a machine-resolvable recovery class, the superseded recovery tool and recovery-only arguments MUST be removed completely from executable registration, schemas, role policy, manifests, prompts, specs, documentation, tests, and preflight policy. No wrapper, alias, tombstone, hidden export, or compatibility record may preserve the removed surface. Remaining repair-group tools MUST correspond only to destructive intent or genuine authority ambiguity; unresolved infrastructure diagnostics MUST use one bounded doctor entry point.

**Tags:** `tools`, `recovery`, `surface`, `removal`, `doctor`

#### Scenarios

**Superseded recovery API leaves zero residue** (`rq-recoverySurfaceRetirement01.1`)

**Given:**
- A machine-resolvable recovery behavior has moved into its normal operation

**When:** The replacement ships

**Then:**
- The former tool and recovery-only arguments are absent from every active executable and documentation surface
- No wrapper, alias, tombstone, or compatibility export remains
- Parity tests fail if any active reference returns

**Destructive controls remain explicit** (`rq-recoverySurfaceRetirement01.2`)

**Given:**
- An action purges data, deletes legacy stores, or resolves competing authority

**When:** The recovery surface is consolidated

**Then:**
- The action remains explicitly approval-gated
- It is not performed by automatic direct recovery
- Its audit and pinning safeguards remain intact

**Infrastructure incident has one entry point** (`rq-recoverySurfaceRetirement01.3`)

**Given:**
- Normal direct recovery cannot resolve a runtime, projection, or snapshot incident

**When:** An agent requests diagnosis

**Then:**
- One doctor entry point diagnoses, applies structurally safe fixes, verifies results, and returns typed approval-required proposals for unsafe actions
- The agent is not required to choose among overlapping diagnosis and repair tools

---

### adv_doctor Phantom Session-Pointer Safe-Fix

**ID:** `rq-doctorPhantomPointer01` | **Priority:** **[MUST]**

The retired adv_change_forget tool's session active-change pointer clearing is consolidated into adv_doctor as a phantom_pointer safe-fix (design D5/D6, option B). Clearing MUST be structurally gated on confirmed-absent evidence via a tri-state probe (probeChangePhantomStatus in plugin/src/tools/_adapters.ts) that returns confirmed_absent | confirmed_present | indeterminate. A probe tier that throws (transport failure, timeout, schema error) MUST classify as indeterminate and MUST NOT be mistaken for absence. adv_doctor clears the session pointer ONLY on confirmed_absent; indeterminate MUST refuse with a typed approval_required proposal; confirmed_present is a no-op. Pointer access is injected via a plugin-host-only DoctorPointerRepairProvider (setDoctorPointerRepairProvider in index.ts); tests and the MCP server see a null provider and skip the phantom check entirely. All state.activeChange.id mutations remain in index.ts closure scope per rq-activeChangePointer01 — the doctor provider's clearActivePointer delegates to the same setActiveChange(null) path.

**Tags:** `pointer`, `session`, `phantom`, `recovery`, `doctor`, `tri-state`

#### Scenarios

**confirmed_absent clears the session pointer** (`rq-doctorPhantomPointer01.1`)

**Given:**
- A plugin-host session with state.activeChange.id set to changeId X
- The pointer-repair provider is injected
- The tri-state probe for X returns confirmed_absent (disk change.json absent AND store/Visibility explicitly not-found)

**When:** adv_doctor runs its diagnose→safe-fix→verify cycle

**Then:**
- A phantom_pointer finding is recorded
- clear_session_pointer safe-fix is applied with outcome 'applied'
- The provider's clearActivePointer is invoked, setting state.activeChange.id to null via setActiveChange(null)
- Bounded before/after evidence is attached (before: X, after: null)

**indeterminate refuses (never clears on ambiguous probe)** (`rq-doctorPhantomPointer01.2`)

**Given:**
- A plugin-host session with state.activeChange.id set to changeId X
- The tri-state probe for X returns indeterminate because a probe tier threw (transport failure / timeout)

**When:** adv_doctor runs its diagnose→safe-fix→verify cycle

**Then:**
- state.activeChange.id remains X (NOT cleared)
- The provider's clearActivePointer is NOT invoked
- A phantom_pointer refusal is recorded with outcome approval_required and a typed operator_action
- The refusal evidence explains a transport failure must not be mistaken for a deleted change

**confirmed_present and no-provider are no-ops** (`rq-doctorPhantomPointer01.3`)

**Given:**
- Case A: a plugin-host session where the probe returns confirmed_present for the active pointer
- Case B: a tests/MCP-server context where no pointer-repair provider is injected

**When:** adv_doctor runs

**Then:**
- (Case A) No phantom_pointer finding is produced and the pointer is not cleared
- (Case B) The phantom-pointer check is skipped entirely and probeChangePhantomStatus is never called
- In both cases the pointer is left unchanged

---

### Projection-First Routine Reads

**ID:** `rq-projectionReadModel02` | **Priority:** **[MUST]**

Routine ADV reads MUST resolve from schema-versioned durable entity projections and per-entity summary shards. Disk projections are the sole persistence authority; metadata-only surfaces remain independent of entity projections. Reads MUST NOT infer missing state from caches or reconstruct deleted runtime entities.

**Tags:** `read-model`, `projection`, `tool-catalog`, `tier4`, `performance`

#### Scenarios

**Routine reads avoid change projection Queries** (`rq-projectionReadModel02.1`)

**Given:**
- A valid full projection or summary shard exists

**When:** A change, task, gate, wisdom, delta, Epic, status, or WIP read executes

**Then:**
- The result is served from the read model
- No change projection Query is dispatched
- The response includes typed source, revision, and degraded provenance

**Change projection health does not block reads** (`rq-projectionReadModel02.2`)

**Given:**
- A change projection is missing, unreadable, or assigned to an orphaned mutation path
- A valid durable projection exists

**When:** A routine read executes

**Then:**
- The projection result is returned
- disk infrastructure failure is not surfaced as the read result
- Any degradation is represented as typed provenance

**Missing projection is typed** (`rq-projectionReadModel02.3`)

**Given:**
- No valid projection exists for the requested entity

**When:** A routine read executes

**Then:**
- The result is typed not-found or corrupt-projection as applicable
- The read does not silently hydrate from a change projection Query
- Repair or reconciliation is an explicit operational path

**Concurrent summaries preserve all changes** (`rq-projectionReadModel02.4`)

**Given:**
- Different changes commit projections concurrently

**When:** Their summary shards are published

**Then:**
- Each change updates only its own immutable revision shard and current pointer
- No shared-manifest lost update occurs
- The index can be rebuilt solely from full projections

**Pure metadata stays disk-free** (`rq-projectionReadModel02.5`)

**Given:**
- Tool catalog, tool describe, specs, backlog, or project context is requested

**When:** The read executes

**Then:**
- The request uses registry or filesystem context directly
- No disk reachability probe is required
- Tool classification structurally distinguishes pure/context/read-model/diagnostic needs

---

### Loaded Bundle Identity Governs ADV Traffic

**ID:** `rq-loadedBundleIdentityAuthority01` | **Priority:** **[MUST]**

The generation embedded in the loaded ADV bundle is the authority for whether the running code matches the deployed code. On a generation mismatch, ADV traffic MUST be refused with a typed mismatch code, both generations, and a recovery hint naming the process that owns the loaded module: an OpenCode restart for the host plugin bundle, and a restart of the Vision-managed adv-advance server for the MCP server bundle. Absent embedded generation or an unreadable manifest MUST be classified as unknown freshness and MUST continue to serve traffic, keeping dev/source runs and deployment gaps distinct from a mismatch. Generation equality alone decides staleness; per-file digests and filesystem timestamps stay diagnostic. The manifest MUST be published atomically after both bundle files exist so every reader observes a complete publish. Because a superseded bundle skips workflow patch markers silently, every durability guarantee implemented behind a `wf.patched` gate MUST additionally be paired with this generation guard so only current code serves the affected traffic.

**Tags:** `meta`, `deploy`, `bundle`, `code-identity`, `correctness`, `recovery`

#### Scenarios

**Generation mismatch refuses traffic with a process-correct recovery hint** (`rq-loadedBundleIdentityAuthority01.1`)

**Given:**
- A deployed bundle manifest exists
- The loaded bundle generation differs from the deployed manifest generation

**When:** An adv_ tool call is dispatched

**Then:**
- The call is refused before it can answer from superseded code
- The refusal carries a typed generation-mismatch code and both generations
- The recovery hint names the process that owns the loaded module, distinguishing the OpenCode host plugin from the Vision-managed adv-advance server

**Unknown freshness keeps serving traffic** (`rq-loadedBundleIdentityAuthority01.2`)

**Given:**
- The loaded bundle carries no embedded generation, or the deployed manifest is absent or unreadable

**When:** An adv_ tool call is dispatched

**Then:**
- Freshness is classified as unknown
- The call proceeds and returns its normal result
- Unknown freshness is reported as unknown, distinct from a generation mismatch

**Generation equality is the authority and the manifest publishes last** (`rq-loadedBundleIdentityAuthority01.3`)

**Given:**
- A bundle build emits a pre-bundle generation token and per-file digests

**When:** Freshness is evaluated and the manifest is published

**Then:**
- Staleness is decided by generation equality alone
- Per-file digests and filesystem timestamps are recorded as diagnostics only
- The manifest is written after both bundle files exist, via an atomic replace, so every reader observes a complete publish

**A patch-gated durability guarantee is paired with the generation guard** (`rq-loadedBundleIdentityAuthority01.4`)

**Given:**
- A durability guarantee is implemented behind a workflow patch marker
- A worker is serving a bundle that predates that marker

**When:** The guaranteed path executes on the stale bundle

**Then:**
- The patch marker is skipped silently and the guarantee does not hold
- The guarantee is paired with the generation guard so only current code serves the affected traffic
- The patch marker alone is treated as insufficient evidence of durability

---

### Inner Waits Nest Inside the Remaining Tool Budget

**ID:** `rq-toolBudgetNesting01` | **Priority:** **[MUST]**

A host tool invocation runs under a bounded wall-clock budget enforced by a safety-net timeout. Any blocking wait performed inside that invocation — file-lock acquisition, aggregate reads, subprocess waits — MUST size itself from the budget that REMAINS at the moment the wait starts, minus the response reserve, never from the budget the invocation began with. Deriving an inner wait from the total budget is a defect: a wait that starts late can then outlive the outer budget and let the opaque host timeout win instead of a typed failure. The remaining budget MUST be carried structurally for the duration of the invocation rather than by call-site discipline alone, and the derivation MUST live in one place so it can be machine-checked. A caller running outside any tool invocation has no outer deadline and MUST still apply its own bounded default; unbounded waiting is never acceptable. An exhausted remaining budget yields no wait at all rather than a minimum wait.

**Tags:** `meta`, `budgets`, `timeouts`, `correctness`, `safety`

#### Scenarios

**A late inner wait shrinks to the remaining budget** (`rq-toolBudgetNesting01.1`)

**Given:**
- a host tool invocation running under a bounded budget
- most of that budget has already been consumed

**When:** the invocation starts a blocking wait

**Then:**
- the wait budget is derived from the remaining budget minus the response reserve
- the wait budget never exceeds the remaining budget
- a typed failure can still be assembled and returned before the safety-net timeout fires

**A caller with no outer deadline stays bounded** (`rq-toolBudgetNesting01.2`)

**Given:**
- a caller running outside any host tool invocation, such as the CLI or plugin startup

**When:** it performs the same blocking wait

**Then:**
- no outer deadline is found
- the caller's own bounded default applies
- the wait is never unbounded

**An exhausted budget yields no wait** (`rq-toolBudgetNesting01.3`)

**Given:**
- a host tool invocation whose remaining budget is at or below the response reserve

**When:** the invocation starts a blocking wait

**Then:**
- the derived wait budget is zero
- no minimum wait is substituted
- the invocation proceeds to its typed failure immediately

---

### Per-agent skill catalog gating via permission.skill deny globs

**ID:** `rq-skillDenyGlob01` | **Priority:** **[MAY]**

ADV agent manifests MAY declare per-agent permission.skill deny globs to remove structurally irrelevant skills from the rendered catalog at render time. Denied skills vanish from the catalog but remain invocable via the skill tool. deploy-local.sh --check MUST verify deployed frontmatter consistency for declared deny globs.

#### Scenarios

**Render-time removal** (`rq-skillDenyGlob01.1`)

**Given:**
- An agent manifest carries permission.skill: {cloudflare*: deny} and OpenCode renders the system prompt

**When:** A deny glob is declared and the prompt renders

**Then:**
- Skills matching cloudflare* are absent from the catalog
- The skills remain invocable via the skill tool if explicitly requested

**Deploy consistency** (`rq-skillDenyGlob01.2`)

**Given:**
- deploy-local.sh --check runs against a manifest with declared deny globs

**When:** deploy-local.sh --check runs

**Then:**
- The deployed frontmatter is consistent and the globs are preserved

---

### Skill Reference Resolution Guard

**ID:** `rq-skillReferenceIntegrity01` | **Priority:** **[MUST]**

Active ADV surfaces MUST NOT reference a skill that does not exist. A canonical skill reference is `skill("<name>")` or a `skills/<name>/` path. Every canonical reference in an active surface MUST resolve to an existing `skills/<name>/SKILL.md` in the repository. A machine-checkable validator MUST enforce this in `pnpm run check`. Historical surfaces are excluded from enforcement.

**Tags:** `skills`, `reference-integrity`, `guard`, `ci`

#### Scenarios

**Resolving canonical reference** (`rq-skillReferenceIntegrity01.1`)

**Given:**
- An active surface contains skill("adv-foo") and skills/adv-foo/SKILL.md exists

**When:** The validator runs

**Then:**
- It reports no failure for that reference

**Unresolved canonical reference** (`rq-skillReferenceIntegrity01.2`)

**Given:**
- An active surface contains skill("adv-foo") and skills/adv-foo/SKILL.md does not exist

**When:** The validator runs

**Then:**
- It exits non-zero and names the referencing file:line together with the unresolved skill name

**Deleted skill with live reference** (`rq-skillReferenceIntegrity01.3`)

**Given:**
- A skill directory is deleted while an active surface still references it

**When:** pnpm run check runs

**Then:**
- The run fails

**Historical surface exclusion** (`rq-skillReferenceIntegrity01.4`)

**Given:**
- A reference appears only in .adv/archive/**, CHANGELOG.md, docs/adr/**, or LICENSE-THIRD-PARTY.md

**When:** The validator runs

**Then:**
- The reference is excluded from enforcement as a historical record

**All references resolve** (`rq-skillReferenceIntegrity01.5`)

**Given:**
- All canonical references in active surfaces resolve

**When:** The validator runs

**Then:**
- It exits zero

---
