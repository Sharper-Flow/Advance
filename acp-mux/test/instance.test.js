import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import * as instance from "../lib/instance.js";

describe("instance detection", () => {
  let savedEnv;
  before(() => {
    savedEnv = {
      ACP_MUX_INSTANCE_ID: process.env.ACP_MUX_INSTANCE_ID,
      OPENCODE_CLIENT: process.env.OPENCODE_CLIENT,
      OPENCODE_MASTER_DATA: process.env.OPENCODE_MASTER_DATA,
      ACP_MUX_INSTANCES_ROOT: process.env.ACP_MUX_INSTANCES_ROOT,
    };
  });
  after(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("master mode when ACP_MUX_INSTANCE_ID is unset", () => {
    delete process.env.ACP_MUX_INSTANCE_ID;
    assert.equal(instance.isolatedMode(), false);
    assert.equal(instance.currentInstanceId(), null);
    assert.equal(instance.currentInstanceDir(), null);
    const snap = instance.snapshot();
    assert.equal(snap.mode, "master");
    assert.equal(snap.dbPath, snap.masterDbPath);
  });

  it("isolated mode when ACP_MUX_INSTANCE_ID is set", () => {
    process.env.ACP_MUX_INSTANCE_ID = "test-instance-xyz";
    process.env.ACP_MUX_INSTANCES_ROOT = "/tmp/oc-zed-test";
    assert.equal(instance.isolatedMode(), true);
    assert.equal(instance.currentInstanceId(), "test-instance-xyz");
    const dir = instance.currentInstanceDir();
    assert.match(dir, /\/tmp\/oc-zed-test\/test-instance-xyz\/opencode$/);
    const snap = instance.snapshot();
    assert.equal(snap.mode, "isolated");
    assert.notEqual(snap.dbPath, snap.masterDbPath);
  });

  it("acpMode reflects OPENCODE_CLIENT=acp", () => {
    delete process.env.OPENCODE_CLIENT;
    assert.equal(instance.acpMode(), false);
    process.env.OPENCODE_CLIENT = "acp";
    assert.equal(instance.acpMode(), true);
    process.env.OPENCODE_CLIENT = "tui";
    assert.equal(instance.acpMode(), false);
  });

  it("respects OPENCODE_MASTER_DATA override", () => {
    delete process.env.ACP_MUX_INSTANCE_ID;
    process.env.OPENCODE_MASTER_DATA = "/tmp/master-test";
    assert.match(instance.masterDbPath(), /\/tmp\/master-test\/opencode\.db$/);
  });
});
