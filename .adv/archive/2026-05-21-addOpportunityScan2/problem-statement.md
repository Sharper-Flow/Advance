# Problem Statement

ADV discovery and design phases lack a structured mechanism for identifying improvement opportunities that emerge naturally during analysis. Agents notice optimization candidates, convention violations, and architectural gaps but have no way to systematically capture, rank, and route these observations. This leads to:

1. Lost improvement opportunities during discovery — observations are made but not surfaced
2. Redundant design work — existing solutions or partial implementations are not checked before designing from scratch
3. No taxonomy for routing — no way to distinguish "promote to a new change" from "note for later" or "dismiss"