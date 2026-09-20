import { defineTool, stringArg, toolNotFound, toolOk, type AgentToolDefinition } from '@shopkeeper/agent/tools';
import { searchProductHelp } from '@shopkeeper/agent/product-help';

export function buildOperatorProductHelpTools(): Record<string, AgentToolDefinition> {
  const searchProductHelpTool = defineTool({
    name: 'search_product_help',
    description:
      "Search Shopkeeper's built-in product help for how the dashboard, inbox, integrations, and agent settings work. Use this when the operator asks why something in Shopkeeper behaves a certain way — for example why tickets are not appearing, how forwarding works, or what a setting does.",
    fields: {
      query: stringArg('What to look up in Shopkeeper product help (for example "tickets not appearing", "email forwarding", "business hours").', {
        required: true,
      }),
    },
    category: 'read',
    group: 'knowledge',
    capabilities: [],
    label: 'Searched product help',
    planStepLabel: 'Search product help',
    execute: async (input: { query: string }) => {
      const results = searchProductHelp(input.query, 3);
      if (results.length === 0) {
        return toolNotFound('No product help articles matched that query.');
      }

      return toolOk(JSON.stringify(results.map(result => ({
        title: result.title,
        category: result.categoryTitle,
        excerpt: result.excerpt,
        body: result.body,
      }))));
    },
  });

  return {
    [searchProductHelpTool.name]: searchProductHelpTool,
  };
}
