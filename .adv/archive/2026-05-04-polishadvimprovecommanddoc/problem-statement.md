The `/adv-improve` command doc has accumulated four polish issues surfaced by audit. They do not break behavior individually, but together they make the contract less clear and the report shape inconsistent with peer commands.

### Findings

**H1 — Empty `## Output` section (line 175)**
The file ends with a bare `## Output` heading and no body. Every other command with `## Output` (proposal, design, discover, review, problem, idea, clarify) populates it with the emit template. Peer `/adv-tron` solved this differently — no heading; the report shape lives in Phase 5. The current state is half-finished.

**M1 — Phase 2 fallback contradiction (lines 75 vs 80)**
- Line 75: "use `webfetch` only if Context7 is absent from the active schema"
- Line 80 fallback: "If Context7 is unavailable → use local codebase conventions"

Two different fallbacks for the same condition without ordering. Should be: webfetch first (canonical sources still authoritative), local conventions only if both unavailable.

**M2 — Manifest `successors` is single-valued, doc suggests four**
- `manifest.ts:389` → `successors: ["adv-proposal"]`
- Phase 4 step 4 (line 107) suggests `/adv-proposal`, `/adv-task`, `/adv-audit`, `/adv-tron`

`/adv-task` and `/adv-audit` are missing from the manifest, which means `adv_status` next-step recommendations under-represent the command's real follow-up surface.

**M3 — `{year}` placeholder in Kagi queries (line 88)**
Command uses literal `{year}` token; checklist uses `{current-year}`. Agent must substitute. Inconsistency between command and checklist; risk of literal token leaking into Kagi queries on stale-prompt runs.

### Why now

The audit identified all four in one pass. Fixing them together avoids re-touching the same file four times and keeps the doc within its 182-line token budget (current: 175).