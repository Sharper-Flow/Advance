Advance has install docs for cloning source and running `scripts/deploy-local.sh --fix`, but not a clear user path for downloading a GitHub Release. Current release artifact contents appear mismatched with documented setup: the release tarball includes plugin package/build files, while install docs expect repo-level sync assets like `scripts/deploy-local.sh`, `.opencode/command`, agents, and skills.

Desired outcome: users downloading from GitHub Releases have explicit, working setup instructions, and release assets either match those instructions or docs steer users to the correct source archive/install path.

Expected scope:
- Document “Install from GitHub Release” path in `README.md` / `SETUP.md`.
- Verify release artifact contents against install flow.
- Decide whether to update docs only or adjust release packaging so release downloads are self-installable.
- Avoid changing ADV runtime behavior unless packaging mismatch requires it.