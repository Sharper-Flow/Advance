# Executive Summary

Updated dashboard GitHub enrichment to prioritize current status for in-progress merges, builds, and deployments. The prior reader fetched deployment statuses for up to 30 deployments sequentially, which measured around 12.8s per repo and caused `GITHUB_READ_TIMEOUT` under the 5s source budget.

Implemented fix:
- Fetch top-level GitHub endpoints (`pulls`, `workflow_runs`, `deployments`) concurrently.
- Keep open PR and workflow-run data intact.
- Bound deployment status enrichment to `DEFAULT_DEPLOYMENT_STATUS_LIMIT = 6` latest deployments.
- Fetch bounded deployment statuses concurrently.

Verification:
- `bun test bin/lib/dashboard/github.test.ts` — 7 pass.
- `bun test bin/lib/dashboard bin/lib/live-status.test.ts` — 71 pass.
- Trunk fast-forwarded to `d9cd4aeec09253b4f3d357002366c7aada49ce2b` and dashboard service restarted.
- Live `/api/state` returned HTTP 200 within 8s with no GitHub degraded sources for `pokeedge` or `pokeedge-web`.
- Detail probes for both projects returned HTTP 200.

Live URL: http://127.0.0.1:8765/