# Contract Traceability

**Change ID:** documentReleaseInstall
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-23T07:30:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | release-install-assets.test.ts asserts full artifact paths; local archive smoke verified plugin/dist, plugin/src, deploy-local, .opencode command/agents/overlays, skills, README/SETUP, ADV_INSTRUCTIONS, AGENTS, project.md, project.json in advance-v0.0.0-smoke.tar.gz. |
| AC2 | acceptance_criterion | pass | test | release-install-assets.test.ts asserts old plugin-only tar command is absent and dist/checksums.txt is absent; workflow now builds advance-${VERSION}.tar.gz from full payload and uploads SHA256SUMS.txt. |
| AC3 | acceptance_criterion | pass | test | install.sh resolves ADV_VERSION or GitHub /releases/latest url_effective redirect; tests assert no hardcoded ADV_VERSION and required latest-resolution snippets; bash -n install.sh passed. |
| AC4 | acceptance_criterion | pass | test | README quick start uses https://github.com/Sharper-Flow/Advance/releases/latest/download/install.sh | bash; tests assert release installer path and reject old git-clone deploy-local block. |
| AC5 | acceptance_criterion | pass | test | SETUP contains User install (recommended), Manual release artifact install, and Maintainer/developer setup sections; tests assert all section markers and source-checkout developer path. |
| AC6 | acceptance_criterion | pass | test | release-install-assets.test.ts plus local archive smoke prove docs/workflow artifact paths and SHA256SUMS coverage; pnpm run check, pnpm run build, and targeted tests passed after remediation. |
| AC7 | acceptance_criterion | pass | test | SETUP troubleshooting covers jq not found, rsync not found, pnpm not found, sha256sum not found, chmod +x install.sh, Release artifact is incomplete, and checksum failure; tests assert required failure-mode strings. |
| C1 | constraint | respected | static_check | Docs reference latest/download/install.sh; workflow uploads dist/install.sh and full tar; local smoke verified artifact contents match documented manual install paths. |
| C2 | constraint | respected | static_check | SETUP Maintainer/developer setup retains git clone, plugin pnpm install/build/test, and ./scripts/deploy-local.sh --fix. |
| C3 | constraint | respected | static_check | Touched files are release workflow, install.sh, README.md, SETUP.md, and release-install asset tests; no ADV runtime/gate/Temporal/tool implementation files changed. pnpm run check and build passed. |
| C4 | constraint | respected | static_check | No npm/Homebrew/registry publishing config added; release remains GitHub Release assets only. |
| C5 | constraint | respected | static_check | Review scope and touched files contain no Claude Code distribution work or docs beyond existing note. |
| DONT1 | avoidance | respected | review | README command downloads release installer asset; SETUP manual commands download archive and SHA256SUMS files published by workflow; local smoke verified required archive layout. |
| DONT2 | avoidance | respected | review | Workflow now includes repo-level assets in archive and verifies them before publish; docs state full artifact contents only after packaging changed. |
| DONT3 | avoidance | respected | review | Old plugin-only tar command removed; tests assert absence. Primary README path uses install.sh asset that downloads full archive. |
| DONT4 | avoidance | respected | review | Workflow copies install.sh into dist, builds full tar, generates SHA256SUMS, and uploads assets automatically; no maintainer copy step documented or required. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4decc6241419 | AC1, AC2, AC6 | AC1, AC2, AC6 | C1, C2, C3, C4, C5, DONT2, DONT3, DONT4 |  |
| tk-47c3b40d5bcf | AC3, AC7 | AC3, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2 |  |
| tk-2fb3afdf6d0e | AC4, AC5, AC7 | AC4, AC5, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3 |  |
| tk-f677e27ed635 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
