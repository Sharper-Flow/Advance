# ADV Worktree Guide

ADV worktrees isolate implementation work from the trunk checkout. The trunk
checkout remains a clean integration surface; agents edit files in worktrees and
publish to trunk through verified merge/archive flows.

## Worktree Location

Default ADV-managed worktrees live under the OpenCode data home:

```text
$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}
```

For heavy local development, prefer a visible source/worktree split:

```text
~/dev/repos/<owner>/<repo>        # canonical trunk checkout
~/dev/worktrees/<project-id>/*    # ADV-created worktrees
```

Set an absolute `ADV_WORKTREE_HOME` to move only worktree checkouts while keeping
ADV state under `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}`:

```sh
export ADV_WORKTREE_HOME="$HOME/dev/worktrees"
```

Then ADV creates worktrees at:

```text
$ADV_WORKTREE_HOME/{project-id}/{branch}
```

Use an absolute path. Relative `ADV_WORKTREE_HOME` values are rejected so cleanup
and namespace guards cannot accidentally target the wrong directory.

## Worktree Include (AC8)

ADV worktrees can copy selected files from the main checkout into each new
worktree via `.opencode/worktree.jsonc`:

```jsonc
{
  "sync": {
    "copyFiles": [".env", ".env.local"],
    "symlinkDirs": ["node_modules"],
    "exclude": [],
  },
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
    "preDelete": ["docker compose down"],
  },
}
```

`postCreate` hook failures mark the worktree `setup_failed` and block ADV
routing into that worktree until setup is remediated. This preserves the
worktree path for manual repair while preventing agents from running in a
half-configured workspace.

Implementation refs:

- Hook runner: `plugin/src/tools/worktree/index.ts:1559-1583`
- Post-create invocation: `plugin/src/tools/worktree/index.ts:1883-1886`

## Machine Worktree Guard

`worktree_guard_enforce` default false for rollout (plain key:
worktree_guard_enforce default false). In plain terms, trunk write firewall
enforcement is opt-in: omitted or false allows default-checkout file writes and
classified destructive bash writes. When enabled, ADV blocks main-checkout file writes,
classified destructive bash writes, and mutating execution task/gate calls with
`WorktreeIsolationViolation`, `mainCheckoutPath`, and remediation. Use
`adv_worktree_resume` and rerun from returned workdir. Git commands stay
allowed so recovery and normal git operations are not routed through the
firewall classifier.

Advance repo opts into strict mode via root `project.json`:

```json
{
  "features": {
    "worktree_guard_enforce": true
  }
}
```

Guarded examples:

- `adv_gate_complete` for discovery/design/planning/execution/acceptance/release
- `adv_task_add`
- `adv_task_update` for `in_progress`, `done`, or `cancelled`

Proposal gate stays exempt so a change can reach worktree creation. Read-only
tools stay allowed.

## Port & Resource Isolation (AC10)

Parallel worktrees should not share runtime ports, databases, or mutable local
state. Recommended patterns:

| Resource          | Pattern                                                     |
| ----------------- | ----------------------------------------------------------- |
| HTTP ports        | `BASE_PORT + WORKTREE_INDEX` (for example 5173, 5174, 5175) |
| SQLite            | one DB file per worktree, stored under the worktree path    |
| Docker volumes    | one named volume per worktree branch slug                   |
| External services | suffix local resource names with branch slug                |

Example `postCreate` hook for assigning per-worktree local resources:

```jsonc
{
  "hooks": {
    "postCreate": [
      "node scripts/setup-worktree-env.mjs --port-base 5173 --db-template .env.local",
    ],
    "preDelete": ["node scripts/cleanup-worktree-env.mjs"],
  },
}
```

Project setup scripts should be idempotent: rerunning `postCreate` should update
or confirm the same resources, not create duplicates.

## WSL Gotchas (Linux subsystem on Windows)

When developing on WSL (Windows Subsystem for Linux), several Windows tools
exposed via `$PATH` can cause Linux-side projects to behave unexpectedly. Any
ADV-managed project on WSL should be aware of the patterns below.

### Browser auto-discovery (chrome-launcher, puppeteer, playwright)

`chrome-launcher` (used by lighthouse-ci, lighthouse, and other Chrome-driving
tools) walks `$PATH` to find a Chrome binary. On WSL, `$PATH` typically
contains `/mnt/c/Program Files/Google/...`, so it can pick up Windows
`chrome.exe` instead of Linux `/usr/bin/google-chrome`. Windows Chrome then
creates its `--user-data-dir` at a Windows-style path like
`C:\Users\<user>\AppData\Local\lighthouse.NNNNN`. From the Linux side of WSL,
that path materializes as a **literal directory** with backslashes in the name
inside the project root.

Symptoms:

- 11+ directories named `C:\Users\<user>\AppData\Local\lighthouse.XXXXX` in the
  repo root (each containing Chrome profile data: `Default/`,
  `GrShaderCache/`, `Local State`, etc.)
- Polluted `ls`, `glob`, and `lgrep` listings
- Confused agents that interpret `C:\…` as Windows paths
- `git status` may or may not list them depending on `.gitignore` patterns

**Fix on the project side**: pin a Linux Chrome path in the tool config.
For lighthouse-ci:

```js
// lighthouserc.cjs
const chromePath =
  process.env.CHROME_PATH ||
  process.env.LHCI_CHROME_PATH ||
  "/usr/bin/google-chrome";

module.exports = {
  ci: {
    collect: {
      chromePath,
      settings: { chromePath /* … */ },
    },
  },
};
```

For puppeteer / playwright: pass `executablePath: '/usr/bin/google-chrome'` to
the launch options, or set `PUPPETEER_EXECUTABLE_PATH` /
`PLAYWRIGHT_BROWSERS_PATH` env vars.

**Defensive `.gitignore` patterns** even after the source is fixed:

```gitignore
# Stray Windows-path profile dirs from WSL chrome-launcher misfires
C\:\\Users\\*/
# Stray `--version` dir from CLI flag misparse (e.g. husky install --version)
/--version/
```

**lgrep noise**: add the same patterns to `.lgrepignore` so accidental
recurrences don't poison the embedding index.

### CLI flag misparse (husky, others)

Some CLIs (notably older Husky versions) treat unknown flags as positional
path arguments. `husky install --version` creates a directory literally named
`--version` containing the hook stubs. Pattern matches any CLI that does
`mkdir <arg>` from argv. Same `.gitignore` / `.lgrepignore` defenses apply.

### Related bugs

- `#113` — `init.defaultBranch` global config leaking into local-repo default
  resolution (fixed in `91109f9`)
- `#123` — this section's source

### Detection

`/adv-tron` reconnaissance and `adv_status` worktree census don't currently
flag WSL-pollution directories specifically. If you see directories with `\`
in their names or starting with `--`, treat them as WSL artifacts and
investigate the source tool.
