# Archive: Improve dashboard autostart

**Change ID:** improveDashboardAutostart
**Archived:** 2026-06-26T03:16:56.619Z
**Created:** 2026-06-26T00:36:05.048Z

## Tasks Completed

- ✅ Add PokeEdge dashboard profile and default config generation
  > Added typed PokeEdge dashboard profile helpers: `createPokeEdgeDashboardConfig`, `createDashboardProfileConfig`, and `dashboardProfileConfigPath`. Default config covers `/home/jon/dev/pokeedge` → `Sharper-Flow/PokeEdge` and `/home/jon/dev/pokeedge-web` → `Sharper-Flow/PokeEdge-Web`; path resolves to user config under `.config/advance/dashboard/pokeedge.json`.
- ✅ Harden fixed-port dashboard server startup and collision behavior
  > Added fixed-port startup error handling. `adv dashboard` now detects address-in-use startup failures, emits a clear diagnostic for the configured host/port, and exits with distinct code 75 instead of silently falling back or throwing an unclassified process error.
- ✅ Add dashboard install and doctor commands for PokeEdge user service
  > Added `adv dashboard install --profile pokeedge` and `adv dashboard doctor --profile pokeedge`, with dry-run visibility for tests/docs. Install writes default config and user systemd unit, then runs `systemctl --user daemon-reload` and `enable --now`; doctor reports config, unit, linger, service-active checks and remediation.
- ✅ Add linger handling and restart-safe systemd unit generation
  > Added user systemd unit generation with `WantedBy=default.target`, `Restart=on-failure`, `RestartPreventExitStatus=75`, `StartLimitIntervalSec=60`, `StartLimitBurst=3`, journal logging, and PATH environment. Added linger parsing and doctor remediation for disabled lingering via `loginctl enable-linger`.
- ✅ Add dashboard state cache and in-flight refresh coalescing
  > Added `createDashboardStateProvider`, giving `/api/state` a server-lifetime TTL cache keyed to `refresh_seconds` plus in-flight refresh coalescing. Default handler now creates one provider at server startup; pure `buildDashboardState` remains available for direct tests/callers.
- ✅ Add GitHub CLI auth fallback and structured setup metadata
  > Added bounded `gh auth token` fallback behind `createDefaultGitHubTokenProvider`, preserving `GITHUB_TOKEN` priority. Added fakeable CLI execution for tests. Auth-unavailable degradation now includes sanitized setup metadata (`gh auth login`, `GITHUB_TOKEN`) without raw stderr or secret material.
- ✅ Render inline GitHub setup card and preserve read-only UI behavior
  > Added inline GitHub auth setup card rendering for `GITHUB_AUTH_UNAVAILABLE`, using sanitized setup metadata or safe fallback copy. Card shows `gh auth login` and `GITHUB_TOKEN`; existing read-only/mutation-control tests remain green.
- ✅ Document dashboard autostart install, health, logs, linger, and uninstall
  > Updated README Local dashboard section with PokeEdge autostart service instructions and updated `adv --help` to list `dashboard install` and `dashboard doctor` profile flags.
- ✅ Run integrated autostart dashboard verification
  > Integrated verification covered profile/default config, install/doctor dry-run, fixed-port collision exit 75, restart-safe service unit/linger remediation, state cache/coalescing, GitHub CLI auth fallback, setup-card UI, read-only routes, and full bin regression suite.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For dashboard/API polling surfaces, keep the pure state-builder function separate from a server-lifetime state provider. Wire handlers to one provider instance at server startup so tests can assert TTL caching and in-flight Promise coalescing without hiding direct builder behavior.
