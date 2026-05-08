## Design

### File 1: `plugin/src/tools/git-guard.ts`

#### Change A: Add RECOVERY classification

1. Add `GitCommandCategory` value `"RECOVERY"`
2. Add `RECOVERY_SUBCOMMANDS` set: `"stash"`, `"checkout"`, `"switch"`
3. In `classifySubcommand`: check RECOVERY set before UNKNOWN fallback, return `"RECOVERY"`
4. In `classifyCommand` severity order: insert RECOVERY between WORKTREE_MGMT and READ_ONLY (lower than STAGING)
5. In `evaluateDecision`: add fast-path — if category is RECOVERY, ALLOW regardless of dirty state

```typescript
// New constant
const RECOVERY_SUBCOMMANDS = new Set(["stash", "checkout", "switch"]);

// In classifySubcommand, before UNKNOWN fallback:
if (RECOVERY_SUBCOMMANDS.has(subcommand)) return "RECOVERY";

// In evaluateDecision, after worktree fast-path:
if (category === "RECOVERY") {
  return { decision: "ALLOW", category, subcommand, context };
}
```

#### Change B: Strip heredoc content before classification

1. Add `stripHeredocs(command: string): string` function that removes content between heredoc delimiters
2. Pattern: match `<<[-]?['"]?(\w+)['"]?` ... until line matching the delimiter word
3. Apply in `checkBashCommand` before `classifyCommand`

```typescript
function stripHeredocs(command: string): string {
  // Match heredoc blocks: <<DELIM ... DELIM (with optional - and quoting)
  return command.replace(
    /<<-?\s*['"]?(\w+)['"]?\n[\s\S]*?\n\1/g,
    "<<$1\n$1" // Replace content with empty heredoc
  );
}
```

Apply in `checkBashCommand`:
```typescript
const sanitizedCommand = stripHeredocs(command);
const category = await classifyCommand(sanitizedCommand, deps.execGit, workdir);
```

### File 2: `plugin/src/tools/git-guard.test.ts`

- Test: stash on dirty default → ALLOW
- Test: checkout on dirty default → ALLOW
- Test: switch on dirty default → ALLOW
- Test: commit on dirty default → still BLOCK
- Test: add on dirty default → still BLOCK
- Test: push on default → still BLOCK
- Test: heredoc with git commit inside → classified as non-mutation
- Test: classifySubcommand returns RECOVERY for stash/checkout/switch