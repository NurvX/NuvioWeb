import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import eslintConfigPrettier from "eslint-config-prettier";

const runtimeGlobals = {
  ...globals.browser,
  ...globals.node
};

export default [
  {
    ignores: [
      "assets/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "res/**",
      "services/**/runtime/**"
    ]
  },
  {
    files: ["js/**/*.{js,jsx,mjs,cjs}", "scripts/**/*.{js,mjs,cjs}"],
    plugins: { react: reactPlugin },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: runtimeGlobals,
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    settings: {
      react: { pragma: "h", version: "18" }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_"
        }
      ],
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off"
    }
  },
  eslintConfigPrettier
];
