/**
 * Runtime disambiguation between the legacy positional artifact-content API
 * and the new options-object API for `Store.changes.create()` and
 * `Store.changes.updateArtifacts()`.
 *
 * This helper exists ONLY during the positional → options-object migration
 * window. T20 (KD-10 phase 17 in removePositionalArtifactApi) deletes the
 * legacy positional code paths and this normalizer along with them.
 *
 * Detection rule:
 *   - If the first relevant arg is a non-null object that is NOT a string,
 *     it's the options-object form.
 *   - Otherwise the call is positional (covers: string content, undefined,
 *     no args at all).
 */

import type { ArtifactPayload } from "../types";
import type { ChangeCreateInitialMetadata } from "./store-types";

interface NormalizedCreateArgs {
  capability?: string;
  artifacts: ArtifactPayload;
  initialMetadata?: ChangeCreateInitialMetadata;
}

interface CreateOptionsBag {
  capability?: string;
  artifacts?: ArtifactPayload;
  initialMetadata?: ChangeCreateInitialMetadata;
}

function isOptionsBag(value: unknown): value is CreateOptionsBag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize the variadic argument list of `Store.changes.create()` to a
 * single options-object shape. Accepts either:
 *
 *   (summary, options?)                                    — new shape
 *   (summary, capability?, p?, ps?, ag?, design?, es?,
 *     legacyOptions?)                                       — legacy shape
 */
export function normalizeCreateArgs(args: unknown[]): NormalizedCreateArgs {
  // args[0] is summary; args[1] is either ChangeCreateOptionsBag or capability
  const second = args[1];

  if (isOptionsBag(second)) {
    // Options-object call: (summary, { capability?, artifacts?, initialMetadata? })
    return {
      capability: second.capability,
      artifacts: second.artifacts ?? {},
      initialMetadata: second.initialMetadata,
    };
  }

  // Legacy positional call.
  //
  // Empty-string content args are a legacy idiom meaning "this slot is unused"
  // (used by test fixtures and some pre-migration call sites). They are
  // normalized to `undefined` here so they do not fire a content signal in
  // the new code path. The options-object shape preserves explicit empty
  // strings because the new API does not have this idiom.
  const [
    ,
    capability,
    proposal,
    problemStatement,
    agreement,
    design,
    executiveSummary,
    legacyOptions,
  ] = args as [
    string,
    string | undefined,
    string | undefined,
    string | undefined,
    string | undefined,
    string | undefined,
    string | undefined,
    { initialMetadata?: ChangeCreateInitialMetadata } | undefined,
  ];

  const artifacts: ArtifactPayload = {};
  if (proposal !== undefined && proposal !== "") artifacts.proposal = proposal;
  if (problemStatement !== undefined && problemStatement !== "")
    artifacts.problemStatement = problemStatement;
  if (agreement !== undefined && agreement !== "")
    artifacts.agreement = agreement;
  if (design !== undefined && design !== "") artifacts.design = design;
  if (executiveSummary !== undefined && executiveSummary !== "")
    artifacts.executiveSummary = executiveSummary;

  return {
    capability: capability as string | undefined,
    artifacts,
    initialMetadata: legacyOptions?.initialMetadata,
  };
}

/**
 * Normalize the variadic argument list of `Store.changes.updateArtifacts()`
 * to a single `ArtifactPayload`. Accepts either:
 *
 *   (changeId, artifacts)                                   — new shape
 *   (changeId, p?, ps?, ag?, design?, es?)                  — legacy shape
 */
export function normalizeUpdateArtifactsArgs(args: unknown[]): ArtifactPayload {
  const second = args[1];

  if (isOptionsBag(second)) {
    return { ...(second as ArtifactPayload) };
  }

  // Empty-string legacy idiom — treat as unused slot (see normalizeCreateArgs).
  const [
    ,
    proposal,
    problemStatement,
    agreement,
    design,
    executiveSummary,
  ] = args as [
    string,
    string | undefined,
    string | undefined,
    string | undefined,
    string | undefined,
    string | undefined,
  ];

  const out: ArtifactPayload = {};
  if (proposal !== undefined && proposal !== "") out.proposal = proposal;
  if (problemStatement !== undefined && problemStatement !== "")
    out.problemStatement = problemStatement;
  if (agreement !== undefined && agreement !== "") out.agreement = agreement;
  if (design !== undefined && design !== "") out.design = design;
  if (executiveSummary !== undefined && executiveSummary !== "")
    out.executiveSummary = executiveSummary;
  return out;
}
