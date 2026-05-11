# adv-triage Bootstrap

## Required label set

`bug`, `feature`, `priority:critical`, `priority:high`, `priority:medium`, `priority:low`. Auto-create missing labels via `gh label create` idempotently. Log creations.

## Project resolution

1. Read `adv_project_metadata key: 'github_project'`.
2. If absent, resolve `<owner>` from `gh repo view`, then try `gh project list --owner <owner>` matching title `ADV: <repo-name>` exactly.
3. Still no match → use Tier B bootstrap approval prompt from `PROMPTS.md`.

## Required custom fields

| Field | Type | Options |
|---|---|---|
| `ADV Type` | SINGLE_SELECT | `bug,feature` |
| `Priority` | SINGLE_SELECT | `critical,high,medium,low` |
| `Value` | NUMBER | — |
| `TimeCriticality` | NUMBER | — |
| `RROE` | NUMBER | — |
| `Effort` | NUMBER | — |
| `WSJF` | NUMBER | — |
| `Status` | SINGLE_SELECT | `Backlog,Ready,In Progress,Blocked,Done` only if absent; GH provides default |

Persist config via project metadata or typed `.adv/github-project.json` with owner, project number, project id, and field ids.

## Repository filter auto-detect (`rq-repoFilter01`)

First-run only. Use `parseGitRemoteUrl` (`plugin/src/utils/git-remote.ts`) on `git remote get-url origin`.

| Precondition | Action |
|---|---|
| Existing config has `repository_filter` | Do NOT overwrite |
| `parseGitRemoteUrl` returns `null` | Skip |
| Parsed owner ≠ project owner | Skip; cross-owner out of scope |
| Project title matches `^ADV: ` | Skip; board already per-repo scoped |
| All preconditions pass | Write `repository_filter: <repo-name>` |

Re-runs MUST NOT mutate existing filter. Manual edits to `.adv/github-project.json` are override path.

## Source inventory

| Source | Tool | Extract |
|---|---|---|
| GH open issues | `gh issue list --state open --limit 500 --json number,title,body,labels,url,createdAt` | issues + labels |
| GH Project items | `gh project item-list <N> --owner <owner> --format json --limit 500` plus `--query "repo:<owner>/<repository_filter>"` when configured | items + fields |
| Active ADV changes | `adv_change_list status: 'in-flight'` | id, title, summary |
| ADV agenda | `adv_agenda_list` | pending + active |
| ADV wisdom | `adv_wisdom_list type: 'failure'` then `type: 'gotcha'` | snippets |
| Cross-session notes | `glob .adv/CROSS-SESSION-NOTES-*.md` + `read` | bullets/headings/action lines |
| TODO/FIXME | `lgrep_search_text query: 'TODO\\|FIXME' path: <repo-root>` filtered to source dirs | file:line + text |

Cap each source at 100 items. Sort overflow by recency and surface `(N more not shown)`.

## Kind hint heuristics

Advisory only. P33: may prefill prompts, never create issues, mutate labels, or suppress candidates without explicit confirmation.

| Source | Heuristic |
|---|---|
| `wisdom type:failure` | bug |
| `wisdom type:gotcha` | likely bug; verify body |
| `agenda` | category if present, else unknown |
| TODO/FIXME | bug if text mentions broken/fix/wrong/crash/leak, else feature |
| ADV active changes | feature for add/modify capability; bug for bugfix; else unknown |
| Notes | unknown |
