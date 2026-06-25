import { createHash } from "crypto";
import {
  ChangeContractSchema,
  type ChangeContract,
  type ContractEvidencePolicy,
  type ContractItemKind,
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
   * single production mint path (adv_contract_mint) always injects this.
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
