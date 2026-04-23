import { describe, test, expect } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { appendReflection, getReflection } from "./reflection";

describe("debug reflection", () => {
  test("debug", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "reflection-debug-"));
    
    const entry = {
      id: "rf-test001",
      change_id: "change-1",
      created_at: new Date().toISOString(),
      plane1: {
        efficiency: {
          task_count: 3,
          tasks_done: 3,
          tasks_cancelled: 0,
          retry_total: 1,
          retry_density: 0.33,
          elapsed_ms: 3600000,
          per_gate_ms: { proposal: 300000, discovery: 600000 },
          threshold_tier: "auto",
        },
        quality: {
          review_findings_count: 2,
          harden_findings_count: 0,
          tdd_compliance: 1.0,
        },
        process: {
          gate_completion_rate: 1.0,
          tdd_intent_distribution: { inline: 2, separate_verification: 1 },
          delegation_count: 0,
          drift_triggers: 0,
        },
        wisdom: {
          entries_captured: 2,
          entries_promoted: 1,
          wisdom_reuse_hits: 1,
        },
      },
      plane2: {
        friction_items: [
          {
            category: "tool_gap" as const,
            tool_name: "adv_reflect",
            description: "Missing reflection tool",
            workaround: "Used manual analysis",
          },
        ],
        highlights: ["Completed on time", "Zero drift"],
        improvement_suggestions: ["Add reflection system"],
      },
    };
    
    await appendReflection(tempDir, entry);
    const result = await getReflection(tempDir, "change-1");
    console.log("Result:", result);
    
    rmSync(tempDir, { recursive: true, force: true });
  });
});
