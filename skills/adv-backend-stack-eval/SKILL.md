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

## When to Load

Load when evaluating backend language/runtime, database/data layer, async/workflow infrastructure, or API style.

Load when starting a backend/API, adding/replacing a data store/queue/runtime, or comparing stack options.

Skip when stack is already mandated, decision is trivial/reversible, only one viable option exists, or user already chose and wants implementation help.

## Guiding Principle

Prefer boring, well-understood technology when evidence is comparable. Scale novelty tolerance by project context: personal projects can experiment; platforms need strong evidence for change.

> "Every company gets about three innovation tokens." — Dan McKinley, *Choose Boring Technology*

## Project-Type Spectrum

| Type | Context | Innovation Budget | Evidence Bar |
|---|---|---|---|
| Personal / scratch | usually greenfield | high | Light |
| Internal tool | greenfield or brownfield | medium | Standard |
| Published product / SaaS | hybrid | low | Standard |
| Platform / library | brownfield-sensitive | very low | Rigorous |

For brownfield work, existing-stack integration is first-class. Do not treat greenfield appeal as automatic migration fit.

## Quick Adoption Check

Ask 2–3, weighted by project type:

1. Has team shipped this tech in production before?
2. Are needed libraries maintained and ecosystem-standard?
3. Can team debug it at 3 AM with current tooling?
4. Do compliance, residency, encryption, or audit needs constrain choice?

## Dimension Docs

| Doc | Use |
|---|---|
| `LANGUAGE.md` | Language/runtime criteria and prompts |
| `DATABASE.md` | Database/data layer criteria and prompts |
| `ASYNC.md` | Queue/event/workflow criteria and prompts |
| `API.md` | REST/RPC/GraphQL/API contract criteria and prompts |

## Evidence Bar

| Tier | Requirement |
|---|---|
| Light | Docs checked, active maintenance, gut check passes |
| Standard | Light + production examples, maintenance health, primary failure mode, migration path |
| Rigorous | Standard + migration plan, runbooks, ops capability, alternatives, capacity estimate |

Before recommending, state tier, evidence present, missing evidence, and risks. Do not invent certainty.

## Research Tools

- Context7 — official docs, API references.
- Kagi — ecosystem sentiment, production case studies, CVE status.
- `gh_grep_searchGitHub` — real-world usage and adoption patterns.

## Hand-offs + Boundaries

- Use `prioritizer` when 2+ options remain viable and tradeoffs depend on values.
- Use `adv-user-intuit` when concrete candidates need user taste/preference.
- Defer frontend/fullstack defaults to `sharperflow-web-standards`.
- Defer MCP tool choice to `mcp-selection`.
- Adjacent but out-of-scope: cloud provider, CI/CD, observability platform, cache/CDN, secrets platform.

## Sources

- Dan McKinley — Choose Boring Technology — https://mcfunley.com/choose-boring-technology
- Boring Technology Club — https://boringtechnology.club
- Will Larson — Crafting Engineering Strategy — https://craftingengstrategy.com
- Michael Nygard ADR template — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Thoughtworks Technology Radar — https://www.thoughtworks.com/radar
- Richardson Maturity Model — https://martinfowler.com/articles/richardsonMaturityModel.html
- Napkin Math — https://sirupsen.com/napkin
