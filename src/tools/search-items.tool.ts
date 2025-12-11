import { searchQuickbooksItems } from "../handlers/search-quickbooks-items.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_items";
const toolDescription = `Search items in QuickBooks Online using criteria (maps to node-quickbooks findItems).

Returns up to 10 results by default (max 50 per request).
Use 'limit' and 'offset' parameters to paginate through results.

Example: { filters: [...], limit: 20, offset: 20 } for results 21-40`;

// Allowed field lists derived from QuickBooks Online Item entity documentation (Filterable/Sortable columns)
const ALLOWED_FILTER_FIELDS = [
  "Id",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "Name",
  "Active",
  "Type",
  "Sku",
] as const;

const ALLOWED_SORT_FIELDS = [
  "Id",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "Name",
  "ParentRef",
  "PrefVendorRef",
  "UnitPrice",
  "Type",
  "QtyOnHand",
] as const;

const ITEM_FIELD_TYPE_MAP = {
  "Id": "string",
  "MetaData.CreateTime": "date",
  "MetaData.LastUpdatedTime": "date",
  "Name": "string",
  "Active": "boolean",
  "Type": "string",
  "Sku": "string",
  "ParentRef": "string",
  "PrefVendorRef": "string",
  "UnitPrice": "number",
  "QtyOnHand": "number",
};

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

// Advanced criteria validations
const operatorSchema = z.enum(["=", "IN", "<", ">", "<=", ">=", "LIKE"]).optional();

function isValidItemValueType(field: string, value: any): boolean {
  const expected = ITEM_FIELD_TYPE_MAP[field as keyof typeof ITEM_FIELD_TYPE_MAP];
  if (!expected) return true;
  const check = (v: any): boolean => {
    switch (expected) {
      case "string":
        return typeof v === "string";
      case "number":
        return typeof v === "number";
      case "boolean":
        return typeof v === "boolean";
      case "date":
        return typeof v === "string";
      default:
        return true;
    }
  };
  return Array.isArray(value) ? value.every(check) : check(value);
}

const criterionSchema = z.object({
  key: z.string().describe("Simple key (legacy) – any Item property name."),
  value: z.union([z.string(), z.boolean()]),
});

const advancedCriterionSchema = z.object({
  field: filterableFieldSchema,
  value: z.any(),
  operator: operatorSchema,
}).superRefine((obj, ctx) => {
  if (!isValidItemValueType(obj.field as string, obj.value)) {
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

  const response = await searchQuickbooksItems(criteriaToSend);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error searching items: ${response.error}` },
      ],
    };
  }
  const items = response.result;
  return {
    content: [
      { type: "text" as const, text: `Found ${items?.length || 0} items` },
      ...(items?.map((item) => ({ type: "text" as const, text: JSON.stringify(item) })) || []),
    ],
  };
};

export const SearchItemsTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 