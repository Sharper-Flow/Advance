import { describe, it, expect } from "vitest";
import { isMutating, enforceBashPolicy } from "./bash";

describe("Bash Policy Guard", () => {
  describe("isMutating", () => {
    it("should allow safe read-only commands", () => {
      expect(isMutating("ls -la")).toBe(false);
      expect(isMutating("git status")).toBe(false);
      expect(isMutating("git diff HEAD")).toBe(false);
      expect(isMutating("grep 'pattern' file")).toBe(false);
      expect(isMutating("cat file.txt")).toBe(false);
      expect(isMutating("git log --oneline")).toBe(false);
    });

    it("should block obviously mutating commands", () => {
      expect(isMutating("sed -i 's/a/b/' file")).toBe(true);
      expect(isMutating("rm file.txt")).toBe(true);
      expect(isMutating("mv a b")).toBe(true);
      expect(isMutating("cp a b")).toBe(true);
      expect(isMutating("mkdir dir")).toBe(true);
      expect(isMutating("touch file")).toBe(true);
      expect(isMutating("echo 'test' > file")).toBe(true);
      expect(isMutating("command >> file")).toBe(true);
    });

    it("should block git mutations", () => {
      expect(isMutating("git commit -m 'test'")).toBe(true);
      expect(isMutating("git add .")).toBe(true);
      expect(isMutating("git checkout branch")).toBe(true);
      expect(isMutating("git push")).toBe(true);
    });

    it("should block package manager mutations", () => {
      expect(isMutating("npm install lodash")).toBe(true);
      expect(isMutating("yarn add lodash")).toBe(true);
      expect(isMutating("pip install requests")).toBe(true);
    });
  });

  describe("enforceBashPolicy", () => {
    it("should throw error for restricted agents with mutating commands", () => {
      expect(() => enforceBashPolicy("explore", "rm -rf /")).toThrow(/Mutation blocked/);
      expect(() => enforceBashPolicy("librarian", "sed -i 's/x/y/' f")).toThrow(/Mutation blocked/);
    });

    it("should NOT throw for restricted agents with safe commands", () => {
      expect(() => enforceBashPolicy("explore", "ls")).not.toThrow();
      expect(() => enforceBashPolicy("librarian", "git status")).not.toThrow();
    });

    it("should NOT throw for unrestricted agents with any commands", () => {
      expect(() => enforceBashPolicy("general", "rm -rf /")).not.toThrow();
      expect(() => enforceBashPolicy("build", "npm install")).not.toThrow();
      expect(() => enforceBashPolicy("unknown", "rm -rf /")).not.toThrow();
    });
  });
});
