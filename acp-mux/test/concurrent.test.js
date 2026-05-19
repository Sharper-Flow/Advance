import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as concurrent from "../lib/concurrent.js";

describe("concurrent instance scanning", () => {
  let tmpRoot;
  let legacyRoot;
  let savedEnv;

  before(() => {
    savedEnv = {
      ACP_MUX_INSTANCES_ROOT: process.env.ACP_MUX_INSTANCES_ROOT,
      OPENCODE_LEGACY_INSTANCES_ROOT: process.env.OPENCODE_LEGACY_INSTANCES_ROOT,
      ACP_MUX_INSTANCE_ID: process.env.ACP_MUX_INSTANCE_ID,
    };
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oc-zed-test-"));
    legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oc-zed-legacy-"));
    process.env.ACP_MUX_INSTANCES_ROOT = tmpRoot;
    process.env.OPENCODE_LEGACY_INSTANCES_ROOT = legacyRoot;
    delete process.env.ACP_MUX_INSTANCE_ID;

    // current-root: alive + dead
    for (const [id, stamp] of [
      ["alive-1", { id: "alive-1", pid: process.pid, ppid: 1, cwd: "/some/project-a", started_at: "2026-05-19T10:00:00Z" }],
      ["dead-1", { id: "dead-1", pid: 999999, ppid: 1, cwd: "/some/project-b", started_at: "2026-05-18T09:00:00Z" }],
    ]) {
      const dir = path.join(tmpRoot, id, "opencode");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, ".instance.json"), JSON.stringify(stamp));
    }

    // legacy-root: one alive (uses current process.pid so it counts as alive)
    for (const [id, stamp] of [
      ["legacy-alive", { id: "legacy-alive", pid: process.pid, ppid: 1, cwd: "/some/project-a", started_at: "2026-05-17T08:00:00Z" }],
    ]) {
      const dir = path.join(legacyRoot, id, "opencode");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, ".instance.json"), JSON.stringify(stamp));
    }
  });

  after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(legacyRoot, { recursive: true, force: true });
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("listInstances returns 3 by default (current + legacy)", () => {
    const list = concurrent.listInstances();
    assert.equal(list.length, 3);
  });

  it("includeLegacy=false excludes legacy root", () => {
    const list = concurrent.listInstances({ includeLegacy: false });
    assert.equal(list.length, 2);
    assert.ok(list.every((i) => i.origin === "current"));
  });

  it("liveOnly filters to alive PIDs (across both roots)", () => {
    const list = concurrent.listInstances({ liveOnly: true });
    assert.equal(list.length, 2);
    for (const i of list) {
      assert.equal(i.alive, true);
    }
    const origins = list.map((i) => i.origin).sort();
    assert.deepEqual(origins, ["current", "legacy"]);
  });

  it("instancesForProject merges both roots by cwd prefix", () => {
    const a = concurrent.instancesForProject("/some/project-a");
    assert.equal(a.length, 2);
    const ids = a.map((i) => i.id).sort();
    assert.deepEqual(ids, ["alive-1", "legacy-alive"]);
  });

  it("summary reports project-vs-all counts", () => {
    const s = concurrent.summary("/some/project-a");
    assert.equal(s.totalLive, 2);
    assert.equal(s.onCurrentProject, 2);
  });
});
