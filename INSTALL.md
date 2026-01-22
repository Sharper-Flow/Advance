# ADV Installation Guide

This guide covers installing and configuring the ADV (Advance) plugin for OpenCode.

## Prerequisites

- **Node.js** 20.x or higher
- **pnpm** 9.x (recommended) or npm
- **OpenCode** CLI installed

## Installation Methods

### Method 1: Clone and Link (Development)

```bash
# Clone the repository
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance

# Install plugin dependencies
cd plugin
pnpm install

# Link to OpenCode (when plugin system is ready)
# opencode plugin link .
```

### Method 2: Direct Installation (Future)

```bash
# When published to npm
opencode plugin install @goost/advance
```

## Project Setup

### Initialize a New ADV Project

1. Create project configuration:

```bash
mkdir my-project
cd my-project

# Create project.json
cat > project.json << 'EOF'
{
  "name": "my-project",
  "version": "0.1.0",
  "specs_dir": "specs",
  "changes_dir": "changes",
  "archive_dir": "archive",
  "docs_dir": "docs/specs",
  "db_dir": ".specdb"
}
EOF
```

2. Create directory structure:

```bash
mkdir -p specs changes archive docs/specs .specdb
```

3. Add to `.gitignore`:

```bash
cat >> .gitignore << 'EOF'
# ADV cache
.specdb/
EOF
```

### Add to Existing Project

1. Create `project.json` in project root (see above)
2. Create the required directories
3. Start using ADV commands

## Configuration

### project.json Options

| Option | Default | Description |
|--------|---------|-------------|
| `name` | (required) | Project name |
| `version` | `"0.1.0"` | Project version |
| `specs_dir` | `"specs"` | Directory for spec files |
| `changes_dir` | `"changes"` | Directory for change proposals |
| `archive_dir` | `"archive"` | Directory for archived changes |
| `docs_dir` | `"docs/specs"` | Directory for generated docs |
| `db_dir` | `".specdb"` | Directory for SQLite cache |

### OpenCode Configuration

Add to your `.opencode/config.json` (when plugin system supports it):

```json
{
  "plugins": {
    "advance": {
      "enabled": true
    }
  }
}
```

## Verification

### Check Installation

```bash
# Run tests to verify installation
cd advance/plugin
pnpm test

# Expected output: 222 tests passing
```

### Test Commands

Once integrated with OpenCode:

```bash
# Check project status
/adv-status

# Should show:
# - Specs: 0 capabilities
# - Changes: 0 active
```

## Creating Your First Spec

1. Create a capability directory:

```bash
mkdir -p specs/user-auth
```

2. Create `specs/user-auth/spec.json`:

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
        },
        {
          "id": "rq-auth0001.2",
          "title": "Reject short password",
          "given": ["a user registration form"],
          "when": "user enters a password with fewer than 12 characters",
          "then": ["the password is rejected", "an error message is shown"]
        }
      ]
    }
  ]
}
```

3. Verify with `/adv-status`:

```
SPECS (1 capability):
- user-auth: 1 requirement (v1.0.0)
```

## Troubleshooting

### SQLite Errors

If you see SQLite-related errors:

```bash
# Rebuild native modules
cd advance/plugin
pnpm rebuild better-sqlite3
```

### Permission Issues

Ensure write access to project directories:

```bash
chmod -R u+w specs changes archive docs .specdb
```

### Cache Issues

Clear the SQLite cache to force re-sync:

```bash
rm -rf .specdb/spec.db
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ADV_DEBUG` | Set to `"1"` for debug logging |

## Support

- **Issues**: https://github.com/Sharper-Flow/Advance/issues
- **Documentation**: See README.md and ADV_INSTRUCTIONS.md
