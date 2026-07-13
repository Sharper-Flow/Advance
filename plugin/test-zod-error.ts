import { z } from "zod";

// Approach 1: narrowed union
const Narrowed = z.union([
  z.enum(["draft", "archived", "closed"]),
  z.literal("in-flight"),
]);

const r1 = Narrowed.safeParse("active");
console.log("narrowed:", JSON.stringify(r1.success ? "ok" : r1.error.issues, null, 2));

// Approach 2: union with superRefine
const WithRefine = z
  .union([z.enum(["draft", "pending", "active", "archived", "closed"]), z.literal("in-flight")])
  .superRefine((value, ctx) => {
    if (value === "active" || value === "pending") {
      ctx.addIssue({
        code: "custom",
        message: `"${value}" is never stored on changes. Use "in-flight" (or no status filter) for open changes; "archived"/"closed" for terminal changes.`,
      });
    }
  });

const r2 = WithRefine.safeParse("active");
console.log("refine:", JSON.stringify(r2.success ? "ok" : r2.error.issues, null, 2));

// Approach 3: narrowed union with .error()
const NarrowedWithError = z
  .union([
    z.enum(["draft", "archived", "closed"]),
    z.literal("in-flight"),
  ])
  .error(() => 'Invalid status filter. "active" and "pending" are never stored on changes; use "in-flight" (or no status filter) for open changes, "archived"/"closed" for terminal.');

const r3 = NarrowedWithError.safeParse("active");
console.log("narrowed+error:", JSON.stringify(r3.success ? "ok" : r3.error.issues, null, 2));
