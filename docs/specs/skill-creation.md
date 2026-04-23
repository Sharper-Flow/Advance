# Skill Creation

> **Version:** 1.0.0
> **Updated:** 2026-04-23

## Purpose

Capability: On-demand skill creation — when agents detect a guidance gap during Phase 1.5 skill discovery, they research the domain, assemble a SKILL.md, persist it to the global skills directory, and use it immediately.

## Requirements

### Skill Gap Detection

**ID:** `rq-sc01` | **Priority:** **[MUST]**

When `/adv-discover` or `/adv-research` Phase 1.5 skill discovery finds no matching skill for a domain relevant to the change's core problem, the agent MUST explicitly report the gap and MAY initiate on-demand skill creation.

**Tags:** `skill-creation`, `gap-detection`, `phase-1.5`

#### Scenarios

**Gap detected for core-relevant domain** (`rq-sc01.1`)

**Given:**
- Phase 1.5 skill discovery completes with no matching skill
- The change's tech stack or domain terms suggest a skill would be useful
- The domain is clearly relevant to the change's core problem

**When:** The agent evaluates skill search results

**Then:**
- The agent reports the gap in Skills Considered with "skill gap: {domain}"
- The agent may proceed to skill creation

**Partial match does not trigger creation** (`rq-sc01.2`)

**Given:**
- Phase 1.5 finds a partial keyword match in an existing skill
- The existing skill partially covers the detected domain

**When:** The agent evaluates skill search results

**Then:**
- The agent reports "partial coverage: {existing skill}" in Skills Considered
- The agent does NOT create a new skill for the partially covered domain

**Tangential domain does not trigger creation** (`rq-sc01.3`)

**Given:**
- Phase 1.5 finds no matching skill for a domain
- The domain is tangential to the change's core problem

**When:** The agent evaluates skill search results

**Then:**
- The agent reports "no skills matched" as normal
- The agent does NOT create a skill for tangential domains

### Skill Assembly and Persistence

**ID:** `rq-sc02` | **Priority:** **[MUST]**

Auto-created skills MUST use valid SKILL.md frontmatter format, MUST NOT use the `adv-` prefix (sync script collision), and MUST be written atomically to the global skills directory.

**Tags:** `skill-creation`, `assembly`, `persistence`

#### Scenarios

**Valid frontmatter format** (`rq-sc02.1`)

**Given:**
- The agent decides to create a skill for domain X

**When:** The agent assembles the SKILL.md

**Then:**
- The file has valid YAML frontmatter with `name: "agent-{domain}"`, `description`, `keywords`
- The file includes `metadata.source: "agent-created"`
- The file includes `metadata.review_status: "pending"`
- The file includes `metadata.created_at` with ISO timestamp
- The file includes `metadata.trigger_change` with the originating change ID
- The skill name does NOT start with `adv-`

**Atomic write with skip-if-exists** (`rq-sc02.2`)

**Given:**
- An auto-created skill is ready to persist

**When:** The agent writes to `~/.config/opencode/skills/agent-{domain}/SKILL.md`

**Then:**
- The write is atomic (temp+rename or equivalent)
- If a file already exists at the target path, the agent skips creation and reports "skill already exists: agent-{domain}"

**Overlap detection** (`rq-sc02.3`)

**Given:**
- A skill with the same name already exists in the global dir

**When:** The agent attempts creation

**Then:**
- The agent skips creation and reports "skill already exists: {name}"
- The existing skill is NOT overwritten

### Use-and-Notify Pattern

**ID:** `rq-sc03` | **Priority:** **[MUST]**

After creating a skill, the agent MUST load it via `skill()`, use it in the current workflow, and emit `[ADV:SKILL_CREATED]` notification.

**Tags:** `skill-creation`, `notification`, `status-marker`

#### Scenarios

**Skill loaded and used after creation** (`rq-sc03.1`)

**Given:**
- A skill was successfully written to the global skills dir

**When:** The agent continues the current workflow

**Then:**
- `skill("agent-{domain}")` is called
- The skill's guidance is applied in the current workflow

**Notification emitted** (`rq-sc03.2`)

**Given:**
- A skill was created during discovery or research

**When:** The workflow continues after creation

**Then:**
- `[ADV:SKILL_CREATED]` marker is emitted
- The notification includes the skill name, domain, and a brief description

**Pending review surfaced on next discovery** (`rq-sc03.3`)

**Given:**
- A skill exists in the global dir with `metadata.review_status: "pending"`

**When:** A subsequent `/adv-discover` Phase 1.5 runs

**Then:**
- Phase 1.5 scans for pending-review skills BEFORE keyword matching
- Pending skills are surfaced to the user for confirmation
- User confirms → `metadata.review_status` updated to "reviewed"
- User rejects → skill file deleted
