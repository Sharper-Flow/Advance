import { describe, expect, test } from "vitest";
import { HANDSHAKE_TIER4_TOOLS, handleHandshake } from "./handshake.js";
import { TIER_4_MCP_TOOLS } from "../tool-tier4-catalog.js";

describe("HANDSHAKE_TIER4_TOOLS", () => {
  test("remains identical to the neutral Tier-4 catalog", () => {
    expect(HANDSHAKE_TIER4_TOOLS).toEqual(TIER_4_MCP_TOOLS);
  });

  test("handshake response uses the catalog list", () => {
    const result = handleHandshake();
    expect(result.tier4_tools).toBe(HANDSHAKE_TIER4_TOOLS);
    expect(result.adv_contract_version).toBe(1);
  });
});
