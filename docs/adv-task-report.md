# ADV Task Status Report (Retired)

> **Status:** Retired
> **Superseded by:** [`chat-output-display`](specs/chat-output-display.md) v1.3.0
> **Change:** `consolidatechatoutputdisplay`

The doc-only "task status report" rules previously hosted here have been promoted into the `chat-output-display` spec under the unified context-snapshot / context-ticker / cross-repo-switch glyph vocabulary. There is no separate "task status report" surface anymore — task-state transitions emit the **Context Ticker** (`rq-ctxticker1`, `rq-ctxticker2`) and major state transitions emit the full **Context Snapshot** (`rq-ctxsnap1`, `rq-ctxsnap2`).

For the canonical rules, see:

- [`docs/specs/chat-output-display.md`](specs/chat-output-display.md) — markdown mirror
- [`.adv/specs/chat-output-display/spec.json`](../.adv/specs/chat-output-display/spec.json) — spec law
- `ADV_INSTRUCTIONS.md § Status Markers` — `[ADV:WORK]`, `[ADV:TOOLING]`, `[ADV:ATTN]`, `[ADV:IDLE]`, `[ADV:BLOCKED]`

This file is retained only as a redirect anchor for prior cross-references; do not add new content here.
