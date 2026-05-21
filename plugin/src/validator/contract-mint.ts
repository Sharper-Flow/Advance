import { createHash } from "crypto";
import {
  ChangeContractSchema,
  type ChangeContract,
  type ContractEvidencePolicy,
  type ContractItemKind,
  type ContractRigor,
} from "../types";

interface BuildContractFromAgreementInput {
  agreement: string;
  approvedAt: string;
  rigor?: ContractRigor;
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
  if (!input.approvedAt.trim()) {
    throw new Error("approvedAt is required to mint a ChangeContract");
  }

  const contentHash = hashContent(input.agreement);
  const fallbackCounts = new Map<string, number>();
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
    const mapping = parsed.label
      ? (mappingForLabel(parsed.label) ?? currentMapping)
      : currentMapping;
    if (!mapping) continue;
    const id = parsed.label ?? nextFallbackId(fallbackCounts, mapping);
    if (parsed.label) {
      const numeric = Number.parseInt(parsed.label.replace(/^[A-Z]+/, ""), 10);
      if (Number.isFinite(numeric)) {
        fallbackCounts.set(
          mapping.fallbackPrefix,
          Math.max(fallbackCounts.get(mapping.fallbackPrefix) ?? 0, numeric),
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
      approvedAt: input.approvedAt,
    },
    items,
    amendments: [],
  });
}
