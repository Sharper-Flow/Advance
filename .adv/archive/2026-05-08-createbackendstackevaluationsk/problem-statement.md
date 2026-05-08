## Why

Backend stack and tool decisions (language, database, async/workflow, API style) recur frequently across changes and projects, but agents and humans currently lack a shared, evidence-driven rubric for evaluating *what* backend tools to adopt and when boring tech wins versus when new tech (GraphQL, vector databases, DuckDB, Kafka, Temporal, Rust, Go, Python) earns its operational and cognitive cost.

Existing skills cover only narrow slices:
- `prioritizer` — generic tradeoff criteria questions (downstream, reusable)
- `adv-user-intuit` — concrete-candidate side-by-side comparison (downstream, reusable)
- `sharperflow-web-standards` — web frontend stack defaults (different layer)
- `adv-arch-detection` — detect existing architecture inconsistency (different intent)
- `mcp-selection` — MCP tool choice only (different scope)

No skill answers the upstream question: *should we adopt this class of backend tool at all, and what evidence is required before doing so?* This forces every change involving backend tooling to re-derive the rubric ad hoc, leading to inconsistent decisions, hype-driven adoptions, and missed LBP alternatives (P27).

## Desired outcome

A read-only methodology skill (working name `agent-backend-stack-evaluation`) providing:

1. Decision matrix across four backend dimensions: language/runtime, data/database, async/workflow, API style
2. Socratic question prompts that force evidence before adopting new tech
3. Default-to-boring-tech bias aligned with P19 (simplicity), P27 (due-diligence), P29 (clean-not-minimal)
4. Disqualifiers and adoption checks: ops cost, maturity, team fit, failure modes, migration path
5. Composition guidance pointing downstream to `prioritizer` (criteria questions) and `adv-user-intuit` (candidate comparison)

## Scope boundary

In scope:
- Methodology, rubric, evidence-bar prompts
- Ecosystem-status check protocol (Context7 + Kagi + gh_grep)
- Dimensions: language/runtime (Rust/Go/Python/TypeScript), data (Postgres/search/vector/DuckDB/OLAP), async (queues/Kafka/Temporal/jobs), API style (REST/GraphQL/RPC)

Out of scope:
- Implementation design or migration plans
- Opinionated tech endorsements (skill teaches the rubric, not the verdict)
- Web frontend stack (sharperflow-web-standards owns)
- MCP tool selection (mcp-selection owns)
- Specific library version recommendations (skill is durable methodology)
