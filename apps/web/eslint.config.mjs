import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Minimal ESLint flat config for @doable/web.
 *
 * ESLint 9 dropped the legacy .eslintrc format and there was no flat
 * config in this repo, so `pnpm lint` was crashing in CI. This config
 * gives ESLint enough to parse the codebase without enforcing a heavy
 * ruleset — type-check (tsc) is the load-bearing safety net.
 *
 * `react-hooks` is registered so that existing
 * `// eslint-disable-next-line react-hooks/exhaustive-deps` comments
 * resolve to a real rule; rules-of-hooks is on, exhaustive-deps is off
 * (warns-only) so it doesn't gate CI on an existing codebase.
 */
export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".turbo/**",
      "out/**",
      "dist/**",
      "build/**",
      "public/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      // tsc covers undefined / unused with stricter checks than ESLint
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
];
