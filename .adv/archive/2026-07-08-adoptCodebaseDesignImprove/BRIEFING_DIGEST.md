# Archive Briefing Digest

**Change ID:** adoptCodebaseDesignImprove
**Title:** Adopt codebase-design and improve-codebase-architecture
**Status:** archived
**Generated:** 2026-07-08T18:36:18.990Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 35 of 35 durable facts.

- **[agenda]** follow_ups: If orchestrator requires full domain-context spec validation, repair the domain-context spec schema so adv_spec can read it; current proper read path fails before returning requirements.
- **[archive_only_evidence]** sources: OpenCode skills frontmatter docs: Official OpenCode skills docs state SKILL.md frontmatter must include name and description; recognized fields are name, description, license, compatibility, and metadata; unknown frontmatter fields are ignored.
- **[archive_only_evidence]** sources: ADV Skill Discovery Protocol: ADV discovery searches trusted skill dirs, matches YAML frontmatter keywords against tech stack/change domain, then loads matching skills via skill("{name}"); metadata listed is name, description, keywords.
- **[archive_only_evidence]** sources: ADV discover spec rq-disc02: /adv-discover MUST execute the skill discovery protocol and report Skills Considered, including action taken for examined skills.
- **[archive_only_evidence]** sources: OpenCode upstream sampled tree: Upstream commit contains the two target directories and five target files: codebase-design/SKILL.md, DEEPENING.md, DESIGN-IT-TWICE.md and improve-codebase-architecture/SKILL.md, HTML-REPORT.md.
- **[archive_only_evidence]** sources: Upstream improve-codebase-architecture frontmatter: Upstream SKILL.md frontmatter includes disable-model-invocation: true and description; body depends on codebase-design vocabulary.
- **[archive_only_evidence]** sources: Upstream MIT license: MIT license grants reuse and requires copyright and permission notice inclusion in all copies or substantial portions.
- **[archive_only_evidence]** sources: Existing vendor precedent header: Existing mattpocock vendor skill uses a five-line HTML attribution block before YAML frontmatter, then adv-prefixed name.
- **[archive_only_evidence]** sources: Third-party license precedent: Current third-party license file tracks mattpocock source URL, author, license, imported SHA/date/change, vendored rows, and adaptation policy.
- **[archive_only_evidence]** sources: Deploy skill sync surface: Deploy script documents copying skills/adv-*/SKILL.md to ~/.config/opencode/skills/adv-*; design's no script change claim aligns with existing glob.
- **[archive_only_evidence]** sources: arch-scan spec: Arch-scan spec requires structural owners for workflow/spec correctness and JSON coverage output contracts for /adv-arch-scan.
- **[archive_only_evidence]** sources: tdd-contract spec: TDD contract allows non-code/docs deliverables to avoid fake red/green TDD while still requiring evidence policy; code tasks retain inline TDD.
- **[archive_only_evidence]** sources: advance-workflow spec: ADV workflow is seven sequential gates: proposal, discovery, design, planning, execution, acceptance, release.
- **[archive_only_evidence]** sources: domain-context spec access: adv_spec show domain-context failed schema validation: requirements meta.merged_from expected string, received undefined. Proper ADV read path could not return this spec.
- **[archive_only_evidence]** architecture_assessment: Design is mostly correct for bounded vendoring, attribution, license update, deploy surface, and no TypeScript/API/script changes. However it contains a contract-compromise blocker: it assumes preserve disable-model-invocation: true prevents auto/model invocation for adv-improve-codebase-architecture, but official OpenCode docs say unknown frontmatter fields are ignored, and ADV Skill Discovery loads matching keyword skills via skill("{name}") with no documented disable-model-invocation check. Because agreement requires keywords matching and also requires no auto-load for improve-codebase-architecture, the current design must add an in-scope documentation/selection rule or otherwise avoid matching auto-load for that skill before it is safe to proceed. Domain-context spec could not be fully validated via adv_spec due a schema-validation error, so that portion is inconclusive rather than a design failure.
- **[unresolved_action]** validation.blockers: A4/C3/SC2 conflict: design relies on disable-model-invocation: true being honored, but OpenCode docs say unknown skill frontmatter fields are ignored, and ADV Skill Discovery loads keyword matches via skill("{name}") with no disable-model-invocation handling documented.
- **[agenda]** follow_ups: Optional hygiene follow-up: repair .adv/specs/domain-context/spec.json schema validation so adv_spec can show rq-domainContext01/rq-domainContextADR01 without error.
- **[archive_only_evidence]** sources: Agreement artifact: Defines Objectives 1-7, AC1-AC7, SC1-SC2, constraints C1-C8, and avoidances for vendor-only skill adoption.
- **[archive_only_evidence]** sources: Design artifact: Proposes directory-append/doc-update architecture, phases A-G, LBP analysis, DDC1-DDC5, risks, and self-validation caveat.
- **[archive_only_evidence]** sources: arch-scan spec: Requires structural correctness ownership for workflow/spec boundaries, stack-pack coverage, ADV pack structural enforcer citation, and JSON/text architecture coverage metadata.
- **[archive_only_evidence]** sources: advance-workflow spec: Requires seven sequential gates, execution gate task completion, archive gating, and re-entry for added scope.
- **[archive_only_evidence]** sources: domain-context spec read failure: Spec read failed validation: requirements.0/1 meta.merged_from expected string but undefined; could not fully validate rq-domainContext01/rq-domainContextADR01 through required ADV tool.
- **[archive_only_evidence]** sources: ADV Skill Discovery Protocol: Skill Discovery reads trusted skill dirs, matches YAML frontmatter keywords, loads via skill(name), skips skills without frontmatter/keywords, and expects name/description/keywords metadata.
- **[archive_only_evidence]** sources: Domain context instruction anchor: Documents rq-domainContext01 domain context artifacts as MAY-read advisory artifacts for /adv-discover, /adv-design, and /adv-clarify.
- **[archive_only_evidence]** sources: Excluded skills table: Current Excluded Skills table lists Pocock overlap skills but not two newly adopted open-zone skills, matching planned doc update target.
- **[archive_only_evidence]** sources: adv-discover Phase 1.5: Confirms Phase 1.5 skill discovery + gap creation uses trusted skill directories, keyword matching, skill loading, and considered-skills output.
- **[archive_only_evidence]** sources: Existing third-party license table: Existing mattpocock/skills MIT section has source, author, license, imported SHA/date, Vendored skills table with Local path/Source path/Renamed-to columns, and adaptations note.
- **[archive_only_evidence]** sources: Existing attribution header precedent: Shows required five-line HTML comment: Vendored from, Author, License, Renamed to per ADR-001, Imported date/change.
- **[archive_only_evidence]** sources: ADR-001: Accepts adv- prefix for vendored Pocock skills, cites deploy sync glob and rq-sc02 namespace distinction, evaluates ADR rubric, and states future Pocock vendoring follows established pattern.
- **[archive_only_evidence]** sources: Deploy skill sync glob: Existing whole-directory copy iterates skills/adv-*/ directories and copies all files under each skill to global skills directory, so sibling docs are deployed without script changes.
- **[archive_only_evidence]** sources: Upstream codebase-design SKILL.md: Source frontmatter name is codebase-design and body defines deep-module vocabulary: module, interface, depth, seam, adapter.
- **[archive_only_evidence]** sources: Upstream improve-codebase-architecture SKILL.md: Source frontmatter name is improve-codebase-architecture and includes disable-model-invocation: true; body invokes codebase-design vocabulary and organic architecture exploration.
- **[archive_only_evidence]** sources: Upstream sibling docs: Searchcode verified DEEPENING.md, DESIGN-IT-TWICE.md, and HTML-REPORT.md exist at upstream commit d574778f94cf620fcc8ce741584093bc650a61d3.
- **[archive_only_evidence]** sources: Upstream MIT license: mattpocock/skills license grants copy/modify/distribute rights subject to including copyright and permission notice.
- **[archive_only_evidence]** architecture_assessment: Architecture is low-risk directory append plus documentation update. It solves AC1-AC7/SC1-SC2: phases A-C fetch and vendor exact upstream files, phase D updates LICENSE, phase E updates ADV_INSTRUCTIONS, phase F verifies check/deploy/test/skill discovery, and phase G ships. Simplicity is appropriate because SKILL.md-only import would not satisfy approved AC1/Objectives requiring five files, and deploy-local already whole-directory-copies adv-* skill directories. Main caution: Phase B/C wording says sibling docs are copied 'verbatim'; DDC1 and AC1 require a 5-line attribution header on every vendored file, so execution should interpret 'verbatim' as 'verbatim after attribution header' for DEEPENING.md, DESIGN-IT-TWICE.md, and HTML-REPORT.md. Spec-law: no JSON output contract or scanner backend changes are proposed, so rq-archcov01/rq-archp33 are not violated; seven-gate sequencing remains intact per advance-workflow; domain-context could not be fully validated because adv_spec failed schema validation for that spec, though ADV_INSTRUCTIONS documents rq-domainContext01 as advisory domain-context artifact behavior.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |

## Unresolved Actions

- A4/C3/SC2 conflict: design relies on disable-model-invocation: true being honored, but OpenCode docs say unknown skill frontmatter fields are ignored, and ADV Skill Discovery loads keyword matches via skill("{name}") with no disable-model-invocation handling documented.
