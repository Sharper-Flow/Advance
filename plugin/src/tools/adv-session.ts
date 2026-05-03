/**
 * ADV Session Tools (T24 — KD-8 phase 1)
 *
 * Tool definitions for `adv_session_list` and `adv_session_show`.
 *
 * These wrap the underlying session implementations from
 * `tools/session/` and format output via `formatToolOutput()`.
 */

import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import { listPeerSessions, showOwnSession } from "./session";

export const advSessionTools = {
  adv_session_list: {
    description:
      "List peer sessions in this project. Privacy-defensive: exposes only sessionId, startedAt, worktree basename, and isSelf flag.",
    args: {
      projectRoot: z
        .string()
        .optional()
        .describe(
          "Optional override for the project root. Defaults to process.cwd(). Cross-project session listing is NOT supported in v1.",
        ),
    },
    execute: async (args: { projectRoot?: string }, _store: Store) => {
      const result = await listPeerSessions(args);
      return formatToolOutput(result);
    },
  },

  adv_session_show: {
    description:
      "Show details for the caller's own session only. Includes PID, full workdir, and active workflow context — these MUST NOT leak to peers.",
    args: {
      sessionId: z
        .string()
        .describe("Opaque session id (sess_\u003c8 alphanumeric\u003e)"),
      projectRoot: z
        .string()
        .optional()
        .describe(
          "Optional override for the project root. Defaults to process.cwd().",
        ),
    },
    execute: async (
      args: { sessionId: string; projectRoot?: string },
      _store: Store,
    ) => {
      const result = await showOwnSession(args);
      return formatToolOutput(result);
    },
  },
};
