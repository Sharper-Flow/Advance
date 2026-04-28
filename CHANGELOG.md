# Changelog

All notable changes to ADV (Advance) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

#### Prose-Load Reduction on ADV Control Surfaces

ADV instruction surfaces (`ADV_INSTRUCTIONS.md`, `docs/command-voice-standard.md`, `.opencode/agents/adv.md`, `.opencode/command/adv-*.md`) now classify each section by enforcement class and apply matching compression templates. Reduces agent prompt-load on control-related prose by moving control mechanisms into code (drift tests, runtime guards, schema validators, tool formatters) and compressing the prose that duplicates them.

**Methodology** — see `docs/command-voice-standard.md` § Prose-Load Reduction Rules (new):

| Class | Compression target |
|---|---|
| **fully-enforced** | Pointer line + constraint table (no paragraph) |
| **partially-enforced** | Pointer + constraint table + 1-line gap rationale |
| **inherently-prose** | Structured table/checklist/template (no paragraphs) |

**Spec deltas** — 4 new MUST requirements in `.adv/specs/advance-meta/spec.json` (capability bumped 1.0.0 → 1.1.0):
- `rq-proseReduction01` — Code-Enforced Prose Deduplication
- `rq-proseReduction02` — Drift Test Coverage for Compressed Prose
- `rq-proseReduction03` — Category Classification Inventory
- `rq-proseReduction04` — Inherently-Prose Constraint Templates

**Drift test extension** — `plugin/src/manifest-doc-drift.test.ts` adds 7 structural assertions (methodology presence, inventory presence, spec-delta presence, structural caps); no content-based assertions.

**Asset-test cleanup** — `plugin/src/adv-autonomy-quality-assets.test.ts` consolidated from 414 → 376 lines: removed heuristic heading-exact-match assertions; preserved value-enforcing canonical-list and anti-pattern × assertions. `adv-improve-assets.test.ts` Research Pack regex broadened to match doc body (no longer requires removed COMPLETE-trailer line).

**COMPLETE trailer removal** — 12 command docs (`adv-arch-scan`, `adv-audit`, `adv-clarify`, `adv-cleanup`, `adv-comp-scan`, `adv-coordinate`, `adv-idea`, `adv-improve`, `adv-problem`, `adv-refactor`, `adv-research`, `adv-slop-scan`) had their `/adv-X COMPLETE` code-block trailers removed.

**Inventory** — `docs/prose-load-inventory.md` (new, archive) records per-section classification, code reference, and gap rationale. Marked POST-COMPRESSION ARCHIVE on completion; durable invariants live in spec deltas, not the inventory.

**Net effect:** 12-task plan delivered — methodology + spec law + drift tests + asset-test cleanup + targeted compressions across 5 surfaces. Many `full`-classified sections (gate sequencing, sub-agent selection, checkpoint commits, context snapshot, cancellation policy) found already in KD2 template form post-prior refactors. Significant scannability improvement; raw line-count savings modest because prose conversion to tabular form sometimes adds structural lines. Stop condition (UD3) applied: only inherently-prose categories remain after compression passes.

#### Gate Handoff Footer — Blockquote Wayfinder Block

The Gate Handoff Voice spine now ends with a blockquote-wrapped wayfinder block instead of a prose-labeled four-line footer. The arrow `{gate} ✓ → {next-gate}` already encoded the where-am-I / where-next signal; the labels (`Current phase:`, `Next phase:`, `Run when ready:`) below it were redundant and read as menu prose. The new format keeps the same information density in three visual rows inside a left-bordered callout — clearly the wayfinder, not menu options.

**New format:**

```
---

> **{change-id}**
> {gate} ✓ → {next-gate}
>
> → `/adv-{next-command} {change-id}`
```

**Archive terminal variant** — wrapped in single-line blockquote for visual consistency:

```
---

> **{change-id}** · release ✓ · Shipped.
```

- **Spec law updated** — `rq-handoffVoice01` body and scenarios `.1`, `.4`, `.5` rewritten to describe the blockquote wayfinder block. Scenarios `.2` (no mechanics leakage) and `.3` (auto-continue unaffected) are unchanged.
- **Spec-text consistency** — `rq-inlineApproval01.7` given-clause wording updated from "labeled footer block" to "blockquote wayfinder block". Semantics preserved; command-as-approval still works exactly the same way.
- **All consumers updated** — `docs/command-voice-standard.md` canonical spine, fast-track variant, archive terminal variant, both BAD/GOOD pairs, Tier A pattern template, Tier B archive template, BAD/GOOD migration table; `.opencode/agents/adv.md` Output Contract and Sign-Off Boundary acceptance report; 10 command files (`adv-proposal`, `adv-discover`, `adv-design`, `adv-prep`, `adv-apply`, `adv-review`, `adv-harden`, `adv-task`, `adv-reflect`, `adv-archive`); spec mirror in `docs/specs/advance.md`.
- **Reply instructions stay outside the blockquote** — for approval-paired handoffs (Tier A/B), reply prose appears below the blockquote. Inline Approval Voice semantics, whitelist words, command-as-approval, and Tier B strictness are all unchanged.
- **Drift test rewritten** — `plugin/src/handoff-footer-drift.test.ts` inverted: asserts blockquote rows present and prose labels absent across all 10 surfaces. The `command-as-approval semantics` describe block is preserved verbatim.

### Removed

#### Legacy Runtime Fallback — Temporal-Only Cutover

ADV is now **Temporal-only** at runtime. The legacy JSON+SQLite backend remains as a non-runtime filesystem utility for tests, cross-repo operations, and migration/repair tools, but it is no longer a runtime fallback.

- **`createStore` requires `temporalBundle`** — `plugin/src/storage/store.ts` now throws if `temporalBundle` is not provided. The previous legacy-first construction and optional Temporal overlay behavior is removed.
- **Removed `ADV_DISABLE_TEMPORAL`** — The `ADV_DISABLE_TEMPORAL=1` environment flag is no longer recognized. Setting it has no effect.
- **Removed `ADV_ALLOW_DEGRADED_FALLBACK`** — The `ADV_ALLOW_DEGRADED_FALLBACK=1` environment flag and the associated file-backed store fallback path are removed. Temporal init failures now surface as `ADV_PLUGIN_INIT_FAILED` with diagnostic payloads instead of silently degrading.
- **`plugin-init.ts` simplified** — Removed `initStoreWithoutTemporal`, fallback catch blocks, and degraded-fallback profile events. Worker startup failure is now a hard error.
- **`store-temporal.ts` fallback removal** — Removed catch-block fallbacks to `legacy.*` for workflow-owned domains (changes, tasks, gates, wisdom). Temporal errors now propagate instead of silently falling back to the filesystem backend.
- **Tests updated** — All test files that previously called `createStore` without a `temporalBundle` now use `createLegacyStore` directly, reflecting the non-runtime nature of the legacy backend in test contexts.

## [0.8.1] - 2026-04-23

### Added

#### Multi-Queue Temporal Worker Groundwork

- Added `plugin/src/temporal/worker-multi.ts` and `plugin/src/temporal/worker-multi.test.ts` as the next-step multi-queue worker host foundation. The host models a single child process serving multiple queues with JSON-line IPC, restart backoff, diagnostics, and shutdown escalation semantics.

### Fixed

#### Temporal Child Process CWD Leaks Blocking Worktree Cleanup

Fixes a release-blocking lifecycle bug where Temporal child processes inherited an ephemeral git worktree cwd, preventing `git worktree remove` after tests or worker startup.

- **Stable test-environment cwd** — `plugin/src/temporal/__tests__/with-test-env.ts` now creates `TestWorkflowEnvironment` instances from `/tmp/advance-temporal-test-cwd` via new `createTestWorkflowEnvironment()`, then restores the caller cwd immediately after env creation.
- **Harness adoption** — `withTestWorkflowEnvironment()` now uses the stable-cwd creator by default, and `plugin/src/temporal/out-of-process-worker.itest.ts` no longer calls `TestWorkflowEnvironment.createTimeSkipping()` directly from the current worktree cwd.
- **Stable out-of-process worker cwd** — `plugin/src/temporal/out-of-process-worker.ts` now spawns Node children with explicit cwd `/tmp/advance-temporal-worker-cwd` instead of inheriting the OpenCode/plugin process cwd.
- **Regression coverage** — new tests verify stable cwd creation/restoration and assert the out-of-process worker spawn options include the stable worker cwd.
- **Operational effect** — leaked `temporal-test-server-sdk-typescript-*` processes from interrupted tests no longer pin deleted worktree plugin directories going forward; existing leaked processes still require manual kill/reap.

### Added

#### Source-Appropriate Due Diligence for Unknown Capability Questions

New `advance` spec requirement codifies how ADV-managed agents must gather evidence when answering unknown platform, architecture, or capability questions.

- **Spec** — `rq-dueDiligence01` added to `.adv/specs/advance/spec.json` (advance spec bumped `1.10.0 → 1.11.0`). Four scenarios:
  1. unknown capability question must gather source-appropriate evidence before answering, recommending, or deciding
  2. `"quick answer"`, `"from your knowledge"`, or `"don't research"` requests change brevity only, not the evidence bar
  3. blocked diligence must stop and surface the blockage instead of presenting an unverified direction
  4. guidance surfaces and drift tests must encode the rule
- **Agents** — `.opencode/agents/adv.md` (Pre-change investigation row + Context-Optimal Execution) and `.opencode/agents/plan.md` (Investigation Mode + Workflow research) rewritten with due-diligence-first, source-appropriate evidence guidance.
- **Overlays** — `.opencode/overlays/adv.overlay.md` and `.opencode/overlays/plan.overlay.md` synced-overlay blocks carry the same rule so provider-specific ADV variants pick it up via `scripts/sync-global.sh --fix`.
- **Drift tests** — `plugin/src/adv-command-routing-assets.test.ts` adds `LEGACY_CARVEOUT_FRAGMENTS` and `HIDDEN_CARVEOUT_PATTERNS` guards that fail if the prior carve-out-first wording or hidden context exemptions return.

### Changed

#### Status Marker Redesign: Color-Coded Squares

Terminal status markers redesigned from 7 metaphor emojis to 3-color square system for instant visual scanning.

**Breaking change:** All `[ADV:*]` chat tokens renamed. No compatibility shim provided.

- **New marker set:**
  - `🟩 [ADV:WORK]` — agent actively working (replaces `🚀 [ADV:ROCKET]`)
  - `🟨 [ADV:TOOLING]` — tool run or sub-agent in flight (replaces `📡 [ADV:MOON]`)
  - `🟥 [ADV:ATTN]` — user needed: approval, question, or agent finished (replaces `🎤 [ADV:MIC]` and `🌍 [ADV:EARTH]`)
  - `🟥💀 [ADV:BLOCKED]` — doom-loop / stuck / crash (replaces `💀 [ADV:DOOM_LOOP]`)
- **Removed:** `[ADV:TDD_RED]` and `[ADV:TDD_GREEN]` — TDD evidence remains in `adv_run_test`/`adv_task_evidence` tool calls
- **IDLE semantics:** Agent finished = `🟥` (user must look). Green is reserved for active work only
- **Bell policy preserved:** ATTN (permission pending) rings immediately; ATTN (armed idle) debounces; BLOCKED→ATTN debounces for recovery
- **Long-tool yellow:** `adv_run_test` and `adv_task_evidence` opt into `🟨 TOOLING` status while running

## [0.8.0] - 2026-04-22

### Added

#### Provider-ADV Agent Assembly System with OMP Integration

Introduces provider-specific ADV variants (`adv-claude`, `adv-gpt`, `adv-glm`, `adv-kimi`) generated from the canonical `adv.md`, with runtime visibility controlled by OpenCode's native `agent.<name>.disable` field.

- **`scripts/sync-global.sh`**: New `generate_provider_variants()` function copies canonical `adv.md`, patches frontmatter `name: adv-{provider}`, and injects a small behavioral hint block from `.opencode/agents/parts/providers/{provider}.md` after the `ADV_SYNC:END adv` marker.
- **Provider hint files**: `.opencode/agents/parts/providers/{claude,gpt,glm,kimi}.md` — each ≤20 lines, behavioral-only, no vendor API terms.
- **Drift check extension**: `check_tool_drift()` now accepts an agent file parameter; `check_provider_variant_drifts()` loops over all four variants. Tool allowlist mismatches are reported per-variant.
- **Legacy `adv.md` gating**: Canonical `adv.md` is only removed from global agents when `opencode.json` contains `agent.adv-*` keys (`provider_adv_configured_in_json`). Prevents breaking existing setups before users opt into provider-ADV mode.
- **Stale agent exclusion**: Generated variants are skipped by the stale-agent removal loop so they are not deleted on the next sync.
- **`project.json`**: Refreshed repo defaults to use a `features` block for local ADV policy (`tdd_enforcement`, `worktree_auto_create`, `gate_enforcement`, `wisdom_accumulation`, `clarify_enforcement`, and tuned `slop_scan` thresholds).
- **Asset tests**: 10 new assertions across `sync-global.test.ts`, `overlay-sync-assets.test.ts`, and `adv-command-routing-assets.test.ts` verify generation, hint injection, frontmatter patching, and legacy gating.

### Changed

#### Gate Handoff Voice: Footer-Based Format

Replaces the trailing `## Next stage` + `## Next` handoff sections with a single footer line so gate transitions scan faster without dropping the narrative sections.

- **Canonical spine updated** — `docs/command-voice-standard.md` now defines a three-section handoff (`Problem` / `Chosen direction` / `Delivered`) followed by a footer line containing `{change-id} · {gate} ✓ → {next-gate} · /adv-{command}`.
- **Archive + fast-track variants added** — archive output now uses the three-part structure (`Problem` / `Chosen direction` / `Delivered`) followed by the footer line `**{change-id}** · release ✓ · Shipped.`, and `/adv-task` uses the fast-track footer `task ✓ → apply`.
- **All handoff-emitting command docs updated** — `adv-proposal`, `adv-discover`, `adv-design`, `adv-prep`, `adv-apply`, `adv-review`, `adv-harden`, `adv-archive`, and `adv-task` now use the footer-based shape.
- **ADV overlay updated** — `.opencode/agents/adv.md` now mirrors the canonical footer-based output contract.
- **Spec law updated** — `rq-handoffVoice01` now describes the footer-based spine and adds `rq-handoffVoice01.4` to require that the footer replaces `Next` sections.
- **Human-readable spec page synced** — `docs/specs/advance.md` now matches `spec.json` for the footer-based handoff requirement.

#### Pre-Change Research Burst Defaults for Unknowns

Unknown architecture/platform/capability questions now default to a scoped research burst before inline answers unless a carve-out applies.

- **`plan.md` Investigation Mode** now says to check carve-outs first, then spawn `explore` + `librarian` in parallel for unknowns.
- **ADV + Plan overlays** now carry the same synced rule so top-level agents and shared overlays stay aligned.
- **Asset coverage expanded** — `adv-command-routing-assets.test.ts` now verifies the carve-outs, burst-default wording, and synced overlay guidance.

#### Tab Title — Smarter Shortname (Dictionary + 8-Char Cap)

Improves the deterministic project shortname generator to restore meaning for concatenated single-token project names.

- **`SHORTNAME_MAX_LEN` bumped `6 → 8`.** Short-but-meaningful words now fit whole: `advance → Advance`, `plugin → Plugin`, `opencode → Opencode`. Still well within typical tmux `status-*-length` defaults and terminal tab-strip widths.
- **New inline dictionary** `SHORTNAME_DICTIONARY` (~160 lowercase tokens covering tech stack, common modifiers, and generic nouns). Derived once into `SHORTNAME_DICT_SET` for O(1) lookup. Bundled inline (~1-2 KB) — no new deps.
- **New `segmentToken(token, dict)` helper** — dynamic-programming word-break segmentation. Returns `string[]` on full-character-cover success, `null` otherwise. The full-cover requirement is the correctness guard: names that can't be cleanly decomposed fall back to the existing truncate path.
- **`generateProjectShortname` updated** to run segmentation when a single lowercase token ≥ 4 chars remains after prefix/suffix strip. On 2+ subwords success, those become the word list and feed the existing acronym/compact branches.
- **New behaviour examples:**
  - `opencodeadvance → OCA` (segments `open`+`code`+`advance`, over cap → acronym)
  - `opencode → Opencode` (segments `open`+`code`, at cap → compact)
  - `advance → Advance` (previously `Advanc`)
  - `pokeedge → Pokeedge` (segments `poke`+`edge`, at cap → compact)
  - `xyzzyabcdef → Xyzzyabc` (opaque, truncate to 8)
- **Unchanged behaviour:** names with explicit boundaries (`my-cool-project → MCP`, `opencode-morph-fast-apply → OMFA`, `morph-plugin → Morph`). Acronym cap scaled from 6 to 8 along with the main limit.
- **Tests**: 9 new `segmentToken` unit tests, 5 new `SHORTNAME_DICTIONARY` invariant tests (lowercase / no-dupes / size), 7 new `generateProjectShortname` table-driven tests for segmentation + cap-bump cases. 3 existing assertions updated for new cap (111 total events tests pass).
- **Complementary to planned AI-cached shortnames.** The v0.8.0 note about AI rescuing ugly truncations still stands; this change improves the deterministic fallback that will remain in place for cold-cache and offline paths.

Implementation: `plugin/src/events/terminal.ts`, `plugin/src/events/events.test.ts`.

#### Consolidate Shared Agents (`consolidateSharedAgentsPlan`)

Reduced ADV's shared overlay-managed agents from six to four by merging `scout` into `plan` and `refine` into `build`. `plan` now handles research, ideation, investigation, and planning with web research tools (webfetch, Firecrawl). `build` is now a scoped executor with task-level ADV write access, subtraction-first heuristic, and related-issue scanning. `scout` and `refine` files are hard-removed; the sync script cleans up stale global copies.

**Migration note:** If you customized your global `plan.md` or `build.md`, you must manually add the new tools (`webfetch`, `firecrawl_*`, and for build the ADV write tools) to your `tools:` frontmatter. The sync script only patches the overlay block, not the frontmatter.

### Changed

#### Plugin Observability & Reliability Hardening (`bundle8ValidatedObservability`)

Bundle of 8 validated quality gaps closed in one coherent hardening pass.

- **Typed structured logger** (`plugin/src/utils/debug-log.ts`) — adds `LogLevel`, `LogMeta`, and `createLogger(scope)` returning `{ debug, info, warn, error }`. `debug` / `info` route to the `ADV_DEBUG=1` file sink only; `warn` / `error` emit to `console.warn` / `console.error` in normal runs and also land in the debug file sink. `appendDebugLog(scope, msg)` retained as a compatibility shim. ~15 `console.warn` / `console.error` call sites migrated across `plugin-init.ts`, `index.ts`, `storage/{json,store,store-sync,sqlite,health}.ts`, `archive/delta.ts`, `tools/change.ts`, `events/terminal.ts`.
- **Bounded `adv_run_test` execution** (`plugin/src/tools/test.ts`) — new `DEFAULT_TEST_TIMEOUT_MS` (30 s) and `DEFAULT_TEST_MAX_BUFFER` (10 MB) constants with classification of `timedOut` / `maxBufferExceeded` / regular non-zero exit. Timeout responses include command + effective duration. Tool schema unchanged.
- **Enriched tool error envelope** (`plugin/src/utils/safe-execute.ts`) — `formatErrorResponse` additively surfaces `errorClass` (via `deriveErrorClass`) and optional `workdir` / `path` / `operation` derived from call args (via `deriveContextFromArgs`). `safeExecute` / `safeExecuteSimple` accept optional context extractors; `tool-registry.ts::bindToolSimple` threads `dir` / `path` so agenda tools auto-enrich. Existing keys preserved.
- **Per-step migration transactions** (`plugin/src/storage/sqlite.ts`) — new `runMigrationStep(db, name, fn)` helper wraps each migration body in `db.transaction(fn)()` for commit-on-success / rollback-on-failure. All 5 migrations (deltas-constraint, changes-constraint, tasks-type, tasks-cancellation-reason, drop-sync-meta) routed through the helper.
- **Bounded corruption-recovery retry** (`plugin/src/storage/corruption-recovery.ts`) — new module; `recoverCorruptedDatabase({ maxAttempts, backoffMs, reset, attempt, log? })` runs up to 2 attempts with 100 ms backoff, logs every attempt, rethrows on exhaustion. `storage/store.ts::createStore` delegates to it; non-corruption errors still fail fast.

### Security

- **Argv-based tmux rename** (`plugin/src/events/terminal.ts`) — replaced `execSync(\`tmux rename-window "${title}"\`, …)` with `execFileSync("tmux", ["rename-window", title], { stdio: "ignore", timeout: 1000 })`. Backticks, `$`, backslashes, newlines, and quotes in change titles are now passed as data, not shell syntax. Dropped the inline escape regex.

### Tests

- **Direct `storage/health.ts` coverage** — new `plugin/src/storage/health.test.ts` exercises `initDatabase` (healthy + integrity-check corrupt + malformed-disk throw), `checkpointWAL` (success + swallow-and-log), `getWALSize` (missing / present), `shouldCheckpoint` (below / at / above threshold), and `closeDatabase` (clean + force-close branch).
- **Deterministic lock-contention assertions** (`plugin/src/storage/store.test.ts`) — replaced fixed `setTimeout(r, 100)` polling at both spec- and change-lock tests with a microtask-drain + `Promise.race(savePromise, Promise.resolve("pending"))` probe.
- **Logger / bounded exec / enrichment / migration / retry / tmux tests** — focused test surfaces added alongside each implementation. Targeted run across 7 touched surfaces: 239/239 green.

### Added

#### Investment Check-In Governance (v1 — behavioral-only)

Judgment-surfacing governance layer that proactively surfaces upcoming
decisions requiring user intuition, preference, or context — **not** a
budget gate. When `/adv-prep` identifies judgment calls from the synthesized
task graph, `/adv-apply` Phase 1.5 surfaces them in a single batched
`question` tool call before the first task executes.

- **`adv_investment_report` tool** (`plugin/src/tools/investment.ts`) — read-only, stateless report returning task counts, elapsed time, retry metrics, doom-loop state, per-gate durations, and threshold tier (`auto` / `escalate` / `hardstop`). Called by `/adv-prep`, `/adv-apply`, `/adv-discover`, `/adv-review`, `/adv-archive`.
- **Schema extension** — `ChangeSchema` gains two optional fields: `judgment_calls[]` (populated by `/adv-prep` Phase J) and `batch_surfaced_at` (audit stamp recorded by `/adv-apply` Phase 1.5). New types: `JudgmentCallSchema`, `JudgmentCallCategorySchema`, `InvestmentReportSchema`, `ThresholdTierSchema`. Zero changes to `TaskSchema`.
- **Methodology skill** — `skills/adv-cost-governance-methodology/SKILL.md` is the single source of truth for identification and surfacing protocols, 3 in-scope categories (`non_functional_tradeoff`, `extensibility`, `scope_boundary`), out-of-scope list (`defaults`, `naming`, `error_semantics`), composition rules, hard-stop advisory semantics, and `rq-autonomy01` escape-clause citation.
- **Policy layer** — `.opencode/instructions/cost-governance.md` ships YAML-frontmatter thresholds (conservative defaults: auto ≤3/0/15min, escalate ≥8/2/60min, hardstop ≥15/5/180min) + scope + category enum. Tunable without code changes. Synced via `scripts/sync-global.sh --fix` (new instruction block added alongside `ADV_INSTRUCTIONS.md`).
- **Rule** — `P28: cost-governance` at priority 9 (parity with `P05`, `P24`, `P27`). User-managed in `~/.config/opencode/instructions/rules.yaml`; installation documented in `SETUP.md`.
- **Command integration** — `/adv-prep` Phase J (identify judgment calls), `/adv-apply` Phase 1.5 (batch surfacing preamble), `/adv-discover`, `/adv-review`, `/adv-archive` display a one-line investment summary.
- **ADV_INSTRUCTIONS.md** — new Investment Check-In subsection under "Autonomy & Quality Ownership" with explicit `rq-autonomy01` escape-clause citation: judgment calls are "unresolved user-value tradeoffs" under the existing contract, NOT a new enumerated human checkpoint. The 8 enumerated checkpoints remain the only enumerated pause points.
- **Hard-stop semantics** — advisory in v1. Does NOT trigger `adv_change_reenter` (re-entry remains scope-expansion-driven per `rq-scopeReentry01`). Does NOT block at the tool level. v2 upgrade path preserved for hard enforcement and real token/cost telemetry.
- **Retroactive policy** — new changes only. Existing drafts detected via `judgment_calls === undefined` skip surfacing silently. Running `/adv-prep` on a legacy draft opts it in.

Tool count: 40 → 42 (`adv_investment_report` + `adv_change_reenter` — the latter was a latent registration bug surfaced by this change and landed on trunk independently; see `fix(tool-registry): register adv_change_reenter`).

### Fixed

#### `adv_change_reenter` Registry Gap

- `adv_change_reenter` was defined in `plugin/src/tools/change.ts` but never registered in `createToolMap` or `ADV_TOOL_NAMES` — silently hiding the scope-expansion re-entry mechanism (`rq-scopeReentry01`) from the MCP toolset. Fixed on trunk as a standalone commit, then the `addCostTimeInvestment` change also registers `adv_investment_report` in the same file.

### Changed

#### Tab Title — Project Shortname Reintroduced (Deterministic)

- **Project shortname now appears in the terminal tab title.** Format is `<emoji> <shortname> · <change>` when a change is active, or `<emoji> <shortname>` when idle. Reverses the v0.6.x decision to drop the project name entirely — the project is now always visible as context.
- **`generateProjectShortname(name)`** added to `plugin/src/events/terminal.ts` — pure deterministic function with a 6-char hard cap:
  - Strips common prefixes: `oc-`, `lib-`, `node-`
  - Strips common suffixes: `-plugin`, `-plugins`, `-app`, `-cli`, `-server`, `-client`, `-mcp`, `.js`, `.ts`
  - Multi-word names with combined length > 6 → acronym (e.g. `my-cool-project` → `MCP`, `opencode-morph-fast-apply` → `OMFA`)
  - Single words ≤ 6 chars → title-cased as-is (e.g. `plugin` → `Plugin`)
  - Single words > 6 chars → truncate + title-case (e.g. `advance` → `Advanc`, `pokeedge` → `Pokeed`)
  - Case-insensitive prefix/suffix matching, only first match stripped
- **`buildTabTitle(emoji, projectName, changeId)`** updated to thread `projectName` through `generateProjectShortname` and use the `·` separator. Previously ignored the project name argument.
- **Public exports** added from the events module: `generateProjectShortname`, `buildTabTitle`, `normalizeChangeCode`.
- **Tests**: 26 new assertions covering shortname rules + 7 updated `buildTabTitle` assertions in `plugin/src/events/events.test.ts`.
- **Note**: AI-generated shortnames with per-project caching are planned as a follow-up. The deterministic rules above are intentionally simple and may produce ugly truncations (`Advanc`) — the AI fallback will rescue these.

## [0.7.0] - 2026-04-13

### Changed

#### Standardized Agent Sync Taxonomy

- **`adv-researcher` promoted from repo-local to bundled global specialist**: Reclassified from repo-scoped to ADV-managed bundled global agent synced via `sync-global.sh` direct copy. `tron` remains the only repo-local specialist.
- **Spec law reframed to capability-based validator contract**: `rq-designval01/02/03` in `advance` spec now express the design-validation guarantee as an independent, read-only, externally informed validator capability rather than hard-coding the `adv-researcher` name. The agent is mentioned as the current implementation, not permanent identity.
- **`sync-global.sh`**: Removed `adv-researcher.md` from `REPO_LOCAL_ONLY` list (now `"tron.md"` only). Stale-removal logic no longer cleans `adv-researcher` from global.
- **ADV_INSTRUCTIONS.md**: Agent tiers table split into "ADV Specialist (bundled global)" for `adv-researcher` and "Repo-Local Specialist" for `tron`.
- **Command contracts** (`adv-design.md`, `adv-review.md`, `adv-task.md`): References to `adv-researcher` now frame it as "the independent validator agent" or "(independent validator)" rather than bare name.
- **Project docs** (`README.md`, `SETUP.md`, `AGENTS.md`): Updated agent taxonomy descriptions to reflect `adv-researcher` as ADV-managed bundled global.
- **`skills/adv-tron/SKILL.md`**: Agent comparison table now describes `adv-researcher` as "Independent design validator".
- **`.opencode/agents/adv.md`**: Orchestrator gate table and sub-agent selection table updated with bundled global classification.
- **`docs/adv-autonomy-compliance-matrix.md`**: Updated validator reference to capability-based framing.
- **Asset tests**: 3 new assertions lock the taxonomy — `sync-global.test.ts` verifies `REPO_LOCAL_ONLY` excludes `adv-researcher`; `adv-autonomy-quality-assets.test.ts` verifies capability-based framing in `adv-design.md`; `adv-command-routing-assets.test.ts` verifies tier table classification in `ADV_INSTRUCTIONS.md`.

### Added

#### Maintenance: Agenda Test Coverage, Spec Doc Refresh, project.md, Cache Recovery

- **`plugin/src/tools/agenda.test.ts`**: 29 integration tests covering all 10 agenda MCP tools (`adv_agenda_list`, `adv_agenda_add`, `adv_agenda_start`, `adv_agenda_complete`, `adv_agenda_cancel`, `adv_agenda_prioritize`, `adv_agenda_next`, `adv_agenda_stats`, `adv_agenda_evidence`, `adv_agenda_compact`) plus lifecycle and blocked-item tests. Uses temp-dir isolation pattern consistent with existing tool tests.
- **`project.md`**: New project context file read by `adv_project_context`. Documents tech stack, key directories, dev commands, architecture conventions (specs-are-laws, external state, no-direct-reads, tool registration, schema gen, overlay sync), testing conventions, and maintenance scripts.
- **`docs/specs/advance.md`**: Regenerated from spec v1.8.0 — includes all 18 requirements (`rq-designval01/02/03`, `rq-scopeReentry01/02`).
- **`docs/adv-autonomy-compliance-matrix.md`**: Explicit spec ID references added — `/adv-design` cites `rq-designval01/03`, `/adv-present` cites `rq-designval02`, re-entry checkpoint cites `rq-scopeReentry01/02`.
- **`scripts/recover-db.js`**: Added `--external` flag that auto-detects the external state dir from the project's root commit SHA, enabling one-command recovery for the default (external) storage layout. Fixed `--db-dir` to accept absolute paths correctly.
- **`SETUP.md` troubleshooting**: Added "Stale Spec Rows After Deletion" section documenting the sync-only-adds behavior, 2-step fix (delete DB + restart), and why a server restart is required to clear in-memory SQLite state.

### Improved

#### Automated Design Validation

- **Mandatory validator pass in `/adv-design`**: Added Phase 3.5 (Validate Design) and Phase 3.6 (Handle Verdict) to the design command. Before the design gate can complete, `adv-researcher` (Gemini Flash) is spawned as an independent validator that assesses the design across 4 dimensions: correctness, simplicity, spec-law compliance, and key alternatives.
- **Verdict-driven control flow**: VALIDATED/CAUTION → proceed with notes; CONFLICT → surface to user before planning; INCONCLUSIVE (failure/timeout) → warn and proceed without blocking.
- **Validator result in `/adv-present`**: Design presentation now includes the validator verdict — "Validator: clean pass ✓" for VALIDATED, inline findings for CAUTION, conflict details with pause for CONFLICT, warning for INCONCLUSIVE.
- **3 new spec requirements**: `rq-designval01` (mandatory validation before design gate), `rq-designval02` (findings in presentation), `rq-designval03` (CONFLICT blocks silent auto-continue). Spec bumped to v1.8.0.
- **Asset tests**: New "Design validation policy" describe block in `adv-autonomy-quality-assets.test.ts` enforces the validation contract across command files and instructions.
- **Removes passive guidance**: Replaces the old "inform the user to have an additional frontier model validate" instruction with enforced automated orchestration.

## [0.6.0] - 2026-04-10

### Changed

#### ADV Orchestrator — Replace Orca with Dedicated ADV Agent

- **Replaced `orca.md` with `adv.md`** as the primary orchestrator for spec-driven development workflows. ADV is a pure ADV orchestrator with no generic workflow section.
- **Collaborative workflow**: ADV respects user judgment at decision points — clarifies via the question tool, stops at boundaries requiring user confirmation, and treats collaborative gates as the actual workflow rather than obstacles to automate past.
- **Context-optimal execution**: ADV works inline when maintaining understanding of the problem and progress matters, and delegates to specialists when work is genuinely independent.
- **7-gate model**: ADV uses the correct gate names (proposal, discovery, design, planning, execution, acceptance, release) instead of the legacy 6-gate names.
- **Temperature 0.2**: Lowered from Orca's 0.3 for more precise orchestration and inline work.
- **Full Orca removal**: All Orca references removed from the Advance repo (docs, tests, scripts, overlays, instructions). The user's global `orca.md` is unaffected — Advance simply stops managing it.
- **Updated overlay and sync infrastructure**: `adv.overlay.md` replaces `orca.overlay.md`; `sync-global.sh` syncs `adv.md` instead of applying an Orca overlay.

### Added

#### Context Leak Surface Fixes — Close 13 Identified Context Gaps

Implemented all 13 identified context leak surfaces where ADV drops important context between workflow steps. All schema additions are backwards-compatible (`.optional()` + `.passthrough()`).

- **New MCP tool `adv_project_wisdom_list`** — exposes project-level wisdom entries (previously write-only). Mirrors `adv_wisdom_list` response shape (`{ entries, count, byType }`).
- **Compaction amnesia workaround** — `system.transform` hook now injects minimal active change context (~20 tokens: change ID + truncated objective) to survive session compaction. No bulk data, prompt-caching safe.
- **Sub-agent context injection** — Added `CHANGE CONTEXT` block to sub-agent spawn prompts in `/adv-review`, `/adv-harden`, and `/adv-slop-scan`. Explore agents (which have no ADV tools) now receive change ID, objective, criteria count, and current gate.
- **Wisdom in freshness protocol** — `adv_wisdom_list` added to the mandatory per-task context loading sequence in `ADV_INSTRUCTIONS.md` and `/adv-apply`.
- **Enriched handoff state** — `HandoffState` now carries `proposalSummary`, `currentGate`, `successCriteriaCount`, and `wisdomEntries` for richer cross-session context.
- **Task implementation summaries** — New `implementation_summary` field on `TaskSchema`, persisted via `adv_task_update`.
- **Worktree spec divergence warning** — Validator emits `WORKTREE_SPEC_DIVERGENCE` warning when running inside a git worktree.
- **Cancel-aware task readiness** — `adv_task_ready` now returns `cancelledBlockerContext` with cancellation reasons when blocked-by tasks were cancelled. SQL join extension in SQLite layer.
- **Doom-loop attempt history** — New `AttemptSchema` and `attempts[]` on `ErrorRecoverySchema` for structured retry tracking. Wired through `adv_task_update` with `error_recovery` parameter.
- **Archive wisdom preservation** — `createArchive()` now copies wisdom entries to archive directory as `wisdom.json`. `ARCHIVE_SUMMARY.md` includes implementation summaries per task and wisdom section.
- **Gate notes** — `adv_gate_complete` accepts optional `notes` parameter for persisting key decisions at gate completion.
- **Clarify finding persistence** — `adv_change_show` now persists clarify findings as append-only snapshots with resolution tracking via `ClarifyFindingSnapshotSchema`.
- **Proposal-task drift detection** — Validator emits `PROPOSAL_TASK_DRIFT` warning when proposal section headers have no matching tasks. Keyword extraction, no embeddings.
- **Validator wiring** — `adv_change_validate` now passes `proposalText` and `isWorktree` to `validateChange()` so drift and worktree warnings surface through the tool path.

### Fixed

- **Restored `gate-migration.ts`** — file was accidentally deleted in a prior archival commit while `store.ts` still imported it. Restored from git history and added `migrate` method to `store-gates.ts`.

### Improved

#### Agreement Clarification Loop — Mandatory Open Question Resolution in /adv-discover

- **Added Phase 4.5 (Open Question Resolution Loop)** to `/adv-discover` — all open questions from discovery must now be explicitly resolved before the agreement is finalized. No question is silently deferred or assumed "no preference."
- **Added question triage** — open questions are classified before reaching the user: technical/implementation questions are resolved autonomously via LBP research; only user-facing questions (priorities, behavior, downsides, AC boundaries) are presented to the user.
- **Reframing rule** — technical questions with genuine LBP ambiguity must be reframed as the downstream outcome question (e.g., not "REST vs GraphQL?" but "Do you need clients to fetch partial data?").
- **Updated agreement.md template** — replaced the generic "Open Questions" section with three explicit categories: User Decisions, Agent Decisions (LBP), and Deferred Questions.
- **Updated autonomy compliance matrix** — `/adv-discover` row now reflects question triage and clarification loop responsibilities.
- **Updated gate docs** — discovery gate description documents the mandatory clarification loop.
- **Added `agree` command boundary row** to `ADV_INSTRUCTIONS.md` — previously missing from the boundary table.

### Changed

#### Forward-Only Cleanup and Distribution Readiness

- Removed the retired `adv-research` command/spec/test surface from the repo and manifest.
- Deleted the dead 6→7 gate migration runtime and its dedicated tests.
- Removed stale investigation/exploration artifacts and consolidated setup guidance on `SETUP.md` by deleting `INSTALL.md`.
- Trimmed legacy/retired wording from operational docs and prompt files to reduce context noise.

#### Command Guidance Streamlining

- Simplified ADV command prompt files to reduce duplicated workflow prose while preserving the required execution contract.
- Strengthened core contracts for `plan`, `refine`, and `scout` agents to make roles and expectations more explicit.
- Added bundled methodology assets for `adv-apply` and `adv-prep`, plus a dedicated proposal checklist.

### Fixed

#### Upgrade Safety After Legacy Cleanup

- Added a one-time load migration in `plugin/src/storage/json.ts` that rewrites persisted gate entries with `status: "legacy"` to `status: "done"` before schema validation.
- Strip obsolete `migrated_from` and `absorbed_completions` gate fields during change loading so existing user state upgrades cleanly.
- Removed gate-level `legacy` status support from the active runtime/schema surface while preserving safe loading of older persisted data.

### Fixed

#### Harden ADV Compliance — TDD Evidence Validation and Execution Gate Guard

- **Added exit-code semantics validation for TDD evidence** — `adv_task_evidence` and `adv_run_test` now reject evidence where the exit code contradicts the declared phase (e.g., red phase with exitCode=0, green phase with exitCode≠0). `exitCode: undefined` remains allowed for backward compatibility.
- **Added execution-gate task-completion guard** — `adv_gate_complete` for the `execution` gate now verifies all non-cancelled tasks are `done` before completing. Previously the execution gate had zero checks and could complete with pending/in-progress tasks.
- New `plugin/src/validator/evidence.ts` — pure validation function `validateEvidenceSemantics()` shared by both evidence-recording tools.
- 18 new tests across 3 test files: 7 evidence validation unit tests, 7 tool integration tests (rejection + acceptance paths), 4 execution gate guard tests.

#### Skill Duplication — Trim Restated Checklist Content Across All Methodology Skills

- **Trimmed `skills/adv-discover-methodology/SKILL.md`** from 113→43 lines by removing per-step detail sections that duplicated `docs/checklists/discover-checklist.md`.
- **Trimmed `skills/adv-harden-methodology/SKILL.md`** from 85→37 lines by removing severity scoring, tech debt quadrant, status determination, minimum findings, and documentation hygiene sections that duplicated `docs/checklists/harden-checklist.md`.
- **Trimmed `skills/adv-review-methodology/SKILL.md`** from 71→55 lines by removing minimum findings threshold and verdict criteria sections that duplicated `docs/checklists/review-checklist.md`.
- All three skills now follow the canonical-source pattern: framework overview table + constraints only, with explicit deferral to their checklist for detailed rules.

### Improved

#### Discovery Phase Rigor — Enforce 9 Mandatory Protocol Steps in /adv-discover

- **Migrated orphaned Phase 1.5 (Skill Discovery)** from retired `/adv-research` reference into actual implementation in `/adv-discover`. The protocol was documented in `ADV_INSTRUCTIONS.md` but never implemented in the command file after the 7-gate workflow refactor.
- **Enhanced `/adv-discover`** (89→165 lines) with Phase 0 (methodology skill loading), Phase 1.5 (skill discovery), Phase 1.6 (conflict & related-work scan), Phase 1.7 (P25 related-pattern scan), and 11 required output sections including edge case investigation, design question depth, and draft spec delta shapes.
- **Created `skills/adv-discover-methodology/SKILL.md`** — reusable discovery protocol skill following the command+skill pattern from `rationalizeCommandVsSkill`.
- **Created `docs/checklists/discover-checklist.md`** — canonical checklist with 8 protocol steps, 13 edge case handling rules, and output section schema.
- **Created `.adv/specs/adv-discover/spec.json`** — new capability spec with 9 requirements (rq-disc01..09) encoding discovery rigor as enforceable law.
- **Updated `ADV_INSTRUCTIONS.md`** — moved `adv-discover` from command-only to command+skill list, corrected Phase 1.5 "Enabled" → "Implemented" with cross-references.

### Fixed

#### Gate Completion Instruction Audit — Ensure All Gate-Owning Commands Actually Complete Their Gates

- **`adv-proposal`**: Removed contradictory `× MUST NOT: complete gates` that prevented agents from calling `adv_gate_complete` for the command's own `proposal` gate. Changed to `complete non-owned gates`. Added explicit Step 9 with `adv_gate_complete changeId: ... gateId: proposal` call.
- **`adv-design`**: Added `complete non-owned gates` to MUST NOT for consistency with the pattern established by `adv-discover` and `adv-prep`.
- **`adv-accept`**: Added `complete non-owned gates` to MUST NOT for consistency.
- **`adv-task`**: Added missing `adv_gate_complete` calls for `proposal` and `design` gates. The command claimed to complete all 4 pre-implementation gates but only had explicit calls for `discovery` and `planning`.
- **`adv-review`**: Clarified ambiguous line 224 that could be misread as an instruction to call `adv_gate_complete`. Now explicitly states "× Do NOT call `adv_gate_complete` here" and marks the `completedBy` text as a hint for the acceptance flow owned by `/adv-review`.
- **`ADV_INSTRUCTIONS.md`**: Updated command boundary summary table to match the corrected MUST NOT patterns in each command file.

### Added

#### Command + Skill Architecture for Review, Harden, and Slop Scan

- Added a documented "Command vs Skill Boundaries" policy to `ADV_INSTRUCTIONS.md`
- Added bundled skills:
  - `skills/adv-review-methodology/SKILL.md`
  - `skills/adv-harden-methodology/SKILL.md`
  - `skills/adv-slop-detection/SKILL.md`
- Updated `/adv-review`, `/adv-harden`, and `/adv-slop-scan` to load backing skills with inline fallback
- Added asset tests covering bundled skills, command skill-loading, fallback text, and sync-global compatibility
- Updated `README.md` to describe the command + skill architecture and kept `SETUP.md` aligned with the new bundled skills

### Fixed

#### SQLite Cache Self-Healing for Status / Doctor Checks

- Reconciled the derived SQLite change/task cache against JSON source of truth during full change sync
- Auto-prunes stale SQLite change rows whose JSON source files no longer exist
- Auto-cleans dangling task and dependency references left behind by prior cache inconsistencies
- Added status regressions to ensure recoverable cache drift no longer persists as doctor warnings
- Documented that manual SQLite cache deletion is now a fallback, not the first-line recovery path

## [0.5.1] - 2026-03-18

### Added

#### `adv_change_update` Tool — Prevent Duplicate Change Creation

- Added `adv_change_update` tool to update `proposal.md` and/or `problem-statement.md` for existing changes without creating duplicates
- Added `updateChangeArtifacts()` to storage layer with atomic writes
- Added `store.changes.updateArtifacts()` to Store interface
- Updated `/adv-proposal` (Step 7) and `/adv-research` (Phase 5) to use `adv_change_update` instead of re-calling `adv_change_create`
- 19 new tests across 3 architectural layers (storage, store, tool)

#### `/adv-harden` — Deployment & Operational Readiness Scanner

- Added Sub-Agent 6: Deployment & Operational Readiness Scanner to the hardening pass
- Covers 7 deployment dimensions: environment variables & secrets, database migrations, external service dependencies, CI/CD pipeline, infrastructure & runtime, feature flags & rollout, documentation & runbooks
- Outputs structured deployment steps (pre-deploy, post-deploy, rollback plan)
- Severity: destructive migrations without rollback and hardcoded secrets are BLOCKERs; missing env vars and unprovisioned services are HIGH
- Updated harden checklist from 5-scanner to 6-scanner coverage
- Updated final report template with Deployment Readiness dimension

#### Agent Tiering & Token Optimization

- Introduced three-tier agent classification: Core (always loaded), Common (always loaded), Specialist (repo-scoped)
- Core agents: `plan`, `build`, `refine`, `scout`, `orca` — available in all sessions
- Common agents: `explore`, `librarian`, `general`, `mechanic` — available in all sessions
- Specialist agents: `adv-researcher`, `tron` — repo-local, loaded only in ADV-enabled repos
- Removed 11 phantom agent registrations from `opencode.json` that were never spawned (consumed ~4-5k tokens with zero functional purpose)
- Measured agent payload with `tiktoken` (o200k_base): 11,862 tokens in ADV repos, 9,572 in non-ADV repos (down from 14,600)
- Added Agent Tiers table to `ADV_INSTRUCTIONS.md` documenting loading strategy

#### Prioritizer Skill Conversion

- Converted `prioritizer` from a global agent to an on-demand skill at `~/.config/opencode/skills/prioritizer/SKILL.md`
- Skill provides criteria question templates, decision map format, and research protocol — loaded only when needed via `skill("prioritizer")`
- Updated `orca.md`, `criteria-prioritizer.md`, `ADV_INSTRUCTIONS.md`, `README.md`, and `SETUP.md` to reference the skill instead of the sub-agent

#### `sync-global.sh` — JSONC Config Support

- Config file resolution now matches OpenCode's own priority: `opencode.jsonc` > `opencode.json` > `config.json`
- Added `jsonc_to_json` helper that strips `//` and `/* */` comments before passing to `jq`
- Preserves URLs inside strings (e.g., `https://...`) during comment stripping
- Warns when `--fix` will strip comments from a JSONC file (creates backup first)
- New configs created by `--fix` use `.json` format for simplicity

### Fixed

#### `sync-global.sh` — Repo-Local Agent Leak

- Fixed sync script unconditionally copying repo-local agents (`adv-researcher.md`, `tron.md`) to global config, undoing agent tiering
- Added `REPO_LOCAL_ONLY` skip list to prevent repo-scoped agents from leaking into global
- Stale-removal logic now actively cleans leaked repo-local agents from global

#### `/adv-research` — Restored Sub-Agent Templates

- Restored over-compressed operational instructions lost in the 60% token reduction
- Restored librarian prompt template, adv-researcher prompt template, sub-agent failure detection criteria, inline fallback procedure, and explore agent fallback template

#### Miscellaneous Fixes

- Removed phantom tool names and fixed inconsistent MCP tool references across commands
- Restored conversation context for `/adv-proposal` and `/adv-task`
- Updated adv-researcher lgrep tool names
- Fixed CI build failure masking
- Synced pnpm lockfile overrides and pinned flatted to patched version
- Replaced silent `catch {}` blocks with `debugLog` calls in `plugin/src/index.ts`

## [0.5.0] - 2026-03-14

### Fixed

#### `/adv-apply` — Restore Autonomous Task Loop

- Phase 3 task flow now has an explicit `REPEAT/GOTO` loop construct with pseudocode, replacing the weak "continue with next ready task" language that was lost when `/adv-ralph` was consolidated
- Added whitelist of valid loop exit conditions (no ready tasks, doom loop, environmental blocker, user cancel)
- Added blacklist of invalid stop reasons ("completed one task", "made good progress", "context is getting long")
- Step 3e renamed to "LOOP CONTINUATION — MANDATORY" with explicit branching: tasks remain → go back to 3a; no tasks → Phase 4/5; all blocked → report
- Warning added that 3e is the most common point where agents incorrectly pause

### Added

#### `/adv-research` — Skill Discovery Phase

- Added Phase 1.5 (Skill Discovery) between Phase 1 (Analyze Target) and Phase 2 (Generate Research Questions)
- Scans global and project-local skill directories for SKILL.md files with `keywords` in YAML frontmatter
- Matches skill keywords against project tech stack and change domain terms
- Loads matching skills via `skill()` calls to provide domain-specific research guidance
- Graceful degradation: skills without frontmatter or keywords are silently skipped
- Added Skill Discovery Protocol section to `ADV_INSTRUCTIONS.md` for cross-command adoption
- Added reference `keywords` frontmatter to `skills/adv-tron/SKILL.md`

#### `/adv-apply` — Worktree Reuse and Overlap Detection

- Phase 0 Step 3 now detects existing worktrees for the target change via `git worktree list --porcelain`
- Healthy worktrees are offered for reuse; stale records (path deleted) are pruned automatically
- New Phase 0.5 checks for file overlaps with other active changes (advisory only, does not block)
- Overlap warning surfaces potential merge conflicts early with a `/adv-coordinate` suggestion

#### Worktree Documentation

- `ADV_INSTRUCTIONS.md`: added Worktree Reuse Protocol and Spec Divergence Rule sections
- `README.md`: added Worktree Integration section covering risk assessment, reuse detection, shared state, branch-local specs, and spec divergence
- `/adv-status`: worktree detection now shows worktree path for active changes that have one

### Fixed

#### `/adv-proposal` — Transcript Grounding

- `/adv-proposal` now extracts prior discussion context (agreed facts, decisions, rejected approaches, open questions, constraints) from the conversation **before** synthesizing a problem statement
- Problem Statement block now includes `PRIOR DECISIONS`, `REJECTED APPROACHES`, and `OPEN QUESTIONS` sections so the user can verify the agent faithfully carried forward what was discussed
- Confirmation step explicitly asks the user to check for drift, with a dedicated "Drift detected" option
- Phase 2 proposal template now includes a `## Constraints from Discussion` section that persists prior decisions and rejected approaches as binding constraints for downstream commands
- Anti-fabrication rule: the agent is explicitly instructed not to invent decisions or constraints that were not discussed
- Updated spec `rq-advprop02` from 3 to 5 scenarios covering extraction, grounding, drift detection, persistence, and abort

#### `scripts/sync-global.sh` — Config Validation and Patching

- `sync-global.sh` now validates `~/.config/opencode/opencode.json` for required ADV entries (plugin path, instruction path)
- Added `--check` flag: report config issues without changing any files
- Added `--fix` flag: sync assets + auto-patch `opencode.json` to add missing ADV entries
- Default mode (no flags): sync assets + report config issues
- Config patching uses `jq` for safe JSON manipulation, backs up before patching, and is idempotent
- Handles tilde-expanded paths (`~/...`) and absolute paths when checking for existing entries
- Creates minimal `opencode.json` with ADV entries when the file does not exist
- Added 25 regression tests in `plugin/src/sync-global.test.ts`

### Added

#### `/adv-tron` — Codebase Reconnaissance

- Added `/adv-tron [target]` as a read-only reconnaissance command for broad repo scans and target-scoped investigation
- Added hidden `tron` sub-agent definition at `.opencode/agents/tron.md` for local codebase mapping, hotspot detection, and risk surfacing
- Added bundled skill `skills/adv-tron/SKILL.md` and extended `scripts/sync-global.sh` to sync ADV agents and skills into `~/.config/opencode/`
- Added focused regression coverage in `plugin/src/adv-tron-assets.test.ts` for command, agent, skill, and sync wiring

#### `/adv-harden` — Merge Compatibility Check

- Added non-destructive merge compatibility check to `/adv-harden` pre-flight
- Runs `git merge --no-commit --no-ff` against the default branch before quality scanners
- Blocks harden with conflict file list if merge would fail, so conflicts are caught early (not at archive time)
- Skips automatically when not in a worktree (already on default branch)

#### Worktree Context Propagation

- Added `{workdir}` propagation to sub-agent prompts in `/adv-audit`, `/adv-review`, `/adv-refactor`, and `/adv-slop-scan`
- Sub-agents now receive explicit `WORKING DIRECTORY` instructions so they read files from the correct worktree branch instead of the main repo root

### Changed

#### Tradeoff Questioning — Prioritizer Protocol

- ADV instructions now route multi-approach, tradeoff-driven decisions through the `prioritizer` sub-agent before asking the user questions
- The prioritizer drafts context-specific criteria questions plus a decision map so ADV agents can ask better tradeoff questions with less main-context overhead

#### `/adv-ralph` Consolidated into `/adv-apply`

- `/adv-ralph` has been removed. Its autonomous-retry behavior is now the default in `/adv-apply`.
- `/adv-apply` now includes: autonomous retry protocol (3 attempts with diagnosis), global final
  loop verification, error classification (SEMANTIC/TRANSIENT/ENVIRONMENTAL), completion modes
  (FULLY AUTONOMOUS / GUIDED / PARTIAL TAKEOVER), and the stricter no-skip/no-defer policy.
- Worktree threshold changed from 5+ files to **3+ files** (was the ralph default).
- **Migration**: Replace any references to `/adv-ralph` with `/adv-apply`. Behavior is identical.
- `adv-ralph` entry removed from `plugin/src/manifest.ts`; command count is now 19.

### Changed

#### Terminal Tab Title — Normalized Change Code

- Tab title now shows `<emoji> <normalized change code>` when a change is active (e.g. `🚀 Feature X`)
- Project name **dropped entirely** from the tab title — not needed as context
- When no active change, tab shows bare emoji only (e.g. `🌍`)
- Progress counter `[n/m]` removed — was broken and cluttered the title
- Change IDs are normalized to human-readable Title Case words:
  - `addFeatureX` → `Feature X`
  - `fixAuthTimeout` → `Auth Timeout`
  - `improve-terminal-tab-title` → `Terminal Tab Title`
  - Handles camelCase, kebab-case, and snake_case
  - Strips common verb prefixes: `add`, `fix`, `update`, `improve`, `create`, `remove`, `refactor`, `change`
- `normalizeChangeCode` and `buildTabTitle` exported from events module as public API
- **MOON emoji changed**: 🌙 → 📡 (satellite) — clearly conveys "sub-agents running" rather than "idle"
- README and ADV_INSTRUCTIONS updated with tab emoji column and title format documentation

### Fixed

#### Emoji Status Consistency

- Status emoji now driven by a single `resolveStatus()` function with explicit precedence:
  `MIC > MOON > TDD_RED > TDD_GREEN > ROCKET > EARTH`
- `🔴`/`🟢` (TDD_RED/TDD_GREEN) now actually appear — previously wired only in tests, never set at runtime
- `📡` (MOON) no longer stomped by `session.status busy/idle` events firing while a sub-agent runs
- `🎤` (MIC) from `permission.asked` correctly returns to `🚀` (ROCKET) after `permission.replied`
- TDD phase cleared on `session.status idle` — stale red/green can no longer linger after a tool completes
- Plugin state replaced scattered `setState({ status })` calls with `StatusFlags` interface + `setFlags()` helper

### Removed

- `detectStatusFromChange()` — dead code, never called from production paths
- `detectTddStatus()` — superseded by direct phase detection in `tool.execute.before`
- `updateProgressFromChange()` — dead code, never called from production paths
- Stale generated report files (`COMMAND_REPORT.html`, `COMMAND_REPORT.md`, `GOOST_VS_ADV_COMPARISON.html`)
- Unused `_getModelName` helper in `terminal.ts` (35 lines of speculative/dead code)

## [0.4.0] - 2026-02-22

### Fixed (post-release)

- `/adv-quick` now always derives its contract from the recent conversation when called with no arguments — never asks "what do you want to build?"
- `/adv-proposal` no longer stops with a usage error when called with no summary argument — derives title from conversation context instead

### Added

#### `/adv-quick` — Fast-Track Contract Execution

- New command that turns a pre-discussed change into a fully-executed ADV change without the heavyweight proposal phase
- Synthesizes a **Quick Contract** from the conversation (intent, LBP targets, scope, success criteria)
- Chat-based confirmation via `question` tool — no file review required
- Autonomous pipeline: Research (LBP validation) → Prep (task generation) → Implement (full `/adv-ralph` behavior)
- **LBP halt condition**: pauses with options if a best-practice conflict is detected before writing any code
- Registered in command manifest with `gate: "implementation"`, successors `["adv-review", "adv-harden"]`

#### BMAD-Inspired Quality Infrastructure

- Adversarial review enforcement: minimum 3 non-nit findings or explicit genuinely-clean justification
- `docs/checklists/review-checklist.md` — 12-dimension review coverage checklist
- `docs/checklists/harden-checklist.md` — 6-scanner hardening checklist with severity scoring
- `docs/checklists/prep-checklist.md` — INVEST-based requirement specificity and scenario completeness criteria
- Project-level wisdom JSONL store (`wisdom.jsonl`) with add, list, compact operations
- `adv_wisdom_promote` tool to promote change-level entries to project wisdom with pruning criteria
- Project wisdom injected into session context as `[ADV:PROJECT_WISDOM]` (max 10 entries, newest first)

#### Worktree Integration

- Phase 0 worktree assessment in `/adv-apply` and `/adv-ralph` — risk-based suggestion with user confirmation
- Inline worktree protocol: create worktree, switch `workdir`, continue in same session
- External mutable state shared across all worktrees of the same repo via project-id (root commit SHA)
- Worktree cleanup protocol documented: archive ≠ merge, must verify merge before `worktree_delete`
- Graceful degradation when worktree tools unavailable (`[ADV:INFO]` marker, continues in-place)

#### Cross-Repo Task Routing

- Tasks with `target_repo` or `target_path` metadata execute in the target directory via `workdir` switching
- `related_repos` config in `project.json` for generic repo routing (id → absolute path)
- Prohibited cancellation reasons enforced: "different repo" and "out of scope" are invalid
- Cross-repo protocol documented in `/adv-ralph` and `/adv-apply`

#### Mandatory User-Approved Cancellation

- `adv_task_cancel` tool replacing direct `status: "cancelled"` via `adv_task_update` (now rejected)
- Per-task cancellation reasons required, batch approval supported via `question` tool
- Cancellation approval metadata (`approved_by_user: true`) tracked in `change.json`
- Review and Harden gates block if any cancelled task lacks approval

#### Typed Delta Modifications

- `modify` delta now type-checked against Requirement schema — unknown keys rejected at parse time
- `rename` operation: update title and/or ID of existing requirement
- Intra-delta conflict detection: rename + remove on same requirement, duplicate renames, ID collisions
- Delta application order enforced: rename → remove → modify → add

#### Tools

- `adv_task_show` — get full task details by task ID (includes parent changeId)
- `adv_run_test` — run test command and record TDD evidence in one call
- `adv_task_cancel` — cancel tasks with mandatory user approval and per-task reasons
- `adv_change_add_issue` / `adv_change_remove_issue` — link/unlink GitHub issue URLs to changes
- Wisdom tools: `adv_wisdom_add`, `adv_wisdom_list`, `adv_wisdom_promote`
- Gate tools: `adv_gate_status`, `adv_gate_complete`

#### Performance & Reliability

- Lazy sync on startup — reduced cold-start latency
- All 36 tools switched to compact JSON output with pagination support
- Auto-truncation on tool outputs to protect context window
- SQLite: WAL mode, auto-recovery, checkpointing to prevent corruption
- Atomic writes with fsync hardening for `change.json` and `agenda.jsonl`
- File locking to prevent concurrent write corruption
- Change IDs: camelCase format with stop-word filtering and auto-increment deduplication

#### Developer Experience

- `adv-researcher` sub-agent definition (`.opencode/agents/adv-researcher.md`)
- Bash policy guard (`plugin/src/guards/bash.ts`) enforcing read-only restrictions on `explore`/`librarian` agents
- JSON Schema generation script to prevent schema drift
- Migration script: add `$schema` refs to existing `change.json` / `spec.json` files
- Context freshness policy: re-read change via `adv_change_show` before each task (prevents drift)
- TodoWrite rules: task IDs only in todo list (forces `adv_task_show` lookup, prevents stale mental models)

### Changed

- `/adv-harden` doc scanner replaced with aggressive documentation hygiene (stale content detection, orphan files)
- `/adv-review` enforces minimum findings threshold with genuinely-clean justification template
- Change ID format: `camelCase` (e.g., `fixLoginBug`) with short-form partial matching
- `adv_task_update` rejects `status: "cancelled"` — use `adv_task_cancel` instead
- Archive workflow validates all 6 gates complete (or legacy) before proceeding
- Plugin context window optimized: reduced injected system context size

### Fixed

- Archive tests failing on Bun due to `access()` resolving to `null`
- `change.json` corruption under concurrent writes — strict locking + fsync
- SQLite corruption — WAL checkpointing and auto-recovery
- Bell/chime now debounces `EARTH` notifications, rings `MIC` immediately, and cancels transient idle alerts during sub-agent teardown (was firing spuriously)
- SQLite store now closes cleanly on session exit (memory leak)
- Schema errors returned to AI instead of silently logged to console
- `MOON` status preserved correctly during `session.status` events
- `$schema` field and extra fields in task/change schemas handled via `.passthrough()`

### Security

- Resolved 3 dependency vulnerabilities: `minimatch` (high ReDoS), `ajv` (moderate ReDoS), `esbuild` (moderate dev-server exposure)
- Updated `vitest` to v4, `tsup` to v8.5, `eslint` to v9.39, `typescript-eslint` to v8.56
- Added `overrides` in `package.json` to force patched `minimatch >=10.0.1` and `ajv >=8.17.1`
- Removed stale `pnpm-lock.yaml` (was being scanned by Dependabot instead of `bun.lock`)
- Migrated from `pnpm` to `bun` as primary package manager and test runner

## [0.3.0] - 2026-01-29

### Added

#### 6-Gate Quality Checklist

- Sequential quality gates: research, prep, implementation, review, harden, signoff
- Gate status tracking with timestamps and completion evidence
- Sequence enforcement - gates must be completed in order
- Auto-completion logic for research/prep gates in `/adv-apply` and `/adv-ralph`
- Gate prerequisite checks in `/adv-review` (requires implementation) and `/adv-harden` (requires review)
- User signoff gate required before archive

#### Gate Tools

- `adv_gate_status` - Get gate status for a change with completion timestamps
- `adv_gate_complete` - Mark a gate complete with sequence enforcement

#### Incremental Sync Optimization

- Triple-attribute file change detection (mtime + size + inode)
- `sync_files` SQLite table for tracking file attributes
- Skip unchanged files during sync for improved performance

#### Command Updates

- All workflow commands updated with gate integration
- Cancelled task approval flow via question tool
- Gate status displayed in completion banners
- Auto-completed gates notification in acceptance prompts

#### Migration Support

- Legacy gate status for existing changes (counts as "satisfied")
- Migration sets all gates to 'legacy' except signoff which stays 'pending'

### Changed

- Archive workflow requires all 6 gates complete (or legacy)
- Agenda completion checks gates if present

## [0.2.0] - 2026-01-22

### Added

#### New Slash Commands (10)

- `/adv-clarify` - Requirements clarification assistant
- `/adv-prep` - Implementation preparation with analysis and planning
- `/adv-research` - Research context and generate ADRs for architectural decisions
- `/adv-review` - 4-agent parallel code review (Traceability, Logic, Security, Architecture)
- `/adv-harden` - 5-agent production hardening (Tests, AI-Slop, Docs, Cleanup, Spec Alignment)
- `/adv-audit` - Full system audit with staged analysis
- `/adv-ralph` - "Wreck-it Ralph" demolition protocol for removing capabilities
- `/adv-refactor` - Multi-agent refactoring with conflict detection
- `/adv-coordinate` - Multi-change coordination and dependency resolution
- `/adv-roadmap` - Strategic roadmap with change sequencing

#### Enhanced Commands (5)

- `/adv-status` - Enhanced with contract status display
- `/adv-proposal` - Hybrid architecture with tool-based state
- `/adv-validate` - Enhanced validation workflow
- `/adv-apply` - Full TDD workflow with contract banners
- `/adv-archive` - Complete archive workflow with validation

#### Documentation

- COMMAND_REPORT.md - Implementation details for all commands
- COMMAND_REPORT.html - Printable approval document

### Changed

- All commands now use hybrid architecture: tools for state, banners for visibility
- Commands derive CONTRACT banners from adv\_\* tool state instead of file parsing
- Sub-agent orchestration standardized across review, harden, audit, and refactor

## [0.1.0] - 2026-01-21

### Added

#### Core Plugin

- Initial plugin scaffold with TypeScript configuration
- Zod schemas for runtime validation of all types
- Plugin lifecycle hooks (onSessionStart, onSessionEnd)

#### Storage Layer

- JSON file storage as source of truth for specs and changes
- SQLite caching with FTS5 for fast full-text search
- Unified Store interface combining JSON and SQLite
- Project configuration management (project.json)

#### Tools (13 total)

- **Spec Tools**: `adv_spec` (actions: list, show, search)
- **Change Tools**: `adv_change_list`, `adv_change_show`, `adv_change_create`, `adv_change_validate`, `adv_change_archive`
- **Task Tools**: `adv_task_list`, `adv_task_ready`, `adv_task_update`, `adv_task_add`
- **Status Tool**: `adv_status`

#### Validation Engine

- Completeness checks (tasks, deltas, scenarios, ID formats)
- Conflict detection (duplicates, orphans, priority downgrades)
  s\*\*: `adv_task_list`, `adv_task_ready`, `adv_task_update`, `adv_task_add`
- **Status Tool**: `adv_status`

#### Validation Engine

- Completeness checks (tasks, deltas, scenarios, ID formats)
- Conflict detection (duplicates, orphans, priority downgrades)
- Reference validation (spec existence, requirement existence)
- "Specs as laws" enforcement

#### Archive System

- Delta application (add, modify, remove operations)
- Semantic version bumping (minor for adds, patch for modifications)
- Markdown documentation generation from specs
- Archive directory creation with change history

#### Events & Status

- Terminal status markers (`[ADV:ROCKET]`, `[ADV:TDD_RED]`, etc.)
- Tab color updates via OSC sequences
- Tmux environment detection and support
- Doom loop detection (3+ retry threshold)
- TDD phase detection from task titles

#### Slash Commands

- `/adv-status` - Project overview
- `/adv-proposal` - Create change proposal
- `/adv-validate` - Validate change against specs
- `/adv-apply` - Implement with TDD workflow
- `/adv-archive` - Archive completed change

#### Documentation

- ADV_INSTRUCTIONS.md - Complete agent guidance
- README.md - Project documentation
- INSTALL.md - Setup instructions
- Command documentation in .opencode/command/

#### Testing

- 222 tests across 11 test files
- Vitest test runner with parallel execution
- Temporary directory isolation for tests
- Sample fixtures (SAMPLE_SPEC, SAMPLE_CHANGE)

#### CI/CD

- GitHub Actions workflow for CI
- Multi-version Node.js testing (20.x, 22.x)
- Typecheck, lint, format, and test stages

### Technical Details

- **Runtime**: Node.js 20+
- **Package Manager**: pnpm
- **Test Framework**: Vitest
- **Database**: better-sqlite3 with FTS5
- **Type Safety**: TypeScript strict mode + Zod schemas
- **Linting**: ESLint 9 with TypeScript support
- **Formatting**: Prettier

[Unreleased]: https://github.com/Sharper-Flow/Advance/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/Sharper-Flow/Advance/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Sharper-Flow/Advance/releases/tag/v0.7.0
[0.4.0]: https://github.com/Sharper-Flow/Advance/releases/tag/v0.4.0
[0.2.0]: https://github.com/Sharper-Flow/Advance/releases/tag/v0.2.0
[0.1.0]: https://github.com/Sharper-Flow/Advance/releases/tag/v0.1.0
