import { describe, expect, test } from "vitest";
import { parseGitRemoteUrl } from "./git-remote";

describe("parseGitRemoteUrl", () => {
  test.each([
    [
      "git@github.com:Sharper-Flow/Example-Web.git",
      "Sharper-Flow",
      "Example-Web",
    ],
    [
      "https://github.com/Sharper-Flow/Example-Web.git",
      "Sharper-Flow",
      "Example-Web",
    ],
    [
      "ssh://git@github.com/Sharper-Flow/Example-Web.git",
      "Sharper-Flow",
      "Example-Web",
    ],
    [
      "https://github.com/Sharper-Flow/Example-Web",
      "Sharper-Flow",
      "Example-Web",
    ],
  ])("parses %s", (url, owner, name) => {
    expect(parseGitRemoteUrl(url)).toEqual({ owner, name });
  });

  test.each([
    "",
    "not a url",
    "git@github.com:Sharper-Flow.git",
    "https://github.com/Sharper-Flow",
    "https://gitlab.com/Sharper-Flow/Example-Web.git",
  ])("returns null for unsupported remote %s", (url) => {
    expect(parseGitRemoteUrl(url)).toBeNull();
  });
});
