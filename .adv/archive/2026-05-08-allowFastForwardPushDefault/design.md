## Design

### File 1: `plugin/src/tools/git-guard.ts`

#### Change A: Add push flag extraction

```typescript
export interface PushFlags {
  force: boolean;
  forceWithLease: boolean;
  hasRefspec: boolean;
}

/**
 * Extract push command flags from a command string.
 * Detects --force/-f, --force-with-lease, and refspec arguments.
 */
export function extractPushFlags(command: string): PushFlags {
  const flags: PushFlags = {
    force: false,
    forceWithLease: false,
    hasRefspec: false,
  };

  for (const segment of splitCommand(command)) {
    const tokens = tokenizeSegment(segment);
    const gitIndex = tokens.indexOf("git");
    if (gitIndex === -1) continue;

    let pushIndex = -1;
    for (let i = gitIndex + 1; i < tokens.length; i++) {
      if (tokens[i] === "push") {
        pushIndex = i;
        break;
      }
    }
    if (pushIndex === -1) continue;

    for (let i = pushIndex + 1; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok === "--force" || tok === "-f") flags.force = true;
      else if (tok === "--force-with-lease") flags.forceWithLease = true;
      else if (tok.startsWith("--force-with-lease=")) flags.forceWithLease = true;
      else if (!tok.startsWith("-") && tok.includes(":")) flags.hasRefspec = true;
    }
  }

  return flags;
}
```

#### Change B: Update push decision in evaluateDecision

Replace lines 486-494 (the unconditional push block) with flag-aware logic:

```typescript
// Push from default branch: allow fast-forward, block force/refspec
if (subcommand === "push" && context.isDefaultBranch) {
  // Note: caller must pass the original command for flag extraction.
  // For now, evaluateDecision receives subcommand only — flag info comes
  // from checkBashCommand which has the full command string.
  // Add optional pushFlags parameter to evaluateDecision.
}
```

Better approach — extend `evaluateDecision` signature with optional `pushFlags`:

```typescript
export function evaluateDecision(
  category: GitCommandCategory,
  context: GuardContext,
  subcommand: string,
  pushFlags?: PushFlags,
): GuardResult {
  // ... existing fast paths ...

  // Push from default branch: allow plain fast-forward push, block force/refspec
  if (subcommand === "push" && context.isDefaultBranch) {
    if (pushFlags?.force) {
      return {
        decision: "BLOCK",
        category,
        subcommand,
        reason: `Git push --force from default branch "${context.branch}" blocked: force-push requires explicit user approval via question tool. Use --force-with-lease only after confirming non-fast-forward publish is intended.`,
        context,
      };
    }
    if (pushFlags?.forceWithLease) {
      return {
        decision: "BLOCK",
        category,
        subcommand,
        reason: `Git push --force-with-lease from default branch "${context.branch}" blocked: requires explicit user approval. Confirm non-fast-forward publish is intended.`,
        context,
      };
    }
    if (pushFlags?.hasRefspec) {
      return {
        decision: "BLOCK",
        category,
        subcommand,
        reason: `Git push with refspec from default branch "${context.branch}" blocked: cross-ref pushes require explicit approval. Use plain push for fast-forward publish.`,
        context,
      };
    }
    // Plain push — allow fast-forward (canonical archive path)
    return { decision: "ALLOW", category, subcommand, context };
  }

  // ... rest unchanged ...
}
```

#### Change C: Pass push flags from checkBashCommand

```typescript
export async function checkBashCommand(...) {
  // ... existing logic ...

  const pushFlags = subcommand === "push"
    ? extractPushFlags(sanitizedCommand)
    : undefined;

  return evaluateDecision(category, context, subcommand, pushFlags);
}
```

### File 2: `plugin/src/tools/git-guard.test.ts`

Add tests:
- `extractPushFlags` returns correct flags for plain/force/lease/refspec
- `evaluateDecision` allows plain push from default branch
- `evaluateDecision` blocks `--force` push from default branch
- `evaluateDecision` blocks `-f` push from default branch
- `evaluateDecision` blocks `--force-with-lease` push from default branch
- `evaluateDecision` blocks refspec push from default branch
- Integration: `checkBashCommand("git push origin trunk", ...)` from default branch → ALLOW
- Integration: `checkBashCommand("git push --force origin trunk", ...)` from default branch → BLOCK