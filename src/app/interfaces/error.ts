/** JSON shape for successful API responses using {@link sendResponse} helpers */
export type ISuccessResponse<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type IErrorResponse = {
  success: false;
  message: string;
  code?: string;
  details?: unknown;
  timestamp?: string;
  requestId?: string;
  errorRef?: string;
};
