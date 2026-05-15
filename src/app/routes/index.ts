import { Router } from "express";

import { requireAuth } from "../middlewares";
import { catchAsync } from "../shared/catchAsync";
import { sendSuccess } from "../shared/sendResponse";

const apiRouter = Router();

apiRouter.get(
  "/me",
  requireAuth,
  catchAsync(async (req, res) => {
    sendSuccess(res, { user: req.auth!.user });
  }),
);

export { apiRouter };
