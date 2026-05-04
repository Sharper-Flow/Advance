/**
 * Reflection Tool
 *
 * Produces structured two-plane reflection reports for archived changes.
 * Plane 1: project execution metrics (efficiency, quality, process, wisdom).
 * Plane 2: system friction analysis (tool gaps, workarounds, etc.).
 */

import { z } from "zod";
import { join } from "path";
import { readdir } from "fs/promises";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store";
import { appendReflection, type ReflectionEntry } from "../storage/reflection";
import { listProjectWisdom } from "../storage/project-wisdom";
import { GATE_ORDER } from "../types";
import { computePerGateDurations, classifyTier } from "./investment";
import { atomicWriteFile } from "../utils/fs";
import { appendDebugLog } from "../utils/debug-log";

// =============================================================================
// Secrets Sanitization
// =============================================================================

const SECRET_PATTERNS = [
  /bearer\s+(?:token\s+)?[^\s&]+/gi,
  /api[_-]?\s*key\s*(?:[:=]|is)\s*[^\s&]+/gi,
  /password\s*(?:[:=]|is)\s*[^\s&]+/gi,
  /token\s*(?:[:=]|is)\s*[^\s&]+/gi,
  /secret\s*(?:[:=]|is)\s*[^\s&]+/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /[a-f0-9]{32,64}/gi,
];

function sanitizeSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// =============================================================================
// Provider-Specific Friction Detection
// =============================================================================

const PROVIDER_CUES: Record<string, string[]> = {
  Bun: ["bun", "bun.sh"],
  Node: ["node", "nodejs", "node.js"],
  Claude: ["claude", "anthropic"],
  GPT: ["gpt", "openai", "chatgpt"],
  Kimi: ["kimi", "moonshot"],
  GLM: ["glm", "zhipu", "chatglm"],
};

function detectProviderSpecific(
  text: string,
): { provider: string; detail: string } | null {
  const lower = text.toLowerCase();
  for (const [provider, cues] of Object.entries(PROVIDER_CUES)) {
    if (cues.some((cue) => lower.includes(cue))) {
      return {
        provider,
        detail: `Mentions ${provider}: ${text.slice(0, 120)}`,
      };
    }
  }
  return null;
}

const TOOL_GAP_GOTCHA_CUES = [
  "checkpoint tool",
  "evidence tool",
  "tool timeout",
  "timed out",
  "timeout after",
  "side effect",
  "side-effect",
];

function isToolGapGotcha(text: string): boolean {
  const lower = text.toLowerCase();
  return TOOL_GAP_GOTCHA_CUES.some((cue) => lower.includes(cue));
}

const DRIFT_CUES = [
  "drift",
  "scope drift",
  "out of scope",
  "out-of-scope",
  "acceptance criteria",
  "success criteria",
  "proposal",
  "contract compromise",
];

function isDriftAttempt(attempt: {
  error?: string;
  diagnosis?: string;
  fix_tried?: string;
  strategy_label?: string;
}): boolean {
  const text = [
    attempt.error,
    attempt.diagnosis,
    attempt.fix_tried,
    attempt.strategy_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return DRIFT_CUES.some((cue) => text.includes(cue));
}

function formatRetryOutcome(
  attempts: Array<{ outcome?: string }>,
): "recovered" | "unresolved" | "retried" {
  const lastAttempt = attempts.at(-1);
  if (lastAttempt?.outcome === "succeeded") return "recovered";
  if (lastAttempt?.outcome === "failed") return "unresolved";
  return "retried";
}

// =============================================================================
// Wisdom Reuse Hits Heuristic
// =============================================================================

async function computeWisdomReuseHits(
  projectDir: string,
  changeTitle: string,
  tasks: Array<{ title?: string; content?: string }>,
): Promise<number> {
  try {
    const projectWisdom = await listProjectWisdom(projectDir);
    if (projectWisdom.length === 0) return 0;

    const changeText = [changeTitle, ...tasks.map((t) => t.title || "")]
      .join(" ")
      .toLowerCase();
    const changeWords = new Set(
      changeText.split(/\W+/).filter((w) => w.length > 3),
    );

    let hits = 0;
    for (const entry of projectWisdom) {
      const contentWords = new Set(
        entry.content
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 3),
      );
      const overlap = [...changeWords].filter((w) => contentWords.has(w));
      if (overlap.length >= 2) hits++;
    }
    return hits;
  } catch (error) {
    appendDebugLog(
      "reflection",
      `wisdom reuse hit computation failed: ${error}`,
    );
    return 0;
  }
}

// =============================================================================
// Markdown Generation
// =============================================================================

function generateReflectionMarkdown(entry: ReflectionEntry): string {
  const lines: string[] = [];
  lines.push(`# Reflection: ${entry.change_id}`);
  lines.push("");
  lines.push(`**Created:** ${entry.created_at}`);
  lines.push("");

  lines.push("## Plane 1: Project Execution");
  lines.push("");
  lines.push("### Efficiency");
  lines.push(
    `- Tasks: ${entry.plane1.efficiency.task_count} total, ${entry.plane1.efficiency.tasks_done} done, ${entry.plane1.efficiency.tasks_cancelled} cancelled`,
  );
  lines.push(
    `- Retries: ${entry.plane1.efficiency.retry_total} (density: ${entry.plane1.efficiency.retry_density.toFixed(2)})`,
  );
  const activeElapsedMs =
    entry.plane1.efficiency.active_elapsed_ms ??
    entry.plane1.efficiency.elapsed_ms;
  lines.push(
    `- Elapsed: ${(entry.plane1.efficiency.elapsed_ms / 1000 / 60).toFixed(1)} minutes (wall-clock) / ${(activeElapsedMs / 1000 / 60).toFixed(1)} minutes (active)`,
  );
  lines.push(`- Threshold tier: ${entry.plane1.efficiency.threshold_tier}`);
  lines.push("");

  lines.push("### Quality");
  lines.push(
    `- TDD compliance: ${(entry.plane1.quality.tdd_compliance * 100).toFixed(0)}%`,
  );
  lines.push("");

  lines.push("### Process");
  lines.push(
    `- Gate completion: ${(entry.plane1.process.gate_completion_rate * 100).toFixed(0)}%`,
  );
  lines.push(`- Drift triggers: ${entry.plane1.process.drift_triggers}`);
  lines.push(`- Delegation count: ${entry.plane1.process.delegation_count}`);
  lines.push("");

  lines.push("### Wisdom");
  lines.push(`- Entries captured: ${entry.plane1.wisdom.entries_captured}`);
  lines.push(`- Entries promoted: ${entry.plane1.wisdom.entries_promoted}`);
  lines.push(`- Reuse hits: ${entry.plane1.wisdom.wisdom_reuse_hits}`);
  lines.push("");

  lines.push("## Plane 2: System Friction");
  lines.push("");

  if (entry.plane2.friction_items.length > 0) {
    lines.push("### Friction Items");
    for (const item of entry.plane2.friction_items) {
      lines.push(`- **[${item.category}]** ${item.description}`);
      if (item.workaround) lines.push(`  - Workaround: ${item.workaround}`);
      if (item.provider_specific) {
        lines.push(
          `  - Provider: ${item.provider_specific.provider} — ${item.provider_specific.detail}`,
        );
      }
    }
    lines.push("");
  }

  if (entry.plane2.highlights.length > 0) {
    lines.push("### Highlights");
    for (const h of entry.plane2.highlights) {
      lines.push(`- ${h}`);
    }
    lines.push("");
  }

  if (entry.plane2.improvement_suggestions.length > 0) {
    lines.push("### Suggestions");
    for (const s of entry.plane2.improvement_suggestions) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function writeReflectionMarkdown(
  archiveDir: string,
  changeId: string,
  entry: ReflectionEntry,
): Promise<void> {
  try {
    const entries = await readdir(archiveDir, { withFileTypes: true });
    const match = entries.find(
      (e) => e.isDirectory() && e.name.endsWith(`-${changeId}`),
    );
    if (!match) return;

    const mdPath = join(archiveDir, match.name, "REFLECTION.md");
    await atomicWriteFile(mdPath, generateReflectionMarkdown(entry));
  } catch (error) {
    // Best-effort: ignore failures
    appendDebugLog("reflection", `reflection markdown write failed: ${error}`);
  }
}

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
      changeId: z
        .string()
        .describe("Change ID to reflect on (must be archived)"),
    },
    execute: async (
      args: { changeId: string },
      store: Store,
    ): Promise<string> => {
      const changeResult = await store.changes.get(args.changeId);
      if (!changeResult.success) {
        return formatToolOutput({ error: changeResult.error });
      }
      if (!changeResult.data) {
        return formatToolOutput({
          error: `Change not found: ${args.changeId}`,
        });
      }

      const change = changeResult.data;
      if (change.status !== "archived") {
        return formatToolOutput({
          error: `Change ${args.changeId} is not archived (status: ${change.status}). Reflection only runs on archived changes.`,
        });
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
      const elapsedMs = isNaN(createdMs)
        ? 0
        : Math.max(0, Date.now() - createdMs);

      let retryTotal = 0;
      for (const task of tasks) {
        retryTotal += task.error_recovery?.attempts?.length ?? 0;
      }
      const retryDenominator = Math.max(
        1,
        taskCounts.done + taskCounts.cancelled,
      );
      const retryDensity = retryTotal / retryDenominator;

      const perGateMs = computePerGateDurations(change);
      const activeElapsedMs = Object.values(perGateMs).reduce(
        (sum, ms) => sum + ms,
        0,
      );

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
      //
      // TDD compliance is measured against tasks with `tdd_intent: "inline"`
      // only. Tasks marked `not_applicable` (rq-TDD003na) and
      // `separate_verification` (rq-TDD002sep) are exempt — they have their
      // own compliance paths in `validator/completeness.ts`. Including them
      // in the denominator under-reports compliance for any change with
      // mixed task types (e.g. one inline + one trivial cleanup).
      //
      // Tasks predating the `tdd_intent` metadata field default to "inline"
      // for backward compatibility, matching `task-classifier.ts` semantics.
      //
      // When a change has zero inline-intent tasks, compliance is reported
      // as 1 (perfect) rather than 0 — a doc-only or refactor-only change
      // should not be flagged as TDD-non-compliant.
      const inlineTasks = tasks.filter(
        (t) => (t.metadata?.tdd_intent ?? "inline") === "inline",
      );
      const tddCompliantTasks = inlineTasks.filter(
        (t) => t.tdd_evidence?.red && t.tdd_evidence?.green,
      ).length;
      const tddCompliance =
        inlineTasks.length > 0 ? tddCompliantTasks / inlineTasks.length : 1;

      // Process metrics
      const gates = change.gates ?? {};
      const completedGates = GATE_ORDER.filter(
        (g) => gates[g]?.status === "done",
      ).length;
      const gateCompletionRate = completedGates / GATE_ORDER.length;

      const tddIntentDistribution: Record<string, number> = {};
      for (const task of tasks) {
        const intent = task.metadata?.tdd_intent ?? "inline";
        tddIntentDistribution[intent] =
          (tddIntentDistribution[intent] ?? 0) + 1;
      }

      const delegationCount = tasks.filter(
        (t) =>
          t.metadata?.delegation_hint === "delegate_allowed" ||
          t.metadata?.delegation_hint === "delegate_preferred",
      ).length;

      // Count only explicit drift-related retry attempts. Generic failed
      // attempts indicate execution friction, not scope/contract drift.
      let driftTriggers = 0;
      for (const task of tasks) {
        if (
          task.error_recovery?.attempts?.some(
            (a) => a.outcome === "failed" && isDriftAttempt(a),
          )
        ) {
          driftTriggers++;
        }
      }

      // Wisdom metrics
      const wisdomEntries = change.wisdom ?? [];
      const wisdomPromoted = wisdomEntries.filter((w) =>
        w.id?.startsWith("pw-"),
      ).length;

      // =====================================================================
      // Plane 2: System Friction
      // =====================================================================

      const frictionItems: ReflectionEntry["plane2"]["friction_items"] = [];

      // Derive friction from wisdom entries
      for (const w of wisdomEntries) {
        const sanitizedContent = sanitizeSecrets(w.content);
        const providerSpecific = detectProviderSpecific(sanitizedContent);
        if (w.type === "gotcha") {
          frictionItems.push({
            category: isToolGapGotcha(sanitizedContent)
              ? "tool_gap"
              : "docs_gap",
            description: `Gotcha captured: ${sanitizedContent.slice(0, 200)}`,
            ...(providerSpecific && {
              provider_specific: providerSpecific,
            }),
          });
        } else if (w.type === "pattern") {
          frictionItems.push({
            category: "missing_capability",
            description: `Pattern discovered: ${sanitizedContent.slice(0, 200)}`,
            ...(providerSpecific && {
              provider_specific: providerSpecific,
            }),
          });
        }
      }

      // Derive friction from error_recovery
      for (const task of tasks) {
        if (
          task.error_recovery?.attempts &&
          task.error_recovery.attempts.length > 0
        ) {
          const lastAttempt = task.error_recovery.attempts.at(-1);
          const sanitizedFix = lastAttempt?.fix_tried
            ? sanitizeSecrets(lastAttempt.fix_tried)
            : undefined;
          const providerSpecific = sanitizedFix
            ? detectProviderSpecific(sanitizedFix)
            : null;
          const retryOutcome = formatRetryOutcome(task.error_recovery.attempts);
          frictionItems.push({
            category: "tool_gap",
            description: `Task "${task.title}" ${retryOutcome} after ${task.error_recovery.attempts.length} retry attempt${task.error_recovery.attempts.length === 1 ? "" : "s"}`,
            workaround: sanitizedFix,
            ...(providerSpecific && {
              provider_specific: providerSpecific,
            }),
          });
        }
      }

      // Derive friction from cancelled tasks
      for (const task of tasks) {
        if (task.status === "cancelled" && task.cancellation) {
          const sanitizedReason = task.cancellation.reason
            ? sanitizeSecrets(task.cancellation.reason)
            : "No reason given";
          const providerSpecific = task.cancellation.reason
            ? detectProviderSpecific(sanitizedReason)
            : null;
          frictionItems.push({
            category: "ux_friction",
            description: `Task "${task.title}" was cancelled: ${sanitizedReason.slice(0, 200)}`,
            ...(providerSpecific && {
              provider_specific: providerSpecific,
            }),
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
        improvementSuggestions.push(
          "Some tasks lack TDD evidence — consider stricter TDD enforcement",
        );
      }
      if (retryTotal > 0) {
        improvementSuggestions.push(
          "Retry events detected — review error_recovery patterns",
        );
      }
      if (frictionItems.length > 0) {
        improvementSuggestions.push(
          `${frictionItems.length} friction items identified — review for process/tool improvements`,
        );
      }

      // =====================================================================
      // Wisdom Reuse Hits
      // =====================================================================

      const projectDir = store.paths.external ?? store.paths.root;
      const wisdomReuseHits = await computeWisdomReuseHits(
        projectDir,
        change.title ?? "",
        tasks,
      );

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
            active_elapsed_ms: activeElapsedMs,
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
            wisdom_reuse_hits: wisdomReuseHits,
          },
        },
        plane2: {
          friction_items: frictionItems,
          highlights,
          improvement_suggestions: improvementSuggestions,
        },
      };

      // Persist to reflections.jsonl
      const persisted = await appendReflection(
        store.paths.external ?? store.paths.root,
        entry,
        store.paths.reflections,
      );

      // Best-effort: write human-readable markdown to archive dir
      await writeReflectionMarkdown(store.paths.archive, change.id, persisted);

      return formatToolOutput({
        reflection: persisted,
      });
    },
  },
};
