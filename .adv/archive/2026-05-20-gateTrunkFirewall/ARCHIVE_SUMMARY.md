# Archive: Gate trunk firewall

**Change ID:** gateTrunkFirewall
**Archived:** 2026-05-20T05:38:23.002Z
**Created:** 2026-05-20T03:59:31.213Z

## Tasks Completed

- ✅ Update trunk firewall spec law for opt-in enforcement
  > Added plugin/src/trunk-write-firewall-spec-assets.test.ts to enforce rq-twf01 opt-in wording. Updated .adv/specs/advance-meta/spec.json so flag omitted/false allows trunk file/destructive bash writes, while strict true blocks and preserves exceptions.
- ✅ Add typed effective worktree guard feature default
  > Added worktree_guard_enforce: false to FeatureFlagsSchema, exported withStabilityFeatureDefaults from types, moved status feature defaulting to the shared helper, and added src/types/project.test.ts coverage for default/preserved values.
- ✅ Gate trunk write firewall in tool execution hook
  > Imported loadProjectConfig and withStabilityFeatureDefaults into plugin init, computed trunkWriteFirewallEnforced once near initialization, skipped file/bash firewall checks when false, and fail-closed on config read/parse errors. Updated integration tests to cover omitted flag allowance, true flag blocking, strict worktree exception, and malformed config.
- ✅ Opt Advance repo into strict worktree enforcement
  > Added project.json features.worktree_guard_enforce: true so the Advance repo preserves strict trunk/default checkout blocking. Added trunk-write-firewall spec asset coverage that parses root project.json and requires the opt-in flag to remain true.
- ✅ Update strict-mode docs and instruction surfaces
  > Updated ADV_INSTRUCTIONS, docs/worktree-guide.md, and docs/temporal-recovery.md to explain that trunk write firewall enforcement is opt-in through worktree_guard_enforce, that omitted/false allows default-checkout file and classified destructive bash writes, and that strict mode is explicit. Added docs asset tests with whitespace-normalized phrase checks for the opt-in markers and Advance repo strict-mode anchor.
- ✅ Run final verification for trunk firewall opt-in policy
  > Hardened trunk firewall and release docs after scanner findings. Git root detection now fails closed for protected checkout paths, repoState not_git blocks protected checkout writes, redirect parsing handles quoted/no-space targets, integration tests cover edit/morph_edit and explicit false, store init asserts worktree_guard_enforce false, specs use features.worktree_guard_enforce, and reload docs require build before OpenCode restart.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For spec-law changes with no existing drift assertion, add a narrow asset test that reads `.adv/specs/*/spec.json` directly from repo source and asserts the requirement wording/scenario anchors before editing the spec. This gives a concrete RED for prose/spec contract updates.
- **[gotcha]** Feature flags that start as passthrough config can still be live policy. Once a flag controls hook behavior, add it to `FeatureFlagsSchema` and export a shared effective-default helper so `adv_status` and runtime hooks cannot drift via duplicate ad-hoc defaulting.
- **[gotcha]** For hook-level safety flags, compute the effective policy once at plugin initialization rather than inside every tool call. For malformed/unreadable project config, fail closed for safety-critical hooks and log the diagnostic; otherwise omitted/false config should follow the documented default.
- **[pattern]** For docs asset tests that assert prose requirements, normalize whitespace before phrase assertions. This lets docs be wrapped/formatted naturally while still locking critical user-facing semantics.
