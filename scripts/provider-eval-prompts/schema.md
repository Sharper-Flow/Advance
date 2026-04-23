# Provider Evaluation Prompt Schema

## Overview

This document defines the YAML schema for provider evaluation prompts used in
ADV provider-specific testing. Each YAML file contains a collection of test
prompts targeting known failure modes of a specific LLM provider.

## File Structure

```yaml
version: 1              # Schema version (currently 1)
provider: <string>      # Provider identifier: glm | kimi | claude | gpt | shared
prompts:                # Array of test prompts
  - id: <string>        # Unique prompt identifier (kebab-case)
    category: <string>  # Failure mode category (snake_case)
    provider_targets:   # Which providers this test applies to
      - <provider_id>
    query: |            # The actual prompt text (multiline string)
      <prompt content>
    expected_patterns:  # Patterns that MUST appear in correct response
      - <pattern>
    forbidden_patterns: # Patterns that MUST NOT appear in correct response
      - <pattern>
    notes: <string>     # Why this test exists (human-readable)
```

## Field Reference

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | Yes | Schema version. Currently `1`. |
| `provider` | string | Yes | Primary provider identifier or `shared` for cross-provider tests. |
| `prompts` | array | Yes | List of test prompt definitions. |

### Prompt Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier in kebab-case (e.g., `rule-scope-drift-01`). |
| `category` | string | Yes | Failure mode category in snake_case. Used for grouping and reporting. |
| `provider_targets` | array | Yes | List of provider IDs this test targets. `shared` tests include all providers. |
| `query` | string | Yes | The actual prompt text sent to the model. Use `|` for multiline YAML strings. |
| `expected_patterns` | array | Yes | Patterns that MUST appear in a correct response. At least one must match. |
| `forbidden_patterns` | array | Yes | Patterns that MUST NOT appear in a correct response. Any match is a failure. |
| `notes` | string | Yes | Human-readable explanation of what failure mode this test targets. |

## Pattern Syntax

Patterns use a simple syntax that supports both plain substring matching and
regular expressions:

### Plain Substrings

```yaml
expected_patterns:
  - "adv_change_show"      # Exact substring match
  - "MCP tools"            # Case-sensitive by default
```

### Regular Expressions

Regex patterns are indicated by wrapping in `/.../`:

```yaml
expected_patterns:
  - "/adv_.*show/"         # Matches adv_change_show, adv_task_show, etc.
  - "/(correctness.*){3,}/" # Detects repetition (3+ occurrences)
```

### Escaping

- YAML special characters in plain substrings: quote the string
- Regex backslashes: use double backslash in YAML (`\\d` for `\d`)
- Pipe characters in regex: wrap in quotes or use YAML block scalar

## Scoring

### Per-Constraint Scoring

Each prompt is evaluated against two constraint types:

1. **Expected Patterns** (must-match): Binary pass/fail per pattern
   - At least one expected pattern must match for the constraint to pass
   - If no expected patterns match → constraint failure

2. **Forbidden Patterns** (must-not-match): Binary pass/fail per pattern
   - Any forbidden pattern match → constraint failure
   - If no forbidden patterns match → constraint passes

### Aggregate Pass Rate

For a single prompt:
```
pass = (expected_pass AND forbidden_pass)
```

For a provider evaluation run:
```
pass_rate = (passed_prompts / total_prompts) * 100
```

### Scoring Example

```yaml
expected_patterns:
  - "adv_change_show"      # Match ✓
  - "MCP tools"            # Match ✓
forbidden_patterns:
  - "~/.local/share"       # No match ✓
  - "cat.*change"          # No match ✓
```

Result: `pass` (all constraints satisfied)

## Categories

Common failure mode categories:

| Category | Description |
|----------|-------------|
| `rule_scope_drift` | Rules applied outside their stated context |
| `tool_selection` | Wrong tool chosen for the task |
| `multilingual` | Language context affecting tool argument format |
| `state_access` | Direct file reads instead of MCP tools |
| `gate_discipline` | Skipping required gates |
| `never_rule_generalization` | Extending NEVER rules beyond scope |
| `repetition` | Looping or repetitive output |
| `constraint_drop` | Losing track of early constraints |
| `tool_order` | Parallelizing sequential dependencies |
| `context_verify` | Failing to re-verify critical constraints |
| `tool_routing` | Not following lgrep-first policy |
| `instruction_priority` | Not resolving conflicts by priority |

## Adding New Prompts

1. Choose the appropriate provider file (`glm.yaml`, `kimi.yaml`, or `shared.yaml`)
2. Add a new entry to the `prompts` array
3. Use a unique `id` in kebab-case with incrementing suffix
4. Set `category` to an existing or new snake_case category
5. Write a realistic query that looks like an actual user request
6. Define patterns that clearly distinguish correct from incorrect behavior
7. Add notes explaining the specific failure mode being tested

### Example New Prompt

```yaml
  - id: my-new-test-01
    category: my_category
    provider_targets: [glm]
    query: |
      <realistic user request>
    expected_patterns:
      - "correct_tool_name"
      - "correct_concept"
    forbidden_patterns:
      - "wrong_tool"
      - "forbidden_pattern"
    notes: |
      Explanation of what failure mode this catches and why it matters.
```

## Provider Identifiers

| Identifier | Provider |
|------------|----------|
| `glm` | Zhipu AI GLM |
| `kimi` | Moonshot Kimi |
| `claude` | Anthropic Claude |
| `gpt` | OpenAI GPT |
| `shared` | Cross-provider tests |

## Version History

| Version | Changes |
|---------|---------|
| 1 | Initial schema — supports plain substrings and regex patterns, binary per-constraint scoring |
