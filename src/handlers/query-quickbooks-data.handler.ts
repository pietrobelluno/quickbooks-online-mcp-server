import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { buildQuickbooksSearchCriteria, QuickbooksSearchCriteriaInput } from "../helpers/build-quickbooks-search-criteria.js";

// Comprehensive mapping of QuickBooks entities to node-quickbooks find methods
const ENTITY_TO_METHOD_MAP: Record<string, string> = {
  'Account': 'findAccounts',
  'Attachable': 'findAttachables',
  'Bill': 'findBills',
  'BillPayment': 'findBillPayments',
  'Budget': 'findBudgets',
  'Class': 'findClasses',
  'CompanyInfo': 'findCompanyInfos',
  'CompanyCurrency': 'findCompanyCurrencies',
  'CreditMemo': 'findCreditMemos',
  'Customer': 'findCustomers',
  'CustomerType': 'findCustomerTypes',
  'Department': 'findDepartments',
  'Deposit': 'findDeposits',
  'Employee': 'findEmployees',
  'Estimate': 'findEstimates',
  'Invoice': 'findInvoices',
  'Item': 'findItems',
  'JournalCode': 'findJournalCodes',
  'JournalEntry': 'findJournalEntrys',
  'Payment': 'findPayments',
  'PaymentMethod': 'findPaymentMethods',
  'Preferences': 'findPreferenceses',
  'Purchase': 'findPurchases',
  'PurchaseOrder': 'findPurchaseOrders',
  'RefundReceipt': 'findRefundReceipts',
  'SalesReceipt': 'findSalesReceipts',
  'TaxAgency': 'findTaxAgencys',
  'TaxCode': 'findTaxCodes',
  'TaxRate': 'findTaxRates',
  'Term': 'findTerms',
  'TimeActivity': 'findTimeActivitys',
  'Transfer': 'findTransfers',
  'Vendor': 'findVendors',
  'VendorCredit': 'findVendorCredits',
  'ExchangeRate': 'findExchangeRates'
};

// List of valid entities for validation
export const VALID_ENTITIES = Object.keys(ENTITY_TO_METHOD_MAP);

export interface QueryDataInput {
  entity: string;
  criteria?: QuickbooksSearchCriteriaInput;
}

/**
 * Query QuickBooks data entities with structured criteria.
 * Supports 35 entity types including Customer, Invoice, Vendor, Bill, etc.
 */
export async function queryQuickbooksData(input: QueryDataInput): Promise<ToolResponse<any[]>> {
  const { entity, criteria = {} } = input;

  // Validate entity
  if (!VALID_ENTITIES.includes(entity)) {
    return {
      result: null,
      isError: true,
      error: `Invalid entity: "${entity}". Supported entities: ${VALID_ENTITIES.join(', ')}`
    };
  }

  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();
    const normalizedCriteria = buildQuickbooksSearchCriteria(criteria);

    // Get the appropriate find method
    const methodName = ENTITY_TO_METHOD_MAP[entity];

    return new Promise((resolve) => {
      (quickbooks as any)[methodName](normalizedCriteria, (err: any, response: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          // Extract results from QueryResponse[EntityName]
          // Handle both singular and plural entity names in response
          const entityData = response.QueryResponse[entity]
                          || response.QueryResponse[entity + 's']
                          || response.QueryResponse[entity + 'es']
                          || [];

          resolve({
            result: entityData,
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
