/**
 * Formats an error into a standardized error message with enhanced logging
 * Extracts QuickBooks-specific error details including intuit_tid for troubleshooting
 * @param error Any error object to format
 * @returns A formatted error message as a string
 */
export function formatError(error: unknown): string {
  // Extract intuit_tid and other metadata for logging
  let intuitTid: string | undefined;
  let errorDetails: any = {};

  // QuickBooks API errors from node-quickbooks library
  if (error && typeof error === 'object') {
    const err = error as any;

    // Try to extract intuit_tid from various locations
    intuitTid = err.intuit_tid || err.headers?.['intuit-tid'] || err.response?.headers?.['intuit-tid'];

    // Extract QuickBooks Fault object if present
    if (err.Fault || err.fault) {
      const fault = err.Fault || err.fault;
      errorDetails = {
        type: fault.type || 'QuickBooksError',
        code: fault.Error?.[0]?.code || fault.code,
        message: fault.Error?.[0]?.Message || fault.message || fault.Error?.[0]?.Detail,
        detail: fault.Error?.[0]?.Detail || fault.detail,
      };
    } else if (err.error) {
      // Alternative error structure
      errorDetails = {
        code: err.error.code || err.code,
        message: err.error.message || err.message,
      };
    } else if (err.message) {
      errorDetails.message = err.message;
    }

    // Log structured error to CloudWatch
    console.error('QuickBooks API Error:', {
      intuit_tid: intuitTid,
      ...errorDetails,
      timestamp: new Date().toISOString(),
    });
  }

  // Build user-friendly error message
  let message = '';

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (errorDetails.message) {
    message = errorDetails.message;
  } else {
    message = 'An unexpected error occurred';
  }

  // Append error code if available
  if (errorDetails.code) {
    message += ` (Error code: ${errorDetails.code})`;
  }

  // Append intuit_tid for Intuit support
  if (intuitTid) {
    message += ` [intuit_tid: ${intuitTid}]`;
  }

  return `Error: ${message}`;
}
