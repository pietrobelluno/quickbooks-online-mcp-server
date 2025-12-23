export interface QuickbooksFilter {
  /** Field/column name to filter on */
  field: string;
  /** Value to match against */
  value: any;
  /** Comparison operator to use (default '=') */
  operator?: string;
}

export interface AdvancedQuickbooksSearchOptions {
  /** Array of filter objects that map to QuickBooks query filters */
  filters?: QuickbooksFilter[];
  /** Sort ascending by the provided field */
  asc?: string;
  /** Sort descending by the provided field */
  desc?: string;
  /** Maximum number of rows to return (max 1000, default 100) */
  limit?: number;
  /** Number of rows to skip from the start of the result set (0-based) */
  offset?: number;
  /** If true, only a count of rows is returned */
  count?: boolean;
  /** If true, transparently fetches all records. */
  fetchAll?: boolean;
}

/**
 * User-supplied criteria can be one of:
 *  1. A simple criteria object (e.g. { Name: 'Foo' })
 *  2. An array of objects specifying field/value/operator
 *  3. An {@link AdvancedQuickbooksSearchOptions} object that is translated to the array format expected by node-quickbooks
 */
export type QuickbooksSearchCriteriaInput =
  | Record<string, any>
  | Array<Record<string, any>>
  | AdvancedQuickbooksSearchOptions;

/**
 * Convert various input shapes into the criteria shape that `node-quickbooks` expects.
 *
 * If the input is already an object or array that `node-quickbooks` understands, it is returned untouched.
 * If the input is an {@link AdvancedQuickbooksSearchOptions} instance, it is converted to an array of
 * `{field, value, operator}` objects.
 */
export function buildQuickbooksSearchCriteria(
  input: QuickbooksSearchCriteriaInput
): Record<string, any> | Array<Record<string, any>> {
  // If the user supplied an array we assume they know what they're doing.
  if (Array.isArray(input)) {
    return input as Array<Record<string, any>>;
  }

  // If the input is a plain object with ONLY simple options (asc, desc, limit, offset),
  // pass it through as-is. node-quickbooks handles these better in object format.
  //
  // Only transform to array format if we have "filters" (complex queries) or special
  // flags like "count" or "fetchAll" that require transformation.
  const advancedOnlyKeys: (keyof AdvancedQuickbooksSearchOptions)[] = [
    "filters",
    "count",
    "fetchAll",
  ];

  const inputKeys = Object.keys(input || {});
  const hasAdvancedKeys = inputKeys.some((k) =>
    advancedOnlyKeys.includes(k as keyof AdvancedQuickbooksSearchOptions)
  );

  if (!hasAdvancedKeys) {
    // Simple criteria with just asc/desc/limit/offset – pass through as plain object
    // This avoids over-transformation and lets node-quickbooks handle it naturally
    return input as Record<string, any>;
  }

  // At this point we treat the input as AdvancedQuickbooksSearchOptions
  const options = input as AdvancedQuickbooksSearchOptions;
  const criteriaArr: Array<Record<string, any>> = [];

  // Convert filters
  options.filters?.forEach((f) => {
    let processedValue = f.value;

    // Let node-quickbooks handle IN operator array conversion
    // The library already converts arrays to proper SQL format (adds parentheses and quotes)
    // If we pre-process here, we get double-wrapping: IN (('1','2','3')) instead of IN ('1','2','3')
    if (f.operator?.toUpperCase() === 'IN' && Array.isArray(f.value)) {
      // Pass array as-is - node-quickbooks will handle conversion
      processedValue = f.value;
    }

    criteriaArr.push({ field: f.field, value: processedValue, operator: f.operator });
  });

  // Sorting
  if (options.asc) {
    criteriaArr.push({ field: "asc", value: options.asc });
  }
  if (options.desc) {
    criteriaArr.push({ field: "desc", value: options.desc });
  }

  // Pagination / meta - Add as ARRAY ITEMS (node-quickbooks expects this format)
  // node-quickbooks looks for {field: 'limit', value: X} in the array, NOT object properties
  if (typeof options.limit === "number") {
    criteriaArr.push({ field: 'limit', value: options.limit });
  }

  if (typeof options.offset === "number") {
    criteriaArr.push({ field: 'offset', value: options.offset });
  }

  if (options.count) {
    criteriaArr.push({ field: 'count', value: true });
  }
  if (options.fetchAll) {
    criteriaArr.push({ field: 'fetchAll', value: true });
  }

  // Return array or empty object
  if (criteriaArr.length > 0) {
    return criteriaArr;
  }

  // Empty criteria - return empty object so Quickbooks returns all items
  return {};
} 