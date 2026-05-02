import { getProjectId, getExternalRoot } from "./utils/project-id";
import { appendDebugLog } from "./utils/debug-log";

const debugLog = (msg: string): void => appendDebugLog("index", msg);

/**
 * Resolve the ADV state context for the active OpenCode instance.
 *
 * Kept outside `src/index.ts` so the plugin entrypoint does not export helper
 * functions. OpenCode invokes every function export from plugin entry modules.
 */
export async function resolveProjectContext(
  directory: string,
  project?: { vcsDir?: string },
  worktree?: string,
): Promise<{
  effectiveDir: string;
  projectId: string | null;
  externalRoot?: string;
}> {
  // Resolution order: worktree → directory → project.vcsDir → legacy fallback
  let effectiveDir = directory;
  let projectId = await getProjectId(effectiveDir);

  if (worktree && worktree !== directory) {
    debugLog(`trying worktree: ${worktree}`);
    const wtId = await getProjectId(worktree);
    if (wtId) {
      effectiveDir = worktree;
      projectId = wtId;
    }
  }

  if (!projectId && project?.vcsDir && project.vcsDir !== directory) {
    debugLog(
      `directory not a git repo, trying project.vcsDir: ${project.vcsDir}`,
    );
    const altId = await getProjectId(project.vcsDir);
    if (altId) {
      effectiveDir = project.vcsDir;
      projectId = altId;
    }
  }

  return {
    effectiveDir,
    projectId,
    externalRoot: projectId ? getExternalRoot(projectId) : undefined,
  };
}
