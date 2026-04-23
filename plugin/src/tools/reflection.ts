/**
 * Reflection Tool
 *
 * Produces structured two-plane reflection reports for archived changes.
 * Plane 1: project execution metrics (efficiency, quality, process, wisdom).
 * Plane 2: system friction analysis (tool gaps, workarounds, etc.).
 */

import { z } from "zod";
import { wrapWithBanner } from "../utils/banner";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store";
import { appendReflection, type ReflectionEntry } from "../storage/reflection";
import { computePerGateDurations, classifyTier } from "./investment";

// =============================================================================
// Tool Definition
// =============================================================================

export const reflectionTools = {
  adv_reflect: {
    description:
      "Produce a structured two-plane reflection report for an archived change. " +
      "Plane 1 covers project execution (efficiency, quality, process, wisdom). " +
      "Plane 2 covers system friction (tool gaps, workarounds, missing capabilities). " +
      "Persists the report to reflections.jsonl.",
    args: {
      changeId: z.string().describe("Change ID to reflect on (must be archived)"),
    },
    execute: async (
      args: { changeId: string },
      store: Store,
    ): Promise<string> => {
      const changeResult = await store.changes.get(args.changeId);
      if (!changeResult.success) {
        return wrapWithBanner(
          { command: "adv_reflect" },
          formatToolOutput({ error: changeResult.error }),
        );
      }
      if (!changeResult.data) {
        return wrapWithBanner(
          { command: "adv_reflect" },
          formatToolOutput({ error: `Change not found: ${args.changeId}` }),
        );
      }

      const change = changeResult.data;
      if (change.status !== "archived") {
        return wrapWithBanner(
          { command: "adv_reflect" },
          formatToolOutput({
            error: `Change ${args.changeId} is not archived (status: ${change.status}). Reflection only runs on archived changes.`,
          }),
        );
      }

      const tasks = change.tasks ?? [];

      // =====================================================================
      // Plane 1: Project Execution
      // =====================================================================

      // Efficiency metrics — reuse investment.ts computation
      const taskCounts = {
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done").length,
        cancelled: tasks.filter((t) => t.status === "cancelled").length,
        pending: tasks.filter((t) => t.status === "pending").length,
        in_progress: tasks.filter((t) => t.status === "in_progress").length,
      };

      const createdMs = Date.parse(change.created_at);
      const elapsedMs =
        isNaN(createdMs) ? 0 : Math.max(0, Date.now() - createdMs);

      let retryTotal = 0;
      for (const task of tasks) {
        retryTotal += task.error_recovery?.attempts?.length ?? 0;
      }
      const retryDenominator = Math.max(1, taskCounts.done + taskCounts.cancelled);
      const retryDensity = retryTotal / retryDenominator;

      const perGateMs = computePerGateDurations(change);

      // Default thresholds (same as investment.ts defaults)
      const thresholds = {
        auto: { tasks: 3, retries: 0, elapsed_minutes: 15 },
        escalate: { tasks: 8, retries: 2, elapsed_minutes: 60 },
        hardstop: { tasks: 15, retries: 5, elapsed_minutes: 180 },
      };
      const thresholdTier = classifyTier(
        taskCounts.total,
        retryTotal,
        elapsedMs / 60_000,
        thresholds,
      );

      // Quality metrics
      const tddCompliantTasks = tasks.filter(
        (t) => t.tdd_evidence?.red && t.tdd_evidence?.green,
      ).length;
      const tddCompliance =
        tasks.length > 0 ? tddCompliantTasks / tasks.length : 0;

      // Process metrics
      const gates = change.gates ?? {};
      const gateOrder = [
        "proposal",
        "discovery",
        "design",
        "planning",
        "execution",
        "acceptance",
        "release",
      ];
      const completedGates = gateOrder.filter(
        (g) => gates[g]?.status === "done",
      ).length;
      const gateCompletionRate = completedGates / gateOrder.length;

      const tddIntentDistribution: Record<string, number> = {};
      for (const task of tasks) {
        const intent = task.metadata?.tdd_intent ?? "inline";
        tddIntentDistribution[intent] = (tddIntentDistribution[intent] ?? 0) + 1;
      }

      const delegationCount = tasks.filter(
        (t) => t.metadata?.delegation_hint === "delegate_allowed" ||
          t.metadata?.delegation_hint === "delegate_preferred",
      ).length;

      // Count drift triggers from error_recovery
      let driftTriggers = 0;
      for (const task of tasks) {
        if (task.error_recovery?.attempts?.some((a) => a.outcome === "failed")) {
          driftTriggers++;
        }
      }

      // Wisdom metrics
      const wisdomEntries = change.wisdom ?? [];
      const wisdomPromoted = wisdomEntries.filter((w) =>
        w.scope === "project" || w.id?.startsWith("pw-"),
      ).length;

      // =====================================================================
      // Plane 2: System Friction
      // =====================================================================

      const frictionItems: ReflectionEntry["plane2"]["friction_items"] = [];

      // Derive friction from wisdom entries
      for (const w of wisdomEntries) {
        if (w.type === "gotcha") {
          frictionItems.push({
            category: "docs_gap",
            description: `Gotcha captured: ${w.content.slice(0, 200)}`,
          });
        } else if (w.type === "pattern") {
          frictionItems.push({
            category: "missing_capability",
            description: `Pattern discovered: ${w.content.slice(0, 200)}`,
          });
        }
      }

      // Derive friction from error_recovery
      for (const task of tasks) {
        if (task.error_recovery?.attempts && task.error_recovery.attempts.length > 0) {
          const lastAttempt = task.error_recovery.attempts.at(-1);
          if (lastAttempt?.outcome === "failed") {
            frictionItems.push({
              category: "tool_gap",
              description: `Task "${task.title}" required ${task.error_recovery.attempts.length} retry attempts`,
              workaround: lastAttempt.fix_tried,
            });
          }
        }
      }

      // Derive friction from cancelled tasks
      for (const task of tasks) {
        if (task.status === "cancelled" && task.cancellation) {
          frictionItems.push({
            category: "ux_friction",
            description: `Task "${task.title}" was cancelled: ${task.cancellation.reason?.slice(0, 200) ?? "No reason given"}`,
          });
        }
      }

      // Highlights
      const highlights: string[] = [];
      if (taskCounts.done === taskCounts.total) {
        highlights.push("All tasks completed");
      }
      if (retryTotal === 0) {
        highlights.push("Zero retries — smooth execution");
      }
      if (gateCompletionRate === 1) {
        highlights.push("All gates completed");
      }
      if (wisdomEntries.length > 0) {
        highlights.push(`${wisdomEntries.length} wisdom entries captured`);
      }

      // Improvement suggestions
      const improvementSuggestions: string[] = [];
      if (tddCompliance < 1) {
        improvementSuggestions.push("Some tasks lack TDD evidence — consider stricter TDD enforcement");
      }
      if (retryTotal > 0) {
        improvementSuggestions.push("Retry events detected — review error_recovery patterns");
      }
      if (frictionItems.length > 0) {
        improvementSuggestions.push(`${frictionItems.length} friction items identified — review for process/tool improvements`);
      }

      // =====================================================================
      // Assemble and Persist
      // =====================================================================

      const entry: ReflectionEntry = {
        id: "", // appendReflection will generate
        change_id: change.id,
        created_at: new Date().toISOString(),
        plane1: {
          efficiency: {
            task_count: taskCounts.total,
            tasks_done: taskCounts.done,
            tasks_cancelled: taskCounts.cancelled,
            retry_total: retryTotal,
            retry_density: retryDensity,
            elapsed_ms: elapsedMs,
            per_gate_ms: perGateMs,
            threshold_tier: thresholdTier,
          },
          quality: {
            tdd_compliance: tddCompliance,
          },
          process: {
            gate_completion_rate: gateCompletionRate,
            tdd_intent_distribution: tddIntentDistribution,
            delegation_count: delegationCount,
            drift_triggers: driftTriggers,
          },
          wisdom: {
            entries_captured: wisdomEntries.length,
            entries_promoted: wisdomPromoted,
            wisdom_reuse_hits: 0, // Would need wisdom lookup to compute accurately
          },
        },
        plane2: {
          friction_items: frictionItems,
          highlights,
          improvement_suggestions: improvementSuggestions,
        },
      };

      // Persist to reflections.jsonl
      const persisted = await appendReflection(store.paths.external ?? store.paths.root, entry);

      return wrapWithBanner(
        { command: "adv_reflect" },
        formatToolOutput({
          reflection: persisted,
        }),
      );
    },
  },
};
