// T3/T7 ambient declaration for @opencode-ai/sdk.
//
// Resolves transitive type imports used by the relocated worktree
// plugin code (plugin/src/tools/worktree/) when the SDK is not a
// direct dep of the ADV plugin. This declares only the SDK surface
// the worktree code reads.
declare module "@opencode-ai/sdk" {
  type SessionResponse<T> = Promise<{ data: T }>;
  type SessionData = { id: string; parentID?: string | null };

  // Minimal surface used by the relocated worktree code. The real SDK
  // returns a richer client; we only need the shape callers actually use.
  export interface OpencodeClientLike {
    app: {
      log: (args: {
        body: { service: string; level: string; message: string };
      }) => Promise<unknown>;
      [key: string]: unknown;
    };
    session: {
      fork: (args: {
        path: { id: string };
        body: Record<string, unknown>;
      }) => SessionResponse<SessionData>;
      get: (args: { path: { id: string } }) => SessionResponse<SessionData>;
      delete: (args: { path: { id: string } }) => Promise<unknown>;
      list: (...args: unknown[]) => Promise<unknown>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }
  export function createOpencodeClient(...args: unknown[]): OpencodeClientLike;
  // Event payload used by hooks dispatch and ADV index.ts.
  export type Event = {
    type: string;
    properties: Record<string, unknown>;
    [key: string]: unknown;
  };
}
