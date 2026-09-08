import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
	{
		ignores: ["**/dist/**", "**/build/**", "**/node_modules/**", ".data/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	eslintConfigPrettier,
	{
		rules: {
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
	{
		// `apps/web/public` is served verbatim rather than bundled, so nothing in
		// it goes through the TypeScript project and none of the browser globals
		// are in scope by default. These files intentionally run outside the bundle:
		// the theme boot script runs before it, and the service worker owns its cache.
		files: ["apps/web/public/*.js"],
		languageOptions: {
			globals: {
				window: "readonly",
				document: "readonly",
				localStorage: "readonly",
				self: "readonly",
				URL: "readonly",
				Response: "readonly",
			},
		},
		rules: {
			// A `catch` that exists to swallow does not need to name what it
			// swallowed, and naming it is the only way to write one in ES2018.
			"@typescript-eslint/no-unused-vars": ["warn", { caughtErrors: "none" }],
		},
	},
);
