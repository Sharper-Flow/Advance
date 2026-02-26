# Advance Plugin Exploration Summary

## ✅ Key Findings

### 1. **Command Documentation Location**
Commands are defined in **TypeScript** (`plugin/src/manifest.ts`), not markdown files. This is a compile-time constant that includes:
- Phase (core, pre-implementation, implementation, etc.)
- Gate affinity (which quality gate the command affects)
- Prerequisites and successors (workflow ordering)
- Whether it requires a change ID

### 2. **Main Instruction File**
**`ADV_INSTRUCTIONS.md`** (264 lines) contains:
- Command tables (organized by phase)
- Status markers with emoji
- 6-Gate quality checklist
- Critical protocols (TDD, doom loop, cross-repo, cancellation)
- Worktree integration details
- When to use ADV

### 3. **Documentation Structure**
- **Root level:** ADV_INSTRUCTIONS.md, README.md (450 lines)
- **docs/** directory: adv-gates.md, adv-workflow.md, adv-question-tool.md, QUICK_REFERENCE.md
- **In code:** manifest.ts (command metadata), types.ts (895 lines of Zod schemas)
- **In plugin state:** `.adv/changes/*/proposal.md` (change-specific docs)

### 4. **Voice & Style Characteristics**

#### Signature Phrases
- "Specs become laws" — Signals spec-driven approach
- "Context survives" — Signals session/worktree persistence
- "No Skip/Defer" — Forces completion or escalation
- "PROHIBITED: ..." — Hard constraints

#### Tone
- **Direct & imperative** — Uses "MUST", "NEVER", "do", "don't"
- **Problem-first** — Every feature intro starts with "The Problem"
- **Structured for scanning** — Tables, bullets, emoji, ASCII diagrams
- **Technically rigorous** — Citations, decision validation, sources

#### Status Markers (Emitted at Start of Agent Response)
- `[ADV:ROCKET]` 🚀 — Active work
- `[ADV:TDD_RED]` 🔴 — Writing tests
- `[ADV:TDD_GREEN]` 🟢 — Implementing
- `[ADV:MOON]` 📡 — Sub-agents running
- `[ADV:EARTH]` 🌍 — Complete/awaiting input
- `[ADV:DOOM_LOOP]` 💀 — Stuck after 3 attempts
- `[ADV:MIC]` 🎤 — Needs approval

### 5. **Priority & Conflict Resolution**

#### 6-Gate Sequential Checklist (Non-Skippable)
```
research → prep → implementation → review → harden → signoff
```

#### Enforcement Mechanisms
- **Archive BLOCKS** unless all 6 gates satisfied
- **Auto-complete** lightweight versions of missing gates
- **Legacy support** for pre-existing changes (legacy status = satisfied)
- **ALL cancellations** require explicit user approval

#### Doom Loop Detection
After 3 failed attempts:
1. STOP (don't retry same approach)
2. Emit `[ADV:DOOM_LOOP]`
3. Document all 3 attempts
4. Ask user via question tool

#### Cross-Repo Rule
- Tasks with target_repo MUST execute in that directory
- "Different repo" is NEVER valid cancellation reason
- Switch `workdir` to target path

### 6. **Documentation Pattern Examples**

#### Command Definition
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

#### Proposal Structure
1. Summary (2-3 sentences)
2. Why (problem breakdown)
3. Research Validation (decision + source + citation)
4. Architecture Corrections (critical findings)
5. Implementation (detailed approach)

#### Decision Presentation
```markdown
| Decision | Validation | Source |
|----------|------------|--------|
| Use Zod `.passthrough()` | VALIDATED | Zod docs |
```

### 7. **Table Patterns Used**

| Pattern | Use | Example |
|---------|-----|---------|
| 2-column: Name/Purpose | Command listing | Command / Purpose |
| 3-column: Decision/Validation/Source | Research decisions | Decision / Validation / Source |
| 4-column: # / ID / Name / Trigger | Gate sequence | # / Gate ID / Name / Triggered By |
| 3-column: Missing/Auto/Lightweight | Auto-complete | If Missing / Auto-Execute / Lightweight |

### 8. **Language Markers**

#### Mandatory Keywords (Capitalized)
- **MUST** — Non-negotiable
- **NEVER** — Hard prohibition
- **CRITICAL** — Important decision
- **MANDATORY** — Required step
- **PROHIBITED** — Explicitly forbidden

#### Validation Keywords
- **VALIDATED** — Confirmed against source
- **ANTI-PATTERN** — Known bad practice
- **LEGACY** — Grandfathered, not required
- **SKIPPED** — Explicitly bypassed

#### Quality Keywords (in review findings)
- **blocker** — Blocks progression
- **issue** — Should be fixed
- **suggestion** — Nice-to-have
- **question** — Needs clarity
- **nit:** — Trivial comment

---

## 📁 File Organization Quick Map

| What | Where |
|------|-------|
| **Commands** | `plugin/src/manifest.ts` (TypeScript constant) |
| **Core Instructions** | `ADV_INSTRUCTIONS.md` (264 lines) |
| **Overview** | `README.md` (450 lines) |
| **Gate Details** | `docs/adv-gates.md` |
| **Workflow Details** | `docs/adv-workflow.md` |
| **Tool Implementations** | `plugin/src/tools/*.ts` (8 tool files) |
| **Type Definitions** | `plugin/src/types.ts` (895 lines) |
| **Change Proposals** | `.adv/changes/*/proposal.md` |
| **Archived Changes** | `.adv/archive/*/change.json` + `ARCHIVE_SUMMARY.md` |

---

## 🎯 Key Patterns to Adopt

1. **Spec-First Thinking** — Specs are the "law", changes validate against them
2. **Sequential Gates** — 6 mandatory quality gates, non-skippable, archive blocks until complete
3. **Problem-Solution Framing** — Every feature/doc starts with "The Problem"
4. **Status Transparency** — Emoji markers, gate tracking, task reports, accumulated wisdom
5. **Error Prevention** — "PROHIBITED", "MUST", "NEVER" for hard constraints
6. **Technical Rigor** — Always cite sources, validate decisions, show research
7. **Structured for Scanning** — Tables, bullets, ASCII diagrams, visual breaks
8. **No Partial Ship** — Everything archived, every decision logged

---

## 📊 Documentation Metrics

| Item | Count |
|------|-------|
| **Core Commands** | 4 (proposal, validate, apply, archive) |
| **Pre-Implementation** | 3 (clarify, research, prep) |
| **Post-Implementation** | 3 (review, harden, audit) |
| **Advanced** | 2 (refactor, coordinate) |
| **Utility** | 1 (improve) |
| **Total Commands** | 14 |
| **Tool Files** | 8 (status, change, task, spec, gate, agenda, wisdom, project) |
| **MCP Tools** | 37+ (per README) |
| **Gate Sequence** | 6 (research, prep, implementation, review, harden, signoff) |
| **Status Markers** | 8 (ROCKET, TDD_RED, TDD_GREEN, MOON, EARTH, DOOM_LOOP, MIC, TASK_STATUS_REPORT) |

---

## Generated Output

✅ **EXPLORE_FINDINGS.md** — Comprehensive 9-section analysis saved to ~/dev/oc-plugins/advance/  
✅ **voice_style_quick_ref.md** — Quick reference for voice/style/patterns  
✅ **This summary.md** — Key findings and mappings

