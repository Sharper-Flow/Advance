# Design

## Approach

Make `scripts/deploy-local.sh` tool-drift validation role-aware.

- Treat `ADV_TOOL_NAMES` as registry inventory, not universal per-agent allowlist contract.
- Add a named structural leaf-only set: `LEAF_ONLY_TOOLS=(adv_subagent_report_submit)`.
- Detect agent role from YAML frontmatter `mode:`.
- For agents with `mode: primary`, subtract `LEAF_ONLY_TOOLS` from the required registered-tool set before computing missing allowlist entries.
- Keep extras detection unchanged.
- Keep ordinary missing primary tools strict.

## Why

`adv_subagent_report_submit` is a leaf-subagent submit transport. Primary orchestrators (`adv`, `adv-atc`) consume submitted reports through change state, not by submitting reports themselves.

## Validator Result

Independent validator verdict: APPROVE with refinements.

Accepted refinements:

- Use frontmatter `mode: primary`, not hardcoded filenames, for role classification.
- Use named `LEAF_ONLY_TOOLS` constant/array so future leaf-only tools have one structural extension point.

## Implementation Notes

- Extend the embedded Python in `check_tool_drift()` to parse `mode` from frontmatter.
- Keep comments concise and cite leaf-only intent.
- Add tests that verify:
  - primary agents are not required to allow `adv_subagent_report_submit`;
  - ordinary registered ADV tools are still required;
  - `adv-engineer`/`adv-reviewer` still expose `adv_subagent_report_submit` via existing asset tests or new assertion if needed.

## Verification

- Targeted deploy-local tests.
- Existing subagent asset tests if impacted.
- `./scripts/deploy-local.sh --check` confirms no false-positive warning.