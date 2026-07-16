import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalTestWorkflowEnvironment,
  createTestWorkflowEnvironment,
  createTimeSkippingTestWorkflowEnvironment,
  withTestWorkflowEnvironment,
  withTimeSkippingTestWorkflowEnvironment,
} from "./with-test-env";

const { createTimeSkippingMock, createLocalMock } = vi.hoisted(() => ({
  createTimeSkippingMock: vi.fn(),
  createLocalMock: vi.fn(),
}));

vi.mock("@temporalio/testing", () => ({
  TestWorkflowEnvironment: {
    createTimeSkipping: createTimeSkippingMock,
    createLocal: createLocalMock,
  },
}));

interface FakeEnv {
  teardown: () => Promise<void>;
}

describe("withTestWorkflowEnvironment", () => {
  it("creates the env from a stable non-worktree cwd and restores cwd", async () => {
    const originalCwd = process.cwd();
    let observedCwd = "";

    await createTestWorkflowEnvironment(async () => {
      observedCwd = process.cwd();
      return { teardown: async () => {} };
    });

    expect(observedCwd).toContain("advance-temporal-test-cwd");
    expect(process.cwd()).toBe(originalCwd);
  });

  it("calls fn with the created env and tears down on success", async () => {
    const teardown = vi.fn(async () => {});
    const fakeEnv: FakeEnv = { teardown };
    const createEnv = vi.fn(async () => fakeEnv);
    const fn = vi.fn(async (env: FakeEnv) => {
      expect(env).toBe(fakeEnv);
      return 42;
    });

    const result = await withTestWorkflowEnvironment(createEnv, fn);

    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledWith(fakeEnv);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("tears down even when fn throws, and propagates fn's error", async () => {
    const teardown = vi.fn(async () => {});
    const createEnv = async () => ({ teardown });
    const fn = async () => {
      throw new Error("boom from fn");
    };

    await expect(withTestWorkflowEnvironment(createEnv, fn)).rejects.toThrow(
      "boom from fn",
    );
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("propagates teardown errors when fn succeeds", async () => {
    const createEnv = async () => ({
      teardown: async () => {
        throw new Error("teardown exploded");
      },
    });
    const fn = async () => "ok";

    await expect(withTestWorkflowEnvironment(createEnv, fn)).rejects.toThrow(
      "teardown exploded",
    );
  });

  it("surfaces fn's error when both fn and teardown throw (fn wins by convention)", async () => {
    // Documents the chosen semantics: when BOTH fn and teardown throw, the
    // fn error is the actionable one (surfaced via the `finally` rethrowing
    // teardown would otherwise mask it). Either error propagating is
    // acceptable — what's NOT acceptable is silently swallowing both.
    const createEnv = async () => ({
      teardown: async () => {
        throw new Error("teardown-err");
      },
    });
    const fn = async () => {
      throw new Error("fn-err");
    };

    await expect(withTestWorkflowEnvironment(createEnv, fn)).rejects.toThrow(
      /fn-err|teardown-err/,
    );
  });
});

describe("named constructor wrappers", () => {
  beforeEach(() => {
    createTimeSkippingMock.mockReset();
    createLocalMock.mockReset();
  });

  it("createTimeSkippingTestWorkflowEnvironment constructs via the SDK from the stable cwd and restores cwd", async () => {
    const originalCwd = process.cwd();
    let observedCwd = "";
    const fakeEnv = { teardown: vi.fn(async () => {}) };
    createTimeSkippingMock.mockImplementation(async () => {
      observedCwd = process.cwd();
      return fakeEnv;
    });

    const env = await createTimeSkippingTestWorkflowEnvironment();

    expect(createTimeSkippingMock).toHaveBeenCalledTimes(1);
    expect(env).toBe(fakeEnv);
    expect(observedCwd).toContain("advance-temporal-test-cwd");
    expect(process.cwd()).toBe(originalCwd);
  });

  it("createLocalTestWorkflowEnvironment constructs via createLocal from the stable cwd and restores cwd", async () => {
    const originalCwd = process.cwd();
    let observedCwd = "";
    const fakeEnv = { teardown: vi.fn(async () => {}) };
    createLocalMock.mockImplementation(async () => {
      observedCwd = process.cwd();
      return fakeEnv;
    });

    const env = await createLocalTestWorkflowEnvironment();

    expect(createLocalMock).toHaveBeenCalledTimes(1);
    expect(env).toBe(fakeEnv);
    expect(observedCwd).toContain("advance-temporal-test-cwd");
    expect(process.cwd()).toBe(originalCwd);
  });

  it("withTimeSkippingTestWorkflowEnvironment runs fn with the created env and tears down on success", async () => {
    const teardown = vi.fn(async () => {});
    const fakeEnv = { teardown };
    createTimeSkippingMock.mockResolvedValue(fakeEnv);

    const result = await withTimeSkippingTestWorkflowEnvironment(
      async (env) => {
        expect(env).toBe(fakeEnv);
        return "ok";
      },
    );

    expect(result).toBe("ok");
    expect(createTimeSkippingMock).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("withTimeSkippingTestWorkflowEnvironment tears down when fn throws and propagates fn's error", async () => {
    const teardown = vi.fn(async () => {});
    createTimeSkippingMock.mockResolvedValue({ teardown });

    await expect(
      withTimeSkippingTestWorkflowEnvironment(async () => {
        throw new Error("boom from fn");
      }),
    ).rejects.toThrow("boom from fn");
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
