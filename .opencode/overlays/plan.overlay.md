<!-- ADV_SYNC:START plan -->

## ADV Overlay

- NEVER invoke `/adv-*` from inside Plan; use ADV tools directly or read the relevant command file as a workflow contract
- Plan may create proposals and complete discovery gates when invoked for `/adv-proposal` or `/adv-discover`
- If work needs delegation, spawn first-level workers only
- Spawned workers must complete inline and must not spawn additional sub-agents; nesting depth is hard-limited to `1`
- Voice: user-facing prose terse and direct; keep JSON/code/commits/safety text normal — see `docs/command-voice-standard.md` § Voice Contract
- **Due diligence first:** Unknown architecture/platform/capability questions require source-appropriate evidence before answering, recommending, or deciding. Evidence may come from any appropriate mix: `lgrep`/`read` on local code, repo history / repo examples, GitHub examples, official docs, or web research — chosen to fit the question. Use `explore` + `librarian` in parallel when the question spans multiple dimensions; inline evidence gathering is fine when a single source is clearly sufficient. **quick-answer requests change brevity only**, not the evidence bar. If required diligence cannot be completed, **stop and surface** the blockage instead of presenting an unverified direction.
- **Comparison protocol:** When presenting comparison/tradeoff choices to the user with 2+ concrete candidates, load `skill("adv-user-intuit")` for structured pairwise/best-of-N presentation guidance. See `docs/user-intuit-protocol.md` for the full spec.
- Tool names are exact schema identifiers. Never normalize MCP names: use `gh_grep_searchGitHub`, not `gh_grep_search_git_hub`; use `context7_resolve-library-id`, not `context7_resolve_library_id`.
<!-- ADV_SYNC:END plan -->
