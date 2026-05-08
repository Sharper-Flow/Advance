# Design: adv-backend-stack-eval Skill

## Architecture Overview

Single-file skill (`skills/adv-backend-stack-eval/SKILL.md`) with structured sections following repo skill conventions (YAML frontmatter + markdown body).

```
adv-backend-stack-eval/SKILL.md
├── YAML frontmatter (name, description, keywords, metadata)
├── When to Load This Skill / Skip When
├── Phase 0: Project Context Gate
│   ├── Project-type spectrum table (4 tiers)
│   ├── Evidence-bar intensity scaling (light/standard/rigorous)
│   └── Quick adoption check (2-3 questions scaled by context)
├── Phase 1: Per-Dimension Analysis (×4)
│   ├── Language/Runtime (Rust/Go/Python/TypeScript)
│   ├── Data/Database (Postgres/search/vector/DuckDB/OLAP)
│   ├── Async/Workflow (queues/Kafka/Temporal/jobs)
│   └── API Style (REST/GraphQL/RPC)
│   Each section contains:
│   ├── Decision matrix table (criteria, default-boring, deviate signals, disqualifiers)
│   ├── Socratic prompts (≥4 per dimension)
│   └── Default-boring + when-to-deviate signals
├── Evidence-Bar Protocol (Context7 + Kagi + gh_grep_searchGitHub)
├── Composition & Boundaries (prioritizer, adv-user-intuit, sharperflow, mcp-selection)
└── Sources (canonical citations)
```

Target: <300 lines total.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Skill name | `adv-backend-stack-eval` | Deploys via sync-global.sh `skills/adv-*/` glob; matches all 7 existing repo skills |
| Phase 0 project gate | Single question, 4 project-type options | Avoids ceremony; follows `prioritizer` bounded-time pattern |
| Per-dimension sections | Matrix + prompts co-located | P04 locality of behavior; avoids cross-referencing |
| Keyword count | ~20 targeted keywords | Middle ground: `prioritizer` uses 7, `sharperflow` uses 19 |
| Evidence-bar scaling | 3 tiers: light / standard / rigorous | Maps to project-type spectrum: personal → light, internal/SaaS → standard, platform → rigorous |
| Research time bound | "60s total per dimension, not exhaustive" | Follows `prioritizer` convention |
| Source citations | Inline links + Sources section | Durable: links to canonical URLs, not version-specific docs |

## Implementation Strategy

1. Create `skills/adv-backend-stack-eval/SKILL.md` with full content (frontmatter + all sections)
2. Run `scripts/sync-global.sh --fix` to deploy to `~/.config/opencode/skills/`
3. Run `scripts/sync-global.sh --check` to verify presence without warnings
4. Dry-run keyword match: verify at least one keyword per dimension matches trigger phrases

Sequencing: single task, no dependencies, no cross-repo work.

## LBP Analysis

- **Durable methodology over snapshot opinions**: No version pins, no time-bound benchmarks. Ecosystem checks happen at invocation time via Context7/Kagi/gh_grep. This is the LBP — a rubric that ages well.
- **Composition over duplication**: Reuses `prioritizer` and `adv-user-intuit` downstream instead of rebuilding tradeoff/comparison logic. P22 (modularity, prefer proven libraries over homegrown).
- **Project-context scaling**: Avoids the one-size-fits-all trap. Personal projects get lightweight guidance; platforms get full rigor. More accurate than blanket "always boring" or "always cutting edge."
- **Canonical source grounding**: McKinley, Larson, Nygard, Thoughtworks, Richardson. Established sources, not trend-chasing.

## Affected Components

- `skills/adv-backend-stack-eval/SKILL.md` — new file
- `~/.config/opencode/skills/adv-backend-stack-eval/SKILL.md` — synced copy (via sync-global.sh)
- No changes to plugin code, agents, commands, or specs

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Skill too long → agent never loads fully | Cap: ≤4 dimensions × (1 matrix + ≤8 prompts) + Phase 0 + sources. Target <300 lines |
| Keywords miss real-world phrasing | ~20 keywords covering dimension names + trigger phrases + comparison patterns ("X vs Y") |
| Evidence-bar tiers too vague | Each tier has concrete checklist: light = "read the docs", standard = "read docs + check maintenance + find 3 real projects using it", rigorous = "standard + write migration plan + identify failure mode + ops runbook exists" |
| Overlap with `prioritizer` | Explicit boundary: this skill answers "should we consider this class of tool?" → `prioritizer` answers "which specific approach?" Composition section + Skip-when guard |
| Project-context gate adds ceremony | Single question with 4 options; personal/scratch fast-tracks through Phase 0 |

## Evidence-Bar Tier Definitions

### Light (personal/scratch projects)
- Read the docs
- Check that the tool is actively maintained
- "Would I use this again?" gut check OK

### Standard (internal tools, published products, SaaS)
- All light checks, plus:
- Find ≥3 real projects using this tool in production
- Check maintenance health (last release, open issues, contributor count)
- Identify the primary failure mode and confirm it's tolerable
- Confirm migration path exists (can you get off it?)

### Rigorous (platforms, libraries others depend on)
- All standard checks, plus:
- Write a migration plan (how would you migrate off this tool?)
- Identify ≥2 failure modes and confirm runbooks exist
- Verify ops capability: who is on-call, what monitoring exists
- Check for competing standards (is this the winning horse?)
- Napkin-math the capacity/scaling characteristics
