import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  // Source files - with project service
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-globals": [
        "error",
        {
          name: "Bun",
          message:
            "Bun APIs are not available at runtime on Node hosts. Use /// <reference types=\"bun-types\" /> only in Bun-specific modules.",
        },
      ],
    },
  },
  // Bun-specific source files — allowed to reference Bun globals
  {
    files: [
      "src/temporal/runtime-manager.ts",
      "src/tools/worktree/terminal.ts",
      "src/tools/worktree/index.ts",
    ],
    rules: {
      "no-restricted-globals": "off",
    },
  },
  // Test files - without project service
  {
    files: ["src/**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "*.config.js"],
  }
);
