---
name: adv-comp-research
description: "Competitive intelligence research methodology for source code and public information comparison"
keywords: ["competitive", "comparison", "market", "pricing", "features", "intelligence", "research"]
metadata:
  priority: medium
  source: agent-created
---

# Competitive Intelligence Research Skill

## Purpose

Reusable competitive intelligence methodology for ADV comp-scan workflows. Provides two-mode research strategy, auto-mode detection, comparison table format, and evidence requirements.

## Two-Mode Strategy

### Mode 1: Source Code Analysis

When the competitor is a GitHub repository (URL matches `github.com/*`):

1. **Extract repo metadata** — `gh_grep_searchGitHub` for README, package manifests, main language
2. **Read feature surface** — analyze source structure, API endpoints, key modules
3. **Compare architecture** — layer structure, dependency graph, tech stack

### Mode 2: Public Information Scraping

When the competitor is a website, product page, or documentation:

1. **Firecrawl primary** — `firecrawl_firecrawl_scrape` for pricing, features, changelog pages
2. **Kagi fallback** — `kagi_kagi_search_fetch` for recent news, reviews, comparisons
3. **Structured extraction** — identify feature list, pricing tiers, target audience

## Auto-Mode Detection

| URL Pattern | Mode | Override |
|-------------|------|----------|
| `github.com/*` | source | `--mode source` |
| Everything else | public | `--mode public` |

User can force mode via `--mode source|public`. When ambiguous, default to public mode.

## Output Format

### Comparison Table

| Feature | This Project | Competitor | Notes |
|---------|-------------|------------|-------|
| {feature} | {our_status} | {their_status} | {observation} |

### Structured Finding

```json
{
  "category": "feature|pricing|performance|security|ux",
  "our_status": "present|missing|partial|unknown",
  "their_status": "present|missing|partial|unknown",
  "delta": "parity|advantage|gap|unknown",
  "source": "https://..."
}
```

## Evidence Requirements

- **Always cite source URLs** — every finding must include a `source` field
- **Flag unverifiable claims** — mark as `confidence: low` when source is secondary
- **Timestamp findings** — note when data was collected (pages change)
- **Distinguish observed vs inferred** — observed = direct from source; inferred = agent deduction

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns scan orchestration
- **No workflow sequencing** — the command owns phase ordering and sub-agent dispatch
- **Respect robots.txt** — Firecrawl handles this; do not bypass
- **No confidential data** — do not access private repos or authenticated endpoints without explicit user consent
