# Executive Summary

## Outcome

The `adv-advance` MCP registration that was manually added to `opencode.jsonc` by
`refreshConcordInventory` (PR #110 in toolbox) is now durable against future
Advance plugin re-deploys. `scripts/deploy-local.sh` validates the entry via
`check_config()` and emits the exact patch via `fix_config()`, following the
existing pattern used for the plugin path, instructions, and legacy agent keys.

Three additions, one file, 29 insertions:

- `ADV_MCP_SERVER_NAME` / `ADV_MCP_SERVER_URL` constants (port 6298, matching
  the vision-proxied server registered in `~/.config/vision/servers.yaml`).
- `check_config()` jq predicate: `✓` when `.mcp.adv-advance.url` matches,
  `✗` with the expected URL otherwise.
- `fix_config()` jq patch: inserts the entry when missing or URL-drifted, before
  the existing JSONC fail-loud branch.

## Why It Matters

Without this, any future opencode.jsonc rewrite (fresh install, host migration,
manual edit, or plugin re-deploy that touches config) would silently drop the
`adv-advance` entry. Tier-4 `tools.adv.*` Code Mode reads would resume failing
with "Unknown tool" and the only signal would be agent-side errors at use time.
The deploy script now catches this at deploy time and either auto-patches (plain
JSON) or fails loud with the exact manual edit and restore hint (JSONC).

## Verification

- `bash -n scripts/deploy-local.sh` — syntax clean.
- `shellcheck 0.10.0` — no new warnings on edited regions (constants L175-179,
  check L845-854, patch L1169-1178); all pre-existing warnings on untouched lines.
- `bash scripts/deploy-local.sh --check` against live config — emits
  `✓  mcp: adv-advance registered (Tier-4 read surface)`.
- TDD red (run `tr_ms3vc3al_d546588b`): jq predicate correctly rejects a stripped
  fixture (`exit 1`).
- TDD green (run `tr_ms3vbkfs_973b94e7`): predicate accepts live config, rejects
  stripped fixture, and the patch correctly restores the entry to the stripped
  fixture.
- Diff: 1 file changed, 29 insertions, 0 deletions.
- Contract review matrix: 21/21 rows passing or respected; 0 failures.

## Release Readiness Summary

Pure shell-script extension to `scripts/deploy-local.sh`. No product runtime
change, no spec delta, no workflow mutation. Release requires only git
publication of the single edited file. The JSONC fail-loud policy is preserved
verbatim; the new check/patch rides the existing pattern.

## Remaining Risks and Follow-ups

- `shellcheck` is not installed on the operator host by default; CI may or may
  not enforce it. The static check was run from a /tmp-installed binary for this
  verification.
- The port 6298 is a magic number shared with vision config; if vision reassigns
  the port, the constant in deploy-local.sh must be updated in lockstep.
- Bridge deprecation path remains undefined (`registerAdvAdvanceMcpServer` is
  still classified `TEMPORARY_BRIDGE` in the Concord inventory).
- The pre-existing `tool drift: 69 tools registered but NOT in adv.md allowlist`
  finding from the live --check run is unrelated to this change and was not
  addressed.
