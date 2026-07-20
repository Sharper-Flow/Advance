# Acceptance

Reviewed at: 2026-07-19T23:27:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1** — User `build.md` and `plan.md` no longer claim the ADV_SYNC block contains routing guidance it doesn't. | pass | tk-19b76df53b08 verification: grep confirms 0 remaining 'ADV_SYNC block' references in scope. |
| SC2 | success_criterion | **SC2** — Routing preference prose remains mode-neutral; no env-var conditionals introduced. | pass | Retained mode-neutral preference prose; no env-var conditionals introduced. |
| AC1 | acceptance_criterion | **AC1** — User `~/.config/opencode/agents/build.md:161` "See the ADV_SYNC block..." clause removed or replaced with wording that doesn't claim ADV_SYNC block has routing guidance. | pass | build.md:161 'See the ADV_SYNC block...' clause dropped; replaced with bare preference prose. |
| AC2 | acceptance_criterion | **AC2** — User `~/.config/opencode/agents/plan.md:158` "See the ADV_SYNC block..." clause removed or replaced similarly. | pass | plan.md:158 'See the ADV_SYNC block...' clause dropped; retained fallback rule. |
| AC3 | acceptance_criterion | **AC3** — User `~/.config/opencode/agents/plan.md:162` "See the ADV_SYNC block..." clause removed or replaced similarly. | pass | plan.md:162 softened to 'discover them via your active tool surface:' (preserves table introduction). |
| AC4 | acceptance_criterion | **AC4** — Frontmatter (permission grants), ADV_SYNC block content, and all other body sections unchanged in both files. | pass | Section count unchanged (build: 16, plan: 19). ADV_SYNC markers preserved. Frontmatter grep clean. |
| C1 | constraint | **C1** — No advance-repo source file changes (`.opencode/agents/*.md`, `.opencode/overlays/*.overlay.md`, `plugin/*`, `scripts/*`). | respected | No advance-repo source file changes. Worktree checkpoint status:clean, sha 58bbf734. |
| C2 | constraint | **C2** — No spec deltas (pure prompt prose change). | respected | No spec deltas. Pure prompt prose change. |
| C3 | constraint | **C3** — Edits are direct filesystem writes; `~/.config/opencode/agents/*.md` are not in any git repo (consistent with fixSubAgentMcpRouting AC4 model). | respected | Edits applied directly to ~/.config/opencode/agents/build.md and plan.md via edit tool. Files not in any git repo. |
| C4 | constraint | **C4** — Functional routing behavior unchanged (still supplied by global always-on `~/.config/opencode/instructions/lgrep-tools.md`). | respected | Routing behavior unchanged. Functional routing supplied by global lgrep-tools.md always-on instruction. |
| DONT1 | avoidance | **DONT1** — No architectural centralization (OOS5 option a — centralize build/plan contract from source body to overlay — is a separate larger change). | respected | No advance-repo source file edits; no overlay file edits; no test changes. Architectural centralization (option a) not attempted. |
| DONT2 | avoidance | **DONT2** — No changes to permission frontmatter in either file. | respected | Frontmatter grep clean; permission grants in build.md and plan.md unchanged. |
| DONT3 | avoidance | **DONT3** — No changes to ADV_SYNC block content (preserve fixSubAgentMcpRouting ship state). | respected | ADV_SYNC block markers and content preserved (build.md:60/70, plan.md:37/48). |
| DONT4 | avoidance | **DONT4** — No changes to other body sections (only the cross-reference clause). | respected | Only the 3 cross-reference clauses edited. Other body sections untouched per scope. |
| DONT5 | avoidance | **DONT5** — No changes to global `lgrep-tools.md` always-on instruction. | respected | lgrep-tools.md global instruction untouched. |
| DONT6 | avoidance | **DONT6** — No changes to explore/general user files (their ADV_SYNC overlays correctly contain the contract; their cross-references are accurate). | respected | explore.md and general.md user files untouched. |

