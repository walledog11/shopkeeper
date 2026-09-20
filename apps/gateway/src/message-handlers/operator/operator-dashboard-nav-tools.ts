import {
  buildNavigateDashboardResult,
  DASHBOARD_DESTINATIONS,
  formatDashboardDestinationCatalog,
  getDashboardDestination,
  NAVIGATE_DASHBOARD_TOOL,
} from '@shopkeeper/agent/dashboard-destinations';
import { defineTool, stringArg, toolError, toolOk, type AgentToolDefinition } from '@shopkeeper/agent/tools';

interface NavigateDashboardInput {
  destination: string;
}

export function buildOperatorDashboardNavTools(): Record<string, AgentToolDefinition> {
  const destinationIds = DASHBOARD_DESTINATIONS.map((destination) => destination.id);

  const navigateDashboard = defineTool({
    name: NAVIGATE_DASHBOARD_TOOL,
    description:
      "Open a page in the merchant's dashboard. Use when they want to go somewhere or set something up in the UI — for example add email, connect a channel, change trust level, open agent settings, billing, or the inbox. Pick the best destination id from the catalog.",
    fields: {
      destination: stringArg(
        `Which dashboard page to open. Catalog:\n${formatDashboardDestinationCatalog()}`,
        { required: true, enum: destinationIds },
      ),
    },
    category: 'read',
    group: 'knowledge',
    capabilities: [],
    label: 'Opened dashboard page',
    planStepLabel: 'Open dashboard page',
    execute: async (input: NavigateDashboardInput) => {
      const destination = getDashboardDestination(input.destination);
      if (!destination) {
        return toolError(`Error: unknown dashboard destination "${input.destination}".`);
      }
      return toolOk(buildNavigateDashboardResult(destination));
    },
  });

  return {
    [navigateDashboard.name]: navigateDashboard,
  };
}
