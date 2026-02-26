# Advance Plugin Exploration - Index & Navigation

This exploration documents the structure, voice, and patterns used in the Advance (ADV) plugin.

## 📚 Documentation Files Generated

### 1. **EXPLORATION_SUMMARY.md** ← START HERE
   - **Purpose:** Quick overview of key findings
   - **Content:** 
     - Command documentation location
     - Main instruction file summary
     - Voice & style characteristics
     - Priority & conflict resolution
     - Pattern examples
     - Table patterns used
     - File organization quick map
     - Key patterns to adopt
     - Metrics
   - **Best for:** Quick reference, high-level understanding

### 2. **EXPLORE_FINDINGS.md** ← COMPREHENSIVE REFERENCE
   - **Purpose:** Deep dive into all aspects of the plugin
   - **Sections:**
     1. Directory structure with full context
     2. Command documentation patterns
     3. Voice & style patterns (4 subsections)
     4. Priority & conflict resolution mechanisms
     5. Key instruction patterns
     6. Table & pattern formats
     7. Documentation locations & file patterns
     8. External state layout
     9. Summary of voice & patterns
   - **Best for:** Understanding every detail, implementation guidance

### 3. **VOICE_STYLE_REFERENCE.md** ← QUICK CARD
   - **Purpose:** Portable reference for voice and patterns
   - **Content:**
     - Core voice characteristics
     - Status markers with emoji
     - Documentation patterns
     - Constraints & rules
     - Language markers
     - Table patterns
     - Flow & progression
     - File organization
     - TDD protocol
     - Context freshness rules
     - API tool naming
   - **Best for:** Quick lookup while working, pattern matching

## 🎯 How to Use These Documents

### For Understanding the Plugin
1. **Quick intro** → Read EXPLORATION_SUMMARY.md
2. **Deep dive** → Read EXPLORE_FINDINGS.md
3. **Implementation** → Reference VOICE_STYLE_REFERENCE.md while writing

### For Writing New Documentation
- Check "Documentation Pattern Examples" in EXPLORATION_SUMMARY.md
- Look at "Proposal Structure" in VOICE_STYLE_REFERENCE.md
- Review example proposals in `.adv/changes/*/proposal.md`

### For Implementing Commands
- Check "Command Definition" format in VOICE_STYLE_REFERENCE.md
- Reference `plugin/src/manifest.ts` for command metadata structure
- Follow "Table Patterns" for documentation format

### For Understanding Voice
- Read "Voice & Style Characteristics" in EXPLORE_FINDINGS.md
- Review "Signature Phrases" in VOICE_STYLE_REFERENCE.md
- Study existing ADV_INSTRUCTIONS.md and README.md

### For Gate Implementation
- See "6-Gate Quality Checklist" in VOICE_STYLE_REFERENCE.md
- Read `docs/adv-gates.md` for full gate specification
- Check "Enforcement Mechanisms" in EXPLORATION_SUMMARY.md

## 📍 Original Source Files

### Main Instructions
- **ADV_INSTRUCTIONS.md** (264 lines) — Core instructions for agents
- **README.md** (450 lines) — Overview, commands, features, workflow

### Documentation
- **docs/adv-gates.md** — 6-gate quality checklist details
- **docs/adv-workflow.md** — Detailed workflow documentation
- **docs/adv-question-tool.md** — Question tool usage
- **docs/adv-task-report.md** — Task status report format

### Code
- **plugin/src/manifest.ts** — Command definitions (TypeScript)
- **plugin/src/types.ts** — Zod schemas for all entities (895 lines)
- **plugin/src/tools/** — MCP tool implementations (8 files)

### Examples
- **.adv/changes/*/proposal.md** — Real change proposals (14 active changes)
- **.adv/archive/** — Completed changes with summaries

## 🔑 Key Concepts

### Specs Become Laws
The core philosophy: Specs are the single source of truth. All changes are validated against specs.

### 6-Gate Quality Checklist
Sequential, non-skippable gates: research → prep → implementation → review → harden → signoff

### Status Markers
Emoji-based progress indicators: 🚀 🔴 🟢 📡 🌍 💀 🎤

### Voice Markers
Signature phrases: "Specs become laws", "Context survives", "No Skip/Defer"

### Mandatory Keywords
MUST, NEVER, CRITICAL, MANDATORY, PROHIBITED (capitalized for hard constraints)

## 📊 Plugin Statistics

| Item | Count |
|------|-------|
| Total commands | 14 |
| Phases | 6 |
| Quality gates | 6 |
| Status markers | 8 |
| Tool files | 8 |
| MCP tools | 37+ |
| External state entities | 5 |
| Active changes | 14 |
| Archived changes | 10 |

## 🎨 Documentation Patterns

### Command Definition
```typescript
{
  name: "adv-apply",
  description: "Implement change with autonomous retry, TDD, and global final loop",
  phase: "implementation",
  gate: "implementation",
  requiresChangeId: true,
  prerequisites: ["adv-prep"],
  successors: ["adv-review"],
}
```

### Proposal Structure
1. Summary (2-3 sentences)
2. Why (problem breakdown)
3. Research Validation (decision + source + citation)
4. Architecture Corrections (critical findings)
5. Implementation (detailed approach)

### Decision Table
```markdown
| Decision | Validation | Source |
|----------|------------|--------|
| Use Zod `.passthrough()` | VALIDATED | Zod docs |
```

## 🚀 Quick Start for New Contributors

1. **Understand the philosophy** → Read EXPLORATION_SUMMARY.md (Sections 4-5)
2. **Learn the voice** → Read VOICE_STYLE_REFERENCE.md (Sections 1-2)
3. **Study examples** → Review ADV_INSTRUCTIONS.md and README.md
4. **Check patterns** → Reference VOICE_STYLE_REFERENCE.md tables
5. **Write documentation** → Follow "Proposal Structure" pattern
6. **Implement** → Use command definition format and gate ordering

## ❓ Questions Answered

### Where are commands documented?
**Answer:** In `plugin/src/manifest.ts` as a TypeScript constant with metadata.

### How are instructions formatted?
**Answer:** Tables, bullet points, ASCII diagrams, emoji markers, problem-first approach.

### What's the voice?
**Answer:** Direct, imperative, spec-first, problem-centric, technically rigorous.

### How do gates work?
**Answer:** 6 sequential, non-skippable gates; archive blocks until all complete.

### What are status markers?
**Answer:** 8 emoji-based markers emitted at start of response: 🚀 🔴 🟢 📡 🌍 💀 🎤

### How are conflicts resolved?
**Answer:** Gates enforce order, cancellations need approval, cross-repo tasks must execute in target repo.

### What happens after 3 failures?
**Answer:** Emit [ADV:DOOM_LOOP], document attempts, ask user for guidance.

## 📁 File Structure Quick Map

```
~/dev/oc-plugins/advance/
├── ADV_INSTRUCTIONS.md         ← Core instructions
├── README.md                   ← Overview
├── EXPLORATION_SUMMARY.md      ← (Generated) Key findings
├── EXPLORE_FINDINGS.md         ← (Generated) Deep dive
├── VOICE_STYLE_REFERENCE.md    ← (Generated) Quick reference
├── EXPLORATION_INDEX.md        ← (This file) Navigation
├── docs/
│   ├── adv-gates.md
│   ├── adv-workflow.md
│   └── adv-question-tool.md
├── plugin/src/
│   ├── manifest.ts             ← Command definitions
│   ├── types.ts                ← Zod schemas
│   └── tools/                  ← 8 tool files
└── .adv/
    ├── changes/                ← Active proposals
    └── archive/                ← Completed changes
```

---

**Last Updated:** 2026-02-25  
**Generated by:** Explore Agent  
**Source:** ~/dev/oc-plugins/advance/
