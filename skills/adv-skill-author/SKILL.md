<!-- Vendored from mattpocock/skills@main:skills/productivity/write-a-skill/SKILL.md
     Author: Matt Pocock <https://github.com/mattpocock>
     License: MIT (see LICENSE-THIRD-PARTY.md)
     Renamed to adv-skill-author per ADR-001. Description adapted for ADV context.
     Imported: 2026-05-11 for change adoptMattpocockSkills. -->
---
name: adv-skill-author
description: Create new agent skills (ADV-bundled or agent-created) with proper structure, progressive disclosure, and bundled resources. Use when the user wants to create, write, or build a new skill, or when the ADV Skill Creation Protocol (ADV_INSTRUCTIONS.md) needs an authoring template for an `agent-{domain}` skill.
---

# Writing Skills

## Process

1. **Gather requirements** - ask user about:
   - What task/domain does the skill cover?
   - What specific use cases should it handle?
   - Does it need executable scripts or just instructions?
   - Any reference materials to include?

2. **Draft the skill** - create:
   - SKILL.md with concise instructions
   - Additional reference files if content exceeds 500 lines
   - Utility scripts if deterministic operations needed

3. **Review with user** - present draft and ask:
   - Does this cover your use cases?
   - Anything missing or unclear?
   - Should any section be more/less detailed?

## Skill Structure

```
skill-name/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (if needed)
├── EXAMPLES.md        # Usage examples (if needed)
└── scripts/           # Utility scripts (if needed)
    └── helper.js
```

## SKILL.md Template

```md
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill Name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]

## Advanced features

[Link to separate files: See [REFERENCE.md](REFERENCE.md)]
```

## Description Requirements

The description is **the only thing your agent sees** when deciding which skill to load. It's surfaced in the system prompt alongside all other installed skills. Your agent reads these descriptions and picks the relevant skill based on the user's request.

**Goal**: Give your agent just enough info to know:

1. What capability this skill provides
2. When/why to trigger it (specific keywords, contexts, file types)

**Format**:

- Max 1024 chars
- Write in third person
- First sentence: what it does
- Second sentence: "Use when [specific triggers]"

**Good example**:

```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**Bad example**:

```
Helps with documents.
```

The bad example gives your agent no way to distinguish this from other document skills.

## When to Add Scripts

Add utility scripts when:

- Operation is deterministic (validation, formatting)
- Same code would be generated repeatedly
- Errors need explicit handling

Scripts save tokens and improve reliability vs generated code.

## When to Split Files

Split into separate files when:

- SKILL.md exceeds 100 lines
- Content has distinct domains (finance vs sales schemas)
- Advanced features are rarely needed

## Review Checklist

After drafting, verify:

- [ ] Description includes triggers ("Use when...")
- [ ] SKILL.md under 100 lines
- [ ] No time-sensitive info
- [ ] Consistent terminology
- [ ] Concrete examples included
- [ ] References one level deep

## ADV-Specific Guidance

When authoring skills for the ADV plugin:

- **Bundled skills (`skills/adv-*/`)**: Synced to `~/.config/opencode/skills/` via `scripts/deploy-local.sh`. Whole-directory sync (ADR-002) means sibling reference docs ship to global.
- **Agent-created skills (`~/.config/opencode/skills/agent-{domain}/`)**: Use `agent-` prefix, NOT `adv-`. Set `metadata.source: "agent-created"`, `review_status: "pending"`. See ADV_INSTRUCTIONS.md § Skill Creation Protocol.
- **Enforcement class**: For ADV bundled skills, follow `rq-skillProseCompression01` and the Prose-Load Reduction Rules in `docs/command-voice-standard.md`.
- **Progressive disclosure**: SKILL.md as index + core; deep-dive content in sibling `*.md` files (preferred over inline for skills with 3+ natural domains).
- **Agent-callable tools/sub-agent reports**: Use `adv-agent-tool-contracts` and keep schema/context packet/prompt/tests/specs aligned before shipping.
