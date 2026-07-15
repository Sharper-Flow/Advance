# Archive: Consolidate ADV tool surface

**Change ID:** consolidateAdvToolSurface2
**Archived:** 2026-07-15T15:54:33.015Z
**Created:** 2026-07-15T04:06:57.606Z

## Tasks Completed

- ✅ Build public tool inventory and parity guards
  > Task checkpoint completed
- ✅ Consolidate backlog reads into roadmap
  > Task checkpoint completed
- ✅ Fold project wisdom into wisdom list
  > Task checkpoint completed
- ✅ Delete latent tool implementations
  > Task checkpoint completed
- ✅ Enforce strict agent tool roles
  > Task checkpoint completed
- ✅ Purge removed-tool references and document replacements
  > Task checkpoint completed
- ✅ Verify consolidated tool surface
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Deriving a canonical name list from group exports changes iteration order. Before landing, grep for order-sensitive consumers (`toEqual` on the list) and decouple them to sorted set comparison — preserves the guard's pinning power without coupling to cosmetic group order. Also: in a shared change worktree with parallel tasks, check `git status` + file mtimes before assuming a sibling's contracted edit has landed.
- **[gotcha]** In this repo, `pnpm test -- <files>` does NOT reliably filter vitest files (full suite ran, ~180s). Use `pnpm exec vitest run <files>` for targeted runs (5s) or `bin/oc-test targeted -- <files>`. Also: bumping `.adv/specs/<cap>/spec.json` version/updated_at requires mirroring the `> **Version:**` / `> **Updated:**` header in `docs/specs/<cap>.md` (deploy-local.test.ts enforces sync) and updating exact-version pins (ops-follow-up-assets.test.ts pins backlog-coordination via toBe despite "at least" in the test name).
- **[gotcha]** OpenCode v1.17.20 agent `tools:` frontmatter is converted to permission rules in document order with last-match-wins semantics (packages/core/src/v1/config/agent.ts normalize() → packages/opencode/src/permission/index.ts fromConfig/disabled/evaluate). Consequences: (1) unspecified tools inherit default-ALLOW, so an agent manifest that omits an adv_* tool effectively grants it — strict role scoping requires either full enumeration or an `adv_*: false` wildcard placed BEFORE specific `adv_x: true` entries; (2) `write/edit/patch` keys collapse into the `edit` permission, everything else keys by tool name with Wildcard.match. Verify against tag source (raw.githubusercontent.com/sst/opencode/v1.17.20/...) — default-branch docs describe newer versions. Also: several shipped agent manifests had 3-space-indented adv entries (`   adv_gate_complete: false`) which are YAML-tolerated but evade tests parsing `^\s{2}` — normalize to 2-space when touching those blocks.
