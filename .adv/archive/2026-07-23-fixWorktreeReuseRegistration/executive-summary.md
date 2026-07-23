# Executive Summary — Fix worktree reuse registration gap

## Outcome

ADV now repairs a missing durable worktree registration when it reuses an intact on-disk change worktree. Orphan-recovered changes can continue normal trunk/zlauncher mutations without the manual delete-and-recreate workaround.

## Delivered value

- Added a dedicated `worktreeRegistrationRepairedSignal` rather than reusing the replacement-style creation signal.
- The workflow atomically inserts a complete setup-ready registry record only when the branch entry is absent.
- Existing records are exact no-ops, preserving `setup_failed`, metadata-rich records, and `lastSignalAt` even after a client query returns null because Temporal is unavailable.
- Step 0 remains disk-authoritative: it verifies path + HEAD first; failed signal delivery still returns `reused:true`.
- Corrected an independently exposed reliability defect: `creation_request_hash` now survives workflow continue-as-new rotation.

## Verification

- Targeted worktree/reducer/message/full signal-handler suite: **77 passing tests** (`tr_mrwzz2jx_297bf7bf`).
- Static checks: schema, TypeScript, manifests, isolation/lockfile checks, ESLint, and Prettier all pass (`tr_mrx005fs_7978f132`).
- Independent reviewer verdict: **READY**, no blocking/non-blocking findings, no scope drift.
- Contract review matrix: **19/19 passing**.

## Risk and follow-up

- Repair is intentionally best-effort: if worker delivery fails, reuse remains available; a later reuse retries safe workflow-side repair.
- No migration, deployment, frontend, or data impact.
- Separate parent-change close-out (`autoAdoptOrphanSessionQueues`) remains sequenced after this change's release.
