interface CorrelationKeys {
  branches?: string[];
  head_shas?: string[];
}

interface CorrelatableChange {
  id: string;
  correlation_keys?: CorrelationKeys;
  ops_followup?: unknown;
}

export interface LinkedDashboardItem {
  kind: string;
  changeId: string;
  item: unknown;
  evidence: string;
  status?: string;
  source_states?: Record<string, unknown>;
}

export interface UnlinkedDashboardItem {
  kind: string;
  item?: unknown;
  reason: string;
  status?: string;
}

export interface CorrelateDashboardInput {
  changes: CorrelatableChange[];
  pulls: unknown[];
  workflow_runs: unknown[];
  deployments: unknown[];
  ops: unknown[];
}

export interface CorrelateDashboardResult {
  linked: LinkedDashboardItem[];
  unlinked: UnlinkedDashboardItem[];
}

export function correlateDashboardItems(
  input: CorrelateDashboardInput,
): CorrelateDashboardResult {
  const index = buildCorrelationIndex(input.changes);
  const linked: LinkedDashboardItem[] = [];
  const unlinked: UnlinkedDashboardItem[] = [];

  for (const pull of input.pulls)
    correlateOne("pull", pull, pullEvidence(pull), index, linked, unlinked);
  for (const run of input.workflow_runs)
    correlateOne(
      "workflow_run",
      run,
      runEvidence(run),
      index,
      linked,
      unlinked,
    );
  for (const deployment of input.deployments)
    correlateOne(
      "deployment",
      deployment,
      deploymentEvidence(deployment),
      index,
      linked,
      unlinked,
    );
  for (const ops of input.ops)
    correlateOne("ops", ops, opsEvidence(ops), index, linked, unlinked);

  return { linked, unlinked };
}

interface CandidateEvidence {
  key: string;
  value: string;
  label: string;
}

interface CorrelationIndex {
  branches: Map<string, string[]>;
  shas: Map<string, string[]>;
  ops: Map<string, string[]>;
}

function buildCorrelationIndex(
  changes: CorrelatableChange[],
): CorrelationIndex {
  const index: CorrelationIndex = {
    branches: new Map(),
    shas: new Map(),
    ops: new Map(),
  };
  for (const change of changes) {
    for (const branch of change.correlation_keys?.branches ?? [])
      add(index.branches, branch, change.id);
    for (const sha of change.correlation_keys?.head_shas ?? [])
      add(index.shas, sha, change.id);
    const opsKey = opsKeyFromValue(change.ops_followup);
    if (opsKey) add(index.ops, opsKey, change.id);
  }
  return index;
}

function correlateOne(
  kind: string,
  item: unknown,
  evidences: CandidateEvidence[],
  index: CorrelationIndex,
  linked: LinkedDashboardItem[],
  unlinked: UnlinkedDashboardItem[],
) {
  let sawAmbiguous = false;
  for (const evidence of evidences) {
    const matches = lookup(index, evidence);
    if (matches.length === 1) {
      linked.push({
        kind,
        changeId: matches[0]!,
        item,
        evidence: `${evidence.label}: ${evidence.value}`,
        status: statusOf(item),
        source_states: sourceStatesOf(item),
      });
      return;
    }
    if (matches.length > 1) sawAmbiguous = true;
  }
  unlinked.push({
    kind,
    item,
    reason: sawAmbiguous ? "ambiguous structural match" : "no structural match",
    status: statusOf(item),
  });
}

function lookup(
  index: CorrelationIndex,
  evidence: CandidateEvidence,
): string[] {
  if (evidence.key === "branch")
    return index.branches.get(evidence.value) ?? [];
  if (evidence.key === "sha") return index.shas.get(evidence.value) ?? [];
  if (evidence.key === "ops") return index.ops.get(evidence.value) ?? [];
  return [];
}

function pullEvidence(pull: unknown): CandidateEvidence[] {
  const head = record(record(pull)?.head);
  return compact([
    evidence("branch", stringField(head, "ref"), "branch"),
    evidence("sha", stringField(head, "sha"), "pull.head.sha"),
  ]);
}

function runEvidence(run: unknown): CandidateEvidence[] {
  return compact([
    evidence(
      "branch",
      stringField(record(run), "head_branch"),
      "run.head_branch",
    ),
    evidence("sha", stringField(record(run), "head_sha"), "run.head_sha"),
  ]);
}

function deploymentEvidence(deployment: unknown): CandidateEvidence[] {
  const item = record(deployment);
  return compact([
    evidence("branch", stringField(item, "ref"), "deployment.ref"),
    evidence("sha", stringField(item, "sha"), "deployment.sha"),
  ]);
}

function opsEvidence(ops: unknown): CandidateEvidence[] {
  const key = opsKeyFromValue(ops);
  return key
    ? [{ key: "ops", value: key, label: "ops.environment+completion_signal" }]
    : [];
}

function opsKeyFromValue(value: unknown): string | undefined {
  const item = record(value);
  const env = stringField(item, "env") ?? stringField(item, "environment");
  const signal = stringField(item, "completion_signal");
  return env && signal ? `${env}/${signal}` : undefined;
}

function evidence(
  key: string,
  value: string | undefined,
  label: string,
): CandidateEvidence | undefined {
  return value ? { key, value, label } : undefined;
}

function compact<T>(values: Array<T | undefined>): T[] {
  return values.filter((value): value is T => value !== undefined);
}

function add(map: Map<string, string[]>, key: string, id: string) {
  const list = map.get(key) ?? [];
  list.push(id);
  map.set(key, list);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const field = value?.[key];
  return typeof field === "string" && field.trim().length > 0
    ? field.trim()
    : undefined;
}

function statusOf(item: unknown): string | undefined {
  const states = sourceStatesOf(item);
  return (
    stringField(record(item), "conclusion") ??
    stringField(record(item), "status") ??
    stringField(record(item), "state") ??
    stringField(states, "github_deployment")
  );
}

function sourceStatesOf(item: unknown): Record<string, unknown> | undefined {
  const states = record(record(item)?.source_states);
  return states && Object.keys(states).length > 0 ? states : undefined;
}
