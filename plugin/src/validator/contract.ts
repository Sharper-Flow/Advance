import type { Change, Task } from "../types";
import type { ValidationIssue } from "./types";

type TaskWithContractRefs = Task & {
  contract_refs?: {
    implements?: string[];
    verifies?: string[];
    respects?: string[];
    not_applicable_reason?: string;
  };
};

function taskContractRefs(task: Task): TaskWithContractRefs["contract_refs"] {
  return (task as TaskWithContractRefs).contract_refs;
}

function allTaskRefs(
  refs: NonNullable<TaskWithContractRefs["contract_refs"]>,
): string[] {
  return [
    ...(refs.implements ?? []),
    ...(refs.verifies ?? []),
    ...(refs.respects ?? []),
  ];
}

function hasAnyTaskRef(refs: TaskWithContractRefs["contract_refs"]): boolean {
  return refs ? allTaskRefs(refs).length > 0 : false;
}

function hasTaskCoverage(change: Change, contractId: string): boolean {
  return change.tasks.some((task) => {
    const refs = taskContractRefs(task);
    return (
      refs?.implements?.includes(contractId) === true ||
      refs?.verifies?.includes(contractId) === true
    );
  });
}

function legacyAcceptanceCriteria(change: Change): string[] | undefined {
  return (change as Change & { acceptanceCriteria?: string[] })
    .acceptanceCriteria;
}

export function runContractChecks(change: Change): ValidationIssue[] {
  const contract = change.contract;
  if (!contract) return [];

  const issues: ValidationIssue[] = [];
  const contractIds = new Set(contract.items.map((item) => item.id));
  const seenIds = new Set<string>();

  for (const item of contract.items) {
    if (seenIds.has(item.id)) {
      issues.push({
        code: "CONTRACT_DUPLICATE_ID",
        severity: "error",
        message: `Contract item ID "${item.id}" is duplicated`,
        path: `contract.items.${item.id}`,
        details: { contractId: item.id },
      });
    }
    seenIds.add(item.id);
  }

  for (const task of change.tasks) {
    const refs = taskContractRefs(task);
    if (refs) {
      for (const ref of allTaskRefs(refs)) {
        if (!contractIds.has(ref)) {
          issues.push({
            code: "CONTRACT_UNKNOWN_REF",
            severity: "error",
            message: `Task "${task.title}" (${task.id}) references unknown contract item "${ref}"`,
            path: `tasks.${task.id}.contract_refs`,
            details: { taskId: task.id, contractId: ref },
          });
        }
      }
    }

    if (
      contract.rigor !== "minimal" &&
      task.type === "code" &&
      task.status !== "cancelled" &&
      !hasAnyTaskRef(refs) &&
      !refs?.not_applicable_reason
    ) {
      issues.push({
        code: "CONTRACT_TASK_REFS_MISSING",
        severity: "error",
        message: `Code task "${task.title}" (${task.id}) needs contract_refs or not_applicable_reason for ${contract.rigor} rigor`,
        path: `tasks.${task.id}.contract_refs`,
        details: { taskId: task.id, rigor: contract.rigor },
      });
    }
  }

  if (contract.rigor !== "minimal") {
    for (const item of contract.items) {
      if (
        item.kind === "acceptance_criterion" &&
        item.verificationRequired !== false &&
        !hasTaskCoverage(change, item.id)
      ) {
        issues.push({
          code: "CONTRACT_AC_UNCOVERED",
          severity: "error",
          message: `Required acceptance criterion "${item.id}" has no implementing or verifying task coverage`,
          path: `contract.items.${item.id}`,
          details: { contractId: item.id },
        });
      }
    }
  }

  if (contract.reviewMatrix) {
    const rowsById = new Map(
      contract.reviewMatrix.rows.map((row) => [row.contractId, row]),
    );
    for (const row of contract.reviewMatrix.rows) {
      if (!contractIds.has(row.contractId)) {
        issues.push({
          code: "CONTRACT_UNKNOWN_REVIEW_REF",
          severity: "error",
          message: `Review matrix references unknown contract item "${row.contractId}"`,
          path: `contract.reviewMatrix.${row.contractId}`,
          details: { contractId: row.contractId },
        });
      }
    }

    for (const item of contract.items) {
      if (item.verificationRequired === false) continue;
      const row = rowsById.get(item.id);
      if (!row) {
        issues.push({
          code: "CONTRACT_PROOF_MISSING",
          severity: "error",
          message: `Required contract item "${item.id}" has no review matrix row`,
          path: `contract.reviewMatrix.${item.id}`,
          details: { contractId: item.id },
        });
        continue;
      }
      if (["fail", "violated", "unknown"].includes(row.status)) {
        issues.push({
          code: "CONTRACT_PROOF_FAILED",
          severity: "error",
          message: `Required contract item "${item.id}" has unresolved proof status "${row.status}"`,
          path: `contract.reviewMatrix.${item.id}`,
          details: { contractId: item.id, status: row.status },
        });
      }
    }
  }

  const legacyCriteria = legacyAcceptanceCriteria(change);
  if (legacyCriteria) {
    const contractCriteria = contract.items
      .filter((item) => item.kind === "acceptance_criterion")
      .map((item) => item.text);
    if (JSON.stringify(legacyCriteria) !== JSON.stringify(contractCriteria)) {
      issues.push({
        code: "CONTRACT_ACCEPTANCE_CRITERIA_DRIFT",
        severity: "warning",
        message:
          "Legacy acceptanceCriteria projection diverges from authoritative contract acceptance criteria",
        path: "acceptanceCriteria",
      });
    }
  }

  return issues;
}
