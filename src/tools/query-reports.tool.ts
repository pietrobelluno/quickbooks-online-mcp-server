import { queryQuickbooksReports, VALID_REPORT_TYPES } from "../handlers/query-quickbooks-reports.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "query_reports";

const toolDescription = `Generate QuickBooks reports with customizable parameters. Reports provide aggregated financial and operational data across 28 report types.

AVAILABLE REPORT TYPES (28 types):

FINANCIAL REPORTS:
- BalanceSheet: Balance sheet showing assets, liabilities, and equity
- ProfitAndLoss: Profit and loss statement (P&L) / income statement
- ProfitAndLossDetail: Detailed P&L with transaction-level details
- CashFlow: Statement of cash flows
- TrialBalance: Trial balance report

CUSTOMER REPORTS:
- CustomerSales: Sales summary by customer
- CustomerIncome: Income breakdown by customer
- CustomerBalance: Outstanding customer balances
- CustomerBalanceDetail: Detailed customer balance aging
- AgedReceivables: Accounts receivable aging summary
- AgedReceivableDetail: Detailed AR aging with transaction details

VENDOR REPORTS:
- VendorBalance: Outstanding vendor balances
- VendorBalanceDetail: Detailed vendor balance aging
- VendorExpenses: Expenses breakdown by vendor
- AgedPayables: Accounts payable aging summary
- AgedPayableDetail: Detailed AP aging with transaction details

TRANSACTION REPORTS:
- TransactionList: List of all transactions in date range
- TransactionListWithSplits: Transactions with line item splits
- TransactionListByCustomer: Transactions grouped by customer
- TransactionListByVendor: Transactions grouped by vendor
- GeneralLedgerDetail: General ledger entries

INVENTORY & SALES REPORTS:
- InventoryValuationSummary: Inventory valuation summary
- ItemSales: Sales by item/product
- DepartmentSales: Sales by department
- ClassSales: Sales by class

ACCOUNTING REPORTS:
- TaxSummary: Tax summary report
- AccountListDetail: Detailed chart of accounts
- JournalReport: Journal entries report

COMMON REPORT OPTIONS:

Date Range Parameters:
- start_date: 'YYYY-MM-DD' (required for most reports)
- end_date: 'YYYY-MM-DD' (required for most reports)
- date_macro: Predefined periods instead of explicit dates
  Values: 'Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month',
          'This Quarter', 'Last Quarter', 'This Year', 'Last Year',
          'This Fiscal Quarter', 'Last Fiscal Quarter', 'This Fiscal Year', 'Last Fiscal Year'

Filter Parameters:
- accounting_method: 'Cash' or 'Accrual'
- customer: Customer ID (for customer-specific reports)
- vendor: Vendor ID (for vendor-specific reports)
- department: Department ID
- class: Class ID
- item: Item ID (for item-specific reports)

Formatting Parameters:
- summarize_column_by: Group results by 'Total', 'Month', 'Week', 'Days', 'Quarter', 'Year', 'Customers', 'Vendors'
- sort_order: 'ascend' or 'descend'
- qzurl: true/false - Include Quick Zoom URL for drill-down

USAGE EXAMPLES:

Example 1 - Profit and loss for Q4 2024:
  reportType: "ProfitAndLoss"
  options: {
    start_date: '2024-10-01',
    end_date: '2024-12-31',
    accounting_method: 'Accrual'
  }

Example 2 - Balance sheet as of today:
  reportType: "BalanceSheet"
  options: {
    date_macro: 'Today'
  }

Example 3 - Aged receivables (AR aging):
  reportType: "AgedReceivableDetail"
  options: {
    date_macro: 'Today'
  }

Example 4 - Transaction list for December 2024:
  reportType: "TransactionList"
  options: {
    start_date: '2024-12-01',
    end_date: '2024-12-31'
  }

Example 5 - Customer sales for last quarter:
  reportType: "CustomerSales"
  options: {
    date_macro: 'Last Quarter'
  }

Example 6 - Sales by item for 2024:
  reportType: "ItemSales"
  options: {
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    summarize_column_by: 'Month'
  }

Example 7 - Vendor expenses this year:
  reportType: "VendorExpenses"
  options: {
    date_macro: 'This Year',
    accounting_method: 'Cash'
  }

Example 8 - Cash flow statement YTD:
  reportType: "CashFlow"
  options: {
    date_macro: 'This Fiscal Year-to-date'
  }

NOTES:
- Most reports require either start_date/end_date OR date_macro
- Date format must be 'YYYY-MM-DD'
- Use date_macro for convenience (e.g., 'Last Month' automatically calculates dates)
- Accounting method defaults to company preferences if not specified
- Report data structure varies by report type - returns raw QuickBooks report format
- For aged reports (AR/AP aging), use date_macro: 'Today' to get current aging
`;

const toolSchema = z.object({
  reportType: z.string().describe("The type of QuickBooks report to generate (e.g., ProfitAndLoss, BalanceSheet, AgedReceivables)"),
  options: z.any().optional().describe("Optional report parameters like date ranges, filters, and formatting options")
});

const toolHandler = async ({ params }: any) => {
  const { reportType, options } = params;

  const response = await queryQuickbooksReports({ reportType, options });

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error generating ${reportType} report: ${response.error}` },
      ],
    };
  }

  const report = response.result;
  return {
    content: [
      { type: "text" as const, text: `Generated ${reportType} report successfully` },
      { type: "text" as const, text: JSON.stringify(report, null, 2) },
    ],
  };
};

export const QueryReportsTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
  readOnlyHint: true,
};
