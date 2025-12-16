import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

// Comprehensive mapping of QuickBooks report types to node-quickbooks report methods
const REPORT_TYPE_MAP: Record<string, string> = {
  // Financial Reports
  'BalanceSheet': 'reportBalanceSheet',
  'ProfitAndLoss': 'reportProfitAndLoss',
  'ProfitAndLossDetail': 'reportProfitAndLossDetail',
  'CashFlow': 'reportCashFlow',
  'TrialBalance': 'reportTrialBalance',

  // Customer Reports
  'CustomerSales': 'reportCustomerSales',
  'CustomerIncome': 'reportCustomerIncome',
  'CustomerBalance': 'reportCustomerBalance',
  'CustomerBalanceDetail': 'reportCustomerBalanceDetail',
  'AgedReceivables': 'reportAgedReceivables',
  'AgedReceivableDetail': 'reportAgedReceivableDetail',

  // Vendor Reports
  'VendorBalance': 'reportVendorBalance',
  'VendorBalanceDetail': 'reportVendorBalanceDetail',
  'VendorExpenses': 'reportVendorExpenses',
  'AgedPayables': 'reportAgedPayables',
  'AgedPayableDetail': 'reportAgedPayableDetail',

  // Transaction Reports
  'TransactionList': 'reportTransactionList',
  'TransactionListWithSplits': 'reportTransactionListWithSplits',
  'TransactionListByCustomer': 'reportTransactionListByCustomer',
  'TransactionListByVendor': 'reportTransactionListByVendor',
  'GeneralLedgerDetail': 'reportGeneralLedgerDetail',

  // Inventory & Sales Reports
  'InventoryValuationSummary': 'reportInventoryValuationSummary',
  'ItemSales': 'reportItemSales',
  'DepartmentSales': 'reportDepartmentSales',
  'ClassSales': 'reportClassSales',

  // Accounting Reports
  'TaxSummary': 'reportTaxSummary',
  'AccountListDetail': 'reportAccountListDetail',
  'JournalReport': 'reportJournalReport'
};

// List of valid report types for validation
export const VALID_REPORT_TYPES = Object.keys(REPORT_TYPE_MAP);

export interface QueryReportsInput {
  reportType: string;
  options?: Record<string, any>;
}

/**
 * Generate QuickBooks reports with customizable parameters.
 * Supports 28 report types including ProfitAndLoss, BalanceSheet, AgedReceivables, etc.
 */
export async function queryQuickbooksReports(input: QueryReportsInput): Promise<ToolResponse<any>> {
  const { reportType, options = {} } = input;

  // Validate report type
  if (!VALID_REPORT_TYPES.includes(reportType)) {
    return {
      result: null,
      isError: true,
      error: `Invalid report type: "${reportType}". Supported reports: ${VALID_REPORT_TYPES.join(', ')}`
    };
  }

  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();

    // Get the appropriate report method
    const methodName = REPORT_TYPE_MAP[reportType];

    return new Promise((resolve) => {
      (quickbooks as any)[methodName](options, (err: any, report: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({
            result: report,
            isError: false,
            error: null,
          });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
