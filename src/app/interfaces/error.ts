/** JSON shape for successful API responses using {@link sendResponse} helpers */
export type ISuccessResponse<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

/** JSON shape for failed API responses */
export type IErrorResponse = {
  success: false;
  message: string;
  code?: string;
  details?: unknown;
  /** ISO 8601 — always set by {@link sendError} */
  timestamp?: string;
  /** Client / proxy request id when available */
  requestId?: string;
  /** Short id to correlate with server logs (especially 5xx) */
  errorRef?: string;
};
