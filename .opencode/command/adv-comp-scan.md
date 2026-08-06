---
name: adv-comp-scan
description: Scan competitor capabilities against this project for competitive intelligence
---
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
`skill("adv-comp-research")` → two-mode strategy, auto-mode detection, comparison table format, evidence requirements.

Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).

---
## Pre-flight
1. **Validate URL** — ensure competitor argument is a valid URL or GitHub repo
2. **Auto-detect mode** — `github.com/*` → source mode; everything else → public mode
3. **Worktree context** — `pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in all sub-agent prompts.

---
## Source Safety Boundary

All research MUST stay on public sources only.

- **Redact before querying:** strip secrets, internal URLs, private identifiers, proprietary code snippets, credentials, and confidential project details from prompts, search queries, and scraped URLs.
- **No confidential data:** do not submit internal-only roadmaps, unreleased designs, private user data, or proprietary metrics to competitor sites, search engines, or scraping tools.
- **Public-source boundary:** if a competitor target is private, authenticated, or paywalled beyond public view, stop and surface the boundary rather than bypassing it with credentials, trial sign-ups, or internal access.
- **Fallback safety:** when Exa or Firecrawl fallback is used, keep queries generic and source-cited; never leak project internals to obtain competitor data.

---
## Phase 1: Source Mode (GitHub Repos)
When mode is `source`:

If repo is private or inaccessible → fallback to public mode with warning.

---
## Phase 1: Public Mode (Websites / Docs)
When mode is `public`:

If Firecrawl fails → use Exa search results as primary source.

---
## Write Metadata
After successful completion, call `adv_project_metadata action:"write"` with:
- `key`: `"comp-scan"`
- `count`: number of comparison dimensions analyzed
- `summary`: one-line string: `"{count} dimensions analyzed: {findingsCount} findings"` or `"no significant differences"`
- `written_by`: `"agent"`

Persists the scan result for display in `/adv-status`.

---
## Report Generation
Emit COMPETITIVE INTELLIGENCE REPORT: competitor URL, mode, comparison table, structured findings, top 3 takeaways.

If no data → `[WARN] No competitor data could be retrieved.`

### JSON Format (if `--json`)
Output structured JSON: `competitor`, `mode`, `comparison`, `findings[]`, `takeaways`.

---
## Execution
1. Parse arguments → 2. Pre-flight → 3. Phase 1 (mode-specific) → 4. Comparison synthesis per skill → 5. Write Metadata → 6. Report
