/** adv CLI — Knip dead-code detector adapter */

import type { SlopScanFinding } from "../schema";
import { deletionCandidate } from "./_findings";

interface KnipIssueItem {
  name?: string;
  line?: number;
}

export const KNIP_ISSUE_KINDS = [
  "files",
  "exports",
  "types",
  "duplicates",
  "binaries",
  "dependencies",
  "devDependencies",
  "optionalPeerDependencies",
  "unlisted",
  "unresolved",
  "enumMembers",
  "namespaceMembers",
  "catalog",
  "nsExports",
  "nsTypes",
  "cycles",
] as const;
export type KnipIssueKind = (typeof KNIP_ISSUE_KINDS)[number];

type KnipIssue = {
  file?: string;
} & Partial<Record<KnipIssueKind, KnipIssueItem[]>>;

interface KnipReport {
  issues?: KnipIssue[];
}

type KnipFindingId = "MAINT-003" | "DEP-001" | "DEP-003" | "DEP-004";

type KindPolicy =
  | {
      mode: "consume";
      toFinding: (item: KnipIssueItem, issue: KnipIssue) => SlopScanFinding;
    }
  | { mode: "exclude"; reason: string };

function consumeKind(params: {
  id: KnipFindingId;
  name: string;
  label: string;
  fileFallback: string;
  severity?: "LOW" | "MEDIUM";
  useItemAsFile?: boolean;
  includeLine?: boolean;
}): KindPolicy {
  return {
    mode: "consume",
    toFinding: (item, issue) => {
      const symbol = item.name ?? `unknown ${params.label}`;
      const file = params.useItemAsFile
        ? item.name ?? issue.file ?? params.fileFallback
        : issue.file ?? params.fileFallback;
      const finding = deletionCandidate({
        name: params.name,
        file,
        line: params.includeLine ? item.line ?? null : null,
        description: `Knip reported ${params.label} ${symbol}.`,
      });

      return {
        ...finding,
        id: params.id,
        severity: params.severity ?? "LOW",
      };
    },
  };
}

const KIND_POLICY: Record<KnipIssueKind, KindPolicy> = {
  files: consumeKind({
    id: "MAINT-003",
    name: "unused_file",
    label: "unused file",
    fileFallback: "unknown file",
    useItemAsFile: true,
  }),
  exports: consumeKind({
    id: "MAINT-003",
    name: "unused_export",
    label: "unused export",
    fileFallback: "package export graph",
    includeLine: true,
  }),
  types: consumeKind({
    id: "MAINT-003",
    name: "unused_type",
    label: "unused type",
    fileFallback: "package type graph",
    includeLine: true,
  }),
  duplicates: consumeKind({
    id: "MAINT-003",
    name: "duplicate_export",
    label: "duplicate export",
    fileFallback: "package export graph",
    includeLine: true,
  }),
  binaries: consumeKind({
    id: "DEP-001",
    name: "unused_binary",
    label: "unused binary",
    fileFallback: "package.json",
  }),
  dependencies: consumeKind({
    id: "DEP-001",
    name: "unused_dependency",
    label: "unused dependency",
    fileFallback: "package.json",
  }),
  devDependencies: consumeKind({
    id: "DEP-001",
    name: "unused_dependency",
    label: "unused devDependency",
    fileFallback: "package.json",
  }),
  optionalPeerDependencies: consumeKind({
    id: "DEP-001",
    name: "unused_dependency",
    label: "unused optional peer dependency",
    fileFallback: "package.json",
  }),
  unlisted: consumeKind({
    id: "DEP-003",
    name: "unlisted_dependency",
    label: "unlisted dependency",
    fileFallback: "package.json",
    severity: "MEDIUM",
  }),
  unresolved: consumeKind({
    id: "DEP-004",
    name: "unresolved_import",
    label: "unresolved import",
    fileFallback: "import graph",
    severity: "MEDIUM",
    includeLine: true,
  }),
  enumMembers: consumeKind({
    id: "MAINT-003",
    name: "unused_enum_member",
    label: "unused enum member",
    fileFallback: "package export graph",
    includeLine: true,
  }),
  namespaceMembers: consumeKind({
    id: "MAINT-003",
    name: "unused_namespace_member",
    label: "unused namespace member",
    fileFallback: "package export graph",
    includeLine: true,
  }),
  catalog: {
    mode: "exclude",
    reason: "pnpm catalog-protocol metadata, not a dead-code signal",
  },
  nsExports: {
    mode: "exclude",
    reason: "opt-in kind; not emitted by the default reporter",
  },
  nsTypes: {
    mode: "exclude",
    reason: "opt-in kind; not emitted by the default reporter",
  },
  cycles: {
    mode: "exclude",
    reason: "opt-in kind; import cycles owned by madge/dependency-cruiser, not slop scan",
  },
};

export function normalizeKnipJson(raw: string, _repoRoot: string): SlopScanFinding[] {
  const parsed = JSON.parse(raw) as KnipReport;
  const findings: SlopScanFinding[] = [];

  for (const issue of parsed.issues ?? []) {
    for (const kind of KNIP_ISSUE_KINDS) {
      const policy = KIND_POLICY[kind];
      if (policy.mode === "consume") {
        for (const item of issue[kind] ?? []) {
          findings.push(policy.toFinding(item, issue));
        }
      }
    }
  }

  return findings;
}

export function buildKnipCommand(): string[] {
  return ["pnpm", "exec", "knip", "--reporter", "json"];
}
