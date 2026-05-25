/** Shared minimal OpenCode SDK shapes used by relocated worktree code. */

type SessionResponse<T> = Promise<{
  data?: T;
  error?: unknown;
  request?: Request;
  response?: Response;
}>;
type SessionData = { id: string; parentID?: string | null };
type LogLevel = "debug" | "info" | "warn" | "error";

export interface OpencodeClient {
  app: {
    log: (args: {
      body: { service: string; level: LogLevel; message: string };
    }) => Promise<unknown>;
  };
  session: {
    fork: (args: {
      path: { id: string };
      body: Record<string, unknown>;
    }) => SessionResponse<SessionData>;
    get: (args: { path: { id: string } }) => SessionResponse<SessionData>;
    delete: (args: { path: { id: string } }) => Promise<unknown>;
  };
}

export type OpencodeEvent = {
  type: string;
  properties: Record<string, unknown>;
  [key: string]: unknown;
};
