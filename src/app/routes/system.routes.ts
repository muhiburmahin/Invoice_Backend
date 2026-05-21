import { Router } from "express";

import { getReadiness } from "../lib/healthcheck";
import { sendSuccess } from "../shared/sendResponse";

/** Liveness / readiness — mount at `/health` (no auth, no rate limit beyond global) */
export const systemRouter = Router();

systemRouter.get("/", (_req, res) => {
  sendSuccess(res, {
    service: "invoice-api",
    status: "ok",
  });
});

systemRouter.get("/live", (_req, res) => {
  sendSuccess(res, {
    status: "live",
  });
});

systemRouter.get("/ready", async (_req, res) => {
  const { ready, checks } = await getReadiness();
  if (!ready) {
    res.status(503).json({
      success: false,
      message: "Service unavailable",
      code: "NOT_READY",
      checks,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  sendSuccess(res, {
    status: "ready",
    checks,
  });
});
