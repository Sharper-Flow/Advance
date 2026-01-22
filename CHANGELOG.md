# Changelog

All notable changes to ADV (Advance) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/Sharper-Flow/Advance/releases/tag/v0.1.0
