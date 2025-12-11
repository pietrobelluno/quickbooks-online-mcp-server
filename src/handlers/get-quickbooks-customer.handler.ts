import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Retrieve a single customer by Id from QuickBooks Online
 */
export async function getQuickbooksCustomer(id: string): Promise<ToolResponse<any>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();

    return new Promise((resolve) => {
      // Use findCustomers with ID filter instead of getCustomer
      // getCustomer doesn't exist in node-quickbooks for Customer entity
      (quickbooks as any).findCustomers({ Id: id }, (err: any, customers: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          const customer = customers?.QueryResponse?.Customer?.[0];
          if (!customer) {
            resolve({
              result: null,
              isError: true,
              error: `Customer with ID ${id} not found`,
            });
          } else {
            resolve({
              result: customer,
              isError: false,
              error: null,
            });
          }
        }
      });
    });
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
} 