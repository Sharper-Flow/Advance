# Archive: Fix tool drift

**Change ID:** fixToolDrift
**Archived:** 2026-05-24T23:03:06.064Z
**Created:** 2026-05-24T22:45:16.555Z

## Tasks Completed

- ✅ Add deploy-local drift tests for leaf-only primary-agent exclusion
  > Added deploy-local tests proving primary agents remain `mode: primary`, do not expose `adv_subagent_report_submit`, and requiring script support for `LEAF_ONLY_TOOLS`, `agent_mode == "primary"`, and strict ordinary missing-tool validation. RED run fails as expected before implementation.
- ✅ Implement role-aware deploy-local tool drift validation
  > Updated `check_tool_drift()` to parse frontmatter `mode`, define `LEAF_ONLY_TOOLS = {"adv_subagent_report_submit"}`, and subtract leaf-only tools from required registered tools only for `mode: primary`. Extras detection and ordinary missing-tool failures remain unchanged. Verified primary `adv.md`/`adv-atc.md` no longer report false-positive drift and subagent asset tests still pass.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Tool-drift validation should compare registry inventory against per-agent capability contracts, not assume every registered ADV tool belongs in every primary agent allowlist. Use structural role signals like frontmatter `mode` plus named capability sets (e.g. leaf-only tools) to avoid false positives without weakening ordinary drift checks.
