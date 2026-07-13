import { ChangeListStatusFilterSchema } from "./src/types/changes";

for (const val of ["active", "pending", "draft", "in-flight", "archived", "closed"]) {
  const r = ChangeListStatusFilterSchema.safeParse(val);
  if (r.success) {
    console.log(`${val}: OK`);
  } else {
    console.log(`${val}: REJECTED — ${r.error.issues.map(i => i.message).join("; ")}`);
  }
}
