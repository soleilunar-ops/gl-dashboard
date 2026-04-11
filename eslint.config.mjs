import tsParser from "@typescript-eslint/parser";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      eqeqeq: "warn",
      "no-console": "warn",
      "no-unused-vars": "warn",
    },
  },
  {
    ignores: [".next/", "node_modules/", "supabase/types.ts", "public/"],
  },
];