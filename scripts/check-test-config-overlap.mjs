import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const failures = [];

const projects = [
  {
    name: 'dashboard',
    root: 'apps/dashboard',
    unitInclude: ['src/**/*.unit.test.{ts,tsx}'],
    integrationInclude: ['src/**/*.test.{ts,tsx}'],
    integrationExclude: ['src/**/*.unit.test.{ts,tsx}'],
    productionInclude: ['src/**/*.{ts,tsx}'],
  },
  {
    name: 'gateway',
    root: 'apps/gateway',
    unitInclude: ['src/**/*.unit.test.ts'],
    integrationInclude: ['src/**/*.test.ts'],
    integrationExclude: ['src/**/*.unit.test.ts'],
    productionInclude: ['src/**/*.{ts,tsx}'],
  },
];

for (const project of projects) {
  const projectRoot = join(REPO_ROOT, project.root);
  const unitConfig = join(projectRoot, 'vitest.unit.config.ts');
  const integrationConfig = join(projectRoot, 'vitest.integration.config.ts');
  const coverageConfig = join(projectRoot, 'vitest.config.ts');

  assertArrayEqual(
    readStringArray(unitConfig, 'include'),
    project.unitInclude,
    `${project.name} unit config must own only *.unit.test files.`,
  );
  assertArrayEqual(
    readStringArray(integrationConfig, 'include'),
    project.integrationInclude,
    `${project.name} integration config must include regular *.test files.`,
  );
  assertArrayEqual(
    readStringArray(integrationConfig, 'exclude'),
    project.integrationExclude,
    `${project.name} integration config must exclude unit-owned tests.`,
  );
  assertArrayEqual(
    readCoverageArray(coverageConfig, 'include'),
    project.productionInclude,
    `${project.name} coverage must include every production TypeScript source file.`,
  );
  assertCoverageExcludesTests(coverageConfig, project.name);

  const tests = listFiles(join(projectRoot, 'src'))
    .filter(isVitestFile)
    .map((file) => relative(REPO_ROOT, file))
    .sort();

  assertExactlyOneOwner(tests, (file) => [
    file.includes('.unit.test.') ? `${project.name}:unit` : null,
    !file.includes('.unit.test.') ? `${project.name}:integration` : null,
  ].filter(Boolean));
}

for (const project of [
  { name: 'agent', root: 'packages/agent', productionInclude: ['src/**/*.ts'] },
  { name: 'email', root: 'packages/email', productionInclude: ['src/**/*.ts'] },
]) {
  const projectRoot = join(REPO_ROOT, project.root);
  const config = join(projectRoot, 'vitest.config.ts');
  assertArrayEqual(
    readCoverageArray(config, 'include'),
    project.productionInclude,
    `${project.name} coverage must include every production TypeScript source file.`,
  );
  assertCoverageExcludesTests(config, project.name);

  const tests = listFiles(join(projectRoot, 'src'))
    .filter(isVitestFile)
    .map((file) => relative(REPO_ROOT, file))
    .sort();
  assertExactlyOneOwner(tests, (file) => [
    project.name === 'agent' && file.includes('.integration.test.')
      ? 'agent:integration'
      : `${project.name}:unit`,
  ]);
}

const agentRoot = join(REPO_ROOT, 'packages/agent');
assertArrayEqual(
  readStringArray(join(agentRoot, 'vitest.unit.config.ts'), 'include'),
  ['src/**/*.test.ts'],
  'agent unit config must include package test files.',
);
assertArrayEqual(
  readStringArray(join(agentRoot, 'vitest.unit.config.ts'), 'exclude'),
  ['src/**/*.integration.test.ts'],
  'agent unit config must exclude database-backed integration tests.',
);
assertArrayEqual(
  readStringArray(join(agentRoot, 'vitest.integration.config.ts'), 'include'),
  ['src/**/*.integration.test.ts'],
  'agent integration config must own database-backed integration tests.',
);

const scriptTests = listFiles(join(REPO_ROOT, 'scripts'))
  .filter((file) => file.endsWith('.test.mjs'))
  .map((file) => relative(REPO_ROOT, file));
assertExactlyOneOwner(scriptTests, () => ['node:test']);

const e2eTests = listFiles(join(REPO_ROOT, 'e2e'))
  .filter((file) => file.endsWith('.spec.ts') || file.endsWith('.setup.ts'))
  .map((file) => relative(REPO_ROOT, file));
assertExactlyOneOwner(e2eTests, (file) => {
  if (file.endsWith('/core-agent-flow.spec.ts') || file.endsWith('/clerk.setup.ts')) {
    return ['playwright:real-clerk'];
  }
  return ['playwright:auth-bypass'];
});

const rootPackage = readJson(join(REPO_ROOT, 'package.json'));
const coverageScript = rootPackage.scripts?.['test:coverage'] ?? '';
for (const workspace of ['apps/dashboard', 'apps/gateway', 'packages/agent', 'packages/email']) {
  if (!coverageScript.includes(`-w ${workspace}`)) {
    failures.push(`Root test:coverage does not include ${workspace}.`);
  }
}
if (rootPackage.scripts?.['verify:pr']?.includes('test:integration')) {
  failures.push('verify:pr must not run integration separately from the comprehensive coverage gate.');
}

const ciSource = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
for (const workspace of ['apps/dashboard', 'apps/gateway', 'packages/agent', 'packages/email']) {
  if (!ciSource.includes(`${workspace}/coverage/`)) {
    failures.push(`CI coverage artifact does not include ${workspace}.`);
  }
}

if (failures.length > 0) {
  console.error('Test ownership and coverage structure check failed.');
  console.error(failures.join('\n\n'));
  process.exit(1);
}

function assertCoverageExcludesTests(configPath, projectName) {
  const exclusions = readCoverageArray(configPath, 'exclude');
  if (!exclusions.some((pattern) => pattern.includes('.test.'))) {
    failures.push(`${projectName} coverage must exclude test files.`);
  }
  if (!exclusions.some((pattern) => pattern.endsWith('*.d.ts'))) {
    failures.push(`${projectName} coverage must exclude generated declarations.`);
  }
}

function assertExactlyOneOwner(files, ownersForFile) {
  for (const file of files) {
    const owners = ownersForFile(file);
    if (owners.length === 1) continue;
    failures.push(
      owners.length === 0
        ? `Test has no suite owner: ${file}`
        : `Test has multiple suite owners (${owners.join(', ')}): ${file}`,
    );
  }
}

function readCoverageArray(filePath, propertyName) {
  const source = readFileSync(filePath, 'utf8');
  const coverageStart = source.indexOf('coverage:');
  if (coverageStart === -1) {
    throw new Error(`Could not find coverage config in ${relative(REPO_ROOT, filePath)}`);
  }
  return readStringArrayFromSource(source.slice(coverageStart), propertyName, filePath);
}

function readStringArray(filePath, propertyName) {
  return readStringArrayFromSource(readFileSync(filePath, 'utf8'), propertyName, filePath);
}

function readStringArrayFromSource(source, propertyName, filePath) {
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
  failures.push(`${message}\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(actual)}`);
}

function isVitestFile(file) {
  return /\.test\.(?:ts|tsx)$/.test(file);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}
