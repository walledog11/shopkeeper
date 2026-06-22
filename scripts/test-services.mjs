import { pathToFileURL } from 'node:url';
import { detectDockerCompose, getTestServiceTargets, runCommand, waitForAllTestServices } from './test-infra.mjs';

const COMPOSE_FILE = 'docker-compose.test.yml';

async function main() {
  const action = process.argv[2] ?? 'status';

  switch (action) {
    case 'up':
      await up();
      return;
    case 'down':
      await down();
      return;
    case 'status':
      await status();
      return;
    default:
      throw new Error(`[test-services] Unknown action "${action}". Use up, down, or status.`);
  }
}

async function up() {
  const { command, baseArgs } = detectDockerCompose();
  const composeArgs = [...baseArgs, '-f', COMPOSE_FILE];
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runCommand(command, [...composeArgs, 'pull', 'postgres', 'redis'], {
        env: process.env,
      });
      await runCommand(command, [...composeArgs, 'up', '-d', 'postgres', 'redis'], {
        env: process.env,
      });
      await waitForAllTestServices(process.env);
      break;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      // A failed `up` can leave half-created containers still holding their
      // host-port reservation, so every retry then fails with the same
      // "address already in use". Tear down before retrying to release ports.
      try {
        await runCommand(command, [...composeArgs, 'down', '--remove-orphans'], {
          env: process.env,
        });
      } catch {
        // best-effort cleanup; ignore and let the retry surface real failures
      }

      const delayMs = attempt * 5_000;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[test-services] Start failed (attempt ${attempt}/${maxAttempts}): ${message}. Retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }

  const targets = getTestServiceTargets(process.env);
  console.log(`[test-services] Postgres ready at ${targets.postgres.host}:${targets.postgres.port}`);
  console.log(`[test-services] Redis ready at ${targets.redis.host}:${targets.redis.port}`);
}

async function down() {
  const { command, baseArgs } = detectDockerCompose();
  await runCommand(command, [...baseArgs, '-f', COMPOSE_FILE, 'down', '--remove-orphans'], {
    env: process.env,
  });
}

async function status() {
  const { command, baseArgs } = detectDockerCompose();
  await runCommand(command, [...baseArgs, '-f', COMPOSE_FILE, 'ps'], {
    env: process.env,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
