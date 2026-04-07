# Advance Installation Guide

This guide covers local setup for the ADV (Advance) OpenCode plugin and the minimum project structure ADV expects.

## Prerequisites

- Node.js 20+
- `pnpm`
- OpenCode installed

## Plugin development setup

```bash
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance/plugin
pnpm install
pnpm test
pnpm run check
```

Useful development commands:

```bash
pnpm test
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run check
```

## Project setup

ADV expects a project-level config file plus directories for specs and change state.

### Minimal `project.json`

```json
{
  "name": "my-project",
  "version": "0.1.0",
  "specs_dir": "specs",
  "changes_dir": "changes",
  "archive_dir": "archive",
  "docs_dir": "docs/specs",
  "db_dir": ".specdb",
  "project_file": "project.md"
}
```

### Minimal directory layout

```bash
mkdir -p specs changes archive docs/specs .specdb
```

### `.gitignore`

```gitignore
.specdb/
```

## First-use workflow

Once ADV is wired into your OpenCode environment, the normal lifecycle is:

```text
/adv-status
/adv-proposal "your change summary"
/adv-validate <change-id>
/adv-apply <change-id>
```

Common follow-up commands:

- `/adv-prep <change-id>`
- `/adv-research <target>`
- `/adv-review <change-id>`
- `/adv-harden <change-id>`
- `/adv-archive <change-id>`

## Creating your first spec

```bash
mkdir -p specs/user-auth
```

Example `specs/user-auth/spec.json`:

```json
{
  "name": "user-auth",
  "title": "User Authentication",
  "purpose": "Secure user identity verification",
  "version": "1.0.0",
  "updated_at": "2026-01-21T00:00:00Z",
  "requirements": [
    {
      "id": "rq-auth0001",
      "title": "Password Minimum Length",
      "body": "User passwords MUST be at least 12 characters long.",
      "priority": "must",
      "tags": ["security", "password"],
      "scenarios": [
        {
          "id": "rq-auth0001.1",
          "title": "Accept valid password",
          "given": ["a user registration form"],
          "when": "user enters a password with 12+ characters",
          "then": ["the password is accepted", "no error is shown"]
        }
      ]
    }
  ]
}
```

## Troubleshooting

### Native SQLite issues

```bash
cd plugin
pnpm rebuild better-sqlite3
```

### Cache issues

ADV now self-heals common SQLite cache drift during status/sync operations, including:

- stale change rows that no longer have a JSON source file
- dangling task-to-change references left behind by cache inconsistencies

If the local cache is still corrupted or cannot recover automatically, remove the DB in your configured `db_dir` and rebuild state on next run (legacy examples below use `.specdb`):

```bash
rm -f .specdb/spec.db
```

If a WAL file is left behind, remove the companion files in that same directory too:

```bash
rm -f .specdb/spec.db .specdb/spec.db-wal .specdb/spec.db-shm
```

### Permission issues

Make sure ADV can write to the project state directories:

```bash
chmod -R u+w specs changes archive docs .specdb
```

## Support

- GitHub issues: `https://github.com/Sharper-Flow/Advance/issues`
- Workflow docs: `ADV_INSTRUCTIONS.md`
- Architecture and lifecycle docs: `docs/`
