import { validateCoverageWorkspaceScripts } from './lib/coverage-workspaces.mjs';

const failures = validateCoverageWorkspaceScripts();

if (failures.length > 0) {
  console.error('Coverage workspace script check failed.');
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('[coverage-workspaces] Root test:coverage targets all define scripts.test:coverage.');
