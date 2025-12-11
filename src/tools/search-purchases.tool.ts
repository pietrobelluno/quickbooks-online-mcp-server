import { searchQuickbooksPurchases } from "../handlers/search-quickbooks-purchases.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "search_purchases";
const toolDescription = `Search purchases in QuickBooks Online that match given criteria.

Returns up to 10 results by default (max 50 per request).
Use 'limit' and 'offset' parameters to paginate through results.

Example: { limit: 20, offset: 20 } for results 21-40`;

// Define the expected input schema for searching purchases
const toolSchema = z.object({
  criteria: z.array(z.any()).optional(),
  asc: z.string().optional(),
  desc: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  count: z.boolean().optional(),
  fetchAll: z.boolean().optional(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: any) => {
  // Apply default limit and safety cap for Copilot Studio
  const { limit = 10, ...rest } = args.params || {};
  const cappedLimit = Math.min(limit, 50); // Max 50 for Copilot Studio
  const modifiedParams = { ...rest, limit: cappedLimit };

  const response = await searchQuickbooksPurchases(modifiedParams);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error searching purchases: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Purchases found:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const SearchPurchasesTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 