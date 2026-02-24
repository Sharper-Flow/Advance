# Changelog

All notable changes to ADV (Advance) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

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
- `docs/checklists/harden-checklist.md` — 5-scanner hardening checklist with severity scoring
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
- Bell/chime fires only on `ROCKET`/`MOON` → `EARTH`/`MIC` transitions (was firing spuriously)
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
- Commands derive CONTRACT banners from adv_* tool state instead of file parsing
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
- **Spec Tools**: `adv_spec_list`, `adv_spec_show`, `adv_spec_search`
- **Change Tools**: `adv_change_list`, `adv_change_show`, `adv_change_create`, `adv_change_validate`, `adv_change_archive`
- **Task Tools**: `adv_task_list`, `adv_task_ready`, `adv_task_update`, `adv_task_add`
- **Status Tool**: `adv_status`

#### Validation Engine
- Completeness checks (tasks, deltas, scenarios, ID formats)
- Conflict detection (duplicates, orphans, priority downgrades)
s**: `adv_task_list`, `adv_task_ready`, `adv_task_update`, `adv_task_add`
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

[0.4.0]: https://github.com/Sharper-Flow/Advance/releases/tag/v0.4.0
[0.2.0]: https://github.com/Sharper-Flow/Advance/releases/tag/v0.2.0
[0.1.0]: https://github.com/Sharper-Flow/Advance/releases/tag/v0.1.0
