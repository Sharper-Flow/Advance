import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAdvWorkspace,
  deleteAdvWorkspace,
  findWorkspaceByDirectory,
  getSessionWorkspaceID,
  warpFlagEnabled,
  warpSession,
  workspaceAndWarpAvailable,
  type WarpDeps,
} from "./workspace-warp.js";
import type { OpencodeClient } from "./opencode-types.js";

const serverUrl = new URL("http://127.0.0.1:4096");
const directory = "/tmp/wt";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const textResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, init);

const getCall = (fetchImpl: ReturnType<typeof vi.fn>, index = 0) => {
  const call = fetchImpl.mock.calls[index];
  if (!call) throw new Error(`missing fetch call ${index}`);
  return call;
};

/**
 * Build a minimal SDK client mock with a configurable session.get.
 * Cast through unknown because the ambient SDK type is intentionally loose;
 * the real v1 SDK returns a richer result-tuple shape that we test against
 * directly rather than through the type system.
 */
const createMockSdkClient = (
  sessionGet: (args: { path: { id: string } }) => Promise<unknown>,
): OpencodeClient =>
  ({
    session: { get: sessionGet },
  }) as unknown as OpencodeClient;

const baseDeps = (overrides: Partial<WarpDeps> = {}): WarpDeps => ({
  serverUrl,
  directory,
  ...overrides,
});

describe("workspace-warp", () => {
  // Explicitly clear experimental env vars before each test so the shell
  // environment (which may have OPENCODE_EXPERIMENTAL_WORKSPACES=true set
  // during ADV development) doesn't leak into tests that assert the
  // off-by-default warpFlagEnabled() behavior. P25 touched-scope fix.
  beforeEach(() => {
    vi.stubEnv("OPENCODE_EXPERIMENTAL", "");
    vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("warpFlagEnabled", () => {
    it("returns true when OPENCODE_EXPERIMENTAL is exactly true", () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL", "true");

      expect(warpFlagEnabled()).toBe(true);
    });

    it("returns true when OPENCODE_EXPERIMENTAL_WORKSPACES is exactly true", () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");

      expect(warpFlagEnabled()).toBe(true);
    });

    it("returns true when both experimental env vars are true", () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL", "true");
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");

      expect(warpFlagEnabled()).toBe(true);
    });

    it("returns false when neither experimental env var is set", () => {
      expect(warpFlagEnabled()).toBe(false);
    });

    it("returns false for truthy-looking but unsupported values", () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL", "TRUE");
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "1");

      expect(warpFlagEnabled()).toBe(false);
    });
  });

  describe("workspaceAndWarpAvailable", () => {
    it("short-circuits without HTTP when the warp flag is off", async () => {
      const fetchImpl = vi.fn();

      await expect(
        workspaceAndWarpAvailable(baseDeps({ fetchImpl })),
      ).resolves.toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("returns true when the flag is on and the endpoint responds 2xx", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockResolvedValue(textResponse("[]"));

      await expect(
        workspaceAndWarpAvailable(baseDeps({ fetchImpl })),
      ).resolves.toBe(true);
      expect(String(getCall(fetchImpl)[0])).toBe(
        "http://127.0.0.1:4096/experimental/workspace",
      );
    });

    it("returns false when the flag is on and the endpoint is non-2xx", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(textResponse("nope", { status: 404 }));

      await expect(
        workspaceAndWarpAvailable(baseDeps({ fetchImpl })),
      ).resolves.toBe(false);
      expect(fetchImpl).toHaveBeenCalledOnce();
    });

    it("returns false when the flag is on and fetch throws", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

      await expect(
        workspaceAndWarpAvailable(baseDeps({ fetchImpl })),
      ).resolves.toBe(false);
      expect(fetchImpl).toHaveBeenCalledOnce();
    });
  });

  it("creates an ADV workspace using CreatePayload.extra.directory", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "ws-abc" }));

    await expect(
      createAdvWorkspace(baseDeps({ fetchImpl }), {
        directory: "/tmp/wt",
        branch: "change/test",
      }),
    ).resolves.toEqual({ workspaceID: "ws-abc" });

    const [url, init] = getCall(fetchImpl);
    expect(String(url)).toBe("http://127.0.0.1:4096/experimental/workspace");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(init.body))).toEqual({
      type: "adv-worktree",
      branch: "change/test",
      extra: { directory: "/tmp/wt", branch: "change/test" },
    });
  });

  it("rejects workspace create failures with status and response body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(textResponse("bad payload", { status: 400 }));

    await expect(
      createAdvWorkspace(baseDeps({ fetchImpl }), {
        directory: "/tmp/wt",
        branch: "change/test",
      }),
    ).rejects.toThrow("createAdvWorkspace failed: 400 bad payload");
  });

  it("truncates long endpoint error bodies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(textResponse("x".repeat(1200), { status: 500 }));

    await expect(
      createAdvWorkspace(baseDeps({ fetchImpl }), {
        directory: "/tmp/wt",
        branch: "change/test",
      }),
    ).rejects.toThrow(/x{1000}…\[truncated\]/);
  });

  it("rejects workspace create responses without a string id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ workspaceID: "wrong" }));

    await expect(
      createAdvWorkspace(baseDeps({ fetchImpl }), {
        directory: "/tmp/wt",
        branch: "change/test",
      }),
    ).rejects.toThrow("createAdvWorkspace failed: missing workspace id");
  });

  it("warps the session using WarpPayload.id and copyChanges false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(""));

    await expect(
      warpSession(baseDeps({ fetchImpl }), {
        workspaceID: "ws-abc",
        sessionID: "ses-123",
      }),
    ).resolves.toBeUndefined();

    const [url, init] = getCall(fetchImpl);
    expect(String(url)).toBe(
      "http://127.0.0.1:4096/experimental/workspace/warp",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(init.body))).toEqual({
      id: "ws-abc",
      sessionID: "ses-123",
      copyChanges: false,
    });
    expect(String(init.body)).not.toContain("workspaceID");
  });

  it("rejects warp failures with status and response body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(textResponse("bad warp", { status: 500 }));

    await expect(
      warpSession(baseDeps({ fetchImpl }), {
        workspaceID: "ws-abc",
        sessionID: "ses-123",
      }),
    ).rejects.toThrow("warpSession failed: 500 bad warp");
  });

  describe("getSessionWorkspaceID (SDK-routed, structured result tuple)", () => {
    it("returns { ok: true, workspaceID } when SDK call succeeds with a workspaceID", async () => {
      const sessionGet = vi.fn().mockResolvedValue({
        data: { id: "ses-123", workspaceID: "ws-abc" },
        error: undefined,
        response: { status: 200 },
      });
      const client = createMockSdkClient(sessionGet);

      await expect(
        getSessionWorkspaceID(baseDeps({ client }), "ses-123"),
      ).resolves.toEqual({ ok: true, workspaceID: "ws-abc" });

      expect(sessionGet).toHaveBeenCalledWith({ path: { id: "ses-123" } });
    });

    it("returns { ok: true, workspaceID: null } when SDK call succeeds without a workspaceID", async () => {
      const sessionGet = vi.fn().mockResolvedValue({
        data: { id: "ses-123" },
        error: undefined,
        response: { status: 200 },
      });
      const client = createMockSdkClient(sessionGet);

      await expect(
        getSessionWorkspaceID(baseDeps({ client }), "ses-123"),
      ).resolves.toEqual({ ok: true, workspaceID: null });
    });

    it("returns { ok: true, workspaceID: null } when workspaceID is an empty string", async () => {
      const sessionGet = vi.fn().mockResolvedValue({
        data: { id: "ses-123", workspaceID: "" },
        error: undefined,
        response: { status: 200 },
      });
      const client = createMockSdkClient(sessionGet);

      await expect(
        getSessionWorkspaceID(baseDeps({ client }), "ses-123"),
      ).resolves.toEqual({ ok: true, workspaceID: null });
    });

    it("returns { ok: false, status, detail } when SDK returns an error tuple (e.g. 404)", async () => {
      const sessionGet = vi.fn().mockResolvedValue({
        data: undefined,
        error: { message: "session not found" },
        response: { status: 404 },
      });
      const client = createMockSdkClient(sessionGet);

      const result = await getSessionWorkspaceID(
        baseDeps({ client }),
        "ses-missing",
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.detail).toContain("session not found");
      }
    });

    it("returns { ok: false, detail } when SDK throws (e.g. network error)", async () => {
      const sessionGet = vi
        .fn()
        .mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:4096"));
      const client = createMockSdkClient(sessionGet);

      const result = await getSessionWorkspaceID(
        baseDeps({ client }),
        "ses-123",
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBeUndefined();
        expect(result.detail).toContain("ECONNREFUSED");
      }
    });

    it("returns { ok: false, detail: 'missing client' } when deps.client is undefined", async () => {
      const result = await getSessionWorkspaceID(
        baseDeps({ client: undefined }),
        "ses-123",
      );

      expect(result).toEqual({ ok: false, detail: "missing client" });
    });

    it("uses the v1 SDK path-parameter shape { path: { id } }", async () => {
      const sessionGet = vi.fn().mockResolvedValue({
        data: { id: "ses-xyz" },
        error: undefined,
        response: { status: 200 },
      });
      const client = createMockSdkClient(sessionGet);

      await getSessionWorkspaceID(baseDeps({ client }), "ses-xyz");

      expect(sessionGet).toHaveBeenCalledTimes(1);
      const [args] = sessionGet.mock.calls[0] as [{ path: { id: string } }];
      expect(args).toEqual({ path: { id: "ses-xyz" } });
    });

    it("does not perform raw fetch when an SDK client is provided", async () => {
      const fetchImpl = vi.fn();
      const sessionGet = vi.fn().mockResolvedValue({
        data: { id: "ses-123", workspaceID: "ws-abc" },
        error: undefined,
        response: { status: 200 },
      });
      const client = createMockSdkClient(sessionGet);

      await getSessionWorkspaceID(baseDeps({ client, fetchImpl }), "ses-123");

      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  it("deletes an ADV workspace by id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(""));

    await expect(
      deleteAdvWorkspace(baseDeps({ fetchImpl }), "ws-abc"),
    ).resolves.toBeUndefined();

    const [url, init] = getCall(fetchImpl);
    expect(String(url)).toBe(
      "http://127.0.0.1:4096/experimental/workspace/ws-abc",
    );
    expect(init).toMatchObject({ method: "DELETE" });
  });

  it("treats workspace delete 404 as already-clean", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(textResponse("missing", { status: 404 }));

    await expect(
      deleteAdvWorkspace(baseDeps({ fetchImpl }), "ws-abc"),
    ).resolves.toBeUndefined();
  });

  it("rejects non-404 workspace delete failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(textResponse("boom", { status: 503 }));

    await expect(
      deleteAdvWorkspace(baseDeps({ fetchImpl }), "ws-abc"),
    ).rejects.toThrow("deleteAdvWorkspace failed: 503 boom");
  });

  describe("findWorkspaceByDirectory", () => {
    it("short-circuits without HTTP when the warp flag is off", async () => {
      const fetchImpl = vi.fn();

      await expect(
        findWorkspaceByDirectory(baseDeps({ fetchImpl }), "/tmp/wt"),
      ).resolves.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("returns the matching workspace id by exact directory", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse([
          {
            id: "ws-other",
            type: "adv-worktree",
            directory: "/tmp/other",
            extra: { directory: "/tmp/other", branch: "change/other" },
          },
          {
            id: "ws-match",
            type: "adv-worktree",
            directory: "/tmp/wt",
            extra: { directory: "/tmp/wt", branch: "change/test" },
          },
        ]),
      );

      await expect(
        findWorkspaceByDirectory(
          baseDeps({ fetchImpl }),
          "/tmp/wt",
          "change/test",
        ),
      ).resolves.toEqual({ workspaceID: "ws-match" });
      expect(String(getCall(fetchImpl)[0])).toBe(
        "http://127.0.0.1:4096/experimental/workspace",
      );
    });

    it("matches ADV workspace rows by extra.directory when top-level directory is not populated", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse([
          {
            id: "ws-match",
            type: "adv-worktree",
            directory: null,
            extra: { directory: "/tmp/wt", branch: "change/test" },
          },
        ]),
      );

      await expect(
        findWorkspaceByDirectory(
          baseDeps({ fetchImpl }),
          "/tmp/wt",
          "change/test",
        ),
      ).resolves.toEqual({ workspaceID: "ws-match" });
    });

    it("ignores non-ADV or metadata-mismatched workspace rows", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse([
          {
            id: "ws-non-adv",
            type: "git",
            directory: "/tmp/wt",
            extra: { directory: "/tmp/wt", branch: "change/test" },
          },
          {
            id: "ws-wrong-extra",
            type: "adv-worktree",
            directory: "/tmp/wt",
            extra: { directory: "/tmp/other", branch: "change/test" },
          },
          {
            id: "ws-wrong-branch",
            type: "adv-worktree",
            directory: "/tmp/wt",
            extra: { directory: "/tmp/wt", branch: "change/other" },
          },
        ]),
      );

      await expect(
        findWorkspaceByDirectory(
          baseDeps({ fetchImpl }),
          "/tmp/wt",
          "change/test",
        ),
      ).resolves.toBeNull();
    });

    it("returns null when no workspace directory matches", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          jsonResponse([{ id: "ws-other", directory: "/tmp/other" }]),
        );

      await expect(
        findWorkspaceByDirectory(baseDeps({ fetchImpl }), "/tmp/wt"),
      ).resolves.toBeNull();
    });

    it("returns null on non-2xx, fetch errors, or malformed list responses", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");

      await expect(
        findWorkspaceByDirectory(
          baseDeps({
            fetchImpl: vi
              .fn()
              .mockResolvedValue(textResponse("no", { status: 500 })),
          }),
          "/tmp/wt",
        ),
      ).resolves.toBeNull();

      await expect(
        findWorkspaceByDirectory(
          baseDeps({
            fetchImpl: vi.fn().mockRejectedValue(new Error("network")),
          }),
          "/tmp/wt",
        ),
      ).resolves.toBeNull();

      await expect(
        findWorkspaceByDirectory(
          baseDeps({
            fetchImpl: vi
              .fn()
              .mockResolvedValue(jsonResponse({ id: "not-list" })),
          }),
          "/tmp/wt",
        ),
      ).resolves.toBeNull();
    });
  });

  describe("x-opencode-directory header attachment (rq-warpModeContract05)", () => {
    const expectedHeader = encodeURIComponent("/tmp/wt");

    it("attaches x-opencode-directory on createAdvWorkspace POST", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "ws-x" }));

      await createAdvWorkspace(baseDeps({ fetchImpl }), {
        directory: "/tmp/wt",
        branch: "change/test",
      });

      const [, init] = getCall(fetchImpl);
      expect(
        (init?.headers as Record<string, string>)["x-opencode-directory"],
      ).toBe(expectedHeader);
    });

    it("attaches x-opencode-directory on warpSession POST", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(textResponse(""));

      await warpSession(baseDeps({ fetchImpl }), {
        workspaceID: "ws-x",
        sessionID: "ses-1",
      });

      const [, init] = getCall(fetchImpl);
      expect(
        (init?.headers as Record<string, string>)["x-opencode-directory"],
      ).toBe(expectedHeader);
    });

    it("attaches x-opencode-directory on deleteAdvWorkspace DELETE", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(textResponse(""));

      await deleteAdvWorkspace(baseDeps({ fetchImpl }), "ws-x");

      const [, init] = getCall(fetchImpl);
      expect(
        (init?.headers as Record<string, string>)["x-opencode-directory"],
      ).toBe(expectedHeader);
    });

    it("attaches x-opencode-directory on workspaceAndWarpAvailable GET", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockResolvedValue(textResponse("[]"));

      await workspaceAndWarpAvailable(baseDeps({ fetchImpl }));

      const [, init] = getCall(fetchImpl);
      expect(
        (init?.headers as Record<string, string>)["x-opencode-directory"],
      ).toBe(expectedHeader);
    });

    it("attaches x-opencode-directory on findWorkspaceByDirectory GET", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

      await findWorkspaceByDirectory(baseDeps({ fetchImpl }), "/tmp/wt");

      const [, init] = getCall(fetchImpl);
      expect(
        (init?.headers as Record<string, string>)["x-opencode-directory"],
      ).toBe(expectedHeader);
    });

    it("encodes directory paths with special characters per encodeURIComponent", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "ws-x" }));

      await createAdvWorkspace(
        baseDeps({
          fetchImpl,
          directory: "/home/dev/My Code/repo",
        }),
        { directory: "/home/dev/My Code/repo", branch: "change/test" },
      );

      const [, init] = getCall(fetchImpl);
      expect(
        (init?.headers as Record<string, string>)["x-opencode-directory"],
      ).toBe("%2Fhome%2Fdev%2FMy%20Code%2Frepo");
    });

    it("preserves content-type header on POST endpoints", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "ws-x" }));

      await createAdvWorkspace(baseDeps({ fetchImpl }), {
        directory: "/tmp/wt",
        branch: "change/test",
      });

      const [, init] = getCall(fetchImpl);
      const headers = init?.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("application/json");
      expect(headers["x-opencode-directory"]).toBe(expectedHeader);
    });
  });
});
