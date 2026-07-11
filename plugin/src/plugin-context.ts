import {
  getProjectId,
  getExternalRoot,
  UnstableIdentityError,
} from "./utils/project-id";
import { appendDebugLog } from "./utils/debug-log";

const debugLog = (msg: string): void => appendDebugLog("index", msg);

/**
 * Resolve the ADV state context for the active OpenCode instance.
 *
 * Kept outside `src/index.ts` so the plugin entrypoint does not export helper
 * functions. OpenCode invokes every function export from plugin entry modules.
 *
 * Unstable identities (shallow/grafted repos) surface as `identityError`
 * instead of throwing: the caller must refuse store initialization rather
 * than fall back to minting legacy in-repo state under a moving pseudo-root
 * (rq-projectIdentityStability01).
 */
export async function resolveProjectContext(
  directory: string,
  project?: { vcsDir?: string },
  worktree?: string,
): Promise<{
  effectiveDir: string;
  projectId: string | null;
  externalRoot?: string;
  identityError?: UnstableIdentityError;
}> {
  let identityError: UnstableIdentityError | undefined;
  const tryGetProjectId = async (dir: string): Promise<string | null> => {
    try {
      return await getProjectId(dir);
    } catch (error) {
      if (error instanceof UnstableIdentityError) {
        identityError = error;
        debugLog(`unstable identity for ${dir}: ${error.reason}`);
        return null;
      }
      throw error;
    }
  };

  // Resolution order: worktree → directory → project.vcsDir → legacy fallback
  let effectiveDir = directory;
  let projectId = await tryGetProjectId(effectiveDir);

  if (worktree && worktree !== directory) {
    debugLog(`trying worktree: ${worktree}`);
    const wtId = await tryGetProjectId(worktree);
    if (wtId) {
      effectiveDir = worktree;
      projectId = wtId;
    }
  }

  if (!projectId && project?.vcsDir && project.vcsDir !== directory) {
    debugLog(
      `directory not a git repo, trying project.vcsDir: ${project.vcsDir}`,
    );
    const altId = await tryGetProjectId(project.vcsDir);
    if (altId) {
      effectiveDir = project.vcsDir;
      projectId = altId;
    }
  }

  // A stable identity from any candidate dir clears the refusal.
  if (projectId) identityError = undefined;

  return {
    effectiveDir,
    projectId,
    externalRoot: projectId ? getExternalRoot(projectId) : undefined,
    identityError,
  };
}
