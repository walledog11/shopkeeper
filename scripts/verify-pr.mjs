import { runCommand } from './test-infra.mjs';

const STAGES = {
  static: [
    ['npm', ['run', 'lint:structure']],
    ['npm', ['run', 'lint:repo']],
    ['npm', ['run', 'lint:knip']],
    ['npx', ['turbo', 'run', 'lint']],
    ['npm', ['run', 'typecheck']],
    ['node', ['--test', 'scripts/check-production-env.test.mjs']],
  ],
  unit: [
    ['npm', ['run', 'test:unit']],
    ['npm', ['run', 'test:node']],
  ],
  e2e: [['npm', ['run', 'test:e2e:smoke']]],
  coverage: [['npm', ['run', 'test:coverage']]],
  build: [['npm', ['run', 'build']]],
};

const requestedStage = readStage(process.argv.slice(2));
const stages = requestedStage ? [requestedStage] : Object.keys(STAGES);

for (const stage of stages) {
  console.log(`[verify:pr] ${stage}`);
  for (const [command, args] of STAGES[stage]) {
    await runCommand(command, args, { env: process.env });
  }
}

function readStage(args) {
  if (args.length === 0) return null;

  const inline = args.find((arg) => arg.startsWith('--stage='));
  const stageIndex = args.indexOf('--stage');
  const stage = inline?.slice('--stage='.length) ?? (stageIndex >= 0 ? args[stageIndex + 1] : null);

  if (!stage || !(stage in STAGES)) {
    throw new Error(
      `[verify:pr] Unknown stage "${stage ?? ''}". Use one of: ${Object.keys(STAGES).join(', ')}.`,
    );
  }
  return stage;
}
