"use strict";

const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "playwright-report/**", "test-results/**", "coverage/**"],
  },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2019,
      sourceType: "script",
      globals: {
        ...globals.browser,
        // `main.js` runs as a plain <script> in the browser but also
        // conditionally exports its pure functions via `module.exports`
        // when required from Jest — hence the commonjs globals here.
        ...globals.commonjs,
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "off",
      "prefer-const": "off",
      curly: ["error", "all"],
      "no-console": "off",
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": "warn",
      eqeqeq: ["error", "smart"],
    },
  },
  {
    files: ["playwright.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
];
