import { queryQuickbooksData, VALID_ENTITIES } from "../handlers/query-quickbooks-data.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "query_data";

const toolDescription = `Query QuickBooks data entities using structured criteria. This tool enables flexible querying of 35 QuickBooks entity types with filters, sorting, and pagination.

SUPPORTED ENTITIES (35 types):
Account, Attachable, Bill, BillPayment, Budget, Class, CompanyInfo, CompanyCurrency, CreditMemo, Customer, CustomerType, Department, Deposit, Employee, Estimate, Invoice, Item, JournalCode, JournalEntry, Payment, PaymentMethod, Preferences, Purchase, PurchaseOrder, RefundReceipt, SalesReceipt, TaxAgency, TaxCode, TaxRate, Term, TimeActivity, Transfer, Vendor, VendorCredit, ExchangeRate

CRITERIA FORMAT OPTIONS:
1. Simple object (field-value pairs):
   {Balance: 100, Active: true}

2. Array with operators:
   [{field: 'Balance', value: 100, operator: '>'}]

3. Advanced options object:
   {
     filters: [{field: 'Balance', value: 100, operator: '>'}],
     desc: 'MetaData.LastUpdatedTime',
     limit: 50,
     offset: 0,
     count: false,
     fetchAll: false
   }

SUPPORTED OPERATORS:
= (equals), IN (in list), < (less than), > (greater than), <= (less than or equal), >= (greater than or equal), LIKE (pattern match with % wildcard)

COMMON FILTERABLE FIELDS (vary by entity):
- Id: Unique identifier (string)
- MetaData.CreateTime: Creation timestamp (date)
- MetaData.LastUpdatedTime: Last update timestamp (date)
- Active: Active status (boolean)
- Balance: Outstanding balance (number) - for Customer, Invoice, Bill
- DisplayName: Display name (string) - for Customer, Vendor
- TxnDate: Transaction date (date) - for Invoice, Bill, Payment
- DueDate: Due date (date) - for Invoice, Bill
- TotalAmt: Total amount (number) - for Invoice, Bill, Payment
- CustomerRef: Customer reference (string) - for Invoice, Payment
- VendorRef: Vendor reference (string) - for Bill, Purchase

USAGE EXAMPLES:

Example 1 - Find invoices with balance > 100:
  entity: "Invoice"
  criteria: [{field: 'Balance', value: 100, operator: '>'}]

Example 2 - Get active customers sorted by last updated:
  entity: "Customer"
  criteria: {
    filters: [{field: 'Active', value: true}],
    desc: 'MetaData.LastUpdatedTime',
    limit: 100
  }

Example 3 - Find bills due in next 30 days:
  entity: "Bill"
  criteria: [
    {field: 'DueDate', value: '2025-12-15', operator: '>'},
    {field: 'DueDate', value: '2026-01-15', operator: '<'}
  ]

Example 4 - Search vendors by email pattern:
  entity: "Vendor"
  criteria: [{field: 'PrimaryEmailAddr', value: '%@acme.com%', operator: 'LIKE'}]

Example 5 - Get all accounts (fetchAll):
  entity: "Account"
  criteria: {fetchAll: true}

Example 6 - Find past due invoices:
  entity: "Invoice"
  criteria: [
    {field: 'Balance', value: 0, operator: '>'},
    {field: 'DueDate', value: '2025-12-15', operator: '<'}
  ]

NOTES:
- Date fields should be in 'YYYY-MM-DD' format
- LIKE operator uses % as wildcard (e.g., '%@gmail.com' finds emails ending with @gmail.com)
- Use fetchAll: true to get all results (automatically handles pagination)
- Default limit is 100 if not specified
- Empty criteria returns first 100 entities
`;

const toolSchema = z.object({
  entity: z.string().describe("The QuickBooks entity type to query (e.g., Invoice, Customer, Vendor, Bill)"),
  criteria: z.any().optional().describe("Optional search criteria with filters, sorting, and pagination")
});

const toolHandler = async ({ params }: any) => {
  const { entity, criteria } = params;

  const response = await queryQuickbooksData({ entity, criteria });

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error querying ${entity}: ${response.error}` },
      ],
    };
  }

  const results = response.result;
  return {
    content: [
      { type: "text" as const, text: `Found ${results?.length || 0} ${entity} record(s)` },
      ...(results?.map((record) => ({ type: "text" as const, text: JSON.stringify(record, null, 2) })) || []),
    ],
  };
};

export const QueryDataTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
