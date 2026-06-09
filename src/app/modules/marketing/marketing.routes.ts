import { Router } from "express";

import {
  marketingFaqHandler,
  marketingFeaturesHandler,
  marketingHomeHandler,
  marketingPricingHandler,
} from "./marketing.controller";

const marketingRouter = Router();

marketingRouter.get("/home", marketingHomeHandler);
marketingRouter.get("/features", marketingFeaturesHandler);
marketingRouter.get("/pricing", marketingPricingHandler);
marketingRouter.get("/faq", marketingFaqHandler);

export { marketingRouter };
