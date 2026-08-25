import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parse `npm run ... -w <target>` workspace names from the root test:coverage script.
 */
export function listCoverageWorkspaceTargets(coverageScript) {
  if (typeof coverageScript !== 'string' || coverageScript.trim() === '') {
    return [];
  }
  return [...coverageScript.matchAll(/(?:^|\s)-w\s+([^\s&]+)/g)].map((match) => match[1]);
}

export function validateCoverageWorkspaceScripts(rootDir = process.cwd()) {
  const rootPackage = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  const coverageScript = rootPackage.scripts?.['test:coverage'] ?? '';
  const workspaces = listCoverageWorkspaceTargets(coverageScript);
  const failures = [];

  if (workspaces.length === 0) {
    failures.push('Root package.json scripts.test:coverage must declare at least one `-w <workspace>` target.');
    return failures;
  }

  for (const workspace of workspaces) {
    const packageJsonPath = join(rootDir, workspace, 'package.json');
    let packageJson;
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    } catch {
      failures.push(`Coverage workspace "${workspace}" is missing ${workspace}/package.json.`);
      continue;
    }

    if (!packageJson.scripts?.['test:coverage']) {
      failures.push(
        `${workspace} is listed in root scripts.test:coverage but does not define scripts.test:coverage.`,
      );
    }
  }

  return failures;
}
