import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { executeQuickbooksQuery, PaginatedQueryResult } from "../helpers/quickbooks-paginated-query.js";

/**
 * Search bills from QuickBooks Online with pagination support.
 *
 * Accepts either:
 *   • A plain criteria object (key/value pairs) – passed directly to findBills
 *   • An **array** of objects in the `{ field, value, operator? }` shape – this
 *     allows use of operators such as `IN`, `LIKE`, `>`, `<`, `>=`, `<=` etc.
 *
 * Pagination / sorting options such as `limit`, `offset`, `asc`, `desc`,
 * `fetchAll`, `count` can be supplied via the top‑level criteria object or as
 * dedicated entries in the array form.
 *
 * @param options.includeCount - Whether to fetch total count for pagination metadata (default: true)
 */
export async function searchQuickbooksBills(
  criteria: object | Array<Record<string, any>> = {},
  options: { includeCount?: boolean } = {}
): Promise<ToolResponse<PaginatedQueryResult<any>>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();

    const executeQuery = (crit: any): Promise<any> => {
      return new Promise((resolve, reject) => {
        (quickbooks as any).findBills(crit, (err: any, response: any) => {
          if (err) reject(err);
          else resolve(response);
        });
      });
    };

    return await executeQuickbooksQuery(
      executeQuery,
      criteria,
      {
        includeCount: options.includeCount ?? true, // Default to true for better UX
        entityKey: 'Bill',
      }
    );
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
} 