# createBackendStackEvaluationSkill

## Why

Backend stack and tool decisions (language, database, async/workflow, API style) recur frequently across changes and projects, but agents and humans currently lack a shared, evidence-driven rubric for evaluating *what* backend tools to adopt and when boring tech wins versus when new tech (GraphQL, vector databases, DuckDB, Kafka, Temporal, Rust, Go, Python) earns its operational and cognitive cost.

The rubric must account for **project context and lifecycle stage**: a personal/scratch project has near-unlimited innovation budget and low failure cost; a published SaaS or platform others depend on has very few innovation tokens and catastrophic failure cost. The same technology choice can be correct in one context and reckless in another.

Existing skills cover only narrow slices:
- `prioritizer` — generic tradeoff criteria questions (downstream, reusable)
- `adv-user-intuit` — concrete-candidate side-by-side comparison (downstream, reusable)
- `sharperflow-web-standards` — web frontend stack defaults (different layer)
- `adv-arch-detection` — detect existing architecture inconsistency (different intent)
- `mcp-selection` — MCP tool choice only (different scope)

No skill answers the upstream question: *should we adopt this class of backend tool at all, and what evidence is required before doing so?* This forces every change involving backend tooling to re-derive the rubric ad hoc, leading to inconsistent decisions, hype-driven adoptions, and missed LBP alternatives (P27).

## What Changes

- New skill directory `skills/adv-backend-stack-eval/` containing:
  - `SKILL.md` with YAML frontmatter (name, description, keywords, metadata including review_status + last_updated), a When-to-Load section with explicit "Skip when" rules, Phase 0 (project context gate + quick adoption check), four per-dimension sections (decision matrix + Socratic prompts co-located), evidence-bar protocol scaled by project type, composition pointers to `prioritizer` and `adv-user-intuit`, and canonical source citations.
- Sync wiring so the skill propagates to `~/.config/opencode/skills/` via `scripts/sync-global.sh` on the next sync run (auto-deployed because the `adv-` prefix matches the sync glob `skills/adv-*/`).
- No changes to plugin code, ADV tool surfaces, agent definitions, commands, or specs. The skill is read-only methodology consumed by agents on demand.

## Success Criteria

- [ ] Skill file exists at `skills/adv-backend-stack-eval/SKILL.md` with valid YAML frontmatter parseable by the skill loader.
- [ ] Frontmatter `keywords` cover the four dimensions (language/runtime, data, async, API) and trigger phrases such as "backend stack", "which database", "Kafka or Temporal", "Rust vs Go vs Python".
- [ ] Skill body includes a "Skip when" section matching the pattern in `prioritizer` (lines 16-20) and `adv-user-intuit` (lines 26-27).
- [ ] Skill body includes Phase 0: project context gate (classifies project type and lifecycle stage) followed by quick adoption check (2-3 questions scaled by context). Evidence bar adjusts by project type — personal/scratch projects get light checks; published/SaaS/platform projects get full rubric.
- [ ] Skill body includes a project-type spectrum: personal/scratch → internal tool → published product/SaaS → platform/library. Each tier defines innovation budget, failure cost, and evidence-bar intensity.
- [ ] Skill body includes a decision matrix for each of the four dimensions with at least: criteria, default-boring choice, when-to-deviate signals, and disqualifiers. Each dimension section co-locates its matrix and Socratic prompts.
- [ ] Skill body includes ≥4 Socratic question prompts per dimension that force the agent to surface evidence before recommending new tech.
- [ ] Skill explicitly references composition with `prioritizer` (downstream criteria questions) and `adv-user-intuit` (downstream candidate comparison) and explicitly carves out boundaries with `sharperflow-web-standards` and `mcp-selection`.
- [ ] Skill teaches an evidence-bar protocol (Context7 + Kagi + `gh_grep_searchGitHub`) before adopting any new tool, aligning with P27 (due-diligence) and P30 (docs-before-probing). Evidence-bar intensity scales with project type.
- [ ] Skill cites canonical sources: McKinley "Choose Boring Technology", Larson "Crafting Engineering Strategy", Nygard ADR template, Thoughtworks Technology Radar, Richardson Maturity Model.
- [ ] Sync via `scripts/sync-global.sh --check` reports the skill present in the global skills dir without warnings after `--fix`.
- [ ] A dry-run agent invocation matches the skill via at least one keyword and successfully loads it.

## Affected Code

- `skills/adv-backend-stack-eval/SKILL.md` — new file (skill body + frontmatter)
- `~/.config/opencode/skills/adv-backend-stack-eval/SKILL.md` — synced copy via `scripts/sync-global.sh`
- No changes to `plugin/`, `.opencode/command/`, `.opencode/agents/`, or `.adv/specs/`.

## Related Repositories

None. Single-repo change inside `oc-plugins/advance` with sync to user-global skills directory.

## Constraints

- Skill format must match the conventions in `skills/adv-*/SKILL.md`: YAML frontmatter (`name`, `description`, `keywords`, `metadata`), markdown body with phase/rules sections.
- Skill is read-only methodology — × MUST NOT mutate ADV state, complete gates, or create tasks.
- Bias toward boring tech (P19, P27, P29) **scaled by project context**. Personal/scratch projects get lighter bias; published/platform projects get the full innovation-token discipline. Skill teaches the rubric, not the verdict — × MUST NOT hardcode "Postgres always wins" style endorsements.
- Skill content must remain durable: no library version pins, no time-bound benchmarks. Ecosystem-status checks delegate to Context7/Kagi/gh_grep at invocation time.
- Skill name uses `adv-` prefix to match sync-global.sh deployment glob (`skills/adv-*/`).
- Research phases bounded: follow `prioritizer` pattern of "60 seconds total, not exhaustive." Four dimensions are heuristic starting points, not mandatory checklist.

## Impact

- Audience: agents (primary) and humans reading skill docs (secondary). No runtime API surface.
- No breaking changes. Additive skill.
- No migration needed.
- Composes alongside existing skills; does not replace any.

## Context

Idea-phase confirmed (`/adv-idea` session): user identified gap that no current skill covers backend stack/tool decision making, especially when to adopt new tech (GraphQL/vector/DuckDB) versus boring tech, when to choose Kafka vs Temporal, when to use Rust vs Go vs Python. Existing skills are either generic (prioritizer, user-intuit) or scoped to other domains (sharperflow-web-standards = web only; mcp-selection = MCP only; adv-arch-detection = inconsistency detection, not adoption decisions).

User chose output style "Decision matrix + Question prompts" via the idea-phase question tool, covering all four scopes (backend rubric + data/DB + async + language).

Research phase (`/adv-research`) validated:
- Canonical sources identified (McKinley, Larson, Nygard, Thoughtworks, Richardson)
- Architecture SOUND with corrections: renamed from `agent-backend-stack-evaluation` to `adv-backend-stack-eval` (sync deployment fix), adoption gate embedded as Phase 0 instead of separate layer, added "Skip when" section requirement.
- Three-layer composition simplified to: `adv-backend-stack-eval` (Phase 0 adoption check + Phase 1 research) → optional `prioritizer` → optional `adv-user-intuit`.

User feedback (post-research): rubric must account for **project type and lifecycle stage** — personal/scratch projects have different innovation budgets and failure costs than published products/platforms. Added project context gate to Phase 0 with a project-type spectrum and scaled evidence bar.

## Research Validation

### Architecture Health: SOUND

| Area | Status | Notes |
|---|---|---|
| Skill naming | Fixed | Renamed `agent-backend-stack-evaluation` → `adv-backend-stack-eval` to match sync-global.sh `skills/adv-*/` glob (line 1299) |
| Skill format | Valid | YAML frontmatter + markdown body matches all 7 existing repo skills |
| Composition model | Simplified | Adoption gate embedded as Phase 0 (not separate skill layer). Reduces pipeline from 3 sequential loads to 1 + optional downstream |
| Boundary overlap | None | No existing skill covers "should we adopt this class of backend tool" |
| Output shape | Validated | Decision matrix + Socratic prompts consistent with existing methodology skills |
| Ceremony risk | Mitigated | "Skip when" section + research time bounds + Phase 0 quick-check prevents over-invocation |
| Anti-patterns | Guarded | No version pins, no opinionated endorsements, durability via ecosystem-check protocol |
| Project context | Added | Phase 0 now includes project-type classification + scaled evidence bar |

### Canonical Sources for Skill Body

| Source | Use |
|---|---|
| Dan McKinley — "Choose Boring Technology" (mcfunley.com) | Core bias framing, innovation tokens concept |
| Boring Technology Club talk (boringtechnology.club) | "Master your tools" + process for adding tech |
| Will Larson — "Crafting Engineering Strategy" (craftingengstrategy.com) | Diagnosis-first methodology, Wardley mapping |
| Michael Nygard — ADR template (cognitect.com) | Decision documentation structure |
| MADR — Markdown ADR (github.com/adr/madr) | Lightweight ADR format reference |
| Thoughtworks Technology Radar | Hold/Assess/Trial/Adopt classification |
| Richardson Maturity Model (martinfowler.com) | API style evaluation |
| Simon Hørup Eskildsen — Napkin Math (sirupsen.com/napkin) | First-principle performance estimation |

### Simplification Opportunities Adopted

| Original | Simplified | Reason |
|---|---|---|
| 3-layer pipeline (adoption → criteria → comparison) | Adoption check as Phase 0 within skill | Reduces ceremony |
| Separate matrix + separate prompts sections | Per-dimension self-contained sections | Better locality of behavior (P04) |
| Exhaustive keyword list (~40+) | ~20 targeted keywords | Follows `prioritizer` terser pattern |
| One-size-fits-all evidence bar | Project-context-scaled evidence bar | Personal projects ≠ published platforms |

### Confidence

- **High**: naming fix, composition model, source material, output shape, deployment wiring, project context gate
- **Medium**: exact keyword list (resolved in design), research time bounds calibration

## Scope

### In Scope

- Skill methodology covering four backend dimensions: language/runtime, data/database, async/workflow, API style
- Phase 0: project context gate (project-type classification + lifecycle stage) followed by quick adoption check (2-3 questions scaled by context)
- Project-type spectrum: personal/scratch → internal tool → published product/SaaS → platform/library, with per-tier innovation budget and evidence-bar intensity
- Decision matrix per dimension (criteria, default-boring choice, when-to-deviate signals, disqualifiers)
- Socratic question prompts co-located with each dimension's matrix (≥4 per dimension)
- Evidence-bar protocol scaled by project type: Context7 + Kagi + `gh_grep_searchGitHub` and official docs
- "Skip when" section matching existing skill patterns
- Composition pointers to `prioritizer` and `adv-user-intuit`
- YAML frontmatter with keywords for the four dimensions and trigger phrases
- Canonical source citations (McKinley, Larson, Nygard, Thoughtworks, Richardson)
- Sync wiring via `scripts/sync-global.sh` (auto-deployed via `adv-` prefix)

### Out of Scope

- Implementation design, migration plans, or runbooks for any specific backend tool
- Opinionated endorsements ("always pick Postgres", "Temporal beats Kafka") — skill teaches the rubric, not the verdict
- Web frontend stack guidance — owned by `sharperflow-web-standards`
- MCP tool selection — owned by `mcp-selection`
- Library version pins or time-bound benchmarks — durability requires deferring those to Context7/Kagi at invocation time
- Changes to plugin code, ADV tools, commands, agents, or specs
- Auto-loading or auto-triggering rules beyond keyword matching (out of scope for v1)
- Frontend, mobile, ML/training stack decisions
- Separate skill for each dimension (one skill covers all four)
- Business strategy or market analysis (skill covers tech adoption, not product-market fit)

## Risks

- Risk: skill becomes too prescriptive and ages poorly. Mitigation: defer all version-bound and trajectory-bound claims to ecosystem-check protocol invoked at use time.
- Risk: overlap with `prioritizer` or `mcp-selection`. Mitigation: explicit "Skip when" section + composition notes + boundary carve-outs.
- Risk: skill never loads because keywords are too narrow or too broad. Mitigation: ~20 targeted keywords + dry-run keyword test in success criteria.
- Risk: skill body bloats into a textbook. Mitigation: research time bounds ("60s total, not exhaustive"), cap each dimension at one matrix + ≤8 prompts, defer depth to cited external sources.
- Risk: project-context gate adds too much ceremony for simple decisions. Mitigation: project-type classification should be a single question with 4 options, not a multi-step process. Personal/scratch classification should fast-track through Phase 0.

## Validation Plan

- Write skill content per the design produced in `/adv-design`.
- Validate YAML frontmatter parses (Read + frontmatter shape check).
- Run `scripts/sync-global.sh --check` and `--dry-run --diff` to confirm sync wiring.
- Dry-run keyword match: simulate trigger phrases against the keywords list to confirm at least one match per dimension.
- Manual review of the decision matrix and prompts against the four dimensions to confirm coverage and absence of opinionated endorsements.
- Verify project-context gate produces meaningfully different evidence bars for personal vs platform project types.
