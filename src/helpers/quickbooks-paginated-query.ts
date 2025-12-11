import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "./format-error.js";

export interface PaginatedQueryResult<T> {
  entities: T[];
  totalCount?: number;
  maxResults?: number;
  startPosition?: number;
}

/**
 * Execute a QuickBooks query with optional count query for pagination metadata.
 *
 * @param executeQuery - Function that executes the QuickBooks query
 * @param criteria - Query criteria
 * @param options - Configuration options
 * @returns ToolResponse with paginated results and count
 */
export async function executeQuickbooksQuery<T>(
  executeQuery: (criteria: any) => Promise<any>,
  criteria: any,
  options: {
    includeCount?: boolean;  // Whether to fetch total count
    entityKey: string;        // "Bill", "Invoice", etc.
  }
): Promise<ToolResponse<PaginatedQueryResult<T>>> {
  try {
    const { includeCount = false, entityKey } = options;

    // Check if this is a count-only query
    const isCountOnly = isCountOnlyQuery(criteria);

    if (isCountOnly) {
      // Count-only query - include filters but remove pagination params
      const countCriteria = extractCountCriteria(criteria);
      console.log('[COUNT QUERY] Original criteria:', JSON.stringify(criteria));
      console.log('[COUNT QUERY] Count criteria with filters:', JSON.stringify(countCriteria));
      const response = await executeQuery(countCriteria);
      const totalCount = response?.QueryResponse?.totalCount ?? 0;

      return {
        result: {
          entities: [],
          totalCount,
        },
        isError: false,
        error: null,
      };
    }

    // Regular query with optional count
    let totalCount: number | undefined;

    if (includeCount) {
      // Background count query - include filters but remove pagination params
      const countCriteria = extractCountCriteria(criteria);
      console.log('[BACKGROUND COUNT] Running count query with criteria:', JSON.stringify(countCriteria));
      try {
        const countResponse = await executeQuery(countCriteria);
        totalCount = countResponse?.QueryResponse?.totalCount;
        console.log('[BACKGROUND COUNT] Got total:', totalCount);
      } catch (countError) {
        // If count query fails, continue without total count
        console.warn('[BACKGROUND COUNT] Count query failed:', formatError(countError));
      }
    }

    // Execute main query
    const response = await executeQuery(criteria);
    const entities = response?.QueryResponse?.[entityKey] ?? [];
    const maxResults = response?.QueryResponse?.maxResults;
    const startPosition = response?.QueryResponse?.startPosition;

    return {
      result: {
        entities,
        totalCount,
        maxResults,
        startPosition,
      },
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}

/**
 * Check if criteria is a count-only query
 */
function isCountOnlyQuery(criteria: any): boolean {
  // Object form
  if (typeof criteria === 'object' && !Array.isArray(criteria)) {
    return criteria?.count === true;
  }

  // Array form
  if (Array.isArray(criteria)) {
    return criteria.some((c: any) =>
      (c.field === 'count' && c.value === true) ||
      (c.key === 'count' && c.value === true)
    );
  }

  return false;
}

/**
 * Extract criteria for count query (remove pagination params, add count: true)
 *
 * IMPORTANT: Always returns OBJECT form because node-quickbooks only recognizes
 * count as a direct object property, not in array form.
 */
function extractCountCriteria(criteria: any): any {
  // Array form - CONVERT TO OBJECT
  if (Array.isArray(criteria)) {
    // Extract filters (excluding pagination params and count itself)
    const filters: Record<string, any> = {};
    criteria.forEach((c: any) => {
      const key = c.field || c.key;
      const val = c.value;
      if (key &&
          key !== 'limit' &&
          key !== 'offset' &&
          key !== 'asc' &&
          key !== 'desc' &&
          key !== 'fetchAll' &&
          key !== 'count') {  // Also exclude count itself
        filters[key] = val;
      }
    });
    return { ...filters, count: true };  // ✅ Always return object form
  }

  // Object form - already correct
  if (typeof criteria === 'object') {
    const { limit, offset, asc, desc, fetchAll, count, ...filters } = criteria;
    return { ...filters, count: true };
  }

  // Default
  return { count: true };
}
