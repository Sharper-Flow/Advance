/**
 * Capability Warrant Validator (addAcWarrantGuard)
 *
 * Pure functions for the declared-warrant mechanism. A capability-presuming
 * acceptance/success criterion may declare an inline warrant tag:
 *
 *   - AC2: Cross-project repair routes through target. [warrant: tool:adv_change_status_repair#target_path]
 *
 * Grammar:
 *   [warrant: <ref>(, <ref>)*]
 *   ref := tool:<name>            (tool exists)
 *        | tool:<name>#<arg>      (tool arg exists)
 *        | spec:<rq-id>           (spec requirement exists)
 *
 * Authority is STRUCTURAL: a declared warrant is verified against a live
 * tool-surface + spec-id lookup injected by the tool layer. This module is
 * PURE — it imports no tool-registry, no tools/*, no fs (DDC1/DDC2). The
 * surface data is always injected by the caller.
 *
 * Honest boundary: this verifies DECLARED warrants only. It cannot infer an
 * undeclared capability-presuming criterion from free prose — that would be the
 * heuristic-authority anti-pattern this guard exists to remove (C5/DONT4). The
 * discovery process layer forces the declaration; this layer makes it truthful.
 */

export interface WarrantLookup {
  /** Tool name → set of declared argument keys. */
  toolSurface: Map<string, Set<string>>;
  /** Known spec requirement ids (e.g. "rq-foo01"). */
  specIds: Set<string>;
}

export interface ParsedWarrant {
  /** Criterion text with the [warrant: ...] tag removed and whitespace-normalized. */
  text: string;
  /** Declared warrant refs (empty when no tag present). */
  refs: string[];
}

export interface WarrantResolution {
  ok: boolean;
  unresolved: string[];
}

/** Thrown on a structurally malformed [warrant: ...] tag. */
export class WarrantMalformedError extends Error {
  constructor(message: string) {
    super(`WARRANT_MALFORMED: ${message}`);
    this.name = "WarrantMalformedError";
  }
}

const WARRANT_TAG = /\[warrant:\s*([^\]]*)\]/i;
const TOOL_REF = /^tool:[A-Za-z0-9_]+(?:#[A-Za-z0-9_]+)?$/;
const SPEC_REF = /^spec:[A-Za-z0-9][A-Za-z0-9_-]*$/;

function isValidRefShape(ref: string): boolean {
  return TOOL_REF.test(ref) || SPEC_REF.test(ref);
}

/**
 * Extract and strip a single [warrant: ...] tag from a criterion line.
 * Returns the cleaned text and the parsed refs. A line without a tag yields
 * an empty refs array. A present-but-malformed tag throws.
 */
export function parseWarrantTag(raw: string): ParsedWarrant {
  const match = raw.match(WARRANT_TAG);
  if (!match) {
    return { text: raw.trim(), refs: [] };
  }
  const body = (match[1] ?? "").trim();
  if (!body) {
    throw new WarrantMalformedError("empty [warrant: ...] tag");
  }
  const refs = body
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  if (refs.length === 0) {
    throw new WarrantMalformedError("no refs in [warrant: ...] tag");
  }
  for (const ref of refs) {
    if (!isValidRefShape(ref)) {
      throw new WarrantMalformedError(`invalid warrant ref "${ref}"`);
    }
  }
  const text = raw.replace(WARRANT_TAG, "").replace(/\s+/g, " ").trim();
  return { text, refs };
}

function resolveRef(ref: string, lookup: WarrantLookup): boolean {
  if (ref.startsWith("tool:")) {
    const body = ref.slice("tool:".length);
    const hashIndex = body.indexOf("#");
    const name = hashIndex === -1 ? body : body.slice(0, hashIndex);
    const arg = hashIndex === -1 ? undefined : body.slice(hashIndex + 1);
    const args = lookup.toolSurface.get(name);
    if (!args) return false;
    if (arg) return args.has(arg);
    return true;
  }
  if (ref.startsWith("spec:")) {
    return lookup.specIds.has(ref.slice("spec:".length));
  }
  return false;
}

/**
 * Resolve declared warrant refs against the injected live lookup.
 * Returns ok:false with the list of refs that did not resolve.
 */
export function resolveWarrants(
  refs: string[],
  lookup: WarrantLookup,
): WarrantResolution {
  const unresolved = refs.filter((ref) => !resolveRef(ref, lookup));
  return { ok: unresolved.length === 0, unresolved };
}
