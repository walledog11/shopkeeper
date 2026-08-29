// Every `path/to/file.ts:LINE` reference in the docs must still point at code.
//
// The docs are read to decide what to build, and a stale citation is worse than
// no citation: it sends someone to investigate a claim that stopped being true,
// and it reads as authoritative the whole way. A `19,047-19,721` measured on the
// support path outlived its context and cost a whole session before anyone
// checked it against the operator path it had been attached to.
//
// This catches the mechanical half — references that no longer resolve, and the
// quieter failure where a line number drifts onto a closing brace and still
// "exists". The judgement half (counts, "N places", "grew to N lines") is not
// checkable here, which is why CLAUDE.md asks for symbol names over line numbers.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const SOURCE_ROOTS = ['apps', 'packages', 'scripts', 'extensions'];
const DOC_ROOTS = ['docs'];
const EXTRA_DOCS = ['.claude/CLAUDE.md', 'AGENT_AUDIT.md', 'README.md'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.next-e2e', '.git', 'coverage']);

// A reference landing here resolved, but not onto anything a reader can use.
const TRIVIAL = /^(\}|\)|\]|\};|\);|\}\)|\}\)\}|\)\)\}|\{|$|\/\/|\*|\/\*)/;

const REFERENCE = /`([A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|cjs|js|prisma|sql|json|yml|yaml)):(\d+)(?:-(\d+))?`/g;

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, onFile);
    else onFile(full, entry);
  }
}

const byBasename = new Map();
for (const root of SOURCE_ROOTS) {
  if (!existsSync(root)) continue;
  walk(root, (full, name) => {
    const list = byBasename.get(name) ?? [];
    list.push(full);
    byBasename.set(name, list);
  });
}

const docs = [];
for (const root of DOC_ROOTS) {
  if (existsSync(root)) walk(root, (full) => { if (full.endsWith('.md')) docs.push(full); });
}
for (const extra of EXTRA_DOCS) if (existsSync(extra)) docs.push(extra);

/** Every source path a reference could mean, most specific first. */
function resolveCandidates(reference) {
  if (existsSync(reference)) return [reference];
  const suffixMatches = (byBasename.get(basename(reference)) ?? [])
    .filter((candidate) => candidate.endsWith(reference));
  if (suffixMatches.length > 0) return suffixMatches;
  // A bare filename with no directory is ambiguous by nature; only treat it as
  // resolvable when exactly one file in the repo carries that name.
  return reference.includes('/') ? [] : (byBasename.get(reference) ?? []);
}

const failures = [];
for (const doc of docs) {
  const lines = readFileSync(doc, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(REFERENCE)) {
      const [, reference, startText] = match;
      const start = Number(startText);
      const where = `${doc}:${index + 1}`;
      const candidates = resolveCandidates(reference);

      if (candidates.length === 0) {
        failures.push(`${where}  \`${reference}:${start}\` — no such file`);
        continue;
      }
      // Ambiguous names are left alone rather than guessed at: picking one and
      // reporting on it would invent a failure the reference never had.
      if (candidates.length > 1) continue;

      const source = readFileSync(candidates[0], 'utf8').split('\n');
      if (start > source.length) {
        failures.push(
          `${where}  \`${reference}:${start}\` — file has ${source.length} lines`,
        );
        continue;
      }
      const target = source[start - 1].trim();
      if (TRIVIAL.test(target)) {
        failures.push(
          `${where}  \`${reference}:${start}\` — lands on \`${target || '(blank)'}\`, so the line has drifted`,
        );
      }
    }
  });
}

if (failures.length > 0) {
  console.error(`[docs] ${failures.length} stale code reference(s):\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nFix the line number, or replace the reference with a symbol name — a name'
    + '\nfails loudly on rename, a line number rots quietly.',
  );
  process.exit(1);
}

console.log(`[docs] ${docs.length} docs scanned; every code reference resolves.`);
