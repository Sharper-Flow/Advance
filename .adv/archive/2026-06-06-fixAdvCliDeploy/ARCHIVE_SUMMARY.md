# Archive: Fix adv CLI deploy

**Change ID:** fixAdvCliDeploy
**Archived:** 2026-06-06T17:04:28.118Z
**Created:** 2026-06-05T21:25:53.800Z

## Tasks Completed

- ⏭️ Implement deploy-local managed ADV CLI install
- ⏭️ Update release packaging, installer checks, and docs
- ⏭️ Deploy and verify installed adv restores launcher rows
- ✅ Add advance-meta spec law for ADV CLI local install
  > Added and verified ADV CLI local install law/guards and deploy-local coverage: stable local-share bin sync, managed ~/.local/bin/adv symlink, release artifact inclusion of bin payload, setup/install docs, PATH shadow handling, runtime import validation, and fake rsync test behavior for deployed CLI payload checks.
- ✅ Implement deploy-local managed CLI payload and symlink install
  > Managed CLI payload install is implemented in deploy-local: syncs bin/ to $ADV_LOCAL_DEPLOY_ROOT/bin, installs ~/.local/bin/adv as managed symlink to the stable deployed copy, release asset includes bin payload, install.sh requires bin/adv, and test fixtures verify sync/link behavior with fake HOME/PATH.
- ✅ Implement CLI install drift checks, safe repair, and PATH shadow handling
  > CLI install drift checks, safe repair, and PATH shadow handling are implemented in deploy-local: classifies managed/missing/stale/wrong-target/unsafe existing targets, refuses unrelated files, replaces recognized stale ADV files, reports PATH shadow as blocking in --check, and treats PATH shadow as warning-only after --fix repairs the managed target.
- ✅ Add source-current live-status verification and no-mutation guards
  > Source-current live-status verification and no-mutation guards are in place: deploy-local validates installed adv status --json for live Temporal metadata, runtime import prerequisites are checked after sync, CLI bridge tests guard status/help-only behavior, and no CLI mutation subcommands were introduced.
- ✅ Update CLI install documentation and release/developer guidance
  > CLI install documentation and release/developer guidance are updated: SETUP now directs users to deploy-local --fix, documents stable local-share bin deployment, managed symlink behavior, --check findings, unrelated-file refusal, and PATH shadow remediation. Release asset tests require bin payload and installer completeness guidance.
- ✅ Run final install-contract verification and cleanup pass
  > Final verification, acceptance review, and harden remediation complete. Harden narrowed symlink recognition to exact managed/repo targets or content-marker-verified ADV CLI files, added unsafe symlink regression coverage, and full suite passed after the harden fix.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When embedding Bash scripts in TypeScript template-literal test fixtures, Bash parameter expansion like `${args[...]}` is parsed by TypeScript unless escaped; prefer argument loops or escaped dollar sequences in fake command fixtures.
- **[pattern]** For installer/deploy changes, pair SETUP/install docs with asset tests that assert required user-facing snippets and release payload paths; this keeps release guidance and packaged artifacts from drifting independently.
- **[success]** Final verification pattern worked well: run smoke first to catch format/type/lint drift, fix deterministic issues, then run full suite; if one integration test times out, rerun that file in isolation before rerunning full suite to classify reproducibility.
