import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "react-hooks/exhaustive-deps": "off",
    "@next/next/no-img-element": "off",
  },
  ignores: [
    "examples/**",
    "src/api-backup/**",
    "node_modules/**",
    ".next/**",
    "out/**",
    "mini-services/**",
    "skills/**",
    "agent-ctx/**",
    "research/**",
    "lib/**",
    "download/**",
    "upload/**",
    "tool-results/**",
    "tests/**",
  ],
}];

export default eslintConfig;
