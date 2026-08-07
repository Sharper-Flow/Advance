import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";

import { runAbortableProcess } from "./process-runner";
import { createWorktreeOperationContext } from "./worktree-operation";

describe("abortable process runner", () => {
  it("terminates the POSIX process group and waits for close", async () => {
    const marker = `/tmp/adv-process-runner-${process.pid}-${Date.now()}`;
    const script = [
      "const fs=require('fs');",
      `const marker=${JSON.stringify(marker)};`,
      "const child=require('child_process').spawn(process.execPath,['-e',\"setTimeout(()=>fs.writeFileSync(process.argv[1],'late'),180)\",marker],{stdio:'ignore'});",
      "setTimeout(()=>{},1000);",
    ].join("");

    const result = await runAbortableProcess({
      command: process.execPath,
      args: ["-e", script, marker],
      timeoutMs: 30,
      killGraceMs: 20,
      destructiveSubtree: true,
    });

    expect(result.timedOut).toBe(true);
    expect(result.closed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(fs.existsSync(marker)).toBe(false);
    fs.rmSync(marker, { force: true });
  });

  it("fails closed for destructive subtree guarantees on unsupported platforms", async () => {
    await expect(
      runAbortableProcess({
        command: "git",
        args: ["--version"],
        platform: "win32",
        destructiveSubtree: true,
      }),
    ).rejects.toThrow(/destructive subtree/i);
  });

  it("unregisters a failed child before a later operation abort", async () => {
    const operation = createWorktreeOperationContext();
    const kill = vi.fn(() => true);
    const child = Object.assign(new EventEmitter(), {
      pid: 42,
      kill,
    });

    const running = runAbortableProcess({
      command: "unused",
      platform: "win32",
      operation,
      spawnProcess: () => {
        queueMicrotask(() => child.emit("error", new Error("spawn failed")));
        return child as never;
      },
    });

    await expect(running).rejects.toThrow("spawn failed");
    await operation.abort("deadline");
    operation.dispose();

    expect(kill).not.toHaveBeenCalled();
  });
});
