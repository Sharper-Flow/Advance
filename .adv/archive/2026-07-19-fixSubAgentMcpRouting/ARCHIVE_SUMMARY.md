# Archive: Fix sub-agent MCP routing

**Change ID:** fixSubAgentMcpRouting
**Archived:** 2026-07-19T22:51:28.756Z
**Created:** 2026-07-19T18:46:01.446Z

## Tasks Completed

- ✅ Implement Stage 1 advance-repo changes: create explore overlay, add deploy hook, extend drift-detection test.
  > Task checkpoint completed
- ⏭️ Verification matrix: 4 agents × 2 modes (CodeMode-on / CodeMode-off).
- ✅ Commit Stage 1 changes, push, open PR, merge to trunk.
  > Task checkpoint completed
- ⏭️ Run deploy and verify deployed explore.md has the ADV_SYNC block.
- ⏭️ Rewrite stale direct-callable prose in 4 user-owned base files (post-deploy).
- ✅ Run deploy and verify deployed explore.md has the ADV_SYNC block.
  > Task checkpoint completed
- ✅ Rewrite stale direct-callable prose in 4 user-owned base files (post-deploy).
  > Task checkpoint completed
- ✅ Verification matrix: 4 agents × 2 modes (CodeMode-on / CodeMode-off).
  > Verification matrix review for SC1/SC3/AC7. Decomposed 4×2 matrix into agent-prompt × mode-runtime cells. Confirmed all 8 cells structurally pass: explore/general via overlay contract; build/plan via global lgrep-tools.md always-on instruction (AD8/OOS5 preserved asymmetry). Runtime mode-switching verified by mcp-runtime-matrix.test.ts (11/11) and live-evidence fixture transcripts. AC4 mode-neutral base prose verified across all 4 user files. Behavioral 8-cell spawning impossible from single OpenCode session (single-mode constraint); structural review + transcript fixture + AC4 evidence is the honest review-shaped evidence.

## Specs Modified

