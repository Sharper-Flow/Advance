import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAdvWorkspace,
  deleteAdvWorkspace,
  findWorkspaceByDirectory,
  getSessionWorkspaceID,
  warpFlagEnabled,
  warpSession,
  workspaceAndWarpAvailable,
} from "./workspace-warp.js";

const serverUrl = new URL("http://127.0.0.1:4096");

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

describe("workspace-warp", () => {
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
        workspaceAndWarpAvailable({ serverUrl, fetchImpl }),
      ).resolves.toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("returns true when the flag is on and the endpoint responds 2xx", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockResolvedValue(textResponse("[]"));

      await expect(
        workspaceAndWarpAvailable({ serverUrl, fetchImpl }),
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
        workspaceAndWarpAvailable({ serverUrl, fetchImpl }),
      ).resolves.toBe(false);
      expect(fetchImpl).toHaveBeenCalledOnce();
    });

    it("returns false when the flag is on and fetch throws", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");
      const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

      await expect(
        workspaceAndWarpAvailable({ serverUrl, fetchImpl }),
      ).resolves.toBe(false);
      expect(fetchImpl).toHaveBeenCalledOnce();
    });
  });

  it("creates an ADV workspace using CreatePayload.extra.directory", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "ws-abc" }));

    await expect(
      createAdvWorkspace(
        { serverUrl, fetchImpl },
        { directory: "/tmp/wt", branch: "change/test" },
      ),
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
      createAdvWorkspace(
        { serverUrl, fetchImpl },
        { directory: "/tmp/wt", branch: "change/test" },
      ),
    ).rejects.toThrow("createAdvWorkspace failed: 400 bad payload");
  });

  it("truncates long endpoint error bodies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(textResponse("x".repeat(1200), { status: 500 }));

    await expect(
      createAdvWorkspace(
        { serverUrl, fetchImpl },
        { directory: "/tmp/wt", branch: "change/test" },
      ),
    ).rejects.toThrow(/x{1000}…\[truncated\]/);
  });

  it("rejects workspace create responses without a string id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ workspaceID: "wrong" }));

    await expect(
      createAdvWorkspace(
        { serverUrl, fetchImpl },
        { directory: "/tmp/wt", branch: "change/test" },
      ),
    ).rejects.toThrow("createAdvWorkspace failed: missing workspace id");
  });

  it("warps the session using WarpPayload.id and copyChanges false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(""));

    await expect(
      warpSession(
        { serverUrl, fetchImpl },
        { workspaceID: "ws-abc", sessionID: "ses-123" },
      ),
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
      warpSession(
        { serverUrl, fetchImpl },
        { workspaceID: "ws-abc", sessionID: "ses-123" },
      ),
    ).rejects.toThrow("warpSession failed: 500 bad warp");
  });

  it("reads the current session workspace id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: "ses-123", workspaceID: "ws-abc" }),
      );

    await expect(
      getSessionWorkspaceID({ serverUrl, fetchImpl }, "ses-123"),
    ).resolves.toBe("ws-abc");

    expect(String(getCall(fetchImpl)[0])).toBe(
      "http://127.0.0.1:4096/session/ses-123",
    );
  });

  it("returns null when the current session has no workspace id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "ses-123" }));

    await expect(
      getSessionWorkspaceID({ serverUrl, fetchImpl }, "ses-123"),
    ).resolves.toBeNull();
  });

  it("rejects session workspace lookup failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(textResponse("missing", { status: 404 }));

    await expect(
      getSessionWorkspaceID({ serverUrl, fetchImpl }, "ses-123"),
    ).rejects.toThrow("getSessionWorkspaceID failed: 404 missing");
  });

  it("deletes an ADV workspace by id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(""));

    await expect(
      deleteAdvWorkspace({ serverUrl, fetchImpl }, "ws-abc"),
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
      deleteAdvWorkspace({ serverUrl, fetchImpl }, "ws-abc"),
    ).resolves.toBeUndefined();
  });

  it("rejects non-404 workspace delete failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(textResponse("boom", { status: 503 }));

    await expect(
      deleteAdvWorkspace({ serverUrl, fetchImpl }, "ws-abc"),
    ).rejects.toThrow("deleteAdvWorkspace failed: 503 boom");
  });

  describe("findWorkspaceByDirectory", () => {
    it("short-circuits without HTTP when the warp flag is off", async () => {
      const fetchImpl = vi.fn();

      await expect(
        findWorkspaceByDirectory({ serverUrl, fetchImpl }, "/tmp/wt"),
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
          { serverUrl, fetchImpl },
          "/tmp/wt",
          "change/test",
        ),
      ).resolves.toEqual({ workspaceID: "ws-match" });
      expect(String(getCall(fetchImpl)[0])).toBe(
        "http://127.0.0.1:4096/experimental/workspace",
      );
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
          { serverUrl, fetchImpl },
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
        findWorkspaceByDirectory({ serverUrl, fetchImpl }, "/tmp/wt"),
      ).resolves.toBeNull();
    });

    it("returns null on non-2xx, fetch errors, or malformed list responses", async () => {
      vi.stubEnv("OPENCODE_EXPERIMENTAL_WORKSPACES", "true");

      await expect(
        findWorkspaceByDirectory(
          {
            serverUrl,
            fetchImpl: vi
              .fn()
              .mockResolvedValue(textResponse("no", { status: 500 })),
          },
          "/tmp/wt",
        ),
      ).resolves.toBeNull();

      await expect(
        findWorkspaceByDirectory(
          {
            serverUrl,
            fetchImpl: vi.fn().mockRejectedValue(new Error("network")),
          },
          "/tmp/wt",
        ),
      ).resolves.toBeNull();

      await expect(
        findWorkspaceByDirectory(
          {
            serverUrl,
            fetchImpl: vi
              .fn()
              .mockResolvedValue(jsonResponse({ id: "not-list" })),
          },
          "/tmp/wt",
        ),
      ).resolves.toBeNull();
    });
  });
});
