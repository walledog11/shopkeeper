import { afterEach } from 'vitest';
import { installTestNetworkGuard, resetTestNetworkAllowlist } from '../../../scripts/test-network-guard.mjs';

installTestNetworkGuard();
afterEach(resetTestNetworkAllowlist);
