---
name: adv-backend-stack-eval
description: "Backend technology stack evaluation — choose boring technology scaled by project context. Use when selecting languages, databases, async infra, or API styles for new or existing backends."
keywords:
  - backend
  - stack
  - "backend stack"
  - "tech stack"
  - architecture
  - database
  - postgres
  - "data store"
  - queue
  - kafka
  - temporal
  - async
  - "message queue"
  - graphql
  - rpc
  - rest
  - api
  - rust
  - go
  - python
  - typescript
  - language
  - runtime
  - "choose boring technology"
  - "technology choice"
  - "innovation budget"
  - "boring technology"
  - "stack evaluation"
  - "architecture decision"
license: MIT
metadata:
  review_status: reviewed
  source: agent-created
  trigger_change: createbackendstackevaluationsk
  created_at: "2026-05-08"
---

# Backend Stack Evaluation Skill

## When to Load This Skill

Load when evaluating or choosing backend technologies: language/runtime, database/data layer, async/workflow infrastructure, or API style.

**Load when:**
- Starting a new backend, service, or API
- Replacing or adding a data store, queue, or runtime
- User asks "what stack should I use?", "is X a good choice?", or "compare Y vs Z"

**Skip when:**
- Stack is already constrained by existing codebase or team mandate
- Decision is trivial or easily reversible (e.g. dev-dependency, test tool)
- Only one viable option exists in the ecosystem
- User already made the decision and wants implementation help

## Guiding Principle

When evidence is otherwise comparable, prefer boring, well-understood technology over novelty. Scale that preference by project context — a personal project has room to experiment; a platform others depend on needs stronger evidence for anything new.

> "Every company gets about three innovation tokens." — Dan McKinley, *Choose Boring Technology*

## Phase 0: Project Context Assessment

Before evaluating dimensions, classify the project and set the evidence bar.

### Project-Type Spectrum

| Type | Context | Innovation Budget | Evidence-Bar Tier | Examples |
|------|---------|-------------------|-------------------|----------|
| Personal / scratch | Usually greenfield | High | **Light** | Side project, spike, demo |
| Internal tool | Greenfield or brownfield | Medium | **Standard** | Admin panel, ETL pipeline |
| Published product / SaaS | Often hybrid | Low | **Standard** | Customer-facing API, web app backend |
| Platform / library | Often brownfield-sensitive | Very low | **Rigorous** | Open-source framework, shared infra |

For brownfield work, include integration with the existing stack as a first-class consideration. Do not treat a technically attractive greenfield choice as automatically appropriate for migration or extension work.

### Quick Adoption Check (scaled by context)

Ask 2–3 of these, weighted by project type:

1. **Team expertise** — Has the team shipped this tech in production before?
2. **Ecosystem maturity** — Are there well-maintained libraries for your needs?
3. **Operational burden** — Can you debug this at 3 AM with existing tooling?
4. **Compliance constraints** — Are there regulatory, residency, encryption, or audit requirements that constrain the choice?

## Phase 1: Per-Dimension Analysis

Keep research proportional to the evidence-bar tier. Light evaluations should stay brief; rigorous evaluations continue until enough evidence exists to state what is known, unknown, and risky.

Use Context7 for library docs, Kagi for broader context, `gh_grep_searchGitHub` for real-world patterns.

### Dimension A: Language / Runtime

**Consider:**
- Team expertise and production experience with each candidate
- Ecosystem fit — does the domain have materially better libraries in one language?
- Performance characteristics — latency, throughput, memory model
- Deployment model — what runtimes does the target platform support?
- Hiring and onboarding — can the team grow with this choice?
- Brownfield fit — how well does the candidate integrate with the existing stack?

**Socratic prompts:**
1. What language do you debug fastest when production is on fire?
2. Does this project need a library that only exists in one ecosystem?
3. If you pick a new language, who mentors the team and owns the runbooks?
4. What performance constraint would force you away from your current runtime?

### Dimension B: Data / Database

**Consider:**
- Query patterns — relational, graph, full-text, vector, OLAP
- Scale — read vs write patterns, throughput needs, data volume
- Schema flexibility — structured vs schemaless vs hybrid
- Operational complexity — who runs it, who is on-call, backup/restore
- Whether PostgreSQL with extensions can serve the need before adding stores
- Compliance and residency constraints — encryption, audit, retention, jurisdiction

**Socratic prompts:**
1. Can PostgreSQL handle this with extensions or a read replica?
2. What specific query pattern forces a second store?
3. Who operates the second database when it misbehaves at 3 AM?
4. What migration path exists if the specialized store becomes a bottleneck?

### Dimension C: Async / Workflow

**Consider:**
- Durability requirements — is job loss acceptable?
- Scope — single service vs cross-service coordination
- Ordering — strict ordering vs idempotent out-of-order processing
- Throughput characteristics — sustained vs bursty
- Complexity budget — in-process async → job queue → event bus → orchestration engine, in order of increasing ops cost
- Operational model — managed service, self-hosted broker, or workflow engine ownership

**Socratic prompts:**
1. Can a simple job queue handle this before adding Kafka or Temporal?
2. What happens if an event is lost — is that acceptable?
3. Do multiple services need to react, or is this internal to one service?
4. Is ordering a hard requirement, or can idempotency handle disorder?

### Dimension D: API Style

**Consider:**
- Client diversity — how many client types with different data needs?
- Fetch efficiency — over-fetching vs under-fetching patterns
- Contract stability — internal service mesh vs public API with external consumers
- Caching strategy — HTTP caching vs query-level caching
- Type safety requirements — strong typing needs at the boundary
- External ecosystem — SDK generation, documentation, schema evolution, client support

**Socratic prompts:**
1. Do your clients have structurally different data needs, or can REST endpoints serve them all?
2. How much response data is unused by clients today?
3. Is this an internal service mesh or a public API?
4. Does HTTP caching matter more than query flexibility?

## Evidence-Bar Framework

Apply the tier from Phase 0:

| Tier | Requirements |
|------|-------------|
| **Light** | Read the docs. Check tool is actively maintained. Gut check passes. |
| **Standard** | All Light + real production projects using it (GitHub search, case studies) + maintenance health + primary failure mode identified + migration path exists. |
| **Rigorous** | All Standard + written migration plan + failure modes with runbooks + ops capability verified (monitoring, tracing, backup/restore) + competing standards evaluated + capacity estimate. |

Before recommending, state which tier was used and summarize present evidence, missing evidence, and risks. If evidence is missing, surface it explicitly rather than inventing certainty.

### Research Tools

- **Context7** — library docs, official API references
- **Kagi** — ecosystem sentiment, production case studies, CVE status
- **`gh_grep_searchGitHub`** — real-world usage patterns, adoption volume

## Composition & Boundaries

### Hand-offs

- **→ prioritizer skill**: After evidence review, if 2+ specific options remain viable and the written pros/cons do not resolve to a clear preference, use prioritizer to build criteria questions.
- **→ adv-user-intuit skill**: When candidates are concrete and user taste/preference is the deciding factor.

### Boundaries

- **← sharperflow-web-standards**: For frontend/fullstack stack choices (SvelteKit, Tailwind, etc.), defer to that skill.
- **← mcp-selection**: For choosing between specific tools (Kagi vs Firecrawl, etc.), defer to that skill.
- This skill covers backend infrastructure choices only. It does not cover cloud provider selection, CI/CD tooling, observability platforms, cache/CDN strategy, or secrets-management platform selection; surface those as adjacent decisions when they affect the backend choice.

## Sources

- Dan McKinley — "Choose Boring Technology" — https://mcfunley.com/choose-boring-technology
- Boring Technology Club — https://boringtechnology.club
- Will Larson — "Crafting Engineering Strategy" — https://craftingengstrategy.com
- Michael Nygard — ADR template — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- MADR — https://github.com/adr/madr
- Thoughtworks Technology Radar (living reference; use current edition at evaluation time) — https://www.thoughtworks.com/radar
- Richardson Maturity Model — https://martinfowler.com/articles/richardsonMaturityModel.html
- Simon Hørup Eskildsen — Napkin Math — https://sirupsen.com/napkin
