# Research Pack: Chat Output Structure for ADHD / Multi-Agent Juggling Users

- **Target:** Output text structure in chat for users, especially ADHD users or users juggling numerous changes and agents
- **Mode:** Scoped scan
- **Created:** 2026-04-28
- **Updated:** 2026-04-28

## Purpose & Scope

Captures evidence and design options for how ADV emits user-facing chat content (status markers, gate-handoff voice, context snapshot, task status report, tab title) when the human is ADHD-coded or running 3+ OpenCode tabs / agents simultaneously. Covers chat-side text only — does not cover terminal UI bell/title (already adequate), nor IDE side-panel UX, nor anything outside the existing ADV output surfaces.

Out of scope: redesigning gate semantics, sub-agent dispatch, or commands themselves. Treat as input to a possible `/adv-proposal` for `chatOutputAdhdMultiTab` (or similar).

---

## Current State

Findings cap: 5 per category. Every finding cites code/docs. Severity: CRITICAL > HIGH > MEDIUM > LOW.

### Developer Experience

**DX1 (HIGH) — `[ADV:ATTN]` conflates two distinct user-need states**

- The same marker `[ADV:ATTN]` (🟥) is emitted both when (a) the agent has finished and is idle (no action needed) and (b) the user must approve / answer a question. Self-documented in code as a known conflation.
- ADHD impact: tab-strip glance-state cannot distinguish "done, no need to come back" from "blocked on you". Users either over-check or miss approvals.
- Evidence: `plugin/src/index.ts:128-129` — `"ATTN is shown both when user explicitly needs to act (permission pending) and when the session is idle (agent finished, user should look)."` and `:132-137` `resolveStatus` returns `"ATTN"` for both `permissionPending` and `sessionIdle`.

**DX2 (HIGH) — Wayfinder block is bottom-anchored on every gate handoff**

- `command-voice-standard.md` § Gate Handoff Voice mandates: `## Problem` → `## Chosen direction` → `## Delivered` → `> blockquote wayfinder`. Action signal (which gate finished, what runs next) is the LAST element of the message.
- ADHD impact: returning to a tab after distraction requires reading down through Problem/Chosen direction/Delivered before the action prompt is found. Working-memory cost.
- Evidence: `docs/command-voice-standard.md:262-280` — "the blockquote wayfinder block is the only content after `## Delivered`. Internal state lives in ADV tools..."

**DX3 (MEDIUM) — Tab title intentionally drops progress and gate state**

- Format: `<emoji> <shortname> · <change-code>`. Test asserts no progress: `events.test.ts:658` `expect(title).not.toMatch(/\[\d+\/\d+\]/)`.
- ADHD impact: when juggling 4+ tabs, the only persistent cross-tab signal is emoji color. Cannot tell which tab is mid-`apply` vs at `acceptance` checkpoint without clicking through.
- Evidence: `plugin/src/events/terminal.ts:682-706` `buildTabTitle`; `events.test.ts:629-680` test contract; `CHANGELOG.md` records progress was intentionally removed.

**DX4 (MEDIUM) — Context snapshot box is visually heavy for "where am I" glance**

- 8-10 line box-drawing block emitted on every `adv_change_show`, `adv_gate_complete`, `adv_task_update → in_progress|done`, `adv_task_ready`, `adv_task_cancel`, `adv_task_add`, `adv_change_reenter`. Each emit is ~650 chars.
- ADHD impact: heavy artifacts repeated through scrollback dilute the signal-to-noise ratio. A compact 1-line "ticker" variant (e.g., `[trim · planning ✓→execution · 0/6]`) would be skimmable when full box would not.
- Evidence: `plugin/src/utils/context-snapshot.ts:207-293`; emitted from 7+ tools per `docs/adv-context-agreement.md:120-130`.

**DX5 (MEDIUM) — Cross-repo switch indicator is also a heavy 5-line box**

- 🔀 box-drawing block (`╔...╗`) for every workdir switch. Useful one-time signal but verbose; competes with snapshot box visually when both fire in same response.
- Evidence: `plugin/src/utils/context-snapshot.ts:312-334` `formatCrossRepoSwitch`.

### Reliability

**REL1 (MEDIUM) — `[ADV:TASK_STATUS_REPORT]` only auto-emits on apply-loop stop or session compaction**

- No on-demand "tldr the state of all my changes" report. `adv_status` returns JSON-banner format, not the box-drawing report shape designed for compaction recovery.
- ADHD impact: returning to a session after long absence forces user to remember which command produces the synthesized report — friction.
- Evidence: `docs/adv-task-report.md:5-10` (Trigger Events table); `plugin/src/tools/status.ts` (no equivalent compact report).

### Observability

**OBS1 (HIGH) — No agent-activity heartbeat during long sub-agent bursts**

- When `/adv-apply` runs many tool calls or fans out to sub-agents (e.g., review with explore × 5 + librarian + general), the user sees no chat output until the orchestration completes. `[ADV:TOOLING]` 🟨 sets the tab emoji but emits no chat content.
- ADHD impact: silent agent feels hung; user opens new chat / re-prompts thinking it stalled. OpenAI/Cursor/Claude Code surfaces tool-call summaries inline as a heartbeat (chips, collapsible blocks).
- Evidence: `plugin/src/index.ts:132-137` (`TOOLING` is terminal-only); no chat-side periodic emit found in `events/*` or `tools/*`.

**OBS2 (LOW) — No agent-identity cue when switching primary agent**

- Switching between `adv`, `build`, `plan` in OpenCode emits no chat-side marker. Users juggling agents must remember which agent owns the current chat.
- Evidence: no agent-identity surface emitted in `events/*` or `index.ts`.

### Code Quality

**CQ1 (HIGH) — "Where am I" surface is split across 3 divergent canonical forms**

- `context-snapshot` (box-drawing summary, tool-emitted) + `gate-handoff-voice` spine (Problem/Chosen/Delivered + blockquote, agent-emitted) + `task-status-report` (different box style, lifecycle-emitted). All three answer overlapping questions but in different shapes, with separate spec / doc owners.
- ADHD impact: even a power user has to learn three formats to read ADV chat output fluently.
- Evidence: `docs/command-voice-standard.md:252-378` (handoff spine), `docs/adv-context-agreement.md` (snapshot), `docs/adv-task-report.md` (task report). Three different box-drawing aesthetics in the same project.

**CQ2 (LOW) — `MIN_BOX_WIDTH = 55` magic constant with no overflow strategy**

- Long change IDs (`improverefactorbatchorderingan`) push the box wider than 80-column terminals, causing wrap on narrow tmux panes.
- Evidence: `plugin/src/utils/context-snapshot.ts:57`.

### Testing

**TEST1 (LOW) — No test asserts wayfinder is visually distinguishable from prose body**

- `handoff-footer-drift.test.ts` asserts the wayfinder is present and prose labels are absent, but does not assert any visual prominence rule (e.g., separator before, blockquote-only-after-`## Delivered`). Future drift could re-bury the signal in prose without breaking the test.
- Evidence: `plugin/src/handoff-footer-drift.test.ts` (asserts presence/absence of strings, not positional prominence).

### Security

No findings — chat output is not a security surface.

---

## LBP / Reference Comparison

Context7 not applicable for cognitive-UX accessibility domain (Context7 indexes library/framework docs, not UX research). Comparison uses local conventions + accessibility heuristics.

> [Reference: local conventions + accessibility heuristics — Context7 not applicable for cognitive UX domain]

| Area | Status | Note |
|---|---|---|
| Multi-modal status (color + symbol + text) | **SOUND** | `[ADV:WORK]` 🟩 + emoji + label. Color-blind safe via emoji + textual marker. |
| Status semantics distinct per state | **DRIFTED** | DX1 — `ATTN` overloaded. LBP: split idle vs blocked. |
| Action signal top-anchored | **DRIFTED** | DX2 — wayfinder is at bottom. LBP: critical action info should be the first thing seen on tab return. |
| Persistent cross-tab state | **DRIFTED** | DX3 — tab title is the only persistent signal but does not encode gate state. LBP: persistent context belongs in always-visible chrome (tab title, status bar). |
| Single source of truth for "where am I" | **ANTI-PATTERN** | CQ1 — three divergent forms. LBP: one canonical context display, one canonical action handoff, one canonical recovery report — but all three reuse the same primitives (gate progress glyphs, change-id format). |
| Heartbeat during long async work | **DRIFTED** | OBS1 — none on chat. LBP: emit lightweight "still working: tk-X (3/8)" every 30-60s or every N tool calls. |
| Progressive disclosure | **DRIFTED** | DX4 — heavy box always emitted. LBP: 1-line summary by default, full box on `adv_change_show` only or on first emission per session. |

### Greenfield perspective

If rebuilt today:

- **One status grammar.** Three markers max: `WORKING`, `ATTN_NEEDED`, `IDLE_DONE`. Plus `BLOCKED` and `TOOLING`. Don't reuse `ATTN` for both idle-finished and approval-blocked.
- **Top-anchored action prompt.** When the agent ends a turn at a checkpoint, render the wayfinder block as the FIRST element after the status marker, not the last. Narrative below.
- **Compact ticker by default; full snapshot on demand.** A single line `[change · gate ✓→next · tasks-done/total · current-task-or-none]` for transient updates; full box only on first session load.
- **Heartbeat.** During multi-tool bursts, emit a one-line summary every K tool calls or every T seconds: `… still working on tk-X (3/8) — 2 sub-agents in flight`.
- **Single layout for all state surfaces.** Gate-handoff, context snapshot, and task-status report share a glyph vocabulary (`✓ ○ ⏭` for gates, `🟩🟨🟥` for status) and a layout grammar (compact ticker + optional expand).

### Corrections (CRITICAL/HIGH only)

| Finding | What's wrong | What's correct | Min viable fix |
|---|---|---|---|
| DX1 | `index.ts:132-137` returns `"ATTN"` for both `permissionPending` and `sessionIdle` | Two markers: `ATTN_BLOCKED` (user-needed) vs `IDLE_DONE` (agent finished, no action) | Add `IDLE` marker to `STATUS_MARKERS` enum (`plugin/src/types.ts`); split resolver branch; update tab-title emoji map; update `[ADV:ATTN]` doc table. |
| DX2 | `command-voice-standard.md:262-280` mandates wayfinder LAST | At checkpoints, wayfinder FIRST (above `## Problem`); narrative below | Update Gate Handoff Voice spine to allow "wayfinder-first" variant for checkpoint handoffs (Tier A/B). Update `handoff-footer-drift.test.ts` to allow either position. |
| OBS1 | No chat heartbeat during sub-agent / long-tool bursts | Lightweight one-line emit every K tool calls or T seconds | Add a `heartbeat()` helper that orchestrator agents are instructed to emit during sub-agent dispatch or in long inline loops. Pure prompting (`adv.md` instruction); no plugin code change required v1. |
| CQ1 | Three divergent "where am I" formats with separate doc owners | One spec for chat-output surface that all three formats reference | New spec `chat-output-display` consolidating `context-display` + `task-status-report` rules; keep three formats but unify glyph vocabulary and emission triggers. |

---

## Competitors & Alternatives

Top-3 competitors / alternatives in the ADHD-coded developer agent space (hard cap: 3).

| Name | What they do differently | Source URL | Relevance to ADV |
|---|---|---|---|
| **Claude Code (ADHD workflow)** | Evidence-first completion, async checkpoint updates, multi-agent decomposition, "one question rule" (agent asks at most one question per response), CLAUDE.md as cached project context | https://chudi.dev/blog/claude-code-adhd-workflows | High — ADV already does evidence-first (TDD) and caching (project.md). Borrow: "one question rule" (don't surface multiple questions in one turn). |
| **Strix (ambient stateful agent)** | Persistent memory across sessions, ambient updates rather than burst output, framed as ADHD assistant | https://timkellogg.me/blog/2025/12/15/strix | Medium — ADV state is already persistent (Temporal). Borrow: "ambient" framing for heartbeat (low-frequency low-volume updates, not bursts). |
| **flux-cap CLI** | Git-aware CLI explicitly built around ADHD workflow patterns, surfaces context state inline | https://www.reddit.com/r/ADHD_Programmers/comments/1qy01ub/would_this_help_fluxcap_a_git_aware_cli_for_adhd/ | Low — git-CLI specific, not agent-protocol; useful for surface-design ideas around "where you left off" prompts. |

---

## Emerging Patterns

Hard cap: 2.

| Pattern | Why noteworthy | Maturity signal | Source |
|---|---|---|---|
| **Evidence-first completion** | Removes decision paralysis ("did it actually work?") by requiring concrete proof of functionality before agent claims done. ADV's TDD contract already implements this; emerging consensus across ADHD-coding workflows. | Multiple independent articles, 2025-2026 | https://chudi.dev/blog/claude-code-adhd-workflows |
| **One Question Rule** | Agent asks at most one question per response. Reduces cognitive load when juggling multiple agents — user knows each return is at most one decision. | Cited explicitly by Claude Code ADHD workflow; aligns with rq-autonomy01 in ADV (auto-continue between checkpoints). | https://chudi.dev/blog/claude-code-adhd-workflows |

---

## Applicability to This Repo

| Pattern | Applies? | Where |
|---|---|---|
| Evidence-first completion | **Already implemented** | TDD contract (`tdd-contract` spec), `adv_run_test`, `adv_task_evidence`. No new work needed. |
| One Question Rule | **Partial — could tighten** | `rq-autonomy01` already minimizes pauses. The `question` tool currently allows multiple option lists per call but does not formally cap "questions per turn". Worth a one-line rule in `ADV_INSTRUCTIONS.md`. |
| Async checkpoint updates / heartbeat | **Gap — OBS1** | Add prompting in `adv.md` for `/adv-apply` orchestration loops. No spec change required for v1 (pure agent behavior). |
| Persistent ambient state (Strix-style) | **Already implemented** | ADV state is Temporal-backed; `_contextSnapshot` exposes it. Improvement opportunity is compact ticker form (DX4) not architecture. |
| Two-state ATTN split | **Gap — DX1** | Code-level: split `ATTN` into `ATTN_BLOCKED` + `IDLE_DONE` in `STATUS_MARKERS`. Touches `types.ts`, `index.ts:132-137`, `events/status.ts`, `events/terminal.ts`, `ADV_INSTRUCTIONS.md` markers table. |
| Top-anchored action prompt | **Gap — DX2** | Spec/voice change in `command-voice-standard.md` + `handoff-footer-drift.test.ts`. Optional / opt-in for checkpoints (Tier A/B). |
| Tab-title gate progress | **Tradeoff — DX3** | Was intentionally removed. Could reintroduce as opt-in (config flag) for users juggling multi-tabs without breaking existing tests. |
| Three formats consolidation | **Gap — CQ1** | New `chat-output-display` spec consolidating `context-display` + `task-status-report` + the gate-handoff voice section of `advance` spec. |
| flux-cap-style git-aware "where you left off" | **Out of scope** | Git surface; ADV already covers via worktree + `_contextSnapshot`. |

---

## Open Questions for Research

Questions a future `/adv-discover` (or `/adv-research`) phase should resolve before committing to a direction:

1. **Wayfinder-first vs wayfinder-last:** Should checkpoint handoffs always render wayfinder first, or only at Tier A/B approval points? Trade-off: top-anchoring helps tab-return; bottom-anchoring preserves narrative flow when reading the message linearly. Worth a small user test or design poll.
2. **Compact ticker emission policy:** Should the 1-line ticker REPLACE the box on transient task transitions and the FULL box only emit on `adv_change_show` / first session load? Or always emit ticker, with full box on demand via a new `adv_status` flag?
3. **Heartbeat granularity:** Every N tool calls (concrete, predictable) or every T seconds (more "alive-feeling" but harder to enforce in pure-prompting)? What's the right N or T?
4. **Tab-title gate state — opt-in or default?** Reintroducing progress in tab title was a deliberate undo. If we reintroduce gate-state (different from progress), do users prefer it default-on or default-off behind `opencode.json` flag?
5. **`ATTN` split — do tools care?** Does any downstream consumer (terminal bell, IDE indicator) treat `ATTN` as one state? Audit `plugin/src/events/terminal.ts:751-760` bell logic and any external consumers before splitting.
6. **One Question Rule — enforcement?** Soft prompting in `adv.md` only, or runtime check in plugin (refuse to render multiple `question` tool calls per response)?
7. **Three-formats consolidation — backwards compat?** Existing `context-display` and `task-status-report` specs are referenced by drift tests and storage. Can they be unified without churn, or is "shared glyph vocabulary, separate specs" the correct middle ground?

---

## Sources

- `plugin/src/index.ts:120-180` — `resolveStatus` (DX1 evidence)
- `plugin/src/events/status.ts` — status state management
- `plugin/src/events/terminal.ts:682-706` — `buildTabTitle` (DX3 evidence)
- `plugin/src/events/events.test.ts:626-680` — tab-title tests (DX3 evidence)
- `plugin/src/utils/context-snapshot.ts:1-334` — context snapshot + cross-repo switch (DX4, DX5, CQ2)
- `plugin/src/utils/banner.ts` — per-tool banner format
- `plugin/src/handoff-footer-drift.test.ts` — drift contract (TEST1)
- `plugin/src/guards/task.ts:11-28` — sub-agent nesting policy
- `docs/command-voice-standard.md:252-378` — Gate Handoff Voice spine (DX2)
- `docs/command-voice-standard.md:500-700` — Inline Approval Voice
- `docs/adv-context-agreement.md` — context snapshot doc
- `docs/adv-task-report.md` — task status report (REL1)
- `.adv/specs/context-display/spec.json` — context display spec
- `.opencode/instructions/caveman.md` — global caveman style instruction
- `ADV_INSTRUCTIONS.md` — Status Markers section
- https://chudi.dev/blog/claude-code-adhd-workflows — Claude Code ADHD workflow (Evidence-first, One Question Rule)
- https://timkellogg.me/blog/2025/12/15/strix — Strix ambient stateful agent
- https://www.reddit.com/r/ADHD_Programmers/comments/1qy01ub/would_this_help_fluxcap_a_git_aware_cli_for_adhd/ — flux-cap CLI
- https://kaianew.github.io/GetMeInTheGroove.pdf — "Get Me In The Groove" academic paper on ADHD programmer work styles (background; not directly cited in findings)
- https://medium.com/@kurt.berner/managing-developers-with-adhd-what-i-wish-i-knew-sooner-51726ef5342d — ADHD context-switching cost (background)
