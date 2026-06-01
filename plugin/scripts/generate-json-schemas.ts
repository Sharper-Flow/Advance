import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderAllJsonSchemas } from "../src/schema-registry";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PLUGIN_ROOT = resolve(SCRIPT_DIR, "..");
const SCHEMAS_DIR = join(PLUGIN_ROOT, "schemas");

function usage(): never {
  console.error("Usage: tsx scripts/generate-json-schemas.ts [--check]");
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && args[0] !== "--check")) {
  usage();
}

const checkOnly = args[0] === "--check";
const generated = renderAllJsonSchemas();

if (!existsSync(SCHEMAS_DIR)) {
  if (checkOnly) {
    console.error(`Schema directory missing: ${SCHEMAS_DIR}`);
    process.exit(1);
  }
  mkdirSync(SCHEMAS_DIR, { recursive: true });
}

const stale: string[] = [];

for (const [filename, rendered] of Object.entries(generated)) {
  const path = join(SCHEMAS_DIR, filename);
  const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  if (current !== rendered) {
    if (checkOnly) {
      stale.push(filename);
    } else {
      writeFileSync(path, rendered, "utf8");
    }
  }
}

if (stale.length > 0) {
  console.error(
    `Generated JSON schemas are stale: ${stale.join(", ")}. Run pnpm run schemas:generate.`,
  );
  process.exit(1);
}

if (!checkOnly) {
  console.log(`Generated ${Object.keys(generated).length} JSON schemas.`);
}
