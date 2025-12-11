import { searchQuickbooksInvoices } from "../handlers/search-quickbooks-invoices.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_invoices";
const toolDescription = `Search invoices in QuickBooks Online using criteria (maps to node-quickbooks findInvoices).

Returns up to 10 results by default (max 50 per request).
Use 'limit' and 'offset' parameters to paginate through results.

Example: { filters: [...], limit: 20, offset: 20 } for results 21-40`;

// ALLOWED FIELD LISTS (derived from Quickbooks Invoice entity docs – Filterable and Sortable columns)
const ALLOWED_FILTER_FIELDS = [
  "Id",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "DocNumber",
  "TxnDate",
  "DueDate",
  "CustomerRef",
  "ClassRef",
  "DepartmentRef",
  "Balance",
  "TotalAmt",
] as const;

const ALLOWED_SORT_FIELDS = [
  "Id",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "DocNumber",
  "TxnDate",
  "Balance",
  "TotalAmt",
] as const;

// FIELD TYPE MAP
const FIELD_TYPE_MAP = {
  "Id": "string",
  "MetaData.CreateTime": "date",
  "MetaData.LastUpdatedTime": "date",
  "DocNumber": "string",
  "TxnDate": "date",
  "DueDate": "date",
  "CustomerRef": "string",
  "ClassRef": "string",
  "DepartmentRef": "string",
  "Balance": "number",
  "TotalAmt": "number",
} as const;

// Helper function to check if the value type matches the expected type for the field
const isValidInvoiceValueType = (field: string, value: any): boolean => {
  const expectedType = FIELD_TYPE_MAP[field as keyof typeof FIELD_TYPE_MAP];
  return typeof value === expectedType;
};

// Zod schemas that validate the fields against the white-lists
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

// Criteria can be advanced
const operatorSchema = z.enum(["=", "IN", "<", ">", "<=", ">=", "LIKE"]).optional();

const criterionSchema = z.object({
  key: z.string().describe("Simple key (legacy) – any Invoice property name."),
  value: z.union([z.string(), z.boolean()]),
});

const advancedCriterionSchema = z.object({
  field: filterableFieldSchema,
  value: z.any(),
  operator: operatorSchema,
}).superRefine((obj, ctx) => {
  if (!isValidInvoiceValueType(obj.field as string, obj.value)) {
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

  const response = await searchQuickbooksInvoices(criteriaToSend);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error searching invoices: ${response.error}` },
      ],
    };
  }
  const invoices = response.result;
  return {
    content: [
      { type: "text" as const, text: `Found ${invoices?.length || 0} invoices` },
      ...(invoices?.map((inv) => ({ type: "text" as const, text: JSON.stringify(inv) })) || []),
    ],
  };
};

export const SearchInvoicesTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 