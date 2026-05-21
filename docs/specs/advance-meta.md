# Advance Meta

> **Version:** 1.10.0
> **Updated:** 2026-05-12

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
- worker_singleton_enforce defaults true when omitted
- worktree_guard_enforce defaults false when omitted

---

### Bounded Cached Health Probes

**ID:** `rq-statusProbeCache01` | **Priority:** **[MUST]**

ADV health and recovery diagnostics that probe Temporal, task queues, worker diagnostics, search-attribute health, or worktree census must use bounded cached probes. Cached probe responses must surface \_freshness metadata with cached_at, stale, and optional error. Stale probe data may inform recommendations but must not authorize safety-critical mutations such as worker-lock reclaim, restart success, override, unlock, or archive decisions.

**Tags:** `diagnostics`, `temporal`, `cache`, `health`

#### Scenarios

**Status health probes are coalesced and freshened** (`rq-statusProbeCache01.1`)

**Given:**

- Multiple adv_status view:health calls request Temporal health, queue serviceability, search-attribute health, or worktree census within the probe TTL

**When:** The probes execute

**Then:**

- Concurrent same-key probes are coalesced
- Repeated calls within TTL return cached values
- The health response includes \_freshness metadata for each cached probe
- Existing health fields remain present for legacy consumers

**Stale probe data is diagnostic-only for recovery safety** (`rq-statusProbeCache01.2`)

**Given:**

- A cached Temporal or worker-serviceability probe is stale because refresh aborted, timed out, or failed

**When:** A diagnostic or recovery tool builds recommendations

**Then:**

- The stale value may be returned with \_freshness.stale=true and an error summary
- The stale value must not be treated as proof of worker serviceability
- The stale value must not authorize worker-lock reclaim, restart success, override, unlock, or archive decisions

---

### OpenCode Session Debt Diagnostics

**ID:** `rq-opencodeDebt01` | **Priority:** **[MUST]**

ADV diagnostics must safely detect stale blank assistant messages in the shared OpenCode session database, distinguish live in-flight rows from repairable stale debt, and require dry-run plus backup before any repair deletes rows.

**Tags:** `diagnostics`, `opencode`, `session-debt`, `doctor`

#### Scenarios

**Status reports stale blank assistant debt read-only** (`rq-opencodeDebt01.1`)

**Given:**

- The OpenCode database contains assistant messages with finish null and zero parts older than the stale threshold

**When:** adv_status or an ADV doctor diagnostic is executed

**Then:**

- The diagnostic opens the OpenCode database read-only
- The output reports the count and bounded samples of stale blank assistant messages
- A doctor recommendation is surfaced without modifying the database

**Live in-flight blank rows are excluded from repairable debt** (`rq-opencodeDebt01.2`)

**Given:**

- The OpenCode database contains assistant messages with finish null and zero parts younger than the stale threshold

**When:** OpenCode session-debt classification runs

**Then:**

- Younger rows are classified as live or in-flight
- Younger rows are not counted as repairable stale debt
- No repair recommendation is emitted solely because of younger rows

**Repair requires dry-run and backup** (`rq-opencodeDebt01.3`)

**Given:**

- A repair utility is invoked against the OpenCode database

**When:** Deletion is requested

**Then:**

- The utility refuses deletion unless apply mode is explicit
- The utility refuses deletion unless a backup destination is provided and populated before deletion
- Only assistant messages with finish null, zero parts, and age at or above the stale threshold are deleted

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

ADV instruction surfaces (ADV_INSTRUCTIONS.md, docs/command-voice-standard.md, .opencode/agents/adv.md, .opencode/command/adv-\*.md) MUST classify each section by enforcement class (fully-enforced, partially-enforced, inherently-prose) and apply the matching compression template defined in docs/command-voice-standard.md § Prose-Load Reduction Rules. Sections whose behavior is fully or partially enforced by code MUST NOT contain paragraph explanations duplicating the enforced behavior; they MUST use a pointer line + constraint table format.

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

Provider ADV evaluation must report prompt-size planes for the single-agent architecture: lean ADV runtime prompt size, ADV reference protocol size, provider hint size, dynamic ADV system-block estimate, caveman voice-contract allowance, selected runtime prompt size, and removed or avoided provider-variant duplication. Metrics must be coverage-first reporting and must not require generated adv-{provider}.md files as canonical inputs or impose a hard prompt-size cap as correctness proof.

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
- Metrics include caveman_voice_contract_allowance bytes and lines
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

### Category Classification Inventory

**ID:** `rq-proseReduction03` | **Priority:** **[MUST]**

When a change executes prose-load reduction work, an inventory document MUST be produced and committed during execution that records every section being reclassified, its enforcement class, target compression format, code reference (for fully/partially-enforced classes), and gap rationale (for partially-enforced class). The inventory is a working document during execution; after compression completes it is marked as a post-compression archive and is not maintained thereafter. Durable invariants live in this spec, not in the inventory document.

**Tags:** `prose-reduction`, `audit-trail`, `inventory`

#### Scenarios

**Inventory captures classification rows** (`rq-proseReduction03.1`)

**Given:**

- A change executes prose-load reduction work

**When:** The inventory document is inspected after the inventory pass completes

**Then:**

- Every reclassified section appears as a row
- Each row records: surface, section, line count, class (full/partial/inherent), target format, code reference (for full/partial), gap rationale (for partial), status

**Inventory marked archive after compression** (`rq-proseReduction03.2`)

**Given:**

- All compression passes for a prose-reduction change have completed

**When:** The inventory document header is inspected

**Then:**

- The header records POST-COMPRESSION ARCHIVE status
- No maintenance owner is assigned to the inventory thereafter

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

Skill files under skills/\*/SKILL.md MUST use the same enforcement-class compression framework as command files. New or modified skills must be classified as full, partial, or inherent in docs/prose-load-inventory.md and compressed accordingly before archive.

**Tags:** `prose-reduction`, `skills`, `compression`

#### Scenarios

**Modified skill follows enforcement-class compression** (`rq-skillProseCompression01.1`)

**Given:**

- A skill file in skills/\*/SKILL.md is created or modified

**When:** The skill file is prepared for archive

**Then:**

- The skill is compressed per the same enforcement-class framework as command files
- The applicable class is full, partial, or inherent per docs/prose-load-inventory.md
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

### adv_archive_purge tool

**ID:** `rq-archivePurge01` | **Priority:** **[MUST]**

ADV must provide an explicit user-side lever to terminate an archived change workflow and remove its archive bundle and disk projection. The on-disk archive bundle is preserved by default; the destructive disk-removal escalation requires opt-in. After a workflow-only purge, adv_change_show for the purged change continues returning content from the on-disk projection.

#### Scenarios

**Workflow-only purge by default preserves disk bundle** (`rq-archivePurge01.1`)

**Given:**

- An archived change with both an active change workflow and an existing archive/<id>/change.json bundle on disk

**When:** adv_archive_purge changeId: <id> is invoked without includeDiskBundle

**Then:**

- The change workflow is terminated via Temporal client
- The on-disk archive bundle is preserved
- adv_change_show for the changeId returns content from the on-disk projection

**Opt-in includeDiskBundle removes both workflow state and disk artifacts** (`rq-archivePurge01.2`)

**Given:**

- An archived change with both active workflow and disk bundle

**When:** adv_archive_purge changeId: <id> includeDiskBundle: true is invoked

**Then:**

- The change workflow is terminated
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

- A tool whose execute body wraps a subprocess or workflow operation that legitimately exceeds 10s

**When:** The tool is registered in tool-registry.ts

**Then:**

- The registration uses safeExecute with an explicit { timeoutMs: N } where N is sufficient for the inner budget plus modest headroom
- A code comment cites the inner-budget rationale and references this requirement

**adv_temporal_worker_restart uses bounded verified recovery** (`rq-toolTimeoutOverride01.2`)

**Given:**

- A Temporal worker restart is requested for the current project

**When:** adv_temporal_worker_restart is invoked

**Then:**

- The tool waits up to the configured verification budget (default 10s) for the expected project task queue to become serviceable
- The tool returns success:true only when serviceability is proven by local worker readiness and/or fresh server-side poller evidence
- The tool returns success:false with structured diagnostics when verification times out or evidence is unavailable or negative
- The tool is registered with an explicit safety-net timeout override that exceeds the verification budget with modest headroom

---

### adv_change_bulk_close composes disk sweep

**ID:** `rq-bulkCloseDiskSweep01` | **Priority:** **[MUST]**

After a successful adv_change_bulk_close, both workflow state and on-disk source artifacts (changes/<id>/change.json, proposal.md) MUST be removed in the same call for changes whose individual close succeeded. Per-id outcomes are reported in diskRemoved and diskFailed arrays in the response. Mid-flight workflow-close failure preserves source dirs as the orphan-sweep recovery path.

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

### Singleton Temporal worker per project across sessions

**ID:** `rq-workerSingleton01` | **Priority:** **[MUST]**

When multiple plugin instances initialize against the same external state directory for the same project, at most ONE Temporal worker process MUST exist for that project_id at any given time. A file-lock sentinel at {external-state-dir}/{project-id}/worker.lock coordinates ownership. Subsequent instances participate as Temporal clients only. Heartbeat freshness is the primary liveness signal for v2 worker locks but proves only host liveness, not expected queue serviceability. Dead-PID reclaim remains automatic. For legacy v1 fallback locks, an alive PID protects singleton ownership during passive initialization and when the expected project queue is serviceable. A v1 alive-PID lock with no heartbeat and no serviceable queue is classified as suspect during recovery decisions and may only be reclaimed through an explicit user-approved recovery path. A v2 lock whose holder's local worker is not registered to the expected queue (or whose serviceability is otherwise negative) is also classified as suspect; live unserviceable v1/v2 reclaim requires explicit approval evidence unless dead-PID or stale-heartbeat rules prove the holder stale. When a lock holder's own local worker remains unserviceable past the configured grace window, the holder MUST stop renewing the heartbeat so the v2 lock can age out without manual deletion.

#### Scenarios

**First plugin instance acquires lock and spawns worker** (`rq-workerSingleton01.1`)

**Given:**

- No worker.lock file exists in the project external state directory

**When:** The plugin initializes

**Then:**

- A worker.lock file is created atomically (O_CREAT | O_EXCL) with the plugin process PID
- An out-of-process Temporal worker is spawned via the existing out-of-process-worker.ts path
- Cleanup hooks (process exit / SIGINT / SIGTERM) release the lock and terminate the worker

**Subsequent plugin instance reads lock and skips worker spawn** (`rq-workerSingleton01.2`)

**Given:**

- A worker.lock file exists and the recorded PID is alive (process.kill(pid, 0) succeeds or throws EPERM)
- Either the lock has no last_heartbeat field (v1 fallback) during passive initialization or with serviceable queue evidence, or the lock has a fresh v2 heartbeat

**When:** A second plugin initializes against the same project

**Then:**

- The acquireWorkerLock helper reports owned:false with ownerPid
- No additional worker process is spawned
- The plugin still initializes the Temporal client and participates as a client only

**Stale lock from dead PID is reclaimed** (`rq-workerSingleton01.3`)

**Given:**

- A worker.lock file exists but the recorded PID is no longer alive (process.kill(pid, 0) throws ESRCH)

**When:** A plugin attempts to acquire the lock

**Then:**

- The stale lock file is removed
- Acquisition is retried once
- On success the new plugin owns the lock and spawns its own worker

**ADV_FORCE_IN_PROCESS_WORKER bypasses singleton lock** (`rq-workerSingleton01.4`)

**Given:**

- process.env.ADV_FORCE_IN_PROCESS_WORKER === '1'

**When:** The plugin initializes

**Then:**

- The lock-acquisition step is skipped
- The legacy in-process worker path is used
- This rollback path supports per-session debugging when needed

**Stale v2 heartbeat is reclaimed even when PID remains alive** (`rq-workerSingleton01.5`)

**Given:**

- A worker.lock file exists with schema_version 2 and a recorded PID that is alive
- The lock last_heartbeat is older than the configured stale-heartbeat grace

**When:** A plugin attempts to acquire the lock

**Then:**

- The stale heartbeat lock file is removed
- Acquisition is retried through the existing atomic O_EXCL path
- A fresh worker may acquire the singleton lock without requiring external lock cleanup

**Suspect legacy live lock requires approval to reclaim** (`rq-workerSingleton01.6`)

**Given:**

- A v1 worker.lock exists with an alive recorded PID
- The expected project queue is not serviceable within the verification budget

**When:** diagnose or restart recovery evaluates the worker state

**Then:**

- The state is classified as suspect_live_legacy_lock
- No lock is reclaimed automatically
- Recovery requires explicit user approval evidence or restarting the owning OpenCode session
- Successful approved reclaim records prior PID, schema version, expected queue, and approval evidence

**Suspect fresh-v2 unserviceable lock requires approval to reclaim** (`rq-workerSingleton01.7`)

**Given:**

- A v2 worker.lock exists with an alive recorded PID and a fresh heartbeat
- The expected project queue is not serviceable within the verification budget

**When:** diagnose or restart recovery evaluates the worker state

**Then:**

- The state is classified as suspect_live_unserviceable_lock
- No lock is reclaimed automatically by stale-PID or stale-heartbeat rules
- Recovery requires explicit user approval evidence or restarting the owning OpenCode session
- Successful approved reclaim records prior PID, schema version, workerId, expected queue, and approval evidence

**Lock owner self-expires heartbeat when local worker remains unserviceable** (`rq-workerSingleton01.8`)

**Given:**

- The current OpenCode session holds the project worker.lock with a v2 heartbeat
- The local worker is registered as the owner but is not serving the expected queue past the configured serviceability grace window

**When:** The heartbeat writer evaluates whether to renew the heartbeat

**Then:**

- The owner MUST stop renewing the heartbeat so the v2 lock can age out via the existing stale-heartbeat reclaim path
- The owner records the self-expiry decision in last_worker_run_error for diagnostics
- Peer sessions can reclaim through the normal stale-heartbeat path without manual lock deletion

**Worker role is visible in health diagnostics** (`rq-workerSingleton01.9`)

**Given:**

- ADV status health diagnostics are requested while worker singleton enforcement is active

**When:** adv_status view:health is executed

**Then:**

- The response includes worker_role with host, client, or degraded
- The worker_role field is additive and does not remove legacy Temporal health fields
- The feature_flags response shows worker_singleton_enforce and worktree_guard_enforce effective defaults

---

### Temporal worker run-loop failure is observable

**ID:** `rq-workerHealth01` | **Priority:** **[MUST]**

When a Temporal worker run loop rejects, exits unexpectedly, or exhausts restart attempts, ADV diagnostics must expose the last worker run-loop failure without requiring normal-path task-queue RPCs during plugin initialization.

#### Scenarios

**Worker run-loop failure appears in diagnostics** (`rq-workerHealth01.1`)

**Given:**

- A Temporal worker run loop rejects or an out-of-process worker reports a run-error

**When:** adv_status or adv_temporal_diagnose inspects Temporal health

**Then:**

- The last worker run-loop error includes queue, message, and timestamp
- The diagnostic remains additive and does not require describeTaskQueue during normal plugin initialization

**Queue serviceability appears in diagnostics** (`rq-workerHealth01.2`)

**Given:**

- A project queue has no proven local worker readiness and no fresh server-side poller evidence

**When:** adv_status view:health or adv_temporal_diagnose is executed

**Then:**

- Diagnostics include expected queue and local worker registration status
- Diagnostics include worker process or IPC details when available
- Diagnostics include server poller probe status and stale running workflow count or probe status
- Diagnostics include a recommended next action

**Fresh v2 heartbeat is liveness evidence only, not serviceability proof** (`rq-workerHealth01.3`)

**Given:**

- A worker.lock has schema_version 2 with a fresh last_heartbeat
- The expected project queue is not serviceable through local registration or fresh server-side poller evidence

**When:** adv_status view:health or adv_temporal_diagnose classifies recovery state

**Then:**

- The fresh heartbeat is treated as host or owner liveness evidence only
- The diagnostic does not classify the queue as serviceable or as normal recovery pending peer worker spawn
- The recommended next action surfaces approval-gated suspect_live_unserviceable_lock or owner-restart guidance

**adv_temporal_reconnect is STSL-only and not worker-registration recovery** (`rq-workerHealth01.4`)

**Given:**

- Recovery diagnostics show worker_alive false or expected queue not serviceable

**When:** adv_temporal_diagnose, adv_status, or workflow-access guidance proposes the next action

**Then:**

- adv_temporal_reconnect is reserved for STSL or client connection issues, not for worker-registration or queue-serviceability failures
- The recommended next action for worker-registration failure routes through verified worker restart or owner-restart, not reconnect
- Documentation surfaces (docs/temporal-recovery.md) reflect the same STSL-only boundary for adv_temporal_reconnect

---

### Multi-Session-Safe ADV State Writes via Temporal Workflow Signals

**ID:** `rq-multiSessionCoordination01` | **Priority:** **[MUST]**

Multi-session is the supported design center for ADV. State writes from concurrent OpenCode sessions sharing the same project must be serialized by Temporal workflow signals on the per-change workflow, not by client-side locks. Replay-determinism must be preserved across sessions, and no ADV-mutating tool may rely on a client-side soft-lock for cross-session coordination. Sessions are process-fact based and are not durably tracked in workflow state.

**Tags:** `multi-session`, `temporal`, `coordination`, `state-authority`

#### Scenarios

**Concurrent state writes from peer sessions are serialized via workflow signals** (`rq-multiSessionCoordination01.1`)

**Given:**

- Two or more OpenCode sessions sharing the same ADV project are active
- Each session issues an ADV-mutating tool call (for example adv_change_update or adv_task_update) against the same change concurrently

**When:** The plugin processes the concurrent updates

**Then:**

- All updates reach the change workflow as Temporal workflow signals
- Signals are applied in delivery order chosen by Temporal, not by a client-side lock
- No signal is silently dropped; each is applied to workflow state
- The final workflow state reflects every delivered signal

**Workflow replay reproduces multi-session state deterministically** (`rq-multiSessionCoordination01.2`)

**Given:**

- A change workflow has accumulated signals from multiple sessions
- The workflow is replayed from event history

**When:** Replay executes the recorded signal events

**Then:**

- The replayed final state is identical to the original final state
- Signal handlers serialize via the workflow signal queue, ensuring deterministic order
- No mutator depends on Date.now(), floating-point math, or process-local state

**ADV-mutating tools must not use client-side soft locks for cross-session coordination** (`rq-multiSessionCoordination01.3`)

**Given:**

- The set of ADV tools whose execution mode is temporal-required is inspected

**When:** Their implementation is reviewed

**Then:**

- No ADV-mutating tool uses a JSONL sidecar lock, in-process mutex, or other client-side soft lock for cross-session coordination
- Per-process flocks are restricted to narrow git filesystem operations (for example git worktree add/remove)
- All cross-session coordination flows through Temporal workflow signals on the change workflow

---

### Worktree State Authority Lives in Change Workflow State

**ID:** `rq-worktreeRegistry01` | **Priority:** **[MUST]**

Worktree state for ADV-managed worktrees must live inside the change workflow state, with cross-change visibility via the AdvWorktreeBranches and AdvWorktreePaths Temporal search attributes. Sidecar SQLite databases or JSONL files must not be the authoritative source for worktree state. Cross-session reads must observe the same registry contents.

**Tags:** `worktree`, `registry`, `state-authority`, `temporal`

#### Scenarios

**Worktree create persists state into change workflow worktree state** (`rq-worktreeRegistry01.1`)

**Given:**

- A session invokes adv_worktree_create with a branch name

**When:** The create flow completes successfully

**Then:**

- A worktree record is added to change-workflow worktree state via the worktreeCreatedSignal
- The record contains branch, path, baseRef, headSha, and createdAt fields
- No row is written to a sidecar SQLite database or JSONL file as the authoritative state

**Peer session sees the same worktree registry contents** (`rq-worktreeRegistry01.2`)

**Given:**

- Session A has created a worktree and the worktreeCreatedSignal has applied
- Session B in the same project queries worktree state

**When:** Session B reads worktree state via the change workflow (via AdvWorktreeBranches/AdvWorktreePaths search attributes for cross-change aggregation)

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

- All reads succeed using only the per-change workflow state, Temporal visibility search attributes, and git census
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
- No per-change workflow recovery is required — change-workflow state survives directly via Temporal
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
- The Multi-Session Coordination section describes Temporal-serialized state writes and per-worktree git isolation

**Status-marker table lists [ADV:PEER_SESSIONS] as informational** (`rq-multiSessionFraming01.3`)

**Given:**

- The canonical status-marker table in ADV_INSTRUCTIONS.md is inspected

**When:** The table rows are read

**Then:**

- A row for [ADV:PEER_SESSIONS] is present
- The row classifies the marker as informational, not as an attention or blocked marker
- Drift tests fail if the row is removed or reclassified

---

### Temporal Worker Survives Concurrent Client Load and Worker-Kill Respawn-Elect

**ID:** `rq-temporalConcurrentLoad01` | **Priority:** **[MUST]**

The Temporal worker singleton must survive load from at least five concurrent ADV client sessions issuing state-write tool calls without lost updates, deadlocks, or replay-determinism violations. When the worker process is killed mid-load, surviving clients must respawn-elect a new worker via the singleton lock and resume normal operation.

**Tags:** `temporal`, `load-test`, `worker-singleton`, `concurrent-clients`

#### Scenarios

**Five or more concurrent clients complete state writes with no lost updates** (`rq-temporalConcurrentLoad01.1`)

**Given:**

- At least five concurrent ADV client sessions issue ADV-mutating tool calls (state writes, change updates, agenda adds, wisdom adds, worktree registers) against change workflows on the same project task queue

**When:** The concurrent-clients benchmark mode runs for the configured duration

**Then:**

- No deadlocks occur
- All issued writes are reflected in the final workflow state
- Monotonic source_version is preserved across all writes (no lost updates)
- Workflow event-history replay reproduces the same final state

**Worker-kill mid-load triggers successful respawn-elect** (`rq-temporalConcurrentLoad01.2`)

**Given:**

- Five or more concurrent clients are mid-load against change workflows on the same project task queue
- The current worker-lock holder PID is killed via SIGKILL

**When:** The benchmark continues after the kill

**Then:**

- Surviving clients reclaim the stale worker lock per rq-workerSingleton01.3
- A new worker is spawned by one of the surviving clients
- Pre-kill writes remain reflected in workflow state
- Post-respawn writes succeed and are reflected in workflow state

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

When features.worktree_guard_enforce is true, the plugin MUST intercept direct file-write tool calls and known destructive bash write patterns via the tool.execute.before hook and block writes into the trunk checkout when HEAD is the default branch. When features.worktree_guard_enforce is omitted or false, the trunk write firewall MUST allow direct file-write tools and known destructive bash write patterns in the trunk checkout. In strict mode, the firewall MUST allow writes inside ADV worktrees, outside git checkouts, and during explicit git recovery states (merge, rebase, cherry-pick, revert). Git commands MUST NOT be classified or blocked by this firewall; P32 is enforced by where files are edited, not by restricting git operations. Shell indirection and script-internal writes are accepted residual risk documented in ADV instructions.

**Tags:** `git`, `worktree`, `firewall`, `trunk`, `safety`

#### Scenarios

**Flag-off trunk file writes allowed on default branch** (`rq-twf01.1`)

**Given:**

- features.worktree_guard_enforce is omitted or false
- A tool call targets a path inside the trunk checkout
- HEAD is on the default branch
- No git recovery state is active

**When:** A write, edit, morph_edit, or known destructive bash write pattern is intercepted

**Then:**

- The tool execution is allowed by the trunk write firewall
- No trunk write firewall blocking error is thrown

**Strict trunk file write blocked on default branch** (`rq-twf01.1a`)

**Given:**

- features.worktree_guard_enforce is true
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
