---
name: adv-comp-scan
description: Scan competitor capabilities against this project for competitive intelligence
---
<!-- manifest: adv-comp-scan · requiresChangeId: false -->
# ADV Competitive Intelligence Scan
> **SUB-AGENT CONTEXT**: Return findings directly. Skip status markers.

Orchestrate competitive intelligence research using two-mode strategy: source code analysis (GitHub repos) or public information scraping (websites, docs, pricing pages).

## Argument Parsing
Parse `$ARGUMENTS`:
| Flag | Description | Default |
|------|-------------|---------|
| `<competitor-url-or-repo>` | Required — competitor URL or GitHub repo | — |
| `--mode source\|public` | Force research mode | Auto-detect |
| `--json` | JSON output | Text |
| `--verbose` | Detailed progress | Off |
| `--timeout N` | Sub-agent timeout (seconds) | 120 |

<UserRequest>
  $ARGUMENTS
</UserRequest>

---
## Phase 0: Load Skill
`skill("adv-comp-research")` → provides two-mode strategy, auto-mode detection, comparison table format, evidence requirements. If the skill is unavailable, continue with the embedded protocol in this command file.

---
## Pre-flight
1. **Validate URL** — ensure competitor argument is a valid URL or GitHub repo
2. **Auto-detect mode** — `github.com/*` → source mode; everything else → public mode
3. **Worktree context** — `pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in all sub-agent prompts.

---
## Phase 1: Source Mode (GitHub Repos)
When mode is `source`:

1. **Repo metadata** — `gh_grep_searchGitHub` for README, package manifests, main language
2. **Feature surface** — analyze source structure, API endpoints, key modules
3. **Tech stack** — identify dependencies, frameworks, runtime

If repo is private or inaccessible → fallback to public mode with warning.

---
## Phase 1: Public Mode (Websites / Docs)
When mode is `public`:

1. **Firecrawl primary** — `firecrawl_scrape` pricing, features, changelog pages
2. **Kagi fallback** — `kagi_kagi_search_fetch` for recent news, reviews, comparisons
3. **Structured extraction** — identify feature list, pricing tiers, target audience

If Firecrawl fails → use Kagi search results as primary source.

---
## Phase 2: Comparison Synthesis
Align findings to comparison table:

| Feature | This Project | Competitor | Notes |
|---------|-------------|------------|-------|
| {feature} | {our_status} | {their_status} | {observation} |

Generate structured findings with `category`, `our_status`, `their_status`, `delta`, `source`.

---
## Phase 3: Write Metadata
After successful completion, call `adv_project_metadata action:"write"` with:
- `key`: `"comp-scan"`
- `count`: number of comparison dimensions analyzed
- `summary`: one-line string: `"{count} dimensions analyzed: {findingsCount} findings"` or `"no significant differences"`
- `written_by`: `"agent"`

This persists the scan result for display in `/adv-status`.

---
## Report Generation
Emit COMPETITIVE INTELLIGENCE REPORT: competitor URL, mode, comparison table, structured findings, top 3 takeaways.

If no data → `[WARN] No competitor data could be retrieved.`

### JSON Format (if `--json`)
Output structured JSON: `competitor`, `mode`, `comparison`, `findings[]`, `takeaways`.

---
## Execution
1. Parse arguments → 2. Pre-flight → 3. Phase 1 (mode-specific) → 4. Phase 2 (synthesis) → 5. Write Metadata → 6. Report

