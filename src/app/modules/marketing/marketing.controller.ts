import type { RequestHandler } from "express";

import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  getMarketingFaqData,
  getMarketingFeaturesData,
  getMarketingHomeData,
  getMarketingPricingData,
} from "./marketing.service";

export const marketingHomeHandler: RequestHandler = catchAsync(async (_req, res) => {
  const data = await getMarketingHomeData();
  sendSuccess(res, data);
});

export const marketingFeaturesHandler: RequestHandler = catchAsync(async (_req, res) => {
  const data = await getMarketingFeaturesData();
  sendSuccess(res, data);
});

export const marketingPricingHandler: RequestHandler = catchAsync(async (_req, res) => {
  const data = await getMarketingPricingData();
  sendSuccess(res, data);
});

export const marketingFaqHandler: RequestHandler = catchAsync(async (_req, res) => {
  const data = await getMarketingFaqData();
  sendSuccess(res, data);
});
