// Merge check (Bob, Nov 10): fail a PR when a page uses a name that is not defined or imported.
// Nov 10 outage: a stamp-conflict merge dropped `import { prefetchDealTab }` from js/app.js and every file page
// hung on "Loading this page." This rule flags that line. Only no-undef is on, so style is not part of the gate.
// Run: npm install --no-save eslint@9.17.0 globals@15.14.0 && npx eslint js
import globals from 'globals';

export default [
  { files: ['js/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } }, rules: { 'no-undef': 'error' } },
  // both guard Buffer behind `typeof btoa` for the node tests
  { files: ['js/data/agent-profile.js', 'js/data/mock-part-hr-feedback.js'], languageOptions: { globals: { Buffer: 'readonly' } } },
  // vendored calculator: CommonJS export for node, county and zip tables loaded as browser globals
  { files: ['js/data/vendor/cla-calculator/**/*.js'], languageOptions: { globals: { module: 'writable', CLA_COUNTIES: 'readonly', CLA_ZIPS: 'readonly' } } },
];
