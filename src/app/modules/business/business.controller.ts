import type { RequestHandler } from "express";

import { ApiError } from "../../errors/ApiError";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  getBrandingPreview,
  getMyBusiness,
  listSupportedCurrencies,
  updateMyBusiness,
} from "./business.service";

/** Resolve the authenticated user's id or throw a clean 401. */
function getUserId(req: Parameters<RequestHandler>[0]): string {
  const id = req.auth?.user?.id;
  if (!id) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }
  return id;
}

export const getBusinessHandler: RequestHandler = catchAsync(async (req, res) => {
  const business = await getMyBusiness(getUserId(req));
  sendSuccess(res, { business });
});

export const updateBusinessHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const business = await updateMyBusiness(req, getUserId(req), req.body);
    sendSuccess(res, {
      business,
      message: "Business profile updated successfully",
    });
  },
);

export const branding: RequestHandler = catchAsync(async (req, res) => {
  const preview = await getBrandingPreview(getUserId(req));
  sendSuccess(res, { branding: preview });
});

export const currenciesHandler: RequestHandler = (_req, res) => {
  sendSuccess(res, { currencies: listSupportedCurrencies() });
};
