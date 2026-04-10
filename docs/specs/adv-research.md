# ADV Research Command (RETIRED)

> **Version:** 1.1.0
> **Updated:** 2026-04-08

## Purpose

RETIRED: /adv-research has been replaced by /adv-discover (discovery gate) and /adv-design (design gate) in the 7-gate collaborative workflow. This spec is preserved for historical reference and legacy migration. New changes should use /adv-discover for context gathering and /adv-design for architecture validation.

## Requirements

### Research Produces Validated Decisions Only (RETIRED)

**ID:** `rq-res-out1` | **Priority:** **[MUST]**

RETIRED: This requirement is superseded by /adv-discover (context gathering, agreement.md) and /adv-design (architecture validation, design.md). Legacy changes with a research gate are auto-migrated to the discovery+design gates.

**Tags:** `research`, `boundary`, `validation`, `retired`

#### Scenarios

**Research updates proposal.md with findings but creates zero tasks (RETIRED)** (`rq-res-out1.1`)

**Given:**
- A user invokes /adv-research on an active change

**When:** The command is invoked

**Then:**
- The command redirects to /adv-discover and /adv-design
- No direct research execution occurs

**Research on deployed spec creates change but defers tasks to prep (RETIRED)** (`rq-res-out1.2`)

**Given:**
- A user invokes /adv-research on a deployed spec

**When:** The command is invoked

**Then:**
- The command redirects to /adv-discover and /adv-design
- Legacy behavior is no longer active

---

### Research Validates Architecture and Best Practices (RETIRED)

**ID:** `rq-res-scope1` | **Priority:** **[MUST]**

RETIRED: Architecture validation is now handled by /adv-design (design gate). Context gathering is handled by /adv-discover (discovery gate).

**Tags:** `research`, `boundary`, `architecture`, `retired`

#### Scenarios

**Architecture health assessment included in report (RETIRED)** (`rq-res-scope1.1`)

**Given:**
- A user invokes /adv-research on a change

**When:** The command is invoked

**Then:**
- The command redirects to /adv-design for architecture validation

**Research completes the research gate (RETIRED)** (`rq-res-scope1.2`)

**Given:**
- A user invokes /adv-research on an active change

**When:** The command is invoked

**Then:**
- The research gate no longer exists in the 7-gate model
- Legacy changes with a research gate are auto-migrated to discovery+design

---

### Research Prohibited Actions (RETIRED)

**ID:** `rq-res-neg1` | **Priority:** **[MUST]**

RETIRED: These constraints are now distributed across /adv-discover and /adv-design. Task synthesis remains the exclusive responsibility of /adv-prep.

**Tags:** `research`, `boundary`, `negative`, `retired`

#### Scenarios

**No task creation during research (RETIRED)** (`rq-res-neg1.1`)

**Given:**
- A user invokes /adv-research

**When:** The command is invoked

**Then:**
- The command redirects to /adv-discover and /adv-design
- Task creation remains exclusive to /adv-prep

**Research only completes the research gate (RETIRED)** (`rq-res-neg1.2`)

**Given:**
- A user invokes /adv-research

**When:** The command is invoked

**Then:**
- The research gate no longer exists; replaced by discovery and design gates

---

### Research Output Contract for Prep Consumption (RETIRED)

**ID:** `rq-res-contract1` | **Priority:** **[SHOULD]**

RETIRED: The research output contract is superseded by agreement.md (from /adv-discover + /adv-agree) and design.md (from /adv-design + /adv-present), which /adv-prep consumes for task synthesis.

**Tags:** `research`, `boundary`, `output-contract`, `retired`

#### Scenarios

**Research output contains structured sections for prep (RETIRED)** (`rq-res-contract1.1`)

**Given:**
- Research completes with findings

**When:** The command is invoked

**Then:**
- The command redirects to /adv-discover and /adv-design
- agreement.md and design.md replace the Research Validation section in proposal.md

---
