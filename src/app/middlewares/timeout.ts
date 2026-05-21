import type { RequestHandler } from "express";

import { config } from "../config";

export function requestTimeout(
  ms: number = config.requestTimeoutMs,
): RequestHandler {
  return (req, res, next) => {
    const t = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          message: "Request timeout",
          code: "REQUEST_TIMEOUT",
          timestamp: new Date().toISOString(),
          ...(req.requestId && { requestId: req.requestId }),
        });
      }
    }, ms);

    res.on("finish", () => clearTimeout(t));
    res.on("close", () => clearTimeout(t));
    next();
  };
}
