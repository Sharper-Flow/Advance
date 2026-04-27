# Test Fixtures — Pre-Prep Clarification Rigor

Contract test fixtures for verifying the ambiguity taxonomy integration in `/adv-proposal`, `/adv-discover`, and `/adv-clarify`. Each fixture maps to an acceptance criterion from the change proposal.

Cross-references:
- `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy` — canonical taxonomy
- `.opencode/command/adv-proposal.md` — Phase 2.5/2.6
- `.opencode/command/adv-discover.md` — Phase 2 AMBIGUITY ANALYSIS + Phase 2.5 Trigger Evaluation
- `.opencode/command/adv-clarify.md` — Findings-Driven Mode
- `docs/checklists/proposal-checklist.md` — Scope Section + B/F/S scan
- `docs/checklists/discover-checklist.md` — Ambiguity Analysis Protocol

---

## AC1: Vague success criteria → S1 HIGH finding

**Input:** Proposal with success criteria containing "Make the response fast"

```markdown
## Success Criteria
- Make the response fast
- Handle errors gracefully
```

**Expected agent behavior:**
1. `/adv-proposal` Phase 2.6 runs B/F/S scan
2. S category scan detects vague language in success criteria
3. Finding emitted:

```
S1  HIGH  Completion Signals  "Make the response fast" is not measurable
  Evidence: proposal.md:Success Criteria "Make the response fast"
  Reason: unclear because no measurable target (e.g. <2s, p95 <200ms) specified
```

4. Single HIGH → warning only, proposal gate proceeds (not blocked)

**Expected gate behavior:** Proposal gate completes (single HIGH does not block)

**Verification:**
- File: `.opencode/command/adv-proposal.md` Phase 2.6
- Look for: S category scan logic, HIGH severity rule, single-HIGH-non-blocking rule
- Sample run: create proposal with vague SC, verify S1 HIGH emitted, verify gate completes

---

## AC2: Missing Out of Scope → B1 CRITICAL blocks gate

**Input:** Proposal with `## Scope` containing `### In Scope` but missing `### Out of Scope`

```markdown
## Scope
### In Scope
- Add ambiguity taxonomy to ADV_INSTRUCTIONS.md
- Update proposal and discover checklists
```

**Expected agent behavior:**
1. `/adv-proposal` Phase 2.5 builds Scope section — detects missing `### Out of Scope`
2. `/adv-proposal` Phase 2.6 runs B/F/S scan
3. B category scan detects missing subsection

```
B1  CRITICAL  Boundaries  No Out of Scope subsection found
  Evidence: (no Out of Scope subsection)
  Reason: unclear because proposal does not define what is explicitly excluded
```

4. Under `clarify_enforcement: strict`: proposal gate completion MUST be refused

**Expected gate behavior:** Proposal gate blocked (CRITICAL under strict enforcement)

**Verification:**
- File: `.opencode/command/adv-proposal.md` Phase 2.6 gate-block rule
- Look for: "× MUST NOT call `adv_gate_complete` if any CRITICAL finding exists"
- File: `docs/checklists/proposal-checklist.md` Severity Rules table
- Sample run: create proposal without Out of Scope, verify B1 CRITICAL, verify gate refuses

---

## AC3: CRITICAL finding halts discovery, hands off to /adv-clarify

**Input:** Discovery analysis produces AMBIGUITY ANALYSIS with 1 CRITICAL finding

```
B1  CRITICAL  Boundaries  No Out of Scope subsection found
  Evidence: (no Out of Scope subsection)
  Reason: unclear because proposal does not define what is explicitly excluded
```

**Expected agent behavior:**
1. `/adv-discover` Phase 2 produces AMBIGUITY ANALYSIS with CRITICAL
2. `/adv-discover` Phase 2.5 evaluates findings: CRITICAL ≥ 1
3. Discovery halts — does NOT proceed to Phase 3
4. Output: "AMBIGUITY CRITICAL finding(s) detected. Run `/adv-clarify {change-id}` to resolve, then rerun `/adv-discover {change-id}`."
5. `adv_gate_complete gateId: 'discovery'` is NOT called

**Expected gate behavior:** Discovery gate remains pending

**Verification:**
- File: `.opencode/command/adv-discover.md` Phase 2.5 Trigger Evaluation
- Look for: threshold table (CRITICAL ≥ 1 → halt), handoff instruction
- File: `docs/checklists/discover-checklist.md` Trigger Evaluation Rules
- Sample run: run discovery with B1 CRITICAL, verify halt, verify no gate_complete

---

## AC4: Single HIGH → warning, discovery proceeds

**Input:** Discovery analysis produces AMBIGUITY ANALYSIS with 1 HIGH finding only

```
S1  HIGH  Completion Signals  "fast response" is not measurable
  Evidence: proposal.md:Success Criteria "fast response"
  Reason: unclear because no measurable target specified
```

**Expected agent behavior:**
1. `/adv-discover` Phase 2 produces AMBIGUITY ANALYSIS with 1 HIGH
2. `/adv-discover` Phase 2.5 evaluates: single HIGH only
3. Warning logged inline
4. Discovery proceeds to Phase 3 (Persist Discovery Findings) normally
5. Discovery gate completes

**Expected gate behavior:** Discovery gate completes

**Verification:**
- File: `.opencode/command/adv-discover.md` Phase 2.5 threshold table
- Look for: "Single HIGH only → warning logged inline, continue to Phase 3"
- Sample run: run discovery with 1 HIGH only, verify warning, verify gate completes

---

## AC5: 2+ HIGH findings halt discovery

**Input:** Discovery analysis produces AMBIGUITY ANALYSIS with 2 HIGH findings

```
F1  HIGH  Functional Scope  Success Criteria section uses placeholder text
  Evidence: proposal.md:Success Criteria "[TBD - to be defined]"
  Reason: unclear because success criteria have not been concretely specified

S1  HIGH  Completion Signals  "fast response" is not measurable
  Evidence: proposal.md:Success Criteria "fast response"
  Reason: unclear because no measurable target specified
```

**Expected agent behavior:**
1. `/adv-discover` Phase 2 produces AMBIGUITY ANALYSIS with 2 HIGH findings
2. `/adv-discover` Phase 2.5 evaluates: HIGH ≥ 2 (no CRITICAL)
3. Discovery halts — hands off to `/adv-clarify`
4. `adv_gate_complete gateId: 'discovery'` is NOT called

**Expected gate behavior:** Discovery gate remains pending

**Verification:**
- File: `.opencode/command/adv-discover.md` Phase 2.5 threshold table
- Look for: "HIGH ≥ 2 (no CRITICAL) → halt, handoff"
- Sample run: run discovery with 2 HIGH, verify halt, verify handoff instruction

---

## AC6: Finding without evidence is malformed

**Input:** Agent attempts to emit a finding without evidence field

```
B1  CRITICAL  Boundaries  Scope is unclear
  (no evidence field)
  Reason: unclear because boundaries are not defined
```

**Expected agent behavior:**
1. Agent detects the finding is missing `evidence:` field
2. Finding classified as malformed per anti-hallucination rule
3. Finding is NOT surfaced to the user
4. Agent self-corrects: adds evidence (verbatim quote or `(no X)` marker) or omits the finding

**Expected gate behavior:** No impact — malformed findings never reach gate evaluation

**Verification:**
- File: `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy` Anti-Hallucination Evidence Rule
- Look for: "Findings without valid evidence are malformed and MUST NOT be surfaced"
- File: `.adv/specs/adv-proposal/spec.json` rq-prop-tax3 scenarios
- Note: Contract enforcement in v1 is agent-honor-system (no machine validation)

---

## AC7: Post-clarify rerun produces clean coverage

**Input:** `/adv-clarify` has resolved findings and written resolution log

```markdown
## Clarify Resolution Log
- B1 (resolved 2026-04-27T10:00:00Z): Added ### Out of Scope subsection with explicit exclusions
- S1 (resolved 2026-04-27T10:01:00Z): Replaced "fast response" with "p95 < 200ms"
```

**Expected agent behavior:**
1. `/adv-discover` rerun reads `## Clarify Resolution Log` from proposal.md
2. Previously-resolved findings (B1, S1) excluded from trigger count
3. Fresh AMBIGUITY ANALYSIS produced with 0 CRITICAL, ≤1 HIGH
4. Coverage report shows clean status for B/F/S/M
5. Discovery proceeds to agreement normally

**Expected gate behavior:** Discovery gate completes on rerun

**Verification:**
- File: `.opencode/command/adv-discover.md` Phase 2.5 Resolution Log
- Look for: "previously-resolved findings excluded from current trigger count"
- File: `.opencode/command/adv-clarify.md` Findings-Driven Mode
- Sample run: run clarify, write resolution log, rerun discover, verify clean coverage

---

## AC8: Legacy in-flight changes skip enforcement (backwards-compat)

**Input:** Existing change with proposal gate already completed before rollout

**Expected agent behavior:**

**`/adv-proposal` re-invocation:**
1. Agent detects proposal gate is already `done` (gate-state check)
2. Phase 2.5 (Scope build) skipped — existing proposal preserved
3. Phase 2.6 (B/F/S scan) skipped — no retroactive enforcement
4. No gate blocking on missing Scope section

**`/adv-discover` re-invocation with discovery gate done:**
1. Agent detects discovery gate is already `done`
2. AMBIGUITY ANALYSIS not enforced retroactively
3. Existing discovery output preserved

**Expected gate behavior:** No retroactive blocking

**Verification:**
- File: `.opencode/command/adv-proposal.md` Phase 2.5 backwards-compat note
- Look for: "if proposal gate already done (re-entry case), skip rebuilding"
- File: `.opencode/command/adv-discover.md` Phase 2.5 skip rule
- Look for: "Skip trigger evaluation when discovery gate is already completed"
- File: `.adv/specs/adv-proposal/spec.json` rq-prop-tax1.2 (legacy scenario)
- File: `.adv/specs/adv-discover/spec.json` rq-disc-tax1.2 (legacy scenario)
- Sample run: invoke /adv-proposal on change with done gate, verify no Scope enforcement
