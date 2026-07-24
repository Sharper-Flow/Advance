# Executive Summary — Fix morph_edit worktree authorization (Part A)

## Outcome
Stopped sub-agents (adv-engineer / adv-designer / adv-reviewer) from waffling and failing on `morph_edit` when editing ADV per-change worktree files. The sub-agent directives previously claimed `morph_edit` could authorize edits to external worktree roots by passing `workdir`+`taskId` — but that claim was false: morph never reads ADV's authorization capability, so every worktree `morph_edit` call hit "Path is outside allowed root" and agents recovered only by falling back to `edit`/`write`. The directives now state the truth and route worktree edits to `edit`/`write`.

## Why it matters
Sub-agents wasted cycles hesitating before each `morph_edit` ("the tool signature doesn't show workdir/taskId… let's try"), then errored, then fell back — a recurring friction loop on every worktree-bound implementation task. Part A removes the false instruction and pins the corrected behavior in a regression-guard test, so the loop stops immediately.

## What was delivered (Part A — ADV-only, no runtime change)
- Rewrote the `morph_edit` directive in `.opencode/agents/adv-engineer.md`, `adv-designer.md`, `adv-reviewer.md` from the false "ADV authorizes this pair" claim to honest, forward-compatible wording: `morph_edit` confines to the session repo root; ADV-worktree edits use `edit`/`write`; fall back immediately if `morph_edit` rejects.
- Rewrote the regression-guard test (`plugin/src/adv-engineer-assets.test.ts`) from a false-wording pin to a truth guard (asserts the false claim is absent; asserts edit/write routing + fallback). TDD: RED → GREEN.
- ADV's `authorizeMorphWorktree` / `ADV_MORPH_WORKTREE_CAPABILITY` validator deliberately left unchanged — it is correct and is the foundation Part B consumes.

## Verification
- TDD cycle: RED (`tr_mrzfi5x2`, failed against the old directive as expected) → GREEN (`tr_mrzfizit`, passed after rewrite).
- Full assets suite: 26/26 green (`tr_mrzfju64`).
- Independent review: verdict READY; AC1–AC4 pass; constraints C1–C5 and avoidances DONT1–DONT4 respected.
- AC4: ADV validator + morph-wrapping block show empty diff (untouched).
- All work at commit `561d981c` on branch `change/fixMorphWorktreeAuthorization`.

## What is NOT in this change (Part B — separate follow-up)
AC5 — making the authorization mechanism actually work (morph reads the global `Symbol.for("advance.morph-worktree-capability.v1")` ADV attaches and uses `capability.root` for confinement; adds `workdir`/`taskId` to morph's tool schema) — is a **separate cross-project change** in `~/dev/opencode-morph-fast-apply`. Independent design validation confirmed the symbol survives into morph's `execute` on OpenCode 1.18.4 (same-object dispatch; zod's `safeParse` is boolean-only), so Part B is unblocked. Until Part B lands, `morph_edit` remains session-repo-only — but Part A's `edit`/`write` routing keeps every sub-agent fully functional.

## Risks / follow-ups
- Part B (morph capability read + schema) is the structural completion; create it as the next change so AC5 has a home and `morph_edit` can finally edit worktree files.
- A future OpenCode dispatch/registry change could alter same-object arg passing; Part B includes a runtime integration test to catch that.
- After Part B ships, a micro-follow-up can re-recommend `morph_edit` for worktree edits (Part A's wording is already forward-compatible, so this is optional polish).