import { createHash } from "crypto";
import {
  ChangeContractSchema,
  type ChangeContract,
  type ContractEvidencePolicy,
  type ContractItemKind,
  type ContractItemVariant,
  type ContractRigor,
} from "../types";
// Pure warrant module — keeps contract-mint cycle-free (DDC2): no tool-registry
// or tools/* import. The live { toolSurface, specIds } lookup is INJECTED by
// the tool layer (adv_contract_mint) via runtime dynamic import.
import {
  parseWarrantTag,
  resolveWarrants,
  type WarrantLookup,
} from "./warrant";

interface BuildContractFromAgreementInput {
  agreement: string;
  approvedAt: string;
  rigor?: ContractRigor;
  /**
   * Live capability-warrant lookup. When provided, every declared warrant ref
   * is verified and an unresolved ref fails the mint with
   * CONTRACT_UNRESOLVED_WARRANT. When omitted (pure unit tests not exercising
   * warrants), declared refs are still parsed/recorded but not verified — the
   * production mint path (adv_contract_mint) injects this whenever the approved
   * agreement declares a warrant tag.
   */
  warrantLookup?: WarrantLookup;
}

interface SectionContractMapping {
  kind: ContractItemKind;
  fallbackPrefix: string;
  evidencePolicy: ContractEvidencePolicy;
  verificationRequired: boolean;
}

const SECTION_MAPPINGS: Array<{
  heading: RegExp;
  mapping: SectionContractMapping;
}> = [
  {
    heading: /^(success criteria|success criterion)$/i,
    mapping: {
      kind: "success_criterion",
      fallbackPrefix: "SC",
      evidencePolicy: "review",
      verificationRequired: true,
    },
  },
  {
    heading: /^(acceptance criteria|acceptance criterion)$/i,
    mapping: {
      kind: "acceptance_criterion",
      fallbackPrefix: "AC",
      evidencePolicy: "test",
      verificationRequired: true,
    },
  },
  {
    heading: /^(constraints|constraint)$/i,
    mapping: {
      kind: "constraint",
      fallbackPrefix: "C",
      evidencePolicy: "static_check",
      verificationRequired: true,
    },
  },
  {
    heading: /^(avoidances|avoidance|do not|do nots)$/i,
    mapping: {
      kind: "avoidance",
      fallbackPrefix: "DONT",
      evidencePolicy: "review",
      verificationRequired: true,
    },
  },
  {
    heading: /^(out of scope|out-of-scope|non-goals|non goals)$/i,
    mapping: {
      kind: "out_of_scope",
      fallbackPrefix: "OOS",
      evidencePolicy: "not_applicable",
      verificationRequired: false,
    },
  },
];

const LABEL_MAPPINGS: Array<{
  label: RegExp;
  mapping: SectionContractMapping;
}> = SECTION_MAPPINGS.map(({ mapping }) => ({
  label: new RegExp(`^${mapping.fallbackPrefix}\\d+$`, "i"),
  mapping,
}));

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeApprovedAt(approvedAt: string): string {
  const trimmed = approvedAt.trim();
  if (!trimmed) {
    throw new Error("approvedAt is required to mint a ChangeContract");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(trimmed) ||
    Number.isNaN(Date.parse(trimmed))
  ) {
    throw new Error("approvedAt must be a valid ISO timestamp");
  }
  return trimmed;
}

function normalizeHeading(raw: string): string | undefined {
  const match = raw.match(/^#{2,6}\s+(.+?)\s*$/);
  return match?.[1]?.replace(/[:#]+$/g, "").trim();
}

function mappingForHeading(raw: string): SectionContractMapping | undefined {
  const heading = normalizeHeading(raw);
  if (!heading) return undefined;
  return SECTION_MAPPINGS.find(({ heading: pattern }) => pattern.test(heading))
    ?.mapping;
}

function mappingForLabel(label: string): SectionContractMapping | undefined {
  return LABEL_MAPPINGS.find(({ label: pattern }) => pattern.test(label))
    ?.mapping;
}

function parseObligationLine(
  raw: string,
): { label?: string; text: string } | undefined {
  const bullet = raw.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+?)\s*$/);
  if (!bullet) return undefined;
  const body = bullet[1].trim();
  if (!body) return undefined;

  const labeled = body.match(/^([A-Za-z]+\d+)\s*[:.)-]\s+(.+?)\s*$/);
  if (labeled) {
    return { label: labeled[1].toUpperCase(), text: labeled[2].trim() };
  }
  return { text: body };
}

function nextFallbackId(
  counts: Map<string, number>,
  mapping: SectionContractMapping,
): string {
  const next = (counts.get(mapping.fallbackPrefix) ?? 0) + 1;
  counts.set(mapping.fallbackPrefix, next);
  return `${mapping.fallbackPrefix}${next}`;
}

const EVIDENCE_PREFIX = /^Evidence:\s*/i;
const SPECLAW_PREFIX = /^Spec-law:\s*/i;

interface VariantParseResult {
  variant?: ContractItemVariant;
  error?: string;
}

function normalizeClause(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,.;]+$/, "");
}

function tryParseBehavioralVariant(text: string): VariantParseResult {
  const lower = text.toLowerCase();
  const givenIdx = lower.indexOf("given ");
  if (givenIdx !== 0) return {};
  const whenIdx = lower.indexOf(" when ");
  const thenIdx = lower.indexOf(" then ");

  // Incomplete behavioral intent: starts with Given and uses one keyword but
  // not the other. Fully flat text (Given with no When/Then) is left untyped.
  if (whenIdx === -1 && thenIdx === -1) return {};
  if (whenIdx === -1 || thenIdx === -1 || thenIdx < whenIdx) {
    return {
      error:
        "CONTRACT_MALFORMED_VARIANT: behavioral scenario is missing a When or Then clause",
    };
  }

  const context = normalizeClause(text.slice("Given ".length, whenIdx));
  const trigger = normalizeClause(
    text.slice(whenIdx + " when ".length, thenIdx),
  );
  const outcomeParts = text
    .slice(thenIdx + " then ".length)
    .split(/\s*,\s+and\s+/i)
    .map(normalizeClause);
  const [outcome, ...boundaries] = outcomeParts;
  if (!context || !trigger || !outcome) {
    return {
      error:
        "CONTRACT_MALFORMED_VARIANT: behavioral scenario is missing a When or Then clause",
    };
  }
  return {
    variant: {
      kind: "behavioral",
      context,
      trigger,
      outcome,
      ...(boundaries.length > 0 ? { boundaries } : {}),
    },
  };
}

function tryParseEvidenceVariant(text: string): VariantParseResult {
  if (!EVIDENCE_PREFIX.test(text)) return {};
  const body = text.replace(EVIDENCE_PREFIX, "").trim();
  if (!body) {
    return {
      error:
        "CONTRACT_MALFORMED_VARIANT: evidence variant requires a subject and method/source",
    };
  }
  for (const separator of [" via ", " by ", " from "]) {
    const idx = body.toLowerCase().indexOf(separator);
    if (idx !== -1) {
      const subject = normalizeClause(body.slice(0, idx));
      const rest = normalizeClause(body.slice(idx + separator.length));
      return {
        variant: {
          kind: "evidence",
          subject,
          ...(separator === " from " ? { source: rest } : { method: rest }),
        },
      };
    }
  }
  return {
    error:
      "CONTRACT_MALFORMED_VARIANT: evidence variant requires a method (via/by) or source (from)",
  };
}

function tryParseSpecLawVariant(text: string): VariantParseResult {
  if (!SPECLAW_PREFIX.test(text)) return {};
  const body = text.replace(SPECLAW_PREFIX, "").trim();
  if (!body) {
    return {
      error:
        "CONTRACT_MALFORMED_VARIANT: spec-law variant requires a spec and requirement",
    };
  }
  const separators = [" requires ", " reconciles ", " mandates "];
  for (const separator of separators) {
    const idx = body.toLowerCase().indexOf(separator);
    if (idx !== -1) {
      const spec = normalizeClause(body.slice(0, idx));
      const requirement = normalizeClause(body.slice(idx + separator.length));
      if (!spec || !requirement) {
        return {
          error:
            "CONTRACT_MALFORMED_VARIANT: spec-law variant requires a spec and requirement",
        };
      }
      return {
        variant: {
          kind: "spec_law",
          spec,
          requirement,
        },
      };
    }
  }
  return {
    error:
      "CONTRACT_MALFORMED_VARIANT: spec-law variant requires a requirement (requires/reconciles/mandates)",
  };
}

function tryParseConstraintVariant(
  text: string,
  kind: ContractItemKind,
): VariantParseResult {
  if (kind !== "constraint") return {};
  const lower = text.toLowerCase();
  if (
    !lower.startsWith("must ") &&
    !lower.startsWith("must not ") &&
    !lower.startsWith("cannot ")
  ) {
    return {};
  }
  let obligation = text;
  let scope: string | undefined;
  for (const separator of [" for ", " within ", " across "]) {
    const idx = lower.indexOf(separator);
    if (idx !== -1) {
      scope = normalizeClause(text.slice(idx + separator.length));
      obligation = text.slice(0, idx);
      break;
    }
  }
  return {
    variant: {
      kind: "constraint",
      obligation: normalizeClause(obligation),
      ...(scope ? { scope } : {}),
    },
  };
}

function tryParseVariant(
  text: string,
  kind: ContractItemKind,
): VariantParseResult {
  // Explicit prefix variants are checked first so a leading marker cannot be
  // misread as a behavioral clause.
  const evidence = tryParseEvidenceVariant(text);
  if (evidence.variant || evidence.error) return evidence;

  const specLaw = tryParseSpecLawVariant(text);
  if (specLaw.variant || specLaw.error) return specLaw;

  const behavioral = tryParseBehavioralVariant(text);
  if (behavioral.variant || behavioral.error) return behavioral;

  return tryParseConstraintVariant(text, kind);
}

export function buildContractFromAgreement(
  input: BuildContractFromAgreementInput,
): ChangeContract {
  const approvedAt = normalizeApprovedAt(input.approvedAt);

  const contentHash = hashContent(input.agreement);
  const fallbackCounts = new Map<string, number>();
  const seenIds = new Set<string>();
  const items: ChangeContract["items"] = [];
  let currentMapping: SectionContractMapping | undefined;

  for (const line of input.agreement.split(/\r?\n/)) {
    const headingMapping = mappingForHeading(line);
    if (headingMapping) {
      currentMapping = headingMapping;
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      currentMapping = undefined;
      continue;
    }

    const parsed = parseObligationLine(line);
    if (!parsed) continue;
    const labelMapping = parsed.label
      ? mappingForLabel(parsed.label)
      : undefined;
    const mapping = labelMapping ?? currentMapping;
    if (!mapping) continue;

    // addAcWarrantGuard: extract + strip any [warrant: ...] tag so the
    // persisted text is clean and declared refs can be verified.
    const { text: warrantStrippedText, refs: warrantRefs } = parseWarrantTag(
      parsed.text,
    );
    parsed.text = warrantStrippedText;
    const id =
      labelMapping && parsed.label
        ? parsed.label
        : nextFallbackId(fallbackCounts, mapping);
    if (seenIds.has(id)) {
      throw new Error(`CONTRACT_DUPLICATE_ID: duplicate contract item ${id}`);
    }
    seenIds.add(id);
    if (labelMapping && parsed.label) {
      const numeric = Number.parseInt(parsed.label.replace(/^[A-Z]+/, ""), 10);
      if (Number.isFinite(numeric)) {
        fallbackCounts.set(
          mapping.fallbackPrefix,
          Math.max(fallbackCounts.get(mapping.fallbackPrefix) ?? 0, numeric),
        );
      }
    }

    if (warrantRefs.length > 0 && input.warrantLookup) {
      const resolution = resolveWarrants(warrantRefs, input.warrantLookup);
      if (!resolution.ok) {
        throw new Error(
          `CONTRACT_UNRESOLVED_WARRANT: item ${id} declares warrant(s) that do not resolve against the live tool surface / specs: ${resolution.unresolved.join(", ")}`,
        );
      }
    }

    const variantResult = tryParseVariant(parsed.text, mapping.kind);
    if (variantResult.error) {
      throw new Error(variantResult.error);
    }

    items.push({
      id,
      kind: mapping.kind,
      text: parsed.text,
      sourceArtifact: "agreement",
      sourceHash: contentHash,
      verificationRequired: mapping.verificationRequired,
      evidencePolicy: mapping.evidencePolicy,
      status: "approved",
      ...(mapping.verificationRequired
        ? {}
        : { notRequiredReason: "Out-of-scope contract item" }),
      ...(warrantRefs.length > 0 ? { warrants: warrantRefs } : {}),
      ...(variantResult.variant ? { variant: variantResult.variant } : {}),
    });
  }

  if (items.length === 0) {
    throw new Error(
      "CONTRACT_ITEMS_EMPTY: agreement contains no SC/AC/C/DONT/OOS contract items",
    );
  }

  return ChangeContractSchema.parse({
    version: 1,
    rigor: input.rigor ?? "standard",
    source: {
      artifact: "agreement",
      contentHash,
      approvedAt,
    },
    items,
    amendments: [],
  });
}
