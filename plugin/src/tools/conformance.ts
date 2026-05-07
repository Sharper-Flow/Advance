/**
 * Conformance Tool
 *
 * Single multi-action `adv_conformance` tool. Pattern matches existing
 * `adv_spec` and `adv_agenda_*` tools — one tool, action arg, multiple
 * sub-behaviors.
 *
 * Actions:
 *   - status   read-only state inspection (rq-confDegradation01)
 *   - init     scaffold subfolder (default) or sibling repo (rq-confSource01)
 *   - lock     mark a spec locked (rq-confLock01)
 *   - unlock   unlock + record audit (rq-confLock01.3, rq-confOverride01)
 *   - override record audit entry without changing lock (rq-confOverride01)
 *   - run      read CI verdict artifact, persist last_verdict (rq-confVerdict01)
 *
 * Verdict shape (rq-confVerdict01): single structured `{verdict, run_id,
 * failed: [{rq_id, summary}]}`. Apply-phase agent has no tool path —
 * role guard in tool.execute.before blocks calls during the execution
 * gate. Orchestrator (in /adv-archive Phase 5.5) is the legitimate caller.
 *
 * Drift triage on DRIFT (rq-confTriage01): the tool reports the verdict;
 * the agent halts and presents 3 user options. No auto-resolve.
 */

import { z } from "zod";
import { existsSync } from "fs";
import { mkdir, readFile } from "fs/promises";
import { nanoid } from "nanoid";

import { formatToolOutput } from "../utils/tool-output";
import {
  loadConformanceState,
  saveConformanceState,
  upsertSpecEntry,
  appendOverride,
  resolveDefaultConformanceRoot,
  resolveSiblingConformanceRoot,
} from "../storage/conformance";
import { type ConformanceState } from "../types";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import {
  conformanceLockedSignal,
  conformanceOverriddenSignal,
  conformanceVerdictSignal,
} from "../temporal/messages";
import { appendDebugLog } from "../utils/debug-log";
import type { Store } from "../storage/store";

// =============================================================================
// Action Schemas
// =============================================================================

const ActionSchema = z.enum([
  "status",
  "init",
  "lock",
  "unlock",
  "override",
  "run",
]);

const ConformanceArgsSchema = z.object({
  action: ActionSchema,
  // init args
  mode: z.enum(["subfolder", "sibling"]).optional(),
  projectId: z.string().optional(),
  // lock / unlock / override / run target
  spec: z.string().optional(),
  // lock context
  change_id: z.string().optional(),
  // unlock + override audit fields (rq-confOverride01)
  user: z.string().optional(),
  reason: z.string().optional(),
  re_verify_deadline: z.string().optional(),
  // run input
  artifact_path: z.string().optional(),
});

type ConformanceArgs = z.infer<typeof ConformanceArgsSchema>;

// =============================================================================
// Helpers
// =============================================================================

const FAIL_SCHEMA = z.object({
  rq_id: z.string(),
  summary: z.string(),
});

const ARTIFACT_SCHEMA = z.object({
  passed: z.array(z.string()).default([]),
  failed: z.array(FAIL_SCHEMA).default([]),
});

function makeError(message: string): string {
  return formatToolOutput({ success: false, error: message });
}

function nowIso(): string {
  return new Date().toISOString();
}

async function getChangeHandleForProjectDir(
  projectDir: string,
  changeId: string,
): Promise<ReturnType<typeof getChangeHandle> | null> {
  const bundle = getService();
  if (!bundle) return null;
  const projectId = await getProjectId(projectDir);
  if (!projectId) return null;
  return getChangeHandle(bundle.client, projectId, changeId);
}

async function fireConformanceSignal(
  projectDir: string,
  store: Store,
  changeId: string | undefined,
  signal: unknown,
  payload: unknown,
): Promise<void> {
  if (!changeId) return;
  try {
    const handle = await getChangeHandleForProjectDir(projectDir, changeId);
    if (handle) {
      // rq-cacheRefresh01: invalidate cache after the signal so the
      // next adv_change_show / adv_change_archive call sees the
      // conformance state change reflected in the change workflow.
      await fireSignalAndRefresh(handle, store, changeId, signal, payload);
    }
  } catch (err) {
    appendDebugLog(
      "conformance",
      `conformance signal failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// =============================================================================
// Action Implementations
// =============================================================================

async function actionStatus(
  projectDir: string,
  externalRoot: string,
): Promise<string> {
  const state = await loadConformanceState(externalRoot, projectDir);
  return formatToolOutput(state);
}

async function actionInit(
  args: ConformanceArgs,
  projectDir: string,
  externalRoot: string,
): Promise<string> {
  const mode = args.mode ?? "subfolder";

  const existing = await loadConformanceState(externalRoot, projectDir);

  let conformanceRoot: string;
  if (mode === "subfolder") {
    conformanceRoot = resolveDefaultConformanceRoot(projectDir);
    if (!existsSync(conformanceRoot)) {
      await mkdir(conformanceRoot, { recursive: true });
    }
  } else {
    if (!args.projectId) {
      return makeError("init mode='sibling' requires projectId arg");
    }
    conformanceRoot = resolveSiblingConformanceRoot(projectDir, args.projectId);
    // Caller is responsible for `git init` + remote setup; we record the
    // path. The conformance root may not exist yet on disk in sibling
    // mode — that's OK; init is purely advisory in that case.
  }

  const next: ConformanceState = {
    ...existing,
    conformance_root: conformanceRoot,
    conformance_root_kind: mode,
  };
  await saveConformanceState(externalRoot, next);

  return formatToolOutput({
    success: true,
    kind: mode,
    path: conformanceRoot,
  });
}

async function actionLock(
  args: ConformanceArgs,
  store: Store,
  projectDir: string,
  externalRoot: string,
): Promise<string> {
  if (!args.spec) {
    return makeError("lock requires spec arg");
  }
  if (!args.change_id) {
    return makeError("lock requires change_id arg");
  }
  const state = await loadConformanceState(externalRoot, projectDir);
  if (!state.specs[args.spec]) {
    return makeError(
      `Cannot lock: spec "${args.spec}" is not tracked in conformance state. ` +
        `Use 'init' to add the spec first.`,
    );
  }
  const next = upsertSpecEntry(state, args.spec, {
    locked: true,
    locked_at: nowIso(),
    locked_at_archive: args.change_id,
  });
  await saveConformanceState(externalRoot, next);

  // Signal-driven: notify change workflow that spec was locked
  await fireConformanceSignal(
    projectDir,
    store,
    args.change_id,
    conformanceLockedSignal,
    {
      specs: [args.spec],
      lockedAt: nowIso(),
    },
  );

  return formatToolOutput({
    success: true,
    spec: args.spec,
    locked: true,
  });
}

async function actionUnlock(
  args: ConformanceArgs,
  projectDir: string,
  externalRoot: string,
): Promise<string> {
  if (!args.spec) return makeError("unlock requires spec arg");
  if (!args.user) return makeError("unlock requires user arg (audit)");
  if (!args.reason) return makeError("unlock requires reason arg (audit)");
  if (!args.re_verify_deadline) {
    return makeError("unlock requires re_verify_deadline arg (audit)");
  }
  const state = await loadConformanceState(externalRoot, projectDir);
  if (!state.specs[args.spec]) {
    return makeError(`spec "${args.spec}" is not tracked`);
  }
  // TODO: No dedicated conformanceUnlockedSignal in current signal set.
  // Unlock stays on the local conformance storage path.
  const audited = appendOverride(state, args.spec, {
    user: args.user,
    reason: args.reason,
    re_verify_deadline: args.re_verify_deadline,
    applied_at: nowIso(),
  });
  const next = upsertSpecEntry(audited, args.spec, { locked: false });
  await saveConformanceState(externalRoot, next);
  return formatToolOutput({
    success: true,
    spec: args.spec,
    locked: false,
    overrides: next.specs[args.spec]?.overrides.length ?? 0,
  });
}

async function actionOverride(
  args: ConformanceArgs,
  store: Store,
  projectDir: string,
  externalRoot: string,
): Promise<string> {
  if (!args.spec) return makeError("override requires spec arg");
  if (!args.user) return makeError("override requires user arg");
  if (!args.reason) return makeError("override requires reason arg");
  if (!args.re_verify_deadline) {
    return makeError("override requires re_verify_deadline arg");
  }
  const state = await loadConformanceState(externalRoot, projectDir);
  if (!state.specs[args.spec]) {
    return makeError(`spec "${args.spec}" is not tracked`);
  }
  const next = appendOverride(state, args.spec, {
    user: args.user,
    reason: args.reason,
    re_verify_deadline: args.re_verify_deadline,
    applied_at: nowIso(),
  });
  await saveConformanceState(externalRoot, next);

  // Signal-driven: notify the change workflow that locked this spec
  const changeId = state.specs[args.spec]?.locked_at_archive;
  if (changeId) {
    await fireConformanceSignal(
      projectDir,
      store,
      changeId,
      conformanceOverriddenSignal,
      {
        user: args.user,
        reason: args.reason,
        reVerifyDeadline: args.re_verify_deadline,
        overriddenAt: nowIso(),
      },
    );
  }

  return formatToolOutput({
    success: true,
    spec: args.spec,
    overrides: next.specs[args.spec]?.overrides.length ?? 0,
  });
}

async function actionRun(
  args: ConformanceArgs,
  store: Store,
  projectDir: string,
  externalRoot: string,
): Promise<string> {
  if (!args.spec) return makeError("run requires spec arg");
  if (!args.artifact_path) return makeError("run requires artifact_path arg");

  const state = await loadConformanceState(externalRoot, projectDir);
  const entry = state.specs[args.spec];
  if (!entry?.conformance_required) {
    return makeError(
      `Conformance run skipped: spec "${args.spec}" is not tracked with conformance_required: true`,
    );
  }

  if (!existsSync(args.artifact_path)) {
    return makeError(
      `Conformance verdict artifact not found at ${args.artifact_path}. ` +
        `The CI workflow must produce a JSON artifact at this path before run.`,
    );
  }

  const raw = await readFile(args.artifact_path, "utf-8");
  let parsed: {
    passed: string[];
    failed: { rq_id: string; summary: string }[];
  };
  try {
    parsed = ARTIFACT_SCHEMA.parse(JSON.parse(raw));
  } catch (err) {
    return makeError(
      `Conformance artifact at ${args.artifact_path} is malformed: ${(err as Error).message}`,
    );
  }

  const verdict = parsed.failed.length === 0 ? "PASS" : "DRIFT";
  const runId = `cr-${nanoid(8)}`;
  const ranAt = nowIso();

  const next = upsertSpecEntry(state, args.spec, {
    last_verdict: { verdict, run_id: runId, ran_at: ranAt },
  });
  await saveConformanceState(externalRoot, next);

  // Signal-driven: notify the change workflow that locked this spec
  const changeId = entry.locked_at_archive;
  if (changeId) {
    await fireConformanceSignal(
      projectDir,
      store,
      changeId,
      conformanceVerdictSignal,
      {
        verdict,
        runId,
        failed: parsed.failed,
        recordedAt: ranAt,
      },
    );
  }

  return formatToolOutput({
    verdict,
    run_id: runId,
    failed: parsed.failed,
  });
}

// =============================================================================
// Tool Definition
// =============================================================================

export const conformanceTools = {
  adv_conformance: {
    description:
      "External CI-isolated spec conformance: status, init (scaffold subfolder default or sibling repo), lock, unlock, override (audit), run (read CI verdict artifact). Single structured verdict; apply-phase agent blocked by role guard.",
    args: {
      action: ActionSchema.describe(
        "Action: status | init | lock | unlock | override | run",
      ),
      mode: z
        .enum(["subfolder", "sibling"])
        .optional()
        .describe(
          "init mode: subfolder (default, in-repo .adv/specs/_conformance) or sibling (opt-in, external advance-conformance-{projectId})",
        ),
      projectId: z
        .string()
        .optional()
        .describe("Required for init mode='sibling'"),
      spec: z
        .string()
        .optional()
        .describe(
          "Spec name for lock/unlock/override/run (e.g. 'advance-workflow')",
        ),
      change_id: z
        .string()
        .optional()
        .describe(
          "Change-id that triggered the lock; recorded in locked_at_archive",
        ),
      user: z
        .string()
        .optional()
        .describe("Audit field for unlock/override: user identity"),
      reason: z
        .string()
        .optional()
        .describe("Audit field for unlock/override: reason text"),
      re_verify_deadline: z
        .string()
        .optional()
        .describe(
          "Audit field for unlock/override: ISO timestamp by which re-verification is expected",
        ),
      artifact_path: z
        .string()
        .optional()
        .describe("Path to CI-produced JSON verdict artifact for action='run'"),
    },
    /**
     * Execute via bindTool-style: (args, store). `projectDir` is derived
     * from `store.paths.root`; `externalRoot` from `store.paths.external`.
     * `store` is threaded through to action functions that fire conformance
     * signals so they can centralize cache invalidation via
     * `fireSignalAndRefresh` (rq-cacheRefresh01).
     */
    execute: async (
      rawArgs: ConformanceArgs,
      store: Store,
    ): Promise<string> => {
      const externalRoot = store.paths.external;
      if (!externalRoot) {
        return makeError(
          "adv_conformance requires external state root (project must be Temporal-enabled)",
        );
      }
      const projectDir = store.paths.root;
      const args = ConformanceArgsSchema.parse(rawArgs);
      switch (args.action) {
        case "status":
          return actionStatus(projectDir, externalRoot);
        case "init":
          return actionInit(args, projectDir, externalRoot);
        case "lock":
          return actionLock(args, store, projectDir, externalRoot);
        case "unlock":
          return actionUnlock(args, projectDir, externalRoot);
        case "override":
          return actionOverride(args, store, projectDir, externalRoot);
        case "run":
          return actionRun(args, store, projectDir, externalRoot);
      }
    },
  },
};
