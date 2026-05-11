# Third-Party Licenses

This repository vendors content from external projects under their original licenses. This file tracks all such content with source paths, original authors, and licenses.

## mattpocock/skills (MIT License)

**Source:** https://github.com/mattpocock/skills
**Author:** Matt Pocock <https://github.com/mattpocock>
**License:** MIT (see [LICENSE](#mit-license-mattpocockskills) below)
**Imported SHA:** `9f2e0bd0ea776eb6372eb81fa8a4a47814a8404a`
**Imported at:** 2026-05-11 (change `adoptMattpocockSkills`)

### Vendored skills

| Local path | Source path | Renamed to (ADR-001) |
|---|---|---|
| `skills/adv-diagnose/SKILL.md` | `skills/engineering/diagnose/SKILL.md` | `adv-diagnose` |
| `skills/adv-diagnose/scripts/hitl-loop.template.sh` | `skills/engineering/diagnose/scripts/hitl-loop.template.sh` | (same name, prefixed dir) |
| `skills/adv-zoom-out/SKILL.md` | `skills/engineering/zoom-out/SKILL.md` | `adv-zoom-out` |
| `skills/adv-prototype/SKILL.md` | `skills/engineering/prototype/SKILL.md` | `adv-prototype` |
| `skills/adv-prototype/LOGIC.md` | `skills/engineering/prototype/LOGIC.md` | (same name) |
| `skills/adv-prototype/UI.md` | `skills/engineering/prototype/UI.md` | (same name) |
| `skills/adv-skill-author/SKILL.md` | `skills/productivity/write-a-skill/SKILL.md` | `adv-skill-author` (renamed) |

The `skills/adv-skill-author/SKILL.md` content was minimally adapted: description field updated for ADV context and an ADV-Specific Guidance section appended. Pocock's original content preserved verbatim.

### Vendored reference docs (co-located with `domain-context` spec)

| Local path | Source path |
|---|---|
| `.adv/specs/domain-context/CONTEXT-FORMAT.md` | `skills/engineering/grill-with-docs/CONTEXT-FORMAT.md` |
| `.adv/specs/domain-context/ADR-FORMAT.md` | `skills/engineering/grill-with-docs/ADR-FORMAT.md` |

These reference docs back the `rq-domainContext01` (CONTEXT.md format) and `rq-domainContextADR01` (ADR format + 3-criteria sparingly rubric) requirements in `.adv/specs/domain-context/spec.json`.

### Adaptations

Each vendored file has an HTML comment attribution header at the top of the file (before YAML frontmatter for SKILL.md files; at top for plain markdown files; after shebang for scripts). Frontmatter `name` fields renamed where applicable; otherwise content preserved verbatim except for the noted minimal adaptation to `adv-skill-author`.

### Exclusions

The following `mattpocock/skills` skills are intentionally **NOT** adopted because their ADV equivalents are gate-bound and machine-enforced. See `ADV_INSTRUCTIONS.md § Skill Discovery Protocol` Excluded Skills subsection (added by P5) for per-skill rationale:

- `grill-me`, `grill-with-docs` (superseded by `/adv-clarify` + 11-cat ambiguity taxonomy)
- `to-prd` (superseded by `/adv-proposal` + `/adv-research`)
- `to-issues` (superseded by `/adv-triage` + GH project integration)
- `triage` (superseded by `/adv-triage` with WSJF + ROADMAP regen)
- `tdd` (superseded by RSTC protocol + `adv_run_test` red/green)

### MIT License (mattpocock/skills)

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
