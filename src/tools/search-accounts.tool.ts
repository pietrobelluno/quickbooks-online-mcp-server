import { searchQuickbooksAccounts } from "../handlers/search-quickbooks-accounts.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_accounts";
const toolDescription = `Search chart‑of‑accounts entries using criteria.

Returns up to 10 results by default (max 50 per request).
Use 'limit' and 'offset' parameters to paginate through results.

Example: { filters: [...], limit: 20, offset: 20 } for results 21-40`;

// Allowed field lists based on QuickBooks Online Account entity documentation. Only these can be
// used in the search criteria.
const ALLOWED_FILTER_FIELDS = [
  "Id",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "Name",
  "SubAccount",
  "ParentRef",
  "Description",
  "Active",
  "Classification",
  "AccountType",
  "CurrentBalance",
] as const;

const ALLOWED_SORT_FIELDS = [
  "Id",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "Name",
  "SubAccount",
  "ParentRef",
  "Description",
  "CurrentBalance",
] as const;

// BEGIN ADD FIELD TYPE MAP
const ACCOUNT_FIELD_TYPE_MAP: Record<string, "string" | "number" | "boolean" | "date"> = {
  Id: "string",
  "MetaData.CreateTime": "date",
  "MetaData.LastUpdatedTime": "date",
  Name: "string",
  SubAccount: "boolean",
  ParentRef: "string",
  Description: "string",
  Active: "boolean",
  Classification: "string",
  AccountType: "string",
  CurrentBalance: "number",
};

function isValidValueType(field: string, value: any): boolean {
  const expected = ACCOUNT_FIELD_TYPE_MAP[field];
  if (!expected) return true; // If field not in map, skip type check.
  switch (expected) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string"; // assume ISO date string
    default:
      return true;
  }
}
// END ADD FIELD TYPE MAP

// Zod schemas that validate the fields against the above white-lists
const filterableFieldSchema = z
  .string()
  .refine((val) => (ALLOWED_FILTER_FIELDS as readonly string[]).includes(val), {
    message: `Field must be one of: ${ALLOWED_FILTER_FIELDS.join(", ")}`,
  });

const sortableFieldSchema = z
  .string()
  .refine((val) => (ALLOWED_SORT_FIELDS as readonly string[]).includes(val), {
    message: `Sort field must be one of: ${ALLOWED_SORT_FIELDS.join(", ")}`,
  });

// Advanced criteria shape
const operatorSchema = z.enum(["=", "IN", "<", ">", "<=", ">=", "LIKE"]).optional();

const criterionSchema = z.object({
  key: z.string().describe("Simple key (legacy) – any Account property name."),
  value: z.union([z.string(), z.boolean()]),
});

const advancedCriterionSchema = z.object({
  field: filterableFieldSchema,
  value: z.any(),
  operator: operatorSchema,
}).superRefine((obj, ctx) => {
  if (!isValidValueType(obj.field, obj.value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Value type does not match expected type for field ${obj.field}`,
    });
  }
});

const toolSchema = z.object({
  criteria: z
    .array(advancedCriterionSchema.or(criterionSchema))
    .optional()
    .describe(
      "Filters to apply. Use the advanced form {field,value,operator?} for operators or the simple {key,value} pairs."
    ),
  limit: z.number().optional(),
  offset: z.number().optional(),
  asc: sortableFieldSchema.optional(),
  desc: sortableFieldSchema.optional(),
  count: z.boolean().optional(),
  fetchAll: z.boolean().optional(),
});

const toolHandler = async (args: any) => {
  const { criteria = [], limit = 10, offset = 0, count = false, ...options } =
    (args.params ?? {}) as z.infer<typeof toolSchema>;

  // Apply safety cap for Copilot Studio
  const cappedLimit = Math.min(limit, 50);

  // Build criteria to pass to SDK, supporting advanced operator syntax
  let criteriaToSend: any;
  if (Array.isArray(criteria) && criteria.length > 0) {
    const first = criteria[0] as any;
    if (typeof first === "object" && "field" in first) {
      // Advanced format with field/value/operator
      const filters: Record<string, any> = {};
      criteria.forEach((c: any) => {
        const key = c.field || c.key;
        const val = c.value;
        if (key && key !== 'count') {
          filters[key] = val;
        }
      });
      criteriaToSend = { ...filters, limit: cappedLimit, offset, ...options };
    } else {
      // Legacy format with key/value
      criteriaToSend = (criteria as Array<{ key: string; value: any }>).reduce<Record<string, any>>(
        (acc, { key, value }) => {
          if (value !== undefined && value !== null && key !== 'count') {
            acc[key] = value;
          }
          return acc;
        },
        { limit: cappedLimit, offset, ...options }
      );
    }
  } else {
    // No criteria - just pagination
    criteriaToSend = { limit: cappedLimit, offset, ...options };
  }

  const response = await searchQuickbooksAccounts(criteriaToSend);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error searching accounts: ${response.error}` },
      ],
    };
  }
  const accounts = response.result;
  return {
    content: [
      { type: "text" as const, text: `Found ${accounts?.length || 0} accounts` },
      ...(accounts?.map((acc: any) => ({ type: "text" as const, text: JSON.stringify(acc) })) || []),
    ],
  };
};

// Update export
export const SearchAccountsTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 