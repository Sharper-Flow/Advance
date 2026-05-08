---
name: adv-atc
description: Autonomous ROADMAP execution with HITL deferred to GitHub
agent: adv-atc
---
<!-- manifest: adv-atc · requiresChangeId: false · scope: reads[specs, proposal, roadmap, codebase] modifies[proposal] gates[proposal, discovery, design, planning, execution, acceptance] -->

# ADV ATC — Air Traffic Control

Autonomous ROADMAP execution. Defers all HITL moments to linked GitHub issues via structured comments. The `adv-atc` agent (defined in `.opencode/agents/adv-atc.md`) drives the full 7-gate lifecycle; this command routes to it.

## Invocation Modes

| Mode | Command | Behavior |
|------|---------|----------|
| ROADMAP loop | `/adv-atc` | Process top-ranked unstarted ROADMAP item, then next |
| Single change | `/adv-atc <change-id>` | Run one change to completion or HITL deferral |
| Idea string | `/adv-atc "idea text"` | Create change from idea, run to completion |

## Flags

| Flag | Purpose |
|------|---------|
| `--limit N` | Process at most N items (loop mode) |
| `--bugs-only` | Only process bug-type items |
| `--features-only` | Only process feature-type items |
| `--resume` | Scan deferred changes for GH responses, resume |
| `--skip #X,#Y` | Skip specific items by issue number |

## Workflow

All workflow logic lives in the agent overlay (`.opencode/agents/adv-atc.md`). This command file only provides routing and argument documentation.

<UserRequest>
  $ARGUMENTS
</UserRequest>
