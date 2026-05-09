# ADV Worktree Guide

ADV worktrees isolate implementation work from the trunk checkout. The trunk
checkout remains a clean integration surface; agents edit files in worktrees and
publish to trunk through verified merge/archive flows.

## Worktree Include (AC8)

ADV worktrees can copy selected files from the main checkout into each new
worktree via `.opencode/worktree.jsonc`:

```jsonc
{
  "sync": {
    "copyFiles": [".env", ".env.local"],
    "symlinkDirs": ["node_modules"],
    "exclude": []
  }
}
```

Defaults stay conservative: `copyFiles: []`. Do not auto-copy secret-bearing
files unless the project opts in. Do **not** include `.env` or `.env.local`
unless those files contain only non-sensitive local-development defaults; prefer
`.env.example` or `.env.template` for shared setup where possible.

Implementation refs:

- Config loader: `plugin/src/tools/worktree/index.ts:1589-1653`
- Copy invocation: `plugin/src/tools/worktree/index.ts:1864-1871`

## Setup Worktree Hook (AC9)

ADV worktrees can run project setup commands after creation via
`.opencode/worktree.jsonc`:

```jsonc
{
  "hooks": {
    "postCreate": ["pnpm install", "docker compose up -d"],
    "preDelete": ["docker compose down"]
  }
}
```

`postCreate` hook failures mark the worktree `setup_failed` and block ADV
routing into that worktree until setup is remediated. This preserves the
worktree path for manual repair while preventing agents from running in a
half-configured workspace.

Implementation refs:

- Hook runner: `plugin/src/tools/worktree/index.ts:1559-1583`
- Post-create invocation: `plugin/src/tools/worktree/index.ts:1883-1886`

## Port & Resource Isolation (AC10)

Parallel worktrees should not share runtime ports, databases, or mutable local
state. Recommended patterns:

| Resource | Pattern |
| --- | --- |
| HTTP ports | `BASE_PORT + WORKTREE_INDEX` (for example 5173, 5174, 5175) |
| SQLite | one DB file per worktree, stored under the worktree path |
| Docker volumes | one named volume per worktree branch slug |
| External services | suffix local resource names with branch slug |

Example `postCreate` hook for assigning per-worktree local resources:

```jsonc
{
  "hooks": {
    "postCreate": [
      "node scripts/setup-worktree-env.mjs --port-base 5173 --db-template .env.local"
    ],
    "preDelete": ["node scripts/cleanup-worktree-env.mjs"]
  }
}
```

Project setup scripts should be idempotent: rerunning `postCreate` should update
or confirm the same resources, not create duplicates.
