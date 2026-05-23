# Problem Statement

ADV command and skill guidance lacks a tested load-site taxonomy. Without one, command files can accumulate stale `skill(...)` references, load worker-only methodology into the main orchestrator context, or imply that sub-agents own workflow authority they must not own.

The change must make command/skill responsibility explicit and structurally guarded while preserving the seven-gate lifecycle, orchestrator-owned state/gate/user-checkpoint authority, skill read-only semantics, and existing scout behavior.
