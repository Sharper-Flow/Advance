/** adv CLI — slop scan detector registry */

export type SlopLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "polyglot";

export interface DetectorDefinition {
  id: string;
  label: string;
  languages: SlopLanguage[];
  important: boolean;
}

export function createDetectorRegistry(): DetectorDefinition[] {
  return [
    {
      id: "eslint",
      label: "ESLint",
      languages: ["typescript", "javascript"],
      important: true,
    },
    {
      id: "knip",
      label: "Knip",
      languages: ["typescript", "javascript"],
      important: true,
    },
    {
      id: "radon",
      label: "Radon",
      languages: ["python"],
      important: true,
    },
    {
      id: "vulture",
      label: "Vulture",
      languages: ["python"],
      important: true,
    },
    {
      id: "gocyclo",
      label: "gocyclo",
      languages: ["go"],
      important: true,
    },
    {
      id: "go-deadcode",
      label: "Go deadcode",
      languages: ["go"],
      important: true,
    },
    {
      id: "ast-grep",
      label: "ast-grep",
      languages: ["typescript", "javascript", "python", "go", "polyglot"],
      important: true,
    },
    {
      id: "jscpd",
      label: "jscpd",
      languages: ["typescript", "javascript", "python", "go", "polyglot"],
      important: true,
    },
    {
      id: "external-ci-semgrep",
      label: "Semgrep PR gate",
      languages: ["typescript", "javascript"],
      important: false,
    },
  ];
}

export function selectApplicableDetectors(
  registry: DetectorDefinition[],
  languages: string[],
): DetectorDefinition[] {
  const detected = new Set(languages);
  const hasSource = languages.length > 0;

  return registry.filter((detector) => {
    if (detector.languages.includes("polyglot") && hasSource) return true;
    return detector.languages.some((language) => detected.has(language));
  });
}
