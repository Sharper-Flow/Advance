export const ADV_MORPH_WORKTREE_CAPABILITY = Symbol.for(
  "advance.morph-worktree-capability.v1",
);

export type MorphWorktreeAuthorizationDeps = {
  getTaskChangeId(taskId: string): Promise<string | null>;
  getExpectedRoot(changeId: string): string | null;
  canonicalize(path: string): string;
  isSetupReady(changeId: string): Promise<boolean>;
};

/** Attach a non-model-visible capability after durable task/root validation. */
export async function authorizeMorphWorktree(
  args: Record<string, unknown>,
  sessionID: string,
  deps: MorphWorktreeAuthorizationDeps,
): Promise<void> {
  const workdir = typeof args.workdir === "string" ? args.workdir : null;
  const taskId = typeof args.taskId === "string" ? args.taskId : null;
  if (!workdir && !taskId) return;
  if (!workdir || !taskId) {
    throw new Error("Morph ADV workdir requires both workdir and taskId");
  }
  const changeId = await deps.getTaskChangeId(taskId);
  if (!changeId || !(await deps.isSetupReady(changeId))) {
    throw new Error("Morph ADV workdir task is not setup-ready");
  }
  const expectedRoot = deps.getExpectedRoot(changeId);
  if (!expectedRoot) throw new Error("Morph ADV workdir has no expected root");
  const canonicalRequested = deps.canonicalize(workdir);
  const canonicalExpected = deps.canonicalize(expectedRoot);
  if (canonicalRequested !== canonicalExpected) {
    throw new Error("Morph ADV workdir does not match its task worktree");
  }
  Object.defineProperty(args, ADV_MORPH_WORKTREE_CAPABILITY, {
    value: { root: canonicalExpected, taskId, sessionID },
    enumerable: false,
    configurable: false,
    writable: false,
  });
}
