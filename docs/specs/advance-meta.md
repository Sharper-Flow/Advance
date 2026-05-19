# Advance Meta

> **Version:** 1.1.0
> **Updated:** 2026-04-28

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

ADV instruction surfaces (ADV_INSTRUCTIONS.md, docs/command-voice-standard.md, .opencode/agents/adv.md, .opencode/command/adv-\*.md) MUST classify each section by enforcement class (fully-enforced, partially-enforced, inherently-prose) and apply the matching compression template defined in `docs/command-voice-standard.md` § Prose-Load Reduction Rules. Sections whose behavior is fully or partially enforced by code MUST NOT contain paragraph explanations duplicating the enforced behavior; they MUST use a pointer line + constraint table format.

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

ADV must expose one canonical runtime agent while preserving provider-specific guidance through runtime system-block hint injection. `sync-global.sh` must not require generated `adv-{provider}.md` runtime agents or concatenated provider prompt files. Provider hints must be selected from structured provider/model context and emitted through the existing single-system-entry system block path.

**Single ADV runtime agent is complete without generated provider variants** (`rq-providerAdvSkinny01.1`)

**Given:**

- `scripts/sync-global.sh --fix` runs with canonical ADV and provider hint assets present

**When:** ADV runtime assets are synced

**Then:**

- Global `adv.md` is the complete runtime ADV agent
- Global `adv.md` contains the canonical ADV body and `ADV_INSTRUCTIONS.md` protocol content
- Global `adv-{provider}.md` files are not generated as required runtime artifacts
- Concatenated provider prompt files are not generated as required runtime artifacts at `agent-parts/advance/adv-{provider}.md`
- `agent.adv-{provider}.prompt` refs are not written by `sync-global.sh`
- Generic `adv` visibility is not disabled because of retired provider variants

**Stale generated provider artifacts are removed or reported** (`rq-providerAdvSkinny01.1a`)

**Given:**

- A stale generated `adv-{provider}.md` file or concatenated provider prompt file exists from the retired provider-variant architecture

**When:** `scripts/sync-global.sh --fix` runs

**Then:**

- Stale generated provider agent files are removed from the global agents directory
- Stale concatenated provider prompt files are removed or reported as retired artifacts with deterministic remediation
- Running `--fix` is idempotent and does not recreate retired provider artifacts

**Runtime provider hints use structured context and one system entry** (`rq-providerAdvSkinny01.2`)

**Given:**

- The ADV plugin system prompt transform runs for a model with structured provider or model identity

**When:** The ADV system block is assembled

**Then:**

- A known provider or model identity emits exactly one matching provider hint
- An unknown or missing provider/model identity emits no provider hint
- Provider hints are appended through `output.system[0]` and no additional system entry is pushed
- No heuristic free-text provider guessing is required for correctness

---

### Provider ADV Prompt Size Metrics

**ID:** `rq-providerAdvMetrics01` | **Priority:** **[MUST]**

Provider ADV evaluation must report prompt-size planes for the single-agent architecture: canonical ADV prompt size, ADV protocol instruction size, provider hint size, selected runtime prompt size, and removed or avoided provider-variant duplication. Metrics must not require generated `adv-{provider}.md` files as canonical inputs.

**Provider eval reports single-agent prompt-size planes** (`rq-providerAdvMetrics01.1`)

**Given:**

- Provider ADV hint assets and the canonical ADV runtime prompt sources exist

**When:** Provider evaluation harness reports prompt size metrics

**Then:**

- Metrics include canonical ADV prompt bytes and lines
- Metrics include ADV protocol instruction bytes and lines
- Metrics include provider hint bytes and lines
- Metrics include `selected_agent_runtime_prompt` bytes and lines for the composed single ADV prompt plus one runtime provider hint
- Metrics include removed or avoided provider-variant duplication when measurable
- Harness does not require generated provider variant files as canonical prompt sources

---

### Drift Test Coverage for Compressed Prose

**ID:** `rq-proseReduction02` | **Priority:** **[MUST]**

`plugin/src/manifest-doc-drift.test.ts` MUST contain structural assertions that verify compressed sections in ADV instruction surfaces conform to the enforcement-class templates. Assertions MUST be structural (line caps per class, presence of code-path reference in pointer line) and MUST NOT assert specific wording.

**Drift test enforces line caps per class** (`rq-proseReduction02.1`)

**Given:**

- `manifest-doc-drift.test.ts` is inspected

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
