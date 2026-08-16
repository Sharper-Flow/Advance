# Third-Party Licenses

This repository vendors content from external projects under their original licenses. This file tracks all such content with source paths, original authors, and licenses.

## mattpocock/skills (MIT License)

**Source:** https://github.com/mattpocock/skills
**Author:** Matt Pocock <https://github.com/mattpocock>
**License:** MIT (see [LICENSE](#mit-license-mattpocockskills) below)
**Imported SHA:** `d574778f94cf620fcc8ce741584093bc650a61d3`
**Imported at:** 2026-05-11 (change `adoptMattpocockSkills`); 2026-07-08 (change `adoptCodebaseDesignImprove`)

### Vendored skills

| Local path | Source path | Renamed to (ADR-001) |
|---|---|---|
| `skills/adv-diagnose/SKILL.md` | `skills/engineering/diagnose/SKILL.md` | `adv-diagnose` |
| `skills/adv-diagnose/scripts/hitl-loop.template.sh` | `skills/engineering/diagnose/scripts/hitl-loop.template.sh` | (same name, prefixed dir) |
| `skills/adv-codebase-design/SKILL.md` | `skills/engineering/codebase-design/SKILL.md` | `adv-codebase-design` |
| `skills/adv-codebase-design/DEEPENING.md` | `skills/engineering/codebase-design/DEEPENING.md` | (same name) |
| `skills/adv-codebase-design/DESIGN-IT-TWICE.md` | `skills/engineering/codebase-design/DESIGN-IT-TWICE.md` | (same name) |
| `skills/adv-improve-codebase-architecture/SKILL.md` | `skills/engineering/improve-codebase-architecture/SKILL.md` | `adv-improve-codebase-architecture` |
| `skills/adv-improve-codebase-architecture/HTML-REPORT.md` | `skills/engineering/improve-codebase-architecture/HTML-REPORT.md` | (same name) |

> `adv-zoom-out`, `adv-prototype`, and `adv-skill-author` were vendored under the same import but subsequently removed from `skills/` in commit `2299160e` (change `cutAgentToolsUnder20`, 2026-08-11) as dormant. Their rows are removed here because the files are no longer present; the import history is preserved in git and in ADR-0001.

### Vendored reference docs (co-located with `domain-context` spec)

| Local path | Source path |
|---|---|
| `.adv/specs/domain-context/CONTEXT-FORMAT.md` | `skills/engineering/grill-with-docs/CONTEXT-FORMAT.md` |
| `.adv/specs/domain-context/ADR-FORMAT.md` | `skills/engineering/grill-with-docs/ADR-FORMAT.md` |

These reference docs back the `rq-domainContext01` (CONTEXT.md format) and `rq-domainContextADR01` (ADR format + 3-criteria sparingly rubric) requirements in `.adv/specs/domain-context/spec.json`.

### Adaptations

Each vendored file has an HTML comment attribution header at the top of the file (before YAML frontmatter for SKILL.md files; at top for plain markdown files; after shebang for scripts). Frontmatter `name` fields renamed where applicable; otherwise content preserved verbatim.

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
