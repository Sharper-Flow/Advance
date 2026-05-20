export interface WarpDeps {
  serverUrl: URL;
  fetchImpl?: typeof fetch;
}

export interface CreateAdvWorkspaceInput {
  directory: string;
  branch: string;
}

export interface WorkspaceHandle {
  workspaceID: string;
}

const fetchWith = (deps: WarpDeps): typeof fetch => deps.fetchImpl ?? fetch;

const responseText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

const workspaceUrl = (deps: WarpDeps, suffix = ""): URL =>
  new URL(`/experimental/workspace${suffix}`, deps.serverUrl);

const parseWorkspaceID = (value: unknown): WorkspaceHandle => {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return { workspaceID: value.id };
  }
  throw new Error("createAdvWorkspace failed: missing workspace id");
};

export function warpFlagEnabled(): boolean {
  return (
    process.env.OPENCODE_EXPERIMENTAL === "true" ||
    process.env.OPENCODE_EXPERIMENTAL_WORKSPACES === "true"
  );
}

export async function workspaceAndWarpAvailable(
  deps: WarpDeps,
): Promise<boolean> {
  if (!warpFlagEnabled()) return false;

  try {
    const response = await fetchWith(deps)(workspaceUrl(deps));
    return response.ok;
  } catch {
    return false;
  }
}

export async function createAdvWorkspace(
  deps: WarpDeps,
  input: CreateAdvWorkspaceInput,
): Promise<WorkspaceHandle> {
  const response = await fetchWith(deps)(workspaceUrl(deps), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "adv-worktree",
      branch: input.branch,
      extra: {
        directory: input.directory,
        branch: input.branch,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `createAdvWorkspace failed: ${response.status} ${await responseText(
        response,
      )}`,
    );
  }

  return parseWorkspaceID(await response.json());
}

export async function warpSession(
  deps: WarpDeps,
  args: { workspaceID: string; sessionID: string },
): Promise<void> {
  const response = await fetchWith(deps)(workspaceUrl(deps, "/warp"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: args.workspaceID,
      sessionID: args.sessionID,
      // The worktree already contains the correct files. Copying source changes
      // would apply trunk diffs onto the isolated worktree and risk corruption.
      copyChanges: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `warpSession failed: ${response.status} ${await responseText(response)}`,
    );
  }
}

export async function deleteAdvWorkspace(
  deps: WarpDeps,
  workspaceID: string,
): Promise<void> {
  const response = await fetchWith(deps)(
    workspaceUrl(deps, `/${encodeURIComponent(workspaceID)}`),
    { method: "DELETE" },
  );

  if (response.ok || response.status === 404) return;

  throw new Error(
    `deleteAdvWorkspace failed: ${response.status} ${await responseText(
      response,
    )}`,
  );
}
