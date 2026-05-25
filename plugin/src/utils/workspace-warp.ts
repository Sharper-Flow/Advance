import type { OpencodeClient } from "./opencode-types.js";

export interface WarpDeps {
  serverUrl: URL;
  /**
   * Project root directory. Used as the value of `x-opencode-directory` on
   * raw-fetch workspace calls and matches the directory the SDK client was
   * constructed with so server-side `Instance.project.id` resolution is
   * unambiguous (rq-warpModeContract05).
   */
  directory: string;
  /**
   * v1 SDK client from `PluginInput.client`. When present, session lookup
   * routes through `client.session.get` and inherits the auto-attached
   * `x-opencode-directory` header from the SDK's request interceptor
   * (rq-warpModeContract04).
   */
  client?: OpencodeClient;
  fetchImpl?: typeof fetch;
}

/**
 * Structured result of `getSessionWorkspaceID`. The function does NOT throw —
 * callers branch on `ok` to build downgrade_reason precisely.
 */
export type SessionLookupResult =
  | { ok: true; workspaceID: string | null }
  | { ok: false; status?: number; detail: string };

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

/**
 * Build the `x-opencode-directory` header for raw-fetch calls to
 * `/experimental/workspace/*`. Required so OpenCode's `Instance.project.id`
 * resolves to the session's storage namespace instead of server cwd
 * (rq-warpModeContract05).
 *
 * Encoding matches the v1 SDK's own header construction at
 * `@opencode-ai/sdk@1.15.5/dist/client.js:42-45`.
 */
const directoryHeaders = (
  deps: WarpDeps,
  extra: Record<string, string> = {},
): Record<string, string> => ({
  ...extra,
  "x-opencode-directory": encodeURIComponent(deps.directory),
});

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
    const response = await fetchWith(deps)(workspaceUrl(deps), {
      headers: directoryHeaders(deps),
    });
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
    headers: directoryHeaders(deps, { "content-type": "application/json" }),
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
    headers: directoryHeaders(deps, { "content-type": "application/json" }),
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
): Promise<SessionLookupResult> {
  if (!deps.client) {
    return { ok: false, detail: "missing client" };
  }

  let result: unknown;
  try {
    // v1 SDK shape: `client.session.get({ path: { id } })` — verified at
    // `@opencode-ai/sdk@1.15.5/dist/gen/types.gen.d.ts:1888-1897`. The v1
    // client's request interceptor (`dist/client.js:41-52`) attaches the
    // `x-opencode-directory` header set at construction time, fixing the
    // missing-header regression that caused silent downgrades.
    result = await deps.client.session.get({ path: { id: sessionID } });
  } catch (error) {
    return { ok: false, detail: String(error) };
  }

  const errorField = (result as { error?: unknown } | undefined)?.error;
  const dataField = (result as { data?: unknown } | undefined)?.data;
  const responseField = (
    result as { response?: { status?: number } } | undefined
  )?.response;
  const status =
    typeof responseField?.status === "number"
      ? responseField.status
      : undefined;

  if (errorField !== undefined && errorField !== null) {
    return {
      ok: false,
      ...(status !== undefined ? { status } : {}),
      detail: stringifyErrorDetail(errorField),
    };
  }

  if (
    dataField &&
    typeof dataField === "object" &&
    "workspaceID" in dataField
  ) {
    const raw = (dataField as { workspaceID?: unknown }).workspaceID;
    if (typeof raw === "string" && raw.length > 0) {
      return { ok: true, workspaceID: raw };
    }
  }

  return { ok: true, workspaceID: null };
}

const stringifyErrorDetail = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return (value as { message: string }).message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export async function deleteAdvWorkspace(
  deps: WarpDeps,
  workspaceID: string,
): Promise<void> {
  const response = await fetchWith(deps)(
    workspaceUrl(deps, `/${encodeURIComponent(workspaceID)}`),
    { method: "DELETE", headers: directoryHeaders(deps) },
  );

  if (response.ok || response.status === 404) return;

  throw new Error(
    `deleteAdvWorkspace failed: ${response.status} ${await responseText(
      response,
    )}`,
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAdvWorkspaceListItem = (
  value: unknown,
): value is {
  id: string;
  type: "adv-worktree";
  directory: string | null;
  extra: { directory: string; branch?: string };
} =>
  isRecord(value) &&
  "id" in value &&
  typeof value.id === "string" &&
  value.type === "adv-worktree" &&
  "directory" in value &&
  (typeof value.directory === "string" || value.directory === null) &&
  isRecord(value.extra) &&
  typeof value.extra.directory === "string";

export async function findWorkspaceByDirectory(
  deps: WarpDeps,
  directory: string,
  branch?: string,
): Promise<WorkspaceHandle | null> {
  if (!warpFlagEnabled()) return null;

  try {
    const response = await fetchWith(deps)(workspaceUrl(deps), {
      headers: directoryHeaders(deps),
    });
    if (!response.ok) return null;

    const list: unknown = await response.json();
    if (!Array.isArray(list)) return null;

    const match = list.find(
      (item) =>
        isAdvWorkspaceListItem(item) &&
        item.extra.directory === directory &&
        (item.directory === null || item.directory === directory) &&
        (branch === undefined || item.extra.branch === branch),
    );
    return isAdvWorkspaceListItem(match) ? { workspaceID: match.id } : null;
  } catch {
    return null;
  }
}
