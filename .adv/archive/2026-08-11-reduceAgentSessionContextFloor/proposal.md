# Proposal: Reduce agent session context floor

## Why

Every ADV agent session — primary and every spawned sub-agent — eagerly loads a **76,565-byte (~19.1k token) instruction floor** before any work begins.

OpenCode's instruction loader takes no agent parameter (`packages/opencode/src/session/instruction.ts`; `session/prompt.ts:1257-1267`), and `tool/task.ts` re-runs the same prompt assembly for every spawned session. The floor is therefore **re-paid per sub-agent**: a 3-worker apply phase costs ~306 KB / ~76k tokens of fixed instruction context across the session tree before a single file is read.

The cost is badly distributed. For `adv-ci-waiter` the floor is 94% of its entire prompt, and nearly all of it is structurally inapplicable — that agent denies `edit`, `morph_edit`, `task`, and all `adv_*` tools, yet receives `morph-tools.md`, `lgrep-tools.md`, and the full P04/P23/P24/P29/P41 rule set.

The floor is also **unmeasured**. `.opencode/token-budgets.json` budgets per-command line counts — the lazily-loaded, load-once surface — and has no entry for `instructions[]`, agent manifests, or the skill catalog. The eager, sub-agent-multiplied surface drifts silently.

This is a direct extension of the prose-load reduction capability already owned by the `advance-meta` spec (instruction-surface enforcement-class compression, `manifest-doc-drift.test.ts` structural assertions). That work compressed prose *within* surfaces; this work reduces *how much surface loads eagerly at all*.

### Measured baseline

| Source | Bytes | ≈ tokens |
|---|---:|---:|
| `~/.config/opencode/AGENTS.md` | 4,821 | 1.2k |
| `/home/jon/dev/advance/AGENTS.md` | 5,749 | 1.4k |
| `instructions[]` × 8 files | 48,345 | 12.1k |
| Skill catalog (40 skills, name+description+location) | 17,650 | 4.4k |
| **Fixed floor** | **76,565** | **≈19.1k** |

`instructions[]` composition: `rules.yaml` 18,905 · `trunk-worktree-isolation.md` 6,256 · `git-freshness.md` 5,531 · `adv-tools.md` 4,231 · `oc-ci-wait.md` 3,899 · `lgrep-tools.md` 3,611 · `morph-tools.md` 3,444 · `oc-test-gate.md` 2,468.

Floor as share of total prompt: `adv` 71% · `adv-designer` 73% · `adv-reviewer` 74% · `adv-engineer` 79% · `adv-researcher` 84% · `adv-verifier` 89% · `adv-ci-waiter` 94%.

## What Changes

Six workstreams, ordered by risk (lowest first):

1. **Delete duplicated agent-manifest sections** (≈11.8 KB). `## Local Code Exploration Priority` appears in 5 manifests, `## Editing Tool Priority` in 4, `## ADV State Access Policy` in 6 — restating content that `lgrep-tools.md` / `morph-tools.md` / the generated `ADV_SYNC` overlay already load always-on. Per-manifest: `adv-reviewer` 2,600 B · `adv-engineer` 2,172 · `build` 2,040 · `adv-designer` 2,012 · `adv` 1,412 · `adv-researcher` 1,236 · `plan` 341.

2. **Add a measured prompt-floor budget check.** Extend `.opencode/token-budgets.json` beyond per-command line baselines to a byte budget over the eager floor (global `AGENTS.md`, project `AGENTS.md`, each `instructions[]` entry, each agent manifest, skill catalog), enforced by a new `plugin/scripts/check-*.ts` wired into `pnpm run check`. Structural gate, not prose guidance.

3. **Gate the irrelevant skill catalog.** 11 Cloudflare/Workers skills from `~/.claude/skills` (5,189 B) load into every session of a repo with no Cloudflare surface. Gate via per-agent `permission.skill` deny globs — verified supported (`Skill.available(agent)` → `Permission.evaluate("skill", name, agent.permission)` in `skill/index.ts`).

4. **Convert runbook instructions to routing stub + lazy skill body** (conservative depth). `trunk-worktree-isolation.md`, `git-freshness.md`, `oc-ci-wait.md`, `oc-test-gate.md` = 18,154 B, 23.7% of the floor. Demote only recipes, tier matrices, fallback shell snippets, and anti-pattern lists. Every routing trigger stays always-on. Skill bodies are verified lazy — `SystemPrompt.skills()` renders name/description/location only.

5. **Split `rules.yaml`** (18,905 B, 24.7% of the floor) into a compact always-on core carrying every rule's enforcement statement, plus long-form `scope:` / rationale prose in a lazy skill body. No rule is removed; only its explanatory prose is demoted.

6. **Move lifecycle-moment templates out of `adv.md`** (30,798 B). `## Sign-Off Boundary` (L220) embeds the full `## Change Report` skeleton (L225-245) and `## Output Contract` (L323) embeds the handoff template. These are needed at one moment but cost bytes in every `adv` turn. Relocate to `.opencode/command/adv-archive.md` — command bodies load lazily on invocation.

**Incidental, folded in:** `adv-tools.md` is the only `instructions[]` file absent from the `~/toolbox/backups/dotfiles/opencode/instructions/` mirror (7 of 8 present). Back it up as part of the config-home sync.

## User Outcomes

- Sub-agent-heavy phases leave materially more context window for actual work, instead of spending it re-reading policy that does not apply to the worker.
- Agents receive guidance that matches what they can actually do — a CI poller stops being handed editing and refactoring rules it cannot act on.
- No behavior currently enforced by an instruction stops being enforced. Nothing is deleted; content is either duplicated-and-removed or demoted to on-demand retrieval.
- Context growth becomes visible and gated, so the floor cannot silently creep back up.
- Config-home instruction state stays fully mirrored to its git-tracked backup.

## Affected Code

**advance repo:**
- `.opencode/agents/*.md` — duplicated-section removal, `permission.skill` deny globs
- `.opencode/agents/adv.md` — template relocation (audit-gated; see Research Validation F1)
- `.opencode/command/adv-archive.md` — template destination
- `.opencode/token-budgets.json` — budget schema extension (or replacement; see Research Validation F6)
- `plugin/scripts/` — new budget check (pattern: `check-frontmatter.ts`, `check-test-isolation.ts`)
- `plugin/package.json` — wire check into `pnpm run check`
- `plugin/src/manifest-doc-drift.test.ts` — extend structural assertions (existing `advance-meta` precedent)
- `plugin/src/tool-role-policy.ts` + `scripts/generate-agent-manifests.ts` — only if skill gating becomes generated rather than hand-written
- `skills/adv-*/SKILL.md` — new skill bodies (`deploy-local.sh:29` deploys `adv-`prefixed skills only)
- `.adv/specs/advance-meta/spec.json` — new requirement(s) for eager-floor budgeting

**config home (`~/.config/opencode/`, not git-tracked):**
- `instructions/trunk-worktree-isolation.md`, `git-freshness.md`, `oc-ci-wait.md`, `oc-test-gate.md`, `rules.yaml` — stub reduction
- `opencode.jsonc` — `instructions[]` array if entries change
- `AGENTS.md` — only if duplication is found against project `AGENTS.md`

**backup mirror:**
- `~/toolbox/backups/dotfiles/opencode/` — sync per global AGENTS.md rule; add missing `adv-tools.md`

## Related Repositories

`project.json` has no `product` block, so no `scope_repos` linking applies.

The change nonetheless spans two homes by the user's explicit Phase 1 decision (*"One change, both homes"*). Discovery established that the config home is **not** a git repo but is mirrored in `~/toolbox/backups/dotfiles/opencode/`, and that **toolbox is itself an ADV project** (`~/toolbox/.adv`, `gate_enforcement: strict`, `worktree_guard_enforce: true`).

This means a cross-project ADV change in toolbox is *available* as an alternative execution route for workstreams 4–5, with full worktree isolation. Discovery should decide between: (a) this change edits `~/.config/opencode/` directly and syncs the mirror as a deliverable, or (b) this change owns repo-side work and links a cross-project change in toolbox via `target_path`. The user's stated intent is a single coherent outcome; the routing question is mechanical.

## Constraints

- **No native per-agent instruction scoping exists.** Upstream `#10688` (`agent.<name>.instructions`) is open with an unmerged PR. Do not block on it. The only levers available today are: shrink the shared floor, demote to lazy skill bodies, and gate the skill catalog per agent.
- **Conservative reduction depth** (user-selected). Only pure recipes, matrices, and rationale prose may be demoted. Every routing trigger and every behavior-gating rule stays always-on.
- **Repo-owned skills must be `adv-`prefixed** — `deploy-local.sh` mirrors `skills/adv-*/SKILL.md` only.
- **Skill catalog entries remain eager and re-render every turn** (`prompt.ts` runLoop, no memoization — see Research Validation F2). Demoting to a skill trades body bytes for a catalog entry paid per turn; net win requires the body to substantially exceed its description. Upstream `#20647` documents catalog bloat at scale — do not create many small skills.
- **Trunk write firewall is active.** All repo edits must run from an ADV worktree. Config-home edits fall outside git entirely and need an explicit handling decision.
- **Deploy comes from merged trunk**, never a worktree (`scripts/deploy-local.sh`).
- `ADV_INSTRUCTIONS.md` must stay out of global `instructions[]` — already hard-asserted at `deploy-local.sh:792-799`. Do not regress it.
- **Agent manifests are load-bearing** (see Research Validation F1): an agent's `prompt` field REPLACES the stock provider system prompt. Trimming any manifest requires a prior audit classifying load-bearing baseline framing vs redundant content. Do not assume the stock prompt backstops cuts.

## Impact

**Expected reduction (conservative):** `instructions[]` 48.3 KB → ~22 KB; manifest duplication −11.8 KB; skill catalog −5.2 KB; `adv.md` −2 to −4 KB (audit-gated). Floor ~76.6 KB → ~45 KB, multiplied by sub-agent count and paid every model turn.

**Risk:** demoted content is only received if an agent invokes the skill. Conservative depth plus retained routing triggers is the mitigation; the budget check makes any over-trim visible in review rather than at runtime.

**Blast radius:** every agent session in every repo on this machine, since `instructions[]` and the skill catalog are global. Workstreams 4–5 are not advance-repo-local.

## Context

Sourced from the `/adv-improve` scan of 2026-08-11 (research pack blocked from `docs/agent-session-context-prep.md` by the trunk firewall; findings preserved in the session report). Upstream mechanics independently verified by `adv-researcher` against `sst/opencode@d041eee` source plus issues #4483, #10688, #18037, #20647, #34721, #7269.

The **tool surface** half of the original target was assessed `SOUND` and is deliberately excluded: `tool-role-policy.ts` already tiers to 11 mutation + 8 read at top level, `tools:` frontmatter is generated from `AGENT_TOOL_POLICY` and checked, per-agent default-deny works (`adv-ci-waiter`: `adv_*: false`), and Code Mode already collapses 8 MCP namespaces behind `execute`. Little headroom remains there; the instruction floor is the lever.

## Scope

### In Scope

- Deleting duplicated sections from `.opencode/agents/*.md` (`Local Code Exploration Priority`, `Editing Tool Priority` — proven safe; `ADV State Access Policy` — only after canonical promotion per Research Validation F7)
- A measured, checked byte **and count** budget over the eager per-session floor (count primary per Research Validation F4)
- Per-agent `permission.skill` gating of structurally irrelevant skills
- Conservative routing-stub + lazy-skill-body split of the four runbook instruction files
- Conservative core/rationale split of `rules.yaml` (single-file truncation; 81% of `scope`+`rule` payload recoverable per Research Validation F5)
- Relocating lifecycle-moment templates from `adv.md` to `.opencode/command/adv-archive.md` (audit-gated per F1)
- New `adv-`prefixed skills carrying demoted bodies (few, large — not many small)
- `advance-meta` spec requirement(s) codifying the eager-floor budget and the orthogonal `load-class` axis
- Syncing config-home changes to `~/toolbox/backups/dotfiles/opencode/`, including the missing `adv-tools.md`
- Deleting or repurposing the dead `.opencode/token-budgets.json` (zero live consumers per Research Validation F6)

### Out of Scope

- Further ADV tool-surface trimming — assessed `SOUND`
- Waiting on or implementing against upstream `#10688` per-agent `instructions`
- `OPENCODE_DISABLE_PROJECT_CONFIG=1`
- Model routing and fallback configuration
- Third-party lazy-skill plugins (`@zenobius/opencode-skillful`)
- Rewriting `ADV_INSTRUCTIONS.md` (105 KB) — already correctly excluded from global `instructions[]`
- Reducing `.opencode/command/*.md` — lazily loaded, already line-budgeted
- Changes to any repo other than advance and the toolbox backup mirror
- Per-agent prompt scoping via host loader change — named follow-up (removes the 94%-inapplicable floor structurally; tracked, not done here)

### Must Not

- Must not delete or weaken any rule, guardrail, safety warning, or enforcement — only relocate explanatory prose
- Must not remove a routing trigger from the always-on surface; a trigger without its recipe is recoverable, a recipe without its trigger is not
- Must not register `ADV_INSTRUCTIONS.md` in global `instructions[]` (`deploy-local.sh:792-799`)
- Must not write repo changes from the trunk checkout — worktree only
- Must not deploy or rebuild from a worktree — merged trunk only
- Must not hand-edit generated agent `tools:` frontmatter; change `AGENT_TOOL_POLICY` and regenerate
- Must not create a large number of small skills to chase byte reduction — catalog entries are eager and per-turn (`#20647`)
- Must not treat byte reduction as the success measure at the expense of retained behavior or instruction count
- Must not edit deployed artifacts under `~/.local/share/Advance/` directly
- Must not trim an agent manifest body without first auditing it for load-bearing baseline framing (Research Validation F1 — the body REPLACES the stock provider prompt)
- Must not delete `## ADV State Access Policy` from manifests before a merged canonical version is promoted (Research Validation F7 — no canonical source exists today)

## Discovery Agenda

1. ~~Which `rules.yaml` P-rules demonstrably change agent behavior versus being unenforceable prose?~~ **Resolved (Research Validation F5):** 1 ENFORCED (P32), 5 REFERENCED (P33/P35/P37/P40/P41), 19 PROSE-ONLY. Split line confirmed.
2. ~~Does an agent's `prompt` field replace or append to the stock provider prompt?~~ **Resolved (F1):** REPLACES. Manifests are load-bearing; workstream 6 is audit-gated.
3. What is the true per-agent tool-schema token cost? Only a proxy exists (117 description strings, 22,519 B, in `dist/index.js`). Needed to confirm the instruction floor really is the dominant lever. **Still open.**
4. Have any of the 11 Cloudflare skills ever fired in this repo's session history? Session-log evidence would make workstream 3 zero-risk. **Still open — but F3 already establishes zero behavioral risk regardless.**
5. ~~Does OpenCode V2's durable-delta instruction model change every-session merge semantics?~~ **Resolved (F9):** yes — `instructions[]` arrays no longer merge; highest-precedence config's entire array wins. Medium migration risk; Q1–Q3 levers valid under both V1 and V2.
6. Execution routing for the config home: direct edit + mirror sync, versus a linked cross-project ADV change in toolbox (`target_path`) with full worktree isolation. **Still open — discovery decision.**
7. ~~Is the skill-catalog eager cost better measured as rendered block bytes than as frontmatter bytes?~~ **Resolved (F2):** yes — rendered per turn; cost = name+description+location+~90 B XML wrapper per skill per turn.
8. Where should the budget check live — a new `plugin/scripts/check-*.ts`, or an extension of the existing `manifest-doc-drift.test.ts` structural assertions? **Still open — discovery decision (pattern confirmed: standalone `check-*.ts` wired into `pnpm run check`).**

## Research Validation

**Verdict: CAUTION (advisory-only; non-blocking).** Architecture health: `DRIFTED`. Three workstreams materially changed; one proposal assumption invalidated.

**F1 — Agent `prompt` REPLACES the stock provider system prompt.**
Evidence: `sst/opencode@d041eee` `session/llm/request.ts:51-57` — `...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model))` is an exclusive OR. Every configured `.opencode/agents/*.md` agent runs WITHOUT the stock Anthropic/GPT baseline; the manifest IS the baseline. Only the default `build` agent (no `prompt` field) uses the stock prompt.
**Impact on proposal:** workstream 6 (`adv.md` template relocation) and any manifest trimming are audit-gated, not safe-by-default. Discovery must produce a per-manifest load-bearing audit before trimming.

**F2 — The floor is per-TURN, not per-session.**
Evidence: `session/prompt.ts` runLoop (~L1230-1245) rebuilds the entire system block inside `while(true)` with no memoization. Provider prompt-caching may cut billed tokens on cache hits but not window consumption on miss.
**Impact on proposal:** cost framing was understated. Every figure in the measured baseline is a per-turn cost.

**F3 — `permission.skill` removes entries at RENDER time.**
Evidence: `skill/index.ts` `Skill.available(agent)` filters via `Permission.evaluate("skill", name, agent.permission)` before `fmt()`. Denied skills vanish from `<available_skills>`. Glob syntax confirmed (`core/util/wildcard.ts:3-15`; `*`→`.*`, anchored dotall; last-matching-rule wins). Working frontmatter example verified against `adv-ci-waiter.md`.
**Impact on proposal:** workstream 3 is zero-risk and highest-value. Confirmed eager-removal, not just call-time block.

**F4 — Instruction COUNT dominates bytes.**
Evidence: perfect-response collapses to zero at N=80 rules regardless of format/placement ([arXiv 2607.19257](https://arxiv.org/html/2607.19257)); follow-rate falls ~96%→~20% non-linearly via pairwise conflicts, tested including Claude Sonnet 4.6 ([arXiv 2608.02639](https://arxiv.org/html/2608.02639)); U-shaped positional attention puts a 19k-token floor in the worst position ([Lost in the Middle, TACL 2024](https://aclanthology.org/2024.tacl-1.9/)). Anthropic's own guidance: longer `CLAUDE.md` ⇒ reduced adherence.
**Impact on proposal:** workstream 2 expands from a byte budget to a byte **and count** budget, count primary (user-confirmed). A byte-only gate would miss the bigger documented lever.

**F5 — Rule enforcement mapping (24 rules).**
Evidence: local audit of `plugin/src/`, `plugin/scripts/`, `.adv/specs/`, `.opencode/`, `scripts/`.
- **ENFORCED (1):** P32 — `plugin/src/tools/trunk-write-firewall.ts:282,293,320` + `worktree-isolation-guard.ts` (refusal on violation)
- **REFERENCED (5):** P33 (extensive prose + structural typed-schema ownership, no violation-asserting test), P35/P40/P41 (`setup-rules.test.ts` asserts SETUP.md publication fidelity only), P37 (operational protocol owned by `adv-ci-waiter` sub-agent)
- **PROSE-ONLY (19):** P04, P05, P07, P08, P16, P19, P23, P24, P25, P26, P27, P29, P30, P31, P34, P36, P38, P39, and P26/P28-equivalents
- `scope`+`rule` payload = 13,771 B; **81% (11,069 B) recoverable** by keeping only each rule's first sentence (the enforcement statement) and demoting `scope:` + remaining prose.
**Impact on proposal:** workstream 5 confirmed viable at conservative depth. Single-file truncation preferred over splitting into two files (no file-count growth).

**F6 — `.opencode/token-budgets.json` is dead config.**
Evidence: zero live `.ts` consumers in the active source tree. The only reader (`adv-skill-backed-commands-assets.test.ts`, `COMMAND_BASELINES`) was deleted in a prior change; remaining references are immutable archive prose.
**Impact on proposal:** workstream 2 does not extend a working system — it revives or replaces dead config. Delete the dead file and define a fresh budget, or repurpose it.

**F7 — `## ADV State Access Policy` has no canonical source.**
Evidence: not in any of the 5 overlay files; `prompt-corpus.ts:31-35` exposes only `MCP_ACTIVE_SURFACE_CONTRACT`; no `instructions/` file covers ADV state paths. 4 of 6 manifest copies (build/engineer/reviewer/designer) share a byte-identical NEVER block; `adv-reviewer` carries 3 unique table rows (wisdom/spec/gate); `adv-researcher` has a materially different forbidden-tool list and table.
**Impact on proposal:** the `Local Code Exploration Priority` (5 files) and `Editing Tool Priority` (4 files) duplicates are proven strict subsets of always-on `lgrep-tools.md:41-48` / `morph-tools.md:18-26` (including the two divergent sentences, covered verbatim by `lgrep-tools.md:58-59`) — **safe to delete**. `ADV State Access Policy` is **not safe to delete naively** — discovery must first promote a merged canonical version (incorporating the reviewer's 3 extra rows and the researcher's distinct surface) to a new always-on instruction or an `adv.overlay.md` `ADV_SYNC` block.

**F8 — Reference decision rule (eager vs lazy).**
Evidence: cross-system consensus (Claude Code, Cursor, Copilot, Aider) on the same axis — fact/trigger → eager; procedure/recipe → lazy. Anthropic 3-level progressive disclosure: L1 metadata (~50-100 tok, name+description) eager, L2 body (<500 lines) on-trigger, L3 bundled on-reference. Stated rule: metadata carries the WHEN, never the WHAT.
**Impact on proposal:** conservative depth chosen by the user is exactly the evidence-recommended pattern. The split composes with the existing `advance-meta` enforcement-class taxonomy as an orthogonal `load-class` axis — reuses, does not replace.

**F9 — OpenCode V2 changes `instructions[]` merge semantics.**
Evidence: https://opencode.ai/v2/docs/instructions — durable-delta model; "the highest-precedence, closest config's entire array is selected; arrays are not merged." Sub-agent inheritance and skill-body laziness not contradicted by V2 docs but not explicitly confirmed from the docs page alone.
**Impact on proposal:** Q1–Q3 levers valid under both V1 and V2. Medium migration risk on the no-merge arrays rule — `deploy-local.sh:792-799` already structurally avoids putting `ADV_INSTRUCTIONS.md` in global `instructions[]`, which partially mitigates. Do not block on V2.

**Simplifications adopted:**
- Single-file `rules.yaml` truncation over two-file split (no file-count growth; 81% recovery).
- Delete dead `token-budgets.json`, define fresh budget inline.
- Hand-write per-agent skill deny lists first; generate only if drift recurs.

**Named follow-up (out of scope here):** per-agent prompt scoping via host loader change — removes the 94%-inapplicable `adv-ci-waiter` floor structurally. The upstream-broken loader is the root cause; this change mitigates, that follow-up resolves.

**Confidence:** high on F1–F3, F5, F6, F7, F8 (upstream source file:line + local audit). Low on V2 sub-agent inheritance and the exact local before/after token delta (directional until measured).