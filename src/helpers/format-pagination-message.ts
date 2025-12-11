export interface PaginationContext {
  entityName: string;          // "bills", "invoices", etc.
  entityCount: number;          // Number in current response
  limit: number;                // Requested limit
  offset: number;               // Current offset
  totalCount?: number;          // Total (if known from count query)
  criteriaDescription?: string; // "for vendor X"
}

/**
 * Generate human-readable pagination message for AI assistants.
 *
 * Examples:
 * - Count-only: "Found 265 bills"
 * - Paginated: "Showing bills 1-10 of 265. To see more, ask for offset 10"
 * - Last page: "Showing bills 41-50 of 50 (final page)"
 * - Single page: "Found 5 bills"
 */
export function formatPaginationMessage(context: PaginationContext): string {
  const {
    entityName,
    entityCount,
    limit,
    offset,
    totalCount,
    criteriaDescription = ""
  } = context;

  const desc = criteriaDescription ? ` ${criteriaDescription}` : "";

  // Count-only (totalCount provided, no entities)
  if (entityCount === 0 && totalCount !== undefined) {
    return `Found ${totalCount} ${entityName}${desc}`;
  }

  // No results
  if (entityCount === 0) {
    return `No ${entityName} found${desc}`;
  }

  // Single page (all results fit in one page)
  if (totalCount !== undefined && entityCount === totalCount) {
    return `Found ${entityCount} ${entityName}${desc}`;
  }

  // Paginated with known total
  if (totalCount !== undefined) {
    const start = offset + 1;
    const end = offset + entityCount;
    const isLastPage = end >= totalCount;

    if (isLastPage) {
      return `Showing ${entityName} ${start}-${end} of ${totalCount}${desc} (final page)`;
    } else {
      const nextOffset = offset + limit;
      return `Showing ${entityName} ${start}-${end} of ${totalCount}${desc}. To see more, ask for offset ${nextOffset}`;
    }
  }

  // Paginated with unknown total (estimate based on limit)
  const start = offset + 1;
  const end = offset + entityCount;

  // If we got exactly the limit, there might be more
  if (entityCount === limit) {
    const nextOffset = offset + limit;
    return `Showing ${entityName} ${start}-${end} (more may be available)${desc}. To see more, ask for offset ${nextOffset}`;
  }

  // Last page (no total count, but we know there's no more)
  return `Showing ${entityName} ${start}-${end}${desc}`;
}

/**
 * Extract criteria description for human-readable context.
 * Example: { VendorRef: "123" } -> "for vendor 123"
 */
export function extractCriteriaDescription(
  criteria: any,
  entityType: string
): string {
  if (!criteria || typeof criteria !== 'object') return "";

  // Object form
  if (!Array.isArray(criteria)) {
    if (criteria.VendorRef) return `for vendor ${criteria.VendorRef}`;
    if (criteria.CustomerRef) return `for customer ${criteria.CustomerRef}`;
    if (criteria.DisplayName) return `matching "${criteria.DisplayName}"`;
    return "";
  }

  // Array form
  const filter = criteria.find((c: any) =>
    c.field === 'VendorRef' ||
    c.field === 'CustomerRef' ||
    c.field === 'DisplayName'
  );

  if (filter) {
    const fieldName = filter.field.replace('Ref', '').toLowerCase();
    return `for ${fieldName} ${filter.value}`;
  }

  return "";
}
