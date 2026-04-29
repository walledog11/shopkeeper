import { basename, extname, join, relative } from "node:path";
import { readdirSync } from "node:fs";

const MODULE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".cjs",
  ".cts",
]);

const SCAN_ROOTS = ["apps/dashboard/src/lib"];

function scanDirectory(directory, violations) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const directoryNames = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath, violations);
      continue;
    }

    if (!entry.isFile()) continue;

    const extension = extname(entry.name);
    if (!MODULE_EXTENSIONS.has(extension)) continue;

    const moduleName = basename(entry.name, extension);
    if (!directoryNames.has(moduleName)) continue;

    violations.push({
      filePath: fullPath,
      directoryPath: join(directory, moduleName),
    });
  }
}

const violations = [];

for (const scanRoot of SCAN_ROOTS) {
  scanDirectory(join(process.cwd(), scanRoot), violations);
}

if (violations.length > 0) {
  console.error("Module structure check failed.");
  console.error(
    "Do not create a file and directory with the same module name in agent code; TypeScript can resolve the file first and shadow the directory index.",
  );
  for (const violation of violations) {
    console.error(
      `- ${relative(process.cwd(), violation.filePath)} shadows ${relative(process.cwd(), violation.directoryPath)}/`,
    );
  }
  process.exit(1);
}
