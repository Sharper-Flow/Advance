import { resolve } from "path";

/** Return true when `candidate` equals `root` or is contained under it. */
export function isSameOrChildPath(candidate: string, root: string): boolean {
  const normalizedCandidate = resolve(candidate).replace(/\/+$/, "");
  const normalizedRoot = resolve(root).replace(/\/+$/, "");
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}
