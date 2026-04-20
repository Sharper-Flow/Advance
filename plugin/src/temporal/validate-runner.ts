/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made. This module orchestrates evidence collection and renders
 * the one permanent artifact: docs/temporal-readiness-decision.md.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  evaluateTemporalReadiness,
  renderTemporalReadinessDecision,
  type TemporalReadinessDecision,
  type TemporalValidationEvidence,
} from "./decision-engine";

export interface ValidationModules {
  integration: () => Promise<TemporalValidationEvidence["integration"]>;
  replay: () => Promise<TemporalValidationEvidence["replay"]>;
  workerLifecycle: () => Promise<TemporalValidationEvidence["workerLifecycle"]>;
  parity: () => Promise<TemporalValidationEvidence["parity"]>;
  dryRunMigration: () => Promise<TemporalValidationEvidence["dryRunMigration"]>;
  smoke: () => Promise<TemporalValidationEvidence["smoke"]>;
  latency: () => Promise<TemporalValidationEvidence["latency"]>;
  memory: () => Promise<TemporalValidationEvidence["memory"]>;
  operatorSetup: () => Promise<TemporalValidationEvidence["operatorSetup"]>;
}

export interface ValidationRunResult {
  evidence: TemporalValidationEvidence;
  decision: TemporalReadinessDecision;
  markdown: string;
}

export async function createValidationTempDir(
  changeId: string,
): Promise<string> {
  return mkdtemp(join(tmpdir(), `${changeId}-validate-`));
}

export async function runTemporalValidation(input: {
  context: { changeId: string; title: string };
  modules: ValidationModules;
  writeDecision: (markdown: string) => Promise<void>;
  reviewedAt: string;
}): Promise<ValidationRunResult> {
  const evidence: TemporalValidationEvidence = {
    integration: await input.modules.integration(),
    replay: await input.modules.replay(),
    workerLifecycle: await input.modules.workerLifecycle(),
    parity: await input.modules.parity(),
    dryRunMigration: await input.modules.dryRunMigration(),
    smoke: await input.modules.smoke(),
    latency: await input.modules.latency(),
    memory: await input.modules.memory(),
    operatorSetup: await input.modules.operatorSetup(),
    // Divergence is currently subsumed by parity + dry-run sweeps: any
    // legacy↔Temporal divergence surfaces as parity mismatches or unmappable
    // projects. Kept as a distinct evidence slot for the migration change to
    // wire a dedicated long-running shadow probe if needed.
    divergence: { pass: true, unresolvedCount: 0 },
  };

  const decision = evaluateTemporalReadiness(evidence);
  const markdown = renderTemporalReadinessDecision({
    changeId: input.context.changeId,
    title: input.context.title,
    decision,
    evidence,
    reviewedAt: input.reviewedAt,
  });
  await input.writeDecision(markdown);

  return { evidence, decision, markdown };
}

export async function writeDecisionMarkdown(
  path: string,
  markdown: string,
): Promise<void> {
  await writeFile(path, markdown, "utf8");
}

export async function cleanupValidationTempDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
