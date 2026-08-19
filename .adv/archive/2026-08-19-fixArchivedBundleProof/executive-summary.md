# Executive Summary

Advance now routes legacy archive bundles through the surviving archive projection whenever the active change projection is cleanly absent, even if the bundle still carries stale or missing lifecycle state.

Recovery mutation, durable proof, lifecycle convergence, and terminal return now use the same bundle authority. Bundle-backed recovery cannot fall through to active-only retirement, cleanup, or issue closure. Corrupt active projections and foreign bundle identities remain fail-closed.

Exact replay requires status, lifecycle, release, and Phase 9 to be terminal before it can skip the audited recovery transaction. Active-projection archives keep their existing proof path.

Verification passed: natural red/green reproductions, 64 focused tests, 5,137 full-suite tests, TypeScript checks, lint, formatting, architecture checks, and production build. Independent task and acceptance reviews are READY. Deployment, runtime restart, and recovery of the two already archived changes remain the approved post-archive continuation.