import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const DASHBOARD_ROOT = join(REPO_ROOT, 'apps/dashboard');
const UNIT_CONFIG = join(DASHBOARD_ROOT, 'vitest.unit.config.ts');
const INTEGRATION_CONFIG = join(DASHBOARD_ROOT, 'vitest.integration.config.ts');
const COVERAGE_CONFIG = join(DASHBOARD_ROOT, 'vitest.config.ts');

const EXPECTED_UNIT_INCLUDE = ['src/**/*.unit.test.ts'];
const EXPECTED_INTEGRATION_INCLUDE = ['src/**/*.test.ts'];
const EXPECTED_INTEGRATION_EXCLUDE = ['src/**/*.unit.test.ts'];

const failures = [];

assertArrayEqual(
  readStringArray(UNIT_CONFIG, 'include'),
  EXPECTED_UNIT_INCLUDE,
  'Dashboard unit config must own only *.unit.test.ts files.',
);
assertArrayEqual(
  readStringArray(INTEGRATION_CONFIG, 'include'),
  EXPECTED_INTEGRATION_INCLUDE,
  'Dashboard integration config must include regular *.test.ts files.',
);
assertArrayEqual(
  readStringArray(INTEGRATION_CONFIG, 'exclude'),
  EXPECTED_INTEGRATION_EXCLUDE,
  'Dashboard integration config must exclude *.unit.test.ts files.',
);
assertArrayEqual(
  readStringArray(COVERAGE_CONFIG, 'include'),
  EXPECTED_INTEGRATION_INCLUDE,
  'Dashboard coverage config must use integration ownership.',
);
assertArrayEqual(
  readStringArray(COVERAGE_CONFIG, 'exclude'),
  EXPECTED_INTEGRATION_EXCLUDE,
  'Dashboard coverage config must exclude unit tests already run by test:unit.',
);

const dashboardTests = listFiles(join(DASHBOARD_ROOT, 'src'))
  .filter((file) => file.endsWith('.test.ts'))
  .map((file) => relative(DASHBOARD_ROOT, file))
  .sort();

const unowned = [];
const overlaps = [];
for (const file of dashboardTests) {
  const unitOwned = file.endsWith('.unit.test.ts');
  const integrationOwned = file.endsWith('.test.ts') && !unitOwned;
  if (!unitOwned && !integrationOwned) unowned.push(file);
  if (unitOwned && integrationOwned) overlaps.push(file);
}

if (unowned.length > 0) {
  failures.push([
    'Dashboard tests without an owner:',
    ...unowned.map((file) => `- apps/dashboard/${file}`),
  ].join('\n'));
}

if (overlaps.length > 0) {
  failures.push([
    'Dashboard tests owned by both unit and integration configs:',
    ...overlaps.map((file) => `- apps/dashboard/${file}`),
  ].join('\n'));
}

if (failures.length > 0) {
  console.error('Dashboard Vitest config ownership check failed.');
  console.error(failures.join('\n\n'));
  process.exit(1);
}

function readStringArray(filePath, propertyName) {
  const source = readFileSync(filePath, 'utf8');
  const propertyMatch = source.match(new RegExp(`\\b${propertyName}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!propertyMatch) {
    throw new Error(`Could not find ${propertyName} array in ${relative(REPO_ROOT, filePath)}`);
  }

  return [...propertyMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function assertArrayEqual(actual, expected, message) {
  if (actual.length === expected.length && actual.every((value, index) => value === expected[index])) {
    return;
  }

  failures.push([
    message,
    `Expected: ${JSON.stringify(expected)}`,
    `Actual:   ${JSON.stringify(actual)}`,
  ].join('\n'));
}

function listFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
}
