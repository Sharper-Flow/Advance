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

const MAX_ERROR_RESPONSE_CHARS = 1000;

const responseText = async (response: Response): Promise<string> => {
  try {
    const text = await response.text();
    return text.length > MAX_ERROR_RESPONSE_CHARS
      ? `${text.slice(0, MAX_ERROR_RESPONSE_CHARS)}…[truncated]`
      : text;
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

export async function getSessionWorkspaceID(
  deps: WarpDeps,
  sessionID: string,
): Promise<string | null> {
  const response = await fetchWith(deps)(
    new URL(`/session/${encodeURIComponent(sessionID)}`, deps.serverUrl),
  );

  if (!response.ok) {
    throw new Error(
      `getSessionWorkspaceID failed: ${response.status} ${await responseText(
        response,
      )}`,
    );
  }

  const session: unknown = await response.json();
  const workspaceID =
    typeof session === "object" &&
    session !== null &&
    "workspaceID" in session &&
    typeof session.workspaceID === "string"
      ? session.workspaceID
      : null;
  return workspaceID && workspaceID.length > 0 ? workspaceID : null;
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

const isWorkspaceListItem = (
  value: unknown,
): value is { id: string; directory: string | null } =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof value.id === "string" &&
  "directory" in value &&
  (typeof value.directory === "string" || value.directory === null);

export async function findWorkspaceByDirectory(
  deps: WarpDeps,
  directory: string,
): Promise<WorkspaceHandle | null> {
  if (!warpFlagEnabled()) return null;

  try {
    const response = await fetchWith(deps)(workspaceUrl(deps));
    if (!response.ok) return null;

    const list: unknown = await response.json();
    if (!Array.isArray(list)) return null;

    const match = list.find(
      (item) => isWorkspaceListItem(item) && item.directory === directory,
    );
    return isWorkspaceListItem(match) ? { workspaceID: match.id } : null;
  } catch {
    return null;
  }
}
