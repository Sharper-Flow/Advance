## Problem

ADV users have no single command that reconciles every backlog source into a prioritized work queue. Backlog signal lives in many places — GitHub Issues, ADV agenda, ADV wisdom (failure/gotcha entries), `.adv/CROSS-SESSION-NOTES-*.md` files, TODO/FIXME comments, active ADV changes (including drafts) — and no mechanism guarantees that any given item is represented in the others, scored, or visible in a shared priority order.

The gap shows up as:

- **Drift between backlog sources** — a TODO in source code, a wisdom failure entry, and a CROSS-SESSION note can describe the same issue without any cross-link, so the same problem gets re-discovered or worked twice.
- **No prioritization mechanism** — ADV had no formal way to rank features. Bugs had `priority:*` labels but no consolidated view.
- **No durable roadmap artifact** — there was no git-tracked file answering "what are we working on next, and why".
- **Hidden assignments** — RROE / Time Criticality / Effort estimation never happens because there is no command that prompts for it. Without those numbers, WSJF cannot be computed.
- **Missing GH coverage** — items captured locally never surface to collaborators who only see GitHub.

The command must:

1. Gather every backlog source listed above.
2. Identify items not yet represented by an open GH issue and (with approval) create them.
3. Pause for user-only assignments — `priority:*` for bugs and `Value` for features — because these are pure judgment calls.
4. Assess agent-fillable dimensions — RROE, Time Criticality, Effort — and compute WSJF for every feature.
5. Use WSJF to produce a unified priority order: bugs first by tier, features second by WSJF descending.
6. Regenerate `ROADMAP.md` at repo root and commit it to the default branch so the artifact lives in git.
7. Deprecate local sources after promotion so the same item does not re-trigger on the next run.

## Users

- ADV operators (humans) who need confidence the agent is working on the highest-value next thing.
- ADV agents (`adv-claude`, `adv-gpt`, etc.) that consume `ROADMAP.md` as the canonical "what's next" reference between sessions.
- Project collaborators on GitHub who only see issues and Projects v2 boards — for them, ADV's local-only signal becomes invisible until triage.

## Constraints

- **Storage of truth**: GitHub Projects v2 board with typed NUMBER fields (`Value`, `TimeCriticality`, `RROE`, `Effort`, `WSJF`) and SINGLE_SELECT fields (`ADV Type`, `Priority`). `ROADMAP.md` is a generated mirror, not a parallel store.
- **WSJF formula**: full SAFe — `(Value + TimeCriticality + RROE) / Effort`. Modified Fibonacci 1-13 anchors per dimension.
- **Bug ranking**: existing `priority:{critical,high,medium,low}` labels only — no WSJF for bugs.
- **HITL mode**: hybrid — agent autonomously assigns RROE/TC/Effort, user assigns Priority (bugs) and Value (features). Tier B inline approval required before opening GH issues, before writing/pushing `ROADMAP.md`, and before deprecating local sources.
- **GitHub auth**: token must be user-global with scopes `repo`, `project`, `read:org`, `workflow`. ADV refuses to run if any required scope is missing.
- **Trunk-is-prod alignment (P32)**: `ROADMAP.md` is the only file the command commits, the commit runs on the default branch only, and the working tree must be clean except for `ROADMAP.md` before the commit.

## Acceptance Criteria

The command is acceptable when, on a representative repo:

1. A single `/adv-triage` invocation enumerates and reconciles all six backlog sources (GH issues, ADV agenda, wisdom failure+gotcha, `.adv/CROSS-SESSION-NOTES-*.md`, TODO/FIXME comments, active changes).
2. The first run on a new repo bootstraps the GitHub Projects v2 board, links it to the repo, creates the seven required custom fields, and persists the project metadata via `adv_project_metadata`. Subsequent runs reuse the stored project number.
3. Items not represented by an open GH issue surface in a single Tier B inline approval prompt with `kind_hint` (bug vs feature). Approved items become real GH issues with the source trailer (`Promoted by /adv-triage from {source}: {ref}`) preserved in the body and added to the project board.
4. Every open feature ends the run with non-null `Value`, `TimeCriticality`, `RROE`, `Effort`, and `WSJF` fields. Every open bug ends the run with one of the `priority:*` labels. Items the user explicitly defers are excluded and surfaced under "deferred / unscored" — never silently dropped.
5. Agent-assigned dimensions carry an evidence trailer in the issue body (`<!-- adv-triage:scoring v1 ... -->`) with the rubric anchor, computed WSJF, and timestamp.
6. `ROADMAP.md` is generated at repo root with two sections — bugs by priority tier, features by WSJF descending — plus a deprecation log and run summary. The file regenerates deterministically from the project board.
7. The roadmap commit is atomic: only `ROADMAP.md` is staged, the commit runs on the default branch, the message is `chore(roadmap): /adv-triage update <YYYY-MM-DD>`, and `git pull --rebase --autostash` precedes the push. If the working tree is dirty with anything other than `ROADMAP.md`, the commit aborts with the offending paths listed.
8. Local sources are deprecated after promotion, with explicit per-source actions: TODOs become `// see #N`, agenda items get `adv_agenda_complete`, note lines get markdown strikethrough, wisdom entries get an annotation (append-only — wisdom is never deleted).
9. Tier B replies are parsed by whitelist + regex only, with no LLM fallback. Anything outside the approved list re-prompts unchanged.
10. The command refuses to run if `gh auth status` is missing any required scope, or the GitHub remote is unreachable, or the token cannot create a project under the resolved owner.

## Out of Scope

- Per-PR or per-commit review prioritization.
- Sprint/iteration planning, milestones, or release dates.
- Bug WSJF scoring — bugs use `priority:*` labels only.
- Auto-creating GH issues without explicit Tier B approval.
- Multi-repo single-project rollups (one project = one repo for v1; cross-repo aggregation is a future change).
- Closing GH issues or active ADV changes (out of scope; `/adv-cleanup` handles change closure).
- Re-running scoring on every triage run by default — the command only fills missing fields unless `--rescore` is set.
- Modifying `priority:*` labels on bugs that already carry one (no automatic re-triage; explicit `--rescore` forces reassessment in a future iteration).
- Auto-deploying anything off the back of the roadmap — ADV stops at push, deploy is a separate human-initiated step (per existing ADV gate model).
