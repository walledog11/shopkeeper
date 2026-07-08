import { loadGatewayEnv } from '../config/load-env.js';
import logger from '../logger.js';
import { purgeLegacyImessageCustomerThreads } from '../maintenance/purge-legacy-imessage.js';

loadGatewayEnv();

const dryRun = process.argv.includes('--dry-run');

const count = await purgeLegacyImessageCustomerThreads({ dryRun });

if (dryRun) {
  logger.info({ count }, '[Purge] Legacy iMessage customer threads (dry run — no rows changed)');
} else {
  logger.info({ count }, '[Purge] Soft-deleted legacy iMessage customer threads');
}
