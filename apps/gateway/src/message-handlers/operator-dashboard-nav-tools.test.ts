import { describe, expect, it } from 'vitest';
import type { BaseAgentContext } from '@shopkeeper/agent/context';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { parseNavigateDashboardResult } from '@shopkeeper/agent/dashboard-destinations';
import { buildOperatorDashboardNavTools } from './operator-dashboard-nav-tools.js';

const baseCtx = { orgId: 'org', orgName: 'Store', recentMessages: [], shopify: null } as unknown as BaseAgentContext;
const settings = resolveAgentSettings(null);
const emptyDeps = {} as never;

describe('navigate_dashboard', () => {
  const tools = buildOperatorDashboardNavTools();
  const navigate = tools.navigate_dashboard;

  it('returns an allowlisted href payload for integrations', async () => {
    const result = await navigate.execute({ destination: 'integrations' }, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('ok');
    expect(parseNavigateDashboardResult(result.message)).toEqual({
      type: 'navigate',
      href: '/dashboard/integrations',
      label: 'Integrations',
    });
  });

  it('returns an error for unknown destinations', async () => {
    const result = await navigate.execute({ destination: 'nowhere' }, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
    expect(result.message).toContain('unknown dashboard destination');
  });
});
