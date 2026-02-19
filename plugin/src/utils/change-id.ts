/**
 * Change ID Generation
 *
 * Generates concise, specific camelCase change IDs from summaries.
 * Strips stop words, filler, and normalizes action verbs to produce
 * clean IDs like "addUserAuth" instead of "addComprehensiveUserAuthentica".
 */

/**
 * Grammatical words that add no meaning to a change ID.
 * Conservative list — only truly empty words, not domain terms.
 */
const STOP_WORDS = new Set([
  // Articles
  "a",
  "an",
  "the",
  // Prepositions
  "with",
  "for",
  "to",
  "in",
  "of",
  "from",
  "by",
  "on",
  "at",
  "into",
  "through",
  "during",
  "before",
  "after",
  "between",
  "about",
  // Conjunctions
  "and",
  "or",
  "but",
  "so",
  "yet",
  // Pronouns / determiners
  "that",
  "this",
  "which",
  "some",
  "all",
  "also",
  "more",
  "very",
  "just",
  // Adjective filler (never adds specificity)
  "comprehensive",
  "various",
  "properly",
  "correctly",
  "currently",
  "necessary",
  "appropriate",
  "relevant",
  "certain",
  "overall",
]);

/**
 * Verbose verbs that should be normalized to simpler equivalents.
 * Only aliases where the meaning is truly equivalent.
 */
const VERB_ALIASES: Record<string, string> = {
  implement: "add",
  introduce: "add",
  incorporate: "add",
  establish: "add",
};

/** Action verbs that should always be preserved when leading */
const ACTION_VERBS = new Set([
  "add",
  "fix",
  "update",
  "remove",
  "delete",
  "refactor",
  "move",
  "rename",
  "replace",
  "migrate",
  "upgrade",
  "downgrade",
  "revert",
  "extract",
  "inline",
  "split",
  "merge",
  "simplify",
  "optimize",
  "improve",
  "enable",
  "disable",
  "drop",
  "deprecate",
  "swap",
  "create",
  "integrate",
]);

const MAX_ID_LENGTH = 30;

/**
 * Generate a concise camelCase change ID from a summary string.
 *
 * Strategy:
 * 1. Normalize verbose action verbs (implement → add)
 * 2. Strip grammatical stop words and adjective filler
 * 3. Convert to camelCase
 * 4. Truncate at word boundary within 30 chars
 */
export function generateChangeId(summary: string): string {
  // Split into words, keeping only alphanumeric content
  const words = summary.split(/[^a-zA-Z0-9]+/).filter(Boolean);

  if (words.length === 0) {
    return "change";
  }

  // Normalize the leading verb
  const firstWordLower = words[0].toLowerCase();
  if (VERB_ALIASES[firstWordLower]) {
    words[0] = VERB_ALIASES[firstWordLower];
  }

  // Filter stop words, but always keep the first word if it's an action verb
  const leadingLower = words[0].toLowerCase();
  const keepFirst =
    ACTION_VERBS.has(leadingLower) ||
    VERB_ALIASES[firstWordLower] !== undefined;

  const filtered = words.filter((w, i) => {
    if (i === 0 && keepFirst) return true;
    return !STOP_WORDS.has(w.toLowerCase());
  });

  // If filtering removed everything, fall back to original words
  const effective = filtered.length > 0 ? filtered : words;

  // Build camelCase, truncating at word boundary
  let result = "";
  for (let i = 0; i < effective.length; i++) {
    const word = effective[i];
    const camelWord =
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

    if (result.length + camelWord.length > MAX_ID_LENGTH) {
      break;
    }
    result += camelWord;
  }

  // If even the first word was too long, hard-truncate it
  if (result.length === 0) {
    result = effective[0].toLowerCase().slice(0, MAX_ID_LENGTH);
  }

  return result;
}
