import { searchQuickbooksBills } from "../handlers/search-quickbooks-bills.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { formatPaginationMessage, extractCriteriaDescription } from "../helpers/format-pagination-message.js";
import { z } from "zod";

const toolName = "search_bills";
const toolDescription = `Search bills in QuickBooks Online with filtering and pagination.

**CONTEXT-AWARE USAGE:**
This tool supports conversational, context-aware queries. Use conversation history to:
1. Extract entity IDs from previous responses (e.g., vendor ID 1085)
2. Maintain pagination state (remember previous offset and limit)
3. Parse natural language into technical filters

**FILTERING EXAMPLES:**
- Filter by vendor: { criteria: [{ field: "VendorRef", value: "1085" }] }
- Filter by date range: { criteria: [{ field: "TxnDate", value: "2024-01-01", operator: ">" }] }
- Filter by balance: { criteria: [{ field: "Balance", value: "0", operator: ">" }] }
- Multiple filters: Combine multiple criteria objects (AND operation)

**NATURAL LANGUAGE PAGINATION:**
When user says "next", "more", or "show me the next 10":
1. Look back at the conversation to find previous query's offset and limit
2. Calculate: new_offset = previous_offset + previous_limit
3. Pass: { offset: new_offset, limit: previous_limit }

Examples:
- Previous: offset=0, limit=10 → User says "next" → Use offset=10, limit=10
- Previous: offset=10, limit=20 → User says "more" → Use offset=30, limit=20

**ENTITY LINKING:**
When user references entities from previous responses:
- "Show bills for that vendor" → Extract vendor ID from previous vendor query
- "Bills for this supplier" → Extract vendor ID from conversation context
- Parse entity names to IDs automatically

**PAGINATION:**
Returns up to 10 results by default (max 50 per request).
Response format: "Showing bills 1-10 of 254. To see more, say 'next', 'more', or 'show me the next 10'"

**COUNT QUERIES:**
To get only the count: { count: true }
Response: "Found 254 bills" (with filters applied if specified)

**SUPPORTED FILTERS:**
- VendorRef: Vendor ID (string) - Filter by vendor
- TxnDate: Transaction date (YYYY-MM-DD)
- DueDate: Due date (YYYY-MM-DD)
- Balance: Outstanding balance (number)
- TotalAmt: Total amount (number)
- DocNumber: Document number (string)
- MetaData.CreateTime: Creation timestamp
- MetaData.LastUpdatedTime: Last update timestamp
- APAccountRef: Accounts Payable account reference
- DepartmentRef: Department reference
- CurrencyRef: Currency reference`;

// A subset of commonly-used Bill fields that can be filtered on.
// This is *not* an exhaustive list, but provides helpful IntelliSense / docs
// to users of the tool. Any field returned in the Quickbooks Bill entity is
// technically valid.
const billFieldEnum = z.enum([
  "Id",
  "SyncToken",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "TxnDate",
  "DueDate", 
  "Balance",
  "TotalAmt",
  "VendorRef",
  "APAccountRef",
  "DocNumber",
  "PrivateNote",
  "ExchangeRate",
  "DepartmentRef",
  "CurrencyRef"
]).describe(
  "Field to filter on – must be a property of the QuickBooks Online Bill entity."
);

const criterionSchema = z.object({
  key: z.string().describe("Simple key (legacy) – any Bill property name."),
  value: z.union([z.string(), z.boolean()]),
});

// Advanced criterion schema with operator support.
const advancedCriterionSchema = z.object({
  field: billFieldEnum,
  value: z.union([z.string(), z.boolean()]),
  operator: z
    .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
    .optional()
    .describe("Comparison operator. Defaults to '=' if omitted."),
});

const toolSchema = z.object({
  // Allow advanced criteria array like [{field,value,operator}]
  criteria: z
    .array(advancedCriterionSchema.or(criterionSchema))
    .optional()
    .describe(
      "Filters to apply. Use the advanced form {field,value,operator?} for operators or the simple {key,value} pairs."
    ),

  limit: z.number().optional(),
  offset: z.number().optional(),
  asc: z.string().optional(),
  desc: z.string().optional(),
  fetchAll: z.boolean().optional(),
  count: z.boolean().optional(),
});

export const SearchBillsTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: async (args) => {
    console.log('[SEARCH BILLS] Raw params:', JSON.stringify(args.params));
    const { criteria = [], limit = 10, offset = 0, count = false, ...options } = (args.params ?? {}) as z.infer<typeof toolSchema>;
    console.log('[SEARCH BILLS] Parsed - criteria:', JSON.stringify(criteria), 'count:', count, 'options:', JSON.stringify(options));

    // Apply safety cap for Copilot Studio
    const cappedLimit = Math.min(limit, 50); // Max 50 for Copilot Studio

    // build criteria to pass to SDK, supporting advanced operator syntax
    // NOTE: Never include 'count' in the main query criteria - it causes parsing errors
    let criteriaToSend: any;
    if (Array.isArray(criteria) && criteria.length > 0) {
      const first = criteria[0] as any;
      if (typeof first === "object" && "field" in first) {
        // Array form: convert to object
        const filters: Record<string, any> = {};
        criteria.forEach((c: any) => {
          const key = c.field || c.key;
          const val = c.value;
          if (key && key !== 'count') {  // Skip count - never add to query
            filters[key] = val;
          }
        });
        criteriaToSend = { ...filters, limit: cappedLimit, offset, ...options };
      } else {
        criteriaToSend = (criteria as Array<{ key: string; value: any }>).reduce<Record<string, any>>((acc, { key, value }) => {
          if (value !== undefined && value !== null && key !== 'count') {  // Skip count
            acc[key] = value;
          }
          return acc;
        }, { limit: cappedLimit, offset, ...options });
      }
    } else {
      // Never include count in the main query criteria
      criteriaToSend = { limit: cappedLimit, offset, ...options };
    }

    // Execute with count (skip count query if already count-only)
    const response = await searchQuickbooksBills(criteriaToSend, {
      includeCount: !count // Don't double-fetch if count: true
    });

    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error searching bills: ${response.error}` }],
      };
    }

    const { entities, totalCount } = response.result!;

    // Generate human-readable message
    const criteriaDesc = extractCriteriaDescription(criteriaToSend, 'bills');
    const message = formatPaginationMessage({
      entityName: 'bills',
      entityCount: entities.length,
      limit: cappedLimit,
      offset,
      totalCount,
      criteriaDescription: criteriaDesc,
    });

    // Return formatted response
    return {
      content: [
        { type: "text" as const, text: message },
        ...entities.map((bill) => ({
          type: "text" as const,
          text: JSON.stringify(bill)
        })),
      ],
    };
  },
}; 